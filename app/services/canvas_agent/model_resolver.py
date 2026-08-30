"""LangChain ChatModel adapter over MediaForge's existing provider resolver."""
from __future__ import annotations
import asyncio
import json
from typing import Any
from pydantic import ConfigDict, Field
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.utils.function_calling import convert_to_openai_tool
from app.core.logging import get_logger

logger = get_logger("canvas_agent_model")
_RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524}


class CanvasAgentUpstreamError(RuntimeError):
    """The configured model provider was unavailable after bounded retries."""

class GatewayChatModel(BaseChatModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    endpoint: str
    headers: dict[str, str] = Field(default_factory=dict)
    model_name: str
    request_timeout: float = 180.0

    @property
    def _llm_type(self) -> str: return "mediaforge-provider"
    @property
    def _identifying_params(self) -> dict[str, Any]: return {"endpoint": self.endpoint, "model": self.model_name}

    @staticmethod
    def _message(message: BaseMessage) -> dict[str, Any]:
        role = "user" if isinstance(message, HumanMessage) else "system" if isinstance(message, SystemMessage) else "tool" if isinstance(message, ToolMessage) else "assistant"
        content = message.content if isinstance(message.content, (str, list)) else str(message.content)
        item: dict[str, Any] = {"role": role, "content": content}
        if isinstance(message, ToolMessage): item["tool_call_id"] = message.tool_call_id
        if isinstance(message, AIMessage) and message.tool_calls:
            item["tool_calls"] = [{"id": call.get("id"), "type": "function", "function": {"name": call.get("name"), "arguments": json.dumps(call.get("args") or {}, ensure_ascii=False)}} for call in message.tool_calls]
        return item

    @staticmethod
    def _tool_calls(raw_calls: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Keep malformed provider arguments visible as invalid_tool_calls.

        Silently converting malformed JSON to ``{}`` makes LangChain believe a
        tool call is valid and can bypass the planner's rejection boundary.
        """
        valid: list[dict[str, Any]] = []
        invalid: list[dict[str, Any]] = []
        for call in raw_calls or []:
            function = call.get("function") or {}
            raw_arguments = function.get("arguments") or "{}"
            base = {"id": call.get("id") or "call_agent", "name": function.get("name") or "", "type": "tool_call"}
            try:
                args = json.loads(raw_arguments)
                if not isinstance(args, dict): raise ValueError("tool arguments must be an object")
                valid.append({**base, "args": args})
            except (TypeError, ValueError, json.JSONDecodeError):
                invalid.append({**base, "args": str(raw_arguments), "type": "invalid_tool_call"})
        return valid, invalid

    @staticmethod
    def _tool_choice(value: Any) -> Any:
        """Translate LangChain's internal required-tool sentinel to OpenAI JSON."""
        return "required" if value == "any" else value

    async def _post_with_retry(self, body: dict[str, Any]) -> dict[str, Any]:
        from app.ai.chat import complete_with_retry
        try:
            return await complete_with_retry(endpoint=self.endpoint, headers=self.headers, body=body, timeout=self.request_timeout, retryable_status_codes=_RETRYABLE_STATUS_CODES)
        except Exception as exc:
            if exc.__class__.__name__ in {"NetworkError", "TimeoutException"}:
                raise CanvasAgentUpstreamError("模型服务暂时不可用，请稍后重试") from exc
            raise

    async def _agenerate(self, messages: list[BaseMessage], stop: list[str] | None = None, run_manager: Any = None, **kwargs: Any) -> ChatResult:
        body: dict[str, Any] = {"model": self.model_name, "messages": [self._message(message) for message in messages], "stream": False}
        response_format = kwargs.get("response_format")
        if response_format is not None:
            if not isinstance(response_format, dict):
                raise TypeError("response_format must be a provider request dictionary")
            body["response_format"] = response_format
        tools = kwargs.get("_bound_tools")
        if tools:
            body["tools"] = [convert_to_openai_tool(tool) for tool in tools]
            if kwargs.get("_tool_choice"):
                body["tool_choice"] = self._tool_choice(kwargs["_tool_choice"])
        data = await self._post_with_retry(body)
        choice = (data.get("choices") or [{}])[0]
        raw = choice.get("message") or {}
        tool_calls, invalid_tool_calls = self._tool_calls(raw.get("tool_calls") or [])
        message = AIMessage(content=raw.get("content") or "", tool_calls=tool_calls, invalid_tool_calls=invalid_tool_calls)
        return ChatResult(generations=[ChatGeneration(message=message)], llm_output={"usage": data.get("usage") or {}})

    def _generate(self, messages: list[BaseMessage], stop: list[str] | None = None, run_manager: Any = None, **kwargs: Any) -> ChatResult:
        return asyncio.run(self._agenerate(messages, stop, run_manager, **kwargs))

    def bind_tools(self, tools, *, tool_choice: str | None = None, **kwargs: Any):
        return self.bind(_bound_tools=list(tools), _tool_choice=tool_choice, **kwargs)

MediaForgeChatModel = GatewayChatModel


def resolve_canvas_agent_model(
    provider: str = "", model: str = "", *, model_id: str = "", connection_id: str = "",
) -> GatewayChatModel:
    from app.ai.runtime import resolve_chat_model
    endpoint, headers, resolved_model = resolve_chat_model(
        provider, model, model_id=model_id, connection_id=connection_id,
    )
    return GatewayChatModel(endpoint=f"{endpoint}/chat/completions", headers=dict(headers), model_name=resolved_model)
