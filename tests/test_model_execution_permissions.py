import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.ai import chat, images
from app.ai.contracts import Actor
from app.core import access_control


def target():
    return SimpleNamespace(connection=SimpleNamespace(id='connection'), model=SimpleNamespace(upstream_model='restricted'), protocol='openai')


@pytest.mark.parametrize('path', ['image', 'chat', 'stream'])
def test_execution_rejects_denied_model_before_upstream(monkeypatch, path):
    monkeypatch.setattr(access_control, 'is_model_allowed', lambda *_args: False)
    handler = AsyncMock()
    command = SimpleNamespace(target=target())

    async def run():
        if path == 'image':
            return await images.ImageGateway(registry=None, target_handler=handler).generate_target(command, actor=Actor('user'))
        gateway = chat.ChatGateway()
        if path == 'chat':
            return await gateway._execute_target(command, user_id='user')
        return [line async for line in gateway._stream_target(command, user_id='user')]

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())
    assert exc.value.status_code == 403
    handler.assert_not_called()


def test_every_main_model_resolution_has_immediate_permission_check():
    import ast
    from pathlib import Path

    source = Path('main.py').read_text()
    lines = source.splitlines()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Await):
            segment = ast.get_source_segment(source, node.value)
            if '.resolve_model,' in segment:
                assert 'require_target_access' in lines[node.end_lineno], f'missing permission check at {node.lineno}'


def test_agent_chat_rechecks_permission_before_request(monkeypatch):
    from app.services.canvas_agent.model_adapter import GatewayChatModel

    monkeypatch.setattr(access_control, 'is_model_allowed', lambda *_args: False)
    model = GatewayChatModel(endpoint='https://example.test', model_name='restricted', authorization_target=target(), authorization_user_id='user')
    with pytest.raises(HTTPException) as exc:
        asyncio.run(model._post_with_retry({'messages': []}))
    assert exc.value.status_code == 403
