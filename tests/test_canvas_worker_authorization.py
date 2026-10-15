"""Exercise worker authorization without starting the application lifespan."""
import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException


@pytest.mark.parametrize('kind', ['online-image', 'online-video'])
@pytest.mark.parametrize('allowed', [True, False])
def test_worker_checks_persisted_owner_and_records_denial(monkeypatch, kind, allowed):
    from app.ai import database_repository

    target = SimpleNamespace(connection=SimpleNamespace(id='connection'), model=SimpleNamespace(id='model'))
    monkeypatch.setattr(database_repository, 'DatabaseAIRepository', lambda: SimpleNamespace(resolve_model=lambda **kw: target))
    source = ast.parse(Path('main.py').read_text())
    function = next(node for node in source.body if isinstance(node, ast.AsyncFunctionDef) and node.name == 'execute_canvas_task')
    # Stop after resource validation; the remainder executes the provider call.
    stop = next(i for i, node in enumerate(function.body) if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'owner_id' for t in node.targets))
    function.body = function.body[:stop]
    checks = []

    def authorize(resolved, uid):
        checks.append((resolved, uid))
        if not allowed:
            raise HTTPException(403, '没有权限使用该模型，请联系管理员开放。')

    update = AsyncMock()
    namespace = dict(asyncio=asyncio, time=SimpleNamespace(time=lambda: 0), HTTPException=HTTPException,
                     get_canvas_task=AsyncMock(return_value={'status': 'queued', 'type': kind, 'owner_id': 'feishu-test', 'model_id': 'model', 'request': {}}),
                     update_canvas_task=update, require_target_access=authorize,
                     current_user_id=lambda: 'anonymous')
    exec(compile(ast.Module(body=[function], type_ignores=[]), 'main.py', 'exec'), namespace)
    asyncio.run(namespace['execute_canvas_task']('task'))
    assert checks == [(target, 'feishu-test')]
    if not allowed:
        assert update.await_args.kwargs['status'] == 'failed'
        assert update.await_args.kwargs['status_code'] == 403
        assert update.await_args.kwargs['error_code'] == 'model_access_denied'
