"""ComfyUI endpoints backed exclusively by canonical AI connections."""

from __future__ import annotations

import uuid

from app.ai.database_repository import DatabaseAIRepository
from app.core.comfyui import normalize_comfyui_endpoint
from app.core.database import database_connection_sync
from app.core.utils import now_ms


def comfyui_endpoints() -> list[str]:
    connections = DatabaseAIRepository().connections()
    connections.sort(key=lambda item: not item.primary)
    return list(dict.fromkeys(
        normalize_comfyui_endpoint(item.base_url)
        for item in connections if item.protocol == "comfyui" and item.enabled
    ))


def save_comfyui_endpoints(values: list[str]) -> list[str]:
    """Keep the legacy address-list API without replacing unrelated AI resources.

    Retain connection IDs, settings and associated resources. Omitted endpoints
    are disabled rather than deleted; re-adding an endpoint restores its identity.
    """
    endpoints = list(dict.fromkeys(normalize_comfyui_endpoint(value) for value in values if str(value).strip()))
    if not endpoints:
        raise ValueError("至少保留一个 ComfyUI 后端地址")
    with database_connection_sync() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT id,base_url FROM ai_connections WHERE protocol='comfyui' FOR UPDATE")
        existing = cur.fetchall()
        matched = set()
        for row in existing:
            endpoint = normalize_comfyui_endpoint(row["base_url"])
            enabled = endpoint in endpoints
            cur.execute(
                "UPDATE ai_connections SET enabled=%s,base_url=%s,updated_at=%s WHERE id=%s",
                (enabled, endpoint, now_ms(), row["id"]),
            )
            matched.add(endpoint)
        for endpoint in endpoints:
            if endpoint in matched:
                continue
            connection_id = f"comfyui:{uuid.uuid4().hex}"
            cur.execute(
                """INSERT INTO ai_connections
                (id,protocol,name,base_url,secret_ref,enabled,primary_connection,settings_json,created_at,updated_at)
                VALUES(%s,'comfyui',%s,%s,%s,TRUE,FALSE,'{}',%s,%s)""",
                (connection_id, f"ComfyUI {endpoint}", endpoint, connection_id, now_ms(), now_ms()),
            )
    return endpoints
