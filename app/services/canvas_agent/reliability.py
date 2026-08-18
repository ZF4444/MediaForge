"""Phase 2 concurrency, quota and failure-classification helpers."""
from __future__ import annotations

import hashlib
import json
from typing import Any

DEFAULT_RUN_LIMITS = {
    "max_steps": 12,
    "max_tool_calls": 24,
    "max_nodes_created": 24,
    "max_tasks": 16,
    "max_concurrency": 4,
    "max_budget": 100.0,
    "max_auto_repairs": 2,
}

def canvas_structure_fingerprint(canvas: dict[str, Any]) -> str:
    """Fingerprint semantic canvas content while intentionally ignoring placement."""
    nodes = []
    for node in canvas.get("nodes", []) or []:
        if not isinstance(node, dict):
            continue
        nodes.append({k: v for k, v in node.items() if k not in {"x", "y", "position_x", "position_y", "updated_at", "generation_status", "generation_task_id", "generation_error", "pending", "running"}})
    nodes.sort(key=lambda item: str(item.get("id", "")))
    connections = sorted(canvas.get("connections", []) or [], key=lambda item: json.dumps(item, sort_keys=True, ensure_ascii=False))
    body = {"nodes": nodes, "connections": connections, "owner": canvas.get("owner", ""), "user_id": canvas.get("user_id", "")}
    return hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str).encode()).hexdigest()

def plan_usage(plan: dict[str, Any]) -> dict[str, float | int]:
    steps = list(plan.get("steps") or [])
    return {
        "steps": len(steps),
        "tool_calls": len(steps),
        "nodes_created": sum(1 for step in steps if step.get("action") == "canvas.create_node"),
        "tasks": sum(1 for step in steps if step.get("action") in {"canvas.run_node", "canvas.run_group"}),
        "concurrency": int((plan.get("execution") or {}).get("parallelism") or 1),
        "budget": float((plan.get("execution") or {}).get("estimated_cost") or 0),
    }

def enforce_plan_limits(plan: dict[str, Any], limits: dict[str, Any] | None = None) -> dict[str, float | int]:
    effective = {**DEFAULT_RUN_LIMITS, **(limits or {})}
    usage = plan_usage(plan)
    mapping = {"steps": "max_steps", "tool_calls": "max_tool_calls", "nodes_created": "max_nodes_created", "tasks": "max_tasks", "concurrency": "max_concurrency", "budget": "max_budget"}
    exceeded = [f"{key}={usage[key]} > {effective[limit]}" for key, limit in mapping.items() if float(usage[key]) > float(effective[limit])]
    if exceeded:
        raise ValueError("Run 配额超限: " + ", ".join(exceeded))
    return usage

def classify_failure(error: BaseException | str) -> str:
    text = str(error).lower()
    if any(word in text for word in ("timeout", "timed out", "429", "rate limit", "temporarily", "connection", "unavailable")):
        return "transient"
    if any(word in text for word in ("permission", "forbidden", "unauthorized", "not owned", "access")):
        return "permission"
    if any(word in text for word in ("conflict", "version", "stale")):
        return "conflict"
    if any(word in text for word in ("quota", "budget", "limit")):
        return "quota"
    return "permanent"
