"""HTTP request context and structured access logging."""

from __future__ import annotations

import os
import re
import time
import uuid

from starlette.datastructures import Headers, MutableHeaders

from app.core.log_context import bind_log_context, reset_log_context, set_log_context
from app.core.logging import get_access_logger, get_logger


_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{8,128}$")
_QUIET_PATHS = {"/api/canvases", "/api/canvases/trash"}


def _header_id(value: str, prefix: str) -> str:
    value = str(value or "").strip()
    return value if _ID_PATTERN.fullmatch(value) else f"{prefix}_{uuid.uuid4().hex}"


def _is_quiet(path: str, status_code: int) -> bool:
    if status_code != 200:
        return False
    return path in _QUIET_PATHS or (path.startswith("/api/canvases/") and path.endswith("/meta"))


class RequestLoggingMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        request_id = _header_id(headers.get("x-request-id", ""), "req")
        trace_id = _header_id(headers.get("x-trace-id", ""), "trc")
        token = set_log_context(request_id=request_id, trace_id=trace_id)
        scope.setdefault("state", {})["request_id"] = request_id
        scope["state"]["trace_id"] = trace_id
        started = time.perf_counter()
        status_code = 500

        async def send_with_request_id(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                MutableHeaders(scope=message).append("X-Request-ID", request_id)
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            state = scope.get("state") or {}
            bind_log_context(user_id=state.get("user_id"), username=state.get("username"))
            get_logger("http").exception(
                "unhandled request exception",
                extra={"event": "request_unhandled_exception", "method": scope.get("method"), "path": scope.get("path")},
            )
            raise
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            path = scope.get("path") or ""
            state = scope.get("state") or {}
            bind_log_context(
                user_id=state.get("user_id"),
                username=state.get("username"),
            )
            if not _is_quiet(path, status_code):
                client = scope.get("client")
                client_ip = client[0] if client else None
                if os.getenv("LOG_TRUST_PROXY_HEADERS", "false").lower() in {"1", "true", "yes", "on"}:
                    client_ip = headers.get("x-forwarded-for", "").split(",", 1)[0].strip() or client_ip
                level = logging_level(status_code)
                get_access_logger().log(
                    level,
                    "request completed",
                    extra={
                        "event": "http_request",
                        "method": scope.get("method"),
                        "path": path,
                        "status_code": status_code,
                        "duration_ms": duration_ms,
                        "client_ip": client_ip,
                        "user_agent": headers.get("user-agent", "")[:512],
                    },
                )
            reset_log_context(token)


def logging_level(status_code: int) -> int:
    import logging

    if status_code >= 500:
        return logging.ERROR
    if status_code >= 400:
        return logging.WARNING
    return logging.INFO
