"""Required asynchronous Redis client lifecycle for authentication caching."""

from __future__ import annotations

from typing import Any

from app.config import (
    REDIS_CONNECT_TIMEOUT_SECONDS,
    REDIS_MAX_CONNECTIONS,
    REDIS_SESSION_PREFIX,
    REDIS_SOCKET_TIMEOUT_SECONDS,
    REDIS_URL,
)
from app.core.logging import get_logger
from app.core.metrics import REDIS_AVAILABLE, REDIS_OPERATION_SECONDS


logger = get_logger("redis")
_CLIENT: Any = None


class RedisUnavailableError(RuntimeError):
    """Redis is required but unavailable for authentication."""


def _validate_redis_settings() -> None:
    if not REDIS_URL:
        raise RuntimeError("认证缓存必须配置 REDIS_URL")
    if REDIS_MAX_CONNECTIONS < 1:
        raise RuntimeError("REDIS_MAX_CONNECTIONS 必须至少为 1")
    if REDIS_CONNECT_TIMEOUT_SECONDS <= 0 or REDIS_SOCKET_TIMEOUT_SECONDS <= 0:
        raise RuntimeError("Redis 连接与命令超时必须大于 0")
    if not REDIS_SESSION_PREFIX:
        raise RuntimeError("REDIS_SESSION_PREFIX 不能为空")


async def open_redis_client() -> Any:
    """Create the process-local client and fail startup unless PING succeeds."""
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT

    _validate_redis_settings()
    try:
        from redis.asyncio import Redis
    except ImportError as exc:
        raise RuntimeError("Redis 异步客户端依赖不可用，请执行 uv sync") from exc

    client = Redis.from_url(
        REDIS_URL,
        decode_responses=True,
        max_connections=REDIS_MAX_CONNECTIONS,
        socket_connect_timeout=REDIS_CONNECT_TIMEOUT_SECONDS,
        socket_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
        health_check_interval=30,
    )
    try:
        with REDIS_OPERATION_SECONDS.labels(operation="ping").time():
            await client.ping()
    except Exception as exc:
        REDIS_AVAILABLE.set(0)
        await client.aclose()
        raise RedisUnavailableError("Redis 认证缓存不可用，应用拒绝启动") from exc

    _CLIENT = client
    REDIS_AVAILABLE.set(1)
    logger.info(
        "Redis authentication cache connected",
        extra={"event": "redis_client_opened", "max_connections": REDIS_MAX_CONNECTIONS},
    )
    return client


def get_redis_client() -> Any:
    client = _CLIENT
    if client is None:
        REDIS_AVAILABLE.set(0)
        raise RedisUnavailableError("Redis 认证缓存尚未启动")
    return client


async def verify_redis_connection() -> None:
    """Raise when the required Redis dependency is not currently reachable."""
    client = get_redis_client()
    try:
        with REDIS_OPERATION_SECONDS.labels(operation="ping").time():
            await client.ping()
    except Exception as exc:
        REDIS_AVAILABLE.set(0)
        raise RedisUnavailableError("Redis 认证缓存暂时不可用") from exc
    REDIS_AVAILABLE.set(1)


async def redis_readiness_status() -> dict[str, Any]:
    try:
        await verify_redis_connection()
    except RedisUnavailableError:
        return {"ready": False, "component": "unavailable"}
    return {"ready": True, "component": "ok"}


async def close_redis_client() -> None:
    global _CLIENT
    client = _CLIENT
    _CLIENT = None
    REDIS_AVAILABLE.set(0)
    if client is None:
        return
    await client.aclose()
    logger.info("Redis authentication cache closed", extra={"event": "redis_client_closed"})
