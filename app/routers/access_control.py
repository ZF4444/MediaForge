"""用户类型访问控制路由（/api/access-control/*）。

端点：
- GET  /api/access-control/me      所有登录用户：返回自己的有效页面权限。
- GET  /api/access-control/config  拥有“用户管理”页面权限：返回用户类型、分配和用户列表。
- PUT  /api/access-control/config  拥有“用户管理”页面权限：保存用户类型及其分配。
- GET  /api/access-control/users   拥有“用户管理”页面权限：返回已注册用户列表。
- GET  /api/access-control/sessions 拥有“用户管理”页面权限：返回有效登录会话。

依赖：
- app.core.auth：current_user_id, USERS（注册表）, USERS_LOCK
- app.core.access_control：全集清单/读写/有效权限
- app.models：AccessControlConfigPayload
"""
from fastapi import APIRouter, HTTPException, Request

from app.core.access_control import (
    all_pages,
    effective_permissions,
    has_page_access,
    load_config,
    save_config,
)
from app.core.auth import USERS, USERS_LOCK, current_user_id, delete_user, SESSION_COOKIE_NAME, _token_hash
from app.core.database import database_connection
from app.core.utils import now_ms
from app.core.logging import audit_event
from app.core.storage_io import run_storage_io
from app.models import AccessControlConfigPayload
from app.services.storage import delete_user_media_objects, load_storage_quota_config, save_storage_quota_config

router = APIRouter()


def _require_user_management() -> str:
    uid = current_user_id()
    if not has_page_access(uid, "user-management"):
        raise HTTPException(status_code=403, detail="需要“用户管理”页面权限。")
    return uid


def _registered_users():
    """已注册用户列表，形如 [{user_id, username, org_id}]。"""
    with USERS_LOCK:
        items = [
            {"user_id": uid, "username": (info or {}).get("username") or uid, "org_id": (info or {}).get("org_id")}
            for uid, info in USERS.items()
        ]
    items.sort(key=lambda x: x["user_id"])
    return items


@router.get("/api/access-control/me")
def access_control_me():
    """当前登录用户的有效权限。所有登录用户均可访问。"""
    uid = current_user_id()
    perms = effective_permissions(uid)
    return {
        "user_id": uid,
        "user_type": perms["user_type"],
        "pages": perms["pages"],
    }


@router.get("/api/access-control/config")
def access_control_get_config():
    """全集清单 + 用户类型 + 用户类型分配 + 已注册用户列表。"""
    _require_user_management()
    config = load_config()
    return {
        "all_pages": all_pages(),
        "users": _registered_users(),
        "types": config.get("types", {}),
        "user_types": config.get("user_types", {}),
    }


@router.put("/api/access-control/config")
def access_control_put_config(payload: AccessControlConfigPayload):
    """保存用户类型与用户类型分配。"""
    _require_user_management()
    data = {
        "types": {
            type_id: {"name": entry.name, "pages": entry.pages}
            for type_id, entry in payload.types.items()
        },
        "user_types": payload.user_types,
    }
    saved = save_config(data)
    audit_event(
        "access_control_updated",
        action="update",
        resource_type="access_control_config",
        resource_id="global",
        after={"type_count": len(saved.get("types", {})), "assigned_user_count": len(saved.get("user_types", {}))},
    )
    return {"ok": True, "types": saved.get("types", {}), "user_types": saved.get("user_types", {})}


@router.get("/api/access-control/users")
def access_control_users():
    """已注册用户列表。"""
    _require_user_management()
    config = load_config()
    return {
        "users": _registered_users(),
        "types": config.get("types", {}),
        "user_types": config.get("user_types", {}),
    }


@router.get("/api/access-control/sessions")
async def access_control_sessions(request: Request):
    """返回有效登录会话及最近活动状态，不返回任何可复用凭据。"""
    _require_user_management()
    now = now_ms()
    online_cutoff = now - 5 * 60 * 1000
    current_token = request.cookies.get(SESSION_COOKIE_NAME, "")
    current_hash = _token_hash(current_token) if current_token else ""
    async with database_connection() as conn, conn.cursor() as cur:
        await cur.execute(
            """SELECT s.token_hash,s.user_id,s.username,s.created_at,s.last_seen,s.expires_at,
                      COALESCE(u.org_id,'') AS org_id
               FROM user_sessions s LEFT JOIN users u ON u.id=s.user_id
              WHERE s.expires_at>%s ORDER BY s.last_seen DESC""",
            (now,),
        )
        rows = await cur.fetchall()
    sessions = [
        {
            "session_id": str(row["token_hash"])[:10],
            "user_id": str(row["user_id"]),
            "username": str(row.get("username") or row["user_id"]),
            "org_id": row.get("org_id") or None,
            "created_at": int(row.get("created_at") or 0),
            "last_seen": int(row.get("last_seen") or 0),
            "expires_at": int(row.get("expires_at") or 0),
            "online": int(row.get("last_seen") or 0) >= online_cutoff,
            "is_current": bool(current_hash and str(row["token_hash"]) == current_hash),
        }
        for row in rows
    ]
    return {"sessions": sessions, "online_count": sum(1 for item in sessions if item["online"]), "online_window_minutes": 5}


@router.put("/api/access-control/users/{user_id}/type")
def access_control_assign_user_type(user_id: str, payload: dict):
    """为一个注册用户分配用户类型。"""
    _require_user_management()
    user_id = str(user_id or "").strip()
    type_id = str(payload.get("type_id") or "").strip()[:80]
    if not type_id:
        raise HTTPException(status_code=400, detail="用户类型不能为空。")
    with USERS_LOCK:
        exists = user_id in USERS
    if not exists:
        raise HTTPException(status_code=404, detail="用户不存在。")

    config = load_config()
    if type_id not in config.get("types", {}):
        raise HTTPException(status_code=400, detail="用户类型不存在。")
    assignments = dict(config.get("user_types", {}))
    assignments[user_id] = type_id
    save_config({"types": config.get("types", {}), "user_types": assignments})
    audit_event(
        "user_type_assigned",
        action="update",
        resource_type="user",
        resource_id=user_id,
        after={"user_type": type_id},
    )
    return {"ok": True, "user_id": user_id, "user_type": type_id}


@router.delete("/api/access-control/users/{user_id}")
async def access_control_delete_user(user_id: str):
    """删除注册用户；历史用量和审计记录保留。"""
    _require_user_management()
    user_id = str(user_id or "").strip()
    with USERS_LOCK:
        exists = user_id in USERS
    if not exists:
        raise HTTPException(status_code=404, detail="用户不存在。")
    result = await delete_user(user_id)
    if not result:
        raise HTTPException(status_code=404, detail="用户不存在。")

    for entry in result.get("files", []):
        await run_storage_io(delete_user_media_objects, entry)

    config = load_config()
    assignments = config.get("user_types", {})
    if user_id in assignments:
        assignments.pop(user_id, None)
        save_config({"types": config.get("types", {}), "user_types": assignments})
    quota_config = load_storage_quota_config()
    if user_id in quota_config.get("users", {}):
        quota_config["users"].pop(user_id, None)
        save_storage_quota_config(quota_config)
    audit_event(
        "user_deleted",
        action="delete",
        resource_type="user",
        resource_id=user_id,
    )
    return {"ok": True, "user_id": user_id}
