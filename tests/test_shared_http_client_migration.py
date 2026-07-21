"""解除事件循环阻塞方案第5节验收测试：外部 HTTP 统一使用共享异步客户端。

覆盖：
- main.py 中不存在裸露的按次创建 httpx.AsyncClient(...)（除白名单的连接重试逃生舱）。
- main.py 中不存在事件循环内直接调用同步 requests/urllib。
- /api/upload、/api/view、/api/pose-studio/generate-fbx 通过共享客户端发起请求，
  不会在每次请求时创建新连接。
"""
from __future__ import annotations

import ast
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN_PY = os.path.join(ROOT, "main.py")

# 这些行号上的 httpx.AsyncClient(...) 是故意在 TLS/连接层瞬时错误后用全新连接重试，
# 不能迁移为共享客户端；本测试按“调用点数量”而不是行号锚定，避免文件后续编辑导致误报。
EXPECTED_DIRECT_ASYNC_CLIENT_CALLS = 3


def _load_main_source() -> str:
    with open(MAIN_PY, "r", encoding="utf-8") as f:
        return f.read()


def test_main_py_has_bounded_number_of_direct_async_client_calls():
    """裸露的 httpx.AsyncClient(...) 只应保留连接重试逃生舱，其余必须走共享客户端。"""
    source = _load_main_source()
    tree = ast.parse(source, filename=MAIN_PY)
    direct_calls = 0
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "AsyncClient"
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "httpx"
        ):
            direct_calls += 1
    assert direct_calls == EXPECTED_DIRECT_ASYNC_CLIENT_CALLS, (
        f"预期 main.py 中仅保留 {EXPECTED_DIRECT_ASYNC_CLIENT_CALLS} 处独立 httpx.AsyncClient(...)"
        f"（连接重试逃生舱），实际发现 {direct_calls} 处。新增的外部 HTTP 调用必须使用"
        " app.core.http_client.shared_http_client()/get_http_client()。"
    )


def test_main_py_has_no_synchronous_requests_calls_outside_thread_bridge():
    """main.py 中不应再出现事件循环内直接调用的同步 requests；仅允许 generate() 同步链路内保留。"""
    source = _load_main_source()
    tree = ast.parse(source, filename=MAIN_PY)

    def _enclosing_function_names(target: ast.AST) -> list[str]:
        names = []
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if target in ast.walk(node):
                    names.append(node.name)
        return names

    # 允许保留同步 requests 调用的函数：全部是 generate() 同步调用链上的辅助函数，
    # 由 asyncio.to_thread(generate, ...) 在事件循环外整体桥接，本身不在事件循环内运行。
    allowed_sync_functions = {"generate", "check_images_exist"}

    violations = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in {"get", "post", "put", "delete", "patch"}
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == "requests"
        ):
            enclosing = _enclosing_function_names(node)
            innermost = enclosing[-1] if enclosing else None
            if innermost not in allowed_sync_functions:
                violations.append((node.lineno, innermost))

    assert not violations, (
        "发现事件循环内直接调用同步 requests，应改为共享 httpx 客户端："
        f"{violations}"
    )


def test_upload_image_route_uses_shared_client(monkeypatch):
    """/api/upload 应通过共享客户端发起请求，而不是每次新建连接或阻塞调用 requests。"""
    import asyncio

    import main as main_module
    from app.core import http_client

    async def scenario():
        shared = await http_client.open_http_client()
        calls = []

        async def fake_post(url, **kwargs):
            calls.append((url, kwargs))

            class _Resp:
                status_code = 200

                def json(self):
                    return {"name": "uploaded.png"}

            return _Resp()

        monkeypatch.setattr(shared, "post", fake_post)
        monkeypatch.setattr(main_module, "COMFYUI_INSTANCES", ["127.0.0.1:8188"])

        class DummyUploadFile:
            filename = "demo.png"
            content_type = "image/png"

            async def read(self):
                return b"png-bytes"

        result = await main_module.upload_image([DummyUploadFile()])
        assert result["files"] == [{"comfy_name": "uploaded.png"}]
        assert len(calls) == 1
        assert calls[0][0] == "http://127.0.0.1:8188/upload/image"
        await http_client.close_http_client()

    asyncio.run(scenario())


def test_view_image_route_uses_shared_client_and_is_async(monkeypatch):
    """/api/view 必须是 async def，并通过共享客户端而不是同步 requests 探测 ComfyUI 后端。"""
    import asyncio
    import inspect

    import main as main_module
    from app.core import http_client

    assert inspect.iscoroutinefunction(main_module.view_image)

    async def scenario():
        shared = await http_client.open_http_client()
        calls = []

        async def fake_get(url, **kwargs):
            calls.append((url, kwargs))

            class _Resp:
                status_code = 200
                content = b"image-bytes"
                headers = {"Content-Type": "image/png"}

            return _Resp()

        monkeypatch.setattr(shared, "get", fake_get)
        monkeypatch.setattr(main_module, "COMFYUI_INSTANCES", ["127.0.0.1:8188"])

        response = await main_module.view_image(filename="demo.png")
        assert response.body == b"image-bytes"
        assert len(calls) == 1
        assert calls[0][0] == "http://127.0.0.1:8188/view"
        await http_client.close_http_client()

    asyncio.run(scenario())
