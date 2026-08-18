from __future__ import annotations
from typing import Any
from app.core.ws import manager
from app.core.utils import now_ms
from app.services.business_metadata import json_value, metadata_connection
from .store import append_event

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
        if payload.get("error"): node["generation_error"] = str(payload["error"])[:2000]
        result = payload.get("result")
        if status == "succeeded" and isinstance(result, dict):
            if result.get("images"): node["images"] = result["images"]
            if result.get("image_items"): node["image_items"] = result["image_items"]
        cur.execute("UPDATE smart_canvas_nodes SET data_json=%s,updated_at=EXTRACT(EPOCH FROM clock_timestamp())*1000 WHERE id=%s AND canvas_id=%s", (json_value(node), node_id, run["canvas_id"]))
        cur.execute("UPDATE smart_canvases SET version=version+1,updated_at=EXTRACT(EPOCH FROM clock_timestamp())*1000 WHERE id=%s RETURNING version", (run["canvas_id"],)); return int(cur.fetchone()["version"])

async def emit_agent_event(user_id: str, run_id: str, event_type: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    import asyncio
    event_payload = dict(payload or {})
    canvas_version = None
    if event_type.startswith("task."):
        canvas_version = await asyncio.to_thread(_project_task_to_canvas, user_id, run_id, event_payload)
        if canvas_version: event_payload["canvas_version"] = canvas_version
    event = await asyncio.to_thread(append_event, user_id, run_id, event_type, event_payload)
    message = {"type": "agent." + event_type, "run_id": run_id, "sequence": event["sequence"], "data": event.get("payload_json") or {}}
    await manager.broadcast_to_user(user_id, message, "agent." + event_type)
    if canvas_version:
        await manager.broadcast_canvas_updated(str((await asyncio.to_thread(_run_canvas_id, user_id, run_id)) or ""), now_ms(), "", user_id)
    return event

def _run_canvas_id(user_id: str, run_id: str) -> str:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT canvas_id FROM canvas_agent_runs WHERE id=%s AND user_id=%s", (run_id, user_id)); row = cur.fetchone(); return str(row["canvas_id"]) if row else ""
