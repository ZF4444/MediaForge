"""平台帮助文档读取与管理员编辑接口。"""
from fastapi import APIRouter, HTTPException

from app.core.access_control import is_admin
from app.core.auth import current_user_id
from app.models import HelpMarkdownPayload
from app.services.help_doc import read_help_markdown, write_help_markdown

router = APIRouter()


def _require_admin() -> str:
    uid = current_user_id()
    if not is_admin(uid):
        raise HTTPException(status_code=403, detail="需要管理员权限。")
    return uid


@router.get("/api/help")
async def help_get():
    uid = current_user_id()
    return {
        "content": read_help_markdown(),
        "is_admin": is_admin(uid),
    }


@router.put("/api/help")
async def help_put(payload: HelpMarkdownPayload):
    _require_admin()
    return {
        "ok": True,
        "content": write_help_markdown(payload.content),
    }
