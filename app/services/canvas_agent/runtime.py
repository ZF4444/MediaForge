"""Minimal Deep Agents harness boundary for Phase 0.

The runtime is intentionally lazy: deployments without the optional agent
packages can still run the classic canvas, while startup fails clearly when
the Agent runtime is requested.
"""
from __future__ import annotations
from typing import Any
from dataclasses import dataclass

@dataclass(frozen=True)
class ReadOnlyCanvasBackend:
    """Marker for a state-backed harness with all mutation tools excluded."""
    def write(self, *_: Any, **__: Any) -> None: raise PermissionError("Agent filesystem writes are disabled")
    def edit(self, *_: Any, **__: Any) -> None: raise PermissionError("Agent filesystem edits are disabled")
    def delete(self, *_: Any, **__: Any) -> None: raise PermissionError("Agent filesystem deletes are disabled")

def _harness_key(model: Any, key: str) -> str:
    if key: return key
    if isinstance(model, str) and ":" in model: return model
    raise ValueError("harness_key is required when model is not a provider:model string")

def create_canvas_agent(*, model: Any, tools: list[Any] | None = None, checkpointer: Any = None, harness_key: str = "", response_format: Any = None, system_prompt: str | None = None):
    """Create a constrained Deep Agent graph with no task or write capabilities."""
    try:
        from deepagents import GeneralPurposeSubagentProfile, HarnessProfile, create_deep_agent, register_harness_profile
        from deepagents.backends import StateBackend
    except ImportError as exc:
        raise RuntimeError("deepagents is required to create the Canvas Agent") from exc
    profile = HarnessProfile(
        general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
        # Canvas Agent must never expose Deep Agents' default filesystem tools.
        # Apart from being unnecessary, they can win a required tool-choice
        # request intended for IntentDecision/SemanticPlan.
        excluded_tools=frozenset({
            "ls", "read_file", "write_file", "edit_file", "delete", "delete_file",
            "glob", "grep", "execute", "task",
        }),
    )
    register_harness_profile(_harness_key(model, harness_key), profile)
    kwargs = {
        "model": model, "tools": list(tools or []), "subagents": [], "backend": StateBackend(),
        "checkpointer": checkpointer,
    }
    if response_format is not None: kwargs["response_format"] = response_format
    if system_prompt is not None: kwargs["system_prompt"] = system_prompt
    return create_deep_agent(**kwargs)
