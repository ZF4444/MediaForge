"""Accepted tasks retain their permission to execute after user ACL changes."""

import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException


@pytest.mark.parametrize("kind", ["online-image", "online-video"])
@pytest.mark.parametrize("resource_available", [True, False])
def test_worker_resolves_resource_without_rechecking_user_acl(monkeypatch, kind, resource_available):
    from app.ai import database_repository

    target = SimpleNamespace(connection=SimpleNamespace(id="connection"), model=SimpleNamespace(id="model"))

    def resolve(**kwargs):
        if not resource_available:
            raise LookupError("model disabled")
        return target

    monkeypatch.setattr(database_repository, "DatabaseAIRepository", lambda: SimpleNamespace(resolve_model=resolve))
    source = ast.parse(Path("main.py").read_text())
    function = next(
        node for node in source.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "execute_canvas_task"
    )
    stop = next(
        i
        for i, node in enumerate(function.body)
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "owner_id" for t in node.targets)
    )
    function.body = function.body[:stop]

    def unauthorized(*args):
        pytest.fail("worker must not recheck user permissions")

    update = AsyncMock()
    namespace = dict(
        asyncio=asyncio,
        time=SimpleNamespace(time=lambda: 0),
        HTTPException=HTTPException,
        get_canvas_task=AsyncMock(
            return_value={"status": "queued", "type": kind, "owner_id": "user", "model_id": "model", "request": {}}
        ),
        update_canvas_task=update,
        require_target_access=unauthorized,
    )
    exec(compile(ast.Module(body=[function], type_ignores=[]), "main.py", "exec"), namespace)
    asyncio.run(namespace["execute_canvas_task"]("task"))
    if resource_available:
        assert update.await_args.kwargs["model_id"] == "model"
        assert "status" not in update.await_args.kwargs
    else:
        assert update.await_args.kwargs["status"] == "failed"
        assert "model disabled" in update.await_args.kwargs["error"]
