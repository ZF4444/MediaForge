"""Shared model authorization for API admission."""

from fastapi import HTTPException

from app.core import access_control


def require_model_access(target, user_id: str) -> None:
    if target.model is None:
        return  # Executable workflows/apps have their own resource access rules.
    if not access_control.is_model_allowed(
        user_id, target.connection.id, target.model.upstream_model, model_id=target.model.id
    ):
        raise HTTPException(status_code=403, detail="没有权限使用该模型，请联系管理员开放。")
