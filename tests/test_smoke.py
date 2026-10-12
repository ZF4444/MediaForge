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
    r = client.get("/static/dist/shared/theme.js")
    assert r.status_code == 200


@pytest.mark.parametrize(
    "path",
    [
        "/static/images/logo.png",
        "/static/images/zip-placeholder.svg",
        "/static/dist/styles/fonts.css",
    ],
)
def test_frontend_public_assets_keep_legacy_static_urls(client, path):
    response = client.get(path)
    assert response.status_code == 200


def test_storage_quota_page_keeps_legacy_url_and_module_entry(client):
    response = client.get("/static/storage-quota.html")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert 'type="module"' in response.text
    assert "onclick=" not in response.text
    assert "<style>" not in response.text


def test_workflow_config_page_keeps_legacy_url_and_module_entry(client):
    response = client.get("/static/workflow-config.html")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert 'type="module"' in response.text
    assert "onclick=" not in response.text
    assert "onchange=" not in response.text
    assert "/static/dist/shared/theme.js" not in response.text
    assert "theme.js" in response.text


def test_workflow_settings_page_keeps_legacy_url_and_module_entry(client):
    response = client.get("/static/workflow-settings.html")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert 'type="module"' in response.text
    assert "/static/vendor/js/lucide.js" not in response.text
    assert "/static/dist/shared/theme.js" not in response.text


def test_ai_connections_page_keeps_legacy_url_without_global_scripts(client):
    response = client.get("/static/ai-connections.html")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert 'type="module"' in response.text
    assert "/static/vendor/js/lucide.js" not in response.text
    assert "/static/dist/shared/theme.js" not in response.text


def test_my_account_page_keeps_legacy_url_without_inline_css_or_global_scripts(client):
    response = client.get("/static/my-account.html")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert 'type="module"' in response.text
    assert "<style>" not in response.text
    assert "/static/vendor/js/lucide.js" not in response.text
    assert "/static/dist/shared/theme.js" not in response.text


def test_user_data_migration_page_keeps_legacy_url_without_inline_handlers(client):
    response = client.get("/static/user-data-migration.html")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert 'type="module"' in response.text
    assert "onclick=" not in response.text
    assert "onchange=" not in response.text
    assert "/static/vendor/js/lucide.js" not in response.text


def test_user_management_page_keeps_legacy_url_without_inline_css_or_global_scripts(client):
    response = client.get("/static/user-management.html")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert 'type="module"' in response.text
    assert "<style>" not in response.text
    assert "/static/vendor/js/lucide.js" not in response.text
    assert "/static/dist/shared/theme.js" not in response.text


def test_canvas_manager_page_keeps_legacy_url_without_inline_handlers_or_global_scripts(client):
    response = client.get("/static/canvas-manager.html")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert 'type="module"' in response.text
    assert "onclick=" not in response.text
    assert "onerror=" not in response.text
    assert "/static/vendor/js/lucide.js" not in response.text
    assert "/static/dist/shared/theme.js" not in response.text


def test_access_control_page_keeps_legacy_url_without_inline_css_or_global_scripts(client):
    response = client.get("/static/access-control.html")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert 'type="module"' in response.text
    assert "<style>" not in response.text
    assert "/static/vendor/js/lucide.js" not in response.text
    assert "/static/dist/shared/theme.js" not in response.text


def test_feedback_admin_page_keeps_legacy_url_without_inline_css_or_global_scripts(client):
    response = client.get("/static/feedback-admin.html")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert 'type="module"' in response.text
    assert "<style>" not in response.text
    assert "onclick=" not in response.text
    assert "/static/vendor/js/lucide.js" not in response.text
    assert "/static/dist/shared/theme.js" not in response.text


def test_broadcast_admin_page_keeps_legacy_url_without_inline_css_or_global_scripts(client):
    response = client.get("/static/broadcast-admin.html")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert 'type="module"' in response.text
    assert "<style>" not in response.text
    assert "/static/vendor/js/marked-18.0.6.umd.js" not in response.text
    assert "/static/vendor/js/dompurify-3.4.12.min.js" not in response.text
    assert "/static/dist/shared/markdown-renderer.js" not in response.text


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


def test_legacy_providers_api_is_physically_removed(client):
    r = client.get("/api/providers", follow_redirects=False)
    # Authentication middleware runs before route matching for anonymous
    # requests. Route-table tests separately prove this endpoint is absent.
    assert r.status_code == 401


@pytest.mark.parametrize(
    "path",
    ["/api/ai/connections", "/api/canvases"],
)
def test_known_api_paths_registered(app, path):
    """这些业务路径必须存在于路由表中（防止拆分时漏注册 router）。"""
    registered = {getattr(r, "path", None) for r in app.routes}
    assert path in registered, f"路由 {path} 未注册"
