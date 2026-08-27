import asyncio

import pytest
from langchain_core.messages import AIMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing import Annotated, TypedDict
from app.services.canvas_agent.runtime import create_canvas_agent

from app.services.canvas_agent import skills
from app.services.canvas_agent.tools import build_canvas_tools


def test_execution_tool_records_a_tool_message_and_execution_result():
    class State(TypedDict):
        messages: Annotated[list, add_messages]
        execution_result: dict

    async def execute_patch(plan_version, authorized_node_ids):
        assert plan_version == 1
        assert authorized_node_ids == ["node-1"]
        return {"version": 2, "node_refs": {"create-image": "node-1"}, "run_requests": []}

    tools = build_canvas_tools(
        user_id="user", run_id="run", canvas_id="canvas",
        execute_patch=execute_patch, include_execution=True,
    )
    execute_tool = next(item for item in tools if item.name == "execute_canvas_patch")
    graph_builder = StateGraph(State)
    graph_builder.add_node("execute", ToolNode([execute_tool]))
    graph_builder.add_edge(START, "execute")
    graph_builder.add_edge("execute", END)
    result = asyncio.run(graph_builder.compile().ainvoke({"messages": [AIMessage(content="", tool_calls=[{
        "id": "execute-call", "name": "execute_canvas_patch",
        "args": {"plan_version": 1, "authorized_node_ids": ["node-1"]}, "type": "tool_call",
    }])]}))

    assert result["execution_result"]["node_refs"] == {"create-image": "node-1"}
    message = next(item for item in result["messages"] if isinstance(item, ToolMessage))
    assert message.tool_call_id == "execute-call"
    assert '"node-1"' in message.content


def test_skill_document_reads_complete_body_and_metadata_prompt():
    document = skills.read_skill_document("canvas-capabilities")
    assert document.name == "canvas-capabilities"
    assert document.content.startswith("# Canvas Capabilities")
    assert len(document.content_sha256) == 64
    assert "canvas-capabilities v1.0.0" in skills.skill_metadata_prompt()


def test_image_generation_skill_is_registered_with_matching_frontmatter():
    document = skills.read_skill_document("image-generation")
    assert document.name == "image-generation"
    assert document.version == "1.0.0"
    assert "image.text_to_image" in document.content
    assert "image-generation v1.0.0" in skills.skill_metadata_prompt()


def test_disabled_skill_is_hidden_and_cannot_be_read(monkeypatch):
    monkeypatch.setattr(skills, "_enabled_skill_names", lambda: {"shot-list"})
    assert [skill.name for skill in skills.list_enabled_skill_summaries()] == ["shot-list"]
    with pytest.raises(KeyError):
        skills.read_skill_document("canvas-capabilities")


def test_skill_resource_requires_explicit_registration_and_rejects_path_traversal():
    resource = skills.read_skill_resource("canvas-capabilities", "references/capability-reading.md")
    assert "Capability Reading Order" in resource.content
    with pytest.raises(ValueError):
        skills.read_skill_resource("canvas-capabilities", "../SKILL.md")
    with pytest.raises(PermissionError):
        skills.read_skill_resource("canvas-capabilities", "SKILL.md")


def test_skill_frontmatter_must_match_catalog(monkeypatch, tmp_path):
    root = tmp_path / "skills"
    skill_dir = root / "demo-skill"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text("---\nname: wrong-name\nversion: 1.0.0\n---\n# Demo\n", encoding="utf-8")
    monkeypatch.setattr(skills, "_SKILLS", (skills.SkillSummary("demo-skill", "Demo", "1.0.0"),))
    with pytest.raises(ValueError, match="名称不匹配"):
        skills.read_skill_document("demo-skill", root=str(root))


def test_skill_tools_write_loaded_state_and_require_level_two_before_level_three():
    events = []

    async def emit(event_type, payload):
        events.append((event_type, payload))

    tools = build_canvas_tools(user_id="user", run_id="run", canvas_id="canvas", emit_skill_event=emit)

    class Model:
        calls = 0

        def bind_tools(self, _tools):
            return self

        async def ainvoke(self, _messages):
            self.calls += 1
            if self.calls == 1:
                return AIMessage(content="", tool_calls=[{"name": "read_canvas_skill", "args": {"name": "canvas-capabilities"}, "id": "call-skill", "type": "tool_call"}])
            if self.calls == 2:
                return AIMessage(content="", tool_calls=[{"name": "read_canvas_skill_resource", "args": {"skill_name": "canvas-capabilities", "resource_path": "references/capability-reading.md"}, "id": "call-resource", "type": "tool_call"}])
            return AIMessage(content="done")

    result = asyncio.run(create_canvas_agent(model=Model(), user_id="user", run_id="run", canvas_id="canvas", tools=tools).ainvoke({"messages": []}))
    assert result["loaded_skills"][0]["name"] == "canvas-capabilities"
    assert result["loaded_skill_resources"][0]["path"] == "references/capability-reading.md"
    assert any(message.tool_call_id == "call-skill" for message in result["messages"] if hasattr(message, "tool_call_id"))
    assert [event[0] for event in events] == ["skill.loaded", "skill.resource_loaded"]
