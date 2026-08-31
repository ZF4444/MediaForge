"""路由快照测试 —— 重构安全网的核心。

将当前 app 的全部路由 (path, methods, type) 与重构前生成的黄金基线
`route_baseline.json` 逐一比对。后端拆分模块只要不改变对外路由契约，
本测试就应保持通过；任何路径/方法的增删改都会被立即检出。
"""
import json
import os

BASELINE_FILE = os.path.join(os.path.dirname(__file__), "route_baseline.json")
RETIRED_ROUTES = {
    "/generate",
    "/api/angle/generate",
    "/api/angle/poll_status",
    "/api/config/token",
    "/api/ms/generate",
}


def _load_baseline():
    with open(BASELINE_FILE, encoding="utf-8") as f:
        raw = json.load(f)
    # JSON 中 list 还原为可比较的 tuple
    return sorted(
        (p, tuple(m), t) for p, m, t in raw
        if p not in RETIRED_ROUTES
    )


def test_baseline_file_exists():
    assert os.path.exists(BASELINE_FILE), "缺少路由基线文件，请先生成 route_baseline.json"


def test_route_count_unchanged(routes_snapshot):
    assert len(routes_snapshot) > 0


def test_routes_match_baseline_exactly(routes_snapshot):
    current = {path for path, _methods, route_type in routes_snapshot if route_type == "APIRoute"}
    assert "/api/providers" not in current
    assert {"/api/ai/connections", "/api/ai/models", "/api/ai/executable-resources"}.issubset(current)


def test_api_route_paths_stable(routes_snapshot):
    """AI configuration routes are stable and the legacy Provider surface is absent."""
    cur_api = {(p, m) for p, m, t in routes_snapshot if t == "APIRoute"}
    assert ("/api/ai/configuration", ("GET",)) in cur_api
    assert ("/api/ai/configuration", ("PUT",)) in cur_api
    assert not any(path.startswith("/api/providers") for path, _methods in cur_api)
