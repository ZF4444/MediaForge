"""Image adapter assembly kept independent from HTTP routes."""

from __future__ import annotations

from typing import Mapping

from app.ai.adapters.image_protocol import is_cloudwise_gemini_image
from app.ai.domain import ResolvedTarget
from app.ai.registry import ImageAdapterRegistry, ImageGenerationHandler

# Routed by connection host + model rather than protocol: Cloudwise connections
# are configured as ``openai`` but serve these models via Gemini's native API.
CLOUDWISE_GEMINI_ADAPTER = "cloudwise_gemini"


def build_image_adapter_registry(handlers: Mapping[str, ImageGenerationHandler]) -> ImageAdapterRegistry:
    registry = ImageAdapterRegistry()
    for key in ("runninghub", "omnilojo", "gemini", "volcengine", "openai", CLOUDWISE_GEMINI_ADAPTER):
        registry.register(key, handlers[key])
    return registry


def select_target_image_adapter(target: ResolvedTarget) -> str:
    """Select an image protocol from the canonical resolved target only."""
    if target.model and is_cloudwise_gemini_image(target.connection.base_url, target.model.upstream_model):
        return CLOUDWISE_GEMINI_ADAPTER
    protocol = str(target.protocol or "openai").strip().lower()
    if protocol in {"runninghub", "omnilojo", "gemini", "volcengine", "openai"}:
        return protocol
    raise LookupError(f"unsupported image target protocol: {protocol}")
