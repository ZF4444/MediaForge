"""Validate prerequisites for removing the Provider compatibility layer.

This script is read-only. It exits non-zero when production still contains
legacy configuration/task references or when the authoritative AI tables are
missing/inconsistent.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import database_connection, open_database_pool, close_database_pool


TABLES = ("ai_connections", "ai_models", "ai_resources", "ai_legacy_mappings", "ai_connection_secrets")


async def validate() -> int:
    await open_database_pool()
    try:
        failures: list[str] = []
        async with database_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY(%s)", (list(TABLES),))
                existing = {row["table_name"] for row in await cur.fetchall()}
                missing = [table for table in TABLES if table not in existing]
                if missing:
                    failures.append(f"missing tables: {', '.join(missing)}")
                counts = {}
                for table in TABLES[:-1]:
                    if table in existing:
                        await cur.execute(f"SELECT COUNT(*) AS count FROM {table}")
                        counts[table] = int((await cur.fetchone())["count"])
                if "ai_models" in existing:
                    await cur.execute("SELECT COUNT(*) AS count FROM ai_models m LEFT JOIN ai_connections c ON c.id=m.connection_id WHERE c.id IS NULL")
                    if int((await cur.fetchone())["count"]): failures.append("orphan ai_models rows")
                if "ai_resources" in existing:
                    await cur.execute("SELECT COUNT(*) AS count FROM ai_resources r LEFT JOIN ai_connections c ON c.id=r.connection_id WHERE c.id IS NULL")
                    if int((await cur.fetchone())["count"]): failures.append("orphan ai_resources rows")
                if "ai_legacy_mappings" in existing:
                    await cur.execute("SELECT COUNT(*) AS count FROM ai_legacy_mappings WHERE status='active' AND (resource_id='' OR legacy_provider_id='')")
                    if int((await cur.fetchone())["count"]): failures.append("incomplete active legacy mappings")
                await cur.execute("SELECT COUNT(*) AS count FROM app_settings WHERE key='api_providers'")
                legacy_setting = int((await cur.fetchone())["count"])
                if legacy_setting:
                    failures.append("legacy app_settings.api_providers still exists")
                await cur.execute("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema='public' AND table_name='provider_secrets'")
                if int((await cur.fetchone())["count"]):
                    failures.append("legacy provider_secrets table still exists")
        compat = os.getenv("AI_PROVIDER_COMPAT", "0").strip().lower()
        if compat in {"1", "true", "yes", "on"}:
            failures.append("AI_PROVIDER_COMPAT is enabled")
        print({"tables": counts, "legacy_app_setting_present": bool(legacy_setting), "compat": compat, "failures": failures})
        return 1 if failures else 0
    finally:
        await close_database_pool()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(validate()))
