import os

import pytest

from app.services import storage


def _row(file_id: str, *, category: str, created_at: int, last_accessed_at: int = 0, expires_at=None):
    return {
        "id": file_id,
        "user_id": "user-1",
        "bucket": "mediaforge-private",
        "object_key": f"users/user-1/{category}/{file_id}.png",
        "legacy_url": f"/assets/{category}/{file_id}.png",
        "category": category,
        "original_name": f"{file_id}.png",
        "stored_name": f"{file_id}.png",
        "ext": ".png",
        "mime_type": "image/png",
        "size_bytes": 12,
        "sha256": "hash",
        "kind": "image",
        "source": "upload",
        "is_public": False,
        "status": "active",
        "created_at": created_at,
        "updated_at": created_at,
        "last_accessed_at": last_accessed_at,
        "expires_at": expires_at,
        "deleted_at": None,
    }


def test_enforce_storage_quota_raises_when_limit_exceeded(monkeypatch):
    monkeypatch.setattr(storage, "storage_quota_enabled", lambda: True)
    monkeypatch.setattr(storage, "storage_quota_limit_bytes_for_user", lambda user_id="": 100)
    monkeypatch.setattr(storage, "metadata_db_enabled", lambda: True)
    monkeypatch.setattr(storage, "storage_quota_bytes_for_user", lambda user_id="": 80)

    with pytest.raises(storage.StorageQuotaExceeded) as exc_info:
        storage.enforce_storage_quota(30, category="uploads", user_id="user-1")

    exc = exc_info.value
    assert exc.user_id == "user-1"
    assert exc.quota_bytes == 100
    assert exc.used_bytes == 80
    assert exc.incoming_bytes == 30


def test_cleanup_reason_skips_library_and_honors_last_access(monkeypatch):
    now_value = 10 * 24 * 60 * 60 * 1000
    monkeypatch.setattr(storage, "STORAGE_INPUT_RETENTION_DAYS", 3)

    assert storage.cleanup_reason_for_entry({
        "category": "library",
        "created_at": 1,
        "last_accessed_at": 1,
        "expires_at": 1,
    }, now_ms_value=now_value) is None

    assert storage.cleanup_reason_for_entry({
        "category": "input",
        "created_at": now_value - 9 * 24 * 60 * 60 * 1000,
        "last_accessed_at": now_value - 1 * 24 * 60 * 60 * 1000,
        "expires_at": None,
    }, now_ms_value=now_value) is None

    assert storage.cleanup_reason_for_entry({
        "category": "input",
        "created_at": now_value - 9 * 24 * 60 * 60 * 1000,
        "last_accessed_at": now_value - 5 * 24 * 60 * 60 * 1000,
        "expires_at": None,
    }, now_ms_value=now_value) == "input_retention"


def test_run_storage_cleanup_once_marks_deleted_and_removes_cache(monkeypatch, tmp_path):
    now_value = 10 * 24 * 60 * 60 * 1000
    cache_file = tmp_path / "cached.png"
    cache_file.write_bytes(b"stale")
    deleted_ids = []
    deleted_objects = []

    monkeypatch.setattr(storage, "STORAGE_CLEANUP_ENABLED", True)
    monkeypatch.setattr(storage, "now_ms", lambda: now_value)
    monkeypatch.setattr(storage, "_cleanup_candidates", lambda limit, current: [
        _row("expired-1", category="input", created_at=1, expires_at=now_value - 1),
        _row("library-1", category="library", created_at=1, expires_at=now_value - 1),
    ])
    monkeypatch.setattr(storage, "_mark_file_deleted", lambda file_id, deleted_at_ms: deleted_ids.append((file_id, deleted_at_ms)))
    monkeypatch.setattr(storage, "delete_object", lambda bucket, object_key: deleted_objects.append((bucket, object_key)))
    monkeypatch.setattr(storage, "cached_media_path", lambda entry: str(cache_file) if entry.get("file_id") == "expired-1" else str(tmp_path / "other.png"))

    result = storage.run_storage_cleanup_once(limit=10)

    assert result == {"scanned": 2, "deleted": 1}
    assert deleted_ids == [("expired-1", now_value)]
    assert deleted_objects == [
        ("mediaforge-private", "users/user-1/input/expired-1.png"),
        ("mediaforge-private", "users/user-1/derived/thumbs/s512/expired-1.webp"),
        ("mediaforge-private", "users/user-1/derived/posters/s512/expired-1.jpg"),
    ]
    assert not os.path.exists(cache_file)


def test_cleanup_does_not_mark_deleted_when_remote_delete_fails(monkeypatch):
    now_value = 10 * 24 * 60 * 60 * 1000
    marked = []
    monkeypatch.setattr(storage, "STORAGE_CLEANUP_ENABLED", True)
    monkeypatch.setattr(storage, "now_ms", lambda: now_value)
    monkeypatch.setattr(storage, "_cleanup_candidates", lambda *_args: [
        _row("expired-1", category="input", created_at=1, expires_at=now_value - 1),
    ])
    monkeypatch.setattr(storage, "delete_media_objects", lambda _entry: (_ for _ in ()).throw(storage.StorageUnavailableError("down")))
    monkeypatch.setattr(storage, "_mark_file_deleted", lambda *args: marked.append(args))

    with pytest.raises(storage.StorageUnavailableError):
        storage.run_storage_cleanup_once(limit=10)

    assert marked == []


def test_remove_media_url_deletes_remote_derivatives(monkeypatch, tmp_path):
    cache_file = tmp_path / "cached.png"
    cache_file.write_bytes(b"stale")
    removed_entry = {
        "file_id": "file-1",
        "url": "/api/files/file-1/preview",
        "bucket": "mediaforge-private",
        "object_key": "users/user-1/output/file-1.png",
        "filename": "file-1.png",
        "category": "output",
        "original_name": "file-1.png",
        "content_type": "image/png",
        "kind": "image",
        "size": 12,
        "created_at": 1,
        "updated_at": 1,
        "user_id": "user-1",
        "status": "active",
        "source": "generated",
        "ext": ".png",
        "sha256": "hash",
        "is_public": False,
    }
    deleted_objects = []

    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, *_): pass

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return Cursor()

    monkeypatch.setattr(storage, "resolve_file_reference", lambda **_: removed_entry)
    monkeypatch.setattr(storage, "_ensure_files_table", lambda: None)
    monkeypatch.setattr(storage, "_db_connect", Connection)
    monkeypatch.setattr(storage, "delete_object", lambda bucket, object_key: deleted_objects.append((bucket, object_key)))
    monkeypatch.setattr(storage, "cached_media_path", lambda entry: str(cache_file))

    removed = storage.remove_media_url(removed_entry["url"], delete_remote=True)

    assert removed == removed_entry
    assert deleted_objects == [
        ("mediaforge-private", "users/user-1/output/file-1.png"),
        ("mediaforge-private", "users/user-1/derived/thumbs/s512/file-1.webp"),
        ("mediaforge-private", "users/user-1/derived/posters/s512/file-1.jpg"),
    ]
    assert not os.path.exists(cache_file)


def test_remove_media_url_does_not_mark_deleted_when_remote_delete_fails(monkeypatch):
    removed_entry = {
        "file_id": "file-1",
        "url": "/api/files/file-1/preview",
        "bucket": "mediaforge-private",
        "object_key": "users/user-1/output/file-1.png",
    }
    database_calls = []
    monkeypatch.setattr(storage, "resolve_file_reference", lambda **_kwargs: removed_entry)
    monkeypatch.setattr(storage, "delete_media_objects", lambda _entry: (_ for _ in ()).throw(storage.StorageUnavailableError("down")))
    monkeypatch.setattr(storage, "_ensure_files_table", lambda: database_calls.append("ensure"))

    with pytest.raises(storage.StorageUnavailableError):
        storage.remove_media_url(removed_entry["url"], delete_remote=True)

    assert database_calls == []


def test_delete_media_objects_propagates_non_transient_error(monkeypatch):
    entry = {
        "file_id": "file-1",
        "user_id": "user-1",
        "bucket": "private",
        "object_key": "users/user-1/output/file-1.png",
    }
    monkeypatch.setattr(storage, "delete_object", lambda *_args: (_ for _ in ()).throw(PermissionError("denied")))

    with pytest.raises(PermissionError, match="denied"):
        storage.delete_media_objects(entry)


def test_save_media_bytes_rolls_back_object_when_metadata_insert_fails(monkeypatch):
    deleted = []
    monkeypatch.setattr(storage, "enforce_storage_quota", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(storage, "save_bytes", lambda *_args, **_kwargs: {
        "bucket": "private",
        "object_key": "users/user-1/uploads/file-1.png",
        "size": 7,
    })
    monkeypatch.setattr(storage, "register_media_url", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("database down")))
    monkeypatch.setattr(storage, "delete_object", lambda bucket, key: deleted.append((bucket, key)))

    with pytest.raises(RuntimeError, match="database down"):
        storage.save_media_bytes("uploads", "file.png", b"payload")

    assert deleted == [("private", "users/user-1/uploads/file-1.png")]


def test_run_storage_metadata_purge_once_hard_deletes_only_when_objects_are_gone(monkeypatch):
    deleted_rows = []
    monkeypatch.setattr(storage, "STORAGE_METADATA_PURGE_ENABLED", True)
    monkeypatch.setattr(storage, "STORAGE_METADATA_PURGE_RETENTION_DAYS", 30)
    monkeypatch.setattr(storage, "metadata_db_enabled", lambda: True)
    monkeypatch.setattr(storage, "_deleted_metadata_candidates", lambda limit, deleted_before_ms: [
        {
            **_row("gone-1", category="output", created_at=1),
            "status": "deleted",
            "deleted_at": deleted_before_ms - 1,
        },
        {
            **_row("still-there", category="output", created_at=1),
            "status": "deleted",
            "deleted_at": deleted_before_ms - 1,
        },
    ])
    monkeypatch.setattr(storage, "media_objects_exist", lambda entry: entry.get("file_id") == "still-there")
    monkeypatch.setattr(storage, "_hard_delete_file_row", lambda file_id: deleted_rows.append(file_id))

    result = storage.run_storage_metadata_purge_once(limit=10)

    assert result == {"scanned": 2, "purged": 1}
    assert deleted_rows == ["gone-1"]


def test_storage_quota_config_can_override_default_and_user_limit(monkeypatch):
    settings = {}
    monkeypatch.setattr("app.services.business_metadata.get_app_setting", lambda key, default=None: settings.get(key, default))
    monkeypatch.setattr("app.services.business_metadata.set_app_setting", lambda key, value: settings.__setitem__(key, value) or value)
    monkeypatch.setattr(storage, "_QUOTA_CONFIG_CACHE", None)

    saved = storage.save_storage_quota_config({
        "enabled": False,
        "default_quota_bytes": 2048,
        "users": {"user-1": {"quota_bytes": 1024}},
    })

    assert saved["enabled"] is False
    assert saved["default_quota_bytes"] == 2048
    assert storage.storage_quota_enabled() is False
    assert storage.storage_quota_limit_bytes_for_user("user-1") == 1024
    assert storage.storage_quota_limit_bytes_for_user("user-2") == 2048


def test_storage_usage_summary_groups_sizes_by_category(monkeypatch):
    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, *_): pass
        def fetchall(self):
            return [
                {"category": "output", "size_bytes": 500, "file_count": 2},
                {"category": "library", "size_bytes": 200, "file_count": 1},
            ]

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return Cursor()

    monkeypatch.setattr(storage, "storage_quota_enabled", lambda: True)
    monkeypatch.setattr(storage, "storage_quota_limit_bytes_for_user", lambda user_id="": 1000)
    monkeypatch.setattr(storage, "_ensure_files_table", lambda: None)
    monkeypatch.setattr(storage, "_db_connect", Connection)

    summary = storage.storage_usage_summary_for_user("user-1")

    assert summary["quota_enabled"] is True
    assert summary["quota_bytes"] == 1000
    assert summary["used_bytes"] == 700
    assert summary["remaining_bytes"] == 300
    assert summary["usage_by_category"] == [
        {"category": "output", "size_bytes": 500, "file_count": 2},
        {"category": "library", "size_bytes": 200, "file_count": 1},
    ]
