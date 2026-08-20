import pytest

from app.models.canvas_agent import SemanticPlan
from app.services.canvas_agent.adapter import semantic_plan_to_patch
from app.services.canvas_agent.capabilities import CapabilityRegistry
from app.services.canvas_agent.policy import assess_patch, validate_patch
from app.services.canvas_agent.evaluation import evaluate_plan
from app.services.canvas_agent.runtime import ReadOnlyCanvasBackend, create_canvas_agent

def test_semantic_plan_converts_to_versioned_patch():
    plan = SemanticPlan.model_validate({"goal": "create visual", "steps": [
        {"id": "prompt", "action": "canvas.create_node", "node": {"semantic_type": "smart-prompt", "content": "product"}},
        {"id": "image", "action": "canvas.create_node", "node": {"semantic_type": "smart-image", "capability": "image.text_to_image"}},
        {"id": "edge", "action": "canvas.connect", "from_step": "prompt", "to_step": "image", "relation": "prompt"},
    ]})
    patch = semantic_plan_to_patch(plan, "canvas-1", 4)
    assert patch.schema_version == 1
    assert patch.base_version == 4
    assert [item.op for item in patch.operations] == ["add_node", "add_node", "add_connection"]
    validate_patch(patch)

def test_policy_marks_execution_as_confirmation_required():
    plan = SemanticPlan.model_validate({"goal": "run", "steps": [{"id": "run", "action": "canvas.run_node", "target_node_id": "agent-node"}]})
    patch = semantic_plan_to_patch(plan, "canvas-1", 1)
    assert assess_patch(patch)["requires_confirmation"] is True

def test_registry_hides_disabled_provider_and_exposes_semantics():
    registry = CapabilityRegistry([{"id": "a", "enabled": True, "image_models": ["img"], "video_models": ["vid"]}, {"id": "b", "enabled": False, "image_models": ["hidden"]}])
    assert registry.get("image.text_to_image").model == "img"
    assert registry.get("video.text_to_video").cost_level == "high"

def test_fixed_evaluation_records_protocol_metrics():
    metrics = evaluate_plan("prompt-to-image", {"goal": "image", "steps": [
        {"id": "prompt", "action": "canvas.create_node", "node": {"semantic_type": "smart-prompt"}},
        {"id": "image", "action": "canvas.create_node", "node": {"semantic_type": "smart-image"}},
        {"id": "edge", "action": "canvas.connect", "from_step": "prompt", "to_step": "image"},
    ]})
    assert metrics["structured_plan_success"] is True
    assert metrics["patch_validation_passed"] is True
    assert metrics["confirmation_consistent"] is True

def test_deep_agents_harness_builds_without_general_purpose_subagent():
    from langchain_core.language_models.fake_chat_models import FakeListChatModel
    agent = create_canvas_agent(model=FakeListChatModel(responses=["ok"]), harness_key="fakelistchatmodel")
    assert "tools" in agent.nodes

def test_deep_agents_runtime_is_read_only_and_interrupts_plan_submission(monkeypatch):
    import deepagents
    captured = {}
    monkeypatch.setattr(deepagents, "create_deep_agent", lambda **kwargs: captured.update(kwargs) or object())
    monkeypatch.setattr(deepagents, "register_harness_profile", lambda _key, profile: captured.setdefault("profile", profile))
    create_canvas_agent(model="provider:model", harness_key="provider:model")
    with pytest.raises(PermissionError): ReadOnlyCanvasBackend().write("x")
    assert captured["subagents"] == []
    assert "interrupt_on" not in captured
    assert {"ls", "read_file", "write_file", "edit_file", "delete", "delete_file", "glob", "grep", "execute", "task"}.issubset(captured["profile"].excluded_tools)
    assert captured["profile"].general_purpose_subagent.enabled is False

def test_langgraph_checkpoint_resumes_same_thread_with_command():
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.graph import END, START, StateGraph
    from langgraph.types import Command, interrupt

    def approval_node(state):
        return {"answer": interrupt({"question": "approve?"})}

    graph_builder = StateGraph(dict)
    graph_builder.add_node("approval", approval_node)
    graph_builder.add_edge(START, "approval"); graph_builder.add_edge("approval", END)
    graph = graph_builder.compile(checkpointer=InMemorySaver())
    config = {"configurable": {"thread_id": "run-checkpoint-test"}}
    first = graph.invoke({"input": "plan"}, config=config)
    assert first["__interrupt__"]
    resumed = graph.invoke(Command(resume="approved"), config=config)
    assert resumed["answer"] == "approved"

def test_checkpoint_replay_does_not_repeat_side_effect_after_resume():
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.graph import END, START, StateGraph
    from langgraph.types import Command, interrupt
    calls = []
    def effect_node(state):
        interrupt({"confirmation": "required"})
        calls.append(state["operation_id"])
        return {"done": True}
    builder = StateGraph(dict); builder.add_node("effect", effect_node)
    builder.add_edge(START, "effect"); builder.add_edge("effect", END)
    graph = builder.compile(checkpointer=InMemorySaver())
    config = {"configurable": {"thread_id": "run-effect-test"}}
    graph.invoke({"operation_id": "operation-1"}, config=config)
    assert calls == []
    graph.invoke(Command(resume="approved"), config=config)
    assert calls == ["operation-1"]

def test_model_planner_rejects_invalid_tool_calls_and_uses_command_resume(monkeypatch):
    import asyncio
    from langgraph.types import Command
    from app.services.canvas_agent import planner, runtime

    calls = []
    captured = {}
    class Agent:
        async def ainvoke(self, invocation, config):
            calls.append((invocation, config))
            return {"structured_response": {"goal": "safe plan", "steps": []}}
    monkeypatch.setattr(runtime, "create_canvas_agent", lambda **kwargs: captured.update(kwargs) or Agent())
    plan = asyncio.run(planner.plan_with_deep_agent(None, "answer", {"run_id": "run-1"}, harness_key="fake", resume=True))
    assert plan.goal == "safe plan"
    assert "response_format" not in captured
    assert captured["tools"] == []
    assert isinstance(calls[0][0], Command)
    assert calls[0][0].resume == "answer"
    assert calls[0][1]["configurable"]["thread_id"] == "run-1"
    with pytest.raises(ValueError, match="无效工具参数"):
        planner.reject_invalid_tool_calls({"messages": [{"invalid_tool_calls": [{"name": "submit_semantic_plan"}]}]})

def test_semantic_plan_tool_blocks_invalid_parameters():
    from app.services.canvas_agent.tools import submit_semantic_plan
    with pytest.raises(Exception):
        submit_semantic_plan({"goal": "x", "steps": [{"id": "bad", "action": "delete_canvas"}]})

def test_provider_adapter_preserves_invalid_tool_calls_for_planner_blocking():
    from app.services.canvas_agent.model_resolver import MediaForgeChatModel
    valid, invalid = MediaForgeChatModel._tool_calls([
        {"id": "ok", "function": {"name": "submit_semantic_plan", "arguments": '{"goal":"x","steps":[]}'}},
        {"id": "bad", "function": {"name": "submit_semantic_plan", "arguments": '{"goal":'}},
    ])
    assert valid[0]["args"]["goal"] == "x"
    assert invalid[0]["type"] == "invalid_tool_call"
    assert invalid[0]["args"] == '{"goal":'
    assert MediaForgeChatModel._tool_choice("any") == "required"
    assert MediaForgeChatModel._tool_choice("auto") == "auto"
