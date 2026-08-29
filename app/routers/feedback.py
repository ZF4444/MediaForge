"""用户反馈提交与管理员反馈管理接口。"""
from fastapi import APIRouter, HTTPException, Query, Request

from app.core.access_control import has_page_access
from app.core.auth import current_user_id
from app.models import FeedbackCreatePayload, FeedbackUpdatePayload
from app.services.feedback import (
    create_feedback,
    delete_feedback,
    list_feedback,
    normalize_feedback_status,
    update_feedback,
)

router = APIRouter()


def _require_feedback_access() -> str:
    uid = current_user_id()
    if not has_page_access(uid, "feedback-admin"):
        raise HTTPException(status_code=403, detail="需要“反馈管理”页面权限。")
    return uid


def _current_username(request: Request, user_id: str) -> str:
    return getattr(request.state, "username", None) or user_id


@router.post("/api/feedback")
def feedback_create(payload: FeedbackCreatePayload, request: Request):
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="反馈内容不能为空。")
    uid = current_user_id()
    item = create_feedback(
        {
            "type": payload.type,
            "content": content,
            "page": payload.page,
            "user_agent": payload.user_agent,
        },
        uid,
        _current_username(request, uid),
    )
    return {"ok": True, "id": item["id"]}


@router.get("/api/feedback/admin")
def feedback_admin_list(
    status: str = Query(default=""),
    type: str = Query(default=""),
    user_id: str = Query(default=""),
    q: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    _require_feedback_access()
    return list_feedback(
        status=status or None,
        feedback_type=type or None,
        user_id=user_id or None,
        q=q or None,
        limit=limit,
        offset=offset,
    )


@router.patch("/api/feedback/admin/{feedback_id}")
def feedback_admin_update(feedback_id: str, payload: FeedbackUpdatePayload):
    _require_feedback_access()
    if payload.status is not None and normalize_feedback_status(payload.status) is None:
        raise HTTPException(status_code=400, detail="反馈状态无效。")
    item = update_feedback(
        feedback_id,
        status=payload.status,
        admin_note=payload.admin_note,
    )
    if not item:
        raise HTTPException(status_code=404, detail="反馈不存在。")
    return {"ok": True, "item": item}


@router.delete("/api/feedback/admin/{feedback_id}")
def feedback_admin_delete(feedback_id: str):
    _require_feedback_access()
    if not delete_feedback(feedback_id):
        raise HTTPException(status_code=404, detail="反馈不存在。")
    return {"ok": True}
