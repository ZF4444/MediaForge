"""Omnilojo chat adapter over its OpenAI-compatible endpoint."""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import Any

import httpx

from app.ai.adapters.openai import OpenAIChatAdapter
from app.ai.adapters.image_protocol import extract_image_from_chat_response
from app.ai.registry import ImageGenerationRequest


class OmnilojoChatAdapter(OpenAIChatAdapter):
    protocol = "omnilojo"


class OmnilojoImageAdapter:
    """Execute Omnilojo image generation over its chat-compatible protocol."""

    protocol = "omnilojo"

    def __init__(
        self,
        *,
        endpoint: Callable[[Mapping[str, Any]], str],
        headers: Callable[[Mapping[str, Any], str], Mapping[str, str]],
        resolve_reference: Callable[[dict[str, Any]], Awaitable[str]],
        client_factory: Callable[..., Any],
        image_options: Callable[[str], Mapping[str, Any]],
        timeout: httpx.Timeout,
    ) -> None:
        self._endpoint = endpoint
        self._headers = headers
        self._resolve_reference = resolve_reference
        self._client_factory = client_factory
        self._image_options = image_options
        self._timeout = timeout

    async def generate(self, request: ImageGenerationRequest) -> tuple[dict[str, str], dict[str, Any]]:
        connection = request.connection
        base_url = str(connection.get("base_url") or "").rstrip("/")
        if not base_url:
            raise ValueError("AI connection has no Base URL")
        content = [{"type": "text", "text": str(request.prompt or "").strip()}]
        for reference in request.reference_images[:16]:
            if reference.get("url"):
                url = await self._resolve_reference(reference)
                if url:
                    content.append({"type": "image_url", "image_url": {"url": url}})
        body = {
            "model": request.model,
            "messages": [{"role": "user", "content": content}],
            "extra_body": {"google": {"image_config": dict(self._image_options(request.size))}},
        }
        endpoint = self._endpoint(connection)
        async with self._client_factory(timeout=self._timeout) as client:
            response = await client.post(endpoint, headers=dict(self._headers(connection, request.model)), json=body)
            response.raise_for_status()
            raw = response.json()
        return extract_image_from_chat_response(raw), raw
