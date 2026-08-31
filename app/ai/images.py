"""Stable-target image gateway over the protocol adapter registry."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.ai.contracts import Actor, ImageCommand
from app.ai.gateway import connection_operation
from app.ai.registry import ImageAdapterRegistry, ImageGenerationRequest


TargetImageHandler = Callable[[ImageCommand], Awaitable[Any]]


class ImageGateway:
    """Route normalized image requests through the adapter registry."""

    def __init__(
        self,
        *,
        registry: ImageAdapterRegistry,
        target_handler: TargetImageHandler | None = None,
    ) -> None:
        self._registry = registry
        self._target_handler = target_handler

    async def generate_target(self, command: ImageCommand, *, actor: Actor) -> Any:
        """Execute an image command whose target was resolved from AI tables.

        This is the canonical business boundary for resolved AI targets.
        """
        if self._target_handler is None:
            raise RuntimeError("target image handler is not configured")
        if command.target.model is None:
            raise ValueError("image command requires a model resource")
        async with connection_operation(command.target.connection.id, "image_generation", user_id=actor.user_id):
            return await self._target_handler(command)
