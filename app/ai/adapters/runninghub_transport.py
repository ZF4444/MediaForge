"""RunningHub HTTP transport for canonical executable resources."""
from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

import httpx
from fastapi import HTTPException


class RunningHubTransport:
    def __init__(self, *, endpoint: Callable[[Mapping[str, Any], str], str], headers: Callable[[str, bool], Mapping[str, str]], client_factory: Callable[..., Any], timeout: Any):
        self._endpoint = endpoint
        self._headers = headers
        self._client_factory = client_factory
        self._timeout = timeout

    async def app_info(self, connection: Mapping[str, Any], api_key: str, webapp_id: str) -> Mapping[str, Any]:
        url = self._endpoint(connection, "/api/webapp/apiCallDemo")
        async with self._client_factory(timeout=self._timeout) as client:
            response = await client.get(url, headers=dict(self._headers(api_key, False)), params={"apiKey": api_key, "webappId": webapp_id})
            return self._json(response, "请求 RunningHub 应用信息失败")

    async def submit(self, connection: Mapping[str, Any], api_key: str, body: Mapping[str, Any]) -> Mapping[str, Any]:
        async with self._client_factory(timeout=self._timeout) as client:
            response = await client.post(self._endpoint(connection, "/task/openapi/ai-app/run"), headers=dict(self._headers(api_key, True)), json=dict(body))
            return self._json(response, "提交 RunningHub 任务失败")

    async def query(self, connection: Mapping[str, Any], api_key: str, task_id: str) -> Mapping[str, Any]:
        async with self._client_factory(timeout=self._timeout) as client:
            response = await client.post(self._endpoint(connection, "/task/openapi/outputs"), headers=dict(self._headers(api_key, True)), json={"apiKey": api_key, "taskId": task_id})
            return self._json(response, "查询 RunningHub 任务失败")

    async def upload(self, connection: Mapping[str, Any], api_key: str, filename: str, content: bytes, content_type: str) -> Mapping[str, Any]:
        async with self._client_factory(timeout=self._timeout) as client:
            response = await client.post(self._endpoint(connection, "/task/openapi/upload"), headers=dict(self._headers(api_key, False)), data={"apiKey": api_key, "fileType": "input"}, files={"file": (filename, content, content_type)})
            return self._json(response, "上传素材到 RunningHub 失败")

    @staticmethod
    def _json(response: Any, message: str) -> Mapping[str, Any]:
        try:
            raw = response.json()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=message) from exc
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=str(raw)[:800])
        return raw
