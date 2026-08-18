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
        for model in provider.get("image_models", []): self.register(Capability("image.text_to_image", {"model": model}, "medium", True, pid, str(model)))
        for model in provider.get("video_models", []): self.register(Capability("video.text_to_video", {"model": model}, "high", True, pid, str(model)))
        for app in provider.get("rh_apps", []):
            name = str(app.get("capability") or app.get("type") or "image.text_to_image")
            self.register(Capability(name, {"app_id": app.get("webappId") or app.get("id", "")}, "high", True, pid, str(app.get("model") or "")))
    def get(self, name: str) -> Capability | None: return self._items.get(name)
    def resolve(self, name: str, *, requested_model: str = "") -> Capability | None:
        capability = self._items.get(name)
        if capability is None or (requested_model and capability.model != requested_model):
            for candidate in self._candidates.get(name, []):
                if not requested_model or candidate.model == requested_model: return candidate
        return capability
    def list(self) -> list[Capability]: return [item for values in self._candidates.values() for item in values]
    def as_dict(self) -> list[dict[str, Any]]: return [{"name": c.name, "input_constraints": c.input_constraints, "cost_level": c.cost_level, "enabled": c.enabled, "provider_id": c.provider_id, "model": c.model} for c in self.list()]

def from_provider_configuration(provider_loader=None) -> CapabilityRegistry:
    """Build a public capability registry from the existing provider resolver.

    Only semantic capability metadata is exposed; API keys and endpoint secrets
    remain inside the existing provider runtime.
    """
    if provider_loader is None:
        from main import load_api_providers
        provider_loader = load_api_providers
    providers = provider_loader() or []
    registry = CapabilityRegistry(providers)
    return registry
