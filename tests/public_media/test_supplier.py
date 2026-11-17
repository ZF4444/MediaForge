import asyncio
import hashlib
import json
from contextlib import asynccontextmanager
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.public_media.service import Service

from .test_network import gateway, nginx


@pytest.mark.parametrize("branch", ["cloudwise", "volcengine", "generic", "unknown"])
def test_supplier_body_download_query_and_duplicate_submission(real, monkeypatch, branch):
    import main
    from app.public_media import business, lifecycle

    async def authorize(owner, file_id, task_id, provider_id):
        assert (owner, task_id, provider_id) == ("alice", "task-a", "supplier")
        assert file_id in ("file-a", "file-b")
        return {
            "user_id": owner,
            "bucket": "media-test-versioned",
            "object_key": "allowed/input.mp4",
            "size": len(real["content"]),
            "ext": "mp4",
            "content_type": "video/mp4",
        }

    monkeypatch.setenv("APP_SECRET_KEY", "test-only-delivery-key-1234567890")
    calls = []
    reflected_secrets = []
    # All supplier traffic uses MockTransport; do not depend on external DNS.
    monkeypatch.setattr(main, "validate_public_http_url", lambda value, **kw: value)
    with gateway(real) as gw, nginx(real, gw["port"]) as edge:
        service = Service(replace(real["settings"], base_url=edge["base"]), real["writer"], real["reader"], authorize)
        monkeypatch.setattr(business, "authorize", authorize)
        monkeypatch.setattr(business, "get_service", lambda: service)
        monkeypatch.setattr(lifecycle, "repository", lambda: real["writer"])

        def supplier(request):
            calls.append(request.method)
            if request.method == "POST":
                body = json.loads(request.content)
                refs = body.get("videos") or [
                    item["video_url"]["url"] for item in body["content"] if item["type"] == "video_url"
                ]
                assert len(refs) == 2
                with httpx.Client(verify=edge["cert"], trust_env=False) as downloader:
                    for url in refs:
                        assert url.startswith(edge["base"] + "/fetch/v1/")
                        assert downloader.head(url).status_code == 200
                        response = downloader.get(url)
                        assert response.status_code == 200
                        assert hashlib.sha256(response.content).digest() == hashlib.sha256(real["content"]).digest()
                if branch == "unknown":
                    raise httpx.ReadTimeout("simulated lost submission acknowledgement", request=request)
                return httpx.Response(200, json={"id": "supplier-task-1", "echo": refs})
            return httpx.Response(
                200,
                json={
                    "id": "supplier-task-1",
                    "status": "succeeded",
                    "content": {"video_url": "https://result.test/output.mp4"},
                },
            )

        @asynccontextmanager
        async def client_factory(**kwargs):
            async with httpx.AsyncClient(transport=httpx.MockTransport(supplier)) as client:
                yield client

        async def poll(client, provider, task_id, submit_url):
            assert task_id == "supplier-task-1"
            response = await client.get("https://supplier.test/query/" + task_id)
            result = response.json()
            # A supplier may reflect only the query token rather than the URL.
            delivery = real["writer"].existing_delivery(
                "task-a", "supplier", "file-a", "test-only-delivery-key-1234567890"
            )
            reflected_secrets.append(delivery["token"])
            result["reflected_input"] = {"encoded": "token%3D" + delivery["token"], "bare": delivery["token"]}
            return result

        monkeypatch.setattr(main, "shared_http_client", client_factory)
        monkeypatch.setattr(main, "connection_api_key", lambda *a: "local-supplier-key")
        monkeypatch.setattr(main, "wait_for_video_task", poll)
        monkeypatch.setattr(main, "update_canvas_task", AsyncMock())
        monkeypatch.setattr(main, "save_remote_video_to_output", AsyncMock(return_value="/api/files/output-a/preview"))
        monkeypatch.setattr(main, "media_response_items", lambda *a: [])
        monkeypatch.setattr(main, "_attach_quota_warning_async", AsyncMock(side_effect=lambda result: result))
        provider = {
            "id": "supplier",
            "connection_id": "supplier",
            "billing_task_id": "task-a",
            "billing_user_id": "alice",
            "protocol": "volcengine" if branch == "volcengine" else "openai",
            "base_url": "https://api.cloudwise.ai" if branch in ("cloudwise", "unknown") else "https://supplier.test",
            "runtime_model": "doubao-seedance-2-0-260128" if branch != "generic" else "veo3",
        }
        payload = main.CanvasVideoRequest(
            prompt="local simulation", videos=["/api/files/file-a/preview", "/api/files/file-b/preview"]
        )
        if branch == "unknown":
            with pytest.raises(main.HTTPException):
                asyncio.run(main._canvas_video_impl(payload, provider))
            delivery = real["writer"].existing_delivery(
                "task-a", "supplier", "file-a", "test-only-delivery-key-1234567890"
            )
            assert delivery["submission_state"] == "submitting" and not delivery["upstream_id"]
            assert not real["writer"].settle_task("task-a", False)
            assert real["writer"].active_file("file-a")
            with pytest.raises(main.HTTPException):
                asyncio.run(main._canvas_video_impl(payload, provider))
            assert calls == ["POST"]
            return
        result = asyncio.run(main._canvas_video_impl(payload, provider))
        assert result["task_id"] == "supplier-task-1" and calls == ["POST", "GET"]
        assert "token=" not in json.dumps(result)
        assert all(secret not in json.dumps(result) for secret in reflected_secrets)
        rows = real["writer"].list_grants()["items"]
        assert all(row["upstream_id"] == "supplier-task-1" and row["state"] == "revoked" for row in rows)
        with pytest.raises(main.HTTPException):
            asyncio.run(main._canvas_video_impl(payload, provider))
        assert calls.count("POST") == 1  # Re-delivery/Worker restart never repeats simulated billing.
        real["writer"].set_policy("task", "task-a", False)
        assert (
            real["writer"].existing_delivery("task-a", "supplier", "file-a", "test-only-delivery-key-1234567890")
            is None
        )


def test_volcengine_asset_registration_has_operation_and_revokes_at_confirmed_end(real, monkeypatch):
    import main
    from app.ai.database_repository import DatabaseAIRepository
    from app.public_media import business, lifecycle
    from app.services import canvas_tasks, storage

    item = {"id": "asset-a", "name": "test video", "url": "/api/files/file-a/preview", "kind": "video"}
    library = {"items": [item]}
    operations, saved, downloaded = {}, [], []
    entry = {
        "user_id": "alice",
        "bucket": "media-test-versioned",
        "object_key": "allowed/input.mp4",
        "size": len(real["content"]),
        "ext": "mp4",
        "content_type": "video/mp4",
    }

    async def create_operation(task):
        operations[task["id"]] = task
        return task

    async def authorize(owner, file_id, task_id, provider_id):
        operation = operations[task_id]
        assert operation["kind"] == "media_asset_registration" and operation["owner_id"] == owner == "alice"
        assert operation["request"]["videos"] == [item["url"]] and provider_id == "supplier" and file_id == "file-a"
        return entry

    monkeypatch.setenv("APP_SECRET_KEY", "test-only-delivery-key-1234567890")
    monkeypatch.setenv("PUBLIC_VIDEO_ENABLED", "true")
    monkeypatch.setattr(main, "current_user_id", lambda: "alice")
    monkeypatch.setattr(main, "load_asset_library", lambda: library)
    monkeypatch.setattr(main, "save_asset_library", lambda value: saved.append(json.dumps(value)))
    monkeypatch.setattr(main, "find_asset_item_in_library", lambda *a: item)
    monkeypatch.setattr(storage, "get_file_by_id", lambda _: entry)
    monkeypatch.setattr(canvas_tasks, "create_canvas_task", create_operation)
    monkeypatch.setattr(
        DatabaseAIRepository,
        "connections",
        lambda *a, **kw: [
            SimpleNamespace(
                id="supplier",
                name="local simulation",
                protocol="volcengine",
                base_url="https://supplier.test",
                settings={},
            )
        ],
    )
    monkeypatch.setattr(lifecycle, "repository", lambda: real["writer"])
    with gateway(real) as gw, nginx(real, gw["port"]) as edge:
        service = Service(replace(real["settings"], base_url=edge["base"]), real["writer"], real["reader"], authorize)
        monkeypatch.setattr(business, "authorize", authorize)
        monkeypatch.setattr(business, "get_service", lambda: service)

        async def submit(url, *args, **kwargs):
            async with httpx.AsyncClient(verify=edge["cert"], trust_env=False) as supplier:
                response = await supplier.get(url)
                assert response.status_code == 200 and response.content == real["content"]
            downloaded.append(url)
            return "asset-upstream-1"

        monkeypatch.setattr(main, "submit_volcengine_avatar_asset", submit)
        payload = main.AssetAvatarRegisterRequest(connection_id="supplier")
        result = asyncio.run(main.register_asset_library_avatar("asset-a", payload))
        assert result["item"]["registrations"]["volcengine"]["task_id"] == "asset-upstream-1"
        assert len(operations) == 1 and len(downloaded) == 1 and "token=" not in "".join(saved)
        with pytest.raises(main.HTTPException):
            asyncio.run(main.register_asset_library_avatar("asset-a", payload))
        assert len(downloaded) == 1
        monkeypatch.setattr(
            main,
            "check_volcengine_avatar_task",
            AsyncMock(return_value={"status": "Active", "asset_uri": "asset://asset-upstream-1"}),
        )
        asyncio.run(main.check_asset_library_avatar("asset-a", payload))
        with httpx.Client(verify=edge["cert"], trust_env=False) as supplier:
            assert supplier.get(downloaded[0]).status_code == 404
