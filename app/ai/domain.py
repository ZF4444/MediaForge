"""Stable AI connection and resource domain types.

These types deliberately do not know about FastAPI, environment variables, or
the legacy ``api_providers`` storage shape.  The compatibility layer projects
the latter into this domain while callers migrate to connection/model IDs.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Mapping


Capability = Literal[
    "chat", "stream_chat", "tool_calling", "generate_image", "generate_video",
    "list_models", "run_app", "run_workflow",
]
ModelKind = Literal["chat", "image", "video"]


@dataclass(frozen=True)
class Connection:
    id: str
    legacy_provider_id: str
    protocol: str
    name: str
    base_url: str
    enabled: bool
    primary: bool = False
    settings: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ModelResource:
    id: str
    connection_id: str
    upstream_model: str
    kind: ModelKind
    protocol: str
    enabled: bool = True
    alias: str = ""
    capabilities: frozenset[str] = field(default_factory=frozenset)


@dataclass(frozen=True)
class ExecutableResource:
    id: str
    connection_id: str
    kind: Literal["runninghub_app", "comfyui_workflow"]
    name: str
    enabled: bool = True
    settings: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ResolvedTarget:
    connection: Connection
    model: ModelResource | None = None
    resource: ExecutableResource | None = None

    @property
    def protocol(self) -> str:
        return self.model.protocol if self.model else self.connection.protocol

    @property
    def capabilities(self) -> frozenset[str]:
        if self.model:
            return self.model.capabilities
        if self.resource:
            return frozenset({"run_app" if self.resource.kind == "runninghub_app" else "run_workflow"})
        return frozenset()
