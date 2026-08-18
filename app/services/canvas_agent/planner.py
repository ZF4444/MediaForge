"""Deterministic Fast Track planner boundary.

The protocol is independent of a model; Phase 1 can replace this implementation
with the Deep Agents planner without changing API, Policy or Executor contracts.
"""
from __future__ import annotations
import re
from typing import Any
from app.models.canvas_agent import SemanticPlan

def _shot_count(message: str) -> int:
    match = re.search(r"(?:三|3|三个|3个|three)", message.lower())
    return 3 if match else 1

def plan_fast_track(message: str, context: dict) -> SemanticPlan:
    count = _shot_count(message)
    steps = [{"id": "prompt_1", "action": "canvas.create_node", "node": {"semantic_type": "prompt", "title": "广告提示词", "content": message, "params": {"source_node_ids": [node.get("id") for node in context.get("selected_nodes", [])]}}}]
    previous = "prompt_1"
    for index in range(count):
        image_id = f"image_{index + 1}"
        steps.append({"id": image_id, "action": "canvas.create_node", "node": {"semantic_type": "image_generation", "title": f"广告镜头 {index + 1}", "capability": "image.text_to_image", "params": {"aspect_ratio": "9:16", "provider_id": "", "model": ""}}})
        steps.append({"id": f"edge_{index + 1}", "action": "canvas.connect", "from_step": previous, "to_step": image_id, "relation": "prompt"})
        if any(word in message for word in ("生成", "做成", "生成图片", "出图")):
            steps.append({"id": f"run_{index + 1}", "action": "canvas.run_node", "target_node_id": image_id})
    auto_run = any(step["action"] == "canvas.run_node" for step in steps)
    reason = f"将创建 {count} 个图片镜头" + ("并提交生成任务" if auto_run else "")
    return SemanticPlan(mode="fast_track", goal=message, steps=steps, confirmation={"required": True, "reason": reason}, execution={"auto_run": auto_run, "parallelism": min(count, 4), "capabilities": ["canvas.create_node", "canvas.connect"] + (["image.text_to_image"] if auto_run else []), "estimated_cost": float(count if auto_run else 0)})

def reject_invalid_tool_calls(result: dict[str, Any]) -> None:
    """Do not turn malformed model tool JSON into an executable plan."""
    for message in result.get("messages") or []:
        invalid = getattr(message, "invalid_tool_calls", None)
        if invalid is None and isinstance(message, dict): invalid = message.get("invalid_tool_calls")
        if invalid:
            raise ValueError("模型返回了无效工具参数，请重新生成计划")

async def plan_with_deep_agent(model, message: str, context: dict, *, checkpointer=None, harness_key: str = "", resume: bool = False) -> SemanticPlan:
    """Invoke a model planner, resuming the persisted Run thread when requested."""
    from .runtime import create_canvas_agent
    from .tools import read_canvas_context, request_clarification, submit_semantic_plan
    from langgraph.types import Command
    agent = create_canvas_agent(model=model, tools=[read_canvas_context, request_clarification, submit_semantic_plan], checkpointer=checkpointer, harness_key=harness_key, response_format=SemanticPlan)
    thread_id = str(context.get("run_id") or context.get("canvas_id") or "canvas-agent")
    invocation = Command(resume=message) if resume else {"messages": [{"role": "user", "content": message}]}
    result = await agent.ainvoke(invocation, config={"configurable": {"thread_id": thread_id}})
    reject_invalid_tool_calls(result)
    structured = result.get("structured_response") or result.get("response") or result.get("plan")
    if isinstance(structured, SemanticPlan): return structured
    return SemanticPlan.model_validate(structured)
