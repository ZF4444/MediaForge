import asyncio
from unittest.mock import AsyncMock

import pytest

from app.ai.domain import Connection, ModelResource, ResolvedTarget
from app.services.canvas_agent import canvas_task_dispatch as dispatch
from app.services.canvas_agent import image_inputs
from app.services.canvas_agent.canvas_adapter import semantic_plan_to_patch
from app.services.canvas_agent.canvas_capabilities import CapabilityRegistry, from_repository
from app.services.canvas_agent.canvas_executor import _apply_node_params
from app.services.canvas_agent.schemas import SemanticPlan


def image_target(protocol="openai", base_url="https://example.test", model="gpt-image-2"):
    connection = Connection("connection", protocol, "Images", base_url, True)
    return ResolvedTarget(connection, model=ModelResource("model", connection.id, model, "image", protocol))


def image_node(node_id, urls=()):
    return {"id": node_id, "type": "smart-image", "images": [{"url": url} for url in urls]}


@pytest.fixture(autouse=True)
def no_storage_lookup(monkeypatch):
    monkeypatch.setattr(image_inputs, "resolve_file_reference", lambda **kwargs: None)


def test_input_order_selection_deduplication_and_history_exclusion():
    first = image_node("first", ["https://example.test/a.png", "https://example.test/b.png"])
    second = image_node("second", ["https://example.test/c.png", "https://example.test/b.png"])
    target = image_node("target", ["https://example.test/old-output.png"])
    target.update(inputNodeIds=["second"], blockedInputRefs=["first|0"], runInputRefs=[{"url": "old-input.png"}])
    canvas = {
        "nodes": [first, second, target],
        "connections": [
            {"from": "first", "to": "target", "kind": "input"},
            {"source": "second", "target": "target", "kind": "input"},
            {"from": "missing", "to": "target", "kind": "flow"},
        ],
    }
    refs = image_inputs.canvas_image_inputs(canvas, target, "user")
    assert [ref["url"] for ref in refs] == ["https://example.test/c.png", "https://example.test/b.png"]
    assert [ref["role"] for ref in refs] == ["image_1", "image_2"]


def test_text_to_image_does_not_implicitly_reuse_outputs_or_history():
    target = image_node("target", ["https://example.test/output.png"])
    target["runInputRefs"] = [{"url": "https://example.test/old.png"}]
    assert image_inputs.canvas_image_inputs({"nodes": [target]}, target, "user") == []


@pytest.mark.parametrize("source", [None, image_node("source"), image_node("source", [""])])
def test_missing_inputs_fail_instead_of_falling_back_to_text_to_image(source):
    target = dict(image_node("target"), inputNodeIds=["source"])
    canvas = {"nodes": [target] + ([source] if source else [])}
    with pytest.raises(ValueError, match="参考图片"):
        image_inputs.canvas_image_inputs(canvas, target, "user")


def test_blocking_all_images_fails_and_blocking_by_url_is_respected():
    source = image_node("source", ["https://example.test/a.png"])
    target = dict(image_node("target"), inputNodeIds=["source"], blockedInputRefs=["url|https://example.test/a.png"])
    with pytest.raises(ValueError, match="全部排除"):
        image_inputs.canvas_image_inputs({"nodes": [source, target]}, target, "user")


@pytest.mark.parametrize("overrides", [{"user_id": "other"}, {"deleted_at": 1}, {"status": "deleted"}])
def test_registered_file_requires_ownership_and_active_status(monkeypatch, overrides):
    monkeypatch.setattr(
        image_inputs,
        "resolve_file_reference",
        lambda **kwargs: {
            "file_id": "file",
            "user_id": "user",
            "deleted_at": None,
            **overrides,
        },
    )
    source = image_node("source", ["/api/files/file/preview"])
    target = dict(image_node("target"), inputNodeIds=["source"])
    with pytest.raises(PermissionError):
        image_inputs.canvas_image_inputs({"nodes": [source, target]}, target, "user")


def test_registered_file_uses_original_file_reference(monkeypatch):
    monkeypatch.setattr(
        image_inputs,
        "resolve_file_reference",
        lambda **kwargs: {
            "file_id": "file",
            "user_id": "user",
            "deleted_at": None,
            "kind": "image",
            "content_type": "image/png",
        },
    )
    source = image_node("source", ["/api/files/file/thumbnail"])
    target = dict(image_node("target"), inputNodeIds=["source"])
    refs = image_inputs.canvas_image_inputs({"nodes": [source, target]}, target, "user")
    assert refs[0]["url"] == image_inputs.file_preview_url("file")
    assert refs[0]["file_id"] == "file"
    assert refs[0]["mime"] == "image/png"


@pytest.mark.parametrize(
    "image",
    [
        {"url": "/api/files/missing/preview"},
        {"url": "https://example.test/a.png", "file_id": "missing"},
        {"url": "https://example.test/video.mp4"},
        {"url": "https://example.test/content", "kind": "audio"},
    ],
)
def test_missing_files_and_non_images_are_rejected(image):
    source = dict(image_node("source"), images=[image])
    target = dict(image_node("target"), inputNodeIds=["source"])
    with pytest.raises(ValueError):
        image_inputs.canvas_image_inputs({"nodes": [source, target]}, target, "user")


@pytest.mark.parametrize(
    "target,limit",
    [
        (image_target(), 4),
        (image_target("volcengine"), 4),
        (image_target("gemini"), 16),
        (image_target("omnilojo"), 16),
        (image_target("openai", "https://api.cloudwise.ai", "gemini-3-pro-image"), 14),
        (image_target("runninghub"), 0),
    ],
)
def test_transport_contract_matches_actual_adapter_limits(target, limit):
    assert image_inputs.image_input_contract(target) == {
        "supported": bool(limit),
        "max_images": limit,
        "scope": "transport",
    }


def test_registry_exposes_image_input_contract(monkeypatch):
    target = image_target()

    class Repository:
        def connections(self):
            return [target.connection]

        def models(self):
            return [target.model]

        def executable_resources(self):
            return []

    monkeypatch.setattr("app.services.canvas_agent.canvas_capabilities.list_comfy_workflows", lambda: [])
    result = from_repository(Repository()).as_dict()
    assert result[0]["targets"][0]["image_input"]["max_images"] == 4


@pytest.mark.parametrize(
    "count,protocol,error",
    [(1, "openai", None), (0, "openai", None), (5, "openai", "最多接受"), (1, "runninghub", "不支持")],
)
def test_dispatch_persists_reference_snapshot_or_rejects_before_enqueue(monkeypatch, count, protocol, error):
    source = image_node("source", [f"https://example.test/{index}.png" for index in range(count)])
    target = dict(
        image_node("target"),
        genKind="image",
        runSettings={
            "engine": "api",
            "apiKind": "image",
            "connection_id": "connection",
            "model_id": "model",
            "prompt": "编辑图1",
        },
    )
    if count:
        target["inputNodeIds"] = ["source"]
    monkeypatch.setattr(dispatch, "load_canvas_payload", lambda *args: {"nodes": [source, target]})
    # The dispatcher only needs a present image capability here.
    from app.services.canvas_agent.canvas_capabilities import Capability

    monkeypatch.setattr(dispatch, "from_repository", lambda: CapabilityRegistry([Capability("image.text_to_image")]))
    monkeypatch.setattr(dispatch, "normalize_canvas_image_payload", lambda payload: payload)
    monkeypatch.setattr(
        "app.ai.database_repository.DatabaseAIRepository.resolve_model", lambda *args, **kwargs: image_target(protocol)
    )
    create, enqueue = AsyncMock(), AsyncMock()
    monkeypatch.setattr(dispatch, "create_canvas_task", create)
    monkeypatch.setattr(dispatch, "enqueue_canvas_task", enqueue)
    monkeypatch.setattr(dispatch, "check_target_task_budget", AsyncMock())
    monkeypatch.setattr("app.services.canvas_agent.events.emit_agent_event", AsyncMock())
    submit = dispatch.submit_run_requests(
        "user", "canvas", "run", [{"op": "run_node", "node_id": "target"}], prompt="编辑"
    )
    if error:
        with pytest.raises(ValueError, match=error):
            asyncio.run(submit)
        create.assert_not_called()
        enqueue.assert_not_called()
    else:
        result = asyncio.run(submit)
        task = create.call_args.args[0]
        assert len(task["request"]["reference_images"]) == count
        assert task["request"]["reference_images"] == [
            {
                "file_id": "",
                "url": f"https://example.test/{index}.png",
                "name": f"图{index + 1}",
                "role": f"image_{index + 1}",
                "kind": "image",
                "mime": "",
            }
            for index in range(count)
        ]
        enqueue.assert_awaited_once_with(result[0]["task_id"])


def test_plan_connects_source_and_selects_one_image_before_run():
    plan = SemanticPlan.model_validate(
        {
            "goal": "编辑第2张图片",
            "steps": [
                {"id": "create-image", "action": "canvas.create_node", "node": {"semantic_type": "image_generation"}},
                {
                    "id": "connect",
                    "action": "canvas.connect",
                    "from_step": "source",
                    "to_step": "create-image",
                    "relation": "input",
                },
                {
                    "id": "select",
                    "action": "canvas.update_node_params",
                    "target_node_id": "create-image",
                    "node": {
                        "semantic_type": "image_generation",
                        "params": {"blockedInputRefs": ["source|0", "source|2"]},
                    },
                },
                {"id": "run", "action": "canvas.run_node", "target_node_id": "create-image"},
            ],
        }
    )
    operations = semantic_plan_to_patch(plan, "canvas", 1).operations
    target = dict(operations[0].node, id="create-image")
    _apply_node_params(target, operations[2].params)
    source = image_node("source", [f"https://example.test/{index}.png" for index in range(3)])
    canvas = {
        "nodes": [source, target],
        "connections": [
            {
                "from": operations[1].from_ref,
                "to": operations[1].to_ref,
                **operations[1].connection,
            }
        ],
    }
    refs = image_inputs.canvas_image_inputs(canvas, target, "user")
    assert [ref["url"] for ref in refs] == ["https://example.test/1.png"]
    assert operations[-1].node_id == target["id"]


def test_existing_node_reference_selection_survives_confirmation_hydration(monkeypatch):
    from app.routers import canvas_agent as router

    target = dict(
        image_node("target"),
        text="编辑图1",
        genKind="image",
        capability="image.text_to_image",
        runSettings={
            "engine": "api",
            "apiKind": "image",
            "connection_id": "connection",
            "model_id": "model",
            "prompt": "编辑图1",
        },
    )
    plan = {
        "steps": [
            {
                "id": "select",
                "action": "canvas.update_node_params",
                "target_node_id": "target",
                "node": {"semantic_type": "image_generation", "params": {"blockedInputRefs": ["source|0"]}},
            }
        ]
    }
    monkeypatch.setattr(
        router,
        "capability_schema_resolver",
        lambda node: {
            "params_path": "runSettings",
            "fields": [{"id": "prompt", "type": "textarea", "role": "prompt"}],
        },
    )
    hydrated = router._hydrate_plan_nodes(plan, {"nodes": [target]})
    params = hydrated["steps"][0]["node"]["params"]
    assert params["blockedInputRefs"] == ["source|0"]
    assert params["runSettings"] == target["runSettings"]
