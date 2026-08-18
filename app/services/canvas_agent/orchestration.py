"""Phase 4 orchestration helpers kept outside the Patch execution boundary."""
from __future__ import annotations

from typing import Any

from app.models.canvas_agent import SemanticPlan


COST_BY_LEVEL = {"low": 0.5, "medium": 2.0, "high": 8.0, "unknown": 1.0}
SPECIALIST_ROLES = (
    "creative_director",
    "scriptwriter",
    "anchor_designer",
    "shot_planner",
    "prompt_engineer",
)


def estimate_plan_cost(plan_payload: dict[str, Any], *, budget: float | None = None) -> dict[str, Any]:
    """Return an explainable conservative estimate from declared capabilities."""
    plan = SemanticPlan.model_validate(plan_payload)
    capabilities = list(plan.execution.capabilities)
    line_items: list[dict[str, Any]] = []
    for capability in capabilities:
        name = str(capability)
        level = "high" if "video" in name else "medium" if "image" in name else "low"
        line_items.append({"capability": name, "cost_level": level, "estimated_cost": COST_BY_LEVEL[level]})
    run_steps = sum(1 for step in plan.steps if step.action in {"canvas.run_node", "canvas.run_group"})
    if run_steps and not line_items:
        line_items.append({"capability": "canvas.execution", "cost_level": "unknown", "estimated_cost": COST_BY_LEVEL["unknown"] * run_steps})
    predicted = round(sum(float(item["estimated_cost"]) for item in line_items), 4)
    declared = float(plan.execution.estimated_cost or 0)
    estimate = max(predicted, declared)
    return {
        "currency": "credits",
        "estimated_cost": estimate,
        "declared_cost": declared,
        "line_items": line_items,
        "within_budget": budget is None or estimate <= float(budget),
        "budget": budget,
        "confidence": "conservative" if line_items else "low",
    }


def enforce_budget(estimate: dict[str, Any]) -> None:
    if not estimate.get("within_budget", True):
        raise ValueError("计划预计成本超过预算")


def build_specialist_plan(goal: str, *, roles: list[str] | None = None) -> dict[str, Any]:
    """Build a bounded specialist subgraph representation for later model execution.

    The outputs are instructions, not autonomous calls. This preserves the single
    Runtime/Policy/Patch/Executor path while making role responsibilities visible.
    """
    selected = tuple(dict.fromkeys(roles or SPECIALIST_ROLES))
    invalid = [role for role in selected if role not in SPECIALIST_ROLES]
    if invalid:
        raise ValueError("unknown specialist role: " + ", ".join(invalid))
    outputs = {
        "creative_director": "定义受众、卖点、调性与创意约束",
        "scriptwriter": "产出可追溯的脚本段落和镜头叙事",
        "anchor_designer": "固定角色、场景、道具、风格和声音 Anchor",
        "shot_planner": "将脚本拆为可执行的镜头列表",
        "prompt_engineer": "将镜头与 Anchor 编译为可复现 Prompt Pack",
    }
    return {
        "goal": goal,
        "roles": [{"role": role, "deliverable": outputs[role], "input": goal} for role in selected],
        "handoff_order": [role for role in SPECIALIST_ROLES if role in selected],
        "execution_boundary": "specialists_propose_only",
    }
