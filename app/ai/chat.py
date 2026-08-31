"""Connection-backed chat transport and retry helpers."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Mapping
from typing import Any

import httpx

from app.ai.contracts import Actor, ChatCommand
from app.ai.gateway import connection_operation
from app.core.http_client import new_outbound_http_client, shared_http_client
from app.core.retry import retry_delay_seconds, retry_max_attempts


class ChatGateway:
    """Execute chat commands against resolved canonical AI targets."""

    def __init__(self, *, timeout: float | httpx.Timeout = 180.0):
        self._timeout = timeout

    async def complete_target(self, *, target, messages: list[dict[str, Any]], user_id: str, extra_body: Mapping[str, Any] | None = None) -> dict[str, Any]:
        from app.ai.domain import ResolvedTarget
        if not isinstance(target, ResolvedTarget) or target.model is None:
            raise ValueError("chat target must include a model resource")
        return await self._execute_target(ChatCommand(target=target, messages=messages, extra_body=dict(extra_body or {})), user_id=user_id)

    async def stream_target(self, *, target, messages: list[dict[str, Any]], user_id: str, extra_body: Mapping[str, Any] | None = None) -> AsyncIterator[str]:
        from app.ai.domain import ResolvedTarget
        if not isinstance(target, ResolvedTarget) or target.model is None:
            raise ValueError("chat target must include a model resource")
        command = ChatCommand(target=target, messages=messages, stream=True, extra_body=dict(extra_body or {}))
        async for line in self._stream_target(command, user_id=user_id):
            yield line

    async def _execute_target(self, command: ChatCommand, *, user_id: str) -> dict[str, Any]:
        adapter = _chat_adapter(command.target.protocol, self._timeout)
        async with connection_operation(command.target.connection.id, "llm", user_id=user_id):
            return await adapter.chat(command, headers=await self._resolver_headers(command.target))

    async def _stream_target(self, command: ChatCommand, *, user_id: str) -> AsyncIterator[str]:
        adapter = _chat_adapter(command.target.protocol, self._timeout)
        async with connection_operation(command.target.connection.id, "llm", user_id=user_id):
            async for line in adapter.stream_chat(command, headers=await self._resolver_headers(command.target)):
                yield line

    async def _resolver_headers(self, target) -> dict[str, str]:
        from app.ai.transport import headers_for_target
        return dict(await asyncio.to_thread(headers_for_target, target))


def _chat_adapter(protocol: str, timeout: float | httpx.Timeout):
    from app.ai.adapters import GeminiChatAdapter, OmnilojoChatAdapter, OpenAIChatAdapter
    adapter_type = {"openai": OpenAIChatAdapter, "gemini": GeminiChatAdapter, "omnilojo": OmnilojoChatAdapter}.get(protocol)
    if adapter_type is None:
        raise ValueError(f"unsupported chat protocol: {protocol}")
    return adapter_type(timeout=timeout)


async def complete_with_retry(*, endpoint: str, headers: Mapping[str, str], body: dict[str, Any], timeout: float | httpx.Timeout = 180.0, retryable_status_codes: set[int] | None = None) -> dict[str, Any]:
    retryable = retryable_status_codes or {408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524}
    for attempt in range(1, retry_max_attempts() + 1):
        try:
            factory = shared_http_client if attempt == 1 else new_outbound_http_client
            async with factory(timeout=timeout) as client:
                response = await client.post(endpoint, headers=dict(headers), json=body)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
            if status not in retryable and not isinstance(exc, (httpx.NetworkError, httpx.TimeoutException)) or attempt == retry_max_attempts():
                raise
            await asyncio.sleep(retry_delay_seconds(attempt))
    raise AssertionError("unreachable")


def chat_completion_url(base_url: str, protocol: str) -> str:
    root = str(base_url or "").rstrip("/")
    if not root:
        raise ValueError("AI connection has no Base URL")
    suffix = "/api/v3" if protocol == "volcengine" else "/v1beta" if protocol == "gemini" else "/v1"
    return f"{root}/chat/completions" if root.endswith(suffix) else f"{root}{suffix}/chat/completions"


def chat_body(command: ChatCommand) -> dict[str, Any]:
    if command.target.model is None:
        raise ValueError("chat command requires a model resource")
    body: dict[str, Any] = {"model": command.target.model.upstream_model, "messages": command.messages}
    if command.stream:
        body["stream"] = True
    if command.tools:
        body["tools"] = command.tools
    if command.response_format:
        body["response_format"] = dict(command.response_format)
    body.update(command.extra_body)
    return body


async def complete(command: ChatCommand, *, actor: Actor, headers: dict[str, str], timeout: float | httpx.Timeout) -> dict[str, Any]:
    response = await _request(command, actor=actor, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response.json()


async def _request(command: ChatCommand, *, actor: Actor, headers: dict[str, str], timeout: float | httpx.Timeout) -> httpx.Response:
    async with connection_operation(command.target.connection.id, "llm", user_id=actor.user_id):
        async with shared_http_client(timeout=timeout) as client:
            return await client.post(chat_completion_url(command.target.connection.base_url, command.target.protocol), headers=headers, json=chat_body(command))


async def stream(command: ChatCommand, *, actor: Actor, headers: dict[str, str], timeout: float | httpx.Timeout) -> AsyncIterator[str]:
    async with connection_operation(command.target.connection.id, "llm", user_id=actor.user_id):
        async with shared_http_client(timeout=timeout) as client:
            async with client.stream("POST", chat_completion_url(command.target.connection.base_url, command.target.protocol), headers=headers, json=chat_body(command)) as response:
                if response.status_code >= 400:
                    await response.aread()
                response.raise_for_status()
                async for line in response.aiter_lines():
                    yield line
