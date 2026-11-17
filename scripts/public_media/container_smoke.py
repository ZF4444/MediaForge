"""Disposable image acceptance fixture, usable only with public-media-smoke.yml."""

import hashlib
import io
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx
from minio import Minio
from minio.versioningconfig import ENABLED, VersioningConfig

from app.public_media.bootstrap import initialize_authorizations, initialize_storage_reader
from app.public_media.config import Settings
from app.public_media.contracts import new_token
from app.public_media.repository import Repository
from app.public_media.storage_reader import StorageReader

WRITER = "postgresql://media_writer:test_only_writer_password_123456@postgres:5432/media_auth"
VALIDATOR = "postgresql://media_validator:test_only_validator_password_123456@postgres:5432/media_auth"


def seed():
    assert os.environ["PUBLIC_VIDEO_WRITER_DSN"] == WRITER
    initialize_authorizations(
        "postgresql://media_test_admin:test_only_admin_password_123456@postgres:5432/postgres", WRITER, VALIDATOR
    )
    root = Minio("minio:9000", "media_test_root", "test_only_storage_root_123456", secure=False)
    root.make_bucket("media-smoke")
    root.set_bucket_versioning("media-smoke", VersioningConfig(ENABLED))
    path = Path("/tmp/synthetic.mp4")
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
            str(path),
        ],
        check=True,
    )
    data = path.read_bytes()
    root.put_object("media-smoke", "users/alice/input.mp4", io.BytesIO(data), len(data), content_type="video/mp4")
    settings = Settings(
        enabled=True,
        base_url="https://localhost:18443",
        writer_dsn=WRITER,
        validator_dsn=VALIDATOR,
        endpoint="minio:9000",
        access_key="media_smoke_reader",
        secret_key="test_only_reader_secret_123456",
        secure=False,
        prefixes=("media-smoke/users/",),
    )
    initialize_storage_reader(settings, "minio:9000", "media_test_root", "test_only_storage_root_123456")
    repo, reader = Repository(WRITER), StorageReader(settings)
    try:
        for scope, key in (("global", "*"),):
            repo.set_policy(scope, key, True)
        snapshot = reader.snapshot(
            {
                "bucket": "media-smoke",
                "object_key": "users/alice/input.mp4",
                "size": len(data),
                "ext": "mp4",
                "content_type": "video/mp4",
            }
        )
        row = repo.create_source(
            dict(snapshot, owner_id="alice", file_id="file-smoke", task_id="task-smoke", provider_id="smoke")
        )
        token, digest = new_token()
        grant = repo.issue(row["id"], "alice", digest, "smoke-request", 1800)
        artifact = Path("/smoke/input.json")
        artifact.write_text(
            json.dumps(
                {
                    "grant_id": grant["id"],
                    "token": token,
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "size": len(data),
                    "prefix": data[:32].hex(),
                }
            )
        )
        artifact.chmod(0o644)  # Test-only volume shared with the unprivileged verifier.
    finally:
        repo.close()
        reader.close()
    print("Isolated synthetic media fixture ready")


def verify():
    fixture = json.loads(Path("/smoke/input.json").read_text())
    path = f"/fetch/v1/{fixture['grant_id']}/video.mp4?token={fixture['token']}"
    # Self-signed certificate acceptance is confined to this disposable test.
    # Keep production template Host/SNI checks intact while resolving by service DNS.
    with httpx.Client(verify=False, trust_env=False, timeout=5) as client:

        def request(method, target=path, **kwargs):
            return client.request(
                method,
                "https://media-edge:18443" + target,
                headers={"Host": "localhost", **kwargs.pop("headers", {})},
                extensions={"sni_hostname": "localhost"},
                **kwargs,
            )

        for _ in range(100):
            try:
                response = request("HEAD")
                break
            except httpx.TransportError:
                time.sleep(0.1)
        else:
            raise RuntimeError("Development HTTPS edge did not become reachable")
        assert response.status_code == 200 and int(response.headers["content-length"]) == fixture["size"]
        response = request("GET")
        assert response.status_code == 200 and hashlib.sha256(response.content).hexdigest() == fixture["sha256"]
        response = request("GET", headers={"Range": "bytes=0-31"})
        assert response.status_code == 206 and response.content.hex() == fixture["prefix"]
        assert request("GET", path.replace(fixture["token"], "0" * 43)).status_code == 404
        assert request("GET", "/health/ready").status_code == 404
        repo = Repository(WRITER)
        try:
            repo.set_policy("global", "*", False)
            assert request("HEAD").status_code == 404
        finally:
            repo.close()
    print("Image HTTPS / HEAD / GET / Range / invalid token / revocation checks passed")


if __name__ == "__main__":
    {"seed": seed, "verify": verify}[sys.argv[1]]()
