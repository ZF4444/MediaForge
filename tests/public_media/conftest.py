"""Private PG/MinIO processes, normally inside the isolated integration image.

Run ./scripts/dev.sh media-test. No shared services, ports, volumes or Docker
socket are used by the test container. Native execution remains optional.
"""

import io
import os
import secrets
import shutil
import socket
import subprocess
import time
from dataclasses import replace
from pathlib import Path

import httpx
import psycopg
import pytest
from minio import Minio
from minio.commonconfig import ENABLED
from minio.credentials import StaticProvider
from minio.minioadmin import MinioAdmin
from minio.versioningconfig import VersioningConfig

from app.public_media.config import Settings
from app.public_media.repository import Repository
from app.public_media.storage_reader import StorageReader
from scripts.public_media.migrate import migrate


def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="session")
def real_environment(tmp_path_factory):
    if os.getenv("PUBLIC_VIDEO_INTEGRATION") != "1":
        pytest.skip("Real PG/MinIO tests require explicit PUBLIC_VIDEO_INTEGRATION=1")
    pg_bin = Path(os.getenv("PUBLIC_VIDEO_TEST_PG_BIN", "/usr/lib/postgresql/16/bin"))
    minio_bin = shutil.which("minio")
    if not pg_bin.joinpath("initdb").exists() or not minio_bin:
        pytest.fail("Explicit integration run requires PostgreSQL binaries and MinIO")
    root = tmp_path_factory.mktemp("mediaforge_public_video_test")
    pg_port, minio_port, console_port = port(), port(), port()
    subprocess.run(
        [
            str(pg_bin / "initdb"),
            "-D",
            str(root / "pg"),
            "-U",
            "media_test_admin",
            "-A",
            "trust",
            "--no-locale",
            "--encoding=UTF8",
        ],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        [
            str(pg_bin / "pg_ctl"),
            "-D",
            str(root / "pg"),
            "-l",
            str(root / "pg.log"),
            "-o",
            f"-h 127.0.0.1 -p {pg_port} -k {root}",
            "-w",
            "start",
        ],
        check=True,
        capture_output=True,
    )
    minio_process = None
    log = open(root / "minio.log", "wb")
    try:
        admin_dsn = f"host=127.0.0.1 port={pg_port} user=media_test_admin dbname=postgres"
        with psycopg.connect(admin_dsn, autocommit=True) as conn:
            conn.execute("CREATE DATABASE media_auth_test")
        admin_dsn = admin_dsn.replace("dbname=postgres", "dbname=media_auth_test")
        writer_password, validator_password = secrets.token_hex(24), secrets.token_hex(24)
        migrate(admin_dsn, writer_password, validator_password)
        migrate(admin_dsn, writer_password, validator_password)  # repeatability
        hba = root / "pg" / "pg_hba.conf"
        original_hba = hba.read_text()
        hba.write_text(
            "host media_auth_test,media_auth_init_test media_writer,media_validator 127.0.0.1/32 scram-sha-256\n"
            "host all media_writer,media_validator 127.0.0.1/32 reject\n" + original_hba
        )
        with psycopg.connect(admin_dsn, autocommit=True) as conn:
            conn.execute("SELECT pg_reload_conf()")
        time.sleep(0.05)
        root_password = secrets.token_hex(24)
        env = {**os.environ, "MINIO_ROOT_USER": "media_test_root", "MINIO_ROOT_PASSWORD": root_password}
        minio_process = subprocess.Popen(
            [
                minio_bin,
                "server",
                str(root / "objects"),
                "--address",
                f"127.0.0.1:{minio_port}",
                "--console-address",
                f"127.0.0.1:{console_port}",
            ],
            env=env,
            stdout=log,
            stderr=log,
        )
        endpoint = f"127.0.0.1:{minio_port}"
        for _ in range(100):
            try:
                if httpx.get(f"http://{endpoint}/minio/health/ready", timeout=0.3).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.1)
        else:
            pytest.fail("Isolated MinIO did not become ready")
        admin = Minio(endpoint, "media_test_root", root_password, secure=False)
        for bucket in ("media-test-versioned", "media-test-plain", "media-test-private"):
            admin.make_bucket(bucket)
        admin.set_bucket_versioning("media-test-versioned", VersioningConfig(ENABLED))
        # Generate a real non-sensitive playable video and deterministic payload.
        video = root / "fixture.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=64x64:r=5",
                "-t",
                "1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                str(video),
            ],
            check=True,
        )
        content = video.read_bytes()
        mov = root / "fixture.mov"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(video), "-c", "copy", str(mov)], check=True)
        mov_content = mov.read_bytes()
        for bucket in ("media-test-versioned", "media-test-plain", "media-test-private"):
            admin.put_object(bucket, "allowed/input.mp4", io.BytesIO(content), len(content), content_type="video/mp4")
            admin.put_object(bucket, "forbidden/input.mp4", io.BytesIO(content), len(content), content_type="video/mp4")
        admin.put_object(
            "media-test-versioned",
            "allowed/input.mov",
            io.BytesIO(mov_content),
            len(mov_content),
            content_type="video/quicktime",
        )
        reader_password = secrets.token_hex(24)
        management = MinioAdmin(
            endpoint=endpoint, credentials=StaticProvider("media_test_root", root_password), secure=False
        )
        management.user_add("media_test_reader", reader_password)
        management.policy_add(
            "media-test-read",
            policy={
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": ["s3:GetObject", "s3:GetObjectVersion"],
                        "Resource": [
                            "arn:aws:s3:::media-test-versioned/allowed/*",
                            "arn:aws:s3:::media-test-plain/allowed/*",
                        ],
                    }
                ],
            },
        )
        management.policy_set("media-test-read", user="media_test_reader")
        settings = Settings(
            enabled=True,
            base_url="https://media.test",
            endpoint=endpoint,
            access_key="media_test_reader",
            secret_key=reader_password,
            secure=False,
            prefixes=("media-test-versioned/allowed/", "media-test-plain/allowed/"),
            writer_dsn=f"host=127.0.0.1 port={pg_port} dbname=media_auth_test user=media_writer password={writer_password}",
            validator_dsn=f"host=127.0.0.1 port={pg_port} dbname=media_auth_test user=media_validator password={validator_password}",
        )
        yield {
            "settings": settings,
            "admin_dsn": admin_dsn,
            "admin": admin,
            "management": management,
            "content": content,
            "mov_content": mov_content,
            "root": root,
            "minio_process": minio_process,
            "storage_admin_key": "media_test_root",
            "storage_admin_secret": root_password,
        }
    finally:
        if minio_process:
            minio_process.terminate()
            minio_process.wait(timeout=15)
        log.close()
        subprocess.run(
            [str(pg_bin / "pg_ctl"), "-D", str(root / "pg"), "-m", "immediate", "-w", "stop"], capture_output=True
        )


@pytest.fixture
def real(real_environment):
    env = real_environment
    with psycopg.connect(env["admin_dsn"], autocommit=True) as conn:
        conn.execute(
            "TRUNCATE media.media_sources,media.media_grants,media.media_deliveries,media.media_access_events CASCADE"
        )
        conn.execute("DELETE FROM media.media_policy_state")
        conn.execute("INSERT INTO media.media_policy_state(scope,key) VALUES('global','*')")
    settings = replace(env["settings"])
    writer, validator, reader = (
        Repository(settings.writer_dsn),
        Repository(settings.validator_dsn),
        StorageReader(settings),
    )
    try:
        for scope, key in (("global", "*"),):
            writer.set_policy(scope, key, True)
        yield dict(env, writer=writer, validator=validator, reader=reader, settings=settings)
    finally:
        writer.close()
        validator.close()
        reader.close()


def source(real, file_id="file-a", task_id="task-a", bucket="media-test-versioned"):
    snapshot = real["reader"].snapshot(
        {
            "bucket": bucket,
            "object_key": "allowed/input.mp4",
            "size": len(real["content"]),
            "ext": "mp4",
            "content_type": "video/mp4",
        }
    )
    return real["writer"].create_source(
        dict(snapshot, owner_id="alice", file_id=file_id, task_id=task_id, provider_id="supplier")
    )
