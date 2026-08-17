"""访问控制路由（/api/access-control/*）。

端点：
- GET  /api/access-control/me      所有登录用户：返回自己的有效权限（pages/nodes/is_admin）。
- GET  /api/access-control/config  仅 admin：返回全集清单 + 全部用户配置 + 用户列表。
- PUT  /api/access-control/config  仅 admin：保存全部用户配置。
- GET  /api/access-control/users   仅 admin：返回已注册用户列表。

权限：管理员判定为 current_user_id() == ADMIN_USER_ID（用户名 "admin"）。
非 admin 访问 config/users 返回 403。

依赖：
- app.core.auth：current_user_id, USERS（注册表）, USERS_LOCK
- app.core.access_control：全集清单/读写/有效权限
- app.models：AccessControlConfigPayload
"""
from fastapi import APIRouter, HTTPException

from app.core.access_control import (
    ADMIN_USER_ID,
    all_nodes,
    all_pages,
    effective_permissions,
    is_admin,
    load_config,
    save_config,
)
from app.core.auth import USERS, USERS_LOCK, current_user_id, delete_user
from app.core.logging import audit_event
from app.core.storage_io import run_storage_io
from app.models import AccessControlConfigPayload
from app.services.storage import delete_user_media_objects, load_storage_quota_config, save_storage_quota_config

router = APIRouter()


def _require_admin() -> str:
    uid = current_user_id()
    if not is_admin(uid):
        raise HTTPException(status_code=403, detail="需要管理员权限。")
    return uid


def _registered_users():
    """已注册用户列表（排除 admin），形如 [{user_id, username, org_id}]。"""
    with USERS_LOCK:
        items = [
            {"user_id": uid, "username": (info or {}).get("username") or uid, "org_id": (info or {}).get("org_id")}
            for uid, info in USERS.items()
            if uid != ADMIN_USER_ID
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
        "is_admin": perms["is_admin"],
        "pages": perms["pages"],
        "nodes": perms["nodes"],
    }


@router.get("/api/access-control/config")
def access_control_get_config():
    """全集清单 + 默认配置 + 全部用户配置 + 已注册用户列表（仅 admin）。"""
    _require_admin()
    config = load_config()
    return {
        "all_pages": all_pages(),
        "all_nodes": all_nodes(),
        "users": _registered_users(),
        "config": config.get("users", {}),
        "default": config.get("default"),
    }


@router.put("/api/access-control/config")
def access_control_put_config(payload: AccessControlConfigPayload):
    """保存默认配置与全部用户配置（仅 admin）。"""
    _require_admin()
    data = {
        "users": {
            uid: {"pages": entry.pages, "nodes": entry.nodes}
            for uid, entry in payload.users.items()
        }
    }
    # 仅当请求显式包含 default 字段时才写入（区分「未传/保持」与「传 null/清除」）。
    if "default" in payload.model_fields_set:
        data["default"] = (
            {"pages": payload.default.pages, "nodes": payload.default.nodes}
            if payload.default is not None else None
        )
    saved = save_config(data)
    audit_event(
        "access_control_updated",
        action="update",
        resource_type="access_control_config",
        resource_id="global",
        after={"configured_user_count": len(saved.get("users", {})), "has_default": saved.get("default") is not None},
    )
    return {"ok": True, "config": saved.get("users", {}), "default": saved.get("default")}


@router.get("/api/access-control/users")
def access_control_users():
    """已注册用户列表（仅 admin）。"""
    _require_admin()
    return {"users": _registered_users()}


@router.delete("/api/access-control/users/{user_id}")
async def access_control_delete_user(user_id: str):
    """删除注册用户（仅 admin）；历史用量和审计记录保留。"""
    _require_admin()
    if user_id == ADMIN_USER_ID:
        raise HTTPException(status_code=400, detail="管理员账号不支持删除。")
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
    users_config = config.get("users", {})
    if user_id in users_config:
        users_config.pop(user_id, None)
        save_config({"users": users_config})
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
