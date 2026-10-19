import asyncio
import os
import zipfile

import pytest
from fastapi import HTTPException

from app.models import StorageExportPayload
from app.routers import storage_management


def _entry(file_id: str, name: str, size: int = 5, ext: str = ".png"):
    return {
        "file_id": file_id,
        "bucket": "mediaforge-private",
        "object_key": f"users/u1/{file_id}{ext}",
        "original_name": name,
        "filename": f"{file_id}{ext}",
        "ext": ext,
        "size": size,
        "created_at": 1_700_000_000_000,
    }


@pytest.fixture
def audit_calls(monkeypatch):
    calls = []
    monkeypatch.setattr(storage_management, "audit_event", lambda *a, **kw: calls.append((a, kw)))
    return calls


def _patch_storage(monkeypatch, entries, contents, failing=()):
    monkeypatch.setattr(
        storage_management,
        "get_user_files_by_ids",
        lambda ids: {e["file_id"]: e for e in entries if e["file_id"] in ids},
    )

    def fake_download(bucket, object_key, fileobj, **_kwargs):
        file_id = os.path.splitext(os.path.basename(object_key))[0]
        if file_id in failing:
            raise RuntimeError("minio down")
        fileobj.write(contents[file_id])
        return {"size": len(contents[file_id]), "sha256": ""}

    monkeypatch.setattr(storage_management, "download_object_to_file", fake_download)


def test_export_builds_stored_zip_with_deduplicated_names(monkeypatch, audit_calls):
    entries = [_entry("a", "same.png"), _entry("b", "same.png"), _entry("c", "../evil/x:y.png")]
    contents = {"a": b"AAAAA", "b": b"BBBBB", "c": b"CCCCC"}
    _patch_storage(monkeypatch, entries, contents)

    result = storage_management._export_storage_entries_sync(StorageExportPayload(file_ids=["a", "b", "c", "a"]))
    try:
        assert result["count"] == 3
        assert result["skipped"] == 0
        with zipfile.ZipFile(result["path"]) as zf:
            infos = zf.infolist()
            assert [i.filename for i in infos] == ["same.png", "same-2.png", "x_y.png"]
            assert all(i.compress_type == zipfile.ZIP_STORED for i in infos)
            assert zf.read("same.png") == b"AAAAA"
            assert zf.read("same-2.png") == b"BBBBB"
            assert zf.testzip() is None
    finally:
        os.remove(result["path"])
    assert audit_calls and audit_calls[0][0][0] == "storage_files_exported"


def test_export_skips_unreadable_objects(monkeypatch, audit_calls):
    entries = [_entry("a", "a.png"), _entry("b", "b.png")]
    _patch_storage(monkeypatch, entries, {"a": b"AAAAA", "b": b"BBBBB"}, failing={"b"})

    result = storage_management._export_storage_entries_sync(StorageExportPayload(file_ids=["a", "b"]))
    try:
        assert result["count"] == 1
        assert result["skipped"] == 1
        with zipfile.ZipFile(result["path"]) as zf:
            assert zf.namelist() == ["a.png"]
    finally:
        os.remove(result["path"])


def test_export_rejects_empty_selection(monkeypatch):
    _patch_storage(monkeypatch, [], {})
    with pytest.raises(HTTPException) as exc:
        storage_management._export_storage_entries_sync(StorageExportPayload(file_ids=["", "  "]))
    assert exc.value.status_code == 400


def test_export_unknown_ids_returns_404(monkeypatch):
    _patch_storage(monkeypatch, [], {})
    with pytest.raises(HTTPException) as exc:
        storage_management._export_storage_entries_sync(StorageExportPayload(file_ids=["ghost"]))
    assert exc.value.status_code == 404


def test_export_over_size_limit_returns_413_without_temp_file(monkeypatch):
    _patch_storage(monkeypatch, [_entry("a", "a.png", size=2048)], {"a": b"x"})
    monkeypatch.setattr(storage_management, "STORAGE_EXPORT_MAX_BYTES", 1024)
    created = []
    real_mkstemp = storage_management.tempfile.mkstemp
    monkeypatch.setattr(
        storage_management.tempfile, "mkstemp", lambda *a, **kw: created.append(1) or real_mkstemp(*a, **kw)
    )

    with pytest.raises(HTTPException) as exc:
        storage_management._export_storage_entries_sync(StorageExportPayload(file_ids=["a"]))
    assert exc.value.status_code == 413
    assert created == []


def test_export_all_failed_cleans_up_temp_file(monkeypatch):
    _patch_storage(monkeypatch, [_entry("a", "a.png")], {"a": b"x"}, failing={"a"})
    paths = []
    real_mkstemp = storage_management.tempfile.mkstemp

    def tracking_mkstemp(*a, **kw):
        fd, path = real_mkstemp(*a, **kw)
        paths.append(path)
        return fd, path

    monkeypatch.setattr(storage_management.tempfile, "mkstemp", tracking_mkstemp)

    with pytest.raises(HTTPException) as exc:
        storage_management._export_storage_entries_sync(StorageExportPayload(file_ids=["a"]))
    assert exc.value.status_code == 404
    assert paths and not os.path.exists(paths[0])


def test_export_route_returns_zip_response_and_cleans_up(monkeypatch, audit_calls):
    _patch_storage(monkeypatch, [_entry("a", "a.png"), _entry("b", "b.png")], {"a": b"AAAAA", "b": b"BBBBB"})

    async def run():
        response = await storage_management.export_storage_entries(StorageExportPayload(file_ids=["a", "b"]))
        path = response.path
        assert os.path.exists(path)
        assert response.media_type == "application/zip"
        assert response.headers["x-export-count"] == "2"
        assert response.headers["x-export-skipped"] == "0"
        assert "mediaforge-export-" in response.headers["content-disposition"]
        await response.background()
        return path

    path = asyncio.run(run())
    assert not os.path.exists(path)
