"""Small deterministic evaluation set for the Phase 0 protocol boundary."""
from __future__ import annotations
from typing import Any
from app.core.utils import now_ms
from app.models.canvas_agent import SemanticPlan
from app.services.business_metadata import json_value, metadata_connection, new_id
from .adapter import semantic_plan_to_patch
from .policy import assess_patch, validate_patch

FIXED_CANVAS_SCENARIOS = [
    {"id": "product-three-shots", "goal": "将选中产品图做成三个竖屏广告镜头", "expected_actions": {"canvas.create_node", "canvas.connect"}},
    {"id": "prompt-to-image", "goal": "为选中产品创建图片生成提示词和主视觉", "expected_actions": {"canvas.create_node", "canvas.connect"}},
    {"id": "run-existing-node", "goal": "运行本轮创建的图片节点", "expected_actions": {"canvas.run_node"}},
]

def evaluate_plan(scenario_id: str, plan_payload: dict[str, Any], *, canvas_id: str = "evaluation-canvas", base_version: int = 1, latency_ms: int = 0, estimated_cost: float = 0) -> dict[str, Any]:
    scenario = next((item for item in FIXED_CANVAS_SCENARIOS if item["id"] == scenario_id), None)
    if scenario is None: raise ValueError("unknown evaluation scenario")
    metrics: dict[str, Any] = {"schema_version": 1, "scenario_id": scenario_id, "latency_ms": max(0, int(latency_ms)), "estimated_cost": max(0, estimated_cost)}
    try:
        plan = SemanticPlan.model_validate(plan_payload)
        actions = {step.action for step in plan.steps}
        metrics["structured_plan_success"] = True
        metrics["valid_tool_call_rate"] = 1.0 if actions else 0.0
        metrics["expected_action_coverage"] = len(actions & scenario["expected_actions"]) / len(scenario["expected_actions"])
        patch = semantic_plan_to_patch(plan, canvas_id, base_version)
        validate_patch(patch)
        risk = assess_patch(patch)
        metrics["patch_validation_passed"] = True
        # A planner may ask for confirmation for a safe multi-step edit, but
        # it may never omit confirmation when policy marks an action risky.
        metrics["confirmation_consistent"] = not bool(risk["requires_confirmation"]) or bool(plan.confirmation.required)
    except Exception as exc:
        metrics.update({"structured_plan_success": False, "valid_tool_call_rate": 0.0, "expected_action_coverage": 0.0, "patch_validation_passed": False, "confirmation_consistent": False, "error": str(exc)[:500]})
    return metrics

def record_evaluation(metrics: dict[str, Any], *, run_id: str = "") -> str:
    evaluation_id = new_id()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO canvas_agent_evaluations(id,scenario_id,run_id,metrics_json,created_at) VALUES(%s,%s,%s,%s,%s)", (evaluation_id,str(metrics.get("scenario_id") or ""),run_id or None,json_value(metrics),now_ms()))
    return evaluation_id

def evaluate_artifact_quality(artifact: dict[str, Any]) -> dict[str, Any]:
    """Deterministic quality gate suitable for approval UI and regression tests."""
    content = dict(artifact.get("content_json") or artifact.get("content") or {})
    artifact_type = str(artifact.get("type") or "")
    issues: list[str] = []
    if artifact.get("stale"):
        issues.append("artifact_stale")
    if artifact_type == "shot_list" and not content.get("shots"):
        issues.append("missing_shots")
    if artifact_type == "prompt_pack":
        prompts = content.get("prompts") or []
        if not prompts: issues.append("missing_prompts")
        elif any(not isinstance(item, dict) or not item.get("prompt") for item in prompts): issues.append("incomplete_prompt")
    if artifact_type == "asset_anchors":
        anchors = sum(len(value) for value in content.values() if isinstance(value, list))
        if not anchors: issues.append("missing_anchors")
    source_count = len(artifact.get("source_artifact_ids") or [])
    score = max(0, 100 - len(issues) * 30)
    return {
        "schema_version": 1,
        "scenario_id": f"artifact-quality:{artifact_type}",
        "artifact_id": artifact.get("id", ""),
        "artifact_type": artifact_type,
        "score": score,
        "approved_for_next_stage": not issues,
        "source_count": source_count,
        "issues": issues,
    }
