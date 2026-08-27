from __future__ import annotations
from contextvars import ContextVar
from typing import Any
from app.core.ws import manager
from app.core.utils import now_ms
from app.services.business_metadata import json_value, metadata_connection
from .store import update_execution_message_reference
from .event_bus import AgentEventService

_operation_id: ContextVar[str] = ContextVar("canvas_agent_operation_id", default="")

def set_current_operation(operation_id: str):
    return _operation_id.set(str(operation_id or ""))

def reset_current_operation(token) -> None:
    _operation_id.reset(token)

def current_operation_id() -> str:
    return _operation_id.get()


def _task_projection(node: dict[str, Any], payload: dict[str, Any], status: str) -> tuple[list[dict[str, Any]], int]:
    """Apply one task lifecycle event to the node's durable task projection."""
    task_id = str(payload.get("task_id") or "")
    existing = node.get("pendingTasks") if isinstance(node.get("pendingTasks"), list) else []
    previous = next((dict(item) for item in existing if isinstance(item, dict) and str(item.get("taskId") or "") == task_id), {})
    tasks = [dict(item) for item in existing if isinstance(item, dict) and str(item.get("taskId") or "") and str(item.get("taskId") or "") != task_id]
    if status in {"queued", "running"} and task_id:
        try:
            expected_count = max(1, int(payload.get("expected_count") or previous.get("expectedCount") or 1))
        except (TypeError, ValueError):
            expected_count = 1
        tasks.append({
            "taskId": task_id,
            "kind": str(payload.get("kind") or previous.get("kind") or "image"),
            "providerId": str(payload.get("provider_id") or previous.get("providerId") or ""),
            "model": str(payload.get("model") or previous.get("model") or ""),
            "expectedCount": expected_count,
            "status": status,
        })
    pending = max([len(tasks), *[
        max(1, int(item.get("expectedCount") or 1))
        for item in tasks
    ]], default=0)
    return tasks, pending


def _sync_node_task_state(node: dict[str, Any], payload: dict[str, Any], status: str) -> None:
    tasks, pending = _task_projection(node, payload, status)
    if tasks:
        node["pendingTasks"] = tasks
        node["pending"] = pending
        node["pendingCandidatePool"] = any((item.get("kind") or "image") == "image" for item in tasks)
        node["queued"] = any(item.get("status") == "queued" for item in tasks)
        node["running"] = any(item.get("status") == "running" for item in tasks)
        return
    node["pending"] = 0
    node.pop("pendingTasks", None)
    node.pop("pendingCandidatePool", None)
    node.pop("queued", None)
    node.pop("running", None)


def _project_task_to_canvas(user_id: str, run_id: str, payload: dict[str, Any]) -> int | None:
    node_id = str(payload.get("node_id") or "")
    if not node_id: return None
    status = str(payload.get("status") or "")
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT canvas_id FROM canvas_agent_runs WHERE id=%s AND user_id=%s FOR SHARE", (run_id, user_id)); run = cur.fetchone()
        if not run: return None
        cur.execute("SELECT data_json FROM smart_canvas_nodes WHERE id=%s AND canvas_id=%s FOR UPDATE", (node_id, run["canvas_id"])); row = cur.fetchone()
        if not row: return None
        node = dict(row["data_json"] or {})
        node["generation_task_id"] = payload.get("task_id") or node.get("generation_task_id")
        node["generation_status"] = status
        task_id = str(payload.get("task_id") or "")
        existing_tasks = node.get("pendingTasks") if isinstance(node.get("pendingTasks"), list) else []
        continuing_task = any(str(item.get("taskId") or "") == task_id for item in existing_tasks if isinstance(item, dict))
        if status in {"queued", "running"}:
            _sync_node_task_state(node, payload, status)
            if status == "queued" and not continuing_task:
                node["runStartedAt"] = now_ms()
            elif not isinstance(node.get("runStartedAt"), (int, float)) or node["runStartedAt"] <= 0:
                node["runStartedAt"] = now_ms()
            node["runTimerHidden"] = False
            node.pop("runFinishedAt", None)
            node.pop("runElapsedMs", None)
            node.pop("generation_error", None)
        else:
            _sync_node_task_state(node, payload, status)
            finished_at = now_ms()
            started_at = node.get("runStartedAt")
            if not isinstance(started_at, (int, float)) or started_at <= 0:
                started_at = finished_at
                node["runStartedAt"] = started_at
            node["runFinishedAt"] = finished_at
            node["runElapsedMs"] = max(0, finished_at - started_at)
            node["runTimerHidden"] = False
        if status == "succeeded":
            node.pop("generation_error", None)
        elif status not in {"queued", "running"}:
            if payload.get("error"): node["generation_error"] = str(payload["error"])[:2000]
        result = payload.get("result")
        if status == "succeeded" and isinstance(result, dict):
            # Prefer the structured media entries: URLs alone discard the
            # intrinsic dimensions required to preserve canvas node ratios.
            if result.get("image_items"): node["images"] = result["image_items"]
            elif result.get("images"): node["images"] = result["images"]
            if result.get("image_items"): node["image_items"] = result["image_items"]
        cur.execute("UPDATE smart_canvas_nodes SET data_json=%s,updated_at=EXTRACT(EPOCH FROM clock_timestamp())*1000 WHERE id=%s AND canvas_id=%s", (json_value(node), node_id, run["canvas_id"]))
        cur.execute("UPDATE smart_canvases SET version=version+1,updated_at=EXTRACT(EPOCH FROM clock_timestamp())*1000 WHERE id=%s RETURNING version", (run["canvas_id"],)); return int(cur.fetchone()["version"])

async def emit_agent_event(user_id: str, run_id: str, event_type: str, payload: dict[str, Any] | None = None, *, operation_id: str | None = None, phase: str = "", severity: str = "info") -> dict[str, Any]:
    import asyncio
    event_payload = dict(payload or {})
    requested_phase = phase or str(event_payload.get("phase") or "")
    if event_type == "progress" and requested_phase:
        progress_type = f"progress.{requested_phase}"
        if progress_type in {"progress.context", "progress.model", "progress.agent", "progress.tool_started", "progress.tool_completed", "progress.tool_failed", "progress.validation", "progress.confirmation", "progress.execution"}:
            event_type = progress_type
            phase = "tool" if requested_phase.startswith("tool_") else requested_phase
    canvas_version = None
    if event_type.startswith("task."):
        canvas_version = await asyncio.to_thread(_project_task_to_canvas, user_id, run_id, event_payload)
        if event_type == "task.succeeded":
            result = event_payload.get("result") if isinstance(event_payload.get("result"), dict) else {}
            media_items = result.get("image_items") if isinstance(result.get("image_items"), list) else []
            if media_items:
                await asyncio.to_thread(update_execution_message_reference, user_id, run_id, str(event_payload.get("node_id") or ""), media_items[0])
        if canvas_version: event_payload["canvas_version"] = canvas_version
    event = await AgentEventService.append(user_id=user_id, run_id=run_id, event_type=event_type, payload=event_payload, operation_id=operation_id or _operation_id.get() or None, phase=phase or requested_phase, severity=severity)
    if canvas_version:
        await manager.broadcast_canvas_updated(str((await asyncio.to_thread(_run_canvas_id, user_id, run_id)) or ""), now_ms(), "", user_id)
    return event

def _run_canvas_id(user_id: str, run_id: str) -> str:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT canvas_id FROM canvas_agent_runs WHERE id=%s AND user_id=%s", (run_id, user_id)); row = cur.fetchone(); return str(row["canvas_id"]) if row else ""
