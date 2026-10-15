from contextlib import contextmanager
from decimal import Decimal

import pytest

from app.services import usage
from app.services.video_billing import (
    has_video_input,
    record_video_response_usage,
    validate_video_token_prices,
    video_billing_context,
)


@pytest.mark.parametrize("resolution", ["480p", "720p", "1080p", "4k"])
@pytest.mark.parametrize("with_video", [False, True])
def test_price_matrix_and_cost(resolution, with_video, monkeypatch):
    settings = {"video_token_prices": {resolution: {"with_video": 20, "without_video": 10}}}
    context = video_billing_context(
        settings,
        {
            "resolution": resolution.upper(),
            "videos": ["https://example.com/ref.mp4"] if with_video else [],
        },
    )
    captured = {}

    def record(user, provider, model, raw, **kwargs):
        captured.update(usage.openai_response_usage_values(provider, model, raw["usage"]))
        captured.update(kwargs)
        assert user == "user-1" and raw["id"] == "task-1"
        return True

    monkeypatch.setattr(usage, "record_openai_response_usage", record)
    assert record_video_response_usage(
        "user-1",
        {"id": "c"},
        "seedance",
        {
            "usage": {"total_tokens": 100000, "completion_tokens": 80000},
        },
        context,
        "task-1",
    )
    assert captured["cost_usd"] == Decimal("2" if with_video else "1")
    assert captured["billing_context"]["has_video_input"] is with_video
    assert captured["configured"] is True


@pytest.mark.parametrize(
    ("videos", "expected"),
    [
        ([], False),
        ([" ", ""], False),
        (["data:image/png;base64,abc"], False),
        (["https://example.com/image.PNG?x=1"], False),
        (["asset://123"], True),
        (["/api/files/input/ref.mp4"], True),
        (["", "", "", "https://example.com/ref.mp4"], False),
    ],
)
def test_video_reference_filter_matches_submission(videos, expected):
    assert has_video_input({"videos": videos}) is expected


def test_unconfigured_is_distinct_from_free():
    assert not video_billing_context({}, {"resolution": "720p"})["configured"]
    free = video_billing_context({"video_token_prices": {"720p": {"without_video": 0}}}, {"resolution": "720p"})
    assert free["configured"] and free["per_million"] == "0"
    assert not video_billing_context({"output_per_million": 99}, {"resolution": "720p"})["configured"]


@pytest.mark.parametrize(
    "prices",
    [
        [],
        {"8k": {}},
        {"720p": {"other": 1}},
        {"720p": {"with_video": -1}},
        {"720p": {"with_video": "NaN"}},
        {"720p": {"with_video": "Infinity"}},
        {"720p": {"with_video": "abc"}},
    ],
)
def test_rejects_invalid_prices(prices):
    with pytest.raises(ValueError):
        validate_video_token_prices(prices)


def test_missing_usage_does_not_create_zero_charge(monkeypatch):
    monkeypatch.setattr(usage, "record_openai_response_usage", lambda *a, **k: pytest.fail("unexpected charge"))
    assert not record_video_response_usage("u", {}, "m", {}, {}, "task")
    assert not record_video_response_usage("u", {}, "m", {"usage": {}}, {}, "task")


def test_video_ledger_is_idempotent_and_keeps_price_snapshot(monkeypatch):
    rows = {}
    inserted = []

    class Cursor:
        def execute(self, sql, params):
            self.result = None
            if "SELECT org_id" in sql:
                return
            if "SELECT id FROM ai_models" in sql:
                self.result = {"id": "model-1"}
            if "INSERT INTO ai_usage_records" in sql:
                assert "DO NOTHING" in sql
                key = params[1:4]
                if key not in rows:
                    rows[key] = params
                    inserted.append(params)
                    self.result = {"id": params[0]}

        def fetchone(self):
            return self.result

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    class Connection:
        def cursor(self):
            return Cursor()

    @contextmanager
    def connection():
        yield Connection()

    monkeypatch.setattr(usage, "metadata_connection", connection)
    provider = {"id": "cloud", "protocol": "openai"}
    context = video_billing_context({"video_token_prices": {"720p": {"without_video": 10}}}, {"resolution": "720p"})
    raw = {"usage": {"total_tokens": 100000}}
    assert record_video_response_usage("u", provider, "seedance", raw, context, "task-1")
    changed = {**context, "per_million": "99"}
    assert not record_video_response_usage("u", provider, "seedance", raw, changed, "task-1")
    assert len(inserted) == 1
    assert inserted[0][11] == "1"
    assert "10" in str(inserted[0][-3])


def test_saved_request_and_price_snapshot_are_used(monkeypatch):
    import asyncio

    import main
    from app.ai.domain import Connection, ModelResource, ResolvedTarget
    from app.ai.videos import VideoGateway
    from app.core.log_context import reset_log_context, set_log_context

    original = video_billing_context(
        {"video_token_prices": {"720p": {"with_video": 20}}},
        {
            "resolution": "720p",
            "videos": ["https://example.com/ref.mp4"],
        },
    )
    task = {"owner_id": "owner", "billing_context": original, "request": {"videos": ["https://example.com/ref.mp4"]}}
    target = ResolvedTarget(
        Connection("c", "openai", "Cloudwise", "https://api.cloudwise.ai", True),
        model=ModelResource(
            "m",
            "c",
            "seedance",
            "video",
            "openai",
            settings={
                "video_token_prices": {"720p": {"with_video": 999}},
            },
        ),
    )

    async def get_task(task_id):
        assert task_id == "local-task"
        return task

    async def generate(self, command, **kwargs):
        return await self._target_handler(command)

    async def impl(payload, provider):
        assert provider["billing_context"] == original
        assert provider["billing_user_id"] == "owner"
        assert provider["billing_task_id"] == "local-task"
        return {"ok": True}

    monkeypatch.setattr(main, "get_canvas_task", get_task)
    monkeypatch.setattr(main, "_canvas_video_impl", impl)
    monkeypatch.setattr(VideoGateway, "generate_target", generate)
    token = set_log_context(task_id="local-task")
    try:
        assert asyncio.run(main._run_video_generation(main.CanvasVideoRequest(prompt="x"), target)) == {"ok": True}
    finally:
        reset_log_context(token)


def test_image_asset_in_video_list_is_not_video_input():
    assert not has_video_input({"images": [{"url": "asset://image"}], "videos": ["asset://image"]})


@pytest.mark.parametrize(("value", "expected"), [("", "480p"), ("auto", "480p"), ("720", "720p"), (" 4K ", "4k")])
def test_resolution_normalization_matches_submission(value, expected):
    assert video_billing_context({}, {"resolution": value})["resolution"] == expected
