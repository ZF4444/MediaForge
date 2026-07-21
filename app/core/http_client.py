"""Shared asynchronous HTTP client lifecycle for outbound provider calls.

Every outbound call to ComfyUI-adjacent cloud providers (ModelScope, APIMart,
RunningHub, Volcengine, Gemini, jimeng/yuli, etc.) must reuse this single
``httpx.AsyncClient`` instance instead of doing ``async with
httpx.AsyncClient(...) as client:`` per call. Creating a client per request
throws away connection pooling and keep-alive, forcing a fresh TCP/TLS
handshake for every outbound request.

``shared_http_client(timeout=..., follow_redirects=...)`` is a drop-in
replacement for ``httpx.AsyncClient(timeout=..., follow_redirects=...)`` at
call sites: it is an async context manager with the same ``async with ... as
client:`` shape, so call-site bodies do not need to change. Internally it
hands back a thin proxy bound to the process-wide shared client. The proxy
applies the call site's original timeout/follow_redirects as defaults on
``get``/``post``/``put``/``delete``/``patch``/``stream``, while still letting
individual calls override them exactly as before. No new connection or TLS
handshake is created, and ``__aexit__`` does not close the shared client.

A small number of call sites intentionally build a throwaway
``httpx.AsyncClient`` to retry with a brand-new connection after a suspected
TLS/connection-level failure. Those must keep constructing their own
short-lived client (``httpx.AsyncClient(...)`` directly) and must not be
migrated to ``shared_http_client``.
"""

from __future__ import annotations

from types import TracebackType
from typing import Any

import httpx

from app.config import (
    HTTP_CLIENT_KEEPALIVE_CONNECTIONS,
    HTTP_CLIENT_MAX_CONNECTIONS,
    HTTP_CLIENT_TIMEOUT_CONNECT_SECONDS,
    HTTP_CLIENT_TIMEOUT_POOL_SECONDS,
    HTTP_CLIENT_TIMEOUT_READ_SECONDS,
    HTTP_CLIENT_TIMEOUT_WRITE_SECONDS,
)
from app.core.logging import get_logger

logger = get_logger("http_client")
_CLIENT: httpx.AsyncClient | None = None
_UNSET = object()


class HttpClientUnavailableError(RuntimeError):
    """The shared HTTP client has not been started."""


class _BoundHttpClient:
    """Proxy over the shared client that applies call-site default overrides.

    Mirrors the subset of ``httpx.AsyncClient`` surface actually used by
    call sites (``get``/``post``/``put``/``delete``/``patch``/``stream``/
    ``request``/``build_request``/``send``). Anything else (e.g. ``.headers``,
    ``.cookies``) is forwarded straight to the underlying shared client.
    """

    __slots__ = ("_client", "_timeout", "_follow_redirects")

    def __init__(self, client: httpx.AsyncClient, *, timeout: Any, follow_redirects: Any):
        self._client = client
        self._timeout = timeout
        self._follow_redirects = follow_redirects

    def _defaults(self, kwargs: dict) -> dict:
        if self._timeout is not _UNSET:
            kwargs.setdefault("timeout", self._timeout)
        if self._follow_redirects is not _UNSET:
            kwargs.setdefault("follow_redirects", self._follow_redirects)
        return kwargs

    def get(self, url, **kwargs):
        return self._client.get(url, **self._defaults(kwargs))

    def post(self, url, **kwargs):
        return self._client.post(url, **self._defaults(kwargs))

    def put(self, url, **kwargs):
        return self._client.put(url, **self._defaults(kwargs))

    def delete(self, url, **kwargs):
        return self._client.delete(url, **self._defaults(kwargs))

    def patch(self, url, **kwargs):
        return self._client.patch(url, **self._defaults(kwargs))

    def head(self, url, **kwargs):
        return self._client.head(url, **self._defaults(kwargs))

    def request(self, method, url, **kwargs):
        return self._client.request(method, url, **self._defaults(kwargs))

    def stream(self, method, url, **kwargs):
        return self._client.stream(method, url, **self._defaults(kwargs))

    def send(self, request, **kwargs):
        return self._client.send(request, **kwargs)

    def build_request(self, method, url, **kwargs):
        return self._client.build_request(method, url, **self._defaults(kwargs))

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)


class _SharedHttpClientContext:
    """Async context manager returning a call-scoped ``_BoundHttpClient``.

    ``async with shared_http_client(timeout=X, follow_redirects=Y) as client:``
    behaves like ``async with httpx.AsyncClient(timeout=X,
    follow_redirects=Y) as client:`` from the call site's perspective, except
    no connection/TLS handshake is created and ``__aexit__`` never closes the
    process-wide shared client.
    """

    __slots__ = ("_timeout", "_follow_redirects")

    def __init__(self, *, timeout: Any = _UNSET, follow_redirects: Any = _UNSET):
        self._timeout = timeout
        self._follow_redirects = follow_redirects

    async def __aenter__(self) -> _BoundHttpClient:
        return _BoundHttpClient(
            get_http_client(),
            timeout=self._timeout,
            follow_redirects=self._follow_redirects,
        )

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        return None


def shared_http_client(*, timeout: Any = _UNSET, follow_redirects: Any = _UNSET) -> _SharedHttpClientContext:
    """Drop-in replacement for ``httpx.AsyncClient(timeout=..., follow_redirects=...)``.

    Use exactly like the constructor it replaces::

        async with shared_http_client(timeout=30) as client:
            response = await client.get(url)

    ``timeout``/``follow_redirects`` become the defaults for calls made
    through the returned proxy; per-call ``timeout=``/``follow_redirects=``
    arguments still take precedence, matching the original behavior of a
    dedicated ``httpx.AsyncClient`` instance.
    """
    return _SharedHttpClientContext(timeout=timeout, follow_redirects=follow_redirects)


async def open_http_client() -> httpx.AsyncClient:
    """Create the process-local shared client during application startup."""
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT

    client = httpx.AsyncClient(
        timeout=httpx.Timeout(
            connect=HTTP_CLIENT_TIMEOUT_CONNECT_SECONDS,
            read=HTTP_CLIENT_TIMEOUT_READ_SECONDS,
            write=HTTP_CLIENT_TIMEOUT_WRITE_SECONDS,
            pool=HTTP_CLIENT_TIMEOUT_POOL_SECONDS,
        ),
        limits=httpx.Limits(
            max_connections=HTTP_CLIENT_MAX_CONNECTIONS,
            max_keepalive_connections=HTTP_CLIENT_KEEPALIVE_CONNECTIONS,
        ),
        follow_redirects=False,
    )
    _CLIENT = client
    logger.info(
        "shared HTTP client opened",
        extra={
            "event": "http_client_opened",
            "max_connections": HTTP_CLIENT_MAX_CONNECTIONS,
            "max_keepalive_connections": HTTP_CLIENT_KEEPALIVE_CONNECTIONS,
        },
    )
    return client


def get_http_client() -> httpx.AsyncClient:
    """Module-level getter for non-route helper functions.

    Route handlers may also read ``request.app.state.http`` directly; both
    resolve to the same client instance.
    """
    client = _CLIENT
    if client is None:
        raise HttpClientUnavailableError("共享 HTTP 客户端尚未启动")
    return client


async def close_http_client() -> None:
    global _CLIENT
    client = _CLIENT
    _CLIENT = None
    if client is None:
        return
    await client.aclose()
    logger.info("shared HTTP client closed", extra={"event": "http_client_closed"})

