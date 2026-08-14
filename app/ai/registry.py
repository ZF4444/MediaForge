"""Protocol-neutral registry for AI provider adapters."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Mapping


@dataclass(frozen=True)
class ImageGenerationRequest:
    prompt: str
    size: str
    quality: str
    model: str
    reference_images: list[dict[str, Any]]
    provider: Mapping[str, Any]


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
        name = str(key or "").strip().lower()
        handler = self._handlers.get(name)
        if handler is None:
            raise LookupError(f"image adapter is not registered: {name}")
        return await handler(request)
