"""ComfyUI HTTP transport used by the canonical workflow adapter."""
from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable, Mapping
from typing import Any


class ComfyUITransport:
    """Submit and poll a resolved ComfyUI workflow resource."""

    protocol = "comfyui"

    def __init__(self, *, endpoint: Callable[[str, str], str], post_json: Callable[[str, Mapping[str, Any]], Awaitable[Mapping[str, Any]]], history: Callable[[str, str], Mapping[str, Any]], timeout_seconds: int, sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep):
        self._endpoint = endpoint
        self._post_json = post_json
        self._history = history
        self._timeout = max(1, int(timeout_seconds))
        self._sleep = sleep

    async def submit(self, backend: str, workflow: Mapping[str, Any], client_id: str = "") -> str:
        payload = {"prompt": workflow, "client_id": client_id}
        response = await self._post_json(self._endpoint(backend, "/prompt"), payload)
        prompt_id = str(response.get("prompt_id") or "")
        if not prompt_id:
            raise ValueError("ComfyUI 未返回 prompt_id")
        return prompt_id

    async def wait(self, backend: str, prompt_id: str) -> Mapping[str, Any]:
        for _ in range(self._timeout):
            result = self._history(backend, prompt_id)
            if prompt_id in result:
                return result[prompt_id]
            await self._sleep(1)
        raise TimeoutError("ComfyUI 渲染超时")
