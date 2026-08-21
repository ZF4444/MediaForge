from __future__ import annotations
from typing import Any
from app.models.canvas_agent import CanvasPatch, SemanticPlan

_NODE_TYPES = {
    "prompt": "smart-prompt", "smart-prompt": "smart-prompt",
    "image_generation": "smart-image", "video_generation": "smart-image", "workflow_generation": "smart-image",
    "smart-image": "smart-image", "group": "smart-group", "smart-group": "smart-group",
}
_GENERATION_DEFAULTS = {
    "image_generation": {"genKind": "image", "runSettings": {"engine": "api", "apiKind": "image"}},
    "video_generation": {"genKind": "video", "runSettings": {"engine": "api", "apiKind": "video"}},
    "workflow_generation": {"genKind": "workflow", "runSettings": {"engine": "comfy", "comfyWorkflow": "", "comfyParams": {}}},
    "smart-image": {"genKind": "image", "runSettings": {"engine": "api", "apiKind": "image"}},
}

def semantic_plan_to_patch(plan: SemanticPlan, canvas_id: str, base_version: int, canvas: dict[str, Any] | None = None) -> CanvasPatch:
    refs: dict[str, str] = {}
    operations: list[dict[str, Any]] = []
    existing = list((canvas or {}).get("nodes") or [])
    next_x = max([float(node.get("x", 0) or 0) for node in existing if isinstance(node, dict)] or [0]) + 360
    next_y = max([float(node.get("y", 0) or 0) for node in existing if isinstance(node, dict)] or [0])
    create_index = 0
    for step in plan.steps:
        if step.action == "canvas.create_node":
            node = step.node
            if node is None:
                raise ValueError(f"create_node step {step.id} requires node")
            node_type = _NODE_TYPES.get(node.semantic_type)
            if node_type is None:
                raise ValueError(f"unsupported semantic node type: {node.semantic_type}")
            refs[step.id] = step.id
            defaults = _GENERATION_DEFAULTS.get(node.semantic_type, {})
            # Defaults mirror the manual creation path, while params may supply
            # a selected workflow/model. Type and domain-owned fields stay fixed.
            node_data = {**defaults, **node.params, "type": node_type, "title": node.title, "text": node.content, "capability": node.capability}
            operations.append({"op": "add_node", "client_ref": step.id, "placement": step.placement or {"x": next_x + (create_index % 3) * 360, "y": next_y + (create_index // 3) * 260}, "node": node_data})
            create_index += 1
        elif step.action in {"canvas.update_node_params", "canvas.replace_node_content", "canvas.run_node", "canvas.run_group"}:
            operations.append({"op": step.action.removeprefix("canvas."), "node_id": step.target_node_id, "params": (step.node.params if step.node else {}), "content": (step.node.content if step.node else "")})
        elif step.action == "canvas.connect":
            operations.append({"op": "add_connection", "from_ref": refs.get(step.from_step, step.from_step), "to_ref": refs.get(step.to_step, step.to_step), "connection": {"kind": step.relation or "default"}})
    return CanvasPatch(canvas_id=canvas_id, base_version=base_version, operations=operations)
