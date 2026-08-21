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

def test_semantic_node_type_is_constrained_and_generation_nodes_match_canvas_contract():
    with pytest.raises(Exception):
        SemanticPlan.model_validate({"goal": "invalid", "steps": [{"id": "bad", "action": "canvas.create_node", "node": {"semantic_type": "capability"}}]})
    plan = SemanticPlan.model_validate({"goal": "image", "steps": [{"id": "image", "action": "canvas.create_node", "node": {"semantic_type": "image_generation", "capability": "image.text_to_image"}}]})
    node = semantic_plan_to_patch(plan, "canvas-1", 1).operations[0].node
    assert node["type"] == "smart-image"
    assert node["genKind"] == "image"
    assert node["runSettings"] == {"engine": "api", "apiKind": "image"}

def test_policy_marks_execution_as_confirmation_required():
    plan = SemanticPlan.model_validate({"goal": "run", "steps": [{"id": "run", "action": "canvas.run_node", "target_node_id": "agent-node"}]})
    patch = semantic_plan_to_patch(plan, "canvas-1", 1)
    assert assess_patch(patch)["requires_confirmation"] is True

def test_registry_hides_disabled_provider_and_exposes_semantics():
    registry = CapabilityRegistry([{"id": "a", "enabled": True, "chat_models": ["chat"], "image_models": ["img"], "video_models": ["vid"]}, {"id": "b", "enabled": False, "chat_models": ["hidden-chat"], "image_models": ["hidden"]}])
    assert registry.get("prompt.generate").model == "chat"
    assert registry.get("image.text_to_image").model == "img"
    assert registry.get("video.text_to_video").cost_level == "high"

def test_provider_registry_registers_enabled_comfyui_workflows():
    from app.services.canvas_agent.capabilities import from_provider_configuration
    registry = from_provider_configuration(
        lambda: [{"id": "comfyui", "enabled": True}],
        lambda: {"workflows": [
            {"name": "custom/image.json", "title": "Image workflow", "media": "image", "field_count": 2},
            {"name": "video.json", "title": "Video workflow", "media": "video", "field_count": 1},
        ]},
    )
    assert registry.resolve("comfyui.workflow.image", requested_model="custom/image.json").provider_id == "comfyui"
    assert registry.resolve("comfyui.workflow.video", requested_model="video.json").input_constraints["field_count"] == 1

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
    from langchain.agents.structured_output import ProviderStrategy
    assert isinstance(captured["response_format"], ProviderStrategy)
    assert captured["response_format"].schema is SemanticPlan
    assert captured["tools"] == []
    assert isinstance(calls[0][0], Command)
    assert calls[0][0].resume == "answer"
    assert calls[0][1]["configurable"]["thread_id"] == "run-1"
    with pytest.raises(ValueError, match="无效工具参数"):
        planner.reject_invalid_tool_calls({"messages": [{"invalid_tool_calls": [{"name": "submit_semantic_plan"}]}]})


def test_intent_router_defaults_to_chat_and_requires_explicit_canvas_action(monkeypatch):
    import asyncio
    from app.services.canvas_agent import planner, runtime

    captured = {}

    class Agent:
        async def ainvoke(self, invocation, config):
            captured["user"] = invocation["messages"][0]["content"]
            return {"response": {"intent": "chat", "reply": "你好，我可以帮你分析画布或回答问题。"}}

    monkeypatch.setattr(runtime, "create_canvas_agent", lambda **kwargs: captured.update(kwargs) or Agent())
    decision = asyncio.run(planner.classify_intent(None, "你好", {"run_id": "run-1", "node_count": 2}, harness_key="fake"))

    assert decision.intent == "chat"
    assert "默认选择 chat" in captured["system_prompt"]
    assert "必须同时满足" in captured["system_prompt"]
    assert "在画布上新建一个文生图节点" in captured["system_prompt"]
    assert "用户消息：你好" in captured["user"]
    assert "画布上下文：节点数=2" in captured["user"]

def test_semantic_plan_tool_blocks_invalid_parameters():
    from app.services.canvas_agent.tools import submit_semantic_plan
    with pytest.raises(Exception):
        submit_semantic_plan({"goal": "x", "steps": [{"id": "bad", "action": "delete_canvas"}]})


def test_planner_normalizes_known_legacy_canvas_operations():
    from app.services.canvas_agent.planner import _normalize_plan

    plan = _normalize_plan({
        "goal": "新建文生图节点",
        "steps": [{"id": "s1", "name": "创建节点", "details": {"node_type": "smart-prompt"}}],
        "execution": {"mode": "canvas_ops_plan", "operations": [{"op": "create_node", "client_ref": "prompt-1", "node": {"type": "smart-prompt", "text": "雨夜城市"}}]},
        "confirmation": {"summary": "需要确认"},
    }, {})

    assert plan.steps[0].action == "canvas.create_node"
    assert plan.steps[0].node.semantic_type == "prompt"
    assert plan.steps[0].node.content == "雨夜城市"

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


def test_provider_adapter_forwards_native_response_format(monkeypatch):
    import asyncio
    from langchain.agents.structured_output import ProviderStrategy
    from langchain_core.messages import HumanMessage
    from app.models.canvas_agent import SemanticPlan
    from app.services.canvas_agent.model_resolver import MediaForgeChatModel

    model = MediaForgeChatModel(endpoint="https://example.invalid/v1/chat/completions", model_name="gpt-test")
    captured = {}

    async def post(body):
        captured["body"] = body
        return {"choices": [{"message": {"content": '{"goal":"ok","steps":[]}'}}]}

    monkeypatch.setattr(model, "_post_with_retry", post)
    strategy = ProviderStrategy(SemanticPlan)
    result = asyncio.run(model._agenerate([HumanMessage(content="plan")], response_format=strategy.to_model_kwargs()["response_format"]))

    assert captured["body"]["response_format"]["type"] == "json_schema"
    assert captured["body"]["response_format"]["json_schema"]["name"] == "SemanticPlan"
    assert result.generations[0].message.content == '{"goal":"ok","steps":[]}'


def test_semantic_plan_native_schema_is_azure_strict_compatible():
    from langchain.agents.structured_output import ProviderStrategy

    schema = ProviderStrategy(SemanticPlan).to_model_kwargs()["response_format"]["json_schema"]["schema"]

    def assert_strict(node):
        if isinstance(node, dict):
            assert "default" not in node
            properties = node.get("properties")
            if isinstance(properties, dict):
                assert node["required"] == list(properties)
                assert node["additionalProperties"] is False
            for value in node.values():
                assert_strict(value)
        elif isinstance(node, list):
            for value in node:
                assert_strict(value)

    assert_strict(schema)
    node_schema = schema["$defs"]["SemanticNode"]["properties"]
    assert node_schema["params"]["type"] == "string"
    assert schema["$defs"]["SemanticStep"]["properties"]["placement"]["type"] == "string"
    plan = SemanticPlan.model_validate({"goal": "x", "steps": [{"id": "n", "action": "canvas.create_node", "node": {"semantic_type": "prompt", "params": "{\"model\":\"demo\"}"}, "placement": "{\"x\":1}"}]})
    assert plan.steps[0].node.params == {"model": "demo"}
    assert plan.steps[0].placement == {"x": 1}
