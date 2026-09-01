"""OpenAI-compatible chat protocol adapter."""
from __future__ import annotations

from collections.abc import AsyncIterator, Mapping
from typing import Any

import httpx

from app.ai.contracts import ChatCommand
from app.ai.chat import chat_body
from app.core.http_client import shared_http_client


class OpenAIChatAdapter:
    """Protocol-only transport; authorization and governance stay in Gateway."""

    protocol = "openai"
    capabilities = frozenset({"chat", "stream_chat", "tool_calling", "structured_output"})

    def __init__(self, *, timeout: float | httpx.Timeout = 180.0):
        self.timeout = timeout

    async def chat(self, command: ChatCommand, *, headers: Mapping[str, str]) -> dict[str, Any]:
        endpoint = self._endpoint(command)
        async with shared_http_client(timeout=self.timeout) as client:
            response = await client.post(endpoint, headers=dict(headers), json=chat_body(command))
            response.raise_for_status()
            return response.json()

    async def stream_chat(self, command: ChatCommand, *, headers: Mapping[str, str]) -> AsyncIterator[str]:
        endpoint = self._endpoint(command)
        async with shared_http_client(timeout=self.timeout) as client:
            async with client.stream("POST", endpoint, headers=dict(headers), json=chat_body(command)) as response:
                if response.status_code >= 400:
                    await response.aread()
                response.raise_for_status()
                async for line in response.aiter_lines():
                    yield line

    @staticmethod
    def _endpoint(command: ChatCommand) -> str:
        # Protocol-specific URL selection belongs to the transport resolver, which
        # applies the connection's version prefix (/v1, /v1beta, /api/v3) and any
        # chat_endpoint override. Recomputing it here dropped that prefix, so
        # requests went to a path the upstream answered without chat content.
        from app.ai.transport import endpoint_for_target

        base = str(command.target.connection.base_url or "").rstrip("/")
        if base.endswith("/chat/completions"):
            return base
        resolved = endpoint_for_target(command.target, "chat")
        return resolved if resolved.endswith("/chat/completions") else f"{resolved}/chat/completions"


class OpenAIImageAdapter:
    """Normalize OpenAI Images API requests from stable image commands."""

    @staticmethod
    def split_references(references: list[dict[str, Any]] | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        refs = [item for item in (references or []) if item.get("url")]
        masks = [item for item in refs if str(item.get("role") or "").lower() == "mask" or str(item.get("name") or "").lower().endswith("_mask.png")]
        return [item for item in refs if item not in masks], masks

    @staticmethod
    def generation_body(*, model: str, prompt: str, size: str, quality: str = "", gpt_image_2: bool = False, image: list[str] | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"model": model, "prompt": prompt, "size": size}
        if not gpt_image_2:
            body.update({"response_format": "url", "n": 1})
            if image:
                body["image"] = image
        else:
            body["output_format"] = "png"
        if quality:
            body["quality"] = quality
        return body

    @staticmethod
    def edit_fields(*, model: str, prompt: str, size: str, quality: str = "", gpt_image_2: bool = False) -> dict[str, Any]:
        return OpenAIImageAdapter.generation_body(model=model, prompt=prompt, size=size, quality=quality, gpt_image_2=gpt_image_2)
