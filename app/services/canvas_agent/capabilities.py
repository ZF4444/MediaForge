from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Iterable

@dataclass(frozen=True)
class Capability:
    name: str
    input_constraints: dict[str, Any] = field(default_factory=dict)
    cost_level: str = "unknown"
    enabled: bool = True
    provider_id: str = ""
    model: str = ""

class CapabilityRegistry:
    def __init__(self, providers: Iterable[dict[str, Any]] = ()):
        self._items: dict[str, Capability] = {}
        self._candidates: dict[str, list[Capability]] = {}
        for provider in providers: self.register_provider(provider)
    def register(self, capability: Capability) -> None:
        # Keep the first enabled resolver target stable; callers may still ask
        # for a specific model through resolve(..., requested_model=...).
        self._items.setdefault(capability.name, capability)
        self._candidates.setdefault(capability.name, []).append(capability)
    def register_provider(self, provider: dict[str, Any]) -> None:
        if not provider.get("enabled", True): return
        pid = str(provider.get("id") or provider.get("provider_id") or "")
        # Prompt nodes use the configured chat models to generate or refine
        # text. Keep this distinct from the Agent's own orchestration model.
        for model in provider.get("chat_models", []):
            self.register(Capability("prompt.generate", {"model": model}, "low", True, pid, str(model)))
        for model in provider.get("image_models", []): self.register(Capability("image.text_to_image", {"model": model}, "medium", True, pid, str(model)))
        for model in provider.get("video_models", []): self.register(Capability("video.text_to_video", {"model": model}, "high", True, pid, str(model)))
        for app in provider.get("rh_apps", []):
            app_id = str(app.get("webappId") or app.get("appId") or app.get("id") or "")
            media = "video" if app.get("media") == "video" else "image"
            name = str(app.get("capability") or app.get("type") or f"runninghub.app.{media}")
            self.register(Capability(name, {"app_id": app_id, "title": str(app.get("title") or app_id)}, "high", True, pid, str(app.get("model") or app_id)))
    def get(self, name: str) -> Capability | None: return self._items.get(name)
    def resolve(self, name: str, *, requested_model: str = "") -> Capability | None:
        capability = self._items.get(name)
        if capability is None or (requested_model and capability.model != requested_model):
            for candidate in self._candidates.get(name, []):
                if not requested_model or candidate.model == requested_model: return candidate
        return capability
    def list(self) -> list[Capability]: return [item for values in self._candidates.values() for item in values]
    def as_dict(self) -> list[dict[str, Any]]: return [{"name": c.name, "input_constraints": c.input_constraints, "cost_level": c.cost_level, "enabled": c.enabled, "provider_id": c.provider_id, "model": c.model} for c in self.list()]

def from_provider_configuration(provider_loader=None, workflow_loader=None) -> CapabilityRegistry:
    """Build a public capability registry from the existing provider resolver.

    Only semantic capability metadata is exposed; API keys and endpoint secrets
    remain inside the existing provider runtime.
    """
    if provider_loader is None:
        from main import refresh_api_providers_cache
        provider_loader = refresh_api_providers_cache
    providers = provider_loader() or []
    registry = CapabilityRegistry(providers)
    comfyui_enabled = any(
        str(provider.get("id") or "").lower() == "comfyui" and provider.get("enabled", True)
        for provider in providers if isinstance(provider, dict)
    )
    if not comfyui_enabled:
        return registry
    if workflow_loader is None:
        from app.routers.workflows import list_workflows
        workflow_loader = list_workflows
    workflow_data = workflow_loader() or {}
    workflows = workflow_data.get("workflows") if isinstance(workflow_data, dict) else workflow_data
    for workflow in workflows or []:
        if not isinstance(workflow, dict) or not workflow.get("name"):
            continue
        media = "video" if workflow.get("media") == "video" else "image"
        name = str(workflow["name"])
        registry.register(Capability(
            f"comfyui.workflow.{media}",
            {"workflow": name, "title": str(workflow.get("title") or name), "field_count": int(workflow.get("field_count") or 0)},
            "high" if media == "video" else "medium",
            True,
            "comfyui",
            name,
        ))
    return registry
