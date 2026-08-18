"""Optional PostgreSQL checkpointer factory; business tables remain authoritative."""
from __future__ import annotations
from contextlib import contextmanager
from app.config import DATABASE_URL

@contextmanager
def create_checkpointer():
    if not DATABASE_URL: raise RuntimeError("DATABASE_URL is required for the Agent checkpointer")
    try:
        from langgraph.checkpoint.postgres import PostgresSaver
    except ImportError as exc:
        raise RuntimeError("langgraph-checkpoint-postgres is not installed") from exc
    with PostgresSaver.from_conn_string(DATABASE_URL) as saver:
        saver.setup()
        yield saver
