import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.public_media.business import authorize
from app.public_media.config import Denied
from app.public_media.service import Service
from app.routers import public_video_links as routes


def assert_outside_event_loop():
    with pytest.raises(RuntimeError, match="no running event loop"):
        asyncio.get_running_loop()


def test_management_page_and_static_aliases_require_session_and_page_permission(monkeypatch):
    import main

    monkeypatch.setattr(main, "get_session", AsyncMock(return_value={"user_id": "alice", "username": "Alice"}))

    def page_access(*args):
        assert_outside_event_loop()
        return False

    monkeypatch.setattr(main.access_control, "has_page_access", page_access)
    # No lifespan is started: this checks real middleware without touching the
    # shared development database, Redis or background workers.
    client = TestClient(main.app)
    paths = (
        "/static/public-video-links.html",
        "/static//public-video-links.html",
        "/static/%2e/public-video-links.html",
    )
    try:
        for path in paths:
            assert client.get(path, follow_redirects=False).status_code == 302
        client.cookies.set(main.SESSION_COOKIE_NAME, "local-session-for-page-test")
        for path in paths:
            assert client.get(path).status_code == 403
        monkeypatch.setattr(main.access_control, "has_page_access", lambda *args: True)
        # CI builds this file before Python checks; a source-only checkout may
        # return 404, but it must reach the authorized file handler.
        assert client.get(paths[0]).status_code in (200, 404)
    finally:
        client.close()


def test_management_permissions_run_outside_event_loop(monkeypatch):
    identity = {"admin": False, "page": True}

    def permission(key):
        def check(*args):
            assert_outside_event_loop()
            return identity[key]

        return check

    monkeypatch.setattr(routes, "current_user_id", lambda: "alice")
    monkeypatch.setattr(routes, "has_page_access", permission("page"))
    monkeypatch.setattr(routes, "is_admin", permission("admin"))
    repository = SimpleNamespace(
        list_grants=lambda owner, *args: {"items": [], "owner": owner},
        policies=lambda: [],
        revoke=lambda grant, owner: None,
    )
    monkeypatch.setattr(routes, "get_service", lambda: SimpleNamespace(repo=repository))
    app = FastAPI()
    app.include_router(routes.router)
    with TestClient(app) as client:
        response = client.get("/api/public-video-grants")
        assert response.status_code == 200
        assert response.json()["owner"] == "alice"
        assert client.get("/api/admin/public-video-policy").status_code == 403
        identity["admin"] = True
        assert client.get("/api/public-video-grants").json()["owner"] is None
        assert client.get("/api/admin/public-video-policy").status_code == 200
        headers = {"Origin": "http://testserver", "X-MediaForge-Request": "1"}
        for scope in ("user", "provider"):
            assert (
                client.put(
                    "/api/admin/public-video-policy",
                    json={"scope": scope, "key": "alice", "enabled": True},
                    headers=headers,
                ).status_code
                == 422
            )
            assert (
                client.post(
                    "/api/admin/public-video-grants/revoke-batch",
                    json={"scope": scope, "key": "alice"},
                    headers=headers,
                ).status_code
                == 422
            )
        assert client.post("/api/public-video-grants/grant-a/revoke", headers=headers).status_code == 200
        identity["page"] = False
        assert client.get("/api/public-video-grants").status_code == 403


def test_business_authorization_rejects_preview_only_and_mismatched_context(monkeypatch):
    from app.ai import database_repository
    from app.core import access_control, auth
    from app.services import canvas_tasks, storage

    task = {
        "id": "task-a",
        "owner_id": "alice",
        "status": "running",
        "connection_id": "supplier",
        "model_id": "video-model",
        "request": {"videos": ["/api/files/file-a/preview"]},
    }
    entry = {"file_id": "file-a", "user_id": "alice", "status": "ready", "is_public": True}
    monkeypatch.setattr(auth, "user_exists", lambda uid: True)
    monkeypatch.setattr(canvas_tasks, "get_canvas_task", AsyncMock(side_effect=lambda _: task))
    monkeypatch.setattr(storage, "get_file_by_id", lambda _: entry)
    monkeypatch.setattr(
        database_repository.DatabaseAIRepository,
        "resolve_model",
        lambda *a, **kw: SimpleNamespace(
            connection=SimpleNamespace(id="supplier", enabled=True, settings={}),
            model=SimpleNamespace(id="video-model", upstream_model="video", enabled=True, settings={}),
        ),
    )
    monkeypatch.setattr(access_control, "is_model_allowed", lambda *a, **kw: True)
    assert asyncio.run(authorize("alice", "file-a", "task-a", "supplier")) == entry
    for args in (
        ("bob", "file-a", "task-a", "supplier"),
        ("alice", "file-b", "task-a", "supplier"),
        ("alice", "file-a", "task-a", "other"),
    ):
        with pytest.raises(Denied):
            asyncio.run(authorize(*args))
    entry["user_id"] = "bob"  # Public preview does not confer external distribution rights.
    with pytest.raises(Denied):
        asyncio.run(authorize("alice", "file-a", "task-a", "supplier"))
    entry["user_id"] = "alice"
    task["status"] = "succeeded"
    with pytest.raises(Denied):
        asyncio.run(authorize("alice", "file-a", "task-a", "supplier"))


def test_management_http_ownership_csrf_and_safe_lists(real, monkeypatch):
    async def authorized(owner, file_id, task_id, provider):
        if owner != "alice":
            raise Denied("owner mismatch")
        return {
            "file_id": file_id,
            "bucket": "media-test-versioned",
            "object_key": "allowed/input.mp4",
            "size": len(real["content"]),
            "ext": "mp4",
            "content_type": "video/mp4",
        }

    service = Service(real["settings"], real["writer"], real["reader"], authorized)
    monkeypatch.setattr(routes, "get_service", lambda: service)
    identity = {"uid": "alice", "admin": False, "page": True}
    monkeypatch.setattr(routes, "current_user_id", lambda: identity["uid"])
    monkeypatch.setattr(routes, "has_page_access", lambda *a: identity["page"])
    monkeypatch.setattr(routes, "is_admin", lambda *a: identity["admin"])
    app = FastAPI()
    app.include_router(routes.router)
    headers = {"X-MediaForge-Request": "1", "Origin": "http://testserver"}
    with TestClient(app) as client:
        body = {"file_id": "file-a", "task_id": "task-a", "provider_id": "supplier"}
        assert client.post("/api/public-video-sources", json=body).status_code == 403
        assert (
            client.post(
                "/api/public-video-sources", json=body, headers={**headers, "Origin": "https://evil.test"}
            ).status_code
            == 403
        )
        assert (
            client.post("/api/public-video-sources", json={**body, "bucket": "evil"}, headers=headers).status_code
            == 422
        )
        source = client.post("/api/public-video-sources", json=body, headers=headers).json()
        endpoint = f"/api/public-video-sources/{source['id']}/grants"
        first = client.post(endpoint, json={"idempotency_key": "request-123"}, headers=headers)
        assert first.status_code == 200 and first.headers["cache-control"] == "no-store"
        grant = first.json()
        token = grant["url"].split("token=")[1]
        assert client.post(endpoint, json={"idempotency_key": "request-123"}, headers=headers).status_code == 409
        listing = client.get("/api/public-video-grants")
        assert token not in listing.text and "object_key" not in listing.text and "token_hash" not in listing.text
        identity["uid"] = "bob"
        assert client.get("/api/public-video-grants").json()["items"] == []
        assert (
            client.post(endpoint, json={"idempotency_key": "another-123", "rotate": True}, headers=headers).status_code
            == 403
        )
        assert client.post(f"/api/public-video-grants/{grant['id']}/revoke", headers=headers).status_code == 403
        assert client.get("/api/admin/public-video-policy").status_code == 403
        identity["page"] = False
        assert client.get("/api/public-video-grants").status_code == 403
        identity.update(uid="admin", admin=True, page=True)
        assert (
            client.post(
                "/api/admin/public-video-grants/revoke-batch", json={"scope": "global", "key": "*"}, headers=headers
            ).status_code
            == 422
        )
        assert (
            client.put(
                "/api/admin/public-video-policy",
                json={"scope": "global", "key": "bad", "enabled": True},
                headers=headers,
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/api/admin/public-video-grants/revoke-batch", json={"scope": "file", "key": "file-a"}, headers=headers
            ).status_code
            == 200
        )
        assert client.get("/api/admin/public-video-policy").status_code == 200
