"""Connection discovery service independent of HTTP routes."""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import Any


class ConnectionDiscoveryService:
    def __init__(self, *, connection_loader: Callable[[str], Mapping[str, Any]], discoverer: Callable[..., Awaitable[dict[str, Any]]]):
        self._connection_loader = connection_loader
        self._discoverer = discoverer

    async def discover(self, connection_id: str) -> dict[str, Any]:
        connection = self._connection_loader(connection_id)
        if not connection:
            raise LookupError("unknown AI connection")
        return await self._discoverer(connection)
