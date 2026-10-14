import asyncio

import pytest

from app.services.canvas_agent.schemas import SemanticPlan
from app.services.canvas_agent.canvas_adapter import semantic_plan_to_patch
from app.services.canvas_agent.canvas_capabilities import Capability, CapabilityRegistry
from app.services.canvas_agent.canvas_patch_policy import assess_patch, validate_patch
from app.services.canvas_agent.runtime import create_canvas_agent


def test_semantic_plan_converts_to_versioned_patch():
    plan = SemanticPlan.model_validate(
        {
            "goal": "create visual",
            "steps": [
                {
                    "id": "prompt",
                    "action": "canvas.create_node",
                    "node": {"semantic_type": "smart-prompt", "content": "product"},
                },
                {
                    "id": "image",
                    "action": "canvas.create_node",
                    "node": {"semantic_type": "smart-image", "capability": "image.text_to_image"},
                },
                {
                    "id": "edge",
                    "action": "canvas.connect",
                    "from_step": "prompt",
                    "to_step": "image",
                    "relation": "prompt",
                },
            ],
        }
    )
    patch = semantic_plan_to_patch(plan, "canvas-1", 4)
    assert patch.schema_version == 1
    assert patch.base_version == 4
    assert [item.op for item in patch.operations] == ["add_node", "add_node", "add_connection"]
    validate_patch(patch)


def test_semantic_node_type_is_constrained_and_generation_nodes_match_canvas_contract():
    with pytest.raises(Exception):
        SemanticPlan.model_validate(
            {
                "goal": "invalid",
                "steps": [{"id": "bad", "action": "canvas.create_node", "node": {"semantic_type": "capability"}}],
            }
        )
    plan = SemanticPlan.model_validate(
        {
            "goal": "image",
            "steps": [
                {
                    "id": "image",
                    "action": "canvas.create_node",
                    "node": {"semantic_type": "image_generation", "capability": "image.text_to_image"},
                }
            ],
        }
    )
    node = semantic_plan_to_patch(plan, "canvas-1", 1).operations[0].node
    assert node["type"] == "smart-image"
    assert node["genKind"] == "image"
    assert node["runSettings"] == {"engine": "api", "apiKind": "image"}


def test_agent_generation_node_preserves_manual_run_settings_contract():
    plan = SemanticPlan.model_validate(
        {
            "goal": "猫狗大战",
            "steps": [
                {
                    "id": "step_create_catdog_2k_t2i_v2",
                    "action": "canvas.create_node",
                    "node": {
                        "semantic_type": "image_generation",
                        "title": "猫狗大战（2K生图）",
                        "content": "猫狗大战",
                        "capability": "image.text_to_image",
                        "params": {
                            "runSettings": {
                                "count": 1,
                                "model": "gemini-3.1-flash-image-preview",
                                "ratio": "1:1",
                                "quality": "auto",
                                "resolution": "2k",
                                "provider_id": "custom-api-2",
                            }
                        },
                    },
                }
            ],
        }
    )
    node = semantic_plan_to_patch(plan, "canvas-1", 36).operations[0].node
    assert node["genKind"] == "image"
    assert node["runSettings"]["engine"] == "api"
    assert node["runSettings"]["apiKind"] == "image"
    assert node["runSettings"]["provider_id"] == "custom-api-2"
    assert node["runSettings"]["resolution"] == "2k"
    assert node["text"] == "猫狗大战"
    assert "provider_id" not in node


def test_agent_node_promotes_stable_identifiers_into_run_settings():
    # A RunningHub app capability is a broad class; the explicit identifier
    # fields must be promoted into runSettings so the confirmation UI and
    # executor can resolve the exact app and fetch its role-aware schema.
    plan = SemanticPlan.model_validate(
        {
            "goal": "废土 UI",
            "steps": [
                {
                    "id": "render",
                    "action": "canvas.create_node",
                    "node": {
                        "semantic_type": "image_generation",
                        "capability": "runninghub.app.image",
                        "connection_id": "legacy:runninghub",
                        "resource_id": "legacy:runninghub:runninghub_app:2087060269230288898",
                        "params": {"runSettings": {"prompt": "hello"}},
                    },
                }
            ],
        }
    )
    run_settings = semantic_plan_to_patch(plan, "canvas-1", 1).operations[0].node["runSettings"]
    assert run_settings["connection_id"] == "legacy:runninghub"
    assert run_settings["resource_id"] == "legacy:runninghub:runninghub_app:2087060269230288898"
    assert "model_id" not in run_settings  # unset identifiers are not injected
    assert run_settings["prompt"] == "hello"


def test_agent_node_identifier_fields_do_not_override_explicit_params():
    # A deliberate id inside params.runSettings must win over the field-level
    # identifier so callers can still override the resolved target.
    plan = SemanticPlan.model_validate(
        {
            "goal": "override",
            "steps": [
                {
                    "id": "render",
                    "action": "canvas.create_node",
                    "node": {
                        "semantic_type": "image_generation",
                        "capability": "image.text_to_image",
                        "model_id": "field-model",
                        "params": {"runSettings": {"model_id": "params-model"}},
                    },
                }
            ],
        }
    )
    run_settings = semantic_plan_to_patch(plan, "canvas-1", 1).operations[0].node["runSettings"]
    assert run_settings["model_id"] == "params-model"


def test_runninghub_workflow_creation_uses_confirmed_capability_engine():
    plan = SemanticPlan.model_validate({
        "goal": "D风格文生图",
        "steps": [{"id": "d-style", "action": "canvas.create_node", "node": {
            "semantic_type": "workflow_generation",
            "capability": "runninghub.app.image",
            "connection_id": "rh-connection",
            "resource_id": "d-resource",
            "params": {"runSettings": {"prompt": "custom prompt", "rhInstanceType": "plus", "rhParams": {"1::seed": {"value": 123}}}},
        }}],
    })
    node = semantic_plan_to_patch(plan, "canvas-1", 1).operations[0].node
    assert node["genKind"] == "workflow"
    assert node["runSettings"]["engine"] == "runninghub"
    assert node["runSettings"]["resource_id"] == "d-resource"
    assert node["runSettings"]["rhInstanceType"] == "plus"
    assert node["runSettings"]["rhParams"] == {"1::seed": {"value": 123}}
    assert node["text"] == "custom prompt"


def test_agent_generation_node_accepts_legacy_flat_settings():
    plan = SemanticPlan.model_validate(
        {
            "goal": "image",
            "steps": [
                {
                    "id": "image",
                    "action": "canvas.create_node",
                    "node": {
                        "semantic_type": "image_generation",
                        "params": {"provider_id": "custom-api-2", "model": "demo", "ratio": "1:1"},
                    },
                }
            ],
        }
    )
    node = semantic_plan_to_patch(plan, "canvas-1", 1).operations[0].node
    assert "provider_id" not in node["runSettings"]
    assert node["runSettings"]["model"] == "demo"
    assert node["runSettings"]["ratio"] == "1:1"


def test_agent_node_placement_avoids_existing_and_same_patch_overlaps():
    plan = SemanticPlan.model_validate(
        {
            "goal": "create images",
            "steps": [
                {
                    "id": "first",
                    "action": "canvas.create_node",
                    "placement": {"x": 560, "y": 640},
                    "node": {"semantic_type": "image_generation"},
                },
                {
                    "id": "second",
                    "action": "canvas.create_node",
                    "placement": {"x": 560, "y": 640},
                    "node": {"semantic_type": "image_generation"},
                },
            ],
        }
    )
    canvas = {
        "nodes": [
            {"id": "a", "x": 560, "y": 640, "type": "smart-image"},
            {"id": "b", "x": 760, "y": 820, "type": "smart-image"},
        ]
    }
    patch = semantic_plan_to_patch(plan, "canvas-1", 36, canvas)
    placements = [operation.placement for operation in patch.operations]
    assert placements == [{"x": 1120.0, "y": 820.0}, {"x": 1480.0, "y": 820.0}]


def test_agent_node_placement_preserves_non_overlapping_model_suggestion():
    plan = SemanticPlan.model_validate(
        {
            "goal": "create image",
            "steps": [
                {
                    "id": "image",
                    "action": "canvas.create_node",
                    "placement": {"x": 2000, "y": 100},
                    "node": {"semantic_type": "image_generation"},
                }
            ],
        }
    )
    patch = semantic_plan_to_patch(plan, "canvas-1", 1, {"nodes": [{"x": 0, "y": 0}]})
    assert patch.operations[0].placement == {"x": 2000.0, "y": 100.0}


def test_policy_marks_execution_as_confirmation_required():
    plan = SemanticPlan.model_validate(
        {"goal": "run", "steps": [{"id": "run", "action": "canvas.run_node", "target_node_id": "agent-node"}]}
    )
    patch = semantic_plan_to_patch(plan, "canvas-1", 1)
    assert assess_patch(patch)["requires_confirmation"] is True


def test_registry_resolves_canonical_capabilities_by_model_id():
    registry = CapabilityRegistry(
        [
            Capability("prompt.generate", model_id="chat-1", connection_id="connection-a", model_name="chat"),
            Capability("image.text_to_image", model_id="image-1", connection_id="connection-a", model_name="img"),
            Capability(
                "video.text_to_video",
                model_id="video-1",
                connection_id="connection-a",
                model_name="vid",
                cost_level="high",
            ),
        ]
    )
    assert registry.resolve("prompt.generate", requested_model_id="chat-1").connection_id == "connection-a"
    assert registry.resolve("image.text_to_image", requested_model_id="image-1").model_name == "img"
    assert registry.get("video.text_to_video").cost_level == "high"


def test_registry_as_dict_groups_shared_capability_into_targets():
    # Two RunningHub apps share the runninghub.app.image capability class; the
    # model-facing list must collapse them into one entry whose targets carry
    # the distinguishing identifiers, not two rows with identical names.
    registry = CapabilityRegistry(
        [
            Capability(
                "runninghub.app.image",
                resource_id="res-a",
                connection_id="conn",
                connection_name="RH",
                model_name="App A",
            ),
            Capability(
                "runninghub.app.image",
                resource_id="res-b",
                connection_id="conn",
                connection_name="RH",
                model_name="App B",
            ),
            Capability(
                "image.text_to_image", model_id="m1", connection_id="conn", connection_name="RH", model_name="Img"
            ),
        ]
    )
    rows = registry.as_dict()
    names = [row["name"] for row in rows]
    assert names.count("runninghub.app.image") == 1
    rh = next(row for row in rows if row["name"] == "runninghub.app.image")
    assert {target["resource_id"] for target in rh["targets"]} == {"res-a", "res-b"}
    assert {target["display_name"] for target in rh["targets"]} == {"RH / App A", "RH / App B"}
    # A plain model capability still lists its single target.
    plain = next(row for row in rows if row["name"] == "image.text_to_image")
    assert plain["targets"][0]["model_id"] == "m1"


def test_capability_parameters_use_workflow_and_provider_sources():
    from app.services.ai_parameters import capability_parameters

    comfy = capability_parameters(
        capability="comfyui.workflow.image",
        model="custom/demo.json",
        provider_loader=lambda: [{"id": "comfyui", "enabled": True}],
        workflow_loader=lambda _name: {"config": {"fields": [{"id": "seed", "type": "dropdown", "options": [1, 2]}]}},
    )
    assert comfy["fields"][0]["options"] == [1, 2]
    assert comfy["params_path"] == "runSettings.comfyParams"
    prompt = capability_parameters(
        capability="prompt.generate",
        provider_id="chat",
        model="chat-1",
        provider_loader=lambda: [{"id": "chat", "enabled": True, "chat_models": ["chat-1"]}],
    )
    assert prompt["fields"][1]["options"] == ["chat-1"]
    assert prompt["params_path"] == "node"
    rh = capability_parameters(
        capability="runninghub.app.image",
        provider_id="runninghub",
        model="app-1",
        provider_loader=lambda: [
            {
                "id": "runninghub",
                "enabled": True,
                "rh_apps": [
                    {
                        "id": "app-1",
                        "fields": [
                            {"nodeId": "1", "fieldName": "ratio", "fieldType": "SELECT", "fieldData": ["1:1", "16:9"]}
                        ],
                    }
                ],
            }
        ],
    )
    assert rh["fields"][0]["options"] == ["1:1", "16:9"]


def test_normalize_capability_params_plain_api_places_and_validates():
    from app.services.ai_parameters import normalize_capability_params

    schema = {
        "params_path": "runSettings",
        "fields": [
            {"id": "ratio", "type": "dropdown", "options": ["1:1", "9:16"]},
            {"id": "count", "type": "number", "min": 1, "max": 4},
            {"id": "prompt", "type": "textarea", "role": "prompt"},
        ],
    }
    params = normalize_capability_params(schema, {"ratio": "9:16", "count": "2", "prompt": "a cat", "bogus": 1})
    assert params["runSettings"]["ratio"] == "9:16"
    assert params["runSettings"]["count"] == 2  # coerced to int
    # prompt is mirrored into the canonical location and dropped from the leaf
    assert params["runSettings"]["prompt"] == "a cat"
    # unknown keys not in the field contract are discarded
    assert "bogus" not in params["runSettings"]


def test_normalize_capability_params_runninghub_wraps_values():
    from app.services.ai_parameters import normalize_capability_params

    schema = {
        "params_path": "runSettings.rhParams",
        "fields": [
            {"id": "1::text", "type": "text", "role": "prompt"},
            {"id": "2::steps", "type": "number", "min": 1, "max": 50},
        ],
    }
    params = normalize_capability_params(schema, {"1::text": "hello", "2::steps": 6})
    # RunningHub fields persist under the {value:...} envelope
    assert params["runSettings"]["rhParams"]["1::text"] == {"value": "hello"}
    assert params["runSettings"]["rhParams"]["2::steps"] == {"value": 6}
    # and the prompt-role field is mirrored to runSettings.prompt (unwrapped)
    assert params["runSettings"]["prompt"] == "hello"


def test_normalize_capability_params_comfy_and_dropdown_validation():
    from app.services.ai_parameters import normalize_capability_params

    schema = {
        "params_path": "runSettings.comfyParams",
        "fields": [
            {"id": "seed", "type": "number"},
            {"id": "sampler", "type": "dropdown", "options": ["euler"]},
        ],
    }
    params = normalize_capability_params(schema, {"seed": 42, "sampler": "euler"})
    assert params["runSettings"]["comfyParams"]["seed"] == 42
    assert params["runSettings"]["comfyParams"]["sampler"] == "euler"
    with pytest.raises(ValueError):
        normalize_capability_params(schema, {"sampler": "not-an-option"})


def test_normalize_capability_params_tolerates_string_number_bounds():
    # RunningHub upstream may return min/max/step as strings; coercion must not
    # raise a TypeError when comparing the value against them.
    from app.services.ai_parameters import normalize_capability_params

    schema = {
        "params_path": "runSettings.rhParams",
        "fields": [
            {"id": "3::value", "type": "number", "min": "1", "max": "50", "step": ""},
        ],
    }
    params = normalize_capability_params(schema, {"3::value": 6})
    assert params["runSettings"]["rhParams"]["3::value"] == {"value": 6}


def test_normalize_capability_params_prompt_generate_writes_node_root_and_skips_reference_inputs():
    from app.services.ai_parameters import normalize_capability_params

    schema = {
        "params_path": "node",
        "fields": [
            {"id": "llmInstruction", "type": "textarea"},
            {"id": "refImage", "type": "image", "role": "image"},
        ],
    }
    params = normalize_capability_params(schema, {"llmInstruction": "summarize", "refImage": "file-1"})
    assert params["node"]["llmInstruction"] == "summarize"
    # reference inputs (role image/video/audio) are fed by connections, not values
    assert "refImage" not in params.get("node", {})


def test_semantic_plan_to_patch_normalizes_flat_params_with_resolver():
    # With a schema resolver, the model may supply a flat {field_id: value} map
    # and the backend assembles the canonical per-engine structure.
    plan = SemanticPlan.model_validate(
        {
            "goal": "rh",
            "steps": [
                {
                    "id": "render",
                    "action": "canvas.create_node",
                    "node": {
                        "semantic_type": "image_generation",
                        "capability": "runninghub.app.image",
                        "connection_id": "conn",
                        "resource_id": "res-a",
                        "params": {"1::text": "废土 UI", "runSettingsSchemaVersion": 1},
                    },
                }
            ],
        }
    )

    def resolver(node):
        assert node.capability == "runninghub.app.image"
        return {
            "params_path": "runSettings.rhParams",
            "fields": [
                {"id": "1::text", "type": "text", "role": "prompt"},
            ],
        }

    node = semantic_plan_to_patch(plan, "canvas-1", 1, schema_resolver=resolver).operations[0].node
    rh_params = node["runSettings"]["rhParams"]
    assert rh_params["1::text"] == {"value": "废土 UI"}
    assert node["runSettings"]["prompt"] == "废土 UI"
    # the hallucinated meta key is dropped, and identifiers are still promoted
    assert "runSettingsSchemaVersion" not in node["runSettings"]
    assert node["runSettings"]["resource_id"] == "res-a"


def test_runtime_uses_explicit_planning_and_execution_graph():
    from langchain_core.language_models.fake_chat_models import FakeListChatModel

    agent = create_canvas_agent(model=FakeListChatModel(responses=["ok"]))
    assert {"agent", "tools", "confirmation", "execute", "dispatch_tasks"}.issubset(agent.nodes)


def test_langgraph_checkpoint_resumes_same_thread_with_command():
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.graph import END, START, StateGraph
    from langgraph.types import Command, interrupt

    def approval_node(state):
        return {"answer": interrupt({"question": "approve?"})}

    graph_builder = StateGraph(dict)
    graph_builder.add_node("approval", approval_node)
    graph_builder.add_edge(START, "approval")
    graph_builder.add_edge("approval", END)
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

    builder = StateGraph(dict)
    builder.add_node("effect", effect_node)
    builder.add_edge(START, "effect")
    builder.add_edge("effect", END)
    graph = builder.compile(checkpointer=InMemorySaver())
    config = {"configurable": {"thread_id": "run-effect-test"}}
    graph.invoke({"operation_id": "operation-1"}, config=config)
    assert calls == []
    graph.invoke(Command(resume="approved"), config=config)
    assert calls == ["operation-1"]


def test_semantic_plan_tool_blocks_invalid_parameters():
    from app.services.canvas_agent.tools import submit_semantic_plan

    with pytest.raises(Exception):
        submit_semantic_plan({"goal": "x", "steps": [{"id": "bad", "action": "delete_canvas"}]})


def test_provider_adapter_preserves_invalid_tool_calls_for_planner_blocking():
    from app.services.canvas_agent.model_adapter import MediaForgeChatModel

    valid, invalid = MediaForgeChatModel._tool_calls(
        [
            {"id": "ok", "function": {"name": "submit_semantic_plan", "arguments": '{"goal":"x","steps":[]}'}},
            {"id": "bad", "function": {"name": "submit_semantic_plan", "arguments": '{"goal":'}},
        ]
    )
    assert valid[0]["args"]["goal"] == "x"
    assert invalid[0]["type"] == "invalid_tool_call"
    assert invalid[0]["args"] == '{"goal":'
    assert MediaForgeChatModel._tool_choice("any") == "required"
    assert MediaForgeChatModel._tool_choice("auto") == "auto"


def test_provider_adapter_forwards_native_response_format(monkeypatch):
    import asyncio
    from langchain.agents.structured_output import ProviderStrategy
    from langchain_core.messages import HumanMessage
    from app.services.canvas_agent.schemas import SemanticPlan
    from app.services.canvas_agent.model_adapter import MediaForgeChatModel

    model = MediaForgeChatModel(endpoint="https://example.invalid/v1/chat/completions", model_name="gpt-test")
    captured = {}

    async def post(body):
        captured["body"] = body
        return {"choices": [{"message": {"content": '{"goal":"ok","steps":[]}'}}]}

    monkeypatch.setattr(model, "_post_with_retry", post)
    strategy = ProviderStrategy(SemanticPlan)
    result = asyncio.run(
        model._agenerate([HumanMessage(content="plan")], response_format=strategy.to_model_kwargs()["response_format"])
    )

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
    plan = SemanticPlan.model_validate(
        {
            "goal": "x",
            "steps": [
                {
                    "id": "n",
                    "action": "canvas.create_node",
                    "node": {"semantic_type": "prompt", "params": '{"model":"demo"}'},
                    "placement": '{"x":1}',
                }
            ],
        }
    )
    assert plan.steps[0].node.params == {"model": "demo"}
    assert plan.steps[0].placement == {"x": 1}


def test_run_created_node_accepts_from_step_reference():
    plan = SemanticPlan.model_validate({"goal": "create and run X2", "steps": [
        {"id": "create", "action": "canvas.create_node", "node": {
            "semantic_type": "workflow_generation", "title": "X2", "params": {}}},
        {"id": "run", "action": "canvas.run_node", "target_node_id": "", "from_step": "create"},
    ]})
    patch = semantic_plan_to_patch(plan, "canvas-1", 1)
    assert patch.operations[1].node_id == patch.operations[0].client_ref
    assert patch.operations[1].op == "run_node"
