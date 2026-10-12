"""Canvas Agent 运行入口：组装用户消息（含画布引用图片）并调用 agent 图。"""
from __future__ import annotations

import asyncio
from typing import Any

from langchain_core.messages import HumanMessage

from . import runtime
from .tools import build_canvas_tools


async def run_canvas_agent(model: Any, message: str, context: dict[str, Any], *, checkpointer: Any = None,
                           emit_progress=None, execute_patch=None, dispatch_tasks=None) -> dict[str, Any]:
    run_id = str(context.get("run_id") or "canvas-agent")
    user_id = str(context.get("user_id") or "")
    canvas_id = str(context.get("canvas_id") or "")
    tools = build_canvas_tools(user_id=user_id, run_id=run_id, canvas_id=canvas_id,
                               get_canvas=context.get("get_canvas"))
    graph = runtime.create_canvas_agent(model=model, user_id=user_id, run_id=run_id,
                                canvas_id=canvas_id, checkpointer=checkpointer,
                                emit_progress=emit_progress, get_canvas=context.get("get_canvas"),
                                execute_patch=execute_patch, dispatch_tasks=dispatch_tasks, tools=tools)
    references = list(context.get("media_references") or [])
    if references:
        from app.ai.runtime import reference_to_data_url
        parts: list[dict[str, Any]] = [{"type": "text", "text": message}]
        included = 0
        for ref in references:
            if included >= 12:
                break
            label = ref.get("label")
            node_desc = ref.get("node_label") or ref.get("node_id") or "未知节点"
            node_id = str(ref.get("node_id") or "").strip()
            id_hint = f"（节点 id: {node_id}）" if node_id else ""
            # Placeholder references carry no image; keep their canvas context as
            # text so the model still knows the node was mentioned.
            if ref.get("empty") or not str(ref.get("url") or "").strip():
                parts.append({"type": "text", "text": f"[{label}] 引用画布节点「{node_desc}」{id_hint}（暂无图像）"})
                continue
            data_url = await asyncio.to_thread(reference_to_data_url, ref, 1536)
            if not data_url:
                parts.append({"type": "text", "text": f"[{label}] 引用画布节点「{node_desc}」{id_hint}（图像不可用）"})
                continue
            # Emit the node context immediately before its image so text labels
            # and images stay aligned even when entries are skipped or truncated.
            parts.append({"type": "text", "text": f"[{label}] 来自画布节点「{node_desc}」{id_hint}，如下图："})
            parts.append({"type": "image_url", "image_url": {"url": data_url}})
            included += 1
        human = HumanMessage(content=parts)
    else:
        human = HumanMessage(content=message)
    return await graph.ainvoke({"run_id": run_id, "messages": [human]},
                               config={"configurable": {"thread_id": run_id}})


