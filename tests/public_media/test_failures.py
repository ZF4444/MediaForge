import io
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import psycopg
import pytest

from app.public_media.config import Denied, Unavailable
from app.public_media.contracts import new_token, token_digest

from .conftest import source
from .test_network import events, gateway, issue


@contextmanager
def faulty_storage(row, mode):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def object_headers(self):
            self.send_response(200)
            self.send_header("Content-Length", str(row["size_bytes"]))
            self.send_header("ETag", '"' + row["object_etag"] + '"')
            self.send_header("x-amz-version-id", row["version_id"])
            self.send_header("Last-Modified", "Wed, 11 Nov 2026 00:00:00 GMT")
            self.end_headers()

        def do_HEAD(self):
            self.object_headers()

        def do_GET(self):
            self.object_headers()
            try:
                if mode == "stall":
                    self.wfile.write(b"short")
                    self.wfile.flush()
                    time.sleep(3)
                elif mode == "eof":
                    self.wfile.write(b"short")
                    self.wfile.flush()
                else:
                    for _ in range(row["size_bytes"] // 262144):
                        self.wfile.write(b"x" * 262144)
                        self.wfile.flush()
                        time.sleep(0.3)
            except (ConnectionError, OSError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


@pytest.mark.parametrize("mode", ["stall", "eof", "total"])
def test_upstream_stall_eof_total_deadline_and_recovery(real, mode):
    row = source(real)
    if mode == "total":
        # The transport fault fixture advertises a larger response. Source snapshots
        # are immutable, so construct this synthetic binding before issuing.
        row = {key: value for key, value in row.items() if key != "id"}
        row["size_bytes"] = 8 * 1024 * 1024
        row["file_id"] = "timing-fixture"
        row = real["writer"].create_source(row)
    grant, token, path = issue(real, row)
    with faulty_storage(row, mode) as endpoint, gateway(real, endpoint=endpoint, io_timeout=1, timeout=2) as gw:
        started = time.monotonic()
        with pytest.raises(httpx.RemoteProtocolError):
            httpx.get(gw["base"] + path, timeout=5)
        deadline = time.monotonic() + 4
        while not events(real, grant["id"]) and time.monotonic() < deadline:
            time.sleep(0.05)
        records = events(real, grant["id"])
        assert records and records[0][0] in ("timeout", "upstream_error", "upstream_eof")
        assert records[0][1] < row["size_bytes"]
        assert time.monotonic() - started < 4
        assert httpx.head(gw["base"] + path, timeout=2).status_code == 200
        assert token not in gw["log"].read_text()


def test_expiry_scope_barriers_cleanup_race_and_database_failure(real):
    row = source(real)
    grant, token, path = issue(real, row)
    assert not real["writer"].cleanup_barrier(row["file_id"])
    # A database lock timeout must not open a grant or return an object snapshot.
    with psycopg.connect(real["admin_dsn"], autocommit=False) as blocker:
        blocker.execute("SELECT 1 FROM media.media_policy_state WHERE scope='global' AND key='*' FOR UPDATE")
        with pytest.raises(Unavailable):
            real["validator"].admit(grant["id"], new_token()[1], "GET")
    with psycopg.connect(real["admin_dsn"], autocommit=True) as conn:
        conn.execute(
            "UPDATE media.media_grants SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=%s",
            (grant["id"],),
        )
    assert not real["validator"].admit(grant["id"], new_token()[1], "HEAD")["allowed"]
    assert real["writer"].cleanup_barrier(row["file_id"])
    with pytest.raises(Denied):
        real["writer"].issue(row["id"], "alice", new_token()[1], "late-issuer", 1800, True)
    # A new process sees the durable barrier after a hypothetical business-side crash.
    from app.public_media.repository import Repository

    reopened = Repository(real["settings"].writer_dsn)
    try:
        assert any(p["scope"] == "file" and not p["enabled"] for p in reopened.policies())
    finally:
        reopened.close()


def test_immutable_unversioned_if_match_prevents_changed_object(real):
    from dataclasses import replace

    from app.public_media.storage_reader import StorageReader

    reader = StorageReader(replace(real["settings"], immutable=True))
    entry = {
        "bucket": "media-test-plain",
        "object_key": "allowed/input.mp4",
        "size": len(real["content"]),
        "ext": "mp4",
        "content_type": "video/mp4",
    }
    try:
        snapshot = reader.snapshot(entry)
        assert snapshot["version_id"] == ""
        reader.verify(snapshot)
        real["admin"].put_object(entry["bucket"], entry["object_key"], io.BytesIO(b"changed"), 7)
        with pytest.raises(Denied):
            reader.open(snapshot, 0, snapshot["size_bytes"])
    finally:
        real["admin"].put_object(
            entry["bucket"],
            entry["object_key"],
            io.BytesIO(real["content"]),
            len(real["content"]),
            content_type="video/mp4",
        )
        reader.close()


def test_restored_grants_stay_revoked_after_global_reenable(real):
    from scripts.public_media.recover import recover

    row = source(real)
    token, digest = new_token()
    grant = real["writer"].issue(
        row["id"],
        "alice",
        digest,
        "restore-test",
        1800,
        encrypted_token=token,
        encryption_key="recovery-test-secret-123456",
    )
    real["writer"].revoke(grant["id"], "alice")
    # Model restoring an older backup that still contained the active grant.
    with psycopg.connect(real["admin_dsn"], autocommit=True) as conn:
        conn.execute("UPDATE media.media_grants SET state='active',revoked_at=NULL WHERE id=%s", (grant["id"],))
        conn.execute(
            "INSERT INTO media.media_deliveries(grant_id,ciphertext,expires_at) VALUES(%s,public.pgp_sym_encrypt(%s,'restore-fixture-key'),%s)",
            (grant["id"], token, grant["expires_at"]),
        )
    assert real["validator"].admit(grant["id"], token_digest(token), "HEAD")["allowed"]
    assert recover(real["settings"].writer_dsn) == 1
    assert not next(p for p in real["writer"].policies() if p["scope"] == "global")["enabled"]
    with psycopg.connect(real["admin_dsn"]) as conn:
        assert conn.execute("SELECT count(*) FROM media.media_deliveries").fetchone()[0] == 0
    real["writer"].set_policy("global", "*", True)
    assert not real["validator"].admit(grant["id"], digest, "HEAD")["allowed"]
    assert recover(real["settings"].writer_dsn) == 0
    with pytest.raises(ValueError):
        recover("dbname=postgres")


def test_runtime_account_rotation_requires_new_credentials_and_recovers(real):
    import secrets
    from dataclasses import replace

    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    from app.public_media.repository import Repository
    from app.public_media.storage_reader import StorageReader
    from scripts.public_media.migrate import migrate

    row = source(real)
    grant, token, path = issue(real, row)
    old_writer = conninfo_to_dict(real["settings"].writer_dsn)["password"]
    old_validator = conninfo_to_dict(real["settings"].validator_dsn)["password"]
    next_validator = secrets.token_hex(24)
    next_reader = secrets.token_hex(24)
    updated_reader = updated_repo = None
    try:
        migrate(real["admin_dsn"], secrets.token_hex(24), next_validator, rotate_passwords=True)
        with pytest.raises(psycopg.OperationalError):
            psycopg.connect(real["settings"].validator_dsn)
        updated_repo = Repository(make_conninfo(real["settings"].validator_dsn, password=next_validator))
        assert updated_repo.admit(grant["id"], token_digest(token), "HEAD")["allowed"]
        real["management"].user_add(real["settings"].access_key, next_reader)
        with pytest.raises(Denied):
            real["reader"].verify(row)
        updated_reader = StorageReader(replace(real["settings"], secret_key=next_reader))
        updated_reader.verify(row)
        response = updated_reader.open(row, 0, 16)
        try:
            assert response.read() == real["content"][:16]
        finally:
            updated_reader.release(response)
    finally:
        if updated_repo:
            updated_repo.close()
        if updated_reader:
            updated_reader.close()
        migrate(real["admin_dsn"], old_writer, old_validator, rotate_passwords=True)
        real["management"].user_add(real["settings"].access_key, real["settings"].secret_key)
