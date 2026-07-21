import hashlib
import os
import threading
import time

from app.services import storage


def _configure_cache(monkeypatch, tmp_path, **overrides):
    values = {
        "STORAGE_CACHE_DIR": str(tmp_path / "cache"),
        "STORAGE_CACHE_ENABLED": True,
        "STORAGE_CACHE_DRY_RUN": False,
        "STORAGE_CACHE_MAX_BYTES": 1024 * 1024,
        "STORAGE_CACHE_TARGET_BYTES": 512 * 1024,
        "STORAGE_CACHE_IDLE_TTL_SECONDS": 0,
        "STORAGE_CACHE_ACCESS_GRACE_SECONDS": 0,
        "STORAGE_CACHE_MIN_FREE_BYTES": 0,
        "STORAGE_CACHE_ACCESS_TOUCH_INTERVAL_SECONDS": 0,
        "STORAGE_CACHE_TMP_TTL_SECONDS": 60,
        "STORAGE_CACHE_ORPHAN_SCAN_ENABLED": False,
        "STORAGE_CACHE_ORPHAN_SCAN_INTERVAL_SECONDS": 86400,
        "STORAGE_CACHE_CLEANUP_BATCH_SIZE": 100,
    }
    values.update(overrides)
    for name, value in values.items():
        monkeypatch.setattr(storage, name, value)
    return tmp_path / "cache"


def _entry(payload=b"cache-data", object_key="users/alice/outputs/file.bin"):
    return {
        "file_id": "file-1",
        "bucket": "mediaforge-private",
        "object_key": object_key,
        "size": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


def _write_cache_file(cache_root, relative, payload, mtime):
    path = cache_root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    os.utime(path, (mtime, mtime))
    return path


def test_cached_media_path_rejects_parent_segments(monkeypatch, tmp_path):
    cache_root = _configure_cache(monkeypatch, tmp_path)

    assert storage.cached_media_path(_entry(object_key="users/alice/../bob/file.bin")) == ""
    assert storage.cached_media_path(_entry(object_key="users/alice/file.bin")) == str(
        cache_root / "mediaforge-private/users/alice/file.bin"
    )


def test_download_object_to_file_streams_and_hashes(monkeypatch, tmp_path):
    class Response:
        def __init__(self):
            self.chunks = iter((b"abc", b"def", b""))
            self.closed = False
            self.released = False
        def read(self, _size): return next(self.chunks)
        def close(self): self.closed = True
        def release_conn(self): self.released = True

    response = Response()
    client = type("Client", (), {"get_object": lambda self, *_args: response})()
    monkeypatch.setattr(storage, "_get_client", lambda: client)
    monkeypatch.setattr(storage, "_minio_call", lambda _operation, callback, **_kwargs: callback())

    path = tmp_path / "output.bin"
    with path.open("w+b") as fileobj:
        result = storage.download_object_to_file("bucket", "key", fileobj, chunk_size=2)

    assert path.read_bytes() == b"abcdef"
    assert result == {"size": 6, "sha256": hashlib.sha256(b"abcdef").hexdigest()}
    assert response.closed is True
    assert response.released is True


def test_materialize_streams_once_for_concurrent_requests(monkeypatch, tmp_path):
    _configure_cache(monkeypatch, tmp_path)
    payload = b"concurrent-cache"
    entry = _entry(payload)
    calls = []
    barrier = threading.Barrier(2)
    monkeypatch.setattr(storage, "get_file_by_id", lambda _file_id: entry)
    monkeypatch.setattr(storage, "_touch_access", lambda _file_id: None)

    def download(_bucket, _key, fileobj, **_kwargs):
        calls.append(1)
        time.sleep(0.05)
        fileobj.write(payload)
        return {"size": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}

    monkeypatch.setattr(storage, "download_object_to_file", download)
    results = []

    def materialize():
        barrier.wait()
        results.append(storage.materialize_media_url("/api/files/file-1/preview"))

    threads = [threading.Thread(target=materialize) for _ in range(2)]
    for thread in threads: thread.start()
    for thread in threads: thread.join(timeout=2)

    assert len(calls) == 1
    assert len(set(results)) == 1
    assert open(results[0], "rb").read() == payload


def test_materialize_replaces_invalid_sized_cache(monkeypatch, tmp_path):
    cache_root = _configure_cache(monkeypatch, tmp_path)
    payload = b"correct"
    entry = _entry(payload)
    target = _write_cache_file(
        cache_root,
        "mediaforge-private/users/alice/outputs/file.bin",
        b"bad",
        time.time(),
    )
    downloads = []
    monkeypatch.setattr(storage, "get_file_by_id", lambda _file_id: entry)
    monkeypatch.setattr(storage, "_touch_access", lambda _file_id: None)

    def download(_bucket, _key, fileobj, **_kwargs):
        downloads.append(1)
        fileobj.write(payload)
        return {"size": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}

    monkeypatch.setattr(storage, "download_object_to_file", download)

    assert storage.materialize_media_url("/api/files/file-1/preview") == str(target)
    assert target.read_bytes() == payload
    assert downloads == [1]


def test_cache_cleanup_removes_idle_files_but_not_recent_files(monkeypatch, tmp_path):
    cache_root = _configure_cache(
        monkeypatch,
        tmp_path,
        STORAGE_CACHE_IDLE_TTL_SECONDS=100,
        STORAGE_CACHE_ACCESS_GRACE_SECONDS=10,
    )
    now_value = time.time()
    old = _write_cache_file(cache_root, "private/users/alice/outputs/old.bin", b"old", now_value - 200)
    recent = _write_cache_file(cache_root, "private/users/alice/outputs/recent.bin", b"new", now_value)

    result = storage.run_storage_cache_cleanup_once()

    assert result["evicted_ttl"] == 1
    assert not old.exists()
    assert recent.exists()


def test_cache_cleanup_uses_lru_high_and_low_watermarks(monkeypatch, tmp_path):
    cache_root = _configure_cache(
        monkeypatch,
        tmp_path,
        STORAGE_CACHE_MAX_BYTES=8,
        STORAGE_CACHE_TARGET_BYTES=4,
    )
    now_value = time.time() - 100
    oldest = _write_cache_file(cache_root, "private/a.bin", b"1111", now_value - 20)
    middle = _write_cache_file(cache_root, "private/b.bin", b"2222", now_value - 10)
    newest = _write_cache_file(cache_root, "private/c.bin", b"3333", now_value)

    result = storage.run_storage_cache_cleanup_once()

    assert result["evicted_lru"] == 2
    assert result["bytes_after"] == 4
    assert not oldest.exists()
    assert not middle.exists()
    assert newest.exists()


def test_cache_cleanup_reports_unresolved_target_when_batch_limit_is_reached(monkeypatch, tmp_path):
    cache_root = _configure_cache(
        monkeypatch,
        tmp_path,
        STORAGE_CACHE_MAX_BYTES=8,
        STORAGE_CACHE_TARGET_BYTES=4,
        STORAGE_CACHE_CLEANUP_BATCH_SIZE=1,
    )
    now_value = time.time() - 100
    _write_cache_file(cache_root, "private/a.bin", b"1111", now_value - 20)
    _write_cache_file(cache_root, "private/b.bin", b"2222", now_value - 10)
    _write_cache_file(cache_root, "private/c.bin", b"3333", now_value)

    result = storage.run_storage_cache_cleanup_once()

    assert result["limit_reached"] is True
    assert result["bytes_after"] == 8
    assert result["capacity_unresolved"] is True


def test_cache_cleanup_removes_stale_tmp_and_known_orphan(monkeypatch, tmp_path):
    cache_root = _configure_cache(
        monkeypatch,
        tmp_path,
        STORAGE_CACHE_ORPHAN_SCAN_ENABLED=True,
        STORAGE_CACHE_TMP_TTL_SECONDS=60,
    )
    now_value = time.time()
    active = _write_cache_file(cache_root, "private/users/alice/active.bin", b"a", now_value - 100)
    orphan = _write_cache_file(cache_root, "private/users/alice/orphan.bin", b"o", now_value - 100)
    temporary = _write_cache_file(cache_root, "private/users/alice/.failed.tmp", b"tmp", now_value - 100)
    monkeypatch.setattr(storage, "metadata_db_enabled", lambda: True)
    monkeypatch.setattr(
        storage,
        "_active_cache_object_keys",
        lambda _entries: {("private", "users/alice/active.bin")},
    )
    monkeypatch.setattr(storage, "delete_object", lambda *_args: (_ for _ in ()).throw(AssertionError("MinIO delete called")))
    monkeypatch.setattr(storage, "_delete_unreferenced_file_for_cleanup", lambda *_args: (_ for _ in ()).throw(AssertionError("DB delete called")))

    result = storage.run_storage_cache_cleanup_once(force_orphan_scan=True)

    assert result["evicted_orphan"] == 1
    assert result["removed_tmp"] == 1
    assert active.exists()
    assert not orphan.exists()
    assert not temporary.exists()


def test_cache_cleanup_dry_run_does_not_remove_files(monkeypatch, tmp_path):
    cache_root = _configure_cache(
        monkeypatch,
        tmp_path,
        STORAGE_CACHE_IDLE_TTL_SECONDS=10,
    )
    old = _write_cache_file(cache_root, "private/old.bin", b"old", time.time() - 100)

    result = storage.run_storage_cache_cleanup_once(dry_run=True)

    assert result["dry_run"] is True
    assert result["evicted_ttl"] == 1
    assert result["files_after"] == 0
    assert old.exists()
