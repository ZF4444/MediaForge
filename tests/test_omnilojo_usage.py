from decimal import Decimal

from app.services import usage
from app.services.usage import _omnilojo_log_items, _omnilojo_request_ids, omnilojo_response_usage_values
from main import gemini_image_config, normalize_provider


def test_omnilojo_log_items_accepts_new_api_paginated_response():
    payload = {"success": True, "data": {"items": [{"id": 1, "quota": 500000}], "total": 1}}

    assert _omnilojo_log_items(payload) == [{"id": 1, "quota": 500000}]


def test_omnilojo_log_items_rejects_unsuccessful_response():
    try:
        _omnilojo_log_items({"success": False, "message": "forbidden"})
    except ValueError as exc:
        assert "forbidden" in str(exc)
    else:
        raise AssertionError("expected New API error to be surfaced")


def test_omnilojo_request_ids_support_top_level_and_embedded_log_fields():
    assert _omnilojo_request_ids({
        "request_id": "request-1",
        "other": '{"upstream_request_id":"upstream-1"}',
    }) == ("request-1", "upstream-1")


def test_omnilojo_provider_preserves_protocol_and_cash_conversion_settings():
    provider = normalize_provider({
        "id": "omnilojo-main", "name": "Omnilojo", "base_url": "",
        "protocol": "omnilojo", "omnilojo_quota_per_usd": 250000, "omnilojo_cny_per_usd": 7.15,
    })

    assert provider["protocol"] == "omnilojo"
    assert provider["omnilojo_quota_per_usd"] == 250000
    assert provider["omnilojo_cny_per_usd"] == 7.15


def test_omnilojo_provider_preserves_per_model_prices():
    provider = normalize_provider({
        "id": "omnilojo-main", "name": "Omnilojo", "base_url": "",
        "protocol": "omnilojo", "omnilojo_model_prices": {
            "gemini-3-pro-image": {"input_per_million": 2, "output_per_million": 120},
        },
    })

    assert provider["omnilojo_model_prices"] == {
        "gemini-3-pro-image": {"input_per_million": 2.0, "output_per_million": 120.0},
    }


def test_omnilojo_provider_requires_both_prices_for_enabled_models():
    try:
        normalize_provider({
            "id": "omnilojo-main", "name": "Omnilojo", "base_url": "", "protocol": "omnilojo",
            "image_models": ["gemini-3-pro-image"],
            "omnilojo_model_prices": {"gemini-3-pro-image": {"input_per_million": 2}},
        })
    except Exception as exc:
        assert "输入和输出单价" in str(exc.detail)
    else:
        raise AssertionError("expected missing output price to be rejected")


def test_legacy_omnilojo_provider_protocol_still_requires_model_prices():
    try:
        normalize_provider({
            "id": "omnilojo-main", "name": "Omnilojo", "base_url": "", "protocol": "omnilojo",
            "image_models": ["gemini-3-pro-image"],
        })
    except Exception as exc:
        assert "输入和输出单价" in str(exc.detail)
    else:
        raise AssertionError("expected missing model price to be rejected after protocol migration")


def test_omnilojo_image_request_uses_google_image_size_and_nearest_ratio():
    assert gemini_image_config("2048x1024") == {"aspectRatio": "16:9", "imageSize": "2K"}


def test_omnilojo_response_usage_calculates_model_pricing():
    values = omnilojo_response_usage_values(
        {"omnilojo_model_prices": {
            "gemini-3-pro-image": {"input_per_million": 2, "output_per_million": 120},
        }},
        "gemini-3-pro-image",
        {"prompt_tokens": 12, "completion_tokens": 1293},
    )

    assert values["cost_usd"] == Decimal("0.155184")
    assert values["configured"] is True


def test_omnilojo_response_usage_without_price_retains_tokens_without_charging():
    values = omnilojo_response_usage_values({}, "unknown", {"prompt_tokens": 2, "completion_tokens": 3})

    assert values["prompt_tokens"] == 2
    assert values["completion_tokens"] == 3
    assert values["cost_usd"] == Decimal("0")
    assert values["configured"] is False


def test_record_omnilojo_response_usage_does_not_require_cursor_rowcount(monkeypatch):
    class Cursor:
        def __init__(self):
            self.calls = 0

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, *_args):
            self.calls += 1

        def fetchone(self):
            return {"org_id": "org-1"} if self.calls == 1 else {"id": "usage-1"}

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return Cursor()

    monkeypatch.setattr(usage, "metadata_connection", lambda: Connection())

    inserted = usage.record_omnilojo_response_usage(
        "user-1", {"id": "provider-1"}, "image-model",
        {"id": "request-1", "usage": {"prompt_tokens": 3, "completion_tokens": 5}},
        operation="image_generation",
    )

    assert inserted is True
