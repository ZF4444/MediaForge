"""ComfyUI workflow executable-resource adapter."""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from app.ai.contracts import WorkflowCommand
from app.ai.domain import ResolvedTarget


class ComfyUIWorkflowAdapter:
    protocol = "comfyui_workflow"
    capabilities = frozenset({"run_workflow"})

    def __init__(self, execute: Callable[[ResolvedTarget, Mapping[str, Any]], Awaitable[Any]]):
        self._execute = execute

    def supports(self, target: ResolvedTarget, capability: str) -> bool:
        return target.protocol in {self.protocol, "comfyui", "local"} and capability == "run_workflow"

    async def execute(self, target: ResolvedTarget, command: WorkflowCommand, *, actor: Any) -> Any:
        if not self.supports(target, "run_workflow"):
            raise ValueError("target is not a ComfyUI workflow resource")
        return await self._execute(target, dict(command.inputs))
