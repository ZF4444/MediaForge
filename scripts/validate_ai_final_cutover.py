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


TABLES = ("ai_connections", "ai_models", "ai_resources", "ai_connection_secrets", "ai_task_archive", "smart_canvas_nodes")


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
                for table in TABLES:
                    if table in existing:
                        await cur.execute(f"SELECT COUNT(*) AS count FROM {table}")
                        counts[table] = int((await cur.fetchone())["count"])
                if "ai_models" in existing:
                    await cur.execute("SELECT COUNT(*) AS count FROM ai_models m LEFT JOIN ai_connections c ON c.id=m.connection_id WHERE c.id IS NULL")
                    if int((await cur.fetchone())["count"]): failures.append("orphan ai_models rows")
                if "ai_resources" in existing:
                    await cur.execute("SELECT COUNT(*) AS count FROM ai_resources r LEFT JOIN ai_connections c ON c.id=r.connection_id WHERE c.id IS NULL")
                    if int((await cur.fetchone())["count"]): failures.append("orphan ai_resources rows")
                if "ai_task_archive" in existing:
                    await cur.execute("SELECT COUNT(*) AS count FROM ai_task_archive WHERE status <> 'failed' AND connection_id='' AND model_id='' AND resource_id=''")
                    if int((await cur.fetchone())["count"]): failures.append("incomplete historical task mappings")
                    await cur.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_task_archive' AND column_name IN ('provider_id','model')")
                    if int((await cur.fetchone())["count"]): failures.append("legacy ai_task_archive Provider columns still exist")
                if "smart_canvas_nodes" in existing:
                    await cur.execute("SELECT data_json FROM smart_canvas_nodes")
                    unresolved_nodes = 0
                    for row in await cur.fetchall():
                        value = row["data_json"]
                        text = str(value or "")
                        if any(token in text for token in ('"provider_id"', '"provider"')) and not any(token in text for token in ('"connection_id"', '"model_id"', '"resource_id"')):
                            unresolved_nodes += 1
                    if unresolved_nodes:
                        failures.append(f"unresolved canvas node mappings: {unresolved_nodes}")
                await cur.execute("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema='public' AND table_name='ai_legacy_mappings'")
                if int((await cur.fetchone())["count"]): failures.append("legacy ai_legacy_mappings table still exists")
                await cur.execute("SELECT COUNT(*) AS count FROM app_settings WHERE key='api_providers'")
                legacy_setting = int((await cur.fetchone())["count"])
                if legacy_setting:
                    failures.append("legacy app_settings.api_providers still exists")
                await cur.execute("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema='public' AND table_name='provider_secrets'")
                if int((await cur.fetchone())["count"]):
                    failures.append("legacy provider_secrets table still exists")
                await cur.execute("SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='omnilojo_usage_records' AND column_name='provider_id'")
                if int((await cur.fetchone())["count"]):
                    failures.append("legacy omnilojo_usage_records.provider_id column still exists")
        compat = os.getenv("AI_PROVIDER_COMPAT", "0").strip().lower()
        if compat in {"1", "true", "yes", "on"}:
            failures.append("AI_PROVIDER_COMPAT is enabled")
        # Source-level guard: the final release must not re-expose the removed
        # Provider HTTP surface or execute SQL against the legacy secret table.
        project_root = Path(__file__).resolve().parents[1]
        main_source = (project_root / "main.py").read_text(encoding="utf-8")
        secret_source = (project_root / "app/services/connection_secrets.py").read_text(encoding="utf-8")
        if '"/api/providers"' in main_source and "@app." in main_source:
            for line in main_source.splitlines():
                if line.lstrip().startswith("@app.") and '"/api/providers' in line:
                    failures.append("legacy Provider route decorator present in main.py")
                    break
        if "FROM provider_secrets" in secret_source or "INTO provider_secrets" in secret_source:
            failures.append("runtime provider_secrets SQL present")
        print({"tables": counts, "legacy_app_setting_present": bool(legacy_setting), "compat": compat, "failures": failures})
        return 1 if failures else 0
    finally:
        await close_database_pool()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(validate()))
