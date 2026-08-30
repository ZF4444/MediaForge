"""Rebuild authoritative AI rows from the cutover archive after a bad cutover."""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import close_database_pool, database_connection, open_database_pool
from app.services.business_metadata import initialize_business_metadata, list_comfy_workflows, sync_ai_legacy_projection


async def main() -> None:
    await open_database_pool()
    try:
        await asyncio.to_thread(initialize_business_metadata)
        async with database_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT api_providers FROM ai_cutover_archive ORDER BY id DESC LIMIT 1")
                row = await cur.fetchone()
        if not row:
            raise RuntimeError("ai_cutover_archive is missing; restore from a database backup")
        value = row["api_providers"] if isinstance(row, dict) else row[0]
        providers = json.loads(value) if isinstance(value, str) else value
        workflows = await asyncio.to_thread(list_comfy_workflows)
        count = await asyncio.to_thread(sync_ai_legacy_projection, providers, workflows)
        print(json.dumps({"status": "restored", "projected_models": count}, ensure_ascii=False))
    finally:
        await close_database_pool()


if __name__ == "__main__":
    asyncio.run(main())
