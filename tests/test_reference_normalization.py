from app.routers import canvases, conversations


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
        lambda refs: [{**refs[0], "file_id": "file-canvas-1", "url": "/assets/output/render.png"}],
    )
    monkeypatch.setattr(canvases, "compact_media_refs", lambda refs: [{"file_id": "file-canvas-1"}])

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
