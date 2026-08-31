"""Protocol adapter contracts and migration-time implementations."""

from .base import AIAdapter
from .openai import OpenAIChatAdapter, OpenAIImageAdapter
from .gemini import GeminiChatAdapter
from .omnilojo import OmnilojoChatAdapter, OmnilojoImageAdapter
from .runninghub_app import RunningHubAppAdapter, RunningHubImageAdapter
from .comfyui_workflow import ComfyUIWorkflowAdapter

__all__ = ["AIAdapter", "OpenAIChatAdapter", "OpenAIImageAdapter", "GeminiChatAdapter", "OmnilojoChatAdapter", "OmnilojoImageAdapter", "RunningHubAppAdapter", "RunningHubImageAdapter", "ComfyUIWorkflowAdapter"]
