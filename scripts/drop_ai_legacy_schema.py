"""Physically remove the retired Provider schema after cutover.

The operation is opt-in and transactional. Historical task/provider values are
kept in ``ai_task_archive`` and the archived configuration is retained in
``ai_cutover_archive`` so an operator can restore data before a backup expires.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import close_database_pool, database_connection, open_database_pool


async def apply() -> dict[str, object]:
    await open_database_pool()
    try:
        async with database_connection() as conn:
            async with conn.transaction():
                async with conn.cursor() as cur:
                    await cur.execute("""
                        CREATE TABLE IF NOT EXISTS ai_legacy_schema_archive (
                            id BIGSERIAL PRIMARY KEY,
                            archived_at BIGINT NOT NULL,
                            provider_secrets JSONB,
                            api_providers JSONB,
                            legacy_mappings JSONB,
                            usage_provider_ids JSONB,
                            task_provider_fields JSONB
                        )
                    """)
                    await cur.execute("ALTER TABLE ai_legacy_schema_archive ADD COLUMN IF NOT EXISTS usage_provider_ids JSONB")
                    await cur.execute("ALTER TABLE ai_legacy_schema_archive ADD COLUMN IF NOT EXISTS task_provider_fields JSONB")
                    await cur.execute("SELECT to_regclass('public.provider_secrets') AS name")
                    has_secrets = bool((await cur.fetchone())["name"])
                    await cur.execute("SELECT value_json FROM app_settings WHERE key='api_providers'")
                    setting = await cur.fetchone()
                    await cur.execute("SELECT to_regclass('public.ai_legacy_mappings') AS name")
                    has_mappings = bool((await cur.fetchone())["name"])
                    legacy_rows = []
                    if has_mappings:
                        await cur.execute("SELECT row_to_json(x) AS value FROM ai_legacy_mappings x")
                        legacy_rows = [row["value"] for row in await cur.fetchall()]
                    secrets = []
                    if has_secrets:
                        # Ciphertext is archived, never plaintext.
                        await cur.execute("SELECT row_to_json(x) AS value FROM provider_secrets x")
                        secrets = [row["value"] for row in await cur.fetchall()]
                    if setting or secrets or legacy_rows:
                        await cur.execute(
                            "INSERT INTO ai_legacy_schema_archive(archived_at,provider_secrets,api_providers,legacy_mappings) VALUES(%s,%s,%s,%s)",
                            (int(time.time() * 1000), json.dumps(secrets), json.dumps(setting["value_json"] if setting else None, ensure_ascii=False), json.dumps(legacy_rows, ensure_ascii=False)),
                        )
                    await cur.execute("DELETE FROM app_settings WHERE key='api_providers'")
                    await cur.execute("DROP TABLE IF EXISTS provider_secrets")
                    await cur.execute("DROP TABLE IF EXISTS ai_legacy_mappings")
                    await cur.execute("DROP TABLE IF EXISTS model_protocols")
                    await cur.execute("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='omnilojo_usage_records' AND column_name='provider_id'")
                    if await cur.fetchone():
                        await cur.execute("SELECT row_to_json(x) AS value FROM omnilojo_usage_records x WHERE provider_id<>''")
                        usage_rows = [row["value"] for row in await cur.fetchall()]
                        if usage_rows:
                            await cur.execute(
                                "INSERT INTO ai_legacy_schema_archive(archived_at,usage_provider_ids) VALUES(%s,%s)",
                                (int(time.time() * 1000), json.dumps(usage_rows, ensure_ascii=False)),
                            )
                        await cur.execute("UPDATE omnilojo_usage_records SET connection_id=provider_id WHERE connection_id='' AND provider_id<>''")
                        await cur.execute("""DO $$
                        DECLARE constraint_name TEXT;
                        BEGIN
                          SELECT conname INTO constraint_name
                          FROM pg_constraint
                          WHERE conrelid='omnilojo_usage_records'::regclass
                            AND contype='u' AND pg_get_constraintdef(oid) LIKE '%(provider_id, upstream_log_id)%';
                          IF constraint_name IS NOT NULL THEN
                            EXECUTE format('ALTER TABLE omnilojo_usage_records DROP CONSTRAINT %I', constraint_name);
                          END IF;
                          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='omnilojo_usage_records'::regclass AND conname='omnilojo_usage_connection_log_key') THEN
                            ALTER TABLE omnilojo_usage_records ADD CONSTRAINT omnilojo_usage_connection_log_key UNIQUE(connection_id, upstream_log_id);
                          END IF;
                        END $$""")
                        await cur.execute("ALTER TABLE omnilojo_usage_records DROP COLUMN provider_id")
                    await cur.execute("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_task_archive' AND column_name='provider_id'")
                    if await cur.fetchone():
                        await cur.execute("SELECT task_id,provider_id,model FROM ai_task_archive WHERE provider_id<>'' OR model<>''")
                        task_rows = [dict(row) for row in await cur.fetchall()]
                        if task_rows:
                            await cur.execute(
                                "INSERT INTO ai_legacy_schema_archive(archived_at,task_provider_fields) VALUES(%s,%s)",
                                (int(time.time() * 1000), json.dumps(task_rows, ensure_ascii=False)),
                            )
                        await cur.execute("ALTER TABLE ai_task_archive DROP COLUMN provider_id")
                        await cur.execute("ALTER TABLE ai_task_archive DROP COLUMN model")
                    return {"status": "applied", "provider_secrets": has_secrets, "ai_legacy_mappings": has_mappings, "api_providers": bool(setting)}
    finally:
        await close_database_pool()


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="perform the transactional cleanup")
    args = parser.parse_args()
    if not args.apply:
        print("preflight: pass --apply to archive and remove legacy schema")
        return
    print(json.dumps(await apply(), ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
