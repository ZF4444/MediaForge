"""Runtime bindings for canonical AI connection services.

This prevents downstream modules such as Canvas Agent from importing the root
ASGI module.  Bindings are intentionally narrow and will disappear after the
connection-backed gateway.
"""
from __future__ import annotations

from collections.abc import Callable
import inspect
from typing import Any


TargetAuthorizer = Callable[[Any, str], Any]
ConnectionRuntimeLoader = Callable[[], list[dict[str, Any]]]
CanvasImageNormalizer = Callable[[Any], Any]
MediaReferenceResolver = Callable[[dict[str, Any], int | None], str]
ConnectionLookup = Callable[[str], dict[str, Any]]
ConnectionBudgetAuthorizer = Callable[[dict[str, Any], str], Any]

_target_authorizer: TargetAuthorizer | None = None
_connection_runtime_loader: ConnectionRuntimeLoader | None = None
_canvas_image_normalizer: CanvasImageNormalizer | None = None
_media_reference_resolver: MediaReferenceResolver | None = None
_connection_lookup: ConnectionLookup | None = None
_connection_budget_authorizer: ConnectionBudgetAuthorizer | None = None


def configure_connection_runtime_loader(loader: ConnectionRuntimeLoader) -> None:
    global _connection_runtime_loader
    _connection_runtime_loader = loader


def load_connection_runtime() -> list[dict[str, Any]]:
    if _connection_runtime_loader is None:
        raise RuntimeError("AI connection runtime is not configured")
    return _connection_runtime_loader()


def resolve_connection_runtime(connection_id: str) -> dict[str, Any]:
    """Return transient transport metadata for a canonical connection."""
    selected = str(connection_id or "").strip()
    runtime = next((item for item in load_connection_runtime() if str(item.get("connection_id") or "") == selected), None)
    if runtime is None:
        raise ValueError("指定的 AI 连接未加载")
    return runtime


def configure_canvas_runtime(
    *,
    image_normalizer: CanvasImageNormalizer,
    media_reference_resolver: MediaReferenceResolver,
    target_authorizer: TargetAuthorizer,
    connection_lookup: ConnectionLookup,
    connection_budget_authorizer: ConnectionBudgetAuthorizer,
) -> None:
    """Bind legacy Canvas execution functions behind a narrow service port."""
    global _canvas_image_normalizer, _media_reference_resolver, _target_authorizer
    global _connection_lookup, _connection_budget_authorizer
    _canvas_image_normalizer = image_normalizer
    _media_reference_resolver = media_reference_resolver
    _target_authorizer = target_authorizer
    _connection_lookup = connection_lookup
    _connection_budget_authorizer = connection_budget_authorizer


def normalize_canvas_image_payload(payload: Any) -> Any:
    if _canvas_image_normalizer is None:
        raise RuntimeError("AI canvas runtime is not configured")
    return _canvas_image_normalizer(payload)


def reference_to_data_url(ref: dict[str, Any], max_size: int | None = None) -> str:
    if _media_reference_resolver is None:
        raise RuntimeError("AI canvas runtime is not configured")
    return _media_reference_resolver(ref, max_size)


async def authorize_target_task(target: Any, user_id: str) -> None:
    """Authorize an Agent task from a canonical resolved target."""
    if _target_authorizer is None or _connection_budget_authorizer is None:
        raise RuntimeError("AI canvas runtime is not configured")
    connection = target.connection
    model = target.model.upstream_model if target.model else ""
    connection_id = str(connection.id)
    result = _target_authorizer(target, user_id)
    if inspect.isawaitable(result):
        await result
    runtime = {"id": connection_id, "connection_id": connection_id, "protocol": connection.protocol, "name": connection.name, "base_url": connection.base_url, **dict(connection.settings or {})}
    result = _connection_budget_authorizer(runtime, user_id)
    if inspect.isawaitable(result):
        await result
