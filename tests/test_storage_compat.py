import hashlib
import asyncio
import os

from app.core.media import import_local_image_file, output_file_from_url, save_ai_image_to_output
from app.routers import files, local_assets
from app.services import storage
from PIL import Image


def test_output_file_from_url_materializes_registered_storage_object(monkeypatch, tmp_path):
    cache_dir = tmp_path / "cache"
    monkeypatch.setattr(storage, "STORAGE_CACHE_DIR", str(cache_dir))
    def download_object(_bucket, _object_key, fileobj, **_kwargs):
        fileobj.write(b"hello-minio")
        return {"size": 11, "sha256": ""}
    monkeypatch.setattr(storage, "download_object_to_file", download_object)
    monkeypatch.setattr(storage, "get_file_by_id", lambda _: {
        "file_id": "file-test",
        "bucket": "mediaforge-private",
        "object_key": "users/anonymous/inputs/2026/07/test.png",
    })
    monkeypatch.setattr(storage, "_touch_access", lambda _: None)

    path = output_file_from_url("/api/files/file-test/preview")

    assert path is not None
    assert os.path.isfile(path)
    with open(path, "rb") as f:
        assert f.read() == b"hello-minio"


def test_upload_ai_reference_uses_storage_service(monkeypatch):
    saved = []

    class DummyUploadFile:
        def __init__(self, filename: str, content: bytes, content_type: str):
            self.filename = filename
            self._content = content
            self._offset = 0
            self.content_type = content_type

        async def read(self, size: int = -1):
            if size is None or size < 0:
                chunk = self._content[self._offset:]
            else:
                chunk = self._content[self._offset:self._offset + size]
            self._offset += len(chunk)
            return chunk

    def fake_save_media_fileobj(category, filename, fileobj, length, **kwargs):
        content = fileobj.read()
        saved.append((category, filename, content, length, kwargs))
        return {
            "url": "/api/files/file-123/preview",
            "entry": {"url": "/api/files/file-123/preview", "file_id": "file-123"},
            "file_id": "file-123",
        }

    monkeypatch.setattr(local_assets, "save_media_fileobj", fake_save_media_fileobj)

    upload = DummyUploadFile("demo.png", b"png-bytes", "image/png")

    result = asyncio.run(local_assets.upload_ai_reference([upload]))

    assert len(saved) == 1
    assert saved[0][0] == "input"
    assert saved[0][2] == b"png-bytes"
    assert saved[0][3] == len(b"png-bytes")
    assert result["files"][0]["url"] == "/api/files/file-123/preview"
    assert result["files"][0]["file_id"] == "file-123"
    assert result["files"][0]["kind"] == "image"


def test_file_refs_from_api_file_preview_uses_file_id(monkeypatch):
    monkeypatch.setattr(
        storage,
        "get_file_by_id",
        lambda file_id: {"file_id": file_id, "url": f"/api/files/{file_id}/preview"},
    )
    refs = storage.file_refs_from_urls(["/api/files/file-9/preview"])
    assert refs == [{"file_id": "file-9"}]


def test_thumbnail_route_returns_fixed_derivative_with_private_cache(monkeypatch):
    entry = {
        "file_id": "file-thumb",
        "kind": "image",
        "bucket": "private",
        "user_id": "alice",
    }

    async def fail_materialize(_):
        raise AssertionError("original was materialized")

    monkeypatch.setattr(files, "get_file_by_id", lambda _: entry)
    monkeypatch.setattr(files, "_materialized_path", fail_materialize)
    monkeypatch.setattr(files, "object_exists", lambda *_: True)
    monkeypatch.setattr(files, "get_object_bytes", lambda *_: b"fixed-thumb")

    response = asyncio.run(files.thumbnail_file("file-thumb"))

    assert response.body == b"fixed-thumb"
    assert response.headers["cache-control"] == "private, max-age=31536000, immutable"


def test_thumbnail_route_generates_missing_derivative_without_materializing_original(monkeypatch):
    entry = {
        "file_id": "file-thumb",
        "kind": "image",
        "bucket": "private",
        "user_id": "alice",
    }
    exists = iter([False, True])
    generated = []

    async def fail_materialize(_):
        raise AssertionError("original was materialized")

    monkeypatch.setattr(files, "get_file_by_id", lambda _: entry)
    monkeypatch.setattr(files, "_materialized_path", fail_materialize)
    monkeypatch.setattr(files, "object_exists", lambda *_: next(exists))
    monkeypatch.setattr(files, "ensure_media_derivatives", lambda item: generated.append(item["file_id"]))
    monkeypatch.setattr(files, "get_object_bytes", lambda *_: b"generated-thumb")

    response = asyncio.run(files.thumbnail_file("file-thumb"))

    assert response.body == b"generated-thumb"
    assert generated == ["file-thumb"]


def test_thumbnail_fallback_is_not_cached_as_immutable(monkeypatch):
    entry = {
        "file_id": "file-video",
        "kind": "video",
        "bucket": "private",
        "user_id": "alice",
        "original_name": "demo.mp4",
    }
    monkeypatch.setattr(files, "get_file_by_id", lambda _: entry)
    monkeypatch.setattr(files, "object_exists", lambda *_: False)
    monkeypatch.setattr(files, "ensure_media_derivatives", lambda _: None)

    response = asyncio.run(files.thumbnail_file("file-video"))

    assert response.media_type == "image/svg+xml"
    assert response.headers["cache-control"] == "private, max-age=300"
    assert "immutable" not in response.headers["cache-control"]


def test_preview_route_uses_short_private_cache(monkeypatch, tmp_path):
    source = tmp_path / "source.png"
    source.write_bytes(b"source")

    async def fake_materialized_path(_):
        return {"file_id": "file-preview"}, str(source)

    monkeypatch.setattr(files, "_materialized_path", fake_materialized_path)

    response = asyncio.run(files.preview_file("file-preview"))

    assert response.headers["cache-control"] == "private, max-age=3600"


def test_storage_files_page_sorts_by_created_at_in_both_directions(monkeypatch):
    entries = [
        {"file_id": "middle", "created_at": 200},
        {"file_id": "oldest", "created_at": 100},
        {"file_id": "newest", "created_at": 300},
    ]
    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, sql, params): self.sql = sql
        def fetchone(self): return {"total": len(entries)}
        def fetchall(self):
            reverse = "ORDER BY created_at DESC" in self.sql
            return [storage_row(item) for item in sorted(entries, key=lambda item: item["created_at"], reverse=reverse)[:2]]

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return Cursor()

    def storage_row(item):
        return {
            "id": item["file_id"], "user_id": "anonymous", "bucket": "private", "object_key": item["file_id"],
            "legacy_url": "", "category": "output", "original_name": item["file_id"], "stored_name": item["file_id"],
            "ext": "", "mime_type": "application/octet-stream", "size_bytes": 0, "sha256": "", "kind": "file",
            "source": "generated", "is_public": False, "status": "active", "created_at": item["created_at"],
            "updated_at": item["created_at"], "last_accessed_at": 0, "expires_at": None, "deleted_at": None,
        }

    monkeypatch.setattr(storage, "_ensure_files_table", lambda: None)
    monkeypatch.setattr(storage, "_db_connect", Connection)

    newest_first = storage.list_media_entries_page_for_user(sort_order="desc", limit=2)
    oldest_first = storage.list_media_entries_page_for_user(sort_order="asc", limit=2)

    assert [item["file_id"] for item in newest_first["entries"]] == ["newest", "middle"]
    assert newest_first["sort_order"] == "desc"
    assert [item["file_id"] for item in oldest_first["entries"]] == ["oldest", "middle"]
    assert oldest_first["sort_order"] == "asc"


def test_storage_files_page_filters_by_age_and_unreferenced_state(monkeypatch):
    executed = []

    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, sql, params): executed.append((sql, params))
        def fetchone(self): return {"total": 0}
        def fetchall(self): return []

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return Cursor()

    monkeypatch.setattr(storage, "_ensure_files_table", lambda: None)
    monkeypatch.setattr(storage, "_db_connect", Connection)

    result = storage.list_media_entries_page_for_user(
        created_before=1_700_000_000_000,
        unreferenced_only=True,
    )

    assert len(executed) == 2
    for sql, params in executed:
        assert "created_at < %s" in sql
        assert "history_record_files" in sql
        assert "conversation_message_files" in sql
        assert "smart_canvas_node_files" in sql
        assert "asset_items" in sql
        assert 1_700_000_000_000 in params
    assert result["created_before"] == 1_700_000_000_000
    assert result["unreferenced_only"] is True


def test_storage_matching_ids_use_the_same_filters(monkeypatch):
    executed = []

    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, sql, params): executed.append((sql, params))
        def fetchall(self): return [{"id": "old-unreferenced"}]

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def cursor(self): return Cursor()

    monkeypatch.setattr(storage, "_ensure_files_table", lambda: None)
    monkeypatch.setattr(storage, "_db_connect", Connection)

    ids = storage.list_user_file_ids_matching(
        category="output",
        search="demo",
        created_before=1_700_000_000_000,
        unreferenced_only=True,
    )

    sql, params = executed[0]
    assert ids == ["old-unreferenced"]
    assert "SELECT id" in sql
    assert "category = %s" in sql
    assert "original_name ILIKE %s" in sql
    assert "created_at < %s" in sql
    assert "history_record_files" in sql
    assert "conversation_message_files" in sql
    assert params == ["anonymous", "output", "%demo%", "%demo%", "%demo%", 1_700_000_000_000]


def test_save_ai_image_to_output_registers_generated_file(monkeypatch):
    monkeypatch.setattr(
        "app.core.media.save_media_bytes",
        lambda category, filename, content, **kwargs: {"url": f"/api/files/generated-1/preview"},
    )

    url = asyncio.run(save_ai_image_to_output({"type": "b64", "value": "aGVsbG8=", "mime_type": "image/png"}, prefix="gen_"))

    assert url == "/api/files/generated-1/preview"


def test_import_local_image_file_uses_storage_without_assets_dir(monkeypatch, tmp_path):
    src = tmp_path / "demo.png"
    Image.new("RGB", (1, 1), (120, 80, 160)).save(src)

    monkeypatch.setattr(
        "app.core.media.save_media_bytes",
        lambda category, filename, content, **kwargs: {"url": "/api/files/file-77/preview", "file_id": "file-77"},
    )

    result = import_local_image_file(str(src))

    assert result["url"] == "/api/files/file-77/preview"
    assert result["file_id"] == "file-77"
    assert result["name"] == "demo.png"


def test_spool_upload_hashes_and_sizes_without_reading_whole_file_at_once(monkeypatch):
    payload = os.urandom(200_000)

    class ChunkedUploadFile:
        """Mimics Starlette's UploadFile.read(size): only ever returns `size`
        bytes per call, so a caller that (incorrectly) called `.read()` with
        no arguments would get a short read instead of the full payload."""

        def __init__(self, content: bytes):
            self._content = content
            self._offset = 0

        async def read(self, size: int = -1):
            assert size and size > 0, "must request bounded chunks, not the whole file"
            chunk = self._content[self._offset:self._offset + size]
            self._offset += len(chunk)
            return chunk

        async def close(self):
            pass

    monkeypatch.setattr(local_assets, "STREAMED_UPLOAD_SPOOL_BYTES", 1024)
    monkeypatch.setattr(local_assets, "UPLOAD_COPY_CHUNK_BYTES", 4096)

    spooled = asyncio.run(local_assets._spool_upload(ChunkedUploadFile(payload)))

    assert spooled is not None
    fileobj, size, sha256 = spooled
    assert size == len(payload)
    assert sha256 == hashlib.sha256(payload).hexdigest()
    assert fileobj.read() == payload
    fileobj.close()


def test_spool_upload_returns_none_for_empty_file():
    class EmptyUploadFile:
        async def read(self, size: int = -1):
            return b""

    result = asyncio.run(local_assets._spool_upload(EmptyUploadFile()))

    assert result is None
