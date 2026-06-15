"""页面与认证路由（/、/login、/auth/*）。

从 main.py 原样迁移。URL/请求响应模型/状态码完全一致。
注意：
- auth_middleware（HTTP 中间件）与 /ws/stats（WebSocket）注册在 app 上、依赖 manager，
  仍保留在 main.py。
- /static/{page}.html 路由与 StaticFiles 挂载相邻、与静态挂载一同保留在 main.py，
  其使用的 static_html_response 等 helper 在本模块定义并被 main.py import-back。

依赖：
- app.config：BASE_DIR / STATIC_DIR
- app.core.auth：会话/用户注册等
- app.models：LoginRequest
"""
import os
import re
import time
import urllib.parse

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response

from app.config import BASE_DIR, STATIC_DIR
from app.core.auth import (
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE,
    clean_user_id,
    create_session,
    destroy_session,
    get_session,
    register_user,
    user_exists,
)
from app.models import LoginRequest

router = APIRouter()


def current_app_version():
    version_file = os.path.join(BASE_DIR, "VERSION")
    try:
        if os.path.exists(version_file):
            with open(version_file, "r", encoding="utf-8") as f:
                version = (f.read().strip().splitlines() or [""])[0].strip()
                if version:
                    return version
    except Exception:
        pass
    try:
        return time.strftime("%Y.%m.%d", time.localtime())
    except Exception:
        return ""


def versioned_static_html(html: str) -> str:
    version = current_app_version()
    if not version:
        return html
    safe_version = urllib.parse.quote(version, safe="._-")
    pattern = re.compile(r'(?P<prefix>(?:src|href)=["\']|@import\s+url\(["\'])(?P<url>/static/[^"\')?#]+(?:\.(?:js|css|html)))(?:\?v=[^"\')#]*)?', re.I)
    return pattern.sub(lambda m: f"{m.group('prefix')}{m.group('url')}?v={safe_version}", html)


def sync_static_html_versions():
    # 已弃用：不再把版本号写回磁盘文件，避免污染 git diff。
    # 版本号改为在请求时由 versioned_static_html() 动态注入。
    return


def static_html_response(filename: str):
    path = os.path.join(STATIC_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    return Response(
        versioned_static_html(html),
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": "no-cache"},
    )


def _issue_session_response(user_id: str, username: str):
    token = create_session(user_id, username)
    resp = JSONResponse({"ok": True, "user_id": user_id, "username": username})
    resp.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return resp


@router.get("/")
async def index():
    return static_html_response("index.html")


@router.get("/login")
async def login_page(request: Request):
    # 已登录则直接回首页
    token = request.cookies.get(SESSION_COOKIE_NAME, "")
    if token and get_session(token):
        return RedirectResponse(url="/", status_code=302)
    return static_html_response("login.html")


@router.post("/auth/register")
async def auth_register(payload: LoginRequest):
    user_id = clean_user_id(payload.username)
    if not user_id:
        raise HTTPException(status_code=400, detail="用户名无效，请输入字母、数字或中文。")
    if len(user_id) < 5:
        raise HTTPException(status_code=400, detail="用户名至少需要 5 位。")
    username = payload.username.strip()[:60]
    if not register_user(user_id, username):
        raise HTTPException(status_code=409, detail="该用户名已被占用，请换一个或直接登录。")
    return _issue_session_response(user_id, username)


@router.post("/auth/login")
async def auth_login(payload: LoginRequest):
    user_id = clean_user_id(payload.username)
    if not user_id:
        raise HTTPException(status_code=400, detail="用户名无效，请输入字母、数字或中文。")
    if not user_exists(user_id):
        raise HTTPException(status_code=404, detail="该用户名尚未注册，请先注册。")
    username = payload.username.strip()[:60]
    return _issue_session_response(user_id, username)


@router.post("/auth/logout")
async def auth_logout(request: Request):
    token = request.cookies.get(SESSION_COOKIE_NAME, "")
    destroy_session(token)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return resp


@router.get("/auth/sso")
async def auth_sso(request: Request):
    """飞书等外部平台 SSO 跳转入口。

    接收 query 参数中的用户信息，自动注册（若首次）并登录，然后 302 重定向到首页。
    示例: /auth/sso?username=张三&user_id=feishu_ou_xxxx
    """
    raw_username = request.query_params.get("username", "").strip()
    raw_user_id = request.query_params.get("user_id", "").strip()

    # 优先使用平台传来的 user_id，否则从 username 派生
    user_id = clean_user_id(raw_user_id) if raw_user_id else clean_user_id(raw_username)
    if not user_id:
        raise HTTPException(status_code=400, detail="缺少有效的用户标识(username 或 user_id)")

    username = raw_username or user_id

    # 自动注册（若不存在），已存在则同步 username
    if not user_exists(user_id):
        register_user(user_id, username)
    else:
        from app.core.auth import USERS, USERS_LOCK, _persist_users_unlocked
        with USERS_LOCK:
            if USERS.get(user_id, {}).get("username") != username:
                USERS[user_id]["username"] = username
                _persist_users_unlocked()

    # 创建 session 并设置 cookie，重定向到首页
    token = create_session(user_id, username)
    resp = RedirectResponse(url="/", status_code=302)
    resp.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return resp


@router.get("/auth/me")
async def auth_me(request: Request):
    token = request.cookies.get(SESSION_COOKIE_NAME, "")
    sess = get_session(token) if token else None
    if not sess:
        return JSONResponse({"authenticated": False}, status_code=401)
    return {
        "authenticated": True,
        "user_id": sess.get("user_id"),
        "username": sess.get("username") or sess.get("user_id"),
    }
