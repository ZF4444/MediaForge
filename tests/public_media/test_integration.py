import asyncio
import io
from concurrent.futures import ThreadPoolExecutor

import psycopg
import pytest
from fastapi.testclient import TestClient
from minio.error import S3Error

from app.public_media.config import Conflict, Denied
from app.public_media.contracts import new_token
from app.public_media.gateway import create_app
from app.public_media.service import Service

from .conftest import source


def grant(real, **kwargs):
    row = source(real, **kwargs)
    token, digest = new_token()
    result = real["writer"].issue(row["id"], "alice", digest, "request-123", 1800)
    return row, result, token, digest


def test_role_boundaries(real):
    with pytest.raises(psycopg.OperationalError):
        psycopg.connect(real["settings"].validator_dsn.replace("dbname=media_auth_test", "dbname=postgres"))
    with psycopg.connect(real["settings"].validator_dsn, autocommit=True) as conn:
        for query in (
            "SELECT * FROM media.media_sources",
            "UPDATE media.media_grants SET state='active'",
            "INSERT INTO media.media_sources(id) VALUES('x')",
            "CREATE TABLE media.bad(id int)",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(query)
    with psycopg.connect(real["settings"].writer_dsn, autocommit=True) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("CREATE TABLE media.bad(id int)")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("CREATE TABLE public.bad(id int)")


def test_atomic_admission_and_revoke(real):
    row, result, token, digest = grant(real)
    assert not real["validator"].admit(result["id"], "0" * 64, "GET")["allowed"]
    with ThreadPoolExecutor(max_workers=16) as pool:
        decisions = list(pool.map(lambda _: real["validator"].admit(result["id"], digest, "GET"), range(85)))
    assert sum(d["allowed"] for d in decisions) == 64
    assert real["validator"].admit(result["id"], digest, "HEAD")["allowed"]
    real["writer"].set_policy("file", row["file_id"], False)
    assert not real["validator"].admit(result["id"], digest, "HEAD")["allowed"]
    with pytest.raises(Denied):
        real["writer"].issue(row["id"], "alice", new_token()[1], "retry-123", 1800, True)


def test_daily_budget_and_rotation(real):
    row, result, token, digest = grant(real)
    real["writer"].set_policy("global", "*", True, daily_bytes=len(real["content"]), active_bytes=len(real["content"]))
    assert real["validator"].admit(result["id"], digest, "GET")["allowed"]
    assert real["validator"].admit(result["id"], digest, "GET")["reason"] == "limit"
    with pytest.raises(Conflict):
        real["writer"].issue(row["id"], "alice", new_token()[1], "request-123", 1800, True)
    newer = real["writer"].issue(row["id"], "alice", new_token()[1], "rotation-123", 1800, True)
    assert newer["id"] != result["id"]
    assert not real["validator"].admit(result["id"], digest, "HEAD")["allowed"]


def test_issuance_expiry_uses_database_clock(real, monkeypatch):
    from datetime import datetime, timedelta, timezone

    from app.public_media import repository

    class AheadClock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.now(tz or timezone.utc) + timedelta(days=1)

    monkeypatch.setattr(repository, "datetime", AheadClock)
    row, result, token, digest = grant(real)
    with psycopg.connect(real["admin_dsn"]) as conn:
        expires_in = conn.execute(
            "SELECT extract(epoch FROM expires_at-clock_timestamp()) FROM media.media_grants WHERE id=%s",
            (result["id"],),
        ).fetchone()[0]
    assert 1790 < expires_in <= 1800
    with pytest.raises(Denied):
        real["writer"].issue(row["id"], "alice", new_token()[1], "oversized-ttl", 7201, True)


def test_rotation_and_policy_changes_cannot_reset_signing_rate(real):
    row, result, token, digest = grant(real)
    for number in range(29):
        token, digest = new_token()
        result = real["writer"].issue(row["id"], "alice", digest, f"rotate-rate-{number}", 1800, True)
    with pytest.raises(Denied, match="签发频率"):
        real["writer"].issue(row["id"], "alice", new_token()[1], "rotate-rate-denied", 1800, True)
    real["writer"].set_policy("global", "*", True)
    with pytest.raises(Denied, match="签发频率"):
        real["writer"].issue(row["id"], "alice", new_token()[1], "rotate-rate-still-denied", 1800, True)
    assert real["validator"].admit(result["id"], digest, "HEAD")["allowed"]


def test_asset_operations_with_different_task_ids_cannot_submit_twice(real):
    rows = [source(real, task_id=f"asset:operation-{number}") for number in range(2)]
    for number, row in enumerate(rows):
        real["writer"].issue(row["id"], "alice", new_token()[1], f"asset-operation-{number}", 1800)

    def begin(row):
        try:
            real["writer"].submission(row["task_id"], "supplier", "submitting")
            return row
        except Conflict:
            return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        winners = [row for row in pool.map(begin, rows) if row]
    assert len(winners) == 1
    original = winners[0]
    other = next(row for row in rows if row != original)
    original_grant = next(
        item for item in real["writer"].list_grants()["items"] if item["task_id"] == original["task_id"]
    )
    real["writer"].revoke(original_grant["id"], "alice")
    # An expired/revoked capability does not prove a remote operation ended.
    with pytest.raises(Conflict):
        real["writer"].submission(other["task_id"], "supplier", "submitting")
    assert real["writer"].settle_task(original["task_id"], True)
    with psycopg.connect(real["admin_dsn"]) as conn:
        assert (
            conn.execute(
                "SELECT g.submission_state FROM media.media_grants g JOIN media.media_sources s ON s.id=g.source_id WHERE s.task_id=%s",
                (original["task_id"],),
            ).fetchone()[0]
            == "terminal"
        )
    real["writer"].submission(other["task_id"], "supplier", "submitting")


def test_pinned_storage_and_read_only_account(real):
    row = source(real)
    with psycopg.connect(real["settings"].writer_dsn, autocommit=True) as conn:
        with pytest.raises(psycopg.errors.CheckViolation):
            conn.execute("UPDATE media.media_sources SET object_key='changed' WHERE id=%s", (row["id"],))
    real["admin"].put_object(row["bucket"], row["object_key"], io.BytesIO(b"changed"), 7)
    real["reader"].verify(row)
    response = real["reader"].open(row, 3, 17)
    try:
        assert response.read() == real["content"][3:20]
    finally:
        real["reader"].release(response)
    for bucket, key in (("media-test-private", "allowed/input.mp4"), (row["bucket"], "forbidden/input.mp4")):
        with pytest.raises(S3Error):
            real["reader"].client.stat_object(bucket, key)
    with pytest.raises(S3Error):
        real["reader"].client.put_object(row["bucket"], "allowed/no-write.mp4", io.BytesIO(b"no"), 2)
    with pytest.raises(Denied):
        source(real, bucket="media-test-plain")
    # Restore latest version for subsequent tests, preserving version history.
    real["admin"].put_object(
        row["bucket"], row["object_key"], io.BytesIO(real["content"]), len(real["content"]), content_type="video/mp4"
    )


def test_disguised_non_video_is_not_signed(real):
    content = b"<html>not a video</html>"
    real["admin"].put_object(
        "media-test-versioned", "allowed/not-video.mp4", io.BytesIO(content), len(content), content_type="video/mp4"
    )
    with pytest.raises(Denied):
        real["reader"].snapshot(
            {
                "bucket": "media-test-versioned",
                "object_key": "allowed/not-video.mp4",
                "size": len(content),
                "ext": "mp4",
                "content_type": "video/mp4",
            }
        )


def test_gateway_bytes_and_zero_storage_on_invalid_token(real, monkeypatch):
    row, result, token, digest = grant(real)
    calls = []
    original = real["reader"].verify
    monkeypatch.setattr(real["reader"], "verify", lambda s: (calls.append(s["file_id"]), original(s))[1])
    app = create_app(real["settings"], real["validator"], real["reader"])
    path = f"/fetch/v1/{result['id']}/video.mp4?token={token}"
    with TestClient(app) as client:
        assert client.get(path.replace(token, "0" * 43)).status_code == 404
        assert calls == []
        head = client.head(path, headers={"Range": "bytes=3-4"})
        assert (
            head.status_code == 200
            and head.content == b""
            and int(head.headers["content-length"]) == len(real["content"])
        )
        response = client.get(path, headers={"Range": "bytes=3-19"})
        assert response.status_code == 206 and response.content == real["content"][3:20]
        assert response.headers["content-range"] == f"bytes 3-19/{len(real['content'])}"
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["referrer-policy"] == "no-referrer"
        full = client.get(path, headers={"If-Range": '"mismatch"', "Range": "bytes=0-1"})
        assert full.status_code == 200 and full.content == real["content"]
        assert client.get(path, headers={"Range": "bytes=0-1,3-4"}).status_code == 416
        assert client.get(path.replace("video.mp4", "video.mov")).status_code == 404
        assert client.get("/docs").status_code == 404
        assert client.post(path).status_code == 405
        metrics = client.get("/health/metrics").json()
        assert metrics["active_downloads"] == 0
        assert metrics["peak_active_downloads"] == 1
        assert metrics["bytes_sent"] == 17 + len(real["content"])
        assert metrics["latency_seconds"]["admission"]["count"] >= 5
        assert 0 < metrics["database_pool"]["pool_size"] <= real["settings"].pool_size
        assert token not in str(metrics) and result["id"] not in str(metrics)
        real["writer"].revoke(result["id"], "alice")
        calls.clear()
        assert client.head(path).status_code == 404 and calls == []


def test_service_authorization_and_encrypted_delivery(real):
    async def authorized(owner, file_id, task_id, provider):
        if owner != "alice" or task_id != "task-a" or provider != "supplier":
            raise Denied("denied")
        return {
            "bucket": "media-test-versioned",
            "object_key": "allowed/input.mp4",
            "size": len(real["content"]),
            "ext": "mp4",
            "content_type": "video/mp4",
        }

    async def run():
        service = Service(real["settings"], real["writer"], real["reader"], authorized)
        with pytest.raises(Denied):
            await service.bind("bob", "file-a", "task-a", "supplier")
        bound = await service.bind("alice", "file-a", "task-a", "supplier")
        result = await service.issue("alice", bound["id"], "encrypted-123", encryption_key="test-only-key-1234567890")
        token = result["url"].split("token=")[1]
        delivery = real["writer"].existing_delivery("task-a", "supplier", "file-a", "test-only-key-1234567890")
        assert delivery["token"] == token
        assert token not in str(real["writer"].list_grants())
        real["writer"].submission("task-a", "supplier", "submitting")
        with pytest.raises(Conflict):
            real["writer"].submission("task-a", "supplier", "submitting")
        real["writer"].submission("task-a", "supplier", "submitted", "upstream-test-1")
        assert (
            real["writer"].existing_delivery("task-a", "supplier", "file-a", "test-only-key-1234567890")["upstream_id"]
            == "upstream-test-1"
        )
        real["writer"].revoke(result["id"], "alice")
        assert real["writer"].existing_delivery("task-a", "supplier", "file-a", "test-only-key-1234567890") is None

    asyncio.run(run())


def test_changed_retention_cannot_issue_from_stale_binding(real):
    import time

    entry = {
        "bucket": "media-test-versioned",
        "object_key": "allowed/input.mp4",
        "size": len(real["content"]),
        "ext": "mp4",
        "content_type": "video/mp4",
        "expires_at": int(time.time() * 1000) + 3600000,
    }

    async def authorized(*args):
        return entry

    async def run():
        service = Service(real["settings"], real["writer"], real["reader"], authorized)
        binding = await service.bind("alice", "file-a", "task-a", "supplier")
        entry["expires_at"] -= 3500000  # Business retention shortened after binding.
        with pytest.raises(Denied, match="保留期限"):
            await service.issue("alice", binding["id"], "retention-changed")
        with pytest.raises(Conflict):
            await service.bind("alice", "file-a", "task-a", "supplier")
        assert real["writer"].list_grants()["total"] == 0

    asyncio.run(run())


def test_global_permission_is_sufficient_and_lifecycle_revocation_remains(real):
    row, result, token, digest = grant(real)
    assert [p["scope"] for p in real["writer"].policies()] == ["global"]
    assert real["validator"].admit(result["id"], digest, "HEAD")["allowed"]
    real["writer"].set_policy("provider", "supplier", False)
    assert not real["validator"].admit(result["id"], digest, "HEAD")["allowed"]
    assert {p["scope"] for p in real["writer"].policies()} == {"global", "task"}
    with pytest.raises(Denied):
        real["writer"].issue(row["id"], "alice", new_token()[1], "old-task-retry", 1800, True)
    # Revoked URLs and affected tasks remain blocked; new tasks need no provider approval.
    fresh = source(real, task_id="new-authorized-task")
    new = real["writer"].issue(fresh["id"], "alice", new_token()[1], "new-after-revocation", 1800, True)
    assert new["id"] != result["id"]
    real["writer"].set_policy("global", "*", False)
    with pytest.raises(Denied):
        source(real, file_id="another-video", task_id="another-task")
