"""聊天适配器的上游地址解析测试。

适配器只负责传输，协议相关的 URL 选择（`/v1`、`/v1beta`、`/api/v3` 版本前缀
和 `chat_endpoint` 覆盖）统一由 `app.ai.transport.endpoint_for_target` 决定。
历史上适配器自己用 base_url 拼 `/chat/completions`，丢掉了版本前缀，导致画布
提示词节点持续返回「接口返回了空回复」。
"""
from __future__ import annotations

import pytest

from app.ai.adapters import GeminiChatAdapter, OmnilojoChatAdapter, OpenAIChatAdapter
from app.ai.contracts import ChatCommand
from app.ai.domain import Connection, ModelResource, ResolvedTarget


def _endpoint(protocol: str, base_url: str, settings: dict | None = None) -> str:
    connection = Connection(
        id="c1", protocol=protocol, name="test", base_url=base_url,
        enabled=True, settings=settings or {},
    )
    model = ModelResource("m1", "c1", "some-model", "chat", protocol)
    target = ResolvedTarget(connection=connection, model=model)
    return OpenAIChatAdapter._endpoint(ChatCommand(target=target, messages=[]))


@pytest.mark.parametrize(
    ("protocol", "base_url", "expected"),
    [
        # 生产 Omnilojo 连接就是裸域名，缺少 /v1 时上游不会返回聊天内容。
        ("omnilojo", "https://ai.omnilojo.games", "https://ai.omnilojo.games/v1/chat/completions"),
        ("openai", "https://api.example.test", "https://api.example.test/v1/chat/completions"),
        ("gemini", "https://g.example.test", "https://g.example.test/v1beta/chat/completions"),
        ("volcengine", "https://ark.example.test", "https://ark.example.test/api/v3/chat/completions"),
    ],
)
def test_chat_endpoint_applies_protocol_version_prefix(protocol, base_url, expected):
    assert _endpoint(protocol, base_url) == expected


@pytest.mark.parametrize(
    ("protocol", "base_url"),
    [
        ("omnilojo", "https://ai.omnilojo.games/v1"),
        ("gemini", "https://g.example.test/v1beta"),
        ("volcengine", "https://ark.example.test/api/v3"),
    ],
)
def test_chat_endpoint_does_not_duplicate_existing_prefix(protocol, base_url):
    assert _endpoint(protocol, base_url) == f"{base_url}/chat/completions"


def test_chat_endpoint_preserves_a_fully_qualified_base_url():
    """base_url 已经指向 chat/completions 时不得再次拼接。"""
    url = "https://api.example.test/v1/chat/completions"

    assert _endpoint("openai", url) == url


@pytest.mark.parametrize(
    ("override", "expected"),
    [
        ("/custom/v9", "https://api.example.test/custom/v9/chat/completions"),
        ("https://other.example.test/v1", "https://other.example.test/v1/chat/completions"),
    ],
)
def test_chat_endpoint_honours_connection_override(override, expected):
    assert _endpoint("openai", "https://api.example.test", {"chat_endpoint": override}) == expected


def test_chat_endpoint_rejects_a_connection_without_base_url():
    with pytest.raises(ValueError, match="Base URL"):
        _endpoint("openai", "")


def test_protocol_adapters_share_the_resolver():
    """Gemini/Omnilojo 复用 OpenAI 传输，必须继承同一套地址解析。"""
    assert GeminiChatAdapter._endpoint is OpenAIChatAdapter._endpoint
    assert OmnilojoChatAdapter._endpoint is OpenAIChatAdapter._endpoint
