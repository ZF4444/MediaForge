"""Video token price selection from the persisted request and model settings."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urlsplit

VIDEO_RESOLUTIONS = ("480p", "720p", "1080p", "4k")
VIDEO_INPUT_TIERS = ("without_video", "with_video")


def validate_video_token_prices(prices: Any) -> None:
    if not isinstance(prices, dict) or set(prices) - set(VIDEO_RESOLUTIONS):
        raise ValueError("视频价格分辨率必须为 480p、720p、1080p 或 4k")
    for tiers in prices.values():
        if not isinstance(tiers, dict) or set(tiers) - set(VIDEO_INPUT_TIERS):
            raise ValueError("视频价格必须按是否包含输入视频配置")
        for value in tiers.values():
            try:
                amount = Decimal(str(value))
            except (InvalidOperation, ValueError):
                raise ValueError("视频 Token 单价必须为非负有限数值") from None
            if not amount.is_finite() or amount < 0:
                raise ValueError("视频 Token 单价必须为非负有限数值")


def has_video_input(request: dict[str, Any]) -> bool:
    """Match Seedance's first-three-reference filtering, including image URLs."""
    image_urls = {
        str(ref.get("url") or "").strip() for ref in (request.get("images") or [])[:9] if isinstance(ref, dict)
    }
    for value in (request.get("videos") or [])[:3]:
        text = str(value or "").strip()
        if not text or text in image_urls or text.lower().startswith("data:image/"):
            continue
        path = urlsplit(text).path.lower()
        if not path.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff")):
            return True
    return False


def video_resolution(value: Any) -> str:
    resolution = str(value or "480p").strip().lower()
    resolution = {"480": "480p", "720": "720p", "1080": "1080p"}.get(resolution, resolution)
    return resolution if resolution in VIDEO_RESOLUTIONS else "480p"


def video_billing_context(settings: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    prices = settings.get("video_token_prices") or {}
    validate_video_token_prices(prices)
    resolution = video_resolution(request.get("resolution"))
    contains_video = has_video_input(request)
    tier = "with_video" if contains_video else "without_video"
    rate = prices.get(resolution, {}).get(tier)
    return {
        "resolution": resolution,
        "has_video_input": contains_video,
        "tier": tier,
        "per_million": str(rate) if rate is not None else None,
        "currency": "USD",
        "configured": rate is not None,
        "token_basis": "total_tokens",
    }


def record_video_response_usage(
    user_id: str,
    provider: dict[str, Any],
    model: str,
    raw: dict[str, Any],
    context: dict[str, Any],
    upstream_task_id: str,
) -> bool:
    from app.services.usage import record_openai_response_usage

    usage = raw.get("usage")
    if not isinstance(usage, dict) or not upstream_task_id:
        return False
    # Seedance returns generation tokens, not separately priced prompt tokens.
    # Prefer the reported total, falling back to completion tokens if absent.
    tokens = usage.get("total_tokens")
    if tokens is None:
        tokens = usage.get("completion_tokens")
    if tokens is None:
        return False
    price = {"output_per_million": context["per_million"]} if context["configured"] else None
    priced_provider = {
        **provider,
        "model_prices": {model: price} if price is not None else {},
        "omnilojo_model_prices": {},
    }
    return record_openai_response_usage(
        user_id,
        priced_provider,
        model,
        {"id": upstream_task_id, "usage": {"completion_tokens": tokens, "total_tokens": tokens}},
        operation="video_generation",
        billing_context={
            **context,
            "local_task_id": provider.get("billing_task_id") or "",
            "upstream_task_id": upstream_task_id,
            "upstream_usage": usage,
        },
    )
