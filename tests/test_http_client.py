import asyncio

import httpx
import pytest

from app.core import http_client


@pytest.fixture(autouse=True)
def _reset_shared_client():
    yield
    http_client._CLIENT = None


def test_shared_http_client_requires_open_client_first():
    with pytest.raises(http_client.HttpClientUnavailableError):
        http_client.get_http_client()


def test_shared_http_client_reuses_process_wide_instance():
    async def scenario():
        client = await http_client.open_http_client()
        again = await http_client.open_http_client()
        assert again is client
        assert http_client.get_http_client() is client
        await http_client.close_http_client()

    asyncio.run(scenario())


def test_shared_http_client_close_is_idempotent():
    async def scenario():
        await http_client.open_http_client()
        await http_client.close_http_client()
        await http_client.close_http_client()
        with pytest.raises(http_client.HttpClientUnavailableError):
            http_client.get_http_client()

    asyncio.run(scenario())


def test_shared_http_client_context_applies_default_timeout_without_new_connection(monkeypatch):
    async def scenario():
        shared = await http_client.open_http_client()
        captured = {}

        async def fake_get(url, **kwargs):
            captured["url"] = url
            captured.update(kwargs)
            return "ok"

        monkeypatch.setattr(shared, "get", fake_get)

        async with http_client.shared_http_client(timeout=42, follow_redirects=True) as client:
            result = await client.get("http://example.test")

        assert result == "ok"
        assert captured["url"] == "http://example.test"
        assert captured["timeout"] == 42
        assert captured["follow_redirects"] is True
        await http_client.close_http_client()

    asyncio.run(scenario())


def test_shared_http_client_context_lets_per_call_override_win(monkeypatch):
    async def scenario():
        shared = await http_client.open_http_client()
        captured = {}

        async def fake_post(url, **kwargs):
            captured.update(kwargs)
            return "ok"

        monkeypatch.setattr(shared, "post", fake_post)

        async with http_client.shared_http_client(timeout=15) as client:
            await client.post("http://example.test", timeout=5)

        assert captured["timeout"] == 5
        await http_client.close_http_client()

    asyncio.run(scenario())


def test_shared_http_client_context_does_not_close_shared_client():
    async def scenario():
        client = await http_client.open_http_client()
        async with http_client.shared_http_client(timeout=10) as bound:
            assert bound.get is not None  # attribute access only; ensure no aclose triggered
        assert http_client.get_http_client() is client
        assert not client.is_closed
        await http_client.close_http_client()

    asyncio.run(scenario())


def test_shared_http_client_proxy_forwards_unknown_attributes():
    async def scenario():
        client = await http_client.open_http_client()
        async with http_client.shared_http_client() as bound:
            assert bound.headers is client.headers
        await http_client.close_http_client()

    asyncio.run(scenario())
