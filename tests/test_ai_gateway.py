"""Unit tests for protocol-neutral AI adapter dispatch and provider governance."""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.ai import gateway
from app.ai.contracts import Actor
from app.ai.images import LegacyImageGateway
from app.ai.registry import ImageAdapterRegistry, ImageGenerationRequest
from app.core.metrics import AI_PROVIDER_REQUESTS


@pytest.fixture(autouse=True)
def disable_distributed_governance(monkeypatch):
    monkeypatch.setenv("AI_DISTRIBUTED_GOVERNANCE_ENABLED", "false")


def _request() -> ImageGenerationRequest:
    return ImageGenerationRequest(
        prompt="draw a cube",
        size="1024x1024",
        quality="high",
        model="demo-image",
        reference_images=[],
        provider={"id": "demo"},
    )


def test_image_adapter_registry_dispatches_registered_handler():
    registry = ImageAdapterRegistry()

    async def handler(request):
        return {"model": request.model}

    registry.register("demo", handler)
    assert asyncio.run(registry.dispatch("demo", _request())) == {"model": "demo-image"}

    with pytest.raises(ValueError, match="already registered"):
        registry.register("demo", handler)
    with pytest.raises(LookupError, match="not registered"):
        asyncio.run(registry.dispatch("missing", _request()))


def test_openai_chat_adapter_declares_capabilities_and_endpoint():
    from app.ai.adapters.openai import OpenAIChatAdapter
    from app.ai.domain import Connection, ModelResource, ResolvedTarget
    from app.ai.contracts import ChatCommand

    connection = Connection("c1", "legacy-c1", "openai", "C1", "https://api.example/v1", True)
    model = ModelResource("m1", "c1", "gpt-test", "chat", "openai", capabilities=frozenset({"chat"}))
    command = ChatCommand(target=ResolvedTarget(connection=connection, model=model), messages=[])
    adapter = OpenAIChatAdapter()

    assert "chat" in adapter.capabilities
    assert adapter._endpoint(command) == "https://api.example/v1/chat/completions"


def test_gemini_and_omnilojo_chat_adapters_have_explicit_protocols():
    from app.ai.adapters import GeminiChatAdapter, OmnilojoChatAdapter

    assert GeminiChatAdapter.protocol == "gemini"
    assert OmnilojoChatAdapter.protocol == "omnilojo"
    assert GeminiChatAdapter.capabilities == OmnilojoChatAdapter.capabilities


def test_connection_discovery_service_rejects_unknown_connection():
    from app.ai.services.discovery import ConnectionDiscoveryService

    called = []

    async def discover(_connection):
        called.append(True)
        return {"ok": True}

    service = ConnectionDiscoveryService(connection_loader=lambda _id: None, discoverer=discover)
    with pytest.raises(LookupError):
        asyncio.run(service.discover("missing"))
    assert called == []


def test_legacy_image_gateway_applies_budget_governance_and_adapter_dispatch():
    registry = ImageAdapterRegistry()
    calls = []

    async def handler(request):
        calls.append(("adapter", request.provider["id"], request.model))
        return {"ok": True}

    async def budget(provider, user_id):
        calls.append(("budget", provider["id"], user_id))

    registry.register("demo", handler)
    image_gateway = LegacyImageGateway(
        provider_resolver=lambda _provider_id: {"id": "demo"},
        budget_authorizer=budget,
        registry=registry,
        adapter_selector=lambda _provider, _model: "demo",
    )

    result = asyncio.run(image_gateway.generate(
        prompt="draw", size="1024x1024", quality="high", model="image-1",
        reference_images=[], provider_id="legacy-demo", actor=Actor(user_id="user-a"),
    ))

    assert result == {"ok": True}
    assert calls == [("budget", "demo", "user-a"), ("adapter", "demo", "image-1")]


def test_main_image_entrypoint_delegates_to_legacy_gateway(monkeypatch):
    import main

    calls = []

    monkeypatch.setattr(main, "get_api_provider", lambda provider_id: {"id": provider_id})
    monkeypatch.setattr(main, "current_user_id", lambda: "user-a")
    monkeypatch.setattr(main, "image_adapter_key", lambda _provider, _model: "demo")

    async def budget(provider, user_id):
        calls.append(("budget", provider["id"], user_id))

    async def dispatch(adapter_key, request):
        calls.append(("dispatch", adapter_key, request.prompt, request.reference_images))
        return {"ok": True}, {"raw": True}

    monkeypatch.setattr(main, "assert_provider_budget_available", budget)
    monkeypatch.setattr(main.IMAGE_ADAPTERS, "dispatch", dispatch)

    result = asyncio.run(main.generate_ai_image(
        "draw", "1024x1024", "high", "image-1", [{"url": "ref"}], "demo-provider",
    ))

    assert result == ({"ok": True}, {"raw": True})
    assert calls == [
        ("budget", "demo-provider", "user-a"),
        ("dispatch", "demo", "draw", [{"url": "ref"}]),
    ]


def test_legacy_video_gateway_applies_authorization_budget_and_dispatch():
    from app.ai.videos import LegacyVideoGateway

    calls = []

    async def budget(provider, user_id):
        calls.append(("budget", provider["id"], user_id))

    def authorize(provider_id, model):
        calls.append(("authorize", provider_id, model))
        return model

    async def dispatch(protocol, payload, provider):
        calls.append(("dispatch", protocol, provider["id"]))
        return {"video": "ok"}

    class Payload:
        provider_id = "video-main"
        model = "veo3-fast"

    video_gateway = LegacyVideoGateway(
        provider_resolver=lambda provider_id: {"id": provider_id},
        model_authorizer=authorize,
        budget_authorizer=budget,
        dispatcher=dispatch,
        protocol_resolver=lambda _provider: "openai",
    )

    result = asyncio.run(video_gateway.generate(payload=Payload(), actor_user_id="user-a"))

    assert result == {"video": "ok"}
    assert calls == [
        ("authorize", "video-main", "veo3-fast"),
        ("budget", "video-main", "user-a"),
        ("dispatch", "openai", "video-main"),
    ]


def test_provider_operation_records_success_metric():
    before = AI_PROVIDER_REQUESTS.labels(provider="demo", operation="image_generation", status="succeeded")._value.get()

    async def scenario():
        async with gateway.provider_operation("demo", "image_generation"):
            pass

    asyncio.run(scenario())
    after = AI_PROVIDER_REQUESTS.labels(provider="demo", operation="image_generation", status="succeeded")._value.get()
    assert after == before + 1


def test_provider_operation_rejects_when_bounded_queue_is_full(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER_MAX_CONCURRENCY", "1")
    monkeypatch.setenv("AI_PROVIDER_QUEUE_LIMIT", "1")
    gateway._CAPACITIES.clear()

    async def scenario():
        started = asyncio.Event()
        release = asyncio.Event()

        async def held_operation():
            async with gateway.provider_operation("demo", "image_generation"):
                started.set()
                await release.wait()

        first = asyncio.create_task(held_operation())
        await started.wait()
        second = asyncio.create_task(held_operation())
        await asyncio.sleep(0)
        with pytest.raises(HTTPException) as exc:
            async with gateway.provider_operation("demo", "image_generation"):
                pass
        assert exc.value.status_code == 429
        release.set()
        await asyncio.gather(first, second)

    asyncio.run(scenario())


class Redis:
    def __init__(self):
        self.values = {}

    async def eval(self, _script, _keys, key, _window):
        value = int(self.values.get(key, 0)) + 1
        self.values[key] = value
        return value

    async def get(self, key):
        return self.values.get(key)

    async def incr(self, key):
        value = int(self.values.get(key, 0)) + 1
        self.values[key] = value
        return value

    async def expire(self, _key, _seconds):
        return True

    async def set(self, key, value, **_kwargs):
        self.values[key] = value
        return True

    async def delete(self, key):
        self.values.pop(key, None)
        return 1


def test_distributed_gateway_enforces_user_limit(monkeypatch):
    redis = Redis()
    monkeypatch.setenv("AI_DISTRIBUTED_GOVERNANCE_ENABLED", "true")
    monkeypatch.setenv("AI_PROVIDER_USER_REQUESTS_PER_WINDOW", "1")
    monkeypatch.setattr(gateway, "get_redis_client", lambda: redis)

    async def scenario():
        async with gateway.provider_operation("demo", "image_generation", user_id="user-a"):
            pass
        with pytest.raises(HTTPException) as exc:
            async with gateway.provider_operation("demo", "image_generation", user_id="user-a"):
                pass
        assert exc.value.status_code == 429

    asyncio.run(scenario())


def test_distributed_gateway_opens_circuit_after_failures(monkeypatch):
    redis = Redis()
    monkeypatch.setenv("AI_DISTRIBUTED_GOVERNANCE_ENABLED", "true")
    monkeypatch.setenv("AI_PROVIDER_CIRCUIT_FAILURE_THRESHOLD", "1")
    monkeypatch.setattr(gateway, "get_redis_client", lambda: redis)

    async def scenario():
        with pytest.raises(RuntimeError):
            async with gateway.provider_operation("demo", "image_generation", user_id="user-a"):
                raise RuntimeError("upstream unavailable")
        with pytest.raises(HTTPException) as exc:
            async with gateway.provider_operation("demo", "image_generation", user_id="user-a"):
                pass
        assert exc.value.status_code == 503

    asyncio.run(scenario())
def test_provider_compatibility_can_be_disabled(monkeypatch):
    import main
    from fastapi import HTTPException
    monkeypatch.setenv("AI_PROVIDER_COMPAT", "0")
    with pytest.raises(HTTPException) as exc:
        main.require_provider_compatibility()
    assert exc.value.status_code == 410
