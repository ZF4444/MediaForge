"""Protocol-neutral dispatch registry for executable AI capabilities."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

Handler = Callable[..., Awaitable[Any]]


class CapabilityRuntime:
    def __init__(self) -> None:
        self._handlers: dict[tuple[str, str], Handler] = {}

    def register(self, capability: str, protocol: str, handler: Handler) -> None:
        key = (str(capability).strip().lower(), str(protocol).strip().lower())
        if not all(key):
            raise ValueError("capability and protocol are required")
        if key in self._handlers:
            raise ValueError(f"capability handler already registered: {key}")
        self._handlers[key] = handler

    async def dispatch(self, capability: str, protocol: str, *args: Any, **kwargs: Any) -> Any:
        cap = str(capability).strip().lower()
        proto = str(protocol).strip().lower()
        handler = self._handlers.get((cap, proto)) or self._handlers.get((cap, "default"))
        if handler is None:
            raise LookupError(f"capability is not registered: {cap}/{proto}")
        return await handler(*args, **kwargs)
