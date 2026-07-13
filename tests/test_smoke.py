"""冒烟测试 —— 验证认证中间件与关键端点的对外行为契约。

这些行为由 auth_middleware 决定，是用户可感知的页面/接口行为。
重构（拆分模块）不应改变它们。断言值来自重构前的真实响应基线。
"""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client(app):
    return TestClient(app)


def test_login_page_public(client):
    """登录页无需认证，返回 HTML。"""
    r = client.get("/login")
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "")


def test_static_asset_public(client):
    """静态资源无需认证。"""
    r = client.get("/static/js/theme.js")
    assert r.status_code == 200


def test_root_redirects_to_login_when_anonymous(client):
    """未登录访问首页 -> 302 重定向到 /login。"""
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers.get("location") == "/login"


def test_protected_api_returns_401_when_anonymous(client):
    """未登录访问受保护 API -> 401 JSON。"""
    r = client.get("/api/canvases", follow_redirects=False)
    assert r.status_code == 401
    assert "application/json" in r.headers.get("content-type", "")
    body = r.json()
    assert body.get("login_required") is True


def test_protected_providers_api_401_when_anonymous(client):
    r = client.get("/api/providers", follow_redirects=False)
    assert r.status_code == 401


@pytest.mark.parametrize(
    "path",
    ["/api/providers", "/api/canvases"],
)
def test_known_api_paths_registered(app, path):
    """这些业务路径必须存在于路由表中（防止拆分时漏注册 router）。"""
    registered = {getattr(r, "path", None) for r in app.routes}
    assert path in registered, f"路由 {path} 未注册"
