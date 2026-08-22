"""HTTP-level integration tests for the Canvas Agent Fast Track lifecycle."""
import asyncio
import os
import uuid

import pytest

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="DATABASE_URL is required")


def test_canvas_agent_api_lifecycle_conflict_tasks_events_and_permissions(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.routers import canvas_agent
    from app.services.business_metadata import initialize_business_metadata, json_value, metadata_connection
    from app.services.canvas_agent.store import append_event, create_run, save_plan, update_run

    async def persist_event(user_id, run_id, event_type, payload=None):
        return await asyncio.to_thread(append_event, user_id, run_id, event_type, payload)

    monkeypatch.setattr(canvas_agent, "emit_agent_event", persist_event)
    submitted = []

    async def fake_submit(user_id, canvas_id, run_id, requests, *, prompt, prompts_by_node=None):
        run_requests = [item for item in requests if item.get("op") == "run_node"]
        if not run_requests:
            return []
        from app.services.business_metadata import load_canvas_payload
        canvas = await asyncio.to_thread(load_canvas_payload, user_id, canvas_id)
        assert any(node.get("type") == "smart-image" for node in canvas["nodes"])
        submitted.append({"run_id": run_id, "requests": requests, "prompt": prompt})
        return [{"task_id": "queued-task", "node_id": run_requests[0]["node_id"], "status": "queued"}]

    monkeypatch.setattr(canvas_agent, "submit_run_requests", fake_submit)
    app = FastAPI(); app.include_router(canvas_agent.router)

    def run_sync():
        initialize_business_metadata()
        uid = "api-agent-" + uuid.uuid4().hex[:12]; canvas_id = "api-canvas-" + uuid.uuid4().hex[:12]; now = 1000000000000
        headers = {"x-user-id": uid}
        try:
            with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
                cur.execute("INSERT INTO users(id,username,created_at) VALUES(%s,%s,%s)", (uid, uid, now))
                cur.execute("INSERT INTO smart_canvases(id,user_id,title,created_at,updated_at,version,viewport_json) VALUES(%s,%s,%s,%s,%s,1,%s)", (canvas_id, uid, "API integration", now, now, json_value({"viewport": {}, "payload": {}})))
            with TestClient(app) as client:
                # 1. Run -> plan -> confirmation applies a real atomic Patch.
                run = client.post("/api/canvas-agent/runs", json={"canvas_id": canvas_id}, headers=headers).json()["run"]
                planned_response = client.post(f"/api/canvas-agent/runs/{run['id']}/messages", json={"content": "创建广告提示词"}, headers=headers)
                assert planned_response.status_code == 200, planned_response.text
                planned = planned_response.json()
                assert planned["plan"]["status"] == "awaiting_confirmation"
                confirmed = client.post(f"/api/canvas-agent/runs/{run['id']}/confirm", json={"plan_version": planned["plan"]["version"], "approved": True}, headers=headers)
                assert confirmed.status_code == 200 and confirmed.json()["result"]["version"] == 2

                # 2. Structural canvas changes reject the old plan; retry permits re-planning.
                conflict_run = client.post("/api/canvas-agent/runs", json={"canvas_id": canvas_id}, headers=headers).json()["run"]
                conflict_plan = client.post(f"/api/canvas-agent/runs/{conflict_run['id']}/messages", json={"content": "创建广告提示词"}, headers=headers).json()["plan"]
                with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
                    cur.execute("INSERT INTO smart_canvas_nodes(id,canvas_id,node_type,sort_order,data_json,created_at,updated_at) VALUES(%s,%s,'smart-prompt',99,%s,%s,%s)", ("external-" + uuid.uuid4().hex[:8], canvas_id, json_value({"id": "external", "type": "smart-prompt", "text": "external"}), now, now))
                    cur.execute("UPDATE smart_canvases SET version=version+1 WHERE id=%s", (canvas_id,))
                rejected = client.post(f"/api/canvas-agent/runs/{conflict_run['id']}/confirm", json={"plan_version": conflict_plan["version"], "approved": True}, headers=headers)
                assert rejected.status_code == 409
                assert client.post(f"/api/canvas-agent/runs/{conflict_run['id']}/retry", json={}, headers=headers).status_code == 200
                assert client.post(f"/api/canvas-agent/runs/{conflict_run['id']}/messages", json={"content": "重新创建广告提示词"}, headers=headers).status_code == 200

                # 3. A run request is dispatched only after the Patch has committed.
                task_run = client.post("/api/canvas-agent/runs", json={"canvas_id": canvas_id}, headers=headers).json()["run"]
                task_plan = client.post(f"/api/canvas-agent/runs/{task_run['id']}/messages", json={"content": "生成图片"}, headers=headers).json()["plan"]
                queued = client.post(f"/api/canvas-agent/runs/{task_run['id']}/confirm", json={"plan_version": task_plan["version"], "approved": True}, headers=headers)
                assert queued.status_code == 200 and queued.json()["tasks"][0]["task_id"] == "queued-task"
                assert submitted and submitted[-1]["run_id"] == task_run["id"]

                # 4. Event clients can reconnect from a persisted sequence.
                append_event(uid, task_run["id"], "progress.agent", {"value": 1}); append_event(uid, task_run["id"], "progress.agent", {"value": 2})
                replay = client.get(f"/api/canvas-agent/runs/{task_run['id']}/events?after_sequence=1", headers=headers).json()["events"]
                assert [event["sequence"] for event in replay] == sorted(event["sequence"] for event in replay)
                assert all(event["sequence"] > 1 for event in replay)

                # 5. User nodes require exact, per-node authorization at confirmation.
                user_node_id = "user-node-" + uuid.uuid4().hex[:8]
                with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
                    cur.execute("INSERT INTO smart_canvas_nodes(id,canvas_id,node_type,sort_order,data_json,created_at,updated_at) VALUES(%s,%s,'smart-prompt',100,%s,%s,%s)", (user_node_id, canvas_id, json_value({"id": user_node_id, "type": "smart-prompt", "text": "owned"}), now, now))
                protected = create_run(uid, canvas_id)
                protected_plan = save_plan(uid, protected["id"], {"goal": "edit user node", "steps": [{"id": "edit", "action": "canvas.replace_node_content", "target_node_id": user_node_id, "node": {"semantic_type": "prompt", "content": "changed"}}]}, status="awaiting_confirmation")
                update_run(uid, protected["id"], status="awaiting_confirmation")
                forbidden = client.post(f"/api/canvas-agent/runs/{protected['id']}/confirm", json={"plan_version": protected_plan["version"], "approved": True}, headers=headers)
                assert forbidden.status_code == 409
                update_run(uid, protected["id"], status="awaiting_confirmation")
                allowed = client.post(f"/api/canvas-agent/runs/{protected['id']}/confirm", json={"plan_version": protected_plan["version"], "approved": True, "authorized_node_ids": [user_node_id]}, headers=headers)
                assert allowed.status_code == 200
        finally:
            with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
                cur.execute("DELETE FROM users WHERE id=%s", (uid,))

    async def run():
        from app.core.database import close_database_pool, open_database_pool
        await open_database_pool()
        try: await asyncio.to_thread(run_sync)
        finally: await close_database_pool()
    asyncio.run(run())


def test_canvas_agent_api_cancel_timeout_and_task_retry(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.routers import canvas_agent
    from app.services.business_metadata import initialize_business_metadata, json_value, metadata_connection
    from app.services.canvas_agent.store import create_run

    async def persist_event(*_args, **_kwargs): return {"sequence": 1}
    monkeypatch.setattr(canvas_agent, "emit_agent_event", persist_event)
    tasks = {
        "queued": {"id": "queued", "owner_id": "", "agent_run_id": "", "status": "queued"},
        "failed": {"id": "failed", "owner_id": "", "agent_run_id": "", "status": "failed", "attempt": 1},
        "timed-out": {"id": "timed-out", "owner_id": "", "agent_run_id": "", "status": "timed_out", "attempt": 1},
    }
    async def get_task(task_id): return dict(tasks[task_id]) if task_id in tasks else None
    async def update_task(task_id, *, expected_status="", **changes):
        task = tasks[task_id]
        if expected_status and task["status"] != expected_status: return None
        task.update(changes); return dict(task)
    async def noop(*_args, **_kwargs): return None
    monkeypatch.setattr(canvas_agent, "get_canvas_task", get_task); monkeypatch.setattr(canvas_agent, "update_canvas_task", update_task)
    monkeypatch.setattr(canvas_agent, "release_canvas_task_dispatch", noop); monkeypatch.setattr(canvas_agent, "enqueue_canvas_task", noop)
    app = FastAPI(); app.include_router(canvas_agent.router)

    def run_sync():
        initialize_business_metadata()
        uid = "api-task-" + uuid.uuid4().hex[:12]; canvas_id = "api-task-canvas-" + uuid.uuid4().hex[:12]; now = 1000000000000; headers = {"x-user-id": uid}
        try:
            with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
                cur.execute("INSERT INTO users(id,username,created_at) VALUES(%s,%s,%s)", (uid, uid, now))
                cur.execute("INSERT INTO smart_canvases(id,user_id,title,created_at,updated_at,version,viewport_json) VALUES(%s,%s,%s,%s,%s,1,%s)", (canvas_id, uid, "task", now, now, json_value({"viewport": {}, "payload": {}})))
            run = create_run(uid, canvas_id)
            for task in tasks.values(): task.update(owner_id=uid, agent_run_id=run["id"])
            from app.services.canvas_agent.store import update_run
            update_run(uid, run["id"], metadata_json={"task_ids": ["queued"]})
            with TestClient(app) as client:
                cancelled = client.post(f"/api/canvas-agent/runs/{run['id']}/cancel", headers=headers)
                assert cancelled.status_code == 200 and tasks["queued"]["status"] == "cancelled"
                retried = client.post(f"/api/canvas-agent/runs/{run['id']}/tasks/failed/retry", headers=headers)
                assert retried.status_code == 200 and tasks["failed"]["status"] == "queued" and tasks["failed"]["attempt"] == 2
                timed_out = client.post(f"/api/canvas-agent/runs/{run['id']}/tasks/timed-out/retry", headers=headers)
                assert timed_out.status_code == 200 and tasks["timed-out"]["status"] == "queued" and tasks["timed-out"]["attempt"] == 2
        finally:
            with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur: cur.execute("DELETE FROM users WHERE id=%s", (uid,))

    async def run():
        from app.core.database import close_database_pool, open_database_pool
        await open_database_pool()
        try: await asyncio.to_thread(run_sync)
        finally: await close_database_pool()
    asyncio.run(run())
