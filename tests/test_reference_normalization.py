import asyncio

from app.routers import canvases, conversations
from app.services import business_metadata


def test_conversation_normalizes_attachment_file_ids(monkeypatch):
    monkeypatch.setattr(
        conversations,
        "normalize_media_refs",
        lambda refs: [{**refs[0], "file_id": "file-chat-1", "url": "/assets/input/chat.png"}],
    )
    monkeypatch.setattr(conversations, "compact_media_refs", lambda refs: [{"file_id": "file-chat-1"}])

    conversation = {
        "id": "conv1",
        "title": "demo",
        "created_at": 1,
        "updated_at": 1,
        "messages": [{"id": "m1", "attachments": [{"url": "/assets/input/raw.png"}]}],
    }
    loaded = conversations.hydrate_conversation(conversations.compact_conversation(conversation))
    assert loaded["messages"][0]["attachments"][0]["file_id"] == "file-chat-1"
    assert loaded["messages"][0]["attachments"][0]["url"] == "/assets/input/chat.png"


def test_canvas_normalizes_node_images_with_file_ids(monkeypatch):
    monkeypatch.setattr(
        canvases,
        "normalize_media_refs",
        lambda refs, **_: [{**refs[0], "file_id": "file-canvas-1", "url": "/assets/output/render.png"}],
    )
    monkeypatch.setattr(canvases, "compact_media_refs", lambda refs, **_: [{"file_id": "file-canvas-1"}])

    canvas = {
        "id": "canvas1",
        "title": "demo",
        "icon": "x",
        "kind": "classic",
        "created_at": 1,
        "updated_at": 1,
        "nodes": [{"id": "n1", "type": "output", "images": [{"url": "/assets/output/raw.png"}]}],
        "connections": [],
        "viewport": {"x": 0, "y": 0, "scale": 1},
    }
    raw = canvases.compact_canvas(canvas)
    assert raw["nodes"][0]["images"][0]["file_id"] == "file-canvas-1"
    loaded = canvases.hydrate_canvas(raw)
    assert loaded["nodes"][0]["images"][0]["url"] == "/assets/output/render.png"


def test_canvas_preserves_missing_file_ids_on_load_and_save(monkeypatch):
    from app.services import storage

    monkeypatch.setattr(storage, "get_files_by_ids", lambda _: {})
    monkeypatch.setattr(storage, "lookup_media_urls", lambda _: {})
    monkeypatch.setattr(storage, "resolve_file_reference", lambda **_: None)

    canvas = {
        "id": "canvas-missing-file",
        "nodes": [{
            "id": "node-1",
            "images": [{"file_id": "missing-file", "name": "lost.png", "kind": "image", "natural_w": 864, "natural_h": 1536}],
        }],
    }

    loaded = canvases.hydrate_canvas(canvas)
    assert loaded["nodes"][0]["images"] == [
        {"file_id": "missing-file", "name": "lost.png", "kind": "image", "natural_w": 864, "natural_h": 1536}
    ]
    assert canvases.compact_canvas(loaded)["nodes"][0]["images"] == [
        {"file_id": "missing-file", "name": "lost.png", "kind": "image", "natural_w": 864, "natural_h": 1536}
    ]


def test_canvas_save_normalizes_zero_deleted_at_to_null(monkeypatch):
    captured = {}

    class Cursor:
        def execute(self, query, params=()):
            if "INSERT INTO smart_canvases" in query:
                captured["deleted_at"] = params[9]

        def fetchall(self): return []

        def __enter__(self): return self
        def __exit__(self, *_): return False

    class Connection:
        def cursor(self): return Cursor()
        def transaction(self): return self
        def __enter__(self): return self
        def __exit__(self, *_): return False

    monkeypatch.setattr(business_metadata, "metadata_connection", lambda: Connection())
    business_metadata.save_canvas_payload("user1", {
        "id": "canvas1", "title": "demo", "created_at": 1,
        "updated_at": 2, "deleted_at": 0, "nodes": [],
    })
    assert captured["deleted_at"] is None


def test_canvas_node_move_does_not_rebuild_file_references(monkeypatch):
    executed = []
    old_node = {"id": "node-1", "type": "output", "x": 0, "images": [{"file_id": "file-1"}]}
    moved_node = {**old_node, "x": 120}

    class Cursor:
        def execute(self, query, params=()):
            executed.append((query, params))

        def fetchall(self):
            return [{"id": "node-1", "sort_order": 0, "data_json": old_node}]

        def __enter__(self): return self
        def __exit__(self, *_): return False

    class Connection:
        def cursor(self): return Cursor()
        def transaction(self): return self
        def __enter__(self): return self
        def __exit__(self, *_): return False

    monkeypatch.setattr(business_metadata, "metadata_connection", lambda: Connection())
    business_metadata.save_canvas_payload("user1", {
        "id": "canvas1", "title": "demo", "created_at": 1, "updated_at": 2, "nodes": [moved_node],
    })

    assert any("UPDATE smart_canvas_nodes" in query for query, _ in executed)
    assert not any("DELETE FROM smart_canvas_node_files" in query for query, _ in executed)


def test_canvas_delete_permanently_removes_payload(monkeypatch):
    deleted = []
    monkeypatch.setattr(canvases, "load_canvas_raw", lambda canvas_id: {"id": canvas_id})
    monkeypatch.setattr(canvases, "current_user_id", lambda: "user1")
    monkeypatch.setattr(
        canvases,
        "delete_canvas_payload",
        lambda user_id, canvas_id: deleted.append((user_id, canvas_id)),
    )

    result = canvases.delete_canvas("canvas1")

    assert result == {"ok": True}
    assert deleted == [("user1", "canvas1")]


def test_canvas_meta_update_does_not_load_or_save_payload(monkeypatch):
    updated = []
    monkeypatch.setattr(canvases, "current_user_id", lambda: "user1")
    monkeypatch.setattr(canvases, "load_canvas_raw", lambda _: (_ for _ in ()).throw(AssertionError("must not load payload")))
    monkeypatch.setattr(canvases, "save_canvas_raw", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("must not save payload")))
    monkeypatch.setattr(canvases, "update_canvas_metadata", lambda *args, **kwargs: updated.append((args, kwargs)) or {
        "id": "canvas1", "title": "renamed", "icon": "layers", "owner": "", "color": "", "pinned": False,
        "created_at": 1, "updated_at": 2, "node_count": 3,
    })

    result = canvases.update_canvas_meta("canvas1", type("Payload", (), {"title": "renamed", "icon": None, "owner": None, "color": None, "pinned": None})())

    assert result["canvas"]["node_count"] == 3
    assert updated[0][0] == ("user1", "canvas1")


def test_canvas_touch_does_not_load_or_save_payload(monkeypatch):
    monkeypatch.setattr(canvases, "current_user_id", lambda: "user1")
    monkeypatch.setattr(canvases, "load_canvas_raw", lambda _: (_ for _ in ()).throw(AssertionError("must not load payload")))
    monkeypatch.setattr(canvases, "save_canvas_raw", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("must not save payload")))
    monkeypatch.setattr(canvases, "touch_canvas_payload", lambda *_: {
        "id": "canvas1", "title": "demo", "icon": "layers", "owner": "", "color": "", "pinned": False,
        "created_at": 1, "updated_at": 2, "node_count": 3,
    })

    result = canvases.touch_canvas("canvas1")

    assert result["updated_at"] == 2
    assert result["canvas"]["node_count"] == 3
