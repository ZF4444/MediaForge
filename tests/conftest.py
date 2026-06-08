"""pytest 公共夹具。

重构安全网：测试仅依赖 `main:app` 的对外契约（路由表 + 关键接口行为），
不依赖 main.py 的内部实现，因此后端逐模块拆分后这些测试应保持通过。
"""
import os
import sys

import pytest

# 确保可从项目根导入 main / app
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


@pytest.fixture(scope="session")
def app():
    import main
    return main.app


@pytest.fixture(scope="session")
def routes_snapshot(app):
    """收集全部路由的 (path, methods, type) 规范化快照。"""
    snap = []
    for r in app.routes:
        methods = sorted(getattr(r, "methods", []) or [])
        path = getattr(r, "path", None)
        snap.append((path, tuple(methods), type(r).__name__))
    snap.sort()
    return snap
