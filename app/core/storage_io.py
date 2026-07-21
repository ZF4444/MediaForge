"""Bounded async adapter for the synchronous object-storage call graph."""

from __future__ import annotations

from functools import partial
from typing import Any, Callable, TypeVar

import anyio

from app.config import BLOCKING_IO_QUEUE_LIMIT, BLOCKING_IO_WORKERS
from app.core.metrics import BLOCKING_IO_ACTIVE, BLOCKING_IO_QUEUED, BLOCKING_IO_REJECTED


T = TypeVar("T")


class StorageIOOverloaded(RuntimeError):
    """The storage adapter has no execution or queue capacity left."""


class StorageIOAdapter:
    def __init__(self, workers: int, queue_limit: int):
        self.workers = max(1, int(workers))
        self.queue_limit = max(0, int(queue_limit))
        self._workers = anyio.CapacityLimiter(self.workers)
        self._admission = anyio.CapacityLimiter(self.workers + self.queue_limit)

    def refresh_metrics(self) -> dict[str, int]:
        active = int(self._workers.borrowed_tokens)
        admitted = int(self._admission.borrowed_tokens)
        queued = max(0, admitted - active)
        BLOCKING_IO_ACTIVE.set(active)
        BLOCKING_IO_QUEUED.set(queued)
        return {
            "workers": self.workers,
            "queue_limit": self.queue_limit,
            "active": active,
            "queued": queued,
        }

    async def run(self, func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        try:
            self._admission.acquire_nowait()
        except anyio.WouldBlock as exc:
            BLOCKING_IO_REJECTED.inc()
            self.refresh_metrics()
            raise StorageIOOverloaded("对象存储请求过多，请稍后重试") from exc

        self.refresh_metrics()
        try:
            call = partial(func, *args, **kwargs)
            return await anyio.to_thread.run_sync(call, limiter=self._workers)
        finally:
            self._admission.release()
            self.refresh_metrics()


storage_io = StorageIOAdapter(BLOCKING_IO_WORKERS, BLOCKING_IO_QUEUE_LIMIT)


async def run_storage_io(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    return await storage_io.run(func, *args, **kwargs)


def refresh_storage_io_metrics() -> dict[str, int]:
    return storage_io.refresh_metrics()
