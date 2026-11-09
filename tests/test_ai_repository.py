"""Regression coverage for AI connection resources."""

from __future__ import annotations

from app.ai.database_repository import DatabaseAIRepository


def test_ai_resources_endpoint_exposes_ids_without_connection_settings(monkeypatch):
    import asyncio

    import main
    from app.ai.domain import Connection, ModelResource

    class Repository:
        def connections(self):
            return [Connection("conn-a", "openai", "Team A", "https://a.example/v1", True)]

        def models(self):
            return [ModelResource("model-a", "conn-a", "gpt-main", "chat", "openai")]

        def executable_resources(self, *, include_disabled=False):
            return []

    monkeypatch.setattr("app.ai.database_repository.DatabaseAIRepository", Repository)

    payload = asyncio.run(main.ai_resources())

    assert payload["connections"] == [
        {
            "id": "conn-a",
            "protocol": "openai",
            "name": "Team A",
            "base_url": "https://a.example/v1",
            "primary": False,
        }
    ]
    assert payload["models"][0]["id"] == "model-a"
    assert "api_key" not in payload["connections"][0]


def _runninghub_repository(monkeypatch, *, resource_enabled: bool):
    from app.ai.domain import Connection, ExecutableResource

    connection = Connection("conn-rh", "runninghub", "RH", "https://rh.example", True)
    resource = ExecutableResource("res-rh", "conn-rh", "runninghub_app", "App", resource_enabled, {"app_id": "app-1"})

    def executable_resources(self, *, include_disabled=False):
        return [resource] if include_disabled or resource.enabled else []

    monkeypatch.setattr(DatabaseAIRepository, "executable_resources", executable_resources)
    monkeypatch.setattr(DatabaseAIRepository, "connections", lambda self, **_kwargs: [connection])
    return DatabaseAIRepository()


def test_resolve_executable_requires_enabled_resource_by_default(monkeypatch):
    import pytest

    repo = _runninghub_repository(monkeypatch, resource_enabled=False)

    with pytest.raises(LookupError):
        repo.resolve_executable(resource_id="res-rh", kind="runninghub_app")


def test_resolve_executable_can_skip_resource_enabled_check(monkeypatch):
    """The resource switch only gates the canvas; other pages resolve disabled resources."""
    repo = _runninghub_repository(monkeypatch, resource_enabled=False)

    target = repo.resolve_executable(resource_id="res-rh", kind="runninghub_app", require_enabled=False)

    assert target.resource.id == "res-rh"
    assert target.resource.enabled is False


def test_ai_resources_endpoint_returns_disabled_resources_with_enabled_flag(monkeypatch):
    import asyncio

    import main
    from app.ai.domain import ExecutableResource

    resources = [
        ExecutableResource("res-on", "conn-a", "runninghub_app", "On", True, {"app_id": "a"}),
        ExecutableResource("res-off", "conn-a", "runninghub_app", "Off", False, {"app_id": "b"}),
    ]

    class Repository:
        def connections(self):
            return []

        def models(self):
            return []

        def executable_resources(self, *, include_disabled=False):
            return resources if include_disabled else [item for item in resources if item.enabled]

    monkeypatch.setattr("app.ai.database_repository.DatabaseAIRepository", Repository)

    payload = asyncio.run(main.ai_resources())

    assert {item["id"]: item["enabled"] for item in payload["resources"]} == {"res-on": True, "res-off": False}


def test_non_canvas_runninghub_endpoints_resolve_disabled_resources(monkeypatch):
    """submit / query / upload-asset-file must not depend on the canvas-only resource switch."""
    import asyncio

    import main

    seen: list[dict] = []

    def resolve_executable(self, **kwargs):
        seen.append(kwargs)
        raise LookupError("stop here")

    monkeypatch.setattr(DatabaseAIRepository, "resolve_executable", resolve_executable)
    monkeypatch.setattr(main, "current_user_id", lambda: "user-1")

    from fastapi import HTTPException

    calls = [
        lambda: main.runninghub_submit(main.RunningHubSubmitRequest(webappId="app-1", resource_id="res-rh")),
        lambda: main.runninghub_query(taskId="t1", resource_id="res-rh"),
        lambda: main.runninghub_upload_asset(
            main.RunningHubUploadAssetRequest(url="http://x/y.png", resource_id="res-rh")
        ),
        lambda: main.runninghub_upload_asset_file(file=object(), connection_id="", resource_id="res-rh"),
    ]
    for call in calls:
        try:
            asyncio.run(call())
        except HTTPException as exc:
            assert exc.status_code == 404

    assert len(seen) == 4
    assert all(item["require_enabled"] is False for item in seen)


def test_canvas_runninghub_task_still_requires_enabled_resource(monkeypatch):
    import asyncio

    from fastapi import HTTPException

    import main

    seen: list[dict] = []

    def resolve_executable(self, **kwargs):
        seen.append(kwargs)
        raise LookupError("disabled")

    monkeypatch.setattr(DatabaseAIRepository, "resolve_executable", resolve_executable)

    try:
        asyncio.run(
            main.create_canvas_runninghub_task(main.RunningHubSubmitRequest(webappId="app-1", resource_id="res-rh"))
        )
    except HTTPException as exc:
        assert exc.status_code == 404

    assert len(seen) == 1
    assert seen[0].get("require_enabled", True) is True
