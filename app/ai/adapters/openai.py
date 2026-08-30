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
        connection = command.target.connection
        base = str(connection.base_url or "").rstrip("/")
        if not base:
            raise ValueError("AI connection has no Base URL")
        return base if base.endswith("/chat/completions") else f"{base}/chat/completions"
