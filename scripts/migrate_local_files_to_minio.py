#!/usr/bin/env python3
"""Migrate legacy local media files into MinIO and rewrite metadata refs."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.services.storage import metadata_db_enabled, storage_enabled
from app.services.storage_migration import LOCAL_CATEGORY_ROOTS, run_local_storage_migration


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate local assets/* files into MinIO and rewrite file_id metadata refs.")
    parser.add_argument("--dry-run", action="store_true", help="Only scan and plan migration without writing MinIO/DB/JSON.")
    parser.add_argument(
        "--category",
        action="append",
        choices=sorted(LOCAL_CATEGORY_ROOTS.keys()),
        help="Limit migration to one or more categories.",
    )
    parser.add_argument("--limit", type=int, default=0, help="Only process the first N files after scan ordering.")
    parser.add_argument(
        "--skip-metadata-rewrite",
        action="store_true",
        help="Only migrate binary files, do not rewrite history/assets/canvas/conversation JSON refs.",
    )
    parser.add_argument(
        "--report",
        default="",
        help="Optional path to save full JSON report. Default: scripts/reports/storage-migration-<timestamp>.json",
    )
    return parser.parse_args()


def ensure_environment() -> None:
    if not storage_enabled():
        raise SystemExit("MinIO is not configured. Check MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY.")
    if not metadata_db_enabled():
        raise SystemExit("PostgreSQL is not configured. Check DATABASE_URL.")


def default_report_path() -> str:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    folder = os.path.join("scripts", "reports")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, f"storage-migration-{stamp}.json")


def main() -> int:
    args = parse_args()
    ensure_environment()
    summary = run_local_storage_migration(
        dry_run=bool(args.dry_run),
        categories=set(args.category or []),
        limit=max(0, int(args.limit or 0)),
        rewrite_metadata=not args.skip_metadata_rewrite,
    )
    report_path = args.report or default_report_path()
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(json.dumps({
        "dry_run": bool(args.dry_run),
        "scanned": summary.get("scanned", 0),
        "migrated": summary.get("migrated", 0),
        "repaired": summary.get("repaired", 0),
        "planned": summary.get("planned", 0),
        "skipped": summary.get("skipped", 0),
        "errors": summary.get("errors", 0),
        "metadata": summary.get("metadata", {}),
        "report": report_path,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
