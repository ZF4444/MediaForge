"""Submit approved generation intents through the existing Canvas Task queue."""
from __future__ import annotations
import uuid
import asyncio
import time
from app.config import CANVAS_TASK_TIMEOUT_SECONDS
from app.ai.runtime import authorize_image_task, normalize_canvas_image_payload
from typing import Any
from app.services.business_metadata import load_canvas_payload
from app.services.canvas_tasks import create_canvas_task, enqueue_canvas_task
from .capabilities import from_provider_configuration


def _image_request_for_node(node: dict[str, Any], fallback_capability: Any, fallback_prompt: str,
                            prompts_by_node: dict[str, str] | None) -> dict[str, Any]:
    """Use the same persisted runSettings contract as manually-run image nodes."""
    settings = node.get("runSettings") if isinstance(node.get("runSettings"), dict) else {}
    if str(node.get("genKind") or "image") != "image" or str(settings.get("apiKind") or "image") != "image":
        raise ValueError("指定节点不是 API 生图节点")
    provider_id = str(settings.get("provider_id") or node.get("provider_id") or fallback_capability.provider_id or "")
    model = str(settings.get("model") or node.get("model") or fallback_capability.model or "")
    if not provider_id or not model:
        raise ValueError("指定生图节点未配置平台或模型")
    prompt = str((prompts_by_node or {}).get(node["id"]) or node.get("text") or fallback_prompt or "").strip()
    if not prompt:
        raise ValueError("指定生图节点缺少提示词")
    count = settings.get("count", settings.get("n", 1))
    try:
        count = min(4, max(1, int(count)))
    except (TypeError, ValueError):
        count = 1
    # Keep the raw canvas settings with the task. The normal canvas endpoint
    # resolves provider parameter mappings from this object before execution.
    request = {
        "prompt": prompt,
        "provider_id": provider_id,
        "model": model,
        "size": "1024x1024",
        "quality": str(settings.get("quality") or "auto"),
        "n": count,
        "reference_images": [],
        "run_settings": settings,
    }
    # Agent tasks enter the Redis queue directly, whereas manual canvas runs
    # pass through this normalizer in the HTTP endpoint. Reuse it here so
    # both paths use identical ratio/size and provider-field conversion.
    from app.models import OnlineImageRequest
    return normalize_canvas_image_payload(OnlineImageRequest.model_validate(request)).model_dump(mode="json")


async def submit_run_requests(user_id: str, canvas_id: str, run_id: str, requests: list[dict[str, Any]], *, prompt: str, prompts_by_node: dict[str, str] | None = None) -> list[dict[str, Any]]:
    canvas = await asyncio.to_thread(load_canvas_payload, user_id, canvas_id)
    if not canvas: raise PermissionError("canvas not found")
    nodes = {str(node.get("id")): node for node in canvas.get("nodes", []) if isinstance(node, dict)}
    registry = await asyncio.to_thread(from_provider_configuration)
    capability = registry.get("image.text_to_image")
    submitted = []
    for item in requests:
        if item.get("op") != "run_node":
            raise ValueError(f"暂不支持执行操作：{item.get('op') or 'unknown'}")
        node = nodes.get(str(item.get("node_id") or ""))
        if not node:
            raise ValueError("指定的画布节点不存在")
        if node.get("type") == "smart-prompt":
            # Prompt generation is currently persisted on the node by the
            # caller/model flow; it is not an online-image queue task.
            raise ValueError("提示词节点不能直接执行生图，请指定生图节点")
        if node.get("type") != "smart-image":
            raise ValueError("指定节点不是生图节点")
        if capability is None:
            raise ValueError("当前没有可用的生图模型")
        task_id = f"canvas_agent_img_{uuid.uuid4().hex}"
        request = _image_request_for_node(node, capability, prompt, prompts_by_node)
        # Reuse the existing access-control resolver; the Agent never chooses
        # an unapproved provider/model pair directly.
        await authorize_image_task(request["provider_id"], request["model"], user_id)
        await create_canvas_task({"id": task_id, "type": "online-image", "status": "queued", "provider_id": request["provider_id"], "model": request["model"], "owner_id": user_id, "agent_run_id": run_id, "agent_node_id": node["id"], "deadline_at": time.time() + CANVAS_TASK_TIMEOUT_SECONDS, "attempt": 1, "request": request})
        # Queue submission is the first authoritative lifecycle transition.
        # Project it immediately so the canvas node shows a pending state
        # before a worker claims the task and begins image generation.
        from .events import emit_agent_event
        await emit_agent_event(user_id, run_id, "task.queued", {
            "task_id": task_id,
            "node_id": node["id"],
            "status": "queued",
            "provider_id": request["provider_id"],
            "model": request["model"],
            "kind": "image",
            "expected_count": request["n"],
        })
        # The queued projection must be committed before workers can claim the
        # task. Otherwise a fast success can be overwritten by a late queued
        # event and leave the node permanently disabled.
        await enqueue_canvas_task(task_id)
        submitted.append({"task_id": task_id, "node_id": node["id"], "status": "queued"})
    return submitted
