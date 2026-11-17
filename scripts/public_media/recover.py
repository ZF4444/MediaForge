"""Invalidate restored grants before reopening the download entrance.

Run: uv run python -m scripts.public_media.recover
Only PUBLIC_VIDEO_WRITER_DSN is required; no application/storage credentials.
"""

import os

from psycopg.conninfo import conninfo_to_dict

from app.public_media.repository import Repository


def recover(dsn):
    database = conninfo_to_dict(dsn).get("dbname", "")
    if database in ("postgres", "template0", "template1") or "media" not in database:
        raise ValueError("Use an explicitly named, dedicated media authorization database")
    repo = Repository(dsn)
    try:
        return repo.invalidate_restored_authorizations()
    finally:
        repo.close()


if __name__ == "__main__":
    count = recover(os.environ["PUBLIC_VIDEO_WRITER_DSN"])
    print(f"Global delivery disabled; {count} restored grants invalidated. Review before re-enabling.")
