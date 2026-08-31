import asyncio

from app.ai.adapters import ComfyUIWorkflowAdapter
from app.ai.contracts import Actor, WorkflowCommand
from app.ai.domain import Connection, ExecutableResource, ResolvedTarget
from app.ai.gateway import ResourceGateway


def test_resource_gateway_resolves_and_governs_workflow(monkeypatch):
    target = ResolvedTarget(Connection("c1", "comfyui_workflow", "Comfy", "", True), resource=ExecutableResource("r1", "c1", "comfyui_workflow", "wf"))
    seen = {}
    async def execute(resolved, inputs):
        seen.update(inputs); return {"ok": True}
    def no_governance(*args, **kwargs):
        class Context:
            async def __aenter__(self): return self
            async def __aexit__(self, *exc): return False
        return Context()
    monkeypatch.setattr("app.ai.gateway.connection_operation", no_governance)
    gateway = ResourceGateway(resolver=lambda command: target, adapters={"comfyui_workflow": ComfyUIWorkflowAdapter(execute)})
    command = WorkflowCommand(target, {"prompt": "x"})
    assert asyncio.run(gateway.run_workflow(command, actor=Actor("u1"))) == {"ok": True}
    assert seen == {"prompt": "x", "connection_id": "c1", "resource_id": "r1"}
