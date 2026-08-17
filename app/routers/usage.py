"""Admin endpoints for provider usage and organization cash budgets."""
from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.access_control import is_admin
from app.core.auth import current_user_id
from app.core.logging import audit_event
from app.services.usage import (
    omnilojo_usage_dashboard,
    runninghub_usage_dashboard,
    set_organization_budget,
    set_user_budget,
    user_usage_dashboard,
)

router = APIRouter()


@router.get("/api/account/overview")
def account_overview(month: str = "", limit: int = 20):
    """A self-service usage view, scoped to the authenticated user."""
    try:
        return user_usage_dashboard(current_user_id(), month or None, limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


def _require_admin() -> str:
    uid = current_user_id()
    if not is_admin(uid):
        raise HTTPException(status_code=403, detail="需要管理员权限。")
    return uid


@router.get("/api/usage/runninghub")
def runninghub_usage(month: str = "", limit: int = 100):
    _require_admin()
    try:
        return runninghub_usage_dashboard(month or None, limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.get("/api/usage/omnilojo")
def omnilojo_usage(month: str = "", limit: int = 100):
    _require_admin()
    try:
        result = omnilojo_usage_dashboard(month or None, limit)
        result["source"] = "response_usage"
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.put("/api/organizations/{org_id}/budget")
def organization_budget_update(org_id: str, payload: dict[str, Any]):
    _require_admin()
    try:
        result = set_organization_budget(org_id, payload.get("monthly_budget_cny", 0), bool(payload.get("enabled")))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    audit_event("organization_budget_updated", action="update", resource_type="organization_budget", resource_id=org_id, after=result)
    return {"ok": True, "budget": result}


@router.put("/api/users/{user_id}/budget")
def user_budget_update(user_id: str, payload: dict[str, Any]):
    _require_admin()
    try:
        result = set_user_budget(user_id, payload.get("monthly_budget_usd", 0), bool(payload.get("enabled")))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    audit_event("user_budget_updated", action="update", resource_type="user_budget", resource_id=user_id, after=result)
    return {"ok": True, "budget": result}
