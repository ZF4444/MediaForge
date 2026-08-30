"""平台帮助文档读取与管理员编辑接口。

每个前端页面拥有独立的帮助内容，通过 `page` 查询参数区分（例如 index、
canvas、asset-manager 等）。未传或非法的 page 会回退到默认页 "index"。
"""
from fastapi import APIRouter, HTTPException

from app.core.access_control import has_page_access
from app.core.auth import current_user_id
from app.models import HelpMarkdownPayload
from app.services.help_doc import read_help_markdown, write_help_markdown

router = APIRouter()


def _require_help_access() -> str:
    uid = current_user_id()
    if not has_page_access(uid, "user-management"):
        raise HTTPException(status_code=403, detail="需要“用户管理”页面权限。")
    return uid


@router.get("/api/help")
def help_get(page: str = "index"):
    return {
        "content": read_help_markdown(page),
        "page": page,
    }


@router.put("/api/help")
def help_put(payload: HelpMarkdownPayload):
    _require_help_access()
    return {
        "ok": True,
        "content": write_help_markdown(payload.content, payload.page),
        "page": payload.page,
    }
