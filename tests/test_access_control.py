from app.core import access_control


def test_all_nodes_includes_chat_image_and_video_models(monkeypatch):
    monkeypatch.setattr(access_control, "_image_models_provider", lambda: [{
        "id": "provider-1",
        "name": "Provider One",
        "enabled": True,
        "chat_models": ["chat-model"],
        "image_models": ["image-model"],
        "video_models": ["video-model"],
    }])

    nodes = access_control.all_nodes()

    assert [node["id"] for node in nodes] == [
        "provider-1::chat-model",
        "provider-1::image-model",
        "provider-1::video-model",
    ]


def test_all_nodes_includes_fallback_chat_models_for_the_primary_provider(monkeypatch):
    monkeypatch.setattr(access_control, "_image_models_provider", lambda: [{
        "id": "google",
        "name": "Google",
        "enabled": True,
        "primary": True,
        "chat_models": [],
        "image_models": [],
        "video_models": [],
    }])
    monkeypatch.setattr(access_control, "_fallback_chat_models_provider", lambda: ["gpt-5.5"])

    assert access_control.all_nodes() == [{"id": "google::gpt-5.5", "label": "Google · gpt-5.5"}]
