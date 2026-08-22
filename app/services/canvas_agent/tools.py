"""Scoped LangChain tools for the Canvas Agent."""
from __future__ import annotations
import asyncio
from typing import Any, Awaitable, Callable
from langchain_core.tools import StructuredTool, tool
from app.models.canvas_agent import SemanticPlan
from .capabilities import CapabilityRegistry
from app.services.provider_parameters import capability_parameters
from .context import build_canvas_context
from .policy import assess_patch
from .adapter import semantic_plan_to_patch
from .store import latest_artifact, latest_plan, save_plan

def build_canvas_tools(*, user_id: str, run_id: str, canvas_id: str,
                       get_canvas: Callable[[], Awaitable[dict[str, Any]]] | None = None,
                       execute_patch: Callable[[SemanticPlan, dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
                       registry: CapabilityRegistry | None = None,
                       provider_loader: Callable[[], list[dict[str, Any]]] | None = None) -> list[StructuredTool]:
    """Create tools scoped to one authenticated Agent Run."""
    @tool
    async def read_canvas_context(selected_node_ids: list[str] | None = None) -> dict[str, Any]:
        """Read current canvas nodes, connections, and selected context."""
        return await asyncio.to_thread(build_canvas_context, user_id, canvas_id, selected_node_ids=selected_node_ids or [])

    @tool
    async def read_capability_registry() -> list[dict[str, Any]]:
        """List capabilities available to canvas nodes."""
        return (registry or CapabilityRegistry()).as_dict()

    @tool
    async def read_capability_parameters(capability: str, provider_id: str = "", model: str = "") -> dict[str, Any]:
        """Read the same node parameter schema used by the canvas configuration UI."""
        return await asyncio.to_thread(
            capability_parameters,
            capability=capability,
            provider_id=provider_id,
            model=model,
            provider_loader=provider_loader,
        )

    @tool
    async def read_artifact(artifact_type: str = "") -> dict[str, Any] | None:
        """Read the latest artifact owned by this Agent Run."""
        return await asyncio.to_thread(latest_artifact, user_id, run_id, artifact_type)

    @tool(args_schema=SemanticPlan)
    async def propose_canvas_patch(**plan_fields: Any) -> dict[str, Any]:
        """Validate and persist a complete canvas plan without changing the canvas."""
        semantic_plan = SemanticPlan.model_validate(plan_fields)
        canvas = await (get_canvas() if get_canvas else read_canvas_context.ainvoke({}))
        patch = semantic_plan_to_patch(semantic_plan, canvas_id, int(canvas.get("canvas_version") or canvas.get("version") or 1), canvas=canvas)
        assessment = assess_patch(patch)
        saved = await asyncio.to_thread(save_plan, user_id, run_id, semantic_plan.model_dump(mode="json"), status="awaiting_confirmation")
        return {"status": "awaiting_confirmation", "plan_version": saved["version"], "plan": semantic_plan.model_dump(mode="json"), "risk": assessment["risk"], "requires_confirmation": True, "operation_count": assessment["operation_count"]}

    @tool
    async def request_clarification(question: str) -> dict[str, Any]:
        """Ask the user for missing canvas information."""
        return {"requires_user_input": True, "question": str(question)[:2000]}

    @tool
    async def execute_canvas_patch(plan_version: int, authorized_node_ids: list[str] | None = None) -> dict[str, Any]:
        """Execute an approved plan through the existing Patch Executor."""
        if execute_patch is None: raise RuntimeError("Canvas execution boundary is not configured")
        row = await asyncio.to_thread(latest_plan, user_id, run_id)
        if not row or int(row["version"]) != int(plan_version): raise ValueError("计划版本已过期")
        return await execute_patch(SemanticPlan.model_validate(row["content_json"]), {"authorized_node_ids": authorized_node_ids or []})

    return [read_canvas_context, read_capability_registry, read_capability_parameters, read_artifact, propose_canvas_patch, request_clarification, execute_canvas_patch]
