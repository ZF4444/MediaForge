"""RunningHub executable-resource adapter.

The adapter is transport-only. Authentication, resource ownership and budget
checks remain in the gateway; callers inject submit/query functions so the
legacy task implementation can be migrated without importing ``main`` here.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import Any

from app.ai.contracts import AppCommand
from app.ai.domain import ResolvedTarget


class RunningHubAppAdapter:
    protocol = "runninghub_app"
    capabilities = frozenset({"run_app", "poll_task"})

    def __init__(self, submit: Callable[[ResolvedTarget, Mapping[str, Any]], Awaitable[Any]], query: Callable[[ResolvedTarget, str], Awaitable[Any]] | None = None):
        self._submit = submit
        self._query = query

    def supports(self, target: ResolvedTarget, capability: str) -> bool:
        return target.protocol in {self.protocol, "runninghub"} and capability in self.capabilities

    async def execute(self, target: ResolvedTarget, command: AppCommand, *, actor: Any) -> Any:
        if not self.supports(target, "run_app"):
            raise ValueError("target is not a RunningHub App resource")
        result = await self._submit(target, dict(command.inputs))
        if self._query is None or not isinstance(result, Mapping):
            return result
        task_id = result.get("task_id") or result.get("taskId")
        return await self._query(target, str(task_id)) if task_id else result


class RunningHubImageAdapter:
    """Transport implementation for a RunningHub image application."""

    def __init__(self, *, submit_url: Callable[[Mapping[str, Any]], str], headers: Callable[[Mapping[str, Any]], Mapping[str, str]], api_key: Callable[[Mapping[str, Any]], str], client_factory: Callable[..., Any], extract_task_id: Callable[[Any], str], poll: Callable[[Any, Mapping[str, Any], str], Awaitable[Any]], extract_image: Callable[[Any], Any], timeout: Any):
        self._submit_url = submit_url
        self._headers = headers
        self._api_key = api_key
        self._client_factory = client_factory
        self._extract_task_id = extract_task_id
        self._poll = poll
        self._extract_image = extract_image
        self._timeout = timeout

    async def generate(self, target: ResolvedTarget, *, prompt: str, model: str = "", references: list[dict[str, Any]] | None = None) -> Any:
        settings = dict(target.resource.settings if target.resource else {})
        webapp_id = str(settings.get("app_id") or model)
        fields = settings.get("fields") or []
        node_info = [{"nodeId": str(field.get("nodeId") or ""), "fieldName": str(field.get("fieldName") or ""), "fieldValue": prompt} for field in fields if str(field.get("fieldName") or "").lower() in {"prompt", "text"}]
        body = {"apiKey": self._api_key({**dict(target.connection.settings or {}), "connection_id": target.connection.id}), "webappId": webapp_id, "nodeInfoList": node_info}
        connection = {"connection_id": target.connection.id, "base_url": target.connection.base_url, **dict(target.connection.settings or {})}
        async with self._client_factory(timeout=self._timeout) as client:
            response = await client.post(self._submit_url(connection), headers=dict(self._headers(connection)), json=body)
            response.raise_for_status()
            raw = response.json()
            task_id = self._extract_task_id(raw)
            if not task_id:
                raise ValueError("RunningHub 未返回 taskId")
            result = await self._poll(client, connection, task_id)
        return self._extract_image(result), result
