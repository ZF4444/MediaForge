import asyncio
from io import BytesIO

import pytest
import urllib3
from psycopg_pool import PoolTimeout

from app.core import database
from app.core.log_context import reset_log_context, set_log_context
from app.services import storage


def test_minio_retries_transient_timeout_with_same_operation_id(monkeypatch):
    calls = []
    logs = []

    class Client:
        def stat_object(self, bucket, object_key):
            calls.append((bucket, object_key))
            if len(calls) < 3:
                raise urllib3.exceptions.ConnectTimeoutError(None, "timed out")
            return {"ok": True}

    token = set_log_context(request_id="req_retry_test")
    try:
        monkeypatch.setattr(storage, "_get_client", lambda: Client())
        monkeypatch.setattr(storage.time, "sleep", lambda _delay: None)
        monkeypatch.setattr(storage.logger, "warning", lambda _message, extra: logs.append(extra))

        assert storage.stat_object("private", "object-1") == {"ok": True}
    finally:
        reset_log_context(token)

    assert calls == [("private", "object-1")] * 3
    assert [item["operation_id"] for item in logs] == ["req_retry_test", "req_retry_test"]


def test_minio_does_not_retry_non_transient_error(monkeypatch):
    calls = []

    class Client:
        def stat_object(self, *_args):
            calls.append(1)
            raise ValueError("invalid object name")

    monkeypatch.setattr(storage, "_get_client", lambda: Client())

    with pytest.raises(ValueError):
        storage.stat_object("private", "bad")

    assert len(calls) == 1


def test_minio_byte_upload_retries_with_same_object_key(monkeypatch):
    object_keys = []

    class Client:
        def put_object(self, _bucket, object_key, stream, _length, **_kwargs):
            object_keys.append((object_key, stream.read()))
            if len(object_keys) < 3:
                raise urllib3.exceptions.ReadTimeoutError(None, None, "timed out")
            return type("Result", (), {"etag": "etag", "version_id": ""})()

    monkeypatch.setattr(storage, "_ensure_bucket", lambda _bucket: None)
    monkeypatch.setattr(storage, "_get_client", lambda: Client())
    monkeypatch.setattr(storage.time, "sleep", lambda _delay: None)

    result = storage.save_bytes(b"payload", "users/alice/file-1.png", bucket="private")

    assert result["object_key"] == "users/alice/file-1.png"
    assert object_keys == [("users/alice/file-1.png", b"payload")] * 3


def test_seekable_file_upload_rewinds_before_retry(monkeypatch):
    payloads = []

    class Client:
        def put_object(self, _bucket, _key, stream, _length, **_kwargs):
            payloads.append(stream.read())
            if len(payloads) == 1:
                raise urllib3.exceptions.ReadTimeoutError(None, None, "timed out")
            return type("Result", (), {"etag": "etag", "version_id": ""})()

    monkeypatch.setattr(storage, "_ensure_bucket", lambda _bucket: None)
    monkeypatch.setattr(storage, "_get_client", lambda: Client())
    monkeypatch.setattr(storage.time, "sleep", lambda _delay: None)

    storage.save_fileobj(BytesIO(b"stream-data"), "stream.bin", len(b"stream-data"), bucket="private")

    assert payloads == [b"stream-data", b"stream-data"]


def test_database_retries_only_connection_checkout(monkeypatch):
    sleeps = []

    class Checkout:
        def __init__(self, pool): self.pool = pool
        async def __aenter__(self):
            self.pool.calls += 1
            if self.pool.calls < 3:
                raise PoolTimeout("pool exhausted")
            return "connection"
        async def __aexit__(self, *_args): return False

    class Pool:
        calls = 0
        def connection(self, **_kwargs): return Checkout(self)

    pool = Pool()
    monkeypatch.setattr(database, "_POOL", pool)
    async def fake_sleep(delay):
        sleeps.append(delay)
    monkeypatch.setattr(database.asyncio, "sleep", fake_sleep)

    async def scenario():
        async with database.database_connection() as conn:
            assert conn == "connection"

    asyncio.run(scenario())
    assert pool.calls == 3
    assert len(sleeps) == 2
