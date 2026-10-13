import pytest
from pydantic import ValidationError

from app.services.canvas_agent.schemas import SemanticPlan


def test_plan_mode_is_absent_from_model_schema_and_serialized_plan():
    assert "mode" not in SemanticPlan.model_fields
    assert "mode" not in SemanticPlan.model_json_schema()["properties"]
    assert "mode" not in SemanticPlan(goal="create visual").model_dump()


def test_retired_plan_mode_is_rejected():
    with pytest.raises(ValidationError):
        SemanticPlan.model_validate({"goal": "create visual", "mode": "fast_track"})
    with pytest.raises(ValidationError):
        SemanticPlan.model_validate_json('{"goal":"create visual","mode":"fast_track"}')


def test_other_unknown_plan_fields_are_still_rejected():
    with pytest.raises(ValidationError):
        SemanticPlan.model_validate({"goal": "create visual", "unknown": True})
