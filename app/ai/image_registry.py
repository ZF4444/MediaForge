"""Image adapter assembly kept independent from HTTP routes."""
from __future__ import annotations

from typing import Mapping

from app.ai.registry import ImageAdapterRegistry, ImageGenerationHandler
from app.ai.domain import ResolvedTarget


def build_image_adapter_registry(handlers: Mapping[str, ImageGenerationHandler]) -> ImageAdapterRegistry:
    registry = ImageAdapterRegistry()
    for key in ("runninghub", "omnilojo", "gemini", "volcengine", "openai"):
        registry.register(key, handlers[key])
    return registry


def select_target_image_adapter(target: ResolvedTarget) -> str:
    """Select an image protocol from the canonical resolved target only."""
    protocol = str(target.protocol or "openai").strip().lower()
    if protocol in {"runninghub", "omnilojo", "gemini", "volcengine", "openai"}:
        return protocol
    raise LookupError(f"unsupported image target protocol: {protocol}")
