"""Run the Redis-backed canvas generation worker without serving HTTP."""

from __future__ import annotations

import asyncio
import os

# These must be set before importing main, which evaluates app.config.
os.environ["CANVAS_TASK_WORKER_ENABLED"] = "false"
os.environ["CANVAS_TASK_RECOVERY_ENABLED"] = "true"
os.environ["RUN_BACKGROUND_MAINTENANCE"] = "false"

from main import canvas_task_worker_loop, shutdown_event, startup_event


async def run() -> None:
    await startup_event()
    try:
        await canvas_task_worker_loop()
    finally:
        await shutdown_event()


if __name__ == "__main__":
    asyncio.run(run())
