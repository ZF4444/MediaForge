"""Deep Agents planner boundary for Canvas Agent runs."""
from __future__ import annotations
from typing import Any
from app.models.canvas_agent import SemanticPlan

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
