import pytest

from app.services.canvas_agent.schemas import CanvasPatch, SemanticPlan
from app.services.canvas_agent.canvas_patch_policy import validate_patch
from app.services.canvas_agent.reliability_helpers import (
    canvas_structure_fingerprint,
    classify_failure,
    enforce_plan_limits,
)
from app.routers.canvas_agent import _hydrate_plan_nodes


def test_structure_fingerprint_ignores_placement_and_transient_task_state():
    base = {
        "nodes": [{"id": "n1", "type": "smart-image", "x": 10, "y": 20, "generation_status": "queued"}],
        "connections": [],
    }
    moved = {
        "nodes": [{"id": "n1", "type": "smart-image", "x": 900, "y": 400, "generation_status": "succeeded"}],
        "connections": [],
    }
    changed = {"nodes": [{"id": "n1", "type": "smart-image", "text": "changed"}], "connections": []}
    assert canvas_structure_fingerprint(base) == canvas_structure_fingerprint(moved)
    assert canvas_structure_fingerprint(base) != canvas_structure_fingerprint(changed)


def test_plan_limits_block_excessive_work():
    plan = SemanticPlan.model_validate(
        {
            "goal": "large",
            "steps": [
                {"id": str(i), "action": "canvas.create_node", "node": {"semantic_type": "prompt", "title": "x"}}
                for i in range(3)
            ],
        }
    )
    with pytest.raises(ValueError, match="配额"):
        enforce_plan_limits(plan.model_dump(mode="json"), {"max_nodes_created": 2})


def test_user_node_requires_explicit_per_node_authorization():
    patch = CanvasPatch(
        canvas_id="c",
        base_version=1,
        operations=[{"op": "replace_node_content", "node_id": "user:user-node", "content": "new"}],
    )
    with pytest.raises(PermissionError):
        validate_patch(patch, allow_user_node_changes=True, authorized_node_ids=set())
    validate_patch(patch, allow_user_node_changes=True, authorized_node_ids={"user:user-node"})


def test_hydrate_plan_nodes_reuses_created_node_for_followup_execution_step():
    plan = {
        "steps": [
            {
                "id": "create-image",
                "action": "canvas.create_node",
                "node": {
                    "semantic_type": "image_generation",
                    "title": "产品主视觉",
                    "content": "雨夜城市中的产品",
                    "params": {"runSettings": {"model": "demo", "resolution": "2k"}},
                },
            },
            {"id": "run-image", "action": "canvas.run_node", "target_node_id": "create-image"},
        ]
    }
    hydrated = _hydrate_plan_nodes(plan, {"nodes": []})
    assert hydrated["steps"][1]["node"] == hydrated["steps"][0]["node"]


def test_hydrate_plan_nodes_normalizes_frontend_only_node_types():
    # smart-asset-image is a frontend-only asset node type. Hydration used to
    # copy it verbatim into semantic_type, which then failed SemanticPlan
    # validation during cost estimation.
    plan = {
        "goal": "render asset",
        "execution": {"capabilities": ["image.text_to_image"]},
        "steps": [
            {
                "id": "create",
                "action": "canvas.create_node",
                "node": {"semantic_type": "image_generation", "title": "生成", "capability": "image.text_to_image"},
            },
            {"id": "run", "action": "canvas.run_node", "target_node_id": "asset-1"},
        ],
    }
    canvas = {"nodes": [{"id": "asset-1", "type": "smart-asset-image", "title": "素材", "url": "x.png"}]}
    hydrated = _hydrate_plan_nodes(plan, canvas)
    assert hydrated["steps"][1]["node"]["semantic_type"] == "image_generation"
    # The whole plan must remain valid for downstream cost estimation.
    from app.services.canvas_agent.schemas import SemanticPlan

    SemanticPlan.model_validate(hydrated)


def test_hydrate_plan_nodes_update_step_keeps_proposed_values_over_snapshot():
    # The confirmation card renders this hydrated node. The snapshot used to
    # replace the model's proposal, so megapixels 0.3 showed as the stored 0.
    plan = {
        "steps": [
            {
                "id": "update",
                "action": "canvas.update_node_params",
                "target_node_id": "n1",
                "node": {
                    "semantic_type": "workflow_generation",
                    "params": {"runSettings": {"rhParams": {"13::megapixels": {"value": 0.3}}}},
                },
            }
        ]
    }
    canvas = {
        "nodes": [
            {
                "id": "n1",
                "type": "smart-image",
                "capability": "runninghub.app.image",
                "runSettings": {
                    "engine": "runninghub",
                    "resource_id": "r",
                    "rhParams": {"13::megapixels": {"value": 0}, "474::batch_size": {"value": 4}},
                },
            }
        ]
    }
    hydrated = _hydrate_plan_nodes(plan, canvas)
    rh = hydrated["steps"][0]["node"]["params"]["runSettings"]["rhParams"]
    assert rh["13::megapixels"] == {"value": 0.3}
    # Untouched fields still come from the snapshot.
    assert rh["474::batch_size"] == {"value": 4}
    # The stored canvas node must not be mutated by hydration.
    assert canvas["nodes"][0]["runSettings"]["rhParams"]["13::megapixels"] == {"value": 0}


def test_hydrate_plan_nodes_update_step_wraps_bare_scalar_into_value_envelope():
    plan = {
        "steps": [
            {
                "id": "update",
                "action": "canvas.update_node_params",
                "target_node_id": "n1",
                "node": {
                    "semantic_type": "workflow_generation",
                    "params": {"runSettings": {"rhParams": {"13::megapixels": 0.3}}},
                },
            }
        ]
    }
    canvas = {
        "nodes": [
            {
                "id": "n1",
                "type": "smart-image",
                "capability": "runninghub.app.image",
                "runSettings": {"engine": "runninghub", "rhParams": {"13::megapixels": {"value": 0}}},
            }
        ]
    }
    hydrated = _hydrate_plan_nodes(plan, canvas)
    rh = hydrated["steps"][0]["node"]["params"]["runSettings"]["rhParams"]
    assert rh["13::megapixels"] == {"value": 0.3}


def test_hydrate_plan_nodes_prefers_generation_prompt_over_imported_file_text():
    plan = {"steps": [{"id": "run", "action": "canvas.run_node", "target_node_id": "n1"}]}
    canvas = {
        "nodes": [
            {
                "id": "n1",
                "type": "smart-image",
                "title": "Image",
                "text": "data/image copy 18.png",
                "promptDraftText": "生成一只猫",
                "runSettings": {"model": "demo", "ratio": "16:9"},
            }
        ]
    }
    hydrated = _hydrate_plan_nodes(plan, canvas)
    node = hydrated["steps"][0]["node"]
    assert node["params"]["runSettings"]["prompt"] == "生成一只猫"
    assert node["params"]["runSettings"]["model"] == "demo"
    assert node["params"]["runSettings"]["ratio"] == "16:9"


def test_hydrate_plan_nodes_uses_latest_canvas_values_over_stale_plan_snapshot():
    plan = {
        "steps": [
            {
                "id": "run",
                "action": "canvas.run_node",
                "target_node_id": "n1",
                "node": {
                    "semantic_type": "smart-image",
                    "title": "旧标题",
                    "content": "旧提示词",
                    "params": {"runSettings": {"model": "old-model"}},
                },
            }
        ]
    }
    canvas = {
        "nodes": [
            {
                "id": "n1",
                "type": "smart-image",
                "title": "新标题",
                "promptDraftText": "新提示词",
                "runSettings": {"model": "new-model"},
            }
        ]
    }
    hydrated = _hydrate_plan_nodes(plan, canvas)
    node = hydrated["steps"][0]["node"]
    assert node["title"] == "新标题"
    assert node["params"]["runSettings"]["prompt"] == "新提示词"
    assert node["params"]["runSettings"]["model"] == "new-model"


@pytest.mark.parametrize(
    ("settings", "capability"),
    [
        ({"engine": "comfy", "apiKind": "image"}, "comfyui.workflow.image"),
        ({"engine": "comfy", "apiKind": "video"}, "comfyui.workflow.video"),
        ({"provider_id": "runninghub", "apiKind": "image"}, "image.text_to_image"),
    ],
)
def test_hydrate_plan_nodes_infers_provider_specific_capability(settings, capability):
    plan = {"steps": [{"id": "run", "action": "canvas.run_node", "target_node_id": "n1"}]}
    canvas = {"nodes": [{"id": "n1", "type": "smart-image", "runSettings": settings}]}
    assert _hydrate_plan_nodes(plan, canvas)["steps"][0]["node"]["capability"] == capability


def test_confirm_endpoint_rejects_stale_plan_version(monkeypatch):
    import asyncio
    from fastapi import HTTPException
    from app.models import CanvasAgentConfirmRequest
    from app.routers import canvas_agent

    async def fake_run(*_args):
        return {"status": "awaiting_confirmation"}

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


def test_canvas_media_references_use_the_saved_node_media(monkeypatch):
    from app.services.canvas_agent import canvas_context

    monkeypatch.setattr(
        canvas_context,
        "load_canvas_payload",
        lambda *_args: {
            "version": 7,
            "nodes": [
                {"id": "node-1", "title": "猫", "images": [{"url": "/api/files/first"}, {"url": "/api/files/second"}]}
            ],
            "connections": [],
        },
    )

    result = canvas_context.build_canvas_context(
        "owner",
        "canvas-1",
        media_references=[
            {"node_id": "node-1", "image_index": 1, "url": "https://example.invalid/forged"},
            {"node_id": "missing", "image_index": 0},
        ],
    )

    assert result["media_references"] == [
        {
            "node_id": "node-1",
            "image_index": 1,
            "url": "/api/files/second",
            "label": "图1",
            "node_label": "猫",
            "source": "canvas",
        }
    ]


@pytest.mark.parametrize("event_type", ["plan.confirmed", "plan.rejected"])
def test_plan_decision_is_a_supported_agent_event(event_type):
    from app.services.canvas_agent.event_types import normalize_event_type

    assert normalize_event_type(event_type) == event_type


def test_rejected_plan_resumes_graph_and_keeps_run_available(monkeypatch):
    import asyncio
    from contextlib import asynccontextmanager
    from app.models import CanvasAgentConfirmRequest
    from app.routers import canvas_agent
    from app.services.canvas_agent import runtime

    run = {"id": "run-1", "canvas_id": "canvas-1", "status": "awaiting_confirmation"}
    updates, events, resumes = [], [], []

    async def fake_require_run(*_args):
        return dict(run)

    @asynccontextmanager
    async def fake_checkpointer():
        yield object()

    class FakeGraph:
        async def ainvoke(self, command, *, config):
            resumes.append((command.resume, config))
            return {}

    def fake_update_run(*_args, **changes):
        run.update(changes)
        updates.append(changes)
        return dict(run)

    async def fake_emit(*_args):
        events.append((_args[2], _args[3]))

    monkeypatch.setattr(canvas_agent, "_require_run", fake_require_run)
    monkeypatch.setattr(canvas_agent, "latest_plan", lambda *_args: {"version": 1})
    monkeypatch.setattr(canvas_agent, "create_async_checkpointer", fake_checkpointer)
    monkeypatch.setattr(canvas_agent, "update_run", fake_update_run)
    monkeypatch.setattr(canvas_agent, "set_plan_status", lambda *_args: None)
    monkeypatch.setattr(canvas_agent, "get_run", lambda *_args: dict(run))
    monkeypatch.setattr(canvas_agent, "emit_agent_event", fake_emit)
    monkeypatch.setattr(runtime, "create_canvas_agent", lambda **_kwargs: FakeGraph())

    result = asyncio.run(
        canvas_agent.execute_confirm_command(
            "owner", "run-1", CanvasAgentConfirmRequest(plan_version=1, approved=False)
        )
    )

    assert resumes == [({"approved": False}, {"configurable": {"thread_id": "run-1"}})]
    assert updates == [{"status": "planning", "phase": "planning"}]
    assert result["run"]["status"] == "planning"
    assert events == []


@pytest.mark.parametrize(
    "error,category",
    [
        ("upstream timeout", "transient"),
        ("canvas version conflict", "conflict"),
        ("budget limit exceeded", "quota"),
        ("permission denied", "permission"),
        ("invalid schema", "permanent"),
    ],
)
def test_failure_classification(error, category):
    assert classify_failure(error) == category


def test_runninghub_workflow_dispatch_uses_native_task_queue(monkeypatch):
    import asyncio
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from app.services.canvas_agent import canvas_task_dispatch as dispatch
    from app.ai.database_repository import DatabaseAIRepository
    from app.services.canvas_agent import events

    target = SimpleNamespace(connection=SimpleNamespace(id='rh'), resource=SimpleNamespace(
        id='x2', settings={'app_id': 'upstream-x2', 'fields': [
            {'id': '492::text', 'nodeId': '492', 'fieldName': 'text', 'fieldType': 'PROMPT'},
            {'id': '13::aspect_ratio', 'nodeId': '13', 'fieldName': 'aspect_ratio', 'fieldValue': '1:1 (Square)'},
        ]}))
    node = {'id': 'volcano', 'type': 'smart-image', 'genKind': 'workflow', 'runSettings': {
        'engine': 'runninghub', 'resource_id': 'x2', 'prompt': '火山',
        'rhParams': {'13::aspect_ratio': {'value': '3:2'}}}}
    monkeypatch.setattr(dispatch, 'load_canvas_payload', lambda *args: {'nodes': [node]})
    monkeypatch.setattr(dispatch, 'from_repository', lambda: SimpleNamespace(get=lambda name: None))
    monkeypatch.setattr(DatabaseAIRepository, 'resolve_executable', lambda *args, **kwargs: target)
    authorize, create, enqueue, emit = AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    monkeypatch.setattr(dispatch, 'check_target_task_budget', authorize)
    monkeypatch.setattr(dispatch, 'create_canvas_task', create)
    monkeypatch.setattr(dispatch, 'enqueue_canvas_task', enqueue)
    monkeypatch.setattr(events, 'emit_agent_event', emit)
    result = asyncio.run(dispatch.submit_run_requests('user', 'canvas', 'run',
        [{'op': 'run_node', 'node_id': 'volcano'}], prompt='request'))
    task = create.call_args.args[0]
    assert task['type'] == 'online-runninghub'
    assert task['agent_node_id'] == 'volcano'
    assert task['request']['webappId'] == 'upstream-x2'
    assert task['request']['nodeInfoList'] == [
        {'nodeId': '492', 'fieldName': 'text', 'fieldValue': '火山'},
        {'nodeId': '13', 'fieldName': 'aspect_ratio', 'fieldValue': '3:2'}]
    authorize.assert_awaited_once()
    enqueue.assert_awaited_once_with(result[0]['task_id'])


@pytest.mark.parametrize('command', ['message', 'answer'])
def test_plain_reply_does_not_reopen_rejected_plan(monkeypatch, command):
    import asyncio
    from contextlib import asynccontextmanager
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from app.routers import canvas_agent as router
    from app.models import CanvasAgentMessageRequest, CanvasAgentAnswerRequest

    run = {'id': 'run', 'canvas_id': 'canvas', 'status': 'planning', 'metadata_json': {}}
    previous = {'version': 3, 'status': 'rejected', 'content_json': {'goal': 'old'}}
    @asynccontextmanager
    async def checkpointer():
        yield None
    monkeypatch.setattr(router, '_require_run', AsyncMock(return_value=run))
    monkeypatch.setattr(router, '_emit_event_spec', AsyncMock())
    monkeypatch.setattr(router, 'build_canvas_context', lambda *args, **kwargs: {'canvas_version': 1})
    monkeypatch.setattr(router, 'resolve_canvas_agent_model', lambda **kwargs: object())
    monkeypatch.setattr(router, 'create_async_checkpointer', checkpointer)
    monkeypatch.setattr(router, 'run_canvas_agent', AsyncMock(return_value={
        'messages': [SimpleNamespace(content='你好！请问有什么可以帮你的？')]}))
    monkeypatch.setattr(router, 'latest_plan', lambda *args: previous)
    append = []
    monkeypatch.setattr(router, 'append_message', lambda *args: append.append(args))
    monkeypatch.setattr(router, 'emit_agent_event', AsyncMock())
    monkeypatch.setattr(router, 'update_run', lambda *args, **kwargs: run.update(kwargs))
    monkeypatch.setattr(router, 'get_run', lambda *args: run)
    monkeypatch.setattr(router, 'save_plan', lambda *args, **kwargs: pytest.fail('must not recreate old plan'))
    if command == 'message':
        result = asyncio.run(router.execute_message_command('user', 'run', CanvasAgentMessageRequest(content='你好')))
    else:
        result = asyncio.run(router.execute_answer_command('user', 'run', CanvasAgentAnswerRequest(answer='你好')))
    assert result['reply'] == '你好！请问有什么可以帮你的？'
    assert 'plan' not in result
    assert append[0][3] == result['reply']
    assert run['status'] == 'completed'


def _stale_prompt_node():
    return {
        "id": "n1",
        "type": "smart-image",
        "text": "旧提示词",
        "promptDraftText": "旧提示词",
        "promptDraftHtml": "旧提示词",
        "runPrompt": "上次生成的提示词",
        "runModelPrompt": "上次模型提示词",
        "runPromptRefs": [{"name": "ref"}],
        "runSettings": {"engine": "runninghub", "prompt": "旧提示词", "count": 1},
    }


def test_update_node_params_syncs_every_prompt_field():
    from app.services.canvas_agent.canvas_executor import _apply_node_params

    node = _stale_prompt_node()
    _apply_node_params(node, {"runSettings": {"engine": "runninghub", "prompt": "新 <提示词> & 'x'", "count": 1}})
    assert node["text"] == node["promptDraftText"] == node["runSettings"]["prompt"] == "新 <提示词> & 'x'"
    # The composer renders promptDraftHtml as HTML, so the text must be escaped.
    assert node["promptDraftHtml"] == "新 &lt;提示词&gt; &amp; &#x27;x&#x27;"
    # The last generation record is not an edit target.
    assert node["runPrompt"] == "上次生成的提示词"
    assert node["runModelPrompt"] == "上次模型提示词"
    assert node["runPromptRefs"] == [{"name": "ref"}]


def test_update_node_params_keeps_user_draft_when_prompt_is_unchanged():
    from app.services.canvas_agent.canvas_executor import _apply_node_params

    node = _stale_prompt_node()
    node["promptDraftText"] = node["promptDraftHtml"] = "用户刚改的草稿"
    # A pinned-model update resends the stored runSettings, including the prompt.
    _apply_node_params(node, {"runSettings": {"engine": "runninghub", "prompt": "旧提示词", "model_id": "m1"}})
    assert node["promptDraftText"] == "用户刚改的草稿"
    assert node["promptDraftHtml"] == "用户刚改的草稿"
    assert node["runSettings"]["model_id"] == "m1"


def test_update_node_params_without_prompt_leaves_prompt_fields_alone():
    from app.services.canvas_agent.canvas_executor import _apply_node_params

    node = _stale_prompt_node()
    _apply_node_params(node, {"title": "新标题"})
    assert node["title"] == "新标题"
    assert node["text"] == node["promptDraftText"] == "旧提示词"


def test_replace_node_content_syncs_runsettings_prompt_even_without_runsettings():
    from app.services.canvas_agent.canvas_executor import _sync_prompt_fields

    node = {"id": "n1", "text": "旧"}
    _sync_prompt_fields(node, "新")
    assert node["text"] == node["promptDraftText"] == node["promptDraftHtml"] == node["runSettings"]["prompt"] == "新"


def test_node_prompt_priority_and_fallbacks():
    from app.services.canvas_agent.canvas_task_dispatch import node_prompt

    node = _stale_prompt_node()
    assert node_prompt(node) == "旧提示词"
    node["promptDraftText"] = "  "
    assert node_prompt(node) == "上次生成的提示词"
    assert node_prompt({"text": "t", "runSettings": {"prompt": "p"}}) == "t"
    assert node_prompt({"text": "  ", "runSettings": {"prompt": "p"}}) == "p"
    assert node_prompt({"runSettings": "bad"}) == ""
    assert node_prompt({}) == ""


def test_dispatch_requests_read_the_prompt_the_canvas_shows():
    from types import SimpleNamespace

    from app.services.canvas_agent import canvas_task_dispatch as dispatch

    node = {
        "id": "n1",
        "genKind": "image",
        "promptDraftText": "界面上的提示词",
        "text": "旧 text",
        "runSettings": {"apiKind": "image", "model_id": "m1", "prompt": "旧 settings"},
    }
    assert dispatch._image_request_for_node(node, None, "", None)["prompt"] == "界面上的提示词"
    target = SimpleNamespace(
        connection=SimpleNamespace(id="rh"),
        resource=SimpleNamespace(
            id="x2",
            settings={"app_id": "a", "fields": [{"id": "492::text", "nodeId": "492", "fieldName": "text", "fieldType": "PROMPT"}]},
        ),
    )
    rh_node = {"id": "n2", "promptDraftText": "界面上的提示词", "runSettings": {"prompt": "旧 settings"}}
    assert dispatch._runninghub_request(rh_node, target)["nodeInfoList"][0]["fieldValue"] == "界面上的提示词"


_RH_SCHEMA = {
    "params_path": "runSettings.rhParams",
    "fields": [
        {"id": "492::text", "role": "prompt", "type": "text"},
        {"id": "13::aspect_ratio", "role": "dropdown", "type": "dropdown", "options": ["1:1 (Square)", "3:2 (Photo)"]},
        {"id": "13::megapixels", "role": "number", "type": "number"},
    ],
}


def _rh_update_plan(params):
    return {
        "steps": [
            {
                "id": "update",
                "action": "canvas.update_node_params",
                "target_node_id": "n1",
                "node": {"semantic_type": "workflow_generation", "params": params},
            }
        ]
    }


def _rh_canvas():
    return {
        "nodes": [
            {
                "id": "n1",
                "type": "smart-image",
                "capability": "runninghub.app.image",
                "promptDraftText": "旧提示词",
                "runSettings": {
                    "engine": "runninghub",
                    "connection_id": "c",
                    "resource_id": "r",
                    "prompt": "旧提示词",
                    "rhParams": {"492::text": {"value": "旧提示词"}, "13::aspect_ratio": {"value": "1:1 (Square)"}},
                },
            }
        ]
    }


@pytest.mark.parametrize("with_run_settings", [False, True])
def test_hydrate_plan_nodes_places_flat_field_ids_for_confirmation_card(monkeypatch, with_run_settings):
    # The model may send flat field ids with or without a runSettings object next
    # to them. Either way the card reads runSettings, so flat ids must land there.
    from app.routers import canvas_agent as router

    monkeypatch.setattr(router, "capability_schema_resolver", lambda target: _RH_SCHEMA)
    params = {"492::text": "新提示词", "13::aspect_ratio": "3:2 (Photo)", "13::megapixels": 0.3}
    if with_run_settings:
        params["runSettings"] = {"prompt": "旧提示词", "count": 1}
    hydrated = _hydrate_plan_nodes(_rh_update_plan(params), _rh_canvas())
    card = hydrated["steps"][0]["node"]["params"]
    assert [key for key in card if "::" in key] == []
    assert card["runSettings"]["prompt"] == "新提示词"
    rh = card["runSettings"]["rhParams"]
    assert rh["492::text"] == {"value": "新提示词"}
    assert rh["13::aspect_ratio"] == {"value": "3:2 (Photo)"}
    assert rh["13::megapixels"] == {"value": 0.3}


def test_hydrate_plan_nodes_flat_field_ids_beat_stale_run_settings_copy(monkeypatch):
    from app.routers import canvas_agent as router

    monkeypatch.setattr(router, "capability_schema_resolver", lambda target: _RH_SCHEMA)
    params = {"13::aspect_ratio": "3:2 (Photo)", "runSettings": {"rhParams": {"13::aspect_ratio": {"value": "1:1 (Square)"}}}}
    hydrated = _hydrate_plan_nodes(_rh_update_plan(params), _rh_canvas())
    assert hydrated["steps"][0]["node"]["params"]["runSettings"]["rhParams"]["13::aspect_ratio"] == {"value": "3:2 (Photo)"}

