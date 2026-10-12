import pytest

from app.services.canvas_agent.canvas_cost_estimate import enforce_budget, estimate_plan_cost


def _plan(capabilities=None, declared=0):
    return {
        "goal": "制作产品短片",
        "steps": [{"id": "run", "action": "canvas.run_node", "target_node_id": "n1"}],
        "execution": {"capabilities": capabilities or [], "estimated_cost": declared},
    }


def test_cost_estimate_is_explainable_and_enforces_budget():
    estimate = estimate_plan_cost(_plan(["image.text_to_image", "video.text_to_video"]), budget=5)
    assert estimate["estimated_cost"] == 10
    assert [item["cost_level"] for item in estimate["line_items"]] == ["medium", "high"]
    assert estimate["within_budget"] is False
    with pytest.raises(ValueError):
        enforce_budget(estimate)
