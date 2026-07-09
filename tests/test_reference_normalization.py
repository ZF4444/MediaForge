import json
import os

from app.routers import canvases, conversations


def test_save_conversation_normalizes_attachment_file_ids(monkeypatch, tmp_path):
    user_root = tmp_path / "conversations"
    user_root.mkdir()

    monkeypatch.setattr(conversations, "user_dir", lambda user_id: str(user_root))
    monkeypatch.setattr(
        conversations,
        "normalize_media_refs",
        lambda refs: [{**refs[0], "file_id": "file-chat-1", "url": "/assets/input/chat.png"}],
    )

    conversation = {
        "id": "conv1",
        "title": "demo",
        "created_at": 1,
        "updated_at": 1,
        "messages": [{"id": "m1", "attachments": [{"url": "/assets/input/raw.png"}]}],
    }
    conversations.save_conversation("user1", conversation)

    loaded = conversations.load_conversation("user1", "conv1")
    assert loaded["messages"][0]["attachments"][0]["file_id"] == "file-chat-1"
    assert loaded["messages"][0]["attachments"][0]["url"] == "/assets/input/chat.png"


def test_save_canvas_normalizes_node_images_with_file_ids(monkeypatch, tmp_path):
    canvas_root = tmp_path / "canvases"
    canvas_root.mkdir()

    monkeypatch.setattr(canvases, "canvas_dir", lambda: str(canvas_root))
    monkeypatch.setattr(
        canvases,
        "normalize_media_refs",
        lambda refs: [{**refs[0], "file_id": "file-canvas-1", "url": "/assets/output/render.png"}],
    )

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
    canvases.save_canvas(canvas)

    path = os.path.join(str(canvas_root), "canvas1.json")
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    assert raw["nodes"][0]["images"][0]["file_id"] == "file-canvas-1"

    loaded = canvases.load_canvas("canvas1")
    assert loaded["nodes"][0]["images"][0]["url"] == "/assets/output/render.png"
