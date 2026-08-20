import asyncio
import threading

import main
from app.services import business_metadata
from fastapi import HTTPException


def test_provider_version_lookup_runs_off_the_application_event_loop(monkeypatch):
    request_thread = threading.get_ident()

    def get_setting(_key, _default):
        assert threading.get_ident() != request_thread
        return [], 7

    monkeypatch.setattr(business_metadata, "get_app_setting_with_version", get_setting)
    monkeypatch.setattr(main, "public_api_providers", lambda **_kwargs: [])

    response = asyncio.run(main.api_providers())

    assert response == {"providers": [], "version": 7}


def test_disabled_provider_skips_base_url_dns_validation(monkeypatch):
    validated = []

    def validate(value, *, label):
        validated.append((value, label))
        return value

    monkeypatch.setattr(main, "validate_public_http_url", validate)

    disabled = main.normalize_provider({
        "id": "modelscope", "name": "ModelScope", "enabled": False,
        "base_url": "https://api-inference.modelscope.cn/v1",
    })
    enabled = main.normalize_provider({
        "id": "modelscope", "name": "ModelScope", "enabled": True,
        "base_url": "https://api-inference.modelscope.cn/v1",
    })

    assert disabled["enabled"] is False
    assert enabled["enabled"] is True
    assert validated == [
        ("https://api-inference.modelscope.cn/v1", "ModelScope 的 Base URL"),
    ]


def test_explicit_unknown_provider_never_falls_back_to_primary(monkeypatch):
    monkeypatch.setattr(main, "load_api_providers", lambda: [
        {"id": "comfyui", "enabled": True, "base_url": "", "chat_models": []},
    ])
    monkeypatch.setattr(main, "refresh_api_providers_cache", lambda: main.load_api_providers())
    try:
        main.resolve_chat_provider("custom-api-2", "gpt-5.6")
    except HTTPException as exc:
        assert "未找到 API 平台：custom-api-2" in str(exc.detail)
    else:
        raise AssertionError("unknown explicit provider fell back to primary")

def test_api_headers_reads_encrypted_provider_key(monkeypatch):
    provider = {"id": "custom-api-2", "protocol": "openai"}
    monkeypatch.setattr(main, "provider_env_key_value", lambda provider_id: "stored-secret")
    headers = main.api_headers(provider=provider, model="gpt-5.6")
    assert headers["Authorization"] == "Bearer stored-secret"
