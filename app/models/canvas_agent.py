"""Versioned, provider-neutral contracts for the Canvas Agent runtime."""
from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field, ConfigDict

SCHEMA_VERSION = 1

class ProtocolModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: int = Field(default=SCHEMA_VERSION, ge=1)

class SemanticNode(ProtocolModel):
    semantic_type: str
    title: str = ""
    content: str = ""
    capability: str = ""
    params: dict[str, Any] = Field(default_factory=dict)

class SemanticStep(ProtocolModel):
    id: str
    action: Literal["canvas.create_node", "canvas.update_node_params", "canvas.replace_node_content", "canvas.connect", "canvas.run_node", "canvas.run_group"]
    node: SemanticNode | None = None
    target_node_id: str = ""
    from_step: str = ""
    to_step: str = ""
    relation: str = ""

class PlanExecution(ProtocolModel):
    auto_run: bool = False
    parallelism: int = Field(default=1, ge=1, le=16)
    capabilities: list[str] = Field(default_factory=list)
    estimated_cost: float = Field(default=0, ge=0)

class PlanConfirmation(ProtocolModel):
    required: bool = True
    reason: str = ""

class SemanticPlan(ProtocolModel):
    mode: Literal["fast_track", "doc_chain"] = "fast_track"
    goal: str = Field(min_length=1)
    questions: list[str] = Field(default_factory=list)
    steps: list[SemanticStep] = Field(default_factory=list)
    execution: PlanExecution = Field(default_factory=PlanExecution)
    confirmation: PlanConfirmation = Field(default_factory=PlanConfirmation)

class PatchOperation(ProtocolModel):
    op: Literal["add_node", "update_node_params", "replace_node_content", "add_connection", "remove_connection", "add_group", "move_node", "run_node", "run_group"]
    client_ref: str = ""
    node_id: str = ""
    node: dict[str, Any] = Field(default_factory=dict)
    params: dict[str, Any] = Field(default_factory=dict)
    content: str = ""
    from_ref: str = ""
    to_ref: str = ""
    connection: dict[str, Any] = Field(default_factory=dict)
    group: dict[str, Any] = Field(default_factory=dict)
    placement: dict[str, Any] = Field(default_factory=dict)

class CanvasPatch(ProtocolModel):
    canvas_id: str
    base_version: int = Field(ge=1)
    operations: list[PatchOperation] = Field(default_factory=list)

class AgentRun(ProtocolModel):
    id: str
    canvas_id: str
    conversation_id: str = ""
    mode: Literal["fast_track", "doc_chain"] = "fast_track"
    status: str = "created"
    phase: str = "planning"
    base_canvas_version: int = 1
    step_count: int = 0
    max_steps: int = 12

class AgentOperation(ProtocolModel):
    id: str
    run_id: str
    idempotency_key: str
    type: str
    risk: str = "safe"
    status: str = "pending"
    input: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None

class Artifact(ProtocolModel):
    id: str
    run_id: str
    type: str
    version: int = 1
    status: str = "draft"
    content: dict[str, Any] = Field(default_factory=dict)
    source_artifact_ids: list[str] = Field(default_factory=list)

class AgentEvent(ProtocolModel):
    id: str
    run_id: str
    sequence: int
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)
