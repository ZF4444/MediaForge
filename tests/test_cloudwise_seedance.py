import asyncio
from contextlib import asynccontextmanager

import httpx
import pytest

import main
from app.ai.adapters.video_protocol import CLOUDWISE_SEEDANCE_MODELS


@pytest.mark.parametrize("suffix", ["", "/api/v1", "/v1"])
def test_seedance_endpoints(suffix):
    provider = {"base_url": "https://api.cloudwise.ai" + suffix, "runtime_model": CLOUDWISE_SEEDANCE_MODELS[0]}
    root = main.video_api_root(provider)
    endpoint = "https://api.cloudwise.ai/api/v1/aiproducts/video/seedance"
    assert main.video_submit_url_candidates(provider, root) == [endpoint]
    assert main.video_task_url_candidates(provider, root, "abc/+==") == [endpoint + "/tasks/abc%2F%2B%3D%3D"]


def test_discovery_lists_documented_models():
    result = asyncio.run(main.fetch_models_from_upstream("https://api.cloudwise.ai", "test", "openai"))
    assert result["video_models"] == list(CLOUDWISE_SEEDANCE_MODELS)
    assert result["total"] == len(result["all"])


@pytest.mark.parametrize("download_fails", [False, True])
def test_seedance_submit_poll_and_save(monkeypatch, download_fails):
    calls = []
    events = []

    def handle(request):
        assert request.headers["Authorization"] == "Bearer test-key"
        calls.append(request)
        if request.method == "POST":
            return httpx.Response(200, json={"id": "task== ".strip()})
        assert events == ["submitted"]
        return httpx.Response(
            200,
            json={
                "status": "succeeded",
                "usage": {"total_tokens": 100000},
                "content": {"video_url": "https://download.cloudwise.ai/arts/123"},
            },
        )

    @asynccontextmanager
    async def client_factory(**kwargs):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            yield client

    async def no_sleep(*args):
        pass

    async def save(url):
        assert url == "https://download.cloudwise.ai/arts/123"
        assert events == ["submitted", "settled"]
        if download_fails:
            raise RuntimeError("download failed")
        return "/api/files/output/test.mp4"

    async def attach(result):
        return result

    monkeypatch.setattr(main, "shared_http_client", client_factory)
    monkeypatch.setattr(main, "connection_api_key", lambda *args: "test-key")
    monkeypatch.setattr(main.asyncio, "sleep", no_sleep)
    monkeypatch.setattr(main, "save_remote_video_to_output", save)
    monkeypatch.setattr(main, "media_response_items", lambda *args: [])
    monkeypatch.setattr(main, "_attach_quota_warning_async", attach)

    async def update(task_id, **changes):
        assert task_id == "local-task"
        assert changes["upstream_task_id"] == "task=="
        events.append("submitted")

    def settle(user, provider, model, raw, context, upstream_id):
        assert user == "owner" and upstream_id == "task=="
        assert raw["usage"]["total_tokens"] == 100000
        events.append("settled")
        return True

    monkeypatch.setattr(main, "update_canvas_task", update)
    monkeypatch.setattr("app.services.video_billing.record_video_response_usage", settle)
    payload = main.CanvasVideoRequest(
        prompt="test",
        model=CLOUDWISE_SEEDANCE_MODELS[0],
        duration=11,
        resolution="720p",
        images=[{"url": "https://example.com/ref.png"}],
        videos=["https://example.com/ref.mp4"],
        audios=["https://example.com/ref.mp3"],
        generate_audio=False,
    )
    coroutine = main._canvas_video_impl(
        payload,
        {
            "id": "cloud-video",
            "base_url": "https://api.cloudwise.ai/api/v1",
            "protocol": "openai",
            "billing_task_id": "local-task",
            "billing_user_id": "owner",
            "billing_context": {"configured": True},
        },
    )
    if download_fails:
        with pytest.raises(RuntimeError, match="download failed"):
            asyncio.run(coroutine)
        assert events == ["submitted", "settled"]
        return
    result = asyncio.run(coroutine)
    import json

    body = json.loads(calls[0].content)
    assert calls[0].url.path == "/api/v1/aiproducts/video/seedance"
    assert calls[1].url.path.endswith("/tasks/task==")
    assert body["duration"] == 11
    assert body["generate_audio"] is False
    assert [item["type"] for item in body["content"]] == ["text", "image_url", "video_url", "audio_url"]
    assert body["content"][1]["role"] == "reference_image"
    assert body["content"][2]["video_url"]["url"] == "https://example.com/ref.mp4"
    assert result["videos"] == ["/api/files/output/test.mp4"]
