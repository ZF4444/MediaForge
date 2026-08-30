"""Regression coverage for the legacy Provider -> AI domain projection."""
from __future__ import annotations

import pytest

from app.ai.repository import ProviderRepository, legacy_connection_id, legacy_model_id


@pytest.fixture
def repository():
    return ProviderRepository(lambda: [
        {
            "id": "openai-team-a", "name": "OpenAI Team A", "base_url": "https://a.example/v1",
            "protocol": "openai", "enabled": True, "primary": True,
            "chat_models": ["gpt-main"], "image_models": ["image-main"], "video_models": ["video-main"],
            "model_protocols": {"image-main": "gemini"}, "model_aliases": {"gpt-main": "GPT Main"},
        },
        {
            "id": "runninghub", "name": "RunningHub", "base_url": "https://rh.example",
            "protocol": "runninghub", "enabled": True,
            "rh_apps": [{"id": "portrait", "name": "Portrait", "enabled": True}],
        },
        {
            "id": "comfyui", "name": "ComfyUI", "base_url": "http://localhost:8188",
            "protocol": "comfyui", "enabled": True,
            "comfy_workflows": [{"id": "upscale", "name": "Upscale", "enabled": True}],
        },
        {
            "id": "disabled", "name": "Disabled", "protocol": "openai", "enabled": False,
            "chat_models": ["not-visible"],
        },
    ])


def test_repository_projects_connections_models_and_executable_resources(repository):
    connections = repository.connections()
    assert [item.id for item in connections] == [legacy_connection_id("openai-team-a"), legacy_connection_id("runninghub"), legacy_connection_id("comfyui")]

    models = repository.models()
    assert {(item.kind, item.upstream_model, item.protocol) for item in models} == {
        ("chat", "gpt-main", "openai"),
        ("image", "image-main", "gemini"),
        ("video", "video-main", "openai"),
    }
    chat = next(item for item in models if item.kind == "chat")
    assert chat.alias == "GPT Main"
    assert chat.capabilities == frozenset({"chat", "stream_chat", "tool_calling"})

    resources = repository.executable_resources()
    assert {(item.kind, item.name) for item in resources} == {
        ("runninghub_app", "Portrait"), ("comfyui_workflow", "Upscale"),
    }


def test_repository_resolves_new_and_legacy_identifiers(repository):
    expected_id = legacy_model_id("openai-team-a", "chat", "gpt-main")
    from_new_id = repository.resolve_model(model_id=expected_id)
    assert from_new_id.model and from_new_id.model.id == expected_id

    from_legacy_fields = repository.resolve_model(provider_id="openai-team-a", model="image-main", kind="image")
    assert from_legacy_fields.connection.id == legacy_connection_id("openai-team-a")
    assert from_legacy_fields.model and from_legacy_fields.model.protocol == "gemini"


def test_repository_rejects_unknown_or_disabled_models(repository):
    repository = ProviderRepository(lambda: [{
        "id": "disabled", "protocol": "openai", "enabled": False, "chat_models": ["hidden"],
    }])
    with pytest.raises(LookupError, match="no AI model resource"):
        repository.resolve_model(provider_id="disabled", model="hidden", kind="chat")


def test_chat_runtime_resolves_stable_model_id_without_legacy_provider_input(monkeypatch):
    from app.ai import runtime
    from app.ai.domain import Connection, ModelResource, ResolvedTarget

    monkeypatch.setattr(runtime, "_provider_loader", lambda: [{
        "id": "team-a", "connection_id": "conn-a", "enabled": True, "protocol": "openai", "base_url": "https://a.example",
        "chat_models": ["gpt-main"],
    }])
    target = ResolvedTarget(Connection("conn-a", "", "openai", "Team A", "https://a.example", True), ModelResource("model-a", "conn-a", "gpt-main", "chat", "openai"))
    monkeypatch.setattr("app.ai.database_repository.DatabaseAIRepository.resolve_model", lambda *_args, **_kwargs: target)
    calls = []
    monkeypatch.setattr(
        runtime, "_chat_resolver",
        lambda provider, model: (f"https://{provider}.example/v1", {"Authorization": "Bearer x"}, model),
    )
    monkeypatch.setattr(runtime, "_model_authorizer", lambda provider, model: calls.append((provider, model)))

    endpoint, _headers, model = runtime.resolve_chat_model(
        model_id="model-a",
    )

    assert endpoint == "https://team-a.example/v1"
    assert model == "gpt-main"
    assert calls == [("team-a", "gpt-main")]


def test_ai_resources_endpoint_exposes_ids_without_connection_settings(monkeypatch):
    import asyncio
    import main
    from app.ai.domain import Connection, ModelResource

    class Repository:
        def connections(self): return [Connection("conn-a", "", "openai", "Team A", "https://a.example/v1", True)]
        def models(self): return [ModelResource("model-a", "conn-a", "gpt-main", "chat", "openai")]
        def executable_resources(self): return []
    monkeypatch.setattr("app.ai.database_repository.DatabaseAIRepository", Repository)

    payload = asyncio.run(main.ai_resources())

    assert payload["connections"] == [{
        "id": "conn-a", "legacy_provider_id": "", "protocol": "openai",
        "name": "Team A", "base_url": "https://a.example/v1", "primary": False,
    }]
    assert payload["models"][0]["id"] == "model-a"
    assert "api_key" not in payload["connections"][0]


def test_repository_preserves_model_protocol_override(repository):
    image = next(item for item in repository.models() if item.kind == "image")
    assert image.protocol == "gemini"


def test_legacy_projection_assigns_executable_resources_to_matching_connections(monkeypatch):
    from app.services import business_metadata

    calls = []
    class Cursor:
        def execute(self, query, params=None): calls.append((" ".join(str(query).split()), params))
        def fetchone(self): return None
        def __enter__(self): return self
        def __exit__(self, *_args): return False
    class Connection:
        def cursor(self): return Cursor()
        def __enter__(self): return self
        def __exit__(self, *_args): return False
    monkeypatch.setattr(business_metadata, "metadata_connection", lambda: Connection())
    business_metadata.sync_ai_legacy_projection([
        {"id": "runninghub", "protocol": "runninghub", "rh_apps": [{"id": "app-1"}]},
        {"id": "comfyui", "protocol": "comfyui"},
        {"id": "openai-main", "protocol": "openai"},
    ], [{"name": "workflow.json", "config": {}}])

    inserts = [(query, params) for query, params in calls if "INSERT INTO ai_resources" in query]
    assert [(row[1], "runninghub_app" if "runninghub_app" in query else "comfyui_workflow") for query, row in inserts] == [
        ("legacy:runninghub", "runninghub_app"),
        ("legacy:comfyui", "comfyui_workflow"),
    ]


def test_database_runtime_view_is_built_from_connection_model_and_resource_rows(monkeypatch):
    from app.ai.database_repository import DatabaseAIRepository
    from app.ai.domain import Connection, ExecutableResource, ModelResource

    repo = DatabaseAIRepository()
    monkeypatch.setattr(repo, "connections", lambda include_disabled=False: [Connection("conn-1", "", "openai", "Main", "https://example.test", True, settings={"runtime_id": "main"})])
    monkeypatch.setattr(repo, "models", lambda include_disabled=False: [ModelResource("m1", "conn-1", "chat-a", "chat", "gemini", alias="Chat A")])
    monkeypatch.setattr(repo, "executable_resources", lambda include_disabled=False: [ExecutableResource("r1", "conn-1", "runninghub_app", "App", settings={"webappId": "app-1"})])

    assert repo.runtime_configurations() == [{
        "runtime_id": "main", "id": "main", "connection_id": "conn-1", "name": "Main", "protocol": "openai", "base_url": "https://example.test", "enabled": True, "primary": False,
        "chat_models": ["chat-a"], "image_models": [], "video_models": [], "model_aliases": {"chat-a": "Chat A"}, "model_protocols": {"chat-a": "gemini"}, "rh_apps": [{"webappId": "app-1", "id": "App", "name": "App", "enabled": True}], "comfy_workflows": [],
    }]
