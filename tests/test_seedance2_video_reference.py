import asyncio
import json
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import httpx
import pytest

import main


def _provider(model):
    return {
        "id": "volc-video",
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "protocol": "volcengine",
        "runtime_model": model,
    }


@pytest.fixture
def video_upstream(monkeypatch):
    calls = []

    def handle(request):
        calls.append(request)
        # Return a completed task so a broken poll cannot spin until timeout.
        assert request.method == "POST"
        return httpx.Response(
            200,
            json={
                "id": "task-1",
                "status": "succeeded",
                "content": {"video_url": "https://example.com/result.mp4"},
            },
        )

    @asynccontextmanager
    async def client_factory(**kwargs):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            yield client

    monkeypatch.setattr(main, "shared_http_client", client_factory)
    monkeypatch.setattr(main, "connection_api_key", lambda *args: "test-key")
    monkeypatch.setattr(main, "save_remote_video_to_output", AsyncMock(return_value="/api/files/output/test.mp4"))
    monkeypatch.setattr(main, "media_response_items", lambda *args: [])
    monkeypatch.setattr(main, "_attach_quota_warning_async", AsyncMock(side_effect=lambda result: result))
    monkeypatch.setattr(main, "update_canvas_task", AsyncMock())
    monkeypatch.setattr(main, "output_file_from_url", lambda value: "/tmp/ref.mp4")
    monkeypatch.setattr(main, "PUBLIC_BASE_URL", "")
    monkeypatch.setattr(main, "PUBLIC_MEDIA_BASE_URL", "")
    monkeypatch.delenv("PUBLIC_BASE_URL", raising=False)
    monkeypatch.delenv("PUBLIC_MEDIA_BASE_URL", raising=False)
    monkeypatch.delenv("PUBLIC_MEDIA_TOKEN", raising=False)
    return calls


@pytest.mark.parametrize("model", ["doubao-seedance-2-0-260128", "doubao-seedance-2-0-fast-260128"])
def test_seedance2_passes_video_input_as_web_url(video_upstream, model):
    payload = main.CanvasVideoRequest(prompt="test", model=model, duration=5, videos=["https://example.com/ref.mp4"])
    result = asyncio.run(main._canvas_video_impl(payload, _provider(model)))

    body = json.loads(video_upstream[0].content)
    video_items = [item for item in body["content"] if item["type"] == "video_url"]
    assert video_items == [
        {"type": "video_url", "video_url": {"url": "https://example.com/ref.mp4"}, "role": "reference_video"}
    ]
    assert result["videos"] == ["/api/files/output/test.mp4"]
    assert len(video_upstream) == 1


def test_seedance2_local_video_requires_public_base_url(video_upstream):
    payload = main.CanvasVideoRequest(
        prompt="test",
        model="doubao-seedance-2-0-260128",
        duration=5,
        videos=["/api/files/uploads/ref.mp4"],
    )
    with pytest.raises(main.HTTPException) as exc_info:
        asyncio.run(main._canvas_video_impl(payload, _provider(payload.model)))
    assert exc_info.value.status_code == 400
    assert "公网" in exc_info.value.detail
    assert not video_upstream


def test_seedance2_local_video_uses_public_base_url(monkeypatch, video_upstream):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://media.example.com")
    payload = main.CanvasVideoRequest(
        prompt="test",
        model="doubao-seedance-2-0-260128",
        duration=5,
        videos=["/api/files/uploads/ref.mp4"],
    )
    asyncio.run(main._canvas_video_impl(payload, _provider(payload.model)))

    body = json.loads(video_upstream[0].content)
    video_items = [item for item in body["content"] if item["type"] == "video_url"]
    assert video_items[0]["video_url"]["url"] == "https://media.example.com/api/files/uploads/ref.mp4"


@pytest.mark.parametrize("value", ["data:video/mp4;base64,AAAA", "blob:https://example.com/ref", "/tmp/ref.mp4"])
def test_seedance2_rejects_non_public_video_references(value):
    with pytest.raises(main.HTTPException) as exc_info:
        main.volcengine_seedance2_video_reference_url(value)
    assert exc_info.value.status_code == 400


def test_seedance2_keeps_registered_asset_reference():
    assert main.volcengine_seedance2_video_reference_url("asset://video-1") == "asset://video-1"
