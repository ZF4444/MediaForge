"""Unit tests for protocol-neutral AI adapter dispatch and connection governance."""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.ai import gateway
from app.ai.contracts import Actor
from app.ai.images import ImageGateway
from app.ai.registry import ImageAdapterRegistry, ImageGenerationRequest
from app.core.metrics import AI_CONNECTION_REQUESTS


@pytest.fixture(autouse=True)
def disable_distributed_governance(monkeypatch):
    monkeypatch.setenv("AI_DISTRIBUTED_GOVERNANCE_ENABLED", "false")


def _request() -> ImageGenerationRequest:
    from app.ai.domain import Connection, ModelResource, ResolvedTarget
    connection = Connection("demo", "openai", "Demo", "https://api.example/v1", True)
    model = ModelResource("demo-model", "demo", "demo-image", "image", "openai")
    return ImageGenerationRequest(
        prompt="draw a cube",
        size="1024x1024",
        quality="high",
        model="demo-image",
        reference_images=[],
        connection={"id": "demo"},
        target=ResolvedTarget(connection=connection, model=model),
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


def test_image_adapter_registry_rejects_unresolved_target():
    registry = ImageAdapterRegistry()

    async def handler(request):
        return request.model

    registry.register("demo", handler)
    unresolved = ImageGenerationRequest(
        prompt="draw", size="1024x1024", quality="auto", model="demo-image",
        reference_images=[], connection={"id": "demo"},
    )
    with pytest.raises(ValueError, match="resolved connection/model/resource target"):
        asyncio.run(registry.dispatch("demo", unresolved))


def test_openai_image_adapter_normalizes_generation_and_references():
    from app.ai.adapters import OpenAIImageAdapter
    images, masks = OpenAIImageAdapter.split_references([
        {"url": "image.png"}, {"url": "mask.png", "role": "mask"},
    ])
    assert len(images) == 1 and len(masks) == 1
    assert OpenAIImageAdapter.generation_body(model="gpt-image-2", prompt="x", size="1024x1024", gpt_image_2=True)["output_format"] == "png"


def test_image_request_exposes_canonical_target_ids():
    from app.ai.domain import Connection, ModelResource, ResolvedTarget

    connection = Connection("conn-1", "openai", "Connection", "https://api.example/v1", True)
    model = ModelResource("model-1", "conn-1", "gpt-image-2", "image", "openai")
    request = ImageGenerationRequest(
        prompt="draw a cube", size="1024x1024", quality="auto", model="gpt-image-2",
        reference_images=[], connection={"id": "conn-1"},
        target=ResolvedTarget(connection=connection, model=model),
    )

    assert request.connection_id == "conn-1"
    assert request.model_id == "model-1"
    assert request.resource_id == ""


def test_openai_chat_adapter_declares_capabilities_and_endpoint():
    from app.ai.adapters.openai import OpenAIChatAdapter
    from app.ai.domain import Connection, ModelResource, ResolvedTarget
    from app.ai.contracts import ChatCommand

    connection = Connection("c1", "openai", "C1", "https://api.example/v1", True)
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




def test_connection_operation_records_success_metric():
    before = AI_CONNECTION_REQUESTS.labels(connection="demo", operation="image_generation", status="succeeded")._value.get()

    async def scenario():
        async with gateway.connection_operation("demo", "image_generation"):
            pass

    asyncio.run(scenario())
    after = AI_CONNECTION_REQUESTS.labels(connection="demo", operation="image_generation", status="succeeded")._value.get()
    assert after == before + 1


def test_connection_operation_rejects_when_bounded_queue_is_full(monkeypatch):
    monkeypatch.setenv("AI_CONNECTION_MAX_CONCURRENCY", "1")
    monkeypatch.setenv("AI_CONNECTION_QUEUE_LIMIT", "1")
    gateway._CAPACITIES.clear()

    async def scenario():
        started = asyncio.Event()
        release = asyncio.Event()

        async def held_operation():
            async with gateway.connection_operation("demo", "image_generation"):
                started.set()
                await release.wait()

        first = asyncio.create_task(held_operation())
        await started.wait()
        second = asyncio.create_task(held_operation())
        await asyncio.sleep(0)
        with pytest.raises(HTTPException) as exc:
            async with gateway.connection_operation("demo", "image_generation"):
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
    monkeypatch.setenv("AI_CONNECTION_USER_REQUESTS_PER_WINDOW", "1")
    monkeypatch.setattr(gateway, "get_redis_client", lambda: redis)

    async def scenario():
        async with gateway.connection_operation("demo", "image_generation", user_id="user-a"):
            pass
        with pytest.raises(HTTPException) as exc:
            async with gateway.connection_operation("demo", "image_generation", user_id="user-a"):
                pass
        assert exc.value.status_code == 429

    asyncio.run(scenario())


def test_distributed_gateway_opens_circuit_after_failures(monkeypatch):
    redis = Redis()
    monkeypatch.setenv("AI_DISTRIBUTED_GOVERNANCE_ENABLED", "true")
    monkeypatch.setenv("AI_CONNECTION_CIRCUIT_FAILURE_THRESHOLD", "1")
    monkeypatch.setattr(gateway, "get_redis_client", lambda: redis)

    async def scenario():
        with pytest.raises(RuntimeError):
            async with gateway.connection_operation("demo", "image_generation", user_id="user-a"):
                raise RuntimeError("upstream unavailable")
        with pytest.raises(HTTPException) as exc:
            async with gateway.connection_operation("demo", "image_generation", user_id="user-a"):
                pass
        assert exc.value.status_code == 503

    asyncio.run(scenario())
