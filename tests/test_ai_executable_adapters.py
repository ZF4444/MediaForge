import asyncio

from app.ai.adapters import ComfyUIWorkflowAdapter, RunningHubAppAdapter
from app.ai.contracts import AppCommand, WorkflowCommand
from app.ai.domain import Connection, ExecutableResource, ResolvedTarget


def _target(protocol, kind, resource_id="r1"):
    connection = Connection("c1", "legacy", protocol, "test", "http://example.test", True)
    resource = ExecutableResource(resource_id, "c1", kind, "resource")
    return ResolvedTarget(connection, resource=resource)


def test_runninghub_adapter_submits_and_queries_task():
    calls = []
    async def submit(target, inputs):
        calls.append((target.resource.id, inputs)); return {"taskId": "t1"}
    async def query(target, task_id): return {"task_id": task_id, "status": "SUCCESS"}
    result = asyncio.run(RunningHubAppAdapter(submit, query).execute(_target("runninghub", "runninghub_app"), AppCommand(_target("runninghub", "runninghub_app"), {"prompt": "x"}), actor=None))
    assert result == {"task_id": "t1", "status": "SUCCESS"}
    assert calls == [("r1", {"prompt": "x"})]


def test_comfyui_adapter_rejects_non_workflow_target():
    async def execute(target, inputs): return inputs
    adapter = ComfyUIWorkflowAdapter(execute)
    target = _target("runninghub", "runninghub_app")
    try:
        asyncio.run(adapter.execute(target, WorkflowCommand(target, {}), actor=None))
    except ValueError as exc:
        assert "ComfyUI" in str(exc)
    else:
        raise AssertionError("expected resource protocol validation")
