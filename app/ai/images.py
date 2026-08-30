"""Migration-time image gateway over the existing adapter registry.

Protocol implementations remain in their legacy locations for now.  This
gateway owns the business-neutral orchestration boundary: provider resolution,
budget authorization, governance, and adapter dispatch.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from app.ai.contracts import Actor
from app.ai.gateway import provider_operation
from app.ai.registry import ImageAdapterRegistry, ImageGenerationRequest


ProviderResolver = Callable[[str], Mapping[str, Any]]
BudgetAuthorizer = Callable[[Mapping[str, Any], str], Awaitable[None]]
AdapterSelector = Callable[[Mapping[str, Any], str], str]


class LegacyImageGateway:
    """Route legacy image inputs through one observable execution boundary."""

    def __init__(
        self,
        *,
        provider_resolver: ProviderResolver,
        budget_authorizer: BudgetAuthorizer,
        registry: ImageAdapterRegistry,
        adapter_selector: AdapterSelector,
    ) -> None:
        self._provider_resolver = provider_resolver
        self._budget_authorizer = budget_authorizer
        self._registry = registry
        self._adapter_selector = adapter_selector

    async def generate(
        self,
        *,
        prompt: str,
        size: str,
        quality: str,
        model: str,
        reference_images: list[dict[str, Any]] | None,
        provider_id: str,
        actor: Actor,
    ) -> Any:
        provider = self._provider_resolver(provider_id)
        await self._budget_authorizer(provider, actor.user_id)
        request = ImageGenerationRequest(
            prompt=str(prompt or ""),
            size=str(size or ""),
            quality=str(quality or ""),
            model=str(model or ""),
            reference_images=list(reference_images or []),
            provider=provider,
        )
        async with provider_operation(str(provider.get("id") or provider_id), "image_generation", user_id=actor.user_id):
            return await self._registry.dispatch(self._adapter_selector(provider, request.model), request)
