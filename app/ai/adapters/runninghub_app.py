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
