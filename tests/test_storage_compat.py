import asyncio
import os

from app.core.media import import_local_image_file, output_file_from_url, save_ai_image_to_output
from app.routers import files, local_assets
from app.services import storage
from PIL import Image


def test_output_file_from_url_materializes_registered_storage_object(monkeypatch, tmp_path):
    index_file = tmp_path / "storage_objects.json"
    cache_dir = tmp_path / "cache"

    monkeypatch.setattr(storage, "_index_path", lambda: str(index_file))
    monkeypatch.setattr(storage, "STORAGE_CACHE_DIR", str(cache_dir))
    monkeypatch.setattr(storage, "get_object_bytes", lambda bucket, object_key: b"hello-minio")

    storage.register_media_url(
        "/assets/input/test.png",
        "mediaforge-private",
        "users/anonymous/inputs/2026/07/test.png",
        filename="test.png",
        category="input",
        original_name="test.png",
        content_type="image/png",
        kind="image",
        size=11,
    )

    path = output_file_from_url("/assets/input/test.png")

    assert path is not None
    assert os.path.isfile(path)
    with open(path, "rb") as f:
        assert f.read() == b"hello-minio"


def test_upload_ai_reference_uses_storage_service_when_enabled(monkeypatch):
    saved = []

    class DummyUploadFile:
        def __init__(self, filename: str, content: bytes, content_type: str):
            self.filename = filename
            self._content = content
            self.content_type = content_type

        async def read(self):
            return self._content

    monkeypatch.setattr(local_assets, "storage_enabled", lambda: True)
    monkeypatch.setattr(
        local_assets,
        "save_compat_media_bytes",
        lambda category, filename, content, **kwargs: saved.append((category, filename, content, kwargs)) or {
            "url": f"/assets/{category}/{filename}",
            "entry": {"url": f"/assets/{category}/{filename}"},
            "file_id": "file-123",
        },
    )

    upload = DummyUploadFile("demo.png", b"png-bytes", "image/png")

    result = asyncio.run(local_assets.upload_ai_reference([upload]))

    assert len(saved) == 1
    assert saved[0][0] == "input"
    assert result["files"][0]["url"].startswith("/assets/input/ai_ref_")
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
    monkeypatch.setattr(files, "get_file_by_id", lambda _: entry)
    monkeypatch.setattr(files, "_materialized_path", lambda _: (_ for _ in ()).throw(AssertionError("original was materialized")))
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
    monkeypatch.setattr(files, "get_file_by_id", lambda _: entry)
    monkeypatch.setattr(files, "_materialized_path", lambda _: (_ for _ in ()).throw(AssertionError("original was materialized")))
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
    monkeypatch.setattr(files, "_materialized_path", lambda _: ({"file_id": "file-preview"}, str(source)))

    response = asyncio.run(files.preview_file("file-preview"))

    assert response.headers["cache-control"] == "private, max-age=3600"


def test_storage_files_page_sorts_by_created_at_in_both_directions(monkeypatch):
    entries = [
        {"file_id": "middle", "created_at": 200},
        {"file_id": "oldest", "created_at": 100},
        {"file_id": "newest", "created_at": 300},
    ]
    monkeypatch.setattr(storage, "metadata_db_enabled", lambda: False)
    monkeypatch.setattr(storage, "_fallback_list", lambda: list(entries))

    newest_first = storage.list_media_entries_page_for_user(sort_order="desc", limit=2)
    oldest_first = storage.list_media_entries_page_for_user(sort_order="asc", limit=2)

    assert [item["file_id"] for item in newest_first["entries"]] == ["newest", "middle"]
    assert newest_first["sort_order"] == "desc"
    assert [item["file_id"] for item in oldest_first["entries"]] == ["oldest", "middle"]
    assert oldest_first["sort_order"] == "asc"


def test_save_ai_image_to_output_registers_generated_file(monkeypatch, tmp_path):
    monkeypatch.setattr("app.core.media.OUTPUT_OUTPUT_DIR", str(tmp_path))
    monkeypatch.setattr("app.core.media.storage_enabled", lambda: True)
    monkeypatch.setattr(
        "app.core.media.save_compat_media_bytes",
        lambda category, filename, content, **kwargs: {"url": f"/api/files/generated-1/preview"},
    )

    url = asyncio.run(save_ai_image_to_output({"type": "b64", "value": "aGVsbG8=", "mime_type": "image/png"}, prefix="gen_"))

    assert url == "/api/files/generated-1/preview"


def test_import_local_image_file_uses_storage_without_assets_dir(monkeypatch, tmp_path):
    src = tmp_path / "demo.png"
    Image.new("RGB", (1, 1), (120, 80, 160)).save(src)

    monkeypatch.setattr("app.core.media.storage_enabled", lambda: True)
    monkeypatch.setattr(
        "app.core.media.save_compat_media_bytes",
        lambda category, filename, content, **kwargs: {"url": "/api/files/file-77/preview", "file_id": "file-77"},
    )

    result = import_local_image_file(str(src))

    assert result["url"] == "/api/files/file-77/preview"
    assert result["file_id"] == "file-77"
    assert result["name"] == "demo.png"
