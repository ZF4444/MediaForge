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
    from langchain.agents.structured_output import ProviderStrategy
    system_prompt = (
        "你是画布操作计划器，只负责把已经确认的画布操作请求转换为安全、可执行的计划。"
        "依据用户消息和画布上下文生成计划；只包含必要步骤，不要臆造不存在的节点或参数。"
        "对用户节点的修改、连接或运行应保守处理，并等待后续确认。"
    )
    agent = create_canvas_agent(model=model, tools=[], checkpointer=checkpointer, harness_key=harness_key, system_prompt=system_prompt, response_format=ProviderStrategy(SemanticPlan))
    thread_id = str(context.get("run_id") or context.get("canvas_id") or "canvas-agent")
    user_prompt = f"用户消息：{message}\n画布上下文：{json.dumps(context, ensure_ascii=False, default=str)}"
    invocation = Command(resume=user_prompt) if resume else {"messages": [{"role": "user", "content": user_prompt}]}
    result = await agent.ainvoke(invocation, config={"configurable": {"thread_id": thread_id}})
    reject_invalid_tool_calls(result)
    structured = result.get("structured_response") or result.get("response") or result.get("plan")
    if structured is None:
        structured = _json_from_result(result)
    if isinstance(structured, SemanticPlan): return structured
    if structured is None:
        raise ValueError("模型未返回结构化计划，请重试或更换支持工具调用的模型")
    return _normalize_plan(structured, context)


async def classify_intent(model, message: str, context: dict, *, harness_key: str = "") -> IntentDecision:
    """Route a message before invoking the more expensive canvas planner.

    Planning can modify the canvas, so this router deliberately treats chat as
    the default and only escalates explicit, actionable canvas requests.
    """
    from .runtime import create_canvas_agent
    system_prompt = (
        "你是通用画布智能体的入口。先理解并回应用户；只有明确要操作当前画布时，才转交计划器。"
        "只能选择 canvas_action、chat、clarification，默认选择 chat。"
        "canvas_action 必须同时满足：用户明确要求现在创建、修改、删除、连接或运行画布中的节点；"
        "并且动作对象与预期结果足够具体，可以安全制定计划。"
        "仅提到图片、视频、提示词、工作流、创作目标，或要求你写内容、给建议、解释概念，都不是 canvas_action。"
        "问候、闲聊、知识问答、头脑风暴、内容创作和泛泛的能力咨询一律选择 chat，并直接给出有帮助的中文回复。"
        "用户想操作画布但缺少必要目标、对象或选择范围时选择 clarification，并用中文提出一个简短、具体的问题。"
        "示例：'你好'、'帮我写一条广告文案'、'怎么做图生视频' => chat；"
        "'在画布上新建一个文生图节点，主题是雨夜城市'、'连接选中的提示词节点和图像节点' => canvas_action；"
        "'帮我改一下这个节点'（没有引用或说明改什么）=> clarification。"
        "只返回一个 JSON 对象，不要 Markdown、解释或工具调用。字段为 intent 和 reply。"
        "chat 或 clarification 必须在 reply 中给出简短中文回复，canvas_action 的 reply 必须为空字符串。"
    )
    agent = create_canvas_agent(model=model, tools=[], harness_key=harness_key, system_prompt=system_prompt)
    user_prompt = f"用户消息：{message}\n画布上下文：节点数={context.get('node_count', 0)}"
    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": user_prompt}]},
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


def _normalize_plan(payload: Any, context: dict[str, Any]) -> SemanticPlan:
    """Normalize the known legacy canvas-operations response into our protocol.

    This is deliberately an allow-list conversion. It keeps provider/model
    wording differences out of the executor instead of weakening Pydantic's
    strict protocol models.
    """
    if not isinstance(payload, dict):
        raise ValueError("模型计划必须是 JSON 对象")
    try:
        return SemanticPlan.model_validate(payload)
    except Exception as original_error:
        if not (isinstance(payload.get("execution"), dict) and payload["execution"].get("operations")):
            raise original_error

    execution = payload["execution"]
    steps: list[dict[str, Any]] = []
    for index, operation in enumerate(execution.get("operations") or [], 1):
        if not isinstance(operation, dict):
            raise ValueError(f"旧版计划 operation {index} 必须是对象")
        op = str(operation.get("op") or operation.get("action") or "").strip().lower()
        details = operation.get("details") if isinstance(operation.get("details"), dict) else {}
        node_data = operation.get("node") if isinstance(operation.get("node"), dict) else details.get("node")
        if not isinstance(node_data, dict):
            node_data = operation.get("node_config") if isinstance(operation.get("node_config"), dict) else operation.get("config")
        node_data = dict(node_data) if isinstance(node_data, dict) else {}
        step_id = str(operation.get("client_ref") or operation.get("id") or f"legacy-{index}")
        if op in {"create_node", "add_node"}:
            node_type = str(node_data.get("semantic_type") or node_data.get("type") or node_data.get("node_type") or details.get("node_type") or "")
            semantic_type = {"smart-prompt": "prompt", "smart-image": "image_generation", "smart-video": "video_generation"}.get(node_type, node_type or "prompt")
            known = {"semantic_type", "type", "node_type", "title", "name", "content", "text", "prompt", "capability", "params"}
            params = dict(node_data.get("params") or {})
            params.update({key: value for key, value in node_data.items() if key not in known})
            steps.append({"id": step_id, "action": "canvas.create_node", "node": {"semantic_type": semantic_type, "title": str(node_data.get("title") or node_data.get("name") or ""), "content": str(node_data.get("content") or node_data.get("text") or node_data.get("prompt") or ""), "capability": str(node_data.get("capability") or ""), "params": params}, "placement": operation.get("placement") or details.get("placement") or {}})
        elif op in {"update_node", "update_node_params", "update_params"}:
            target = str(operation.get("node_id") or details.get("node_id") or (operation.get("selected_nodes") or details.get("selected_nodes") or [""])[0])
            if not target:
                raise ValueError(f"旧版计划 operation {index} 缺少 node_id")
            steps.append({"id": step_id, "action": "canvas.update_node_params", "target_node_id": target, "node": {"semantic_type": "prompt", "params": operation.get("params") or details.get("params") or {}}})
        elif op in {"replace_node_content", "update_content"}:
            target = str(operation.get("node_id") or details.get("node_id") or (operation.get("selected_nodes") or details.get("selected_nodes") or [""])[0])
            if not target:
                raise ValueError(f"旧版计划 operation {index} 缺少 node_id")
            steps.append({"id": step_id, "action": "canvas.replace_node_content", "target_node_id": target, "node": {"semantic_type": "prompt", "content": str(operation.get("content") or details.get("content") or "")}})
        elif op in {"connect", "add_connection"}:
            source = str(operation.get("from_step") or operation.get("from_ref") or operation.get("source") or details.get("from_step") or "")
            target = str(operation.get("to_step") or operation.get("to_ref") or operation.get("target") or details.get("to_step") or "")
            if not source or not target:
                raise ValueError(f"旧版计划 operation {index} 缺少连接端点")
            steps.append({"id": step_id, "action": "canvas.connect", "from_step": source, "to_step": target, "relation": str(operation.get("relation") or "default")})
        elif op in {"run_node", "run_group"}:
            target = str(operation.get("node_id") or operation.get("group_id") or details.get("node_id") or "")
            if not target:
                raise ValueError(f"旧版计划 operation {index} 缺少执行目标")
            steps.append({"id": step_id, "action": f"canvas.{op}", "target_node_id": target})
        else:
            raise ValueError(f"模型返回了不支持的画布操作：{op or '空操作'}")

    return SemanticPlan.model_validate({
        "mode": payload.get("mode", "fast_track"),
        "goal": str(payload.get("goal") or payload.get("title") or "执行画布操作"),
        "questions": payload.get("questions") or [],
        "steps": steps,
        "execution": {"auto_run": bool(execution.get("auto_run", False)), "parallelism": int(execution.get("parallelism", 1) or 1), "capabilities": execution.get("capabilities") or [], "estimated_cost": float(execution.get("estimated_cost", 0) or 0)},
        "confirmation": {"required": True, "reason": str((payload.get("confirmation") or {}).get("summary") or "画布操作需要确认")},
    })
