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
        return (
            target.protocol in {self.protocol, "comfyui", "local"}
            and capability == "run_workflow"
            and target.resource is not None
            and target.resource.kind == "comfyui_workflow"
            and bool(target.resource.id)
        )

    @staticmethod
    def normalize_inputs(target: ResolvedTarget, inputs: Mapping[str, Any]) -> dict[str, Any]:
        """Build the worker payload with authoritative resource identifiers."""
        if target.resource is None or target.resource.kind != "comfyui_workflow":
            raise ValueError("ComfyUI workflow target must include a workflow resource")
        payload = dict(inputs)
        payload.pop("provider", None)
        payload.pop("provider_id", None)
        payload.pop("model", None)
        payload["connection_id"] = target.connection.id
        payload["resource_id"] = target.resource.id
        return payload

    async def execute(self, target: ResolvedTarget, command: WorkflowCommand, *, actor: Any) -> Any:
        if not self.supports(target, "run_workflow"):
            raise ValueError("target is not a ComfyUI workflow resource")
        return await self._execute(target, self.normalize_inputs(target, command.inputs))
