"""Administrator-assisted migration of a non-Feishu account into the current account."""
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.auth import current_user_id
from app.core.logging import audit_event
from app.services.business_metadata import metadata_connection

router = APIRouter()

FEISHU_ID_LENGTH = len("ou_9991ec9cb01e04251020a5f7ca518932")


def _is_feishu(user_id: str) -> bool:
    return str(user_id or "").startswith("ou_") and len(str(user_id or "")) == FEISHU_ID_LENGTH


def _target_user_id() -> str:
    user_id = current_user_id()
    if not _is_feishu(user_id):
        raise HTTPException(status_code=403, detail="当前登录账号 B 必须是飞书用户。")
    return user_id


@router.get("/api/user-data-migration/source")
def migration_source(username: str):
    target_id = _target_user_id()
    name = str(username or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="请输入用户 A 的用户名。")
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT id,username FROM users WHERE username=%s", (name,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="未找到该用户。")
        if _is_feishu(user["id"]):
            raise HTTPException(status_code=400, detail="用户 A 不能是飞书用户。")
        cur.execute("SELECT id,title,created_at,updated_at FROM smart_canvases WHERE user_id=%s AND deleted_at IS NULL ORDER BY updated_at DESC", (user["id"],))
        canvases = [dict(row) for row in cur.fetchall()]
    return {"source": {"user_id": user["id"], "username": user["username"]}, "canvases": canvases, "target_user_id": target_id}


@router.post("/api/user-data-migration/execute")
def migration_execute(payload: dict[str, Any]):
    target_id = _target_user_id()
    source_id = str(payload.get("source_user_id") or "").strip()
    if not source_id or source_id == target_id:
        raise HTTPException(status_code=400, detail="源账号无效。")
    if payload.get("confirmed") is not True:
        raise HTTPException(status_code=400, detail="请先确认画布列表后再迁移。")
    moved_tables = []
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT id,username FROM users WHERE id=%s", (source_id,))
        source = cur.fetchone()
        cur.execute("SELECT id FROM users WHERE id=%s", (target_id,))
        target = cur.fetchone()
        if not source or not target:
            raise HTTPException(status_code=404, detail="源账号或当前账号不存在。")
        if _is_feishu(source["id"]):
            raise HTTPException(status_code=400, detail="用户 A 不能是飞书用户。")
        if not _is_feishu(target["id"]):
            raise HTTPException(status_code=400, detail="当前登录账号 B 必须是飞书用户。")
        # These are business-owned rows. Management configuration tables
        # (budgets, org/access/storage quota settings and sessions) are excluded.
        statements = [
            ("history_records", "user_id"), ("conversations", "user_id"),
            ("smart_canvases", "user_id"), ("canvas_agent_runs", "user_id"),
            ("canvas_agent_event_outbox", "user_id"), ("canvas_agent_templates", "user_id"),
            ("canvas_agent_project_assets", "user_id"), ("runninghub_usage_records", "user_id"),
            ("omnilojo_usage_records", "user_id"), ("feedback_entries", "user_id"),
            ("user_settings", "user_id"), ("files", "user_id"), ("ai_task_archive", "owner_id"),
            ("asset_libraries", "user_id"),
        ]
        for table, column in statements:
            cur.execute(f"UPDATE {table} SET {column}=%s WHERE {column}=%s", (target_id, source_id))
            moved_tables.append(table)
        # Remove source-owned rows that were deliberately not migrated.
        cur.execute("DELETE FROM user_budgets WHERE user_id=%s", (source_id,))
        cur.execute("DELETE FROM user_sessions WHERE user_id=%s", (source_id,))
        cur.execute("DELETE FROM users WHERE id=%s", (source_id,))
    audit_event("user_data_migrated", action="update", resource_type="user", resource_id=source_id, user_id=target_id, after={"target_user_id": target_id, "migrated_tables": moved_tables})
    return {"ok": True, "source_user_id": source_id, "target_user_id": target_id, "migrated_tables": moved_tables}
