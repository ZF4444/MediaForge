"""Validation for administrator-configured outbound provider endpoints."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

from fastapi import HTTPException


class OutboundAddressError(ValueError):
    """The destination cannot be safely reached through direct egress."""


def resolve_public_host_addresses(hostname: str, port: int) -> tuple[str, ...]:
    """Resolve a host once and return only globally routable addresses.

    The HTTP transport connects to these literal addresses, rather than asking
    the resolver a second time after validation. This closes DNS rebinding for
    direct egress while preserving the original hostname for TLS SNI.
    """
    try:
        addresses = {
            ipaddress.ip_address(item[4][0])
            for item in socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        }
    except socket.gaierror as exc:
        raise OutboundAddressError("域名无法解析") from exc
    if not addresses or any(not address.is_global for address in addresses):
        raise OutboundAddressError("不能指向内网、回环或保留地址")
    return tuple(str(address) for address in sorted(addresses, key=str))


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

    hostname = parsed.hostname.lower().rstrip(".")
    try:
        resolve_public_host_addresses(hostname, port or (443 if parsed.scheme == "https" else 80))
    except OutboundAddressError as exc:
        raise HTTPException(status_code=400, detail=f"{label}{exc}") from exc
    return text


def validate_external_http_url(value: str, *, label: str = "外部地址") -> str:
    """Validate a user- or upstream-supplied media URL without intranet exceptions."""
    return validate_public_http_url(value, label=label)
