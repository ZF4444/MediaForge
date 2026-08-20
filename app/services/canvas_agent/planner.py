"""Deep Agents planner boundary for Canvas Agent runs."""
from __future__ import annotations
import json
from typing import Any
from app.models.canvas_agent import IntentDecision, SemanticPlan

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
    from langgraph.types import Command
    agent = create_canvas_agent(model=model, tools=[], checkpointer=checkpointer, harness_key=harness_key)
    thread_id = str(context.get("run_id") or context.get("canvas_id") or "canvas-agent")
    prompt = (
        "请根据用户要求制定画布操作计划。只返回一个 JSON 对象，不要 Markdown、解释或工具调用。"
        "JSON 必须符合 SemanticPlan：包含 goal、steps、execution、confirmation 字段；"
        f"\n用户消息：{message}\n画布上下文：{json.dumps(context, ensure_ascii=False, default=str)}"
    )
    invocation = Command(resume=prompt) if resume else {"messages": [{"role": "user", "content": prompt}]}
    result = await agent.ainvoke(invocation, config={"configurable": {"thread_id": thread_id}})
    reject_invalid_tool_calls(result)
    structured = result.get("structured_response") or result.get("response") or result.get("plan")
    if structured is None:
        structured = _json_from_result(result)
    if isinstance(structured, SemanticPlan): return structured
    if structured is None:
        raise ValueError("模型未返回结构化计划，请重试或更换支持工具调用的模型")
    return SemanticPlan.model_validate(structured)


async def classify_intent(model, message: str, context: dict, *, harness_key: str = "") -> IntentDecision:
    """Route a message before invoking the more expensive canvas planner."""
    from .runtime import create_canvas_agent
    agent = create_canvas_agent(
        model=model,
        tools=[],
        harness_key=harness_key,
    )
    prompt = (
        "判断用户消息意图，只能选择 canvas_action、chat、clarification。"
        "canvas_action 表示需要创建、修改、连接、运行画布节点；"
        "chat 表示闲聊或普通问答；clarification 表示信息不足，需要向用户追问。"
        "只返回一个 JSON 对象，不要 Markdown、解释或工具调用。字段为 intent 和 reply。"
        "chat 或 clarification 必须在 reply 中给出简短中文回复，canvas_action 的 reply 留空。"
        f"\n用户消息：{message}\n画布上下文：节点数={context.get('node_count', 0)}"
    )
    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": prompt}]},
        config={"configurable": {"thread_id": f"{context.get('run_id') or context.get('canvas_id')}:intent"}},
    )
    structured = result.get("structured_response") or result.get("response") or result.get("intent")
    if structured is None:
        structured = _json_from_result(result)
    if structured is None:
        raise ValueError("模型未返回有效意图，请重试")
    return structured if isinstance(structured, IntentDecision) else IntentDecision.model_validate(structured)


def _json_from_result(result: dict[str, Any]) -> dict[str, Any]:
    """Parse a plain-text JSON response without requiring tool calling."""
    messages = result.get("messages") or []
    content = ""
    for message in reversed(messages):
        content = getattr(message, "content", "") if not isinstance(message, dict) else message.get("content", "")
        if content:
            break
    text = str(content or "").strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    try:
        parsed = json.loads(text)
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("模型未返回有效 JSON，请重试") from exc
    if not isinstance(parsed, dict):
        raise ValueError("模型 JSON 返回必须是对象")
    return parsed
