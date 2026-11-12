import json
import math

import pytest

from app.services import business_metadata
from app.services.business_metadata import normalize_canvas_viewport


def test_valid_viewport_is_unchanged():
    viewport = {"x": -120.5, "y": 300, "scale": 1.25}
    assert normalize_canvas_viewport(viewport) == viewport


@pytest.mark.parametrize("scale", [0.06, 4, 4.0])
def test_scale_boundaries_are_kept(scale):
    assert normalize_canvas_viewport({"x": 0, "y": 0, "scale": scale})["scale"] == scale


@pytest.mark.parametrize(
    ("scale", "expected"),
    [
        (0.00005, 0.06),
        (1e-300, 0.06),
        (0.0599, 0.06),
        (4.0001, 4.0),
        (1000, 4.0),
        (1e300, 4.0),
    ],
)
def test_out_of_range_scale_is_clamped(scale, expected):
    assert normalize_canvas_viewport({"x": 0, "y": 0, "scale": scale})["scale"] == expected


@pytest.mark.parametrize("scale", [0, -1, -0.5, math.nan, math.inf, -math.inf, "0.5", "abc", None, True, [], {}])
def test_invalid_scale_falls_back_to_one(scale):
    assert normalize_canvas_viewport({"x": 0, "y": 0, "scale": scale})["scale"] == 1


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf, "10", None, True, [], {}])
def test_invalid_x_and_y_fall_back_to_zero(value):
    result = normalize_canvas_viewport({"x": value, "y": value, "scale": 1})
    assert result["x"] == 0
    assert result["y"] == 0


def test_huge_integer_does_not_raise():
    result = normalize_canvas_viewport({"x": 10**400, "y": 0, "scale": 10**400})
    assert result["x"] == 0
    assert result["scale"] == 1


def test_missing_keys_stay_missing_and_unknown_keys_are_kept():
    assert normalize_canvas_viewport({}) == {}
    assert normalize_canvas_viewport({"scale": 0.00005}) == {"scale": 0.06}
    assert normalize_canvas_viewport({"x": 1, "y": 2, "scale": 1, "extra": "keep"})["extra"] == "keep"


@pytest.mark.parametrize("viewport", [None, [], "x", 3, True])
def test_non_dict_viewport_becomes_empty_dict(viewport):
    assert normalize_canvas_viewport(viewport) == {}


def test_input_is_not_mutated():
    viewport = {"x": math.nan, "y": 0, "scale": 0.00005}
    normalize_canvas_viewport(viewport)
    assert math.isnan(viewport["x"])
    assert viewport["scale"] == 0.00005


def _save_and_capture_viewport(monkeypatch, canvas):
    captured = {}

    class Cursor:
        def execute(self, query, params=()):
            if "INSERT INTO smart_canvases" in query:
                captured["meta"] = json.loads(params[10])

        def fetchall(self):
            return []

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

    class Connection:
        def cursor(self):
            return Cursor()

        def transaction(self):
            return self

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

    monkeypatch.setattr(business_metadata, "metadata_connection", lambda: Connection())
    business_metadata.save_canvas_payload("user1", canvas)
    return captured["meta"]


def _canvas(viewport):
    return {"id": "canvas1", "title": "demo", "created_at": 1, "updated_at": 2, "nodes": [], "viewport": viewport}


def test_save_canvas_payload_clamps_viewport(monkeypatch):
    meta = _save_and_capture_viewport(monkeypatch, _canvas({"x": -123456, "y": 98765, "scale": 0.00005}))
    assert meta["viewport"] == {"x": -123456, "y": 98765, "scale": 0.06}


def test_save_canvas_payload_replaces_non_finite_values(monkeypatch):
    # json.dumps writes NaN/Infinity as non-standard tokens that PostgreSQL JSONB rejects.
    meta = _save_and_capture_viewport(monkeypatch, _canvas({"x": math.nan, "y": math.inf, "scale": math.nan}))
    assert meta["viewport"] == {"x": 0, "y": 0, "scale": 1}


def test_save_canvas_payload_keeps_valid_viewport_and_other_payload(monkeypatch):
    canvas = _canvas({"x": 10, "y": 20, "scale": 0.8})
    canvas["settings"] = {"model": "m1"}
    meta = _save_and_capture_viewport(monkeypatch, canvas)
    assert meta["viewport"] == {"x": 10, "y": 20, "scale": 0.8}
    assert meta["payload"] == {"settings": {"model": "m1"}}


def test_save_canvas_payload_without_viewport_stays_empty(monkeypatch):
    canvas = {"id": "canvas1", "title": "demo", "created_at": 1, "updated_at": 2, "nodes": []}
    assert _save_and_capture_viewport(monkeypatch, canvas)["viewport"] == {}
