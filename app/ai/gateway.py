"""Bounded, observable execution for paid AI provider operations."""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import HTTPException

from app.core.metrics import AI_PROVIDER_INFLIGHT, AI_PROVIDER_REQUEST_SECONDS, AI_PROVIDER_REQUESTS


@dataclass
class _ProviderCapacity:
    admission: asyncio.Semaphore
    execution: asyncio.Semaphore
    concurrency: int
    queue_limit: int


_CAPACITIES: dict[tuple[int, str], _ProviderCapacity] = {}


def _positive_int(value: str, fallback: int) -> int:
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return fallback


def _limits(provider_id: str) -> tuple[int, int]:
    normalized = "".join(char if char.isalnum() else "_" for char in provider_id.upper())
    concurrency = _positive_int(
        os.getenv(f"AI_PROVIDER_{normalized}_MAX_CONCURRENCY", os.getenv("AI_PROVIDER_MAX_CONCURRENCY", "4")),
        4,
    )
    queue_limit = _positive_int(os.getenv("AI_PROVIDER_QUEUE_LIMIT", "16"), 16)
    return concurrency, queue_limit


def _capacity(provider_id: str) -> _ProviderCapacity:
    loop_key = id(asyncio.get_running_loop())
    key = (loop_key, provider_id)
    capacity = _CAPACITIES.get(key)
    concurrency, queue_limit = _limits(provider_id)
    expected_admission = concurrency + queue_limit
    if capacity is None or (capacity.concurrency, capacity.queue_limit) != (concurrency, queue_limit):
        capacity = _ProviderCapacity(
            admission=asyncio.Semaphore(expected_admission),
            execution=asyncio.Semaphore(concurrency),
            concurrency=concurrency,
            queue_limit=queue_limit,
        )
        _CAPACITIES[key] = capacity
    return capacity


@asynccontextmanager
async def provider_operation(provider_id: str, operation: str):
    """Bound queueing and emit provider-level latency, failure, and load metrics."""
    provider = str(provider_id or "unknown").strip().lower() or "unknown"
    operation_name = str(operation or "unknown").strip().lower() or "unknown"
    capacity = _capacity(provider)
    if capacity.admission.locked():
        AI_PROVIDER_REQUESTS.labels(provider=provider, operation=operation_name, status="rejected").inc()
        raise HTTPException(status_code=429, detail="AI 平台当前请求过多，请稍后重试。")

    await capacity.admission.acquire()
    acquired_execution = False
    try:
        await capacity.execution.acquire()
        acquired_execution = True
        AI_PROVIDER_INFLIGHT.labels(provider=provider, operation=operation_name).inc()
        try:
            with AI_PROVIDER_REQUEST_SECONDS.labels(provider=provider, operation=operation_name).time():
                yield
        except asyncio.CancelledError:
            AI_PROVIDER_REQUESTS.labels(provider=provider, operation=operation_name, status="cancelled").inc()
            raise
        except Exception:
            AI_PROVIDER_REQUESTS.labels(provider=provider, operation=operation_name, status="failed").inc()
            raise
        else:
            AI_PROVIDER_REQUESTS.labels(provider=provider, operation=operation_name, status="succeeded").inc()
        finally:
            AI_PROVIDER_INFLIGHT.labels(provider=provider, operation=operation_name).dec()
    finally:
        if acquired_execution:
            capacity.execution.release()
        capacity.admission.release()
