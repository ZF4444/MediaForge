"""Bounded canvas projection supplied to the planner."""
from __future__ import annotations
from typing import Any
from app.services.business_metadata import load_canvas_payload

def build_canvas_context(user_id: str, canvas_id: str, *, selected_node_ids: list[str] = (), mention_node_ids: list[str] = (), run_node_ids: list[str] = (), media_references: list[dict[str, Any]] = ()) -> dict[str, Any]:
    canvas = load_canvas_payload(user_id, canvas_id)
    if canvas is None: raise PermissionError("canvas not found or not owned by user")
    nodes = [node for node in canvas.get("nodes", []) if isinstance(node, dict)]
    wanted = set(selected_node_ids) | set(mention_node_ids) | set(run_node_ids)
    selected = [node for node in nodes if not wanted or str(node.get("id")) in wanted]
    by_id = {str(node.get("id")): node for node in nodes}
    references = []
    for raw in media_references or []:
        if not isinstance(raw, dict):
            continue
        node_id = str(raw.get("node_id") or raw.get("nodeId") or "")
        source = str(raw.get("source") or "canvas")
        if source == "asset":
            url = str(raw.get("url") or "").strip()
            if url:
                references.append({"node_id": "", "image_index": 0, "url": url, "label": f"图{len(references) + 1}", "node_label": str(raw.get("name") or "资产库素材"), "source": "asset"})
            continue
        try:
            image_index = int(raw.get("image_index", raw.get("imageIndex", 0)))
        except (TypeError, ValueError):
            continue
        node = by_id.get(node_id)
        if bool(raw.get("empty")) and node:
            references.append({"node_id": node_id, "image_index": -1, "url": "", "label": f"图{len(references) + 1}", "node_label": str(node.get("title") or node.get("name") or node_id), "source": "canvas", "empty": True})
            continue
        images = node.get("images") if node else None
        if not isinstance(images, list) or image_index < 0 or image_index >= len(images):
            continue
        image = images[image_index]
        if not isinstance(image, dict):
            continue
        url = str(image.get("url") or image.get("preview_url") or image.get("previewUrl") or "").strip()
        if not url:
            continue
        references.append({"node_id": node_id, "image_index": image_index, "url": url, "label": f"图{len(references) + 1}", "node_label": str(node.get("title") or node.get("name") or node_id), "source": "canvas"})
    return {"canvas_id": canvas_id, "canvas_version": int(canvas.get("version") or 1), "selected_nodes": selected[:50], "node_count": len(nodes), "connections": list(canvas.get("connections") or [])[:200], "media_references": references}
