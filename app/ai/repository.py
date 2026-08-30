"""Read-only Connection/Model projection over the legacy provider configuration.

The application still persists ``api_providers`` during the migration.  This
repository makes that storage detail invisible to new AI callers and gives all
resources stable IDs before the eventual database split.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any, Mapping
from urllib.parse import quote

from app.ai.domain import Connection, ExecutableResource, ModelKind, ModelResource, ResolvedTarget


ProviderLoader = Callable[[], list[dict[str, Any]]]
_KIND_CAPABILITIES: dict[str, frozenset[str]] = {
    "chat": frozenset({"chat", "stream_chat", "tool_calling"}),
    "image": frozenset({"generate_image"}),
    "video": frozenset({"generate_video"}),
}


def legacy_connection_id(provider_id: str) -> str:
    return f"legacy:{str(provider_id or '').strip().lower()}"


def legacy_model_id(provider_id: str, kind: ModelKind, model: str) -> str:
    return f"{legacy_connection_id(provider_id)}:{kind}:{quote(str(model or '').strip(), safe='')}"


class ProviderRepository:
    """Projects normalized legacy providers into explicit AI resources."""

    def __init__(self, provider_loader: ProviderLoader):
        self._provider_loader = provider_loader

    def providers(self) -> list[dict[str, Any]]:
        return [dict(item) for item in (self._provider_loader() or []) if isinstance(item, dict)]

    @staticmethod
    def _model_protocol(provider: Mapping[str, Any], model: str) -> str:
        provider_id = str(provider.get("id") or "").strip().lower()
        protocol = str(provider.get("protocol") or "openai").strip().lower() or "openai"
        if provider_id in {"runninghub", "volcengine"}:
            return protocol
        override = (provider.get("model_protocols") or {}).get(model)
        return str(override or protocol).strip().lower() or protocol

    @staticmethod
    def _connection(provider: Mapping[str, Any]) -> Connection:
        provider_id = str(provider.get("id") or "").strip().lower()
        return Connection(
            id=legacy_connection_id(provider_id),
            legacy_provider_id=provider_id,
            protocol=str(provider.get("protocol") or "openai").strip().lower() or "openai",
            name=str(provider.get("name") or provider_id),
            base_url=str(provider.get("base_url") or "").rstrip("/"),
            enabled=bool(provider.get("enabled", True)),
            primary=bool(provider.get("primary", False)),
            settings=dict(provider),
        )

    def connections(self, *, include_disabled: bool = False) -> list[Connection]:
        values = [self._connection(provider) for provider in self.providers()]
        return values if include_disabled else [item for item in values if item.enabled]

    def models(self, *, include_disabled: bool = False) -> list[ModelResource]:
        values: list[ModelResource] = []
        for provider in self.providers():
            connection = self._connection(provider)
            if not include_disabled and not connection.enabled:
                continue
            for kind, key in (("chat", "chat_models"), ("image", "image_models"), ("video", "video_models")):
                for raw_model in provider.get(key) or []:
                    model = str(raw_model or "").strip()
                    if not model:
                        continue
                    if (provider.get("model_enabled") or {}).get(model) is False:
                        continue
                    values.append(ModelResource(
                        id=legacy_model_id(connection.legacy_provider_id, kind, model),
                        connection_id=connection.id,
                        upstream_model=model,
                        kind=kind,  # type: ignore[arg-type]
                        protocol=self._model_protocol(provider, model),
                        alias=str((provider.get("model_aliases") or {}).get(model) or model),
                        capabilities=_KIND_CAPABILITIES[kind],
                    ))
        return values

    def executable_resources(self, *, include_disabled: bool = False) -> list[ExecutableResource]:
        resources: list[ExecutableResource] = []
        for provider in self.providers():
            connection = self._connection(provider)
            if not include_disabled and not connection.enabled:
                continue
            for index, app in enumerate(provider.get("rh_apps") or []):
                if not isinstance(app, dict):
                    continue
                name = str(app.get("name") or app.get("id") or f"app-{index}").strip()
                if name:
                    resources.append(ExecutableResource(
                        id=f"{connection.id}:runninghub_app:{quote(str(app.get('id') or name), safe='')}",
                        connection_id=connection.id,
                        kind="runninghub_app",
                        name=name,
                        enabled=bool(app.get("enabled", True)),
                        settings=dict(app),
                    ))
            for index, workflow in enumerate(provider.get("comfy_workflows") or []):
                if not isinstance(workflow, dict):
                    continue
                name = str(workflow.get("name") or workflow.get("id") or f"workflow-{index}").strip()
                if name:
                    resources.append(ExecutableResource(
                        id=f"{connection.id}:comfyui_workflow:{quote(str(workflow.get('id') or name), safe='')}",
                        connection_id=connection.id,
                        kind="comfyui_workflow",
                        name=name,
                        enabled=bool(workflow.get("enabled", True)),
                        settings=dict(workflow),
                    ))
        return resources

    def resolve_executable(self, *, resource_id: str = "", connection_id: str = "", kind: str = "") -> ResolvedTarget:
        values = self.executable_resources()
        if resource_id:
            found = next((item for item in values if item.id == resource_id), None)
        else:
            found = next((item for item in values if (not connection_id or item.connection_id == connection_id) and (not kind or item.kind == kind)), None)
        if found is None:
            raise LookupError("unknown AI executable resource")
        connections = {item.id: item for item in self.connections()}
        return ResolvedTarget(connection=connections[found.connection_id], resource=found)

    def resolve_model(self, *, model_id: str = "", connection_id: str = "", provider_id: str = "", model: str = "", kind: ModelKind | None = None) -> ResolvedTarget:
        connections = {item.id: item for item in self.connections()}
        values = self.models()
        if model_id:
            found = next((item for item in values if item.id == model_id), None)
            if found is None:
                raise LookupError(f"unknown AI model resource: {model_id}")
            return ResolvedTarget(connection=connections[found.connection_id], model=found)
        candidate_connection = connection_id or (legacy_connection_id(provider_id) if provider_id else "")
        candidates: Iterable[ModelResource] = values
        if candidate_connection:
            candidates = (item for item in candidates if item.connection_id == candidate_connection)
        if kind:
            candidates = (item for item in candidates if item.kind == kind)
        if model:
            candidates = (item for item in candidates if item.upstream_model == model)
        found = next(iter(candidates), None)
        if found is None:
            raise LookupError("no AI model resource matches the requested connection/model")
        return ResolvedTarget(connection=connections[found.connection_id], model=found)
