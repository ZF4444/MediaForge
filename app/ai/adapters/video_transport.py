"""HTTP transport for canonical video generation commands."""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import Any

import httpx
from fastapi import HTTPException


class VideoTransport:
    def __init__(self, *, submit_urls: Callable[[Mapping[str, Any]], list[str]], headers: Callable[[Mapping[str, Any]], Mapping[str, str]], client_factory: Callable[..., Any], extract_task_id: Callable[[Mapping[str, Any]], str | None], wait_task: Callable[[Any, Mapping[str, Any], str, str], Awaitable[Mapping[str, Any]]], output_urls: Callable[[Mapping[str, Any]], list[str]], looks_like_html: Callable[[str], bool], timeout: Any):
        self._submit_urls = submit_urls
        self._headers = headers
        self._client_factory = client_factory
        self._extract_task_id = extract_task_id
        self._wait_task = wait_task
        self._output_urls = output_urls
        self._looks_like_html = looks_like_html
        self._timeout = timeout

    async def generate(self, connection: Mapping[str, Any], body: Mapping[str, Any]) -> tuple[Mapping[str, Any], str | None]:
        raw = None
        html_response = None
        last_response = None
        last_error = None
        submit_url = ""
        async with self._client_factory(timeout=self._timeout) as client:
            for candidate in self._submit_urls(connection):
                submit_url = candidate
                response = await client.post(candidate, headers=dict(self._headers(connection)), json=dict(body))
                last_response = response
                response.raise_for_status()
                try:
                    raw = response.json()
                    break
                except Exception as exc:
                    last_error = exc
                    if self._looks_like_html(response.text):
                        html_response = response
                        continue
                    raise HTTPException(status_code=502, detail=f"上游视频接口返回非 JSON 响应（状态 {response.status_code}）：{response.text[:500]}") from exc
            if raw is None:
                response = html_response or last_response
                status = getattr(response, "status_code", 200)
                text = (getattr(response, "text", "") or "")[:500]
                raise HTTPException(status_code=502, detail=f"上游视频接口返回了网页 HTML，而不是 JSON（状态 {status}）：{text}") from last_error
            task_id = self._extract_task_id(raw)
            result = raw
            if task_id and not self._output_urls(raw):
                result = await self._wait_task(client, connection, task_id, submit_url)
            if not self._output_urls(result):
                raise HTTPException(status_code=502, detail=f"视频生成成功但没有返回视频：{result}")
            return result, task_id

    async def generate_with_client(self, client: Any, connection: Mapping[str, Any], body: Mapping[str, Any]) -> tuple[Mapping[str, Any], str | None]:
        """Submit using an already-open client owned by the caller."""
        raw = None
        html_response = None
        last_response = None
        last_error = None
        submit_url = ""
        for candidate in self._submit_urls(connection):
            submit_url = candidate
            response = await client.post(candidate, headers=dict(self._headers(connection)), json=dict(body))
            last_response = response
            response.raise_for_status()
            try:
                raw = response.json()
                break
            except Exception as exc:
                last_error = exc
                if self._looks_like_html(response.text):
                    html_response = response
                    continue
                raise HTTPException(status_code=502, detail=f"上游视频接口返回非 JSON 响应（状态 {response.status_code}）：{response.text[:500]}") from exc
        if raw is None:
            response = html_response or last_response
            status = getattr(response, "status_code", 200)
            text = (getattr(response, "text", "") or "")[:500]
            raise HTTPException(status_code=502, detail=f"上游视频接口返回了网页 HTML，而不是 JSON（状态 {status}）：{text}") from last_error
        task_id = self._extract_task_id(raw)
        result = raw
        if task_id and not self._output_urls(raw):
            result = await self._wait_task(client, connection, task_id, submit_url)
        if not self._output_urls(result):
            raise HTTPException(status_code=502, detail=f"视频生成成功但没有返回视频：{result}")
        return result, task_id
