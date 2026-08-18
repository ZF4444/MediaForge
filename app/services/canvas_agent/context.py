"""Bounded canvas projection supplied to the planner."""
from __future__ import annotations
from typing import Any
from app.services.business_metadata import load_canvas_payload

def build_canvas_context(user_id: str, canvas_id: str, *, selected_node_ids: list[str] = (), mention_node_ids: list[str] = (), run_node_ids: list[str] = ()) -> dict[str, Any]:
    canvas = load_canvas_payload(user_id, canvas_id)
    if canvas is None: raise PermissionError("canvas not found or not owned by user")
    nodes = [node for node in canvas.get("nodes", []) if isinstance(node, dict)]
    wanted = set(selected_node_ids) | set(mention_node_ids) | set(run_node_ids)
    selected = [node for node in nodes if not wanted or str(node.get("id")) in wanted]
    return {"canvas_id": canvas_id, "canvas_version": int(canvas.get("version") or 1), "selected_nodes": selected[:50], "node_count": len(nodes), "connections": list(canvas.get("connections") or [])[:200]}
