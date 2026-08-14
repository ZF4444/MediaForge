"""Unit tests for protocol-neutral AI adapter dispatch and provider governance."""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.ai import gateway
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
