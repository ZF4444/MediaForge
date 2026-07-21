"""平台帮助文档读取与管理员编辑接口。

每个前端页面拥有独立的帮助内容，通过 `page` 查询参数区分（例如 index、
smart-canvas、asset-manager 等）。未传或非法的 page 会回退到默认页 "index"。
"""
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
def help_get(page: str = "index"):
    uid = current_user_id()
    return {
        "content": read_help_markdown(page),
        "is_admin": is_admin(uid),
        "page": page,
    }


@router.put("/api/help")
def help_put(payload: HelpMarkdownPayload):
    _require_admin()
    return {
        "ok": True,
        "content": write_help_markdown(payload.content, payload.page),
        "page": payload.page,
    }
