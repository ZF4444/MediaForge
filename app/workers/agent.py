"""Run Canvas Agent command and durable event workers without serving HTTP."""
from __future__ import annotations

import asyncio
import os

os.environ["CANVAS_TASK_WORKER_ENABLED"] = "false"
os.environ["CANVAS_TASK_RECOVERY_ENABLED"] = "false"
os.environ["AGENT_COMMAND_WORKER_ENABLED"] = "false"
os.environ["RUN_BACKGROUND_MAINTENANCE"] = "false"

from app.services.canvas_agent.event_bus import agent_event_outbox_loop
from app.workers.agent_commands import agent_command_worker_loop
from main import shutdown_event, startup_event


async def run() -> None:
    await startup_event()
    try:
        await asyncio.gather(agent_command_worker_loop(), agent_event_outbox_loop())
    finally:
        await shutdown_event()


if __name__ == "__main__":
    asyncio.run(run())
