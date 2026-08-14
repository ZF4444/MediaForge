"""Unit tests for protocol-neutral AI adapter dispatch and provider governance."""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.ai import gateway
from app.ai.registry import ImageAdapterRegistry, ImageGenerationRequest
from app.core.metrics import AI_PROVIDER_REQUESTS


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
