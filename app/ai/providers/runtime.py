"""Capability-based Provider dispatch for image, video, chat and discovery.

HTTP routes register protocol implementations once and dispatch only by a
normalized capability key. This prevents routes from accumulating Provider
specific ``if/elif`` branches.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any


Handler = Callable[..., Awaitable[Any]]


class ProviderRuntime:
    def __init__(self) -> None:
        self._handlers: dict[tuple[str, str], Handler] = {}

    def register(self, capability: str, protocol: str, handler: Handler) -> None:
        key = (str(capability).strip().lower(), str(protocol).strip().lower())
        if not all(key):
            raise ValueError("capability and protocol are required")
        if key in self._handlers:
            raise ValueError(f"provider handler already registered: {key}")
        self._handlers[key] = handler

    async def dispatch(self, capability: str, protocol: str, *args: Any, **kwargs: Any) -> Any:
        cap = str(capability).strip().lower()
        proto = str(protocol).strip().lower()
        handler = self._handlers.get((cap, proto)) or self._handlers.get((cap, "default"))
        if handler is None:
            raise LookupError(f"provider capability is not registered: {cap}/{proto}")
        return await handler(*args, **kwargs)
