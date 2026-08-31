"""Protocol-neutral registry for AI connection adapters."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Mapping

from app.ai.domain import ResolvedTarget


@dataclass(frozen=True)
class ImageGenerationRequest:
    prompt: str
    size: str
    quality: str
    model: str
    reference_images: list[dict[str, Any]]
    connection: Mapping[str, Any]
    target: ResolvedTarget | None = None

    @property
    def connection_id(self) -> str:
        """Stable connection identifier used for governance and accounting."""
        if self.target is not None:
            return self.target.connection.id
        return str(self.connection.get("connection_id") or self.connection.get("id") or "")

    @property
    def model_id(self) -> str:
        """Stable model identifier; upstream model names are transport-only."""
        return self.target.model.id if self.target and self.target.model else ""

    @property
    def resource_id(self) -> str:
        """Stable executable resource identifier when the request targets one."""
        return self.target.resource.id if self.target and self.target.resource else ""


ImageGenerationHandler = Callable[[ImageGenerationRequest], Awaitable[Any]]


class ImageAdapterRegistry:
    """Maps a normalized adapter key to its image-generation implementation."""

    def __init__(self) -> None:
        self._handlers: dict[str, ImageGenerationHandler] = {}

    def register(self, key: str, handler: ImageGenerationHandler) -> None:
        name = str(key or "").strip().lower()
        if not name:
            raise ValueError("adapter key is required")
        if name in self._handlers:
            raise ValueError(f"adapter already registered: {name}")
        self._handlers[name] = handler

    async def dispatch(self, key: str, request: ImageGenerationRequest) -> Any:
        if request.target is None:
            raise ValueError("image adapter requests require a resolved connection/model/resource target")
        name = str(key or "").strip().lower()
        handler = self._handlers.get(name)
        if handler is None:
            raise LookupError(f"image adapter is not registered: {name}")
        return await handler(request)
