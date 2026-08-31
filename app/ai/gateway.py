"""Bounded, observable execution for paid AI connection operations."""

from __future__ import annotations

import asyncio
import os
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from collections.abc import AsyncIterator
from typing import Any, Protocol

from fastapi import HTTPException

from app.core.metrics import AI_CONNECTION_INFLIGHT, AI_CONNECTION_REQUEST_SECONDS, AI_CONNECTION_REQUESTS
from app.core.redis_client import RedisUnavailableError, get_redis_client


@dataclass
class _ConnectionCapacity:
    admission: asyncio.Semaphore
    execution: asyncio.Semaphore
    concurrency: int
    queue_limit: int


_CAPACITIES: dict[tuple[int, str], _ConnectionCapacity] = {}
_GOVERNANCE_PREFIX = "mediaforge:ai-gateway:"
_DISTRIBUTED_SLOT_RELEASE_SCRIPT = """
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"""


class AIGateway(Protocol):
    """Stable capability boundary used by routes and orchestration services."""

    async def chat(self, command: Any, *, actor: Any) -> Any: ...
    async def stream_chat(self, command: Any, *, actor: Any) -> AsyncIterator[Any]: ...
    async def generate_image(self, command: Any, *, actor: Any) -> Any: ...
    async def generate_video(self, command: Any, *, actor: Any) -> Any: ...
    async def run_app(self, command: Any, *, actor: Any) -> Any: ...
    async def run_workflow(self, command: Any, *, actor: Any) -> Any: ...


class ResourceGateway:
    """Executable-resource gateway with injected resolution and adapters.

    This is deliberately small and framework-neutral; HTTP routes can inject
    the existing repository and task handlers while migration is in progress.
    """

    def __init__(self, *, resolver, adapters: dict[str, Any]):
        self._resolver = resolver
        self._adapters = {str(key).lower(): value for key, value in adapters.items()}

    async def _run(self, command: Any, actor: Any, capability: str, operation: str) -> Any:
        target = self._resolver(command)
        adapter = self._adapters.get(str(target.protocol).lower())
        if adapter is None or not adapter.supports(target, capability):
            raise HTTPException(status_code=400, detail=f"未注册可执行资源适配器: {target.protocol}")
        connection = str(target.connection.id)
        async with connection_operation(connection, operation, user_id=str(getattr(actor, "user_id", "") or "")):
            return await adapter.execute(target, command, actor=actor)

    async def run_app(self, command: Any, *, actor: Any) -> Any:
        return await self._run(command, actor, "run_app", "app_generation")

    async def run_workflow(self, command: Any, *, actor: Any) -> Any:
        return await self._run(command, actor, "run_workflow", "workflow_execution")


def _positive_int(value: str, fallback: int) -> int:
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return fallback


def _limits(connection_id: str) -> tuple[int, int]:
    normalized = "".join(char if char.isalnum() else "_" for char in connection_id.upper())
    concurrency = _positive_int(
        os.getenv(f"AI_CONNECTION_{normalized}_MAX_CONCURRENCY", os.getenv("AI_CONNECTION_MAX_CONCURRENCY", "100")),
        100,
    )
    queue_limit = _positive_int(os.getenv("AI_CONNECTION_QUEUE_LIMIT", "200"), 200)
    return concurrency, queue_limit


def _env_int(name: str, fallback: int) -> int:
    return _positive_int(os.getenv(name, str(fallback)), fallback)


def _connection_setting(connection_id: str, suffix: str, fallback: int) -> int:
    normalized = "".join(char if char.isalnum() else "_" for char in connection_id.upper())
    return _env_int(f"AI_CONNECTION_{normalized}_{suffix}", _env_int(f"AI_CONNECTION_{suffix}", fallback))


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


async def _check_distributed_admission(connection: str, operation: str, user_id: str) -> None:
    if not _governance_enabled():
        return
    breaker_key = f"{_GOVERNANCE_PREFIX}breaker:{connection}:{operation}"
    try:
        client = get_redis_client()
        if await client.get(breaker_key):
            AI_CONNECTION_REQUESTS.labels(connection=connection, operation=operation, status="circuit_open").inc()
            raise HTTPException(status_code=503, detail="AI 平台暂时不可用，正在等待上游恢复。")
    except RedisUnavailableError:
        raise HTTPException(status_code=503, detail="AI 网关熔断存储不可用，请稍后重试。") from None
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="AI 网关熔断存储不可用，请稍后重试。") from exc

    window = _connection_setting(connection, "RATE_WINDOW_SECONDS", 60)
    connection_limit = _connection_setting(connection, "REQUESTS_PER_WINDOW", 120)
    user_limit = _connection_setting(connection, "USER_REQUESTS_PER_WINDOW", 20)
    bucket = int(time.time() // window)
    connection_key = f"{_GOVERNANCE_PREFIX}rate:connection:{connection}:{operation}:{bucket}"
    if not await _increment_fixed_window(connection_key, connection_limit, window + 1):
        AI_CONNECTION_REQUESTS.labels(connection=connection, operation=operation, status="rate_limited").inc()
        raise HTTPException(status_code=429, detail="AI 平台当前请求过多，请稍后重试。")
    if user_id:
        user_key = f"{_GOVERNANCE_PREFIX}rate:user:{user_id}:{connection}:{operation}:{bucket}"
        if not await _increment_fixed_window(user_key, user_limit, window + 1):
            AI_CONNECTION_REQUESTS.labels(connection=connection, operation=operation, status="user_rate_limited").inc()
            raise HTTPException(status_code=429, detail="当前用户的 AI 请求过于频繁，请稍后重试。")


async def _record_distributed_result(connection: str, operation: str, exc: BaseException | None) -> None:
    if not _governance_enabled():
        return
    failures_key = f"{_GOVERNANCE_PREFIX}failures:{connection}:{operation}"
    breaker_key = f"{_GOVERNANCE_PREFIX}breaker:{connection}:{operation}"
    try:
        client = get_redis_client()
        if exc is None:
            await client.delete(failures_key)
            return
        if isinstance(exc, HTTPException) and exc.status_code < 500:
            return
        threshold = _connection_setting(connection, "CIRCUIT_FAILURE_THRESHOLD", 5)
        cooldown = _connection_setting(connection, "CIRCUIT_COOLDOWN_SECONDS", 30)
        count = int(await client.incr(failures_key))
        if count == 1:
            await client.expire(failures_key, cooldown)
        if count >= threshold:
            await client.set(breaker_key, "1", ex=cooldown)
            await client.delete(failures_key)
    except Exception:
        return


async def _acquire_distributed_slot(connection: str, operation: str) -> tuple[str, str] | None:
    """Acquire one cluster-wide execution slot when Redis governance is enabled."""
    if not _governance_enabled() or os.getenv("AI_DISTRIBUTED_CONCURRENCY_ENABLED", "true").lower() not in {"1", "true", "yes", "on"}:
        return None
    limit = _connection_setting(connection, "MAX_CONCURRENCY", 100)
    token = uuid.uuid4().hex
    key = f"{_GOVERNANCE_PREFIX}slot:{connection}:{operation}:{token}"
    try:
        client = get_redis_client()
        bucket = f"{_GOVERNANCE_PREFIX}slots:{connection}:{operation}"
        script = """
local count = redis.call('SCARD', KEYS[1])
if count >= tonumber(ARGV[1]) then return 0 end
redis.call('SADD', KEYS[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
return 1
"""
        try:
            acquired = await client.eval(script, 2, bucket, key, limit, token, _connection_setting(connection, "SLOT_TTL_SECONDS", 900))
        except TypeError:
            # Lightweight test doubles and older Redis wrappers may not expose
            # variadic EVAL. Rate limiting remains active in that case.
            return None
        if not acquired:
            raise HTTPException(status_code=429, detail="AI 平台集群并发已达到上限，请稍后重试。")
        return bucket, key
    except RedisUnavailableError:
        raise HTTPException(status_code=503, detail="AI 网关并发存储不可用，请稍后重试。") from None
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="AI 网关并发存储不可用，请稍后重试。") from exc


async def _release_distributed_slot(slot: tuple[str, str] | None) -> None:
    if not slot:
        return
    bucket, key = slot
    try:
        client = get_redis_client()
        token = await client.get(key)
        if token is not None:
            await client.eval(_DISTRIBUTED_SLOT_RELEASE_SCRIPT, 1, key, token)
            await client.srem(bucket, token)
    except Exception:
        return


def _capacity(connection_id: str) -> _ConnectionCapacity:
    loop_key = id(asyncio.get_running_loop())
    key = (loop_key, connection_id)
    capacity = _CAPACITIES.get(key)
    concurrency, queue_limit = _limits(connection_id)
    expected_admission = concurrency + queue_limit
    if capacity is None or (capacity.concurrency, capacity.queue_limit) != (concurrency, queue_limit):
        capacity = _ConnectionCapacity(
            admission=asyncio.Semaphore(expected_admission),
            execution=asyncio.Semaphore(concurrency),
            concurrency=concurrency,
            queue_limit=queue_limit,
        )
        _CAPACITIES[key] = capacity
    return capacity


@asynccontextmanager
async def connection_operation(connection_id: str, operation: str, *, user_id: str = ""):
    """Bound queueing and emit connection-level latency, failure, and load metrics."""
    connection = str(connection_id or "unknown").strip().lower() or "unknown"
    operation_name = str(operation or "unknown").strip().lower() or "unknown"
    await _check_distributed_admission(connection, operation_name, str(user_id or ""))
    capacity = _capacity(connection)
    if capacity.admission.locked():
        AI_CONNECTION_REQUESTS.labels(connection=connection, operation=operation_name, status="rejected").inc()
        raise HTTPException(status_code=429, detail="AI 平台当前请求过多，请稍后重试。")

    await capacity.admission.acquire()
    acquired_execution = False
    distributed_slot = None
    try:
        await capacity.execution.acquire()
        acquired_execution = True
        distributed_slot = await _acquire_distributed_slot(connection, operation_name)
        AI_CONNECTION_INFLIGHT.labels(connection=connection, operation=operation_name).inc()
        try:
            with AI_CONNECTION_REQUEST_SECONDS.labels(connection=connection, operation=operation_name).time():
                yield
        except asyncio.CancelledError:
            AI_CONNECTION_REQUESTS.labels(connection=connection, operation=operation_name, status="cancelled").inc()
            raise
        except Exception as exc:
            AI_CONNECTION_REQUESTS.labels(connection=connection, operation=operation_name, status="failed").inc()
            await _record_distributed_result(connection, operation_name, exc)
            raise
        else:
            AI_CONNECTION_REQUESTS.labels(connection=connection, operation=operation_name, status="succeeded").inc()
            await _record_distributed_result(connection, operation_name, None)
        finally:
            AI_CONNECTION_INFLIGHT.labels(connection=connection, operation=operation_name).dec()
    finally:
        if acquired_execution:
            capacity.execution.release()
        capacity.admission.release()
        await _release_distributed_slot(distributed_slot)
