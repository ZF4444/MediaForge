"""Validation for administrator-configured outbound provider endpoints."""

from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urlsplit

from fastapi import HTTPException


def validate_public_http_url(value: str, *, label: str = "请求地址") -> str:
    """Return a normalized HTTP(S) URL only when it resolves to public IPs.

    Provider endpoints receive long-lived credentials. Rejecting private and
    special-use addresses prevents the provider configuration UI from becoming
    an internal-network request primitive.
    """
    text = str(value or "").strip().rstrip("/")
    parsed = urlsplit(text)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail=f"{label}必须是完整的 http:// 或 https:// 地址")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail=f"{label}不能包含用户名、密码、查询参数或片段")
    try:
        port = parsed.port
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{label}端口不合法") from exc
    if port is not None and not 1 <= port <= 65535:
        raise HTTPException(status_code=400, detail=f"{label}端口不合法")

    allowed_hosts = {
        host.strip().lower().rstrip(".")
        for host in os.getenv("AI_PROVIDER_ALLOWED_HOSTS", "").split(",")
        if host.strip()
    }
    hostname = parsed.hostname.lower().rstrip(".")
    try:
        addresses = {
            ipaddress.ip_address(item[4][0])
            for item in socket.getaddrinfo(hostname, port or 443, type=socket.SOCK_STREAM)
        }
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail=f"{label}域名无法解析") from exc
    if not addresses or (hostname not in allowed_hosts and any(not address.is_global for address in addresses)):
        raise HTTPException(status_code=400, detail=f"{label}不能指向内网、回环或保留地址")
    return text
