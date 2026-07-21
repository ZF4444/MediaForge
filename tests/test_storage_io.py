import asyncio
from threading import Event

import pytest

from app.core.storage_io import StorageIOAdapter, StorageIOOverloaded


def test_storage_io_adapter_limits_workers_and_queue():
    async def scenario():
        adapter = StorageIOAdapter(workers=1, queue_limit=1)
        first_started = Event()
        release_first = Event()

        def blocking_call(value):
            first_started.set()
            release_first.wait(timeout=2)
            return value

        first = asyncio.create_task(adapter.run(blocking_call, "first"))
        while not first_started.is_set():
            await asyncio.sleep(0.001)

        second = asyncio.create_task(adapter.run(lambda: "second"))
        await asyncio.sleep(0.001)
        stats = adapter.refresh_metrics()
        assert stats["active"] == 1
        assert stats["queued"] == 1

        with pytest.raises(StorageIOOverloaded):
            await adapter.run(lambda: "rejected")

        release_first.set()
        assert await first == "first"
        assert await second == "second"
        assert adapter.refresh_metrics()["active"] == 0
        assert adapter.refresh_metrics()["queued"] == 0

    asyncio.run(scenario())


def test_storage_io_adapter_releases_capacity_after_failure():
    async def scenario():
        adapter = StorageIOAdapter(workers=1, queue_limit=0)

        def fail():
            raise ValueError("failed")

        with pytest.raises(ValueError, match="failed"):
            await adapter.run(fail)

        assert await adapter.run(lambda: "ok") == "ok"
        assert adapter.refresh_metrics()["active"] == 0

    asyncio.run(scenario())
