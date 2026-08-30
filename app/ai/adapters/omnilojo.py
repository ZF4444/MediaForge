"""Omnilojo chat adapter over its OpenAI-compatible endpoint."""
from __future__ import annotations

from app.ai.adapters.openai import OpenAIChatAdapter


class OmnilojoChatAdapter(OpenAIChatAdapter):
    protocol = "omnilojo"
