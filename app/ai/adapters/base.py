"""Stable adapter protocol used by the AI gateway."""
from __future__ import annotations

from collections.abc import Awaitable, Mapping
from typing import Any, Protocol

from app.ai.domain import ResolvedTarget


class AIAdapter(Protocol):
    protocol: str
    capabilities: frozenset[str]

    async def execute(self, target: ResolvedTarget, command: Any, *, actor: Any) -> Any: ...

    def supports(self, target: ResolvedTarget, capability: str) -> bool:
        ...
