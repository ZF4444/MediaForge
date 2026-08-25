"""Tool-calling LangGraph runtime for the Canvas Agent."""
from __future__ import annotations
from typing import Annotated, Any, Awaitable, Callable, TypedDict
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage
from langchain_core.tools import StructuredTool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langgraph.types import interrupt
from .tools import build_canvas_tools
from .skills import skill_metadata_prompt

class CanvasAgentState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    run_id: str
    user_id: str
    canvas_id: str
    loaded_skills: list[dict[str, str]]
    loaded_skill_resources: list[dict[str, str]]
    confirmed: bool
    plan_version: int
    authorized_node_ids: list[str]
    execution_result: dict[str, Any]
    tasks: list[dict[str, Any]]

def create_canvas_agent(*, model: Any, user_id: str = "", run_id: str = "", canvas_id: str = "",
                        checkpointer: Any = None, emit_progress: Callable[..., Awaitable[Any]] | None = None,
                        get_canvas=None, execute_patch=None, dispatch_tasks=None, tools: list[StructuredTool] | None = None,
                        provider_loader=None, emit_skill_event: Callable[[str, dict[str, Any]], Awaitable[Any]] | None = None):
    planning_tools = tools or build_canvas_tools(
        user_id=user_id, run_id=run_id, canvas_id=canvas_id,
        get_canvas=get_canvas, provider_loader=provider_loader,
        emit_skill_event=emit_skill_event,
    )
    execution_tools = build_canvas_tools(
        user_id=user_id, run_id=run_id, canvas_id=canvas_id,
        get_canvas=get_canvas, execute_patch=execute_patch, include_execution=True,
        provider_loader=provider_loader, emit_skill_event=emit_skill_event,
    ) if execute_patch is not None else []
    planning_tool_node = ToolNode(planning_tools)
    execution_tool_node = ToolNode(execution_tools) if execution_tools else None
    async def progress(phase: str, message: str):
        if emit_progress: await emit_progress(run_id, {"phase": phase, "message": message})
    async def agent_node(state: CanvasAgentState) -> dict[str, Any]:
        await progress("agent", "正在分析请求并选择工具…")
        await progress("model", "正在调用模型生成下一步…")
        system = SystemMessage(content=("你是画布工具型 Agent。必须通过工具读取画布和能力，不要臆造节点。"
            "创建节点时 semantic_type 只能是 prompt、image_generation、video_generation、workflow_generation 或 group；"
            "capability 必须填写 read_capability_registry 返回的能力名，绝不能写入 semantic_type。"
            "例如图片节点使用 semantic_type=image_generation、capability=image.text_to_image。"
            "选择 capability、provider 或 model 后，必须先调用 read_capability_parameters 获取字段、枚举、默认值和范围，再调用 propose_canvas_patch。"
            "read_capability_registry 和 read_capability_parameters 返回的 provider_name、model_label、display_name、display_fields 是给用户看的名称；"
            "优先使用这些展示名称理解和描述参数，display_fields[].display_options 中的 label 是选项显示值，value 是提交执行时必须保留的原始值。"
            "参数工具返回的 params_path 指定字段写入位置；图片/视频写入 node.params.runSettings，"
            "ComfyUI 写入 node.params.runSettings.comfyParams，提示词节点字段直接写入 node.params。"
            "需要修改时调用 propose_canvas_patch；该工具只生成提案，不会修改画布。"
            "提案返回 awaiting_confirmation 后必须等待用户确认；不要在规划阶段调用任何执行工具。用户批准后，图会自动调用专用执行工具并记录执行结果。"
            "缺少目标时调用 request_clarification。普通问答直接用中文回答。"
            "\n\n" + skill_metadata_prompt() + "\n"
            "用户请求明显匹配某个 Skill 时，先调用 read_canvas_skill。只有该正文明确引用的已登记资源才可调用 "
            "read_canvas_skill_resource；资源和 scripts 都只可用于规划参考，不能执行。"))
        response = await model.bind_tools(planning_tools).ainvoke([system, *(state.get("messages") or [])])
        if getattr(response, "tool_calls", None):
            await progress("agent", "已完成决策，准备执行工具…")
        else:
            await progress("agent", "正在整理模型响应…")
        return {"messages": [response]}

    async def tools_node(state: CanvasAgentState) -> dict[str, Any]:
        last = (state.get("messages") or [])[-1] if state.get("messages") else None
        calls = list(getattr(last, "tool_calls", []) or [])
        # This only reports a tool after the model emitted a real tool call.
        for call in calls:
            await progress("tool_started", f"正在执行工具 {call.get('name') or 'unknown'}…")
        try:
            result = await planning_tool_node.ainvoke(state)
        except Exception:
            for call in calls:
                await progress("tool_failed", f"工具 {call.get('name') or 'unknown'} 执行失败")
            raise
        for call in calls:
            await progress("tool_completed", f"工具 {call.get('name') or 'unknown'} 已完成")
        return result

    async def confirmation_node(state: CanvasAgentState) -> dict[str, Any]:
        await progress("confirmation", "计划已生成，等待用户确认…")
        decision = interrupt({"type": "canvas.confirmation_required", "run_id": run_id})
        approved = bool(decision.get("approved")) if isinstance(decision, dict) else bool(decision)
        if not approved: return {"confirmed": False}
        plan_version = int(decision.get("plan_version") or 0) if isinstance(decision, dict) else 0
        if plan_version < 1: raise ValueError("确认请求缺少计划版本")
        authorized_node_ids = list(decision.get("authorized_node_ids") or []) if isinstance(decision, dict) else []
        await progress("confirmation", "用户已确认，继续执行…")
        call_id = f"execute-{run_id}-{plan_version}"
        return {
            "confirmed": True,
            "plan_version": plan_version,
            "authorized_node_ids": authorized_node_ids,
            "messages": [AIMessage(content="", tool_calls=[{
                "id": call_id,
                "name": "execute_canvas_patch",
                "args": {"plan_version": plan_version, "authorized_node_ids": authorized_node_ids},
                "type": "tool_call",
            }])],
        }

    async def execute_node(state: CanvasAgentState) -> dict[str, Any]:
        if execution_tool_node is None: raise RuntimeError("Canvas execution boundary is not configured")
        await progress("execution", "正在执行已确认的画布变更…")
        return await execution_tool_node.ainvoke(state)

    async def dispatch_tasks_node(state: CanvasAgentState) -> dict[str, Any]:
        result = dict(state.get("execution_result") or {})
        if not result: raise RuntimeError("Canvas patch execution did not return a result")
        if dispatch_tasks is None: return {"tasks": []}
        await progress("execution", "画布变更已应用，正在提交生成任务…")
        tasks = await dispatch_tasks(result)
        return {"tasks": tasks}
    def route_agent(state: CanvasAgentState) -> str:
        last = (state.get("messages") or [])[-1] if state.get("messages") else None
        return "tools" if isinstance(last, AIMessage) and last.tool_calls else END
    def route_tools(state: CanvasAgentState) -> str:
        last = (state.get("messages") or [])[-1] if state.get("messages") else None
        text = str(getattr(last, "content", ""))
        return "confirmation" if "awaiting_confirmation" in text or "requires_confirmation" in text else "agent"
    def route_confirmation(state: CanvasAgentState) -> str:
        return "execute" if state.get("confirmed") else END
    graph = StateGraph(CanvasAgentState)
    graph.add_node("agent", agent_node); graph.add_node("tools", tools_node); graph.add_node("confirmation", confirmation_node)
    graph.add_node("execute", execute_node); graph.add_node("dispatch_tasks", dispatch_tasks_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", route_agent, {"tools": "tools", END: END})
    graph.add_conditional_edges("tools", route_tools, {"agent": "agent", "confirmation": "confirmation"})
    graph.add_conditional_edges("confirmation", route_confirmation, {"execute": "execute", END: END})
    graph.add_edge("execute", "dispatch_tasks"); graph.add_edge("dispatch_tasks", END)
    return graph.compile(checkpointer=checkpointer)
