"""Atomic, idempotent execution of the restricted canvas patch protocol."""
from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.core.utils import now_ms
from app.models.canvas_agent import CanvasPatch
from app.services.business_metadata import _file_refs, json_value, metadata_connection, new_id
from app.core.logging import audit_event
from app.core.metrics import AGENT_OPERATION_SECONDS
import time
from .policy import validate_patch

class PatchConflictError(RuntimeError): pass
class PatchPermissionError(PermissionError): pass

def _connection_endpoints(connection: dict[str, Any]) -> tuple[str, str]:
    return str(connection.get("from") or connection.get("from_node") or connection.get("source") or ""), str(connection.get("to") or connection.get("to_node") or connection.get("target") or "")

def _assert_file_access(cur: Any, user_id: str, node: dict[str, Any]) -> None:
    file_ids = {file_id for file_id, _, _ in _file_refs(node)}
    if not file_ids: return
    cur.execute("SELECT id FROM files WHERE id = ANY(%s) AND user_id=%s AND deleted_at IS NULL AND status <> 'deleted' FOR KEY SHARE", (list(file_ids), user_id))
    if {row["id"] for row in cur.fetchall()} != file_ids:
        raise PatchPermissionError("patch references an unavailable file")

def apply_patch(user_id: str, patch: CanvasPatch, *, run_id: str = "", allow_user_node_changes: bool = False, authorized_node_ids: set[str] | None = None) -> dict[str, Any]:
    """Apply a patch under a row lock. A caller persists operation idempotency around this function."""
    validate_patch(patch, allow_user_node_changes=allow_user_node_changes, authorized_node_ids=authorized_node_ids)
    now = now_ms()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT version,viewport_json FROM smart_canvases WHERE id=%s AND user_id=%s AND deleted_at IS NULL FOR UPDATE", (patch.canvas_id, user_id))
        canvas = cur.fetchone()
        if canvas is None: raise PatchPermissionError("canvas not found or not owned by user")
        version = int(canvas.get("version") or 1)
        if version != patch.base_version: raise PatchConflictError(f"canvas version conflict: expected {patch.base_version}, actual {version}")
        cur.execute("SELECT id,data_json,sort_order FROM smart_canvas_nodes WHERE canvas_id=%s ORDER BY sort_order FOR UPDATE", (patch.canvas_id,))
        rows = cur.fetchall()
        nodes = {row["id"]: deepcopy(row["data_json"]) for row in rows}
        order = [row["id"] for row in rows]
        meta = deepcopy(canvas.get("viewport_json") or {})
        payload = deepcopy(meta.get("payload") or {})
        connections = list(payload.get("connections") or [])
        refs: dict[str, str] = {}
        changed: set[str] = set()
        run_requests: list[dict[str, Any]] = []
        for operation in patch.operations:
            op = operation.op
            if op == "add_node":
                node = deepcopy(operation.node)
                node_id = str(node.get("id") or new_id())
                if node_id in nodes: raise ValueError(f"duplicate node id: {node_id}")
                node["id"] = node_id
                node.setdefault("x", float(operation.placement.get("x", 0) or 0))
                node.setdefault("y", float(operation.placement.get("y", 0) or 0))
                node.setdefault("agent", {"run_id": run_id, "step_id": operation.client_ref})
                _assert_file_access(cur, user_id, node)
                nodes[node_id] = node; order.append(node_id); refs[operation.client_ref] = node_id; changed.add(node_id)
            elif op in {"update_node_params", "replace_node_content", "move_node", "run_node", "run_group"}:
                node_id = refs.get(operation.node_id, operation.node_id)
                node = nodes.get(node_id)
                if node is None: raise ValueError(f"node not found: {node_id}")
                agent = node.get("agent") or {}
                if not run_id or agent.get("run_id") != run_id:
                    if not allow_user_node_changes or node_id not in (authorized_node_ids or set()):
                        raise PatchPermissionError("agent may only modify nodes created by this run or explicitly authorized nodes")
                if op == "update_node_params": node.update(deepcopy(operation.params)); changed.add(node_id)
                elif op == "replace_node_content": node["text"] = operation.content; changed.add(node_id)
                elif op == "move_node":
                    node["x"] = float(operation.params.get("x", node.get("x", 0))); node["y"] = float(operation.params.get("y", node.get("y", 0))); changed.add(node_id)
                else: run_requests.append({"op": op, "node_id": node_id})
                _assert_file_access(cur, user_id, node)
            elif op == "add_connection":
                source = refs.get(operation.from_ref, operation.from_ref); target = refs.get(operation.to_ref, operation.to_ref)
                if source not in nodes or target not in nodes or source == target: raise ValueError("connection endpoints must be distinct existing nodes")
                connection = {"from": source, "to": target, **deepcopy(operation.connection)}
                if not any(_connection_endpoints(item) == (source, target) for item in connections): connections.append(connection)
            elif op == "remove_connection":
                source = refs.get(operation.from_ref, operation.from_ref); target = refs.get(operation.to_ref, operation.to_ref)
                connections = [item for item in connections if _connection_endpoints(item) != (source, target)]
            elif op == "add_group":
                group = deepcopy(operation.group); group.setdefault("id", new_id()); payload.setdefault("groups", []).append(group)
        for node_id in changed:
            node = nodes[node_id]
            cur.execute("UPDATE smart_canvas_nodes SET node_type=%s,position_x=%s,position_y=%s,data_json=%s,updated_at=%s WHERE id=%s AND canvas_id=%s", (node.get("type", ""), float(node.get("x", 0) or 0), float(node.get("y", 0) or 0), json_value(node), now, node_id, patch.canvas_id))
        for node_id in refs.values():
            node = nodes[node_id]
            cur.execute("INSERT INTO smart_canvas_nodes(id,canvas_id,node_type,position_x,position_y,sort_order,data_json,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)", (node_id, patch.canvas_id, node.get("type", ""), float(node.get("x", 0) or 0), float(node.get("y", 0) or 0), order.index(node_id), json_value(node), now, now))
        payload["connections"] = connections; meta["payload"] = payload
        cur.execute("UPDATE smart_canvases SET viewport_json=%s,updated_at=%s,version=version+1 WHERE id=%s", (json_value(meta), now, patch.canvas_id))
        return {
            "schema_version": 1,
            "canvas_id": patch.canvas_id,
            "version": version + 1,
            "node_refs": refs,
            "changed_node_ids": sorted(changed),
            "run_requests": run_requests,
        }

def apply_patch_idempotently(user_id: str, run_id: str, idempotency_key: str, patch: CanvasPatch, *, risk: str = "safe", allow_user_node_changes: bool = False, authorized_node_ids: set[str] | None = None) -> dict[str, Any]:
    """Persist the side-effect fence before applying a patch and cache its successful result."""
    if not run_id or not idempotency_key:
        raise ValueError("run_id and idempotency_key are required")
    now = now_ms()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT status,result_json,error FROM canvas_agent_operations WHERE idempotency_key=%s FOR UPDATE", (idempotency_key,))
        existing = cur.fetchone()
        if existing:
            if existing["status"] == "succeeded": return dict(existing["result_json"] or {})
            if existing["status"] == "applying": raise RuntimeError("operation is already applying")
            cur.execute("UPDATE canvas_agent_operations SET status='applying',error=NULL,updated_at=%s WHERE idempotency_key=%s", (now, idempotency_key))
        else:
            cur.execute("INSERT INTO canvas_agent_operations(id,run_id,idempotency_key,type,risk,status,input_json,result_json,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,'applying',%s,%s,%s,%s)", (new_id(), run_id, idempotency_key, "canvas.apply_patch", risk, json_value(patch.model_dump(mode="json")), json_value({}), now, now))
    try:
        started = time.perf_counter()
        result = apply_patch(user_id, patch, run_id=run_id, allow_user_node_changes=allow_user_node_changes, authorized_node_ids=authorized_node_ids)
    except Exception as exc:
        AGENT_OPERATION_SECONDS.labels(operation="canvas.apply_patch", status="failed").observe(time.perf_counter() - started)
        audit_event("canvas_agent_operation_failed", action="apply_patch", resource_type="canvas_agent_operation", resource_id=idempotency_key, result="failed", run_id=run_id, operation_id=idempotency_key, error_category=type(exc).__name__)
        with metadata_connection() as conn, conn.cursor() as cur:
            cur.execute("UPDATE canvas_agent_operations SET status='failed',error=%s,updated_at=%s WHERE idempotency_key=%s", (str(exc)[:2000], now_ms(), idempotency_key))
        raise
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE canvas_agent_operations SET status='succeeded',result_json=%s,updated_at=%s WHERE idempotency_key=%s", (json_value(result), now_ms(), idempotency_key))
    AGENT_OPERATION_SECONDS.labels(operation="canvas.apply_patch", status="succeeded").observe(time.perf_counter() - started)
    audit_event("canvas_agent_operation_succeeded", action="apply_patch", resource_type="canvas_agent_operation", resource_id=idempotency_key, result="success", run_id=run_id, operation_id=idempotency_key)
    return result
