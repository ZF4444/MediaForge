"""Durable fail-closed barriers in the authorization DB, before business mutations.

A crash after committing a barrier leaves the scope disabled. Repeating a
mutation is safe; only an explicit administrator policy change re-enables it.
No cross-database success is reported before revocation commits.
"""

import os
from functools import lru_cache

from .config import load_settings
from .repository import Repository


def enabled():
    return os.getenv("PUBLIC_VIDEO_ENABLED", "false").lower() == "true"


@lru_cache(maxsize=1)
def repository():
    settings = load_settings()
    settings.require_writer()
    return Repository(settings.writer_dsn, settings.pool_size)


def check_ready():
    if enabled():
        settings = load_settings()
        settings.require_writer()
        settings.require_reader()
        repository().ready("writer")
    return True


def barrier(scope, key):
    if enabled():
        repository().set_policy(scope, str(key), False)


def active_file(file_id):
    return enabled() and repository().active_file(file_id)


def allow_cleanup(file_id):
    return not enabled() or repository().cleanup_barrier(file_id)


async def task_changed(task):
    if not enabled() or (task.get("type") != "online-video" and task.get("kind") != "media_asset_registration"):
        return
    # Failure/cancellation may be local while the supplier is still reading.
    # Retain those links only until TTL; never re-submit their delivery record.
    if task.get("status") in ("succeeded", "failed", "cancelled", "interrupted", "timed_out"):
        import asyncio

        await asyncio.to_thread(repository().settle_task, task["id"], task.get("status") == "succeeded")


async def before_task_update(task_id, changes):
    if enabled() and changes.get("status") == "succeeded":
        from app.services.canvas_tasks import get_canvas_task

        task = await get_canvas_task(task_id)
        if task:
            await task_changed({**task, "status": "succeeded"})


def maintenance():
    if enabled():
        repository().maintenance()


async def maintenance_loop():
    import asyncio
    import logging

    from app.services.canvas_tasks import get_canvas_task

    while True:
        try:
            await asyncio.to_thread(maintenance)
            for item in await asyncio.to_thread(repository().active_tasks):
                task = await get_canvas_task(item["task_id"])
                if task:
                    await task_changed(task)
        except asyncio.CancelledError:
            raise
        except Exception:
            logging.getLogger("aistudio.public_media").error("public video maintenance unavailable")
        await asyncio.sleep(60)


def close():
    if repository.cache_info().currsize:
        repository().close()
        repository.cache_clear()
