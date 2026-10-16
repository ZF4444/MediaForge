"""Database-backed ComfyUI configuration and explicit execution routing."""
from contextlib import nullcontext
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.ai.domain import Connection
from app.services import comfyui_connections as service


def test_endpoints_ignore_environment_and_refresh_database(monkeypatch):
    monkeypatch.setenv("COMFYUI_INSTANCES", "old-host:8188")
    rows = [
        Connection("openai", "openai", "Other", "https://other.example", True),
        Connection("a", "comfyui", "A", "a:8188", True),
        Connection("disabled", "comfyui", "Disabled", "disabled:8188", False),
    ]
    monkeypatch.setattr(service, "DatabaseAIRepository", lambda: SimpleNamespace(connections=lambda: list(rows)))
    assert service.comfyui_endpoints() == ["http://a:8188"]
    rows[1] = Connection("a", "comfyui", "A", "b:8188", True)
    assert service.comfyui_endpoints() == ["http://b:8188"]
    rows.clear()
    assert service.comfyui_endpoints() == []


def test_legacy_save_preserves_ids_and_disables_removed_connections(monkeypatch):
    calls = []

    class Cursor:
        def execute(self, sql, args=None):
            calls.append((sql, args))

        def fetchall(self):
            return [{"id": "keep", "base_url": "a:8188"}, {"id": "remove", "base_url": "b:8188"}]

    cursor = Cursor()
    connection = SimpleNamespace(cursor=lambda: nullcontext(cursor), transaction=nullcontext)
    monkeypatch.setattr(service, "database_connection_sync", lambda: nullcontext(connection))
    result = service.save_comfyui_endpoints(["http://a:8188/", "a:8188", "c:8188"])
    assert result == ["http://a:8188", "http://c:8188"]
    updates = [args for sql, args in calls if sql.startswith("UPDATE")]
    assert [(args[0], args[3]) for args in updates] == [(True, "keep"), (False, "remove")]
    assert len([sql for sql, _ in calls if "INSERT" in sql]) == 1
    assert all("DELETE" not in sql and "ai_resources" not in sql for sql, _ in calls)


def test_empty_and_invalid_save_do_not_access_database(monkeypatch):
    monkeypatch.setattr(service, "database_connection_sync", lambda: pytest.fail("unexpected database access"))
    for values in ([], [""], ["ftp://bad.example"]):
        with pytest.raises(ValueError):
            service.save_comfyui_endpoints(values)


def test_generate_uses_selected_connection_not_global_pool(monkeypatch):
    import main
    from app.ai.adapters.comfyui_transport import ComfyUITransport

    selected = Connection("chosen", "comfyui", "Chosen", "selected:8188", True)
    monkeypatch.setattr(main, "DatabaseAIRepository", lambda: SimpleNamespace(connections=lambda: [selected]))
    monkeypatch.setattr(main, "require_target_access", lambda *args: None)
    monkeypatch.setattr(main, "comfyui_endpoints", lambda: ["http://wrong:8188"])
    monkeypatch.setattr(main, "get_comfy_workflow", lambda name: {"workflow": {}})
    seen = []

    async def submit(self, backend, workflow, client_id):
        seen.append(backend)
        raise RuntimeError("stop after routing")

    monkeypatch.setattr(ComfyUITransport, "submit", submit)
    result = main.generate(main.GenerateRequest(connection_id="chosen", workflow_json="test.json"))
    assert seen == ["http://selected:8188"]
    assert result["error"] == "stop after routing"
    assert main.BACKEND_LOCAL_LOAD["http://selected:8188"] == 0


def test_generate_rejects_missing_connection(monkeypatch):
    import main

    monkeypatch.setattr(main, "DatabaseAIRepository", lambda: SimpleNamespace(connections=lambda: []))
    with pytest.raises(HTTPException) as exc:
        main.generate(main.GenerateRequest(connection_id="missing", workflow_json="test.json"))
    assert exc.value.status_code == 404


def test_instance_save_requires_configuration_permission(monkeypatch):
    import main

    def deny():
        raise HTTPException(status_code=403, detail="denied")

    monkeypatch.setattr(main, "require_api_settings_access", deny)
    monkeypatch.setattr(main, "save_comfyui_endpoints", lambda values: pytest.fail("unauthorized write"))
    with pytest.raises(HTTPException) as exc:
        main.save_comfyui_instances(main.ComfyInstancesPayload(instances=["a:8188"]))
    assert exc.value.status_code == 403


def test_configuration_rejects_invalid_comfyui_url_before_writing(monkeypatch):
    from app.ai.database_repository import DatabaseAIRepository

    monkeypatch.setattr("app.ai.database_repository.database_connection_sync", lambda: pytest.fail("unexpected write"))
    with pytest.raises(ValueError):
        DatabaseAIRepository().replace(
            connections=[{"id": "bad", "protocol": "comfyui", "base_url": "ftp://bad.example"}],
            models=[], resources=[],
        )
