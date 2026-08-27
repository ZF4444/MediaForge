"""Public entry points for the tool-calling Canvas Agent."""
from __future__ import annotations
import asyncio
from typing import Any
from langchain_core.messages import HumanMessage
from .runtime import create_canvas_agent
from .capabilities import from_provider_configuration
from .tools import build_canvas_tools


def _load_canvas_parameter_providers() -> list[dict[str, Any]]:
    """Read the Provider cache safely from the Agent command worker."""
    from main import load_api_providers
    return load_api_providers()

async def run_canvas_agent(model: Any, message: str, context: dict[str, Any], *, checkpointer: Any = None,
                           emit_progress=None, tools=None, execute_patch=None, dispatch_tasks=None) -> dict[str, Any]:
    run_id = str(context.get("run_id") or "canvas-agent")
    user_id = str(context.get("user_id") or "")
    canvas_id = str(context.get("canvas_id") or "")
    # Build the registry from the active provider configuration once per graph
    # invocation. The model only sees its public capability metadata.
    registry = await asyncio.to_thread(from_provider_configuration, provider_loader=_load_canvas_parameter_providers)
    tools = build_canvas_tools(user_id=user_id, run_id=run_id, canvas_id=canvas_id,
                               get_canvas=context.get("get_canvas"),
                               registry=registry, provider_loader=_load_canvas_parameter_providers,
                               emit_skill_event=context.get("emit_skill_event"))
    graph = create_canvas_agent(model=model, user_id=user_id, run_id=run_id,
                                canvas_id=canvas_id, checkpointer=checkpointer,
                                emit_progress=emit_progress, get_canvas=context.get("get_canvas"),
                                execute_patch=execute_patch, dispatch_tasks=dispatch_tasks, tools=tools,
                                provider_loader=_load_canvas_parameter_providers,
                                emit_skill_event=context.get("emit_skill_event"))
    references = list(context.get("media_references") or [])
    if references:
        from main import reference_to_data_url
        labels = "\n".join(f"- {ref.get('label')}: {ref.get('node_label') or ref.get('node_id')}" for ref in references)
        parts: list[dict[str, Any]] = [{"type": "text", "text": f"{message}\n\n本轮引用画布素材（按顺序）：\n{labels}"}]
        for ref in references[:12]:
            data_url = await asyncio.to_thread(reference_to_data_url, ref, 1536)
            if data_url:
                parts.append({"type": "image_url", "image_url": {"url": data_url}})
        human = HumanMessage(content=parts)
    else:
        human = HumanMessage(content=message)
    return await graph.ainvoke({"run_id": run_id, "messages": [human]},
                               config={"configurable": {"thread_id": run_id}})

async def plan_with_state_graph(model: Any, message: str, context: dict[str, Any], *, checkpointer=None,
                                emit_progress=None, **kwargs):
    return await run_canvas_agent(model, message, context, checkpointer=checkpointer, emit_progress=emit_progress, **kwargs)

plan_with_deep_agent = plan_with_state_graph

async def classify_intent(model: Any, message: str, context: dict[str, Any], **kwargs):
    return await run_canvas_agent(model, message, context, **kwargs)
