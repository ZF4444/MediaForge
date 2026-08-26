import json

from app.services.canvas_agent.event_types import event_envelope, normalize_event_type, sanitize_payload


def test_event_contract_rejects_unknown_types_and_redacts_secrets():
    try:
        normalize_event_type("unexpected.event")
    except ValueError:
        pass
    else:
        raise AssertionError("unknown event type must be rejected")
    payload = sanitize_payload({"api_key": "secret", "nested": {"Authorization": "token"}, "message": "ok"})
    assert payload == {"api_key": "[redacted]", "nested": {"Authorization": "[redacted]"}, "message": "ok"}


def test_event_envelope_has_stable_client_fields():
    envelope = event_envelope({"id": "evt", "run_id": "run", "sequence": 2, "type": "progress.agent", "created_at": 1, "payload_json": {"message": "working"}})
    assert envelope["schema_version"] == 1
    assert envelope["run_id"] == "run"
    assert envelope["payload"]["message"] == "working"


def test_worker_auth_context_is_available_in_to_thread():
    import asyncio
    from app.core.auth import current_user_id, current_user_var

    async def check() -> str:
        token = current_user_var.set("agent-owner")
        try:
            return await asyncio.to_thread(current_user_id)
        finally:
            current_user_var.reset(token)

    assert asyncio.run(check()) == "agent-owner"


def test_agent_task_projection_keeps_structured_media_and_clears_terminal_state(monkeypatch):
    from app.services.canvas_agent import events

    timer_values = iter([1000, 2000, 3000])
    monkeypatch.setattr(events, "now_ms", lambda: next(timer_values))
    node = {"id": "node-1", "type": "smart-image"}
    updates = []

    class Cursor:
        def execute(self, query, params=()):
            if "UPDATE smart_canvas_nodes" in query:
                projected = json.loads(params[0])
                updates.append(projected)
                node.clear()
                node.update(projected)
        def fetchone(self):
            if not hasattr(self, "calls"): self.calls = 0
            self.calls += 1
            if self.calls == 1: return {"canvas_id": "canvas-1"}
            if self.calls == 2: return {"data_json": node}
            return {"version": 2}
        def __enter__(self): return self
        def __exit__(self, *_): return False

    class Connection:
        def cursor(self): return Cursor()
        def transaction(self): return self
        def __enter__(self): return self
        def __exit__(self, *_): return False

    monkeypatch.setattr(events, "metadata_connection", lambda: Connection())
    queued = {"task_id": "task-1", "node_id": "node-1", "status": "queued", "kind": "image", "expected_count": 1}
    assert events._project_task_to_canvas("user", "run", queued) == 2
    assert updates[-1]["pendingTasks"] == [{"taskId": "task-1", "kind": "image", "providerId": "", "model": "", "expectedCount": 1, "status": "queued"}]
    assert updates[-1]["queued"] is True
    assert updates[-1]["runStartedAt"] > 0
    started_at = updates[-1]["runStartedAt"]

    assert events._project_task_to_canvas("user", "run", {"task_id": "task-1", "node_id": "node-1", "status": "running"}) == 2
    assert updates[-1]["pendingTasks"][0]["expectedCount"] == 1
    assert updates[-1]["running"] is True

    succeeded = {**queued, "status": "succeeded", "result": {"image_items": [{"file_id": "image-1", "natural_w": 864, "natural_h": 1536}]}}
    assert events._project_task_to_canvas("user", "run", succeeded) == 2
    assert updates[-1]["images"] == [{"file_id": "image-1", "natural_w": 864, "natural_h": 1536}]
    assert updates[-1]["pending"] == 0
    assert "pendingTasks" not in updates[-1]
    assert "queued" not in updates[-1]
    assert "running" not in updates[-1]
    assert updates[-1]["runStartedAt"] == started_at
    assert updates[-1]["runFinishedAt"] >= started_at
    assert updates[-1]["runElapsedMs"] >= 0

    rerun = {"task_id": "task-2", "node_id": "node-1", "status": "queued", "kind": "image", "expected_count": 1}
    assert events._project_task_to_canvas("user", "run", rerun) == 2
    assert updates[-1]["runStartedAt"] == 3000
