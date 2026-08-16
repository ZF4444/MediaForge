"""Image adapter assembly kept independent from HTTP routes."""
from __future__ import annotations

from typing import Callable, Mapping

from app.ai.registry import ImageAdapterRegistry, ImageGenerationHandler


def build_image_adapter_registry(handlers: Mapping[str, ImageGenerationHandler]) -> ImageAdapterRegistry:
    registry = ImageAdapterRegistry()
    for key in ("runninghub", "omnilojo", "gemini", "volcengine", "openai"):
        registry.register(key, handlers[key])
    return registry


def select_image_adapter(
    provider: Mapping[str, object], model: str, *, runninghub: Callable[[Mapping[str, object]], bool],
    omnilojo: Callable[[Mapping[str, object]], bool], gemini: Callable[[Mapping[str, object], str], bool],
    volcengine: Callable[[Mapping[str, object]], bool],
) -> str:
    if runninghub(provider):
        return "runninghub"
    if omnilojo(provider):
        return "omnilojo"
    if gemini(provider, model):
        return "gemini"
    if volcengine(provider):
        return "volcengine"
    return "openai"
