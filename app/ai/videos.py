"""Migration-time video gateway over the existing protocol runtime."""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from app.ai.gateway import provider_operation


ProviderResolver = Callable[[str], Mapping[str, Any]]
BudgetAuthorizer = Callable[[Mapping[str, Any], str], Awaitable[None]]
ModelAuthorizer = Callable[[str, str], str]
Dispatcher = Callable[[str, Any, Mapping[str, Any]], Awaitable[Any]]


class LegacyVideoGateway:
    """Route legacy video requests through one governed execution boundary."""

    def __init__(
        self,
        *,
        provider_resolver: ProviderResolver,
        model_authorizer: ModelAuthorizer,
        budget_authorizer: BudgetAuthorizer,
        dispatcher: Dispatcher,
        protocol_resolver: Callable[[Mapping[str, Any]], str],
    ) -> None:
        self._provider_resolver = provider_resolver
        self._model_authorizer = model_authorizer
        self._budget_authorizer = budget_authorizer
        self._dispatcher = dispatcher
        self._protocol_resolver = protocol_resolver

    async def generate(self, *, payload: Any, actor_user_id: str) -> Any:
        provider_id = str(getattr(payload, "provider_id", "") or "")
        model = str(getattr(payload, "model", "") or "")
        self._model_authorizer(provider_id, model)
        provider = self._provider_resolver(provider_id)
        await self._budget_authorizer(provider, actor_user_id)
        protocol = self._protocol_resolver(provider)
        async with provider_operation(str(provider.get("id") or provider_id), "video_generation", user_id=actor_user_id):
            return await self._dispatcher(protocol, payload, provider)
