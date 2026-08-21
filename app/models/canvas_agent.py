"""Versioned, provider-neutral contracts for the Canvas Agent runtime."""
from __future__ import annotations

import json
from typing import Annotated, Any, Literal
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, WithJsonSchema

SCHEMA_VERSION = 1


def _decode_json_object(value: Any) -> dict[str, Any]:
    """Accept provider-native JSON strings while retaining dicts in the domain model."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError("must be a JSON object string") from exc
    if not isinstance(value, dict):
        raise ValueError("must be an object")
    return value


# Azure/OpenAI strict JSON Schema forbids arbitrary object properties. The
# provider therefore emits these extensible fields as JSON strings, which the
# validator converts back to dictionaries before they reach the executor.
NativeJsonObject = Annotated[
    dict[str, Any],
    BeforeValidator(_decode_json_object),
    WithJsonSchema({"type": "string", "description": "JSON-encoded object"}),
]


def _make_native_schema_strict(schema: Any) -> None:
    if isinstance(schema, dict):
        schema.pop("default", None)
        properties = schema.get("properties")
        if isinstance(properties, dict):
            schema["required"] = list(properties)
            schema["additionalProperties"] = False
            for property_schema in properties.values():
                _make_native_schema_strict(property_schema)
        for key, value in schema.items():
            if key != "properties":
                _make_native_schema_strict(value)
    elif isinstance(schema, list):
        for item in schema:
            _make_native_schema_strict(item)

class ProtocolModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: int = Field(default=SCHEMA_VERSION, ge=1)

    @classmethod
    def model_json_schema(cls, *args: Any, **kwargs: Any) -> dict[str, Any]:
        schema = super().model_json_schema(*args, **kwargs)
        _make_native_schema_strict(schema)
        return schema

SemanticNodeType = Literal[
    "prompt", "image_generation", "video_generation", "workflow_generation", "group",
    "smart-prompt", "smart-image", "smart-group",
]


class SemanticNode(ProtocolModel):
    semantic_type: SemanticNodeType = Field(
        description="Canvas node kind. Use image_generation for image nodes, video_generation for video nodes, "
        "workflow_generation for ComfyUI/RH workflow nodes, and prompt for prompt nodes. Never use a capability name here."
    )
    title: str = Field(default="", description="Short node title.")
    content: str = Field(default="", description="Prompt text or replacement content.")
    capability: str = Field(default="", description="Capability selected from read_capability_registry, for example image.text_to_image or prompt.generate.")
    params: NativeJsonObject = Field(default_factory=dict)

class SemanticStep(ProtocolModel):
    id: str
    action: Literal["canvas.create_node", "canvas.update_node_params", "canvas.replace_node_content", "canvas.connect", "canvas.run_node", "canvas.run_group"]
    node: SemanticNode | None = None
    target_node_id: str = ""
    from_step: str = ""
    to_step: str = ""
    relation: str = ""
    placement: NativeJsonObject = Field(default_factory=dict)

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


class IntentDecision(ProtocolModel):
    """First-stage routing result for a Canvas Agent message."""
    intent: Literal["canvas_action", "chat", "clarification"]
    reply: str = ""

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
