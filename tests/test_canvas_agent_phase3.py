from app.services.canvas_agent.skills import get_skill, list_skill_summaries, read_skill


def test_skills_are_discovered_and_read_on_demand():
    summaries = {skill.name: skill for skill in list_skill_summaries()}
    assert "canvas-capabilities" in summaries
    assert get_skill("canvas-capabilities") is not None
    assert read_skill("canvas-capabilities")
