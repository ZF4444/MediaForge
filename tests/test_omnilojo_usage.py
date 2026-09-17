from decimal import Decimal

from app.services import usage
from app.services.usage import _omnilojo_log_items, _omnilojo_request_ids, omnilojo_response_usage_values
from app.ai.transport import gemini_image_options


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


def test_omnilojo_image_request_uses_google_image_size_and_nearest_ratio():
    assert gemini_image_options("2048x1024") == {"aspectRatio": "16:9", "imageSize": "2K"}


def test_gemini_image_options_supports_21_9_ratio():
    # nano-banana / Gemini expose native 21:9. Wide sizes must resolve to 21:9
    # instead of snapping to the nearest previously-known 16:9 ratio.
    assert gemini_image_options("1584x672")["aspectRatio"] == "21:9"
    assert gemini_image_options("3168x1344")["aspectRatio"] == "21:9"


def test_gemini_image_options_tall_source_snaps_to_supported_ratio():
    # The upstream accepts the wide 21:9 but rejects the tall 9:21. A near-9:21
    # portrait input under source/auto must snap to the nearest supported ratio
    # (9:16) rather than emitting an unsupported 9:21.
    assert gemini_image_options("672x1584")["aspectRatio"] == "9:16"
    assert gemini_image_options("900x2100")["aspectRatio"] == "9:16"


def test_gemini_image_options_from_settings_passes_enums_directly():
    from app.ai.transport import gemini_image_options_from_settings
    # Canvas enums map straight to Gemini options without a pixel round-trip.
    assert gemini_image_options_from_settings("1k", "21:9") == {"aspectRatio": "21:9", "imageSize": "1K"}
    assert gemini_image_options_from_settings("4k", "1:1") == {"aspectRatio": "1:1", "imageSize": "4K"}
    # Unsupported/custom inputs return None so callers fall back to pixel size.
    assert gemini_image_options_from_settings("custom", "1:1") is None
    assert gemini_image_options_from_settings("1k", "7:3") is None


def test_gemini_image_options_classifies_tier_by_area_not_long_edge():
    # The image tier is a pixel budget, not a fixed edge length. A wide 1K
    # image (1584x672) has a long edge > 1500 but stays 1K by area; the old
    # long-edge rule wrongly promoted it to 2K.
    assert gemini_image_options("1584x672")["imageSize"] == "1K"
    assert gemini_image_options("3168x1344")["imageSize"] == "2K"
    assert gemini_image_options("6336x2688")["imageSize"] == "4K"
    # Square tiers remain unchanged.
    assert gemini_image_options("1024x1024")["imageSize"] == "1K"
    assert gemini_image_options("2048x2048")["imageSize"] == "2K"
    assert gemini_image_options("4096x4096")["imageSize"] == "4K"


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
