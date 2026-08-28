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
from app.services.business_metadata import get_app_setting, set_app_setting

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


@router.get("/api/settings/new-user-budget")
def new_user_budget_get():
    _require_admin()
    value = get_app_setting("new_user_budget", {"monthly_budget_usd": 0, "enabled": True})
    if not isinstance(value, dict):
        value = {"monthly_budget_usd": 0, "enabled": True}
    return {"monthly_budget_usd": value.get("monthly_budget_usd", 0), "enabled": bool(value.get("enabled", True))}


@router.put("/api/settings/new-user-budget")
def new_user_budget_update(payload: dict[str, Any]):
    _require_admin()
    try:
        amount = float(payload.get("monthly_budget_usd", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="预算金额必须为非负数。") from None
    if amount < 0 or amount > 9999999999.9999:
        raise HTTPException(status_code=400, detail="预算金额必须为非负数且不能过大。")
    value = {"monthly_budget_usd": amount, "enabled": bool(payload.get("enabled", True))}
    set_app_setting("new_user_budget", value)
    audit_event("new_user_budget_updated", action="update", resource_type="setting", resource_id="new_user_budget", after=value)
    return {"ok": True, **value}
