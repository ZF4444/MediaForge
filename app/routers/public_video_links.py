"""Internal management routes. Session and same-origin middleware are inherited."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from app.core.access_control import has_page_access, is_admin
from app.core.auth import current_user_id
from app.core.logging import audit_event
from app.public_media.business import get_service
from app.public_media.config import Conflict, Denied, Disabled, Unavailable
from app.public_media.contracts import BatchRequest, GrantRequest, PolicyRequest, SourceRequest


async def security(request: Request, response: Response):
    from app.core.media import ensure_same_origin_request

    response.headers.update({"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})
    if request.method not in ("GET", "HEAD"):
        ensure_same_origin_request(request)
        if request.headers.get("x-mediaforge-request") != "1":
            raise HTTPException(403, "缺少外发管理请求校验头")


router = APIRouter(dependencies=[Depends(security)])


def audit(event, **fields):
    audit_event(event, action=event, resource_type="public_video", **fields)


def user(admin=False):
    uid = current_user_id()
    if not uid or (admin and not is_admin(uid)) or (not admin and not has_page_access(uid, "public-video-links")):
        raise HTTPException(403, "没有外发链接管理权限")
    return uid


@asynccontextmanager
async def errors():
    try:
        yield
    except Disabled as exc:
        raise HTTPException(503, str(exc)) from None
    except Denied as exc:
        raise HTTPException(403, str(exc)) from None
    except Conflict as exc:
        raise HTTPException(409, str(exc)) from None
    except Unavailable:
        raise HTTPException(503, "视频外发服务暂不可用") from None


@router.post("/api/public-video-sources")
async def bind(payload: SourceRequest):
    uid = await asyncio.to_thread(user)
    async with errors():
        result = await get_service().bind(uid, payload.file_id, payload.task_id, payload.provider_id)
        audit("public_video_source_created", source_id=result["id"], user_id=uid)
        return result


@router.post("/api/public-video-sources/{source_id}/grants")
async def issue(source_id: str, payload: GrantRequest):
    uid = await asyncio.to_thread(user)
    async with errors():
        result = await get_service().issue(uid, source_id, payload.idempotency_key, payload.ttl_seconds, payload.rotate)
        audit("public_video_grant_issued", grant_id=result["id"], user_id=uid, rotated=payload.rotate)
        return result


@router.get("/api/public-video-grants")
async def listing(
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    state: str = Query("", pattern="^(|active|expired|revoked)$"),
):
    uid = await asyncio.to_thread(user)
    admin = await asyncio.to_thread(is_admin, uid)
    async with errors():
        result = await asyncio.to_thread(get_service().repo.list_grants, None if admin else uid, offset, limit, state)
        return {**result, "is_admin": admin, "viewer_id": uid}


@router.post("/api/public-video-grants/{grant_id}/revoke")
async def revoke(grant_id: str):
    uid = await asyncio.to_thread(user)
    admin = await asyncio.to_thread(is_admin, uid)
    async with errors():
        await asyncio.to_thread(get_service().repo.revoke, grant_id, None if admin else uid)
        audit("public_video_grant_revoked", grant_id=grant_id, user_id=uid)
        return {"ok": True}


@router.post("/api/admin/public-video-grants/revoke-batch")
async def revoke_batch(payload: BatchRequest):
    uid = await asyncio.to_thread(user, admin=True)
    async with errors():
        await asyncio.to_thread(get_service().repo.set_policy, payload.scope, payload.key, False)
        audit("public_video_scope_revoked", scope=payload.scope, scope_key=payload.key, user_id=uid)
        return {"ok": True}


@router.get("/api/admin/public-video-policy")
async def policies():
    await asyncio.to_thread(user, admin=True)
    async with errors():
        return {"items": await asyncio.to_thread(get_service().repo.policies)}


@router.put("/api/admin/public-video-policy")
async def policy(payload: PolicyRequest):
    uid = await asyncio.to_thread(user, admin=True)
    if payload.scope == "global" and payload.key != "*":
        raise HTTPException(422, "全局策略 key 必须为 *")
    async with errors():
        await asyncio.to_thread(
            get_service().repo.set_policy,
            payload.scope,
            payload.key,
            payload.enabled,
            payload.daily_bytes,
            payload.active_bytes,
        )
        audit(
            "public_video_policy_changed",
            scope=payload.scope,
            scope_key=payload.key,
            enabled=payload.enabled,
            user_id=uid,
        )
        return {"ok": True}
