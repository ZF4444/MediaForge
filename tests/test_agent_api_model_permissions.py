"""Agent commands authorize chat and generation models before being queued."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.ai.database_repository import DatabaseAIRepository
from app.core import access_control
from app.models import CanvasAgentAnswerRequest, CanvasAgentConfirmRequest, CanvasAgentMessageRequest
from app.routers import canvas_agent as router


def resolved(model_id="chat-model"):
    return SimpleNamespace(
        connection=SimpleNamespace(id="connection"), model=SimpleNamespace(id=model_id, upstream_model="upstream")
    )


@pytest.mark.parametrize("kind", ["message", "answer", "confirm"])
def test_denied_chat_command_is_not_accepted(monkeypatch, kind):
    monkeypatch.setattr(router, "_user", lambda *args: "user")
    monkeypatch.setattr(
        router,
        "_require_run",
        AsyncMock(return_value={"status": "awaiting_confirmation", "metadata_json": {"model_id": "chat-model"}}),
    )
    monkeypatch.setattr(router, "latest_plan", lambda *args: {"version": 1})
    monkeypatch.setattr(DatabaseAIRepository, "resolve_model", lambda *args, **kwargs: resolved())
    monkeypatch.setattr(access_control, "is_model_allowed", lambda *args, **kwargs: False)
    accept = AsyncMock()
    monkeypatch.setattr(router, "_accept_command", accept)
    payload, endpoint = {
        "message": (CanvasAgentMessageRequest(content="test"), router.post_agent_message),
        "answer": (CanvasAgentAnswerRequest(answer="test"), router.answer_agent_question),
        "confirm": (CanvasAgentConfirmRequest(plan_version=1), router.confirm_agent_plan),
    }[kind]
    with pytest.raises(HTTPException) as exc:
        asyncio.run(endpoint("run", payload, object()))
    assert exc.value.status_code == 403
    accept.assert_not_called()


def test_admission_pins_chat_target_ids(monkeypatch):
    monkeypatch.setattr(DatabaseAIRepository, "resolve_model", lambda *args, **kwargs: resolved())
    monkeypatch.setattr(access_control, "is_model_allowed", lambda *args, **kwargs: True)
    body = {"model": "upstream"}
    asyncio.run(router._authorize_agent_chat("user", body, {"metadata_json": {"model_connection_id": "connection"}}))
    assert body["model_id"] == "chat-model"
    assert body["connection_id"] == "connection"


def test_rejected_plan_does_not_require_model_access(monkeypatch):
    monkeypatch.setattr(router, "_user", lambda *args: "user")
    monkeypatch.setattr(router, "_require_run", AsyncMock(return_value={"status": "awaiting_confirmation"}))
    monkeypatch.setattr(router, "latest_plan", lambda *args: {"version": 1})
    authorize = AsyncMock(side_effect=AssertionError("rejection does not execute models"))
    accept = AsyncMock(return_value={"accepted": True})
    monkeypatch.setattr(router, "_authorize_agent_chat", authorize)
    monkeypatch.setattr(router, "_authorize_agent_plan", authorize)
    monkeypatch.setattr(router, "_accept_command", accept)
    asyncio.run(router.confirm_agent_plan("run", CanvasAgentConfirmRequest(plan_version=1, approved=False), object()))
    accept.assert_awaited_once()


def test_plan_checks_final_node_settings_after_confirmation_edits(monkeypatch):
    canvas = {"version": 1, "nodes": []}
    plan = {
        "version": 1,
        "content_json": {
            "goal": "generate",
            "steps": [
                {
                    "id": "new",
                    "action": "canvas.create_node",
                    "node": {
                        "semantic_type": "image_generation",
                        "model_id": "original",
                        "connection_id": "connection",
                        "params": {"runSettings": {"model_id": "original", "prompt": "test"}},
                    },
                },
                {"id": "run", "action": "canvas.run_node", "target_node_id": "new"},
            ],
        },
    }
    monkeypatch.setattr(router, "load_canvas_payload", lambda *args: canvas)
    monkeypatch.setattr(router, "capability_schema_resolver", lambda *args: None)
    selected = []

    def resolve(*args, **kwargs):
        selected.append(kwargs["model_id"])
        return resolved(kwargs["model_id"])

    monkeypatch.setattr(DatabaseAIRepository, "resolve_model", resolve)
    monkeypatch.setattr(access_control, "is_model_allowed", lambda *args, **kwargs: kwargs["model_id"] != "denied")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            router._authorize_agent_plan(
                "user",
                {"canvas_id": "canvas"},
                plan,
                [
                    {"step_id": "new", "params": {"runSettings": {"model_id": "denied"}}},
                ],
            )
        )
    assert exc.value.status_code == 403
    assert selected == ["denied"]
    assert plan["content_json"]["steps"][0]["node"]["params"]["runSettings"]["model_id"] == "original"


def test_retry_is_new_admission_and_denied_before_task_reset(monkeypatch):
    monkeypatch.setattr(router, "_user", lambda *args: "user")
    monkeypatch.setattr(router, "_require_run", AsyncMock(return_value={}))
    monkeypatch.setattr(
        router,
        "get_canvas_task",
        AsyncMock(
            return_value={
                "owner_id": "user",
                "agent_run_id": "run",
                "status": "failed",
                "type": "online-image",
                "model_id": "image-model",
                "connection_id": "connection",
            }
        ),
    )
    monkeypatch.setattr(DatabaseAIRepository, "resolve_model", lambda *args, **kwargs: resolved("image-model"))
    monkeypatch.setattr(access_control, "is_model_allowed", lambda *args, **kwargs: False)
    reset = AsyncMock()
    monkeypatch.setattr(router, "release_canvas_task_dispatch", reset)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(router.retry_agent_task("run", "task", object()))
    assert exc.value.status_code == 403
    reset.assert_not_called()


def test_admitted_patch_pins_default_model_and_worker_reuses_snapshot(monkeypatch):
    canvas = {"version": 1, "nodes": [{"id": "existing", "type": "smart-image", "x": 0, "y": 0}]}
    run = {"canvas_id": "canvas", "base_canvas_version": 1, "metadata_json": {}}
    plan = {
        "version": 1,
        "content_json": {
            "goal": "generate",
            "steps": [
                {
                    "id": "new",
                    "action": "canvas.create_node",
                    "node": {
                        "semantic_type": "image_generation",
                        "connection_id": "connection",
                        "params": {"runSettings": {"prompt": "test"}},
                    },
                },
                {"id": "run", "action": "canvas.run_node", "target_node_id": "new"},
            ],
        },
    }
    monkeypatch.setattr(router, "load_canvas_payload", lambda *args: canvas)
    monkeypatch.setattr(router, "capability_schema_resolver", lambda *args: None)
    monkeypatch.setattr(DatabaseAIRepository, "resolve_model", lambda *args, **kwargs: resolved("admitted-default"))
    monkeypatch.setattr(access_control, "is_model_allowed", lambda *args, **kwargs: True)
    snapshot = asyncio.run(router._authorize_agent_plan("user", run, plan, []))
    pinned = snapshot["execution_patch"]["operations"][-1]
    assert pinned["params"]["runSettings"]["model_id"] == "admitted-default"
    assert pinned["params"]["runSettings"]["connection_id"] == "connection"

    def unexpected(*args, **kwargs):
        pytest.fail("worker must reuse the admitted patch without resolving model defaults or permissions")

    layout_builder = router.semantic_plan_to_patch
    monkeypatch.setattr(router, "semantic_plan_to_patch", unexpected)
    monkeypatch.setattr(access_control, "is_model_allowed", unexpected)
    monkeypatch.setattr(router, "_require_run", AsyncMock(return_value=run))
    monkeypatch.setattr(router, "latest_plan", lambda *args: plan)
    monkeypatch.setattr(router, "update_run", lambda *args, **kwargs: run)
    patches = []

    def apply(user_id, run_id, key, patch, **kwargs):
        patches.append(patch)
        return {"version": 2, "run_requests": []}

    monkeypatch.setattr(router, "apply_patch_idempotently", apply)
    result = asyncio.run(router._execute_approved_canvas_patch("user", "run", "canvas", 1, [], **snapshot))
    assert result["version"] == 2
    assert patches[0].operations[-1].params["runSettings"]["model_id"] == "admitted-default"

    # Moving a node only recomputes placement; the accepted model stays pinned.
    monkeypatch.setattr(router, "semantic_plan_to_patch", layout_builder)
    monkeypatch.setattr(router, "capability_schema_resolver", unexpected)
    canvas["version"] = 2
    canvas["nodes"][0]["x"] = 400
    asyncio.run(router._execute_approved_canvas_patch("user", "run", "canvas", 1, [], **snapshot))
    assert patches[-1].base_version == 2
    assert patches[-1].operations[0].placement["x"] > patches[0].operations[0].placement["x"]
    assert patches[-1].operations[-1].params["runSettings"]["model_id"] == "admitted-default"

    # A changed target on the canvas requires a new confirmation, rather than
    # silently applying a snapshot authorized against different content.
    canvas["nodes"] = [{"id": "changed", "runSettings": {"model_id": "different"}}]
    with pytest.raises(HTTPException) as exc:
        asyncio.run(router._execute_approved_canvas_patch("user", "run", "canvas", 1, [], **snapshot))
    assert exc.value.status_code == 409
    assert len(patches) == 2


def test_confirmation_replaces_client_supplied_execution_snapshot(monkeypatch):
    monkeypatch.setattr(router, "_user", lambda *args: "user")
    monkeypatch.setattr(router, "_require_run", AsyncMock(return_value={"status": "awaiting_confirmation"}))
    monkeypatch.setattr(router, "latest_plan", lambda *args: {"version": 1})
    monkeypatch.setattr(router, "_authorize_agent_chat", AsyncMock())
    snapshot = {"execution_patch": {"canvas_id": "server"}, "canvas_fingerprint": "server-fingerprint"}
    monkeypatch.setattr(router, "_authorize_agent_plan", AsyncMock(return_value=snapshot))
    accept = AsyncMock(return_value={})
    monkeypatch.setattr(router, "_accept_command", accept)
    asyncio.run(
        router.confirm_agent_plan(
            "run",
            CanvasAgentConfirmRequest(
                plan_version=1,
                execution_patch={"canvas_id": "client"},
                canvas_fingerprint="client-fingerprint",
            ),
            object(),
        )
    )
    assert accept.await_args.args[-1]["execution_patch"] == snapshot["execution_patch"]
    assert accept.await_args.args[-1]["canvas_fingerprint"] == "server-fingerprint"


def _retry_task(**overrides):
    task = {
        "owner_id": "user",
        "agent_run_id": "run",
        "status": "failed",
        "type": "online-image",
        "connection_id": "connection",
    }
    task.update(overrides)
    return task


def test_retry_without_pinned_model_is_rejected_instead_of_checking_an_arbitrary_model(monkeypatch):
    monkeypatch.setattr(router, "_user", lambda *args: "user")
    monkeypatch.setattr(router, "_require_run", AsyncMock(return_value={}))
    monkeypatch.setattr(router, "get_canvas_task", AsyncMock(return_value=_retry_task()))
    resolve = []
    monkeypatch.setattr(
        DatabaseAIRepository, "resolve_model", lambda *args, **kwargs: resolve.append(kwargs) or resolved("first")
    )
    monkeypatch.setattr(access_control, "is_model_allowed", lambda *args, **kwargs: True)
    reset = AsyncMock()
    monkeypatch.setattr(router, "release_canvas_task_dispatch", reset)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(router.retry_agent_task("run", "task", object()))
    assert exc.value.status_code == 409
    assert resolve == []  # never resolved a guessed model
    reset.assert_not_called()


def test_retry_with_upstream_model_name_still_resolves_that_exact_model(monkeypatch):
    monkeypatch.setattr(router, "_user", lambda *args: "user")
    monkeypatch.setattr(router, "_require_run", AsyncMock(return_value={}))
    monkeypatch.setattr(router, "get_canvas_task", AsyncMock(return_value=_retry_task(request={"model": "upstream-x"})))
    seen = {}
    monkeypatch.setattr(
        DatabaseAIRepository, "resolve_model", lambda *args, **kwargs: seen.update(kwargs) or resolved("image-model")
    )
    monkeypatch.setattr(access_control, "is_model_allowed", lambda *args, **kwargs: False)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(router.retry_agent_task("run", "task", object()))
    assert exc.value.status_code == 403  # reached the permission check on the named model
    assert seen["model"] == "upstream-x" and seen["connection_id"] == "connection"
