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
    provider_name: str = ""
    model_label: str = ""

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
        provider_name = str(provider.get("name") or pid)
        aliases = provider.get("model_aliases") if isinstance(provider.get("model_aliases"), dict) else {}
        # Prompt nodes use the configured chat models to generate or refine
        # text. Keep this distinct from the Agent's own orchestration model.
        for model in provider.get("chat_models", []):
            raw_model = str(model); self.register(Capability("prompt.generate", {"model": raw_model, "model_label": str(aliases.get(raw_model) or raw_model)}, "low", True, pid, raw_model, provider_name, str(aliases.get(raw_model) or raw_model)))
        for model in provider.get("image_models", []):
            raw_model = str(model); self.register(Capability("image.text_to_image", {"model": raw_model, "model_label": str(aliases.get(raw_model) or raw_model)}, "medium", True, pid, raw_model, provider_name, str(aliases.get(raw_model) or raw_model)))
        for model in provider.get("video_models", []):
            raw_model = str(model); self.register(Capability("video.text_to_video", {"model": raw_model, "model_label": str(aliases.get(raw_model) or raw_model)}, "high", True, pid, raw_model, provider_name, str(aliases.get(raw_model) or raw_model)))
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
    def as_dict(self) -> list[dict[str, Any]]: return [{"name": c.name, "input_constraints": c.input_constraints, "cost_level": c.cost_level, "enabled": c.enabled, "provider_id": c.provider_id, "provider_name": c.provider_name or c.provider_id, "model": c.model, "model_label": c.model_label or c.model, "display_name": f"{c.provider_name or c.provider_id} / {c.model_label or c.model}"} for c in self.list()]

def from_provider_configuration(provider_loader=None, workflow_loader=None) -> CapabilityRegistry:
    """Build a public capability registry from the existing provider resolver.

    Only semantic capability metadata is exposed; API keys and endpoint secrets
    remain inside the existing provider runtime.
    """
    if provider_loader is None:
        # Agent task submission runs inside the command worker's event loop.
        # The cache is refreshed by startup/config-change handling; reading it
        # here avoids the synchronous database bridge in that async path.
        from main import load_api_providers
        provider_loader = load_api_providers
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
