import pytest

from app.services.canvas_agent.orchestration import build_specialist_plan, enforce_budget, estimate_plan_cost


def _plan(capabilities=None, declared=0):
    return {
        "goal": "制作产品短片", "steps": [{"id": "run", "action": "canvas.run_node", "target_node_id": "n1"}],
        "execution": {"capabilities": capabilities or [], "estimated_cost": declared},
    }


def test_cost_estimate_is_explainable_and_enforces_budget():
    estimate = estimate_plan_cost(_plan(["image.text_to_image", "video.text_to_video"]), budget=5)
    assert estimate["estimated_cost"] == 10
    assert [item["cost_level"] for item in estimate["line_items"]] == ["medium", "high"]
    assert estimate["within_budget"] is False
    with pytest.raises(ValueError):
        enforce_budget(estimate)


def test_specialist_orchestration_is_bounded_and_ordered():
    graph = build_specialist_plan("做一个广告", roles=["scriptwriter", "prompt_engineer"])
    assert graph["handoff_order"] == ["scriptwriter", "prompt_engineer"]
    assert graph["execution_boundary"] == "specialists_propose_only"
    with pytest.raises(ValueError):
        build_specialist_plan("x", roles=["unbounded_agent"])
