"""Migrate legacy Omnilojo usage rows into the protocol-neutral ledger.

This is intentionally a standalone operation rather than application-startup
work. It is safe to run repeatedly: rows already copied are skipped by the
``(protocol, connection_id, upstream_log_id)`` unique key.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

def _value(row, key: str, index: int = 0):
    if isinstance(row, dict):
        return row[key]
    return row[index]


def _pending_count(cur) -> int:
    cur.execute(
        """
        SELECT COUNT(*) AS count
        FROM omnilojo_usage_records legacy
        WHERE NOT EXISTS (
            SELECT 1
            FROM ai_usage_records current
            WHERE current.protocol = 'omnilojo'
              AND current.connection_id = legacy.connection_id
              AND current.upstream_log_id = legacy.upstream_log_id
        )
        """
    )
    return int(_value(cur.fetchone(), "count"))


def migrate(*, dry_run: bool = False) -> dict[str, int | str | bool]:
    from app.services.business_metadata import initialize_business_metadata, metadata_connection

    # This only applies DDL. Historical data is copied below in an explicit
    # operator-invoked transaction.
    initialize_business_metadata()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'omnilojo_usage_records'
            ) AS exists
            """
        )
        if not bool(_value(cur.fetchone(), "exists")):
            return {"status": "source_missing", "dry_run": dry_run, "pending": 0, "inserted": 0}

        pending = _pending_count(cur)
        if dry_run:
            return {"status": "dry_run", "dry_run": True, "pending": pending, "inserted": 0}

        cur.execute(
            """
            INSERT INTO ai_usage_records(
                id, protocol, upstream_log_id, connection_id, model_id, resource_id,
                request_id, upstream_request_id, user_id, org_id, external_username,
                token_name, model, operation, quota, cost_usd, total_money_cny,
                prompt_tokens, completion_tokens, text_input_tokens, image_input_tokens,
                cached_tokens, total_tokens, status, usage_available, pricing_configured,
                created_at, raw_log, inserted_at, updated_at
            )
            SELECT
                legacy.id, 'omnilojo', legacy.upstream_log_id, legacy.connection_id,
                legacy.model_id, legacy.resource_id, legacy.request_id,
                legacy.upstream_request_id, legacy.user_id, legacy.org_id,
                legacy.external_username, legacy.token_name, legacy.model, '',
                legacy.quota, legacy.cost_usd, legacy.total_money_cny,
                legacy.prompt_tokens, legacy.completion_tokens, legacy.prompt_tokens, 0,
                0, legacy.prompt_tokens + legacy.completion_tokens, legacy.status, TRUE,
                TRUE, legacy.created_at, legacy.raw_log, legacy.inserted_at, legacy.updated_at
            FROM omnilojo_usage_records legacy
            ON CONFLICT (protocol, connection_id, upstream_log_id) DO NOTHING
            RETURNING id
            """
        )
        inserted = len(cur.fetchall())
        return {"status": "migrated", "dry_run": False, "pending": pending, "inserted": inserted}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="只统计待迁移数据，不写入")
    args = parser.parse_args()
    result = migrate(dry_run=args.dry_run)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
