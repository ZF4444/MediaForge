"""Bounded, observable execution for paid AI provider operations."""

from __future__ import annotations

import asyncio
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import HTTPException

from app.core.metrics import AI_PROVIDER_INFLIGHT, AI_PROVIDER_REQUEST_SECONDS, AI_PROVIDER_REQUESTS
from app.core.redis_client import RedisUnavailableError, get_redis_client


@dataclass
class _ProviderCapacity:
    admission: asyncio.Semaphore
    execution: asyncio.Semaphore
    concurrency: int
    queue_limit: int


_CAPACITIES: dict[tuple[int, str], _ProviderCapacity] = {}
_GOVERNANCE_PREFIX = "mediaforge:ai-gateway:"


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


def _env_int(name: str, fallback: int) -> int:
    return _positive_int(os.getenv(name, str(fallback)), fallback)


def _provider_setting(provider_id: str, suffix: str, fallback: int) -> int:
    normalized = "".join(char if char.isalnum() else "_" for char in provider_id.upper())
    return _env_int(f"AI_PROVIDER_{normalized}_{suffix}", _env_int(f"AI_PROVIDER_{suffix}", fallback))


def _governance_enabled() -> bool:
    return os.getenv("AI_DISTRIBUTED_GOVERNANCE_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}


async def _increment_fixed_window(key: str, limit: int, window_seconds: int) -> bool:
    """Increment a Redis fixed window atomically and return whether it is admitted."""
    script = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""
    try:
        count = int(await get_redis_client().eval(script, 1, key, window_seconds))
    except RedisUnavailableError:
        raise HTTPException(status_code=503, detail="AI 网关限流存储不可用，请稍后重试。") from None
    except Exception as exc:
        raise HTTPException(status_code=503, detail="AI 网关限流存储不可用，请稍后重试。") from exc
    return count <= limit


async def _check_distributed_admission(provider: str, operation: str, user_id: str) -> None:
    if not _governance_enabled():
        return
    breaker_key = f"{_GOVERNANCE_PREFIX}breaker:{provider}:{operation}"
    try:
        client = get_redis_client()
        if await client.get(breaker_key):
            AI_PROVIDER_REQUESTS.labels(provider=provider, operation=operation, status="circuit_open").inc()
            raise HTTPException(status_code=503, detail="AI 平台暂时不可用，正在等待上游恢复。")
    except RedisUnavailableError:
        raise HTTPException(status_code=503, detail="AI 网关熔断存储不可用，请稍后重试。") from None
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="AI 网关熔断存储不可用，请稍后重试。") from exc

    window = _provider_setting(provider, "RATE_WINDOW_SECONDS", 60)
    provider_limit = _provider_setting(provider, "REQUESTS_PER_WINDOW", 120)
    user_limit = _provider_setting(provider, "USER_REQUESTS_PER_WINDOW", 20)
    bucket = int(time.time() // window)
    provider_key = f"{_GOVERNANCE_PREFIX}rate:provider:{provider}:{operation}:{bucket}"
    if not await _increment_fixed_window(provider_key, provider_limit, window + 1):
        AI_PROVIDER_REQUESTS.labels(provider=provider, operation=operation, status="rate_limited").inc()
        raise HTTPException(status_code=429, detail="AI 平台当前请求过多，请稍后重试。")
    if user_id:
        user_key = f"{_GOVERNANCE_PREFIX}rate:user:{user_id}:{provider}:{operation}:{bucket}"
        if not await _increment_fixed_window(user_key, user_limit, window + 1):
            AI_PROVIDER_REQUESTS.labels(provider=provider, operation=operation, status="user_rate_limited").inc()
            raise HTTPException(status_code=429, detail="当前用户的 AI 请求过于频繁，请稍后重试。")


async def _record_distributed_result(provider: str, operation: str, exc: BaseException | None) -> None:
    if not _governance_enabled():
        return
    failures_key = f"{_GOVERNANCE_PREFIX}failures:{provider}:{operation}"
    breaker_key = f"{_GOVERNANCE_PREFIX}breaker:{provider}:{operation}"
    try:
        client = get_redis_client()
        if exc is None:
            await client.delete(failures_key)
            return
        if isinstance(exc, HTTPException) and exc.status_code < 500:
            return
        threshold = _provider_setting(provider, "CIRCUIT_FAILURE_THRESHOLD", 5)
        cooldown = _provider_setting(provider, "CIRCUIT_COOLDOWN_SECONDS", 30)
        count = int(await client.incr(failures_key))
        if count == 1:
            await client.expire(failures_key, cooldown)
        if count >= threshold:
            await client.set(breaker_key, "1", ex=cooldown)
            await client.delete(failures_key)
    except Exception:
        # Generation result must not be hidden by a best-effort observability update.
        return


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
async def provider_operation(provider_id: str, operation: str, *, user_id: str = ""):
    """Bound queueing and emit provider-level latency, failure, and load metrics."""
    provider = str(provider_id or "unknown").strip().lower() or "unknown"
    operation_name = str(operation or "unknown").strip().lower() or "unknown"
    await _check_distributed_admission(provider, operation_name, str(user_id or ""))
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
        except Exception as exc:
            AI_PROVIDER_REQUESTS.labels(provider=provider, operation=operation_name, status="failed").inc()
            await _record_distributed_result(provider, operation_name, exc)
            raise
        else:
            AI_PROVIDER_REQUESTS.labels(provider=provider, operation=operation_name, status="succeeded").inc()
            await _record_distributed_result(provider, operation_name, None)
        finally:
            AI_PROVIDER_INFLIGHT.labels(provider=provider, operation=operation_name).dec()
    finally:
        if acquired_execution:
            capacity.execution.release()
        capacity.admission.release()
