"""Opt-in real PostgreSQL check: MEDIAFORGE_TEST_DOCKER_HBA=1 pytest this file."""

import os
import subprocess
import time
from pathlib import Path
from uuid import uuid4

import pytest


@pytest.mark.skipif(
    os.getenv("MEDIAFORGE_TEST_DOCKER_HBA") != "1", reason="Requires Docker and cached postgres:16-bookworm"
)
def test_production_hba_on_new_and_existing_database():
    name = "mediaforge-hba-test-" + uuid4().hex[:12]
    volume = name + "-data"
    hba = Path(__file__).resolve().parents[1] / "config/deploy/public-media/pg_hba.conf"

    def docker(*args, **kwargs):
        return subprocess.run(["docker", *args], capture_output=True, text=True, timeout=60, **kwargs)

    def psql(user="hba_admin", database="postgres", host=None, password="test-password", sql="SELECT 1"):
        args = [
            "exec",
            "-i",
            "-e",
            "PGPASSWORD=" + password,
            name,
            "psql",
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            user,
            "-d",
            database,
        ]
        if host:
            args += ["-h", host]
        return docker(*args, input=sql)

    def ready():
        for _ in range(150):
            if psql(host="127.0.0.1").returncode == 0:
                return
            time.sleep(0.2)
        pytest.fail("Isolated PostgreSQL did not become ready")

    try:
        result = docker(
            "run",
            "-d",
            "--name",
            name,
            "--network",
            "none",
            "-e",
            "POSTGRES_USER=hba_admin",
            "-e",
            "POSTGRES_PASSWORD=test-password",
            "-v",
            volume + ":/var/lib/postgresql/data",
            "--mount",
            f"type=bind,source={hba},target=/etc/media-hba.conf,readonly",
            "postgres:16-bookworm",
            "postgres",
            "-c",
            "hba_file=/etc/media-hba.conf",
        )
        assert result.returncode == 0, "Cannot start isolated PostgreSQL test container"
        ready()
        result = psql(
            sql="""
            CREATE DATABASE media_auth;
            CREATE DATABASE business;
            CREATE ROLE business_user LOGIN PASSWORD 'test-password';
            CREATE ROLE media_writer LOGIN PASSWORD 'test-password';
            CREATE ROLE media_validator LOGIN PASSWORD 'test-password';
        """
        )
        assert result.returncode == 0, "Could not prepare isolated test roles"
        for restarted in (False, True):
            if restarted:
                assert docker("restart", name).returncode == 0
                ready()
            assert psql(sql="SHOW hba_file").stdout.strip().find("/etc/media-hba.conf") >= 0
            assert (
                psql(sql="SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL")
                .stdout.splitlines()[2]
                .strip()
                == "0"
            )
            for host in ("127.0.0.1", "::1"):
                assert psql("business_user", "business", host).returncode == 0
                assert psql("business_user", "business", host, password="wrong").returncode != 0
                for role in ("media_writer", "media_validator"):
                    assert psql(role, "media_auth", host).returncode == 0
                    assert psql(role, "media_auth", host, password="wrong").returncode != 0
                    for db in ("business", "postgres"):
                        result = psql(role, db, host)
                        assert result.returncode != 0 and "rejects connection" in result.stderr
            for role in ("media_writer", "media_validator"):
                result = psql(role, "media_auth")
                assert result.returncode != 0 and "rejects connection" in result.stderr
    finally:
        docker("rm", "-f", name)
        docker("volume", "rm", volume)
