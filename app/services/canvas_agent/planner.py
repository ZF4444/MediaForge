"""Public entry points for the tool-calling Canvas Agent."""
from __future__ import annotations
import asyncio
from typing import Any
from langchain_core.messages import HumanMessage
from .runtime import create_canvas_agent
from .capabilities import from_provider_configuration
from .tools import build_canvas_tools

async def run_canvas_agent(model: Any, message: str, context: dict[str, Any], *, checkpointer: Any = None,
                           emit_progress=None, tools=None, execute_patch=None) -> dict[str, Any]:
    run_id = str(context.get("run_id") or "canvas-agent")
    user_id = str(context.get("user_id") or "")
    canvas_id = str(context.get("canvas_id") or "")
    # Build the registry from the active provider configuration once per graph
    # invocation. The model only sees its public capability metadata.
    registry = await asyncio.to_thread(from_provider_configuration)
    tools = build_canvas_tools(user_id=user_id, run_id=run_id, canvas_id=canvas_id,
                               get_canvas=context.get("get_canvas"), execute_patch=execute_patch,
                               registry=registry)
    graph = create_canvas_agent(model=model, user_id=user_id, run_id=run_id,
                                canvas_id=canvas_id, checkpointer=checkpointer,
                                emit_progress=emit_progress, get_canvas=context.get("get_canvas"),
                                execute_patch=execute_patch, tools=tools)
    return await graph.ainvoke({"run_id": run_id, "messages": [HumanMessage(content=message)]},
                               config={"configurable": {"thread_id": run_id}})

async def plan_with_state_graph(model: Any, message: str, context: dict[str, Any], *, checkpointer=None,
                                emit_progress=None, **kwargs):
    return await run_canvas_agent(model, message, context, checkpointer=checkpointer, emit_progress=emit_progress, **kwargs)

plan_with_deep_agent = plan_with_state_graph

async def classify_intent(model: Any, message: str, context: dict[str, Any], **kwargs):
    return await run_canvas_agent(model, message, context, **kwargs)
