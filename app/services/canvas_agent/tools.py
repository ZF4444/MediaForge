"""Small read-only tool functions exposed to a future model planner."""
from __future__ import annotations
from typing import Any
from .capabilities import CapabilityRegistry
from .context import build_canvas_context
from .store import latest_artifact

def read_canvas_context(user_id: str, canvas_id: str, selected_node_ids: list[str] | None = None) -> dict[str, Any]:
    """Read the current canvas context for the requested user and canvas."""
    return build_canvas_context(user_id, canvas_id, selected_node_ids=selected_node_ids or [])

def read_capability_registry(registry: CapabilityRegistry) -> list[dict[str, Any]]:
    return registry.as_dict()

def read_artifact(user_id: str, run_id: str, artifact_type: str = "") -> dict[str, Any] | None:
    return latest_artifact(user_id, run_id, artifact_type)

def submit_semantic_plan(plan: dict[str, Any]) -> dict[str, Any]:
    """Validate-only boundary: this never applies a Patch or submits a task."""
    from app.models.canvas_agent import SemanticPlan
    return SemanticPlan.model_validate(plan).model_dump(mode="json")

def request_clarification(question: str) -> dict[str, Any]:
    """Return a clarification request that pauses planning for user input."""
    return {"schema_version": 1, "question": str(question)[:2000], "requires_user_input": True}
