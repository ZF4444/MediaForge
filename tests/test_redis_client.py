import asyncio

import pytest
from starlette.requests import Request

from app.core import redis_client


class FakeRedisClient:
    def __init__(self, ping_error=None):
        self.ping_error = ping_error
        self.closed = False

    async def ping(self):
        if self.ping_error:
            raise self.ping_error
        return True

    async def aclose(self):
        self.closed = True


def test_redis_startup_requires_url(monkeypatch):
    monkeypatch.setattr(redis_client, "_CLIENT", None)
    monkeypatch.setattr(redis_client, "REDIS_URL", "")

    with pytest.raises(RuntimeError, match="REDIS_URL"):
        asyncio.run(redis_client.open_redis_client())


def test_redis_startup_rejects_failed_ping(monkeypatch):
    import redis.asyncio

    client = FakeRedisClient(ConnectionError("offline"))
    monkeypatch.setattr(redis_client, "_CLIENT", None)
    monkeypatch.setattr(redis_client, "REDIS_URL", "redis://127.0.0.1:6379/0")
    monkeypatch.setattr(redis.asyncio.Redis, "from_url", lambda *_args, **_kwargs: client)

    with pytest.raises(redis_client.RedisUnavailableError, match="拒绝启动"):
        asyncio.run(redis_client.open_redis_client())

    assert client.closed is True
    assert redis_client._CLIENT is None


def test_redis_client_is_shared_and_closed(monkeypatch):
    import redis.asyncio

    client = FakeRedisClient()
    monkeypatch.setattr(redis_client, "_CLIENT", None)
    monkeypatch.setattr(redis_client, "REDIS_URL", "redis://127.0.0.1:6379/0")
    monkeypatch.setattr(redis.asyncio.Redis, "from_url", lambda *_args, **_kwargs: client)

    async def scenario():
        first = await redis_client.open_redis_client()
        second = await redis_client.open_redis_client()
        assert first is client
        assert second is client
        await redis_client.close_redis_client()

    asyncio.run(scenario())
    assert client.closed is True
    assert redis_client._CLIENT is None


def test_auth_middleware_returns_503_when_redis_fails(monkeypatch):
    import main

    async def unavailable(_token):
        raise redis_client.RedisUnavailableError("Redis 认证缓存暂时不可用")

    async def unexpected_next(_request):
        raise AssertionError("request must not reach the route")

    monkeypatch.setattr(main, "get_session", unavailable)
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/api/canvases",
        "headers": [(b"cookie", b"sid=token")],
        "query_string": b"",
        "server": ("testserver", 80),
        "client": ("testclient", 123),
        "scheme": "http",
    })

    response = asyncio.run(main.auth_middleware(request, unexpected_next))

    assert response.status_code == 503
    assert b'"error":"redis_unavailable"' in response.body


def test_auth_middleware_skips_redis_for_static_assets(monkeypatch):
    import main

    async def unexpected_session(_token):
        raise AssertionError("static assets must not query Redis")

    async def static_response(_request):
        from starlette.responses import Response
        return Response("ok")

    monkeypatch.setattr(main, "get_session", unexpected_session)
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/static/app.js",
        "headers": [(b"cookie", b"sid=token")],
        "query_string": b"",
        "server": ("testserver", 80),
        "client": ("testclient", 123),
        "scheme": "http",
    })

    response = asyncio.run(main.auth_middleware(request, static_response))

    assert response.status_code == 200
