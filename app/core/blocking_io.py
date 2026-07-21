"""Unified bounded adapter for blocking SDKs (MinIO) that have no async client.

All event-loop code that needs to call a synchronous MinIO/storage function
must go through :func:`run_storage_io` instead of calling ``asyncio.to_thread``
directly. Routing every call through one adapter gives us:

- A hard cap on concurrent blocking-storage threads (``BLOCKING_IO_WORKERS``).
- A hard cap on requests queued waiting for a thread
  (``BLOCKING_IO_QUEUE_LIMIT``); once the queue is full new requests fail fast
  with :class:`BlockingIOQueueFullError` instead of piling up indefinitely.
- Consistent Prometheus metrics for in-flight/queued calls and rejections.

Do not call ``asyncio.to_thread()``/``anyio.to_thread.run_sync()`` directly for
MinIO or other blocking storage SDK operations; use this module so concurrency,
queueing, and observability stay centrally controlled.
"""

from __future__ import annotations

import time
from functools import partial
from typing import Any, Callable, TypeVar

import anyio

from app.config import BLOCKING_IO_QUEUE_LIMIT, BLOCKING_IO_WORKERS
from app.core.logging import get_logger
from app.core.metrics import (
    BLOCKING_IO_ACTIVE,
    BLOCKING_IO_QUEUED,
    BLOCKING_IO_QUEUE_REJECTIONS,
    BLOCKING_IO_SECONDS,
)

logger = get_logger("blocking_io")

T = TypeVar("T")

# A single process-wide limiter bounds how many OS threads may run blocking
# storage SDK calls concurrently, regardless of how many coroutines attempt to
# submit work. This is intentionally module-level global state: the limit is a
# property of the process (and its thread pool), not of any one request.
storage_limiter = anyio.CapacityLimiter(max(1, int(BLOCKING_IO_WORKERS or 1)))
_queue_depth = 0
_queue_lock = anyio.Lock()


class BlockingIOQueueFullError(RuntimeError):
    """Raised when the bounded blocking-IO queue is at capacity.

    Callers should translate this into HTTP 503/429 rather than let the
    request wait indefinitely for a free worker thread.
    """


async def run_storage_io(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run a synchronous MinIO/storage SDK call in the bounded thread pool.

    Raises:
        BlockingIOQueueFullError: the queue of callers waiting for a free
            worker thread is already at ``BLOCKING_IO_QUEUE_LIMIT``.
    """
    global _queue_depth

    async with _queue_lock:
        if _queue_depth >= max(0, int(BLOCKING_IO_QUEUE_LIMIT or 0)):
            BLOCKING_IO_QUEUE_REJECTIONS.inc()
            logger.warning(
                "blocking IO queue is full",
                extra={
                    "event": "blocking_io_queue_full",
                    "queue_depth": _queue_depth,
                    "queue_limit": BLOCKING_IO_QUEUE_LIMIT,
                },
            )
            raise BlockingIOQueueFullError("对象存储线程池队列已满，请稍后重试")
        _queue_depth += 1
    BLOCKING_IO_QUEUED.set(_queue_depth)

    call = partial(func, *args, **kwargs)
    started = time.perf_counter()
    status = "success"
    try:
        async with _queue_lock:
            _queue_depth -= 1
        BLOCKING_IO_QUEUED.set(_queue_depth)
        BLOCKING_IO_ACTIVE.inc()
        try:
            return await anyio.to_thread.run_sync(call, limiter=storage_limiter)
        except BaseException:
            status = "error"
            raise
    finally:
        BLOCKING_IO_ACTIVE.dec()
        BLOCKING_IO_SECONDS.labels(status=status).observe(time.perf_counter() - started)


def blocking_io_status() -> dict:
    """Point-in-time snapshot for health/diagnostics endpoints."""
    return {
        "workers": int(BLOCKING_IO_WORKERS or 0),
        "queue_limit": int(BLOCKING_IO_QUEUE_LIMIT or 0),
        "queue_depth": _queue_depth,
        "borrowed_tokens": storage_limiter.borrowed_tokens,
        "total_tokens": storage_limiter.total_tokens,
    }
