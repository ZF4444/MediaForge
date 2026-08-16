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
    baseline = _load_baseline()
    assert len(routes_snapshot) == len(baseline), (
        f"路由总数变化: 当前 {len(routes_snapshot)} != 基线 {len(baseline)}"
    )


def test_routes_match_baseline_exactly(routes_snapshot):
    baseline = _load_baseline()
    current = set(routes_snapshot)
    expected = set(baseline)

    missing = expected - current  # 基线有、现在没了
    added = current - expected    # 现在多出来的

    assert not missing and not added, (
        f"路由契约发生变化。\n  丢失的路由: {sorted(missing)}\n  新增的路由: {sorted(added)}"
    )


def test_api_route_paths_stable(routes_snapshot):
    """单独校验业务 API 路径集合稳定（不含 Mount / docs 等）。"""
    baseline = _load_baseline()
    cur_api = {(p, m) for p, m, t in routes_snapshot if t == "APIRoute"}
    base_api = {(p, m) for p, m, t in baseline if t == "APIRoute"}
    assert cur_api == base_api, (
        f"API 路由变化:\n  丢失: {sorted(base_api - cur_api)}\n  新增: {sorted(cur_api - base_api)}"
    )
