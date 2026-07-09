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
    monkeypatch.setattr(storage, "STORAGE_QUOTA_ENABLED", True)
    monkeypatch.setattr(storage, "STORAGE_USER_QUOTA_BYTES", 100)
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
    assert deleted_objects == [("mediaforge-private", "users/user-1/input/expired-1.png")]
    assert not os.path.exists(cache_file)
