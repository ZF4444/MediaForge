"""全局广播公告路由（/api/announcement/*）。

端点：
- GET    /api/announcement/latest   所有登录用户：获取当前最新公告（用于刷新页面/重连后补显示）。
- POST   /api/announcement          拥有“全局广播”页面权限：发送新公告，覆盖此前的最新公告，并通过 WebSocket 实时推送给所有在线用户。
- DELETE /api/announcement          拥有“全局广播”页面权限：清空当前公告（不会撤回已弹出的窗口，仅影响之后的新连接/刷新）。

权限：拥有“全局广播”页面权限的用户可发布或清除公告。
"""
import asyncio
from fastapi import APIRouter, HTTPException

from app.core.access_control import has_page_access
from app.core.auth import current_user_id
from app.core.ws import manager
from app.models import AnnouncementPayload
from app.services.announcement import (
    clear_announcement,
    create_announcement,
    get_latest_announcement,
)

router = APIRouter()


def _require_broadcast_access() -> str:
    uid = current_user_id()
    if not has_page_access(uid, "broadcast-admin"):
        raise HTTPException(status_code=403, detail="需要“全局广播”页面权限。")
    return uid


@router.get("/api/announcement/latest")
def announcement_latest():
    """所有登录用户均可访问：返回当前最新公告（若无则 announcement 为 null）。"""
    return {"announcement": get_latest_announcement()}


@router.post("/api/announcement")
async def announcement_create(payload: AnnouncementPayload):
    _require_broadcast_access()
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="公告内容不能为空。")
    uid = current_user_id()
    item = await asyncio.to_thread(create_announcement, content, uid)
    await manager.broadcast_announcement(item)
    return {"ok": True, "announcement": item}


@router.delete("/api/announcement")
def announcement_delete():
    _require_broadcast_access()
    clear_announcement()
    return {"ok": True}
