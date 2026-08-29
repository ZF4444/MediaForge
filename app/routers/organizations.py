"""组织管理路由（/api/organizations/*，需要“用户管理”页面权限）。

端点：
- GET    /api/organizations                 组织列表（含成员数量）。
- POST   /api/organizations                 创建组织。
- PUT    /api/organizations/{org_id}        重命名组织。
- DELETE /api/organizations/{org_id}        删除组织（成员自动解除归属，不会被删除）。
- PUT    /api/access-control/users/{user_id}/org   把用户分配到某组织（org_id 为 null 表示解除归属）。

权限：拥有“用户管理”页面权限的用户可管理组织和用户归属。
"""
from fastapi import APIRouter, HTTPException

from app.core.access_control import has_page_access
from app.core.auth import USERS, USERS_LOCK, current_user_id, set_user_org
from app.core.logging import audit_event
from app.core.organizations import (
    create_organization,
    delete_organization,
    list_organizations,
    organization_exists,
    rename_organization,
)
from app.models import OrganizationCreatePayload, OrganizationRenamePayload, UserOrgAssignPayload

router = APIRouter()


def _require_user_management() -> str:
    uid = current_user_id()
    if not has_page_access(uid, "user-management"):
        raise HTTPException(status_code=403, detail="需要“用户管理”页面权限。")
    return uid


@router.get("/api/organizations")
def organizations_list():
    """全部组织。"""
    _require_user_management()
    return {"organizations": list_organizations()}


@router.post("/api/organizations")
def organizations_create(payload: OrganizationCreatePayload):
    """创建组织。"""
    _require_user_management()
    try:
        org = create_organization(payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    audit_event(
        "organization_created",
        action="create",
        resource_type="organization",
        resource_id=org["id"],
        after={"name": org["name"]},
    )
    return {"ok": True, "organization": org}


@router.put("/api/organizations/{org_id}")
def organizations_rename(org_id: str, payload: OrganizationRenamePayload):
    """重命名组织。"""
    _require_user_management()
    try:
        ok = rename_organization(org_id, payload.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not ok:
        raise HTTPException(status_code=404, detail="组织不存在。")
    audit_event(
        "organization_renamed",
        action="update",
        resource_type="organization",
        resource_id=org_id,
        after={"name": payload.name.strip()},
    )
    return {"ok": True}


@router.delete("/api/organizations/{org_id}")
def organizations_delete(org_id: str):
    """删除组织；成员自动解除归属，不会被删除。"""
    _require_user_management()
    ok = delete_organization(org_id)
    if not ok:
        raise HTTPException(status_code=404, detail="组织不存在。")
    audit_event(
        "organization_deleted",
        action="delete",
        resource_type="organization",
        resource_id=org_id,
    )
    return {"ok": True}


@router.put("/api/access-control/users/{user_id}/org")
def assign_user_organization(user_id: str, payload: UserOrgAssignPayload):
    """把用户分配到某组织，或解除归属（org_id=null）。"""
    _require_user_management()
    with USERS_LOCK:
        exists = user_id in USERS
    if not exists:
        raise HTTPException(status_code=404, detail="用户不存在。")
    org_id = (payload.org_id or "").strip() or None
    if org_id and not organization_exists(org_id):
        raise HTTPException(status_code=404, detail="组织不存在。")
    set_user_org(user_id, org_id)
    audit_event(
        "user_organization_assigned",
        action="update",
        resource_type="user",
        resource_id=user_id,
        after={"org_id": org_id},
    )
    return {"ok": True, "user_id": user_id, "org_id": org_id}
