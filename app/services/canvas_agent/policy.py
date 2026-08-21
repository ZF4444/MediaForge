from __future__ import annotations
from app.models.canvas_agent import CanvasPatch

SAFE_OPS = {"add_node", "move_node", "add_connection", "remove_connection", "add_group"}
CONFIRM_OPS = {"update_node_params", "replace_node_content", "run_node", "run_group"}


def assess_patch(patch: CanvasPatch) -> dict[str, object]:
    risks = ["confirm" if op.op in CONFIRM_OPS else "safe" for op in patch.operations]
    return {"risk": "confirm" if "confirm" in risks else "safe", "requires_confirmation": "confirm" in risks, "operation_count": len(risks)}


def validate_patch(patch: CanvasPatch, *, allow_user_node_changes: bool = False, authorized_node_ids: set[str] | None = None) -> None:
    if not patch.canvas_id: raise ValueError("canvas_id is required")
    if patch.base_version < 1: raise ValueError("base_version must be positive")
    refs = set()
    for op in patch.operations:
        if op.op not in SAFE_OPS | CONFIRM_OPS: raise ValueError(f"operation not allowed: {op.op}")
        if op.op == "add_node":
            if not op.client_ref or not op.node.get("type"): raise ValueError("add_node requires client_ref and node.type")
            refs.add(op.client_ref)
        if op.op in {"update_node_params", "replace_node_content", "move_node", "run_node", "run_group"} and not op.node_id:
            raise ValueError(f"{op.op} requires node_id")
        if op.op in CONFIRM_OPS and op.node_id.startswith("user:") and (not allow_user_node_changes or op.node_id not in (authorized_node_ids or set())):
            raise PermissionError("user node modification requires explicit authorization for this node")
        if op.op == "add_connection" and (not op.from_ref or not op.to_ref): raise ValueError("connection requires both endpoints")
