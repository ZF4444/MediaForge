import asyncio
import json
from contextlib import nullcontext
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import main
from app.ai.database_repository import DatabaseAIRepository


def test_update_only_writes_selected_resource(monkeypatch):
    calls = []

    class Cursor:
        def execute(self, sql, args=None):
            calls.append((sql, args))

        def fetchone(self):
            return {"name": "Workflow", "enabled": True, "settings_json": {"fields": [1], "media": "image"}}

    connection = SimpleNamespace(cursor=lambda: nullcontext(Cursor()), transaction=nullcontext)
    monkeypatch.setattr("app.ai.database_repository.database_connection_sync", lambda: nullcontext(connection))
    monkeypatch.setattr(main, "require_api_settings_access", lambda: None)
    assert asyncio.run(main.update_ai_executable_resource("selected", {"settings": {"media": "video"}})) == {"ok": True}
    assert len(calls) == 2
    sql, args = calls[1]
    assert sql.startswith("UPDATE ai_resources ")
    assert args[-1] == "selected"
    assert json.loads(args[2]) == {"fields": [1], "media": "video"}


def test_update_requires_permission(monkeypatch):
    def deny():
        raise HTTPException(status_code=403)

    monkeypatch.setattr(main, "require_api_settings_access", deny)
    monkeypatch.setattr(DatabaseAIRepository, "update_resource", lambda *a: pytest.fail("unexpected write"))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.update_ai_executable_resource("selected", {}))
    assert exc.value.status_code == 403


@pytest.mark.parametrize(
    "payload", [{"connection_id": "other"}, {"settings": []}, {"enabled": "false"}, {"name": None}]
)
def test_update_rejects_invalid_changes(monkeypatch, payload):
    monkeypatch.setattr(main, "require_api_settings_access", lambda: None)
    monkeypatch.setattr(DatabaseAIRepository, "update_resource", lambda *a: pytest.fail("unexpected write"))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.update_ai_executable_resource("selected", payload))
    assert exc.value.status_code == 400


def _fake_connection(monkeypatch, calls, *, protocol="runninghub", inserted=True, has_connection=True):
    # Mirrors _SyncCursorProxy: only execute/fetchone/fetchall exist (no rowcount).
    class Cursor:
        def execute(self, sql, args=None):
            calls.append((sql, args))
            self._insert = sql.startswith("INSERT")

        def fetchone(self):
            if self._insert:
                return {"id": "x"} if inserted else None
            return {"protocol": protocol} if has_connection else None

    connection = SimpleNamespace(cursor=lambda: nullcontext(Cursor()), transaction=nullcontext)
    monkeypatch.setattr("app.ai.database_repository.database_connection_sync", lambda: nullcontext(connection))
    monkeypatch.setattr(main, "require_api_settings_access", lambda: None)


_NEW_RESOURCE = {
    "id": "legacy:runninghub:runninghub_app:123456",
    "connection_id": "legacy:runninghub",
    "kind": "runninghub_app",
    "name": "New",
    "settings": {"app_id": "123456"},
}


def test_create_inserts_runninghub_resource(monkeypatch):
    calls = []
    _fake_connection(monkeypatch, calls)
    assert asyncio.run(main.create_ai_executable_resource(dict(_NEW_RESOURCE))) == {"ok": True}
    sql, args = calls[1]
    assert sql.startswith("INSERT INTO ai_resources")
    assert args[0] == _NEW_RESOURCE["id"]
    assert args[2] == "runninghub_app"


def test_create_conflict_returns_409(monkeypatch):
    _fake_connection(monkeypatch, [], inserted=False)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.create_ai_executable_resource(dict(_NEW_RESOURCE)))
    assert exc.value.status_code == 409


def test_create_unknown_connection_returns_404(monkeypatch):
    _fake_connection(monkeypatch, [], has_connection=False)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.create_ai_executable_resource(dict(_NEW_RESOURCE)))
    assert exc.value.status_code == 404


def test_create_rejects_non_runninghub_connection(monkeypatch):
    _fake_connection(monkeypatch, [], protocol="openai")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.create_ai_executable_resource(dict(_NEW_RESOURCE)))
    assert exc.value.status_code == 400


@pytest.mark.parametrize(
    "override",
    [
        {"kind": "comfyui_workflow"},
        {"id": ""},
        {"connection_id": None},
        {"settings": []},
        {"enabled": "x"},
        {"extra": 1},
    ],
)
def test_create_rejects_invalid_payload(monkeypatch, override):
    monkeypatch.setattr(main, "require_api_settings_access", lambda: None)
    monkeypatch.setattr(DatabaseAIRepository, "create_resource", lambda *a: pytest.fail("unexpected write"))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.create_ai_executable_resource({**_NEW_RESOURCE, **override}))
    assert exc.value.status_code == 400


def test_create_requires_permission(monkeypatch):
    def deny():
        raise HTTPException(status_code=403)

    monkeypatch.setattr(main, "require_api_settings_access", deny)
    monkeypatch.setattr(DatabaseAIRepository, "create_resource", lambda *a: pytest.fail("unexpected write"))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.create_ai_executable_resource(dict(_NEW_RESOURCE)))
    assert exc.value.status_code == 403
