import asyncio

from app.ai.adapters import ComfyUIWorkflowAdapter, RunningHubAppAdapter
from app.ai.contracts import AppCommand, WorkflowCommand
from app.ai.domain import Connection, ExecutableResource, ModelResource, ResolvedTarget


def _target(protocol, kind, resource_id="r1"):
    connection = Connection("c1", protocol, "test", "http://example.test", True)
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


def test_comfyui_adapter_normalizes_stable_resource_payload():
    seen = {}
    async def execute(target, inputs):
        seen.update(inputs)
        return inputs
    target = _target("comfyui", "comfyui_workflow", "workflow-1")
    result = asyncio.run(ComfyUIWorkflowAdapter(execute).execute(
        target, WorkflowCommand(target, {"provider_id": "legacy", "model": "old", "prompt": "x"}), actor=None,
    ))
    assert result["connection_id"] == "c1"
    assert result["resource_id"] == "workflow-1"
    assert "provider_id" not in result and "model" not in result


def test_video_gateway_target_entry_uses_resolved_model(monkeypatch):
    from app.ai.videos import VideoGateway
    from app.ai.contracts import Actor, VideoCommand
    target = ResolvedTarget(
        Connection("c1", "openai", "Video", "https://example.test", True),
        model=ModelResource("m1", "c1", "veo", "video", "openai"),
    )
    seen = {}
    async def handler(command):
        seen["model"] = command.target.model.upstream_model
        return {"ok": True}
    async def budget(*_args): return None
    def no_governance(*_args, **_kwargs):
        class Context:
            async def __aenter__(self): return self
            async def __aexit__(self, *_exc): return False
        return Context()
    monkeypatch.setattr("app.ai.videos.connection_operation", no_governance)
    gateway = VideoGateway(
        target_handler=handler,
    )
    import asyncio
    assert asyncio.run(gateway.generate_target(VideoCommand(target, {}), actor=Actor("u1"))) == {"ok": True}
    assert seen == {"model": "veo"}


def test_volcengine_video_body_keeps_protocol_fields():
    from app.ai.adapters.video_protocol import volcengine_generation_body
    body = volcengine_generation_body(
        model="seedance", prompt="x", duration=5, ratio="16:9",
        resolution="720p", content=[{"type": "image_url"}], seed=7,
        generate_audio=True,
    )
    assert body["model"] == "seedance"
    assert body["duration"] == 5
    assert body["content"][0] == {"type": "text", "text": "x"}
    assert len(body["content"]) == 2
    assert body["generate_audio"] is True
