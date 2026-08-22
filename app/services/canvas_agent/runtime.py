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

class CanvasAgentState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    run_id: str
    user_id: str
    canvas_id: str
    confirmed: bool
    execution_result: dict[str, Any]

def create_canvas_agent(*, model: Any, user_id: str = "", run_id: str = "", canvas_id: str = "",
                        checkpointer: Any = None, emit_progress: Callable[..., Awaitable[Any]] | None = None,
                        get_canvas=None, execute_patch=None, tools: list[StructuredTool] | None = None,
                        provider_loader=None):
    scoped_tools = tools or build_canvas_tools(
        user_id=user_id, run_id=run_id, canvas_id=canvas_id,
        get_canvas=get_canvas, execute_patch=execute_patch, provider_loader=provider_loader,
    )
    tool_node = ToolNode(scoped_tools)
    async def progress(phase: str, message: str):
        if emit_progress: await emit_progress(run_id, {"phase": phase, "message": message})
    async def agent_node(state: CanvasAgentState) -> dict[str, Any]:
        await progress("agent", "正在分析请求并选择工具…")
        system = SystemMessage(content=("你是画布工具型 Agent。必须通过工具读取画布和能力，不要臆造节点。"
            "创建节点时 semantic_type 只能是 prompt、image_generation、video_generation、workflow_generation 或 group；"
            "capability 必须填写 read_capability_registry 返回的能力名，绝不能写入 semantic_type。"
            "例如图片节点使用 semantic_type=image_generation、capability=image.text_to_image。"
            "选择 capability、provider 或 model 后，必须先调用 read_capability_parameters 获取字段、枚举、默认值和范围，再调用 propose_canvas_patch。"
            "参数工具返回的 params_path 指定字段写入位置；图片/视频写入 node.params.runSettings，"
            "ComfyUI 写入 node.params.runSettings.comfyParams，提示词节点字段直接写入 node.params。"
            "需要修改时调用 propose_canvas_patch；该工具只生成提案，不会修改画布。"
            "提案返回 awaiting_confirmation 后必须等待用户确认。确认恢复后调用 execute_canvas_patch。"
            "缺少目标时调用 request_clarification。普通问答直接用中文回答。"))
        response = await model.bind_tools(scoped_tools).ainvoke([system, *(state.get("messages") or [])])
        return {"messages": [response]}
    async def tools_node(state: CanvasAgentState) -> dict[str, Any]:
        last = (state.get("messages") or [])[-1] if state.get("messages") else None
        calls = list(getattr(last, "tool_calls", []) or [])
        # This only reports a tool after the model emitted a real tool call.
        for call in calls:
            await progress("tool_started", f"正在执行工具 {call.get('name') or 'unknown'}…")
        try:
            result = await tool_node.ainvoke(state)
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
        if approved: await progress("confirmation", "用户已确认，继续执行…")
        return {"confirmed": approved}
    def route_agent(state: CanvasAgentState) -> str:
        last = (state.get("messages") or [])[-1] if state.get("messages") else None
        return "tools" if isinstance(last, AIMessage) and last.tool_calls else END
    def route_tools(state: CanvasAgentState) -> str:
        last = (state.get("messages") or [])[-1] if state.get("messages") else None
        text = str(getattr(last, "content", ""))
        return "confirmation" if "awaiting_confirmation" in text or "requires_confirmation" in text else "agent"
    graph = StateGraph(CanvasAgentState)
    graph.add_node("agent", agent_node); graph.add_node("tools", tools_node); graph.add_node("confirmation", confirmation_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", route_agent, {"tools": "tools", END: END})
    graph.add_conditional_edges("tools", route_tools, {"agent": "agent", "confirmation": "confirmation"})
    # The HTTP confirmation endpoint owns the Patch Executor boundary. The
    # graph records the approval and terminates; the endpoint then performs the
    # idempotent business operation with its existing authorization checks.
    graph.add_conditional_edges("confirmation", lambda state: END, {END: END})
    return graph.compile(checkpointer=checkpointer)
