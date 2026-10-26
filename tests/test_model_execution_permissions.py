"""Model ACLs belong to API admission, not to accepted task execution."""

import ast
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.ai import chat, images, videos
from app.ai.authorization import require_model_access
from app.ai.contracts import Actor
from app.core import access_control
from app.models import CanvasVideoRequest, OnlineImageRequest


def target():
    return SimpleNamespace(
        connection=SimpleNamespace(id="connection"),
        model=SimpleNamespace(id="model-id", upstream_model="restricted"),
        protocol="openai",
    )


def main_function(name, **namespace):
    tree = ast.parse(Path("main.py").read_text())
    function = next(
        node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name
    )
    function.decorator_list = []
    namespace.update(asyncio=asyncio, HTTPException=HTTPException)
    module = ast.Module(
        body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0), function],
        type_ignores=[],
    )
    exec(compile(ast.fix_missing_locations(module), "main.py", "exec"), namespace)
    return namespace[name]


@pytest.mark.parametrize(
    "name,payload",
    [
        ("online_image", OnlineImageRequest(prompt="test", model_id="model-id")),
        ("create_canvas_image_task", OnlineImageRequest(prompt="test", model_id="model-id")),
        ("canvas_video", CanvasVideoRequest(prompt="test", model_id="model-id")),
    ],
)
def test_api_denies_before_queue_or_execution(monkeypatch, name, payload):
    from app.ai.database_repository import DatabaseAIRepository

    monkeypatch.setattr(DatabaseAIRepository, "resolve_model", lambda *args, **kwargs: target())
    monkeypatch.setattr(access_control, "is_model_allowed", lambda *args, **kwargs: False)
    submit = AsyncMock(side_effect=AssertionError("denied requests must not execute or queue"))
    endpoint = main_function(
        name,
        current_user_id=lambda: "user",
        require_target_access=require_model_access,
        CANVAS_REQUEST_SOURCE="canvas",
        normalize_canvas_image_request=lambda value: value,
        normalize_canvas_video_request=lambda value: value,
        create_canvas_task=submit,
        build_online_image_result=submit,
        assert_provider_budget_available=submit,
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(endpoint(payload))
    assert exc.value.status_code == 403
    submit.assert_not_called()


@asynccontextmanager
async def admission(*args, **kwargs):
    yield


@pytest.mark.parametrize("kind", ["image", "video", "chat", "stream"])
def test_accepted_execution_does_not_recheck_user_permissions(monkeypatch, kind):
    def unexpected(*args, **kwargs):
        raise AssertionError("execution must not read current user permissions")

    monkeypatch.setattr(access_control, "is_model_allowed", unexpected)
    command = SimpleNamespace(target=target())
    handler = AsyncMock(return_value={"ok": True})
    for module in (images, videos, chat):
        monkeypatch.setattr(module, "connection_operation", admission)
    if kind in {"image", "video"}:
        gateway = (
            images.ImageGateway(registry=None, target_handler=handler)
            if kind == "image"
            else videos.VideoGateway(target_handler=handler)
        )
        assert asyncio.run(gateway.generate_target(command, actor=Actor("user"))) == {"ok": True}
        handler.assert_awaited_once()
    else:
        adapter = SimpleNamespace(chat=handler)

        async def stream(*args, **kwargs):
            yield "data"

        adapter.stream_chat = stream
        monkeypatch.setattr(chat, "_chat_adapter", lambda *args: adapter)
        gateway = chat.ChatGateway()
        monkeypatch.setattr(gateway, "_resolver_headers", AsyncMock(return_value={}))
        if kind == "chat":
            assert asyncio.run(gateway._execute_target(command, user_id="user")) == {"ok": True}
        else:

            async def collect():
                return [line async for line in gateway._stream_target(command, user_id="user")]

            assert asyncio.run(collect()) == ["data"]


def test_agent_chat_executes_after_revocation(monkeypatch):
    from app.services.canvas_agent.model_adapter import GatewayChatModel

    monkeypatch.setattr(access_control, "is_model_allowed", lambda *args, **kwargs: pytest.fail("worker rechecked ACL"))
    transport = AsyncMock(return_value={"choices": []})
    monkeypatch.setattr(chat, "complete_with_retry", transport)
    model = GatewayChatModel(endpoint="https://example.test", model_name="restricted")
    assert asyncio.run(model._post_with_retry({"messages": []})) == {"choices": []}
    transport.assert_awaited_once()
