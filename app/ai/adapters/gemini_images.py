"""Native Gemini ``generateContent`` image adapter for Cloudwise.

Cloudwise exposes ``gemini-3.1-flash-image`` and ``gemini-3-pro-image`` only
through the Gemini-native endpoint
``/api/v1beta/models/{model}:generateContent``; the chat-compatible facade used
by :class:`OmnilojoImageAdapter` is not documented for them.
"""

from __future__ import annotations

import mimetypes
from collections.abc import Awaitable, Callable, Mapping
from typing import Any
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException

from app.ai.adapters.image_protocol import (
    cloudwise_gemini_image_url,
    extract_image,
    gemini_failure_reason,
    gemini_usage,
)
from app.ai.registry import ImageGenerationRequest
from app.ai.transport import gemini_image_options, gemini_image_options_from_settings

# Documented limit: 14 reference images in total (objects + characters).
MAX_REFERENCE_IMAGES = 14


def _reference_part(url: str) -> dict[str, Any] | None:
    """Convert a data URL or public URL into a Gemini ``parts`` entry."""
    if url.startswith("data:") and ";base64," in url:
        header, encoded = url.split(";base64,", 1)
        mime = header[len("data:") :] or "image/png"
        return {"inline_data": {"mime_type": mime, "data": encoded}} if encoded else None
    if url.startswith(("http://", "https://")):
        mime = mimetypes.guess_type(urlsplit(url).path)[0] or "image/png"
        return {"fileData": {"mimeType": mime, "fileUri": url}}
    return None


class GeminiNativeImageAdapter:
    """Execute image generation/editing through Gemini's native REST protocol."""

    protocol = "gemini_native"

    def __init__(
        self,
        *,
        headers: Callable[[Mapping[str, Any], str], Mapping[str, str]],
        resolve_reference: Callable[[dict[str, Any]], Awaitable[str]],
        client_factory: Callable[..., Any],
        timeout: httpx.Timeout,
    ) -> None:
        self._headers = headers
        self._resolve_reference = resolve_reference
        self._client_factory = client_factory
        self._timeout = timeout

    @staticmethod
    def image_config(request: ImageGenerationRequest) -> dict[str, str]:
        return gemini_image_options_from_settings(request.resolution, request.ratio) or gemini_image_options(
            request.size
        )

    async def build_body(self, request: ImageGenerationRequest) -> dict[str, Any]:
        parts: list[dict[str, Any]] = [{"text": str(request.prompt or "").strip()}]
        for reference in [ref for ref in request.reference_images if ref.get("url")][:MAX_REFERENCE_IMAGES]:
            part = _reference_part(str(await self._resolve_reference(reference) or ""))
            if part:
                parts.append(part)
        return {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
                "imageConfig": self.image_config(request),
            },
            "return_base64": True,
        }

    async def generate(self, request: ImageGenerationRequest) -> tuple[dict[str, str], dict[str, Any]]:
        connection = request.connection
        base_url = str(connection.get("base_url") or "").strip()
        if not base_url:
            raise ValueError("AI connection has no Base URL")
        body = await self.build_body(request)
        endpoint = cloudwise_gemini_image_url(base_url, request.model)
        async with self._client_factory(timeout=self._timeout) as client:
            response = await client.post(endpoint, headers=dict(self._headers(connection, request.model)), json=body)
            response.raise_for_status()
            data = response.json()
        try:
            image = extract_image(data)
        except HTTPException as exc:
            reason = gemini_failure_reason(data)
            raise HTTPException(
                status_code=502, detail=f"Gemini 生图接口没有返回图片：{reason}" if reason else exc.detail
            ) from exc
        # Keep only billing metadata: the full payload embeds the base64 image.
        raw: dict[str, Any] = {
            "id": data.get("responseId") or "",
            "model": data.get("modelVersion") or request.model,
            "usage": gemini_usage(data.get("usageMetadata")),
        }
        return image, raw
