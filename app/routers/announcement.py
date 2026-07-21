"""全局广播公告路由（/api/announcement/*）。

端点：
- GET    /api/announcement/latest   所有登录用户：获取当前最新公告（用于刷新页面/重连后补显示）。
- POST   /api/announcement          仅 admin：发送新公告，覆盖此前的最新公告，并通过 WebSocket 实时推送给所有在线用户。
- DELETE /api/announcement          仅 admin：清空当前公告（不会撤回已弹出的窗口，仅影响之后的新连接/刷新）。

权限：管理员判定为 current_user_id() == ADMIN_USER_ID（用户名 "admin"）。
非 admin 访问 POST/DELETE 返回 403。
"""
import asyncio
from fastapi import APIRouter, HTTPException

from app.core.access_control import is_admin
from app.core.auth import current_user_id
from app.core.ws import manager
from app.models import AnnouncementPayload
from app.services.announcement import (
    clear_announcement,
    create_announcement,
    get_latest_announcement,
)

router = APIRouter()


def _require_admin() -> str:
    uid = current_user_id()
    if not is_admin(uid):
        raise HTTPException(status_code=403, detail="需要管理员权限。")
    return uid


@router.get("/api/announcement/latest")
def announcement_latest():
    """所有登录用户均可访问：返回当前最新公告（若无则 announcement 为 null）。"""
    return {"announcement": get_latest_announcement()}


@router.post("/api/announcement")
async def announcement_create(payload: AnnouncementPayload):
    _require_admin()
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="公告内容不能为空。")
    uid = current_user_id()
    item = await asyncio.to_thread(create_announcement, content, uid)
    await manager.broadcast_announcement(item)
    return {"ok": True, "announcement": item}


@router.delete("/api/announcement")
def announcement_delete():
    _require_admin()
    clear_announcement()
    return {"ok": True}
