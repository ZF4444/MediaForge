"""Migration-time runtime bindings for legacy application services.

This prevents downstream modules such as Canvas Agent from importing the root
ASGI module.  Bindings are intentionally narrow and will disappear after the
legacy resolver is replaced by the connection-backed gateway.
"""
from __future__ import annotations

from collections.abc import Callable
import inspect
from typing import Any


ChatResolver = Callable[[str, str], tuple[str, dict[str, str], str]]
ModelAuthorizer = Callable[[str, str], Any]
ProviderLoader = Callable[[], list[dict[str, Any]]]
CanvasImageNormalizer = Callable[[Any], Any]
MediaReferenceResolver = Callable[[dict[str, Any], int | None], str]
ProviderLookup = Callable[[str], dict[str, Any]]
ProviderBudgetAuthorizer = Callable[[dict[str, Any], str], Any]

_chat_resolver: ChatResolver | None = None
_model_authorizer: ModelAuthorizer | None = None
_provider_loader: ProviderLoader | None = None
_canvas_image_normalizer: CanvasImageNormalizer | None = None
_media_reference_resolver: MediaReferenceResolver | None = None
_provider_lookup: ProviderLookup | None = None
_provider_budget_authorizer: ProviderBudgetAuthorizer | None = None


def configure_provider_loader(loader: ProviderLoader) -> None:
    global _provider_loader
    _provider_loader = loader


def load_legacy_providers() -> list[dict[str, Any]]:
    if _provider_loader is None:
        raise RuntimeError("AI provider runtime is not configured")
    return _provider_loader()


def configure_legacy_chat_runtime(*, resolver: ChatResolver, authorizer: ModelAuthorizer) -> None:
    global _chat_resolver, _model_authorizer
    _chat_resolver = resolver
    _model_authorizer = authorizer


def resolve_chat_model(
    provider: str = "",
    model: str = "",
    *,
    model_id: str = "",
    connection_id: str = "",
) -> tuple[str, dict[str, str], str]:
    if _chat_resolver is None or _model_authorizer is None:
        raise RuntimeError("AI chat runtime is not configured")
    if model_id or connection_id:
        from app.ai.database_repository import DatabaseAIRepository
        try:
            target = DatabaseAIRepository().resolve_model(
                model_id=model_id,
                connection_id=connection_id,
                model=model,
                kind="chat",
            )
        except LookupError as exc:
            raise ValueError("指定的聊天模型资源不存在或不可用") from exc
        runtime = next((item for item in load_legacy_providers() if item.get("connection_id") == target.connection.id), None)
        if runtime is None:
            raise ValueError("指定的聊天连接未加载")
        provider = str(runtime["id"])
        model = target.model.upstream_model if target.model else model
    endpoint, headers, resolved_model = _chat_resolver(provider, model)
    _model_authorizer(provider, resolved_model)
    return endpoint, headers, resolved_model


def configure_canvas_runtime(
    *,
    image_normalizer: CanvasImageNormalizer,
    media_reference_resolver: MediaReferenceResolver,
    provider_lookup: ProviderLookup,
    provider_budget_authorizer: ProviderBudgetAuthorizer,
) -> None:
    """Bind legacy Canvas execution functions behind a narrow service port."""
    global _canvas_image_normalizer, _media_reference_resolver
    global _provider_lookup, _provider_budget_authorizer
    _canvas_image_normalizer = image_normalizer
    _media_reference_resolver = media_reference_resolver
    _provider_lookup = provider_lookup
    _provider_budget_authorizer = provider_budget_authorizer


def normalize_canvas_image_payload(payload: Any) -> Any:
    if _canvas_image_normalizer is None:
        raise RuntimeError("AI canvas runtime is not configured")
    return _canvas_image_normalizer(payload)


def reference_to_data_url(ref: dict[str, Any], max_size: int | None = None) -> str:
    if _media_reference_resolver is None:
        raise RuntimeError("AI canvas runtime is not configured")
    return _media_reference_resolver(ref, max_size)


async def authorize_image_task(provider_id: str, model: str, user_id: str) -> None:
    """Keep Agent task authorization identical to the manual Canvas path."""
    if _model_authorizer is None or _provider_lookup is None or _provider_budget_authorizer is None:
        raise RuntimeError("AI canvas runtime is not configured")
    _model_authorizer(provider_id, model)
    result = _provider_budget_authorizer(_provider_lookup(provider_id), user_id)
    if inspect.isawaitable(result):
        await result
