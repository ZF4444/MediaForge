"""Manually normalize RunningHub resources in PostgreSQL.

Usage:
    .venv/bin/python scripts/dedupe_runninghub_resources.py
"""
from __future__ import annotations

import json
import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.business_metadata import dedupe_runninghub_resources, initialize_business_metadata
from app.core.database import open_database_pool, close_database_pool


async def main() -> None:
    await open_database_pool()
    try:
        # The metadata helpers use the synchronous bridge, which must run off
        # the event-loop thread while the async pool is active.
        await asyncio.to_thread(initialize_business_metadata)
        removed = await asyncio.to_thread(dedupe_runninghub_resources)
        print(json.dumps({"status": "ok", "removed_duplicates": removed, "format": "runninghub_app.v2", "identity": "settings.app_id"}, ensure_ascii=False))
    finally:
        await close_database_pool()


if __name__ == "__main__":
    asyncio.run(main())
