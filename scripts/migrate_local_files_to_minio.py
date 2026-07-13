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
from app.services.storage_migration import run_local_storage_migration


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Migrate all legacy assets/* files to MinIO and rewrite local metadata to file_id references."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scan all files and metadata without writing MinIO, PostgreSQL, or JSON files.",
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


def render_progress(current: int, total: int, result: dict) -> None:
    width = 30
    ratio = current / total if total else 1.0
    filled = min(width, int(width * ratio))
    bar = "#" * filled + "-" * (width - filled)
    status = str(result.get("status") or "unknown")
    path = str(result.get("local_path") or result.get("legacy_url") or "")
    if len(path) > 48:
        path = "..." + path[-45:]
    sys.stderr.write(f"\r[{bar}] {current}/{total} {ratio * 100:6.2f}% {status:8} {path:<48}")
    if current >= total:
        sys.stderr.write("\n")
    sys.stderr.flush()


def report_total(total: int) -> None:
    print(f"Found {total} file(s) to process.", file=sys.stderr)
    if total == 0:
        print("No local media files require processing.", file=sys.stderr)


def main() -> int:
    args = parse_args()
    ensure_environment()
    print("Scanning local media and calculating migration total...", file=sys.stderr)
    summary = run_local_storage_migration(
        dry_run=bool(args.dry_run),
        progress_callback=render_progress,
        total_callback=report_total,
    )
    report_path = default_report_path()
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
        "warnings": summary.get("warnings", 0),
        "metadata": summary.get("metadata", {}),
        "report": report_path,
    }, ensure_ascii=False, indent=2))
    return 1 if int(summary.get("errors") or 0) > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
