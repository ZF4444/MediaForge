from app.services.canvas_agent.planner import plan_fast_track
from app.services.canvas_agent.adapter import semantic_plan_to_patch

def test_fast_track_plans_three_shots_with_existing_canvas_node_types():
    plan = plan_fast_track("把选中的产品图做成三个竖屏广告镜头", {"selected_nodes": [{"id": "product-1"}]})
    patch = semantic_plan_to_patch(plan, "canvas-1", 1)
    nodes = [operation.node for operation in patch.operations if operation.op == "add_node"]
    assert len(nodes) == 4
    assert nodes[0]["type"] == "smart-prompt"
    assert {node["type"] for node in nodes[1:]} == {"smart-image"}
    assert plan.confirmation.required is True
