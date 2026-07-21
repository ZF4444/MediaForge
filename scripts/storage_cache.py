"""Inspect and clean the local MediaForge materialization cache."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from app.config import DATABASE_URL
from app.core.database import close_database_pool, open_database_pool
from app.services.storage import (
    clear_storage_cache,
    clear_storage_cache_locks,
    run_storage_cache_cleanup_once,
    storage_cache_status,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage the local MediaForge storage cache.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status", help="Show cache size, file count, and configured limits.")

    cleanup = commands.add_parser("cleanup", help="Run TTL, orphan, and LRU cleanup once.")
    cleanup.add_argument("--dry-run", action="store_true", help="Report files that would be removed.")
    cleanup.add_argument(
        "--force-orphan-scan",
        action="store_true",
        help="Check cache entries against PostgreSQL even if the scan interval has not elapsed.",
    )

    clear = commands.add_parser("clear", help="Remove all materialized cache files.")
    clear.add_argument("--dry-run", action="store_true", help="Report the effect without deleting files.")
    clear.add_argument("--yes", action="store_true", help="Confirm removal of all materialized cache files.")

    clear_locks = commands.add_parser(
        "clear-locks",
        help="Remove object lock files after all MediaForge workers have stopped.",
    )
    clear_locks.add_argument("--dry-run", action="store_true", help="Report the effect without deleting files.")
    clear_locks.add_argument("--yes", action="store_true", help="Confirm offline removal of object lock files.")
    return parser


def main() -> int:
    args = _parser().parse_args()
    database_open = False
    try:
        if args.command == "status":
            result = storage_cache_status()
        elif args.command == "cleanup":
            if DATABASE_URL:
                open_database_pool()
                database_open = True
            result = run_storage_cache_cleanup_once(
                dry_run=args.dry_run,
                force_orphan_scan=args.force_orphan_scan,
            )
        elif args.command == "clear":
            if not args.dry_run and not args.yes:
                print("Refusing to clear the cache without --yes.", file=sys.stderr)
                return 2
            result = clear_storage_cache(dry_run=args.dry_run)
        else:
            if not args.dry_run and not args.yes:
                print("Refusing to clear lock files without --yes.", file=sys.stderr)
                return 2
            result = clear_storage_cache_locks(dry_run=args.dry_run)
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    finally:
        if database_open:
            close_database_pool()


if __name__ == "__main__":
    raise SystemExit(main())
