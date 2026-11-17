"""Real permission and repeat-initialization checks; never use development data."""

import asyncio
import json
import os
import secrets
import subprocess
import sys
from dataclasses import replace

import httpx
import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from app.public_media.bootstrap import BootstrapError, migrate
from app.public_media.config import Settings, Unavailable
from app.public_media.gateway import create_app

from .conftest import source
from .test_network import gateway, issue


def test_default_off_gateway_needs_no_credentials():
    with TestClient(create_app(Settings())) as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/health/ready").json() == {"ready": True, "enabled": False}


def test_compose_bootstrap_does_not_reload_legacy_credentials(tmp_path, monkeypatch):
    import main

    config = tmp_path / "config"
    config.mkdir()
    (config / ".env").write_text("PUBLIC_VIDEO_VALIDATOR_DSN=legacy-validator-sentinel\n")
    monkeypatch.setattr(main, "__file__", str(tmp_path / "main.py"))
    monkeypatch.delenv("PUBLIC_VIDEO_VALIDATOR_DSN", raising=False)
    monkeypatch.setenv("LOAD_BOOTSTRAP_ENV", "false")
    main._load_bootstrap_env()
    assert "PUBLIC_VIDEO_VALIDATOR_DSN" not in os.environ
    monkeypatch.setenv("LOAD_BOOTSTRAP_ENV", "true")
    main._load_bootstrap_env()
    assert os.environ["PUBLIC_VIDEO_VALIDATOR_DSN"] == "legacy-validator-sentinel"


@pytest.mark.parametrize("available", [True, False])
def test_api_readiness_includes_authorization_dependency_when_enabled(monkeypatch, available):
    import main
    from app.public_media import lifecycle

    monkeypatch.setenv("PUBLIC_VIDEO_ENABLED", "true")
    monkeypatch.setattr(
        main, "storage_readiness_status", lambda: {"ready": True, "components": {"postgres": "ok", "minio": "ok"}}
    )

    async def run_io(function, *args):
        return function(*args)

    async def redis_ready():
        return {"ready": True, "component": "ok"}

    def authorization_ready():
        if not available:
            raise Unavailable("private connection details must not be returned")

    monkeypatch.setattr(main, "run_storage_io", run_io)
    monkeypatch.setattr(main, "redis_readiness_status", redis_ready)
    monkeypatch.setattr(lifecycle, "check_ready", authorization_ready)
    response = asyncio.run(main.health_ready())
    assert response.status_code == (200 if available else 503)
    assert json.loads(response.body)["components"]["media_authorization"] == ("ok" if available else "unavailable")
    assert b"private connection details" not in response.body


def test_readiness_uses_restricted_function_and_rejects_wrong_role(real):
    assert real["writer"].ready("writer")
    assert real["validator"].ready("validator")
    with pytest.raises(Unavailable):
        real["writer"].ready("validator")
    with pytest.raises(Unavailable):
        with TestClient(create_app(replace(real["settings"], validator_dsn=real["settings"].writer_dsn))):
            pass
    row = source(real)
    _, _, path = issue(real, row)
    with gateway(real) as gw:
        assert httpx.get(gw["base"] + "/health/ready").status_code == 200
        with psycopg.connect(real["admin_dsn"], autocommit=True) as conn:
            conn.execute("DELETE FROM media.schema_version WHERE version=3")
        try:
            assert httpx.get(gw["base"] + "/health/live").status_code == 200
            assert httpx.get(gw["base"] + "/health/ready").status_code == 503
            # Startup checks do not replace per-download online authorization.
            assert httpx.get(gw["base"] + path).status_code == 200
        finally:
            with psycopg.connect(real["admin_dsn"], autocommit=True) as conn:
                conn.execute("INSERT INTO media.schema_version(version) VALUES(3)")


def test_reinitialize_does_not_rotate_passwords_or_revive_grants(real):
    row = source(real)
    grant, token, _ = issue(real, row)
    real["writer"].set_policy("file", row["file_id"], False)
    writer = conninfo_to_dict(real["settings"].writer_dsn)["password"]
    validator = conninfo_to_dict(real["settings"].validator_dsn)["password"]
    migrate(real["admin_dsn"], writer, validator)
    assert not real["validator"].admit(grant["id"], "0" * 64, "HEAD")["allowed"]
    with pytest.raises(psycopg.OperationalError):
        migrate(real["admin_dsn"], secrets.token_hex(24), secrets.token_hex(24))
    assert real["writer"].ready("writer")
    assert real["validator"].ready("validator")
    assert any(p["scope"] == "file" and not p["enabled"] for p in real["writer"].policies())
    with psycopg.connect(real["admin_dsn"], autocommit=True) as conn:
        conn.execute("ALTER ROLE media_validator NOLOGIN")
        try:
            with pytest.raises(BootstrapError, match="disabled"):
                migrate(real["admin_dsn"], writer, validator)
            assert not conn.execute("SELECT rolcanlogin FROM pg_roles WHERE rolname='media_validator'").fetchone()[0]
        finally:
            conn.execute("ALTER ROLE media_validator LOGIN")


def test_unified_initializer_handles_existing_cluster_and_preserves_state(real):
    business_dsn = make_conninfo(real["admin_dsn"], dbname="media_business_init_test")
    admin_dsn = make_conninfo(real["admin_dsn"], dbname="postgres")
    writer_dsn = make_conninfo(real["settings"].writer_dsn, dbname="media_auth_init_test")
    validator_dsn = make_conninfo(real["settings"].validator_dsn, dbname="media_auth_init_test")
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        conn.execute("CREATE DATABASE media_business_init_test")
    reader_secret = secrets.token_hex(24)
    env = {
        **os.environ,
        "DATABASE_URL": business_dsn,
        "PUBLIC_VIDEO_ADMIN_DSN": admin_dsn,
        "PUBLIC_VIDEO_WRITER_DSN": writer_dsn,
        "PUBLIC_VIDEO_VALIDATOR_DSN": validator_dsn,
        "PUBLIC_VIDEO_ENABLED": "false",
        "MINIO_ENDPOINT": real["settings"].endpoint,
        "MINIO_ACCESS_KEY": real["storage_admin_key"],
        "MINIO_SECRET_KEY": real["storage_admin_secret"],
        "MINIO_SECURE": "false",
        "MINIO_BUCKET_PRIVATE": "media-test-versioned",
        "MINIO_BUCKET_PUBLIC": "media-test-private",
        "MINIO_BUCKET_TEMP": "media-test-plain",
        "PUBLIC_VIDEO_MINIO_ENDPOINT": real["settings"].endpoint,
        "PUBLIC_VIDEO_MINIO_ACCESS_KEY": "media_init_reader",
        "PUBLIC_VIDEO_MINIO_SECRET_KEY": reader_secret,
        "PUBLIC_VIDEO_MINIO_SECURE": "false",
        "PUBLIC_VIDEO_PREFIXES": ",".join(real["settings"].prefixes),
    }
    for attempt in range(2):
        result = subprocess.run(
            [sys.executable, "-m", "app.initialize", "--public-media"],
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        assert reader_secret not in result.stdout + result.stderr
        with psycopg.connect(make_conninfo(admin_dsn, dbname="media_auth_init_test"), autocommit=True) as conn:
            assert conn.execute("SELECT max(version) FROM media.schema_version").fetchone()[0] == 3
            enabled = conn.execute(
                "SELECT enabled FROM media.media_policy_state WHERE scope='global' AND key='*'"
            ).fetchone()[0]
            assert enabled == bool(attempt)
            conn.execute("UPDATE media.media_policy_state SET enabled=true WHERE scope='global' AND key='*'")
    # A disabled reader must remain disabled even after an explicit initializer.
    real["management"].user_disable("media_init_reader")
    result = subprocess.run(
        [sys.executable, "-m", "app.initialize", "--public-media"], env=env, capture_output=True, text=True, timeout=30
    )
    assert result.returncode != 0
    assert "initialization failed" in result.stderr
    assert reader_secret not in result.stderr


def test_v2_upgrade_retires_legacy_policies_without_reviving_links(real):
    from app.public_media.contracts import token_digest

    row = source(real)
    grant, token, _ = issue(real, row)
    with psycopg.connect(real["admin_dsn"]) as conn:
        conn.execute("DELETE FROM media.schema_version WHERE version=3")
        conn.execute(
            "INSERT INTO media.media_policy_state(scope,key,enabled) VALUES('user','alice',false),('provider','supplier',false)"
        )
    writer = conninfo_to_dict(real["settings"].writer_dsn)["password"]
    validator = conninfo_to_dict(real["settings"].validator_dsn)["password"]
    migrate(real["admin_dsn"], writer, validator)
    assert real["writer"].ready("writer")
    assert real["validator"].ready("validator")
    assert not real["validator"].admit(grant["id"], token_digest(token), "HEAD")["allowed"]
    assert [p["scope"] for p in real["writer"].policies()] == ["global"]
    with psycopg.connect(real["admin_dsn"]) as conn:
        assert (
            conn.execute("SELECT count(*) FROM media.media_policy_state WHERE scope IN ('user','provider')").fetchone()[
                0
            ]
            == 0
        )
    new_source = source(real, task_id="post-upgrade-task")
    newer, new_token_value, _ = issue(real, new_source)
    assert real["validator"].admit(newer["id"], token_digest(new_token_value), "HEAD")["allowed"]
    migrate(real["admin_dsn"], writer, validator)
    assert real["validator"].admit(newer["id"], token_digest(new_token_value), "HEAD")["allowed"]
