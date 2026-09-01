import asyncio
import threading

import main
import pytest
from app.services import business_metadata


def test_api_headers_use_preloaded_connection_secret(monkeypatch):
    monkeypatch.setattr(main, "connection_api_key", lambda _connection_id: (_ for _ in ()).throw(AssertionError("sync secret lookup")))

    headers = main.api_headers(connection={"id": "banana", "protocol": "openai", "api_key": "secret"})

    assert headers["Authorization"] == "Bearer secret"


def test_api_headers_reject_missing_key_without_sync_secret_lookup(monkeypatch):
    """A connection without a preloaded key must not cross the sync DB bridge.

    ``api_headers`` runs on the event loop, where ``database_connection_sync``
    raises RuntimeError. Reading the secret there turned "API Key 未配置" into an
    opaque event-loop error for canvas image tasks.
    """
    monkeypatch.setattr(main, "connection_api_key", lambda _connection_id: (_ for _ in ()).throw(AssertionError("sync secret lookup")))

    with pytest.raises(main.HTTPException) as excinfo:
        main.api_headers(connection={"id": "legacy:custom-api-2", "connection_id": "legacy:custom-api-2", "name": "Omnilojo", "protocol": "omnilojo"})

    assert excinfo.value.status_code == 400
    assert "API Key" in str(excinfo.value.detail)


def test_runninghub_image_adapter_uses_preloaded_key(monkeypatch):
    """The RunningHub image adapter must reuse the gateway-preloaded secret."""
    from app.ai.registry import ImageGenerationRequest

    monkeypatch.setattr(main, "connection_api_key", lambda _connection_id: (_ for _ in ()).throw(AssertionError("sync secret lookup")))
    request = ImageGenerationRequest(prompt="hi", size="1024x1024", quality="", model="app-1", reference_images=[], connection={"connection_id": "legacy:runninghub"})

    with pytest.raises(main.HTTPException) as excinfo:
        asyncio.run(main._image_adapter_runninghub(request))

    assert excinfo.value.status_code == 400
    assert "RunningHub API Key" in str(excinfo.value.detail)


def test_cloudwise_openai_image_endpoints_accept_host_only_base_url():
    provider = {"id": "cloudwise", "base_url": "https://api.cloudwise.ai"}
    assert main.connection_endpoint_url(provider, "image_generation_endpoint", "/v1/images/generations") == "https://api.cloudwise.ai/api/v1/images/generations"
    assert main.connection_endpoint_url(provider, "image_edit_endpoint", "/v1/images/edits") == "https://api.cloudwise.ai/api/v1/images/edits"
    assert main.is_cloudwise_connection(provider) is True

    aliased = {"id": "gpt-image-cloud", "base_url": "https://api.cloudwise.ai/api/v1"}
    assert main.connection_endpoint_url(aliased, "image_generation_endpoint", "/v1/images/generations") == "https://api.cloudwise.ai/api/v1/images/generations"
    assert main.is_cloudwise_connection(aliased) is True


def test_transport_model_headers_normalize_runninghub_bearer_case():
    from app.ai.transport import model_headers

    assert model_headers("bEaReR secret", "runninghub")["Authorization"] == "secret"


def test_cloudwise_model_discovery_uses_documented_fixed_gpt_image_model():
    result = asyncio.run(main.fetch_models_from_upstream("https://api.cloudwise.ai", "test-key", "openai"))
    assert result["image_models"] == ["gpt-image-2"]
    assert result["chat_models"] == []


def test_parameter_schema_only_applies_model_overrides():
    from app.services.ai_parameters import capability_parameters

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


def test_parameter_schema_is_loaded_from_persisted_model_settings(monkeypatch):
    from app.ai.domain import Connection, ModelResource, ResolvedTarget
    from app.services.ai_parameters import capability_parameters

    target = ResolvedTarget(
        connection=Connection(id="conn", protocol="openai", name="Connection", base_url="", enabled=True),
        model=ModelResource(
            id="model-id", connection_id="conn", upstream_model="image-model", kind="image", protocol="openai",
            settings={"parameter_schema": {"image": {"fields": [{"id": "quality", "name": "画质等级", "options": ["low", "high"], "option_labels": ["省钱", "旗舰"], "default": "high"}]}}},
        ),
    )

    class FakeRepository:
        def resolve_model(self, **kwargs):
            return target

    monkeypatch.setattr("app.ai.database_repository.DatabaseAIRepository", FakeRepository)
    fields = capability_parameters(capability="image.text_to_image", model_id="model-id")["fields"]
    quality = next(field for field in fields if field["id"] == "quality")
    assert quality["name"] == "画质等级"
    assert quality["option_labels"] == ["省钱", "旗舰"]
    assert quality["default"] == "high"


def test_image_ratio_schema_uses_readable_values(monkeypatch):
    from app.services.ai_parameters import capability_parameters, validate_run_settings

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
    from app.services.ai_parameters import capability_parameters, normalize_parameter_schema, validate_run_settings

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
    from app.services.ai_parameters import normalize_parameter_schema

    with pytest.raises(ValueError, match="not supported"):
        normalize_parameter_schema({"models": {"model": {"image": {"fields": [{"id": "seed"}]}}}})
    with pytest.raises(ValueError, match="cannot override"):
        normalize_parameter_schema({"models": {"model": {"image": {"fields": [{"id": "count", "execution": {}}]}}}})
