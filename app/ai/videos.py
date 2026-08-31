"""Connection-target video gateway over protocol adapters."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.ai.contracts import Actor, VideoCommand
from app.ai.gateway import connection_operation


TargetVideoHandler = Callable[[VideoCommand], Awaitable[Any]]


class VideoGateway:
    """Route canonical video targets through one governed execution boundary."""

    def __init__(
        self,
        *,
        target_handler: TargetVideoHandler | None = None,
    ) -> None:
        self._target_handler = target_handler

    async def generate_target(self, command: VideoCommand, *, actor: Actor) -> Any:
        """Execute a video command resolved from canonical AI resources."""
        if self._target_handler is None:
            raise RuntimeError("target video handler is not configured")
        if command.target.model is None:
            raise ValueError("video command requires a model resource")
        async with connection_operation(command.target.connection.id, "video_generation", user_id=actor.user_id):
            return await self._target_handler(command)
