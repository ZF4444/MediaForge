import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.ai import videos
from app.ai.contracts import Actor


def test_video_gateway_runs_authorized_model(monkeypatch):

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
