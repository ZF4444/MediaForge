import asyncio
import threading

import main
import pytest
from app.services import business_metadata
from fastapi import HTTPException


def test_parameter_schema_only_applies_model_overrides():
    from app.services.provider_parameters import capability_parameters

    provider = {
        "id": "example", "enabled": True, "image_models": ["base", "pro"],
        "parameter_schema": {
            "image": {"fields": [
                {"id": "quality", "options": ["low", "high"], "default": "low"},
                {"id": "count", "max": 2},
            ]},
            "models": {"pro": {"image": {"fields": [
                {"id": "quality", "options": ["medium", "high"], "default": "high"},
                {"id": "count", "max": 2},
            ]}}},
        },
    }

    resolved = capability_parameters(
        capability="image.text_to_image", provider_id="example", model="pro",
        provider_loader=lambda: [provider],
    )
    fields = {field["id"]: field for field in resolved["fields"]}

    assert fields["quality"]["options"] == ["medium", "high"]
    assert fields["quality"]["default"] == "high"
    assert fields["count"]["max"] == 2
    assert "seed" not in fields
    assert resolved["source"] == ["system.default", "provider.parameter_schema.models"]


def test_normalize_provider_keeps_only_model_parameter_schema():
    provider = main.normalize_provider({
        "id": "schema-test", "name": "Schema Test", "enabled": False,
        "parameter_schema": {
            "video": {"fields": [{"id": "videoResolution", "options": ["720p"]}]},
            "models": {"video-model": {"video": {"fields": [{"id": "videoResolution", "options": ["1080p"]}]}}},
        },
    })

    assert provider["parameter_schema"] == {
        "models": {"video-model": {"video": {"fields": [{"id": "videoResolution", "options": ["1080p"]}]}}}
    }


def test_provider_cache_keeps_valid_entries_when_one_saved_provider_is_invalid(monkeypatch):
    valid = {"id": "custom-api-2", "enabled": True, "image_models": ["image-model"]}
    invalid = {"id": "invalid-provider", "enabled": True, "parameter_schema": "invalid"}

    cached = main._normalized_provider_cache([invalid, valid], [])

    assert [item["id"] for item in cached] == ["custom-api-2"]


def test_explicit_provider_resolution_refreshes_a_cold_cache(monkeypatch):
    provider = {"id": "custom-api-2", "enabled": True, "base_url": "https://example.test", "chat_models": ["chat-model"]}
    monkeypatch.setattr(main, "load_api_providers", lambda: [])
    monkeypatch.setattr(main, "refresh_api_providers_cache", lambda: [provider])

    assert main.get_api_provider_exact("custom-api-2") == provider


def test_canvas_parameter_schema_endpoint_uses_refreshed_provider_configuration(monkeypatch):
    provider = {
        "id": "custom-api-2", "enabled": True, "image_models": ["gemini-3-pro-image-preview"],
        "parameter_schema": {"models": {"gemini-3-pro-image-preview": {"image": {"fields": [{
            "id": "resolution", "options": ["1k", "2k", "4k"], "option_labels": ["1P", "2P", "4P"],
        }]}}}},
    }
    monkeypatch.setattr(main, "refresh_api_providers_cache", lambda: [provider])

    schema = asyncio.run(main.canvas_capability_parameters(
        capability="image.text_to_image", provider_id="custom-api-2", model="gemini-3-pro-image-preview",
    ))
    resolution = next(field for field in schema["fields"] if field["id"] == "resolution")

    assert schema["source"] == ["system.default", "provider.parameter_schema.models"]
    assert resolution["option_labels"] == ["1P", "2P", "4P"]


def test_merge_defaults_does_not_restore_deleted_optional_provider(monkeypatch):
    runninghub = next(item for item in main.default_api_providers() if item["id"] == "runninghub")
    monkeypatch.setattr(main, "load_static_runninghub_provider", lambda: runninghub)

    merged = main.merge_default_api_providers([
        {"id": "runninghub", "base_url": runninghub["base_url"], "protocol": "runninghub"},
        {"id": "comfyui", "base_url": "", "protocol": "openai"},
    ])

    assert {item["id"] for item in merged} == {"runninghub", "comfyui"}


def test_canvas_image_request_is_normalized_from_raw_run_settings(monkeypatch):
    monkeypatch.setattr(main, "load_api_providers", lambda: [{
        "id": "custom-api-2", "enabled": True, "image_models": ["image-model"], "video_models": ["video-model"],
    }])
    payload = main.OnlineImageRequest(
        prompt="test",
        run_settings={
            "provider_id": "custom-api-2", "model": "image-model",
            "resolution": "2k", "ratio": "16:9", "quality": "high", "count": "3",
        },
    )

    normalized = main.normalize_canvas_image_request(payload)

    assert normalized.provider_id == "custom-api-2"
    assert normalized.model == "image-model"
    assert normalized.size == "2048x1152"
    assert normalized.quality == "high"
    assert normalized.n == 3


def test_canvas_video_request_is_normalized_from_raw_run_settings(monkeypatch):
    monkeypatch.setattr(main, "load_api_providers", lambda: [{
        "id": "custom-api-2", "enabled": True, "image_models": ["image-model"], "video_models": ["video-model"],
    }])
    payload = main.CanvasVideoRequest(
        prompt="test",
        run_settings={
            "videoProvider": "custom-api-2", "videoModel": "video-model",
            "videoDuration": "10", "videoAspect": "9:16", "videoResolution": "720p",
            "videoGenerateAudio": "true", "videoMultimodal": "false",
        },
    )

    normalized = main.normalize_canvas_video_request(payload)

    assert normalized.provider_id == "custom-api-2"
    assert normalized.model == "video-model"
    assert normalized.duration == 10
    assert normalized.aspect_ratio == "9:16"
    assert normalized.resolution == "720p"
    assert normalized.generate_audio is True
    assert normalized.multimodal is False


def test_canvas_runtime_ignores_fields_not_declared_by_parameter_schema(monkeypatch):
    monkeypatch.setattr(main, "load_api_providers", lambda: [{
        "id": "custom-api-2", "enabled": True, "image_models": ["image-model"],
    }])
    payload = main.OnlineImageRequest(
        prompt="test", size="512x512", quality="auto", n=1,
        run_settings={
            "provider_id": "custom-api-2", "model": "image-model", "resolution": "1k", "ratio": "1:1",
            "quality": "medium", "count": 2, "size": "9999x9999", "n": 99,
        },
    )

    normalized = main.normalize_canvas_image_request(payload)

    assert normalized.size == "1024x1024"
    assert normalized.quality == "medium"
    assert normalized.n == 2


def test_image_ratio_schema_uses_readable_values(monkeypatch):
    from app.services.provider_parameters import capability_parameters, validate_run_settings

    providers = lambda: [{"id": "custom-api-2", "enabled": True, "image_models": ["image-model"]}]
    fields = capability_parameters(
        capability="image.text_to_image", provider_id="custom-api-2", model="image-model", provider_loader=providers,
    )["fields"]
    ratio = next(field for field in fields if field["id"] == "ratio")
    assert ratio["default"] == "1:1"
    assert "16:9" in ratio["options"]

    values = validate_run_settings(
        kind="image", provider_id="custom-api-2", model="image-model",
        settings={"provider_id": "custom-api-2", "model": "image-model", "ratio": "16:9"}, provider_loader=providers,
    )["values"]
    assert values["ratio"] == "16:9"


def test_parameter_schema_option_labels_are_display_only(monkeypatch):
    from app.services.provider_parameters import capability_parameters, normalize_parameter_schema, validate_run_settings

    schema = normalize_parameter_schema({"models": {"image-model": {"image": {"fields": [{
        "id": "quality", "options": ["low", "high"], "option_labels": ["省钱", "高质量"], "default": "high",
    }]}}}})
    provider = {"id": "custom-api-2", "enabled": True, "image_models": ["image-model"], "parameter_schema": schema}
    field = next(field for field in capability_parameters(
        capability="image.text_to_image", provider_id="custom-api-2", model="image-model", provider_loader=lambda: [provider],
    )["fields"] if field["id"] == "quality")
    assert field["option_labels"] == ["省钱", "高质量"]
    values = validate_run_settings(
        kind="image", provider_id="custom-api-2", model="image-model",
        settings={"provider_id": "custom-api-2", "model": "image-model", "quality": "high"}, provider_loader=lambda: [provider],
    )["values"]
    assert values["quality"] == "high"

    with pytest.raises(ValueError, match="option_labels must match options length"):
        normalize_parameter_schema({"models": {"image-model": {"image": {"fields": [{
            "id": "quality", "options": ["low", "high"], "option_labels": ["省钱"],
        }]}}}})


def test_parameter_schema_rejects_unknown_or_execution_overrides():
    from app.services.provider_parameters import normalize_parameter_schema

    with pytest.raises(ValueError, match="not supported"):
        normalize_parameter_schema({"models": {"model": {"image": {"fields": [{"id": "seed"}]}}}})
    with pytest.raises(ValueError, match="cannot override"):
        normalize_parameter_schema({"models": {"model": {"image": {"fields": [{"id": "count", "execution": {}}]}}}})


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
