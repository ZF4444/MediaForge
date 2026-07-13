"""认证 / 会话 / 用户数据隔离。

从 main.py 的「认证 / 会话 / 用户数据隔离」区块原样迁移。
- 无密码登录：用户名 -> user_id，持久化会话 token。
- current_user_var：由 HTTP 认证中间件设置当前请求用户，数据路径解析器据此隔离。

依赖：app.config（路径常量），app.core.utils.now_ms。
本模块不引用 FastAPI app 对象，避免循环导入（中间件仍注册在 main.py）。
"""
import contextvars
import hashlib
import re
import secrets as _secrets
from threading import Lock
from typing import Any, Dict

from app.core.utils import now_ms
from app.services.business_metadata import metadata_connection

SESSION_COOKIE_NAME = "sid"
SESSION_MAX_AGE = 365 * 24 * 60 * 60  # 1 年：同一台电脑不用反复登录
# 当前请求的登录用户（由认证中间件设置），数据路径解析器据此隔离。
current_user_var: "contextvars.ContextVar[str]" = contextvars.ContextVar("current_user", default="")
# 用户注册表（无密码，仅记录已注册的用户名）。user_id -> {username, created_at}
USERS_LOCK = Lock()
USERS: Dict[str, Dict[str, Any]] = {}


def clean_user_id(raw: str) -> str:
    """把用户输入的用户名清洗成安全的目录名/用户标识。"""
    candidate = (raw or "").strip()
    candidate = re.sub(r"[^a-zA-Z0-9_.\u4e00-\u9fff-]", "-", candidate)[:60].strip(".-")
    return candidate


def load_users_registry():
    with USERS_LOCK:
        with metadata_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT id,username,created_at FROM users")
            loaded = {row["id"]: {"username": row["username"], "created_at": row["created_at"]} for row in cur.fetchall()}
        # Several routers import USERS directly, so preserve the shared object.
        USERS.clear()
        USERS.update(loaded)


def _persist_users_unlocked():
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        for uid, info in USERS.items():
            cur.execute("INSERT INTO users(id,username,created_at) VALUES(%s,%s,%s) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username", (uid, info.get("username") or uid, int(info.get("created_at") or now_ms())))


def user_exists(user_id: str) -> bool:
    with USERS_LOCK:
        return user_id in USERS


def register_user(user_id: str, username: str) -> bool:
    """注册新用户名；若已被占用返回 False。"""
    with USERS_LOCK:
        if user_id in USERS:
            return False
        created_at = now_ms()
        with metadata_connection() as conn, conn.cursor() as cur:
            cur.execute("INSERT INTO users(id,username,created_at) VALUES(%s,%s,%s) ON CONFLICT(id) DO NOTHING RETURNING id", (user_id, username, created_at))
            if not cur.fetchone():
                return False
        USERS[user_id] = {"username": username, "created_at": created_at}
    return True


def load_sessions():
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM user_sessions WHERE expires_at < %s", (now_ms(),))


def _token_hash(token: str) -> str:
    return hashlib.sha256(str(token).encode("utf-8")).hexdigest()


def create_session(user_id: str, username: str) -> str:
    token = _secrets.token_urlsafe(32)
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO user_sessions(token_hash,user_id,username,created_at,last_seen,expires_at) VALUES(%s,%s,%s,%s,%s,%s)", (_token_hash(token), user_id, username, now, now, now + SESSION_MAX_AGE * 1000))
    return token


def get_session(token: str):
    if not token:
        return None
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE user_sessions SET last_seen=%s WHERE token_hash=%s AND expires_at>%s RETURNING user_id,username,created_at,last_seen", (now, _token_hash(token), now))
        return cur.fetchone()


def destroy_session(token: str):
    if not token:
        return
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM user_sessions WHERE token_hash=%s", (_token_hash(token),))


def current_user_id() -> str:
    """返回当前请求的用户 id；未登录上下文回退到 'anonymous'（仅防御性兜底）。"""
    return current_user_var.get() or "anonymous"


def safe_user_id(user_id, request) -> str:
    """解析当前请求的用户 id。

    安全：始终使用认证中间件注入的当前登录用户，忽略前端传来的 X-User-Id（防伪造）。
    从 main.py 原样迁移，行为完全一致。
    """
    authed = current_user_var.get()
    if authed:
        return authed
    # 兜底（理论上中间件已拦截未登录请求，不应到达此处）。
    candidate = (user_id or "").strip()
    if not candidate and request and request.client:
        candidate = f"ip-{request.client.host}"
    candidate = re.sub(r"[^a-zA-Z0-9_.-]", "-", candidate)[:80].strip(".-")
    return candidate or "anonymous"
