from decimal import Decimal

from app.services.usage import openai_response_usage_values


def test_openai_response_usage_values_prices_tokens_and_cache():
    values = openai_response_usage_values(
        {"model_prices": {"gpt-test": {"input_per_million": 2, "cached_input_per_million": 0.5, "output_per_million": 8}}},
        "gpt-test",
        {"prompt_tokens": 1000, "completion_tokens": 500, "total_tokens": 1500, "prompt_tokens_details": {"cached_tokens": 200}},
    )
    assert values["total_tokens"] == 1500
    assert values["cached_tokens"] == 200
    assert values["configured"] is True
    assert values["cost_usd"] == Decimal("0.0057")


def test_openai_response_usage_values_without_usage_price_is_zero_cost():
    values = openai_response_usage_values({}, "unknown", {"input_tokens": 12, "output_tokens": 3})
    assert values["total_tokens"] == 15
    assert values["cost_usd"] == Decimal("0")
    assert values["configured"] is False


def test_openai_response_usage_values_prices_text_image_and_output_separately():
    values = openai_response_usage_values(
        {"model_prices": {"vision-model": {"text_input_per_million": 1, "image_input_per_million": 3, "output_per_million": 5}}},
        "vision-model",
        {"prompt_tokens": 1000, "text_tokens": 700, "image_tokens": 300, "completion_tokens": 200},
    )
    assert values["text_input_tokens"] == 700
    assert values["image_input_tokens"] == 300
    assert values["cost_usd"] == Decimal("0.0026")
