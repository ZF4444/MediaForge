"""Protocol-neutral commands passed from business services to AI adapters."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from app.ai.domain import ResolvedTarget


@dataclass(frozen=True)
class Actor:
    user_id: str = ""
    organization_id: str = ""


@dataclass(frozen=True)
class ChatCommand:
    target: ResolvedTarget
    messages: list[dict[str, Any]]
    stream: bool = False
    tools: list[dict[str, Any]] | None = None
    response_format: Mapping[str, Any] | None = None
    extra_body: Mapping[str, Any] = field(default_factory=dict)
    idempotency_key: str = ""


@dataclass(frozen=True)
class ImageCommand:
    target: ResolvedTarget
    prompt: str
    size: str
    quality: str
    references: list[dict[str, Any]] = field(default_factory=list)
    idempotency_key: str = ""


@dataclass(frozen=True)
class VideoCommand:
    target: ResolvedTarget
    payload: Mapping[str, Any] = field(default_factory=dict)
    idempotency_key: str = ""


@dataclass(frozen=True)
class AppCommand:
    target: ResolvedTarget
    inputs: Mapping[str, Any] = field(default_factory=dict)
    idempotency_key: str = ""


@dataclass(frozen=True)
class WorkflowCommand:
    target: ResolvedTarget
    inputs: Mapping[str, Any] = field(default_factory=dict)
    idempotency_key: str = ""
