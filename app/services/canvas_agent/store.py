"""Authoritative PostgreSQL persistence for Canvas Agent business facts."""
from __future__ import annotations

from typing import Any
from app.core.utils import now_ms
from app.services.business_metadata import json_value, metadata_connection, new_id
from app.models.canvas_agent import SCHEMA_VERSION

def _json(value: Any) -> dict[str, Any]:
    value = dict(value or {})
    value.setdefault("schema_version", SCHEMA_VERSION)
    return value

def create_run(user_id: str, canvas_id: str, *, mode: str = "fast_track", conversation_id: str = "", base_canvas_version: int | None = None, max_steps: int = 12, run_id: str | None = None) -> dict[str, Any]:
    rid = run_id or new_id(); now = now_ms()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        if base_canvas_version is None:
            cur.execute("SELECT version FROM smart_canvases WHERE id=%s AND user_id=%s AND deleted_at IS NULL FOR SHARE", (canvas_id, user_id)); row = cur.fetchone()
            if not row: raise PermissionError("canvas not found or not owned by user")
            base_canvas_version = int(row["version"] or 1)
        cur.execute("INSERT INTO canvas_agent_runs(id,user_id,canvas_id,conversation_id,mode,status,phase,base_canvas_version,max_steps,created_at,updated_at,metadata_json) VALUES(%s,%s,%s,%s,%s,'created','planning',%s,%s,%s,%s,%s)", (rid,user_id,canvas_id,conversation_id,mode,base_canvas_version,max_steps,now,now,json_value(_json({}))))
    return get_run(user_id, rid) or {"id": rid}

def get_run(user_id: str, run_id: str) -> dict[str, Any] | None:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM canvas_agent_runs WHERE id=%s AND user_id=%s", (run_id,user_id)); return cur.fetchone()

def list_runs(user_id: str, canvas_id: str, *, limit: int = 50) -> list[dict[str, Any]]:
    """Return lightweight Run summaries for the current canvas switcher."""
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT r.*,
                   COALESCE((
                       SELECT m.content FROM canvas_agent_messages m
                       WHERE m.run_id = r.id AND m.role = 'user'
                       ORDER BY m.sequence LIMIT 1
                   ), '') AS title
            FROM canvas_agent_runs r
            WHERE r.user_id=%s AND r.canvas_id=%s
            ORDER BY r.updated_at DESC
            LIMIT %s
        """, (user_id, canvas_id, max(1, min(int(limit), 100))))
        return cur.fetchall()

def update_run(user_id: str, run_id: str, **changes: Any) -> dict[str, Any] | None:
    allowed = {"status", "phase", "step_count", "max_steps", "base_canvas_version", "conversation_id", "metadata_json"}
    updates = [(key, value) for key, value in changes.items() if key in allowed]
    if not updates: return get_run(user_id, run_id)
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        if any(key == "metadata_json" for key, _ in updates):
            cur.execute("SELECT metadata_json FROM canvas_agent_runs WHERE id=%s AND user_id=%s FOR UPDATE", (run_id, user_id))
            current = cur.fetchone()
            if not current: return None
            merged = dict(current.get("metadata_json") or {})
            incoming = next(value for key, value in updates if key == "metadata_json")
            merged.update(dict(incoming or {}))
            updates = [(key, merged if key == "metadata_json" else value) for key, value in updates]
        assignments = ", ".join(f"{key}=%s" for key, _ in updates)
        values = [value if key != "metadata_json" else json_value(_json(value)) for key, value in updates]
        cur.execute(f"UPDATE canvas_agent_runs SET {assignments},updated_at=%s WHERE id=%s AND user_id=%s RETURNING *", (*values, now_ms(), run_id, user_id)); return cur.fetchone()

def list_messages(user_id: str, run_id: str) -> list[dict[str, Any]]:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT m.* FROM canvas_agent_messages m JOIN canvas_agent_runs r ON r.id=m.run_id WHERE m.run_id=%s AND r.user_id=%s ORDER BY m.sequence", (run_id,user_id)); return cur.fetchall()

def latest_plan(user_id: str, run_id: str) -> dict[str, Any] | None:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT p.* FROM canvas_agent_plans p JOIN canvas_agent_runs r ON r.id=p.run_id WHERE p.run_id=%s AND r.user_id=%s ORDER BY p.version DESC LIMIT 1", (run_id,user_id)); return cur.fetchone()

def list_operations(user_id: str, run_id: str) -> list[dict[str, Any]]:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT o.* FROM canvas_agent_operations o JOIN canvas_agent_runs r ON r.id=o.run_id WHERE o.run_id=%s AND r.user_id=%s ORDER BY o.created_at", (run_id, user_id))
        return cur.fetchall()

def latest_artifact(user_id: str, run_id: str, artifact_type: str = "") -> dict[str, Any] | None:
    with metadata_connection() as conn, conn.cursor() as cur:
        if artifact_type:
            cur.execute("SELECT a.* FROM canvas_agent_artifacts a JOIN canvas_agent_runs r ON r.id=a.run_id WHERE a.run_id=%s AND r.user_id=%s AND a.type=%s ORDER BY a.version DESC LIMIT 1", (run_id,user_id,artifact_type))
        else:
            cur.execute("SELECT a.* FROM canvas_agent_artifacts a JOIN canvas_agent_runs r ON r.id=a.run_id WHERE a.run_id=%s AND r.user_id=%s ORDER BY a.updated_at DESC LIMIT 1", (run_id,user_id))
        return cur.fetchone()

def list_artifacts(user_id: str, run_id: str, *, artifact_type: str = "") -> list[dict[str, Any]]:
    with metadata_connection() as conn, conn.cursor() as cur:
        if artifact_type:
            cur.execute("SELECT a.* FROM canvas_agent_artifacts a JOIN canvas_agent_runs r ON r.id=a.run_id WHERE a.run_id=%s AND r.user_id=%s AND a.type=%s ORDER BY a.type,a.version", (run_id, user_id, artifact_type))
        else:
            cur.execute("SELECT a.* FROM canvas_agent_artifacts a JOIN canvas_agent_runs r ON r.id=a.run_id WHERE a.run_id=%s AND r.user_id=%s ORDER BY a.type,a.version", (run_id, user_id))
        return cur.fetchall()

def get_artifact(user_id: str, run_id: str, artifact_id: str) -> dict[str, Any] | None:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT a.* FROM canvas_agent_artifacts a JOIN canvas_agent_runs r ON r.id=a.run_id WHERE a.id=%s AND a.run_id=%s AND r.user_id=%s", (artifact_id, run_id, user_id))
        return cur.fetchone()

def append_message(user_id: str, run_id: str, role: str, content: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    mid = new_id(); now = now_ms()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT 1 FROM canvas_agent_runs WHERE id=%s AND user_id=%s FOR UPDATE", (run_id,user_id))
        if not cur.fetchone(): raise PermissionError("run not found")
        cur.execute("SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM canvas_agent_messages WHERE run_id=%s", (run_id,)); sequence = int(cur.fetchone()["sequence"])
        cur.execute("INSERT INTO canvas_agent_messages(id,run_id,role,content,sequence,created_at,metadata_json) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING *", (mid,run_id,role,content,sequence,now,json_value(_json(metadata))))
        return cur.fetchone()

def save_plan(user_id: str, run_id: str, content: dict[str, Any], *, status: str = "draft") -> dict[str, Any]:
    now = now_ms(); body = _json(content)
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT 1 FROM canvas_agent_runs WHERE id=%s AND user_id=%s FOR UPDATE", (run_id,user_id))
        if not cur.fetchone(): raise PermissionError("run not found")
        cur.execute("SELECT COALESCE(MAX(version),0)+1 AS version FROM canvas_agent_plans WHERE run_id=%s", (run_id,)); version = int(cur.fetchone()["version"])
        cur.execute("INSERT INTO canvas_agent_plans(id,run_id,version,status,content_json,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING *", (new_id(),run_id,version,status,json_value(body),now,now)); return cur.fetchone()

def begin_operation(user_id: str, run_id: str, idempotency_key: str, operation_type: str, input_data: dict[str, Any], *, risk: str = "safe") -> dict[str, Any]:
    now = now_ms(); body = _json(input_data)
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT 1 FROM canvas_agent_runs WHERE id=%s AND user_id=%s FOR UPDATE", (run_id,user_id))
        if not cur.fetchone(): raise PermissionError("run not found")
        cur.execute("INSERT INTO canvas_agent_operations(id,run_id,idempotency_key,type,risk,status,input_json,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,'pending',%s,%s,%s) ON CONFLICT(idempotency_key) DO UPDATE SET updated_at=canvas_agent_operations.updated_at RETURNING *", (new_id(),run_id,idempotency_key,operation_type,risk,json_value(body),now,now)); return cur.fetchone()

def finish_operation(idempotency_key: str, *, status: str, result: dict[str, Any] | None = None, error: str | None = None) -> dict[str, Any] | None:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE canvas_agent_operations SET status=%s,result_json=%s,error=%s,updated_at=%s WHERE idempotency_key=%s RETURNING *", (status,json_value(_json(result)),error,now_ms(),idempotency_key)); return cur.fetchone()

def submit_command(user_id: str, run_id: str, operation_type: str, client_request_id: str, input_data: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Create an idempotent accepted command and persist its user input."""
    request_id = str(client_request_id or new_id())[:128]
    key = f"{run_id}:{operation_type}:{request_id}"
    now = now_ms()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT * FROM canvas_agent_operations WHERE idempotency_key=%s FOR UPDATE", (key,))
        existing = cur.fetchone()
        if existing:
            return existing, False
        cur.execute("SELECT * FROM canvas_agent_runs WHERE id=%s AND user_id=%s FOR UPDATE", (run_id, user_id))
        run = cur.fetchone()
        if not run: raise PermissionError("run not found")
        cur.execute("SELECT 1 FROM canvas_agent_operations WHERE run_id=%s AND type IN ('agent.message','agent.answer','agent.confirm') AND status IN ('accepted','queued','running') LIMIT 1", (run_id,))
        if cur.fetchone(): raise RuntimeError("Run 当前已有正在执行的操作")
        content = str(input_data.get("content") or input_data.get("answer") or "")
        if operation_type in {"agent.message", "agent.answer"} and content:
            cur.execute("SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM canvas_agent_messages WHERE run_id=%s", (run_id,))
            sequence = int(cur.fetchone()["sequence"])
            metadata = {"kind": "answer" if operation_type == "agent.answer" else "command", "operation_id": key}
            cur.execute("INSERT INTO canvas_agent_messages(id,run_id,role,content,sequence,created_at,metadata_json) VALUES(%s,%s,'user',%s,%s,%s,%s)", (new_id(), run_id, content, sequence, now, json_value(_json(metadata))))
        if operation_type != "agent.confirm":
            cur.execute("UPDATE canvas_agent_runs SET status='planning',phase='planning',updated_at=%s WHERE id=%s", (now, run_id))
        cur.execute(
            "INSERT INTO canvas_agent_operations(id,run_id,idempotency_key,type,risk,status,input_json,client_request_id,created_at,updated_at) VALUES(%s,%s,%s,%s,'safe','accepted',%s,%s,%s,%s) RETURNING *",
            (new_id(), run_id, key, operation_type, json_value(_json(input_data)), request_id, now, now),
        )
        return cur.fetchone(), True

def claim_next_command(worker_id: str, lease_ms: int = 120_000) -> dict[str, Any] | None:
    now = now_ms()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "SELECT o.* FROM canvas_agent_operations o WHERE o.type IN ('agent.message','agent.answer','agent.confirm') "
            "AND (o.status='accepted' OR (o.status='running' AND COALESCE(o.lease_until,0)<%s)) "
            "AND NOT EXISTS (SELECT 1 FROM canvas_agent_operations active WHERE active.run_id=o.run_id AND active.id<>o.id AND active.type IN ('agent.message','agent.answer','agent.confirm') AND active.status='running' AND COALESCE(active.lease_until,0)>%s) "
            "ORDER BY o.created_at FOR UPDATE SKIP LOCKED LIMIT 1", (now, now),
        )
        row = cur.fetchone()
        if not row: return None
        cur.execute("UPDATE canvas_agent_operations SET status='running',lease_owner=%s,lease_until=%s,started_at=COALESCE(started_at,%s),updated_at=%s WHERE id=%s RETURNING *", (worker_id, now + lease_ms, now, now, row["id"]))
        return cur.fetchone()

def finish_command(operation_id: str, *, status: str, result: dict[str, Any] | None = None, error: str = "") -> dict[str, Any] | None:
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE canvas_agent_operations SET status=%s,result_json=%s,error=%s,lease_owner=NULL,lease_until=NULL,finished_at=%s,updated_at=%s WHERE id=%s RETURNING *", (status, json_value(_json(result)), error[:2000] or None, now, now, operation_id))
        return cur.fetchone()

def command_cancel_requested(operation_id: str) -> bool:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT cancel_requested_at IS NOT NULL AS requested FROM canvas_agent_operations WHERE id=%s", (operation_id,))
        row = cur.fetchone(); return bool(row and row["requested"])

def refresh_command_lease(operation_id: str, worker_id: str, lease_ms: int = 120_000) -> bool:
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE canvas_agent_operations SET lease_until=%s,updated_at=%s WHERE id=%s AND status='running' AND lease_owner=%s RETURNING id", (now + lease_ms, now, operation_id, worker_id))
        return bool(cur.fetchone())

def request_run_command_cancellation(user_id: str, run_id: str) -> list[dict[str, Any]]:
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE canvas_agent_operations SET cancel_requested_at=%s,updated_at=%s WHERE run_id=%s AND status IN ('accepted','running') AND type IN ('agent.message','agent.answer','agent.confirm') RETURNING *", (now, now, run_id))
        return cur.fetchall()

def save_artifact(user_id: str, run_id: str, artifact_type: str, content: dict[str, Any], *, status: str = "draft", source_artifact_ids: list[str] | None = None) -> dict[str, Any]:
    now = now_ms(); body = _json(content); source_ids = list(source_artifact_ids or [])
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT 1 FROM canvas_agent_runs WHERE id=%s AND user_id=%s FOR UPDATE", (run_id,user_id))
        if not cur.fetchone(): raise PermissionError("run not found")
        cur.execute("SELECT id FROM canvas_agent_artifacts WHERE run_id=%s AND type=%s ORDER BY version DESC LIMIT 1", (run_id, artifact_type)); previous = cur.fetchone()
        version = 1
        if previous:
            cur.execute("SELECT COALESCE(MAX(version),0)+1 AS version FROM canvas_agent_artifacts WHERE run_id=%s AND type=%s", (run_id,artifact_type)); version = int(cur.fetchone()["version"])
        artifact_id = new_id()
        cur.execute("INSERT INTO canvas_agent_artifacts(id,run_id,type,version,status,content_json,source_artifact_ids,created_at,updated_at,stale) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,FALSE) RETURNING *", (artifact_id,run_id,artifact_type,version,status,json_value(body),json_value(source_ids),now,now))
        artifact = cur.fetchone()
        if previous:
            pending = [previous["id"]]
            while pending:
                source_id = pending.pop(0)
                cur.execute("SELECT id,source_artifact_ids FROM canvas_agent_artifacts WHERE run_id=%s AND stale=FALSE", (run_id,))
                for dependent in cur.fetchall():
                    source_ids_for_dependent = dependent.get("source_artifact_ids") or []
                    if source_id in source_ids_for_dependent:
                        cur.execute("UPDATE canvas_agent_artifacts SET stale=TRUE,updated_at=%s,status=CASE WHEN status='approved' THEN 'stale' ELSE status END WHERE id=%s", (now, dependent["id"]))
                        pending.append(dependent["id"])
        return artifact

def set_artifact_status(user_id: str, run_id: str, artifact_id: str, status: str, *, actor: str = "", rejection_note: str = "") -> dict[str, Any] | None:
    allowed = {"draft", "approved", "rejected", "stale"}
    if status not in allowed: raise ValueError("invalid artifact status")
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT a.* FROM canvas_agent_artifacts a JOIN canvas_agent_runs r ON r.id=a.run_id WHERE a.id=%s AND a.run_id=%s AND r.user_id=%s FOR UPDATE", (artifact_id, run_id, user_id)); row = cur.fetchone()
        if not row: return None
        approved_by = actor if status == "approved" else (row.get("approved_by") or "")
        approved_at = now_ms() if status == "approved" else row.get("approved_at")
        cur.execute("UPDATE canvas_agent_artifacts SET status=%s,stale=%s,approved_by=%s,approved_at=%s,rejection_note=%s,updated_at=%s WHERE id=%s RETURNING *", (status, status == "stale", approved_by, approved_at, rejection_note[:4000], now_ms(), artifact_id)); return cur.fetchone()

def append_event(user_id: str, run_id: str, event_type: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Compatibility API; new code must use ``AgentEventService`` directly."""
    from .event_bus import AgentEventService
    return AgentEventService.append_sync(user_id=user_id, run_id=run_id, event_type=event_type, payload=payload)

def list_events(user_id: str, run_id: str, *, after_sequence: int = 0, limit: int = 500) -> list[dict[str, Any]]:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT e.* FROM canvas_agent_events e JOIN canvas_agent_runs r ON r.id=e.run_id WHERE e.run_id=%s AND r.user_id=%s AND e.sequence>%s ORDER BY e.sequence LIMIT %s", (run_id,user_id,after_sequence,max(1,min(limit,2000)))); return cur.fetchall()

def create_template(user_id: str, name: str, content: dict[str, Any], *, description: str = "", source_run_id: str = "") -> dict[str, Any]:
    now = now_ms()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT COALESCE(MAX(version),0)+1 AS version FROM canvas_agent_templates WHERE user_id=%s AND name=%s", (user_id, name))
        version = int(cur.fetchone()["version"])
        cur.execute("INSERT INTO canvas_agent_templates(id,user_id,name,description,version,content_json,source_run_id,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *", (new_id(), user_id, name, description, version, json_value(_json(content)), source_run_id or None, now, now))
        return cur.fetchone()

def list_templates(user_id: str) -> list[dict[str, Any]]:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM canvas_agent_templates WHERE user_id=%s ORDER BY updated_at DESC", (user_id,))
        return cur.fetchall()

def get_template(user_id: str, template_id: str) -> dict[str, Any] | None:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM canvas_agent_templates WHERE id=%s AND user_id=%s", (template_id, user_id))
        return cur.fetchone()

def share_project_asset(user_id: str, run_id: str, artifact_id: str, project_id: str, *, asset_type: str = "artifact") -> dict[str, Any]:
    now = now_ms()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT r.canvas_id FROM canvas_agent_artifacts a JOIN canvas_agent_runs r ON r.id=a.run_id WHERE a.id=%s AND a.run_id=%s AND r.user_id=%s FOR UPDATE", (artifact_id, run_id, user_id))
        row = cur.fetchone()
        if not row: raise PermissionError("artifact not found or not owned by user")
        cur.execute("INSERT INTO canvas_agent_project_assets(id,user_id,project_id,canvas_id,artifact_id,asset_type,created_at) VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(user_id,project_id,artifact_id) DO UPDATE SET asset_type=EXCLUDED.asset_type RETURNING *", (new_id(), user_id, project_id, row["canvas_id"], artifact_id, asset_type, now))
        return cur.fetchone()

def list_project_assets(user_id: str, project_id: str) -> list[dict[str, Any]]:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT p.*,a.type AS artifact_type,a.version AS artifact_version,a.status AS artifact_status,a.stale,a.content_json FROM canvas_agent_project_assets p JOIN canvas_agent_artifacts a ON a.id=p.artifact_id WHERE p.user_id=%s AND p.project_id=%s ORDER BY p.created_at DESC", (user_id, project_id))
        return cur.fetchall()
