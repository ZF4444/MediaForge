"""Adapter wrapper for legacy handlers during the migration period."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.ai.domain import ResolvedTarget


class LegacyCallableAdapter:
    """Expose an existing async handler through the stable adapter contract."""

    def __init__(self, protocol: str, handler: Callable[..., Awaitable[Any]], capabilities: frozenset[str] = frozenset()):
        self.protocol = protocol
        self.handler = handler
        self.capabilities = capabilities

    def supports(self, target: ResolvedTarget, capability: str) -> bool:
        return target.protocol == self.protocol and capability in self.capabilities

    async def execute(self, target: ResolvedTarget, command: Any, *, actor: Any) -> Any:
        return await self.handler(command, target=target, actor=actor)
