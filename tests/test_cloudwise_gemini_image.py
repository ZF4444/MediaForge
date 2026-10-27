import asyncio
import json
from contextlib import asynccontextmanager

import httpx
import pytest
from fastapi import HTTPException

import main
from app.ai.adapters.gemini_images import GeminiNativeImageAdapter
from app.ai.adapters.image_protocol import (
    CLOUDWISE_GEMINI_IMAGE_MODELS,
    cloudwise_gemini_image_url,
    gemini_usage,
    is_cloudwise_gemini_image,
)
from app.ai.domain import Connection, ModelResource, ResolvedTarget
from app.ai.image_registry import CLOUDWISE_GEMINI_ADAPTER, select_target_image_adapter
from app.ai.registry import ImageGenerationRequest

DOC_ENDPOINT = "https://api.cloudwise.ai/api/v1beta/models/{}:generateContent"


@pytest.mark.parametrize("model", CLOUDWISE_GEMINI_IMAGE_MODELS)
@pytest.mark.parametrize("suffix", ["", "/", "/api", "/api/v1", "/v1"])
def test_endpoint_matches_documented_url_for_any_base_url_form(model, suffix):
    assert cloudwise_gemini_image_url("https://api.cloudwise.ai" + suffix, model) == DOC_ENDPOINT.format(model)


def test_routing_only_matches_cloudwise_host_and_listed_models():
    assert is_cloudwise_gemini_image("https://api.cloudwise.ai/api/v1", "gemini-3-pro-image")
    assert is_cloudwise_gemini_image("https://api.cloudwise.ai", " Gemini-3.1-Flash-Image ")
    # Other hosts keep the existing chat-compatible gemini/omnilojo path.
    assert not is_cloudwise_gemini_image("https://ai.comfly.chat", "gemini-3-pro-image")
    assert not is_cloudwise_gemini_image("https://api.cloudwise.ai.evil.test", "gemini-3-pro-image")
    # Unlisted Cloudwise models (e.g. gpt-image-2) keep their own protocol.
    assert not is_cloudwise_gemini_image("https://api.cloudwise.ai", "gpt-image-2")


@pytest.mark.parametrize(
    "base_url,model,expected",
    [
        ("https://api.cloudwise.ai/api/v1", "gemini-3-pro-image", CLOUDWISE_GEMINI_ADAPTER),
        ("https://api.cloudwise.ai", "gemini-3.1-flash-image", CLOUDWISE_GEMINI_ADAPTER),
        ("https://api.cloudwise.ai/api/v1", "gpt-image-2", "openai"),
        ("https://ai.comfly.chat", "gemini-3-pro-image", "openai"),
    ],
)
def test_adapter_selection(base_url, model, expected):
    connection = Connection("c1", "openai", "Cloudwise", base_url, True)
    target = ResolvedTarget(connection, ModelResource("m1", "c1", model, "image", "openai"))
    assert select_target_image_adapter(target) == expected


def test_adapter_registered_in_main_registry():
    assert CLOUDWISE_GEMINI_ADAPTER in main.IMAGE_ADAPTERS._handlers


def test_usage_folds_thinking_tokens_into_output():
    usage = gemini_usage(
        {
            "promptTokenCount": 20,
            "candidatesTokenCount": 1120,
            "thoughtsTokenCount": 80,
            "totalTokenCount": 1220,
            "promptTokensDetails": [
                {"modality": "TEXT", "tokenCount": 12},
                {"modality": "IMAGE", "tokenCount": 8},
            ],
        }
    )
    assert usage["prompt_tokens"] == 20
    assert usage["completion_tokens"] == 1200
    assert usage["total_tokens"] == 1220
    assert (usage["text_input_tokens"], usage["image_input_tokens"]) == (12, 8)
    assert gemini_usage(None) == {}


def _request(model="gemini-3-pro-image", refs=None, **kwargs):
    return ImageGenerationRequest(
        prompt=" a blue mug ",
        size="1024x1024",
        quality="",
        model=model,
        reference_images=refs or [],
        connection={"id": "c1", "base_url": "https://api.cloudwise.ai/api/v1", "api_key": "k"},
        **kwargs,
    )


def _adapter(handler, resolved=None):
    @asynccontextmanager
    async def client_factory(**_kwargs):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            yield client

    async def resolve(reference):
        return resolved(reference) if resolved else reference["url"]

    return GeminiNativeImageAdapter(
        headers=lambda connection, model: {"Authorization": "Bearer k", "Content-Type": "application/json"},
        resolve_reference=resolve,
        client_factory=client_factory,
        timeout=httpx.Timeout(5.0),
    )


def test_generate_posts_native_body_and_parses_inline_image_and_usage():
    seen = {}

    def handle(request):
        seen["url"], seen["body"] = str(request.url), json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"inlineData": {"mimeType": "image/jpeg", "data": "QUJD"}}]}}],
                "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 1290, "totalTokenCount": 1295},
                "responseId": "resp-1",
            },
        )

    image, raw = asyncio.run(
        _adapter(handle).generate(
            _request(
                refs=[{"url": "data:image/png;base64,UkVG"}, {"url": "https://example.com/b.webp"}],
                resolution="2k",
                ratio="16:9",
            )
        )
    )
    assert seen["url"] == DOC_ENDPOINT.format("gemini-3-pro-image")
    parts = seen["body"]["contents"][0]["parts"]
    assert parts[0] == {"text": "a blue mug"}
    assert parts[1] == {"inline_data": {"mime_type": "image/png", "data": "UkVG"}}
    assert parts[2] == {"fileData": {"mimeType": "image/webp", "fileUri": "https://example.com/b.webp"}}
    config = seen["body"]["generationConfig"]
    assert config["responseModalities"] == ["TEXT", "IMAGE"]
    assert config["imageConfig"] == {"aspectRatio": "16:9", "imageSize": "2K"}
    assert seen["body"]["return_base64"] is True
    assert image == {"type": "b64", "value": "QUJD", "mime_type": "image/jpeg"}
    assert raw["usage"]["completion_tokens"] == 1290 and raw["id"] == "resp-1"
    assert "candidates" not in raw  # never keep the base64 payload in the raw record


def test_generate_falls_back_to_pixel_size_when_enums_missing():
    seen = {}

    def handle(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"inlineData": {"data": "QQ=="}}]}}]})

    asyncio.run(_adapter(handle).generate(_request(model="gemini-3.1-flash-image")))
    assert seen["body"]["generationConfig"]["imageConfig"] == {"aspectRatio": "1:1", "imageSize": "1K"}


def test_reference_images_are_capped_at_documented_limit_and_unresolvable_skipped():
    seen = {}

    def handle(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"inlineData": {"data": "QQ=="}}]}}]})

    refs = [{"url": f"data:image/png;base64,Uk{i:02d}"} for i in range(20)] + [{"url": "/relative/skip.png"}]
    asyncio.run(
        _adapter(handle, resolved=lambda ref: ref["url"] if ref["url"].startswith("data:") else "").generate(
            _request(refs=refs)
        )
    )
    assert len(seen["body"]["contents"][0]["parts"]) == 1 + 14


@pytest.mark.parametrize(
    "payload,expected",
    [
        ({"promptFeedback": {"blockReason": "SAFETY"}}, "SAFETY"),
        ({"candidates": [{"finishReason": "IMAGE_SAFETY", "content": {"parts": []}}]}, "IMAGE_SAFETY"),
        ({"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "sorry"}]}}]}, "sorry"),
    ],
)
def test_missing_image_surfaces_reason(payload, expected):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(_adapter(lambda request: httpx.Response(200, json=payload)).generate(_request()))
    assert exc.value.status_code == 502 and expected in exc.value.detail


def test_upstream_error_propagates_as_http_status_error():
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(_adapter(lambda request: httpx.Response(429, json={"error": "rate"})).generate(_request()))


def test_cloudwise_discovery_lists_gemini_image_models():
    result = asyncio.run(main.fetch_models_from_upstream("https://api.cloudwise.ai", "test", "openai"))
    assert set(CLOUDWISE_GEMINI_IMAGE_MODELS) <= set(result["image_models"])
    assert "gpt-image-2" in result["image_models"]
    assert result["total"] == len(result["all"])


def _inline(data, thought=False):
    part = {"inlineData": {"mimeType": "image/png", "data": data}}
    if thought:
        part["thought"] = True
    return part


def test_extract_image_skips_thought_drafts_and_returns_final_image():
    from app.ai.adapters.image_protocol import extract_image

    payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "thinking", "thought": True},
                        _inline("DRAFT1", thought=True),
                        {"text": "checking", "thought": True},
                        _inline("FINAL"),
                    ]
                }
            }
        ]
    }
    assert extract_image(payload) == {"type": "b64", "value": "FINAL", "mime_type": "image/png"}


def test_extract_image_takes_last_final_image_and_falls_back_to_draft():
    from app.ai.adapters.image_protocol import extract_image

    two_finals = {"candidates": [{"content": {"parts": [_inline("A"), _inline("B")]}}]}
    assert extract_image(two_finals)["value"] == "B"
    only_drafts = {"candidates": [{"content": {"parts": [_inline("D1", True), _inline("D2", True)]}}]}
    assert extract_image(only_drafts)["value"] == "D2"
