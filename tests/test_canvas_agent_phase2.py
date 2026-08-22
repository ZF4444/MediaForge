import pytest

from app.models.canvas_agent import CanvasPatch, SemanticPlan
from app.services.canvas_agent.policy import validate_patch
from app.services.canvas_agent.reliability import canvas_structure_fingerprint, classify_failure, enforce_plan_limits


def test_structure_fingerprint_ignores_placement_and_transient_task_state():
    base = {"nodes": [{"id": "n1", "type": "smart-image", "x": 10, "y": 20, "generation_status": "queued"}], "connections": []}
    moved = {"nodes": [{"id": "n1", "type": "smart-image", "x": 900, "y": 400, "generation_status": "succeeded"}], "connections": []}
    changed = {"nodes": [{"id": "n1", "type": "smart-image", "text": "changed"}], "connections": []}
    assert canvas_structure_fingerprint(base) == canvas_structure_fingerprint(moved)
    assert canvas_structure_fingerprint(base) != canvas_structure_fingerprint(changed)


def test_plan_limits_block_excessive_work():
    plan = SemanticPlan.model_validate({"goal": "large", "steps": [{"id": str(i), "action": "canvas.create_node", "node": {"semantic_type": "prompt", "title": "x"}} for i in range(3)]})
    with pytest.raises(ValueError, match="配额"):
        enforce_plan_limits(plan.model_dump(mode="json"), {"max_nodes_created": 2})


def test_user_node_requires_explicit_per_node_authorization():
    patch = CanvasPatch(canvas_id="c", base_version=1, operations=[{"op": "replace_node_content", "node_id": "user:user-node", "content": "new"}])
    with pytest.raises(PermissionError):
        validate_patch(patch, allow_user_node_changes=True, authorized_node_ids=set())
    validate_patch(patch, allow_user_node_changes=True, authorized_node_ids={"user:user-node"})

def test_confirm_endpoint_rejects_stale_plan_version(monkeypatch):
    import asyncio
    from fastapi import HTTPException
    from app.models import CanvasAgentConfirmRequest
    from app.routers import canvas_agent

    async def fake_run(*_args): return {"status": "awaiting_confirmation"}
    monkeypatch.setattr(canvas_agent, "_user", lambda *_args: "owner")
    monkeypatch.setattr(canvas_agent, "_require_run", fake_run)
    monkeypatch.setattr(canvas_agent, "latest_plan", lambda *_args: {"version": 2})
    with pytest.raises(HTTPException) as exc:
        asyncio.run(canvas_agent.confirm_agent_plan("run-1", CanvasAgentConfirmRequest(plan_version=1), object()))
    assert exc.value.status_code == 409


def test_completed_run_can_start_the_next_planning_turn():
    from app.routers.canvas_agent import _can_continue_planning

    assert _can_continue_planning("completed") is True
    assert _can_continue_planning("running") is True
    assert _can_continue_planning("cancelled") is False
    assert _can_continue_planning("failed") is False
    assert _can_continue_planning("blocked") is False


@pytest.mark.parametrize("error,category", [("upstream timeout", "transient"), ("canvas version conflict", "conflict"), ("budget limit exceeded", "quota"), ("permission denied", "permission"), ("invalid schema", "permanent")])
def test_failure_classification(error, category):
    assert classify_failure(error) == category
