import os
import asyncio

from app.services import assets, history
from app.routers import assets as asset_router
from app.models import AssetLibraryAddRequest


def test_history_normalizes_image_refs_and_loads_urls(monkeypatch):
    monkeypatch.setattr(
        history,
        "file_refs_from_urls",
        lambda urls: [{"file_id": "file-1", "url": urls[0]}],
    )
    monkeypatch.setattr(
        history,
        "urls_from_file_refs",
        lambda refs: ["/assets/input/restored.png"] if refs and refs[0].get("file_id") == "file-1" else [],
    )

    record = history.normalize_history_record({"images": ["/assets/input/original.png"], "prompt": "demo"})
    assert record["image_refs"] == [{"file_id": "file-1"}]
    assert record["images"] == ["/assets/input/restored.png"]


def test_make_asset_library_item_stores_file_id_when_storage_enabled(monkeypatch, tmp_path):
    src = tmp_path / "source.png"
    src.write_bytes(b"png-bytes")

    monkeypatch.setattr(assets, "ASSET_LIBRARY_DIR", str(tmp_path / "library"))
    monkeypatch.setattr(assets, "storage_enabled", lambda: True)
    monkeypatch.setattr(
        assets,
        "save_compat_media_bytes",
        lambda category, filename, content, **kwargs: {
            "url": f"/assets/{category}/{filename}",
            "file_id": "file-lib-1",
        },
    )

    _, item = assets.make_asset_library_item(str(src), "example.png")

    assert item["file_id"] == "file-lib-1"
    assert item["url"].startswith("/assets/library/lib_")
    assert not os.path.exists(assets.ASSET_LIBRARY_DIR)


def test_add_asset_library_item_uses_file_id(monkeypatch):
    library = {
        "libraries": [{"id": "lib1", "categories": [{"id": "cat1", "type": "image", "items": []}]}],
        "categories": [{"id": "cat1", "type": "image", "items": []}],
    }
    category = library["libraries"][0]["categories"][0]
    saved = {}

    monkeypatch.setattr(asset_router, "load_asset_library", lambda: library)
    monkeypatch.setattr(asset_router, "find_asset_category_in_library", lambda lib, category_id, library_id: category)
    monkeypatch.setattr(asset_router, "resolve_file_reference", lambda file_id="": {"url": "/api/files/file-asset-1/preview"} if file_id == "file-asset-1" else None)
    monkeypatch.setattr(asset_router, "output_file_from_url", lambda url: "/tmp/materialized.png" if url == "/api/files/file-asset-1/preview" else None)
    monkeypatch.setattr(
        asset_router,
        "make_asset_library_item",
        lambda src, name: ("copied.png", {"id": "asset1", "name": name, "file_id": "file-lib-1", "url": "/api/files/file-lib-1/preview"}),
    )
    monkeypatch.setattr(asset_router, "save_asset_library", lambda lib: saved.setdefault("library", lib))

    result = asyncio.run(
        asset_router.add_asset_library_item(
            AssetLibraryAddRequest(library_id="lib1", category_id="cat1", file_id="file-asset-1", name="demo.png")
        )
    )

    assert result["item"]["id"] == "asset1"
    assert category["items"][0]["file_id"] == "file-lib-1"
    assert saved["library"] is library
