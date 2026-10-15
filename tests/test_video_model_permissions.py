import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.ai import videos
from app.ai.contracts import Actor


def test_video_gateway_rejects_unauthorized_model_before_admission(monkeypatch):
    checks = []
    from app.core import access_control
    monkeypatch.setattr(access_control, 'is_model_allowed', lambda *args: checks.append(args) or False)
    handler = AsyncMock()
    admission = AsyncMock()
    monkeypatch.setattr(videos, 'connection_operation', admission)
    command = SimpleNamespace(target=SimpleNamespace(
        connection=SimpleNamespace(id='seedance-connection'),
        model=SimpleNamespace(upstream_model='seedance'),
    ))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(videos.VideoGateway(target_handler=handler).generate_target(command, actor=Actor(user_id='test-user')))
    assert exc.value.status_code == 403
    assert checks == [('test-user', 'seedance-connection', 'seedance')]
    handler.assert_not_called()
    admission.assert_not_called()


def test_video_gateway_runs_authorized_model(monkeypatch):
    monkeypatch.setattr(videos, 'require_model_access', lambda *_args: None)

    @asynccontextmanager
    async def admission(*args, **kwargs):
        yield

    monkeypatch.setattr(videos, 'connection_operation', admission)
    handler = AsyncMock(return_value={'video_url': 'video.mp4'})
    command = SimpleNamespace(target=SimpleNamespace(
        connection=SimpleNamespace(id='connection'), model=SimpleNamespace(upstream_model='seedance'),
    ))
    result = asyncio.run(videos.VideoGateway(target_handler=handler).generate_target(command, actor=Actor(user_id='user')))
    assert result == {'video_url': 'video.mp4'}
    handler.assert_awaited_once_with(command)
