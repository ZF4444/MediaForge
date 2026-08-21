"""Submit approved generation intents through the existing Canvas Task queue."""
from __future__ import annotations
import uuid
import asyncio
import time
from app.config import CANVAS_TASK_TIMEOUT_SECONDS
from typing import Any
from app.services.business_metadata import load_canvas_payload
from app.services.canvas_tasks import create_canvas_task, enqueue_canvas_task
from .capabilities import from_provider_configuration

async def submit_run_requests(user_id: str, canvas_id: str, run_id: str, requests: list[dict[str, Any]], *, prompt: str, prompts_by_node: dict[str, str] | None = None) -> list[dict[str, Any]]:
    canvas = await asyncio.to_thread(load_canvas_payload, user_id, canvas_id)
    if not canvas: raise PermissionError("canvas not found")
    nodes = {str(node.get("id")): node for node in canvas.get("nodes", []) if isinstance(node, dict)}
    registry = await asyncio.to_thread(from_provider_configuration)
    capability = registry.get("image.text_to_image")
    submitted = []
    for item in requests:
        if item.get("op") != "run_node": continue
        node = nodes.get(str(item.get("node_id") or ""))
        if not node: continue
        if node.get("type") == "smart-prompt":
            # Prompt generation is currently persisted on the node by the
            # caller/model flow; it is not an online-image queue task.
            continue
        if node.get("type") != "smart-image" or capability is None: continue
        task_id = f"canvas_agent_img_{uuid.uuid4().hex}"
        request = {"prompt": (prompts_by_node or {}).get(node["id"], prompt), "provider_id": node.get("provider_id") or capability.provider_id, "model": node.get("model") or capability.model, "size": "1024x1792", "quality": "auto", "n": 1, "reference_images": []}
        # Reuse the existing access-control resolver; the Agent never chooses
        # an unapproved provider/model pair directly.
        from main import require_model_access
        await asyncio.to_thread(require_model_access, request["provider_id"], request["model"])
        await create_canvas_task({"id": task_id, "type": "online-image", "status": "queued", "provider_id": request["provider_id"], "model": request["model"], "owner_id": user_id, "agent_run_id": run_id, "agent_node_id": node["id"], "deadline_at": time.time() + CANVAS_TASK_TIMEOUT_SECONDS, "attempt": 1, "request": request})
        await enqueue_canvas_task(task_id)
        submitted.append({"task_id": task_id, "node_id": node["id"], "status": "queued"})
    return submitted
