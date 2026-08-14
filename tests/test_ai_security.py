"""Security invariants for provider administration and outbound access."""

from __future__ import annotations

import socket

import pytest
from fastapi import HTTPException

from app.core import outbound


def _address(ip: str):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))]


def test_provider_endpoint_rejects_private_address(monkeypatch):
    monkeypatch.setattr(outbound.socket, "getaddrinfo", lambda *_args, **_kwargs: _address("127.0.0.1"))

    with pytest.raises(HTTPException, match="内网"):
        outbound.validate_public_http_url("http://127.0.0.1:8080")


def test_provider_endpoint_allows_public_address(monkeypatch):
    monkeypatch.setattr(outbound.socket, "getaddrinfo", lambda *_args, **_kwargs: _address("8.8.8.8"))

    assert outbound.validate_public_http_url("https://api.example.test/v1/") == "https://api.example.test/v1"


def test_private_provider_is_rejected_even_when_legacy_allowlist_is_set(monkeypatch):
    monkeypatch.setattr(outbound.socket, "getaddrinfo", lambda *_args, **_kwargs: _address("10.0.0.8"))
    monkeypatch.setenv("AI_PROVIDER_ALLOWED_HOSTS", "ai.internal.example")

    with pytest.raises(HTTPException, match="内网"):
        outbound.validate_public_http_url("https://ai.internal.example/v1")


def test_external_media_url_never_uses_provider_internal_allowlist(monkeypatch):
    monkeypatch.setattr(outbound.socket, "getaddrinfo", lambda *_args, **_kwargs: _address("10.0.0.8"))
    monkeypatch.setenv("AI_PROVIDER_ALLOWED_HOSTS", "ai.internal.example")

    with pytest.raises(HTTPException, match="内网"):
        outbound.validate_external_http_url("https://ai.internal.example/file.png")
