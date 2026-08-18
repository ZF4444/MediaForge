import pytest

from app.services.canvas_agent.artifacts import ARTIFACT_STAGES, compile_prompt, normalize_anchors, validate_stage
from app.services.canvas_agent.doc_chain import validate_stage_sources
from app.services.canvas_agent.skills import get_skill, list_skill_summaries, read_skill


def test_doc_chain_stages_and_anchor_normalization():
    assert ARTIFACT_STAGES == ("brief", "creative_direction", "script", "asset_anchors", "shot_list", "prompt_pack")
    anchors = normalize_anchors({"characters": {"name": "Hero", "wardrobe": "blue"}, "style": [{"name": "clean"}]})
    assert anchors["characters"][0]["id"] == "characters_1"
    assert anchors["style"][0]["name"] == "clean"
    with pytest.raises(ValueError):
        validate_stage("generation")


def test_prompt_compiler_keeps_anchor_provenance():
    result = compile_prompt(shot={"id": "shot-1", "description": "Hero holds the product"}, anchors={"characters": [{"id": "hero-v2", "name": "Hero", "look": "blue jacket"}], "style": [{"name": "studio"}]})
    assert "Hero holds the product" in result["prompt"]
    assert "blue jacket" in result["prompt"]
    assert result["source_anchor_ids"] == ["hero-v2", "style_1"]


def test_skills_are_versioned_and_read_on_demand():
    summaries = {skill.name: skill for skill in list_skill_summaries()}
    assert summaries["prompt-pack"].version == "1.0.0"
    assert get_skill("shot-list") is not None
    assert "Shot List" in read_skill("shot-list")

def test_doc_chain_rejects_stale_or_unapproved_sources():
    with pytest.raises(ValueError):
        validate_stage_sources("shot_list", [{"type": "script", "status": "approved", "stale": True}, {"type": "asset_anchors", "status": "approved", "stale": False}])
    validate_stage_sources("shot_list", [{"type": "script", "status": "approved", "stale": False}, {"type": "asset_anchors", "status": "approved", "stale": False}])
