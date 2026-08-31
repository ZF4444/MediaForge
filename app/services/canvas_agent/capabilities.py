"""Canonical capability registry for Canvas Agent."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.ai.database_repository import DatabaseAIRepository


@dataclass(frozen=True)
class Capability:
    name: str
    input_constraints: dict[str, Any] = field(default_factory=dict)
    cost_level: str = "unknown"
    enabled: bool = True
    connection_id: str = ""
    model_id: str = ""
    resource_id: str = ""
    connection_name: str = ""
    model_name: str = ""


class CapabilityRegistry:
    def __init__(self, items: list[Capability] | None = None):
        self._items: dict[str, Capability] = {}
        self._candidates: dict[str, list[Capability]] = {}
        for item in items or []:
            self.register(item)

    def register(self, capability: Capability) -> None:
        self._items.setdefault(capability.name, capability)
        self._candidates.setdefault(capability.name, []).append(capability)

    def get(self, name: str) -> Capability | None:
        return self._items.get(name)

    def resolve(self, name: str, *, requested_model_id: str = "", requested_model: str = "") -> Capability | None:
        for candidate in self._candidates.get(name, []):
            if requested_model_id and candidate.model_id != requested_model_id:
                continue
            if requested_model and candidate.model_name != requested_model:
                continue
            return candidate
        return None

    def list(self) -> list[Capability]:
        return [item for values in self._candidates.values() for item in values]

    def as_dict(self) -> list[dict[str, Any]]:
        return [{
            "name": item.name,
            "input_constraints": item.input_constraints,
            "cost_level": item.cost_level,
            "enabled": item.enabled,
            "connection_id": item.connection_id,
            "model_id": item.model_id,
            "resource_id": item.resource_id,
            "connection_name": item.connection_name,
            "model_name": item.model_name,
            "display_name": f"{item.connection_name} / {item.model_name or item.resource_id}",
        } for item in self.list()]


def from_repository(repository: DatabaseAIRepository | None = None) -> CapabilityRegistry:
    repository = repository or DatabaseAIRepository()
    connections = {item.id: item for item in repository.connections()}
    registry = CapabilityRegistry()
    for model in repository.models():
        connection = connections.get(model.connection_id)
        if connection is None:
            continue
        capability_name = {"chat": "prompt.generate", "image": "image.text_to_image", "video": "video.text_to_video"}.get(model.kind)
        if capability_name:
            registry.register(Capability(
                capability_name,
                {"model_id": model.id, "model": model.upstream_model, "model_name": model.alias or model.upstream_model},
                {"chat": "low", "image": "medium", "video": "high"}[model.kind],
                model.enabled and connection.enabled,
                connection.id, model.id, "", connection.name, model.alias or model.upstream_model,
            ))
    for resource in repository.executable_resources():
        connection = connections.get(resource.connection_id)
        if connection is None:
            continue
        settings = dict(resource.settings or {})
        if resource.kind == "runninghub_app":
            media = "video" if settings.get("media") == "video" else "image"
            name = str(settings.get("capability") or settings.get("type") or f"runninghub.app.{media}")
        else:
            media = "video" if settings.get("media") == "video" else "image"
            name = str(settings.get("capability") or f"comfyui.workflow.{media}")
        registry.register(Capability(name, {"resource_id": resource.id, "title": resource.name}, "high", resource.enabled and connection.enabled, connection.id, "", resource.id, connection.name, resource.name))
    return registry
