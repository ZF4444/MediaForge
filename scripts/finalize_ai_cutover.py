"""Apply or roll back the final AI connection cutover.

The default mode is a read-only preflight. ``--apply`` performs one
transaction: archive the legacy setting, migrate task/canvas references to
stable IDs, copy encrypted secrets to ``ai_connection_secrets`` and remove
``app_settings.api_providers``. ``--rollback`` restores the archived setting.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.business_metadata import initialize_business_metadata, metadata_connection
from app.core.database import open_database_pool, close_database_pool


def _rewrite(value, model_map, resource_map):
    if isinstance(value, list):
        return [_rewrite(item, model_map, resource_map) for item in value]
    if not isinstance(value, dict):
        return value
    result = {key: _rewrite(item, model_map, resource_map) for key, item in value.items()}
    provider = str(result.get("provider_id") or result.get("providerId") or "").strip().lower()
    model = str(result.get("model") or result.get("model_id") or "").strip()
    if provider and model:
        mapped = model_map.get((provider, model))
        if mapped:
            result["model_id"] = mapped
            result.pop("provider_id", None)
            result.pop("providerId", None)
    resource = str(result.get("resource_id") or "").strip()
    if resource and resource in resource_map:
        result["resource_id"] = resource_map[resource]
    return result


def _contains_secret(value) -> bool:
    if isinstance(value, list):
        return any(_contains_secret(item) for item in value)
    if not isinstance(value, dict):
        return False
    secret_names = {"api_key", "apikey", "secret", "secret_key", "access_key", "access_key_id", "secret_access_key", "token"}
    for key, item in value.items():
        normalized = str(key).replace("-", "_").lower()
        if normalized in secret_names and item:
            return True
        if normalized == "raw" and item:
            return True
        if _contains_secret(item):
            return True
    return False


def apply() -> dict:
    initialize_business_metadata()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("CREATE TABLE IF NOT EXISTS ai_cutover_archive (id BIGSERIAL PRIMARY KEY, archived_at BIGINT NOT NULL, api_providers JSONB NOT NULL)")
        cur.execute("SELECT value_json FROM app_settings WHERE key='api_providers' FOR UPDATE")
        setting = cur.fetchone()
        if not setting:
            return {"status": "already_cut_over", "tasks": 0, "canvases": 0}
        providers = setting["value_json"] if isinstance(setting, dict) else setting[0]
        if _contains_secret(providers) and len(str(os.getenv("APP_SECRET_KEY") or "")) < 16:
            raise RuntimeError("legacy configuration contains secrets; set APP_SECRET_KEY (at least 16 characters) before --apply")
        cur.execute("INSERT INTO ai_cutover_archive(archived_at,api_providers) VALUES(%s,%s)", (int(time.time() * 1000), json.dumps(providers, ensure_ascii=False)))

        cur.execute("SELECT id,connection_id,upstream_model FROM ai_models")
        model_map = {}
        model_rows = cur.fetchall()
        cur.execute("SELECT id FROM ai_connections WHERE enabled=TRUE")
        connection_count = len(cur.fetchall())
        cur.execute("SELECT id FROM ai_resources WHERE enabled=TRUE")
        resource_count = len(cur.fetchall())
        if not connection_count or (not model_rows and not resource_count):
            raise RuntimeError("authoritative AI tables are empty; run sync-legacy/projection before --apply")
        for row in model_rows:
            provider = str(row["connection_id"] or "").removeprefix("legacy:").lower()
            model_map[(provider, str(row["upstream_model"]))] = row["id"]
        cur.execute("SELECT id,connection_id,kind,name FROM ai_resources")
        resource_map = {str(row["id"]): str(row["id"]) for row in cur.fetchall()}

        # Move encrypted secrets without ever materializing plaintext in the
        # migration process. The legacy table is optional on fresh installs.
        cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='provider_secrets'")
        if cur.fetchone():
            cur.execute("""INSERT INTO ai_connection_secrets(connection_id,secret_name,secret_ciphertext,version,updated_at)
                SELECT 'legacy:' || provider_id, secret_name,
                       pgp_sym_encrypt(pgp_sym_decrypt(secret_ciphertext, %s), %s), version,
                       updated_at
                FROM provider_secrets
                ON CONFLICT(connection_id,secret_name) DO UPDATE SET
                  secret_ciphertext=EXCLUDED.secret_ciphertext, version=EXCLUDED.version, updated_at=EXCLUDED.updated_at""",
                (os.environ["APP_SECRET_KEY"], os.environ["APP_SECRET_KEY"]))
            cur.execute("DROP TABLE provider_secrets")

        cur.execute("ALTER TABLE ai_task_archive ADD COLUMN IF NOT EXISTS connection_id TEXT NOT NULL DEFAULT ''")
        cur.execute("ALTER TABLE ai_task_archive ADD COLUMN IF NOT EXISTS model_id TEXT NOT NULL DEFAULT ''")
        cur.execute("ALTER TABLE ai_task_archive ADD COLUMN IF NOT EXISTS resource_id TEXT NOT NULL DEFAULT ''")
        cur.execute("SELECT task_id,provider_id,model,payload_json FROM ai_task_archive")
        tasks = 0
        for row in cur.fetchall():
            provider = str(row["provider_id"] or "").lower()
            model = str(row["model"] or "")
            model_id = model_map.get((provider, model), "")
            connection_id = f"legacy:{provider}" if model_id else ""
            payload = _rewrite(row["payload_json"] or {}, model_map, resource_map)
            cur.execute("UPDATE ai_task_archive SET connection_id=%s,model_id=%s,payload_json=%s WHERE task_id=%s", (connection_id, model_id, json.dumps(payload, ensure_ascii=False), row["task_id"]))
            tasks += 1

        cur.execute("SELECT id,data_json FROM smart_canvas_nodes")
        canvases = 0
        for row in cur.fetchall():
            rewritten = _rewrite(row["data_json"] or {}, model_map, resource_map)
            cur.execute("UPDATE smart_canvas_nodes SET data_json=%s,updated_at=%s WHERE id=%s", (json.dumps(rewritten, ensure_ascii=False), int(time.time() * 1000), row["id"]))
            canvases += 1
        cur.execute("DELETE FROM app_settings WHERE key='api_providers'")
    return {"status": "applied", "tasks": tasks, "canvas_nodes": canvases}


def rollback() -> dict:
    initialize_business_metadata()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT api_providers FROM ai_cutover_archive ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if not row:
            raise RuntimeError("no ai_cutover_archive row available")
        value = row["api_providers"] if isinstance(row, dict) else row[0]
        cur.execute("INSERT INTO app_settings(key,value_json,created_at,updated_at,version) VALUES('api_providers',%s,%s,%s,1) ON CONFLICT(key) DO UPDATE SET value_json=EXCLUDED.value_json,updated_at=EXCLUDED.updated_at,version=app_settings.version+1", (json.dumps(value, ensure_ascii=False), int(time.time() * 1000), int(time.time() * 1000)))
    return {"status": "rolled_back"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    if args.apply and args.rollback:
        parser.error("--apply and --rollback are mutually exclusive")
    async def run():
        if not args.apply and not args.rollback:
            print("preflight: use scripts/validate_ai_final_cutover.py; no changes made")
            return
        await open_database_pool()
        try:
            result = await asyncio.to_thread( apply if args.apply else rollback )
            print(json.dumps(result, ensure_ascii=False))
        finally:
            await close_database_pool()
    asyncio.run(run())
