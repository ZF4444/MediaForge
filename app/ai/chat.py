"""Shared OpenAI-compatible chat transport used by HTTP and Agent callers."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any, Mapping

import httpx

from app.ai.contracts import Actor, ChatCommand
from app.ai.gateway import provider_operation
from app.core.http_client import shared_http_client
from app.core.http_client import new_outbound_http_client
from app.core.retry import retry_delay_seconds, retry_max_attempts


class LegacyChatGateway:
    """Compatibility chat gateway for callers still using provider/model fields."""

    def __init__(self, *, resolver, authorizer, budget_authorizer, timeout: float | httpx.Timeout = 180.0):
        self._resolver = resolver
        self._authorizer = authorizer
        self._budget_authorizer = budget_authorizer
        self._timeout = timeout

    async def complete(self, *, provider: str, model: str, messages: list[dict[str, Any]], user_id: str, model_id: str = "", connection_id: str = "") -> dict[str, Any]:
        provider, model = self._resolve_identity(provider, model, model_id, connection_id)
        endpoint, headers, resolved_model = self._resolver(provider, model)
        self._authorizer(provider, resolved_model)
        provider_config = self._provider_config(provider)
        await self._budget_authorizer(provider_config, user_id)
        target = self._target(provider_config, resolved_model)
        target = self._with_endpoint(target, endpoint)
        command = ChatCommand(target=target, messages=messages)
        connection = target.connection
        async with provider_operation(connection.legacy_provider_id or connection.id, "llm", user_id=user_id):
            if target.protocol in {"openai", "gemini", "omnilojo"}:
                from app.ai.adapters import GeminiChatAdapter, OmnilojoChatAdapter, OpenAIChatAdapter
                adapter_type = {"openai": OpenAIChatAdapter, "gemini": GeminiChatAdapter, "omnilojo": OmnilojoChatAdapter}[target.protocol]
                return await adapter_type(timeout=self._timeout).chat(command, headers=headers)
            async with shared_http_client(timeout=self._timeout) as client:
                response = await client.post(f"{endpoint}/chat/completions", headers=headers, json=chat_body(command))
                response.raise_for_status()
                return response.json()

    async def stream_chat(
        self,
        *,
        provider: str,
        model: str,
        messages: list[dict[str, Any]],
        user_id: str,
        extra_body: Mapping[str, Any] | None = None,
        model_id: str = "",
        connection_id: str = "",
    ) -> AsyncIterator[str]:
        provider, model = self._resolve_identity(provider, model, model_id, connection_id)
        endpoint, headers, resolved_model = self._resolver(provider, model)
        self._authorizer(provider, resolved_model)
        provider_config = self._provider_config(provider)
        await self._budget_authorizer(provider_config, user_id)
        target = self._target(provider_config, resolved_model)
        target = self._with_endpoint(target, endpoint)
        command = ChatCommand(
            target=target,
            messages=messages,
            stream=True,
            extra_body=dict(extra_body or {}),
        )
        connection = target.connection
        async with provider_operation(connection.legacy_provider_id or connection.id, "llm", user_id=user_id):
            if target.protocol in {"openai", "gemini", "omnilojo"}:
                from app.ai.adapters import GeminiChatAdapter, OmnilojoChatAdapter, OpenAIChatAdapter
                adapter_type = {"openai": OpenAIChatAdapter, "gemini": GeminiChatAdapter, "omnilojo": OmnilojoChatAdapter}[target.protocol]
                async for line in adapter_type(timeout=self._timeout).stream_chat(command, headers=headers):
                    yield line
            else:
                async with shared_http_client(timeout=self._timeout) as client:
                    async with client.stream("POST", f"{endpoint}/chat/completions", headers=headers, json=chat_body(command)) as response:
                        if response.status_code >= 400:
                            await response.aread()
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            yield line

    @staticmethod
    def _resolve_identity(provider: str, model: str, model_id: str, connection_id: str) -> tuple[str, str]:
        if not model_id and not connection_id:
            return provider, model
        from app.ai.database_repository import DatabaseAIRepository
        target = DatabaseAIRepository().resolve_model(model_id=model_id, connection_id=connection_id, model=model, kind="chat")
        from app.ai.runtime import load_legacy_providers
        runtime = next((item for item in load_legacy_providers() if item.get("connection_id") == target.connection.id), None)
        if runtime is None:
            raise ValueError("指定的聊天连接未加载")
        return str(runtime["id"]), target.model.upstream_model if target.model else model

    def _provider_config(self, provider: str) -> dict[str, Any]:
        from app.ai.runtime import load_legacy_providers
        providers = load_legacy_providers()
        selected = str(provider or "").strip().lower()
        item = next((entry for entry in providers if str(entry.get("id") or "").lower() == selected), None)
        return item or {"id": selected or "unknown", "protocol": "openai", "base_url": ""}

    @staticmethod
    def _target(provider: Mapping[str, Any], model: str):
        from app.ai.domain import Connection, ModelResource, ResolvedTarget
        provider_id = str(provider.get("id") or "unknown")
        connection = Connection(
            id=f"legacy:{provider_id}", legacy_provider_id=provider_id,
            protocol=str(provider.get("protocol") or "openai"), name=provider_id,
            base_url=str(provider.get("base_url") or "").rstrip("/"), enabled=True,
        )
        model_resource = ModelResource(
            id=f"legacy:{provider_id}:chat:{model}", connection_id=connection.id,
            upstream_model=model, kind="chat", protocol=str(provider.get("protocol") or "openai"),
            capabilities=frozenset({"chat", "stream_chat", "tool_calling"}),
        )
        return ResolvedTarget(connection=connection, model=model_resource)

    @staticmethod
    def _with_endpoint(target, endpoint: str):
        from app.ai.domain import Connection, ResolvedTarget
        connection = target.connection
        return ResolvedTarget(
            connection=Connection(
                id=connection.id, legacy_provider_id=connection.legacy_provider_id,
                protocol=connection.protocol, name=connection.name, base_url=f"{endpoint}/chat/completions",
                enabled=connection.enabled, primary=connection.primary, settings=connection.settings,
            ),
            model=target.model, resource=target.resource,
        )


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
            retryable_error = status in retryable or isinstance(exc, (httpx.NetworkError, httpx.TimeoutException))
            if not retryable_error or attempt == retry_max_attempts():
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
    connection = command.target.connection
    async with provider_operation(connection.legacy_provider_id or connection.id, "llm", user_id=actor.user_id):
        async with shared_http_client(timeout=timeout) as client:
            return await client.post(
                chat_completion_url(connection.base_url, command.target.protocol),
                headers=headers,
                json=chat_body(command),
            )


async def stream(command: ChatCommand, *, actor: Actor, headers: dict[str, str], timeout: float | httpx.Timeout) -> AsyncIterator[str]:
    """Yield raw SSE lines while keeping the provider governance scope open."""
    connection = command.target.connection
    async with provider_operation(connection.legacy_provider_id or connection.id, "llm", user_id=actor.user_id):
        async with shared_http_client(timeout=timeout) as client:
            async with client.stream(
                "POST",
                chat_completion_url(connection.base_url, command.target.protocol),
                headers=headers,
                json=chat_body(command),
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    yield line
