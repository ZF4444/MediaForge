"""Gemini OpenAI-compatible chat adapter.

MediaForge's configured Gemini endpoint uses the connection's ``/v1beta``
OpenAI-compatible facade; protocol-specific URL selection remains in the
resolver while transport stays isolated here.
"""
from __future__ import annotations

from app.ai.adapters.openai import OpenAIChatAdapter


class GeminiChatAdapter(OpenAIChatAdapter):
    protocol = "gemini"
