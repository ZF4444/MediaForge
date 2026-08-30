"""Centralized encrypted Provider secrets stored in PostgreSQL.

The encryption key is supplied out-of-band through ``APP_SECRET_KEY``. The
database never receives plaintext and nodes no longer need a shared .env file.
"""
from __future__ import annotations

import os
from typing import Optional

from app.core.database import database_connection_sync


def _key() -> str:
    value = str(os.getenv("APP_SECRET_KEY") or "").strip()
    if len(value) < 16:
        raise RuntimeError("APP_SECRET_KEY must be configured with at least 16 characters")
    return value


def initialize_provider_secrets() -> None:
    with database_connection_sync() as conn, conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ai_connection_secrets (
                connection_id TEXT NOT NULL, secret_name TEXT NOT NULL,
                secret_ciphertext BYTEA NOT NULL, version BIGINT NOT NULL DEFAULT 1,
                updated_at BIGINT NOT NULL, PRIMARY KEY(connection_id, secret_name)
            )
        """)


def legacy_provider_secrets_available() -> bool:
    """Return whether the migration-only legacy secret table still exists."""
    if not os.getenv("DATABASE_URL"):
        return False
    with database_connection_sync() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='provider_secrets'")
        return bool(cur.fetchone())


def get_connection_secret(connection_id: str, secret_name: str = "api_key") -> str:
    if not os.getenv("DATABASE_URL") or not os.getenv("APP_SECRET_KEY"):
        return ""
    with database_connection_sync() as conn, conn.cursor() as cur:
        cur.execute("SELECT pgp_sym_decrypt(secret_ciphertext, %s) AS value FROM ai_connection_secrets WHERE connection_id=%s AND secret_name=%s", (_key(), connection_id, secret_name))
        row = cur.fetchone()
    return str(row["value"] if isinstance(row, dict) else row[0]) if row else ""


def set_connection_secret(connection_id: str, secret_name: str, value: Optional[str]) -> None:
    if not os.getenv("DATABASE_URL"):
        raise RuntimeError("DATABASE_URL is required for centralized AI connection secrets")
    with database_connection_sync() as conn, conn.cursor() as cur:
        cur.execute("""INSERT INTO ai_connection_secrets(connection_id,secret_name,secret_ciphertext,updated_at)
            VALUES(%s,%s,pgp_sym_encrypt(%s,%s),EXTRACT(EPOCH FROM clock_timestamp())::bigint)
            ON CONFLICT(connection_id,secret_name) DO UPDATE SET secret_ciphertext=EXCLUDED.secret_ciphertext,updated_at=EXCLUDED.updated_at,version=ai_connection_secrets.version+1""", (connection_id, secret_name, str(value or ""), _key()))


def get_provider_secret(provider_id: str, secret_name: str) -> str:
    if not os.getenv("DATABASE_URL") or not os.getenv("APP_SECRET_KEY"):
        return ""
    with database_connection_sync() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='provider_secrets'")
        if not cur.fetchone():
            return ""
        cur.execute(
            "SELECT pgp_sym_decrypt(secret_ciphertext, %s) AS value FROM provider_secrets WHERE provider_id=%s AND secret_name=%s",
            (_key(), provider_id, secret_name),
        )
        row = cur.fetchone()
    return str(row["value"] if isinstance(row, dict) else row[0]) if row else ""


def set_provider_secret(provider_id: str, secret_name: str, value: Optional[str]) -> None:
    if not os.getenv("DATABASE_URL"):
        raise RuntimeError("DATABASE_URL is required for centralized Provider secrets")
    secret = str(value or "")
    with database_connection_sync() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO provider_secrets(provider_id,secret_name,secret_ciphertext,updated_at)
               VALUES(%s,%s,pgp_sym_encrypt(%s,%s),EXTRACT(EPOCH FROM clock_timestamp())::bigint)
               ON CONFLICT(provider_id,secret_name) DO UPDATE SET
                 secret_ciphertext=EXCLUDED.secret_ciphertext,
                 updated_at=EXCLUDED.updated_at, version=provider_secrets.version+1""",
            (provider_id, secret_name, secret, _key()),
        )
