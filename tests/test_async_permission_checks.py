"""Permission checks hit PostgreSQL through a sync bridge that refuses to run on the event loop.

Endpoints declared ``async def`` must therefore run them via ``asyncio.to_thread``. These tests
reproduce the production bridge behaviour: reading the permission version raises when called
from the event-loop thread.
"""

import asyncio
import threading

import pytest
from fastapi import HTTPException

import main
from app.core import access_control
from app.core.auth import current_user_var


@pytest.fixture
def loop_guarded_permissions(monkeypatch):
    loop_thread = {}

    def version(_key):
        if threading.get_ident() == loop_thread["id"]:
            raise RuntimeError("事件循环中禁止使用同步数据库桥；请 await database_connection()")
        return 1

    monkeypatch.setattr(access_control, "_ACCESS_CONTROL_CACHE", None)
    monkeypatch.setattr(access_control, "_ACCESS_CONTROL_VERSION", None)
    monkeypatch.setattr(access_control, "get_app_setting_version", version)
    monkeypatch.setattr(
        access_control,
        "get_app_setting_with_version",
        lambda *_args: (
            {"types": {"viewer": {"name": "viewer", "pages": [], "models": []}}, "user_types": {"alice": "viewer"}},
            1,
        ),
    )
    return loop_thread


def _run(coro_factory, loop_thread, user_id):
    async def runner():
        loop_thread["id"] = threading.get_ident()
        token = current_user_var.set(user_id)
        try:
            return await coro_factory()
        finally:
            current_user_var.reset(token)

    return asyncio.run(runner())


def test_guard_fixture_rejects_direct_call_on_event_loop(loop_guarded_permissions):
    async def direct():
        return main.require_api_settings_access()

    with pytest.raises(RuntimeError, match="事件循环中禁止"):
        _run(direct, loop_guarded_permissions, "alice")


@pytest.mark.parametrize(
    "endpoint,args",
    [
        (main.ai_configuration, ()),
        (main.save_ai_configuration, ({},)),
        (main.update_ai_executable_resource, ("r1", {})),
        (main.ai_connection_discover, ("c1",)),
        (main.ai_connection_test, ("c1",)),
        (main.validate_canvas_parameter_schema, ({},)),
        (main.admin_list_canvas_task_dead_letters, ()),
        (main.admin_retry_canvas_task_dead_letter, ("e1",)),
        (main.admin_cancel_canvas_task_dead_letter, ("e1",)),
    ],
)
def test_permission_gated_async_endpoints_do_not_block_event_loop(loop_guarded_permissions, endpoint, args):
    # A user without the page permission must get a clean 403, not a RuntimeError/500.
    with pytest.raises(HTTPException) as exc:
        _run(lambda: endpoint(*args), loop_guarded_permissions, "alice")
    assert exc.value.status_code == 403


@pytest.mark.parametrize(
    "endpoint", [main.get_canvas_image_task, main.get_canvas_comfy_task, main.get_canvas_runninghub_task]
)
def test_task_query_admin_check_does_not_block_event_loop(loop_guarded_permissions, monkeypatch, endpoint):
    async def foreign_task(_task_id):
        return {"owner_id": "someone-else", "type": "online-image", "status": "running"}

    monkeypatch.setattr(main, "get_canvas_task", foreign_task)
    with pytest.raises(HTTPException) as exc:
        _run(lambda: endpoint("t1"), loop_guarded_permissions, "alice")
    assert exc.value.status_code == 403


def test_announcement_create_does_not_block_event_loop(loop_guarded_permissions):
    from app.models import AnnouncementPayload
    from app.routers import announcement

    with pytest.raises(HTTPException) as exc:
        _run(
            lambda: announcement.announcement_create(AnnouncementPayload(content="hello")),
            loop_guarded_permissions,
            "alice",
        )
    assert exc.value.status_code == 403


def test_access_control_async_routes_do_not_block_event_loop(loop_guarded_permissions):
    from starlette.requests import Request

    from app.routers import access_control as router

    request = Request({"type": "http", "headers": [], "method": "GET", "path": "/"})
    for factory in (lambda: router.access_control_sessions(request), lambda: router.access_control_delete_user("bob")):
        with pytest.raises(HTTPException) as exc:
            _run(factory, loop_guarded_permissions, "alice")
        assert exc.value.status_code == 403
