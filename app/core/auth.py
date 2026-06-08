"""认证 / 会话 / 用户数据隔离。

从 main.py 的「认证 / 会话 / 用户数据隔离」区块原样迁移。
- 无密码登录：用户名 -> user_id，持久化会话 token。
- current_user_var：由 HTTP 认证中间件设置当前请求用户，数据路径解析器据此隔离。

依赖：app.config（路径常量），app.core.utils.now_ms。
本模块不引用 FastAPI app 对象，避免循环导入（中间件仍注册在 main.py）。
"""
import contextvars
import json
import os
import re
import secrets as _secrets
from threading import Lock
from typing import Any, Dict

from app.config import DATA_DIR, SESSIONS_FILE, USERS_DIR, USERS_REGISTRY_FILE
from app.core.utils import now_ms

SESSION_LOCK = Lock()
SESSION_COOKIE_NAME = "sid"
SESSION_MAX_AGE = 365 * 24 * 60 * 60  # 1 年：同一台电脑不用反复登录
# 当前请求的登录用户（由认证中间件设置），数据路径解析器据此隔离。
current_user_var: "contextvars.ContextVar[str]" = contextvars.ContextVar("current_user", default="")
# token -> {user_id, username, created_at, last_seen}
SESSIONS: Dict[str, Dict[str, Any]] = {}

# 用户注册表（无密码，仅记录已注册的用户名）。user_id -> {username, created_at}
USERS_LOCK = Lock()
USERS: Dict[str, Dict[str, Any]] = {}


def clean_user_id(raw: str) -> str:
    """把用户输入的用户名清洗成安全的目录名/用户标识。"""
    candidate = (raw or "").strip()
    candidate = re.sub(r"[^a-zA-Z0-9_.\u4e00-\u9fff-]", "-", candidate)[:60].strip(".-")
    return candidate


def load_users_registry():
    global USERS
    with USERS_LOCK:
        if os.path.exists(USERS_REGISTRY_FILE):
            try:
                with open(USERS_REGISTRY_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    USERS = data
            except Exception:
                USERS = {}
        else:
            USERS = {}


def _persist_users_unlocked():
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = USERS_REGISTRY_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(USERS, f, ensure_ascii=False, indent=2)
        os.replace(tmp, USERS_REGISTRY_FILE)
    except Exception as e:
        print(f"[auth] persist users failed: {e}")


def user_exists(user_id: str) -> bool:
    with USERS_LOCK:
        return user_id in USERS


def register_user(user_id: str, username: str) -> bool:
    """注册新用户名；若已被占用返回 False。"""
    with USERS_LOCK:
        if user_id in USERS:
            return False
        USERS[user_id] = {"username": username, "created_at": now_ms()}
        _persist_users_unlocked()
    return True


def load_sessions():
    global SESSIONS
    with SESSION_LOCK:
        if os.path.exists(SESSIONS_FILE):
            try:
                with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    SESSIONS = data
            except Exception:
                SESSIONS = {}
        else:
            SESSIONS = {}


def _persist_sessions_unlocked():
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = SESSIONS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(SESSIONS, f, ensure_ascii=False)
        os.replace(tmp, SESSIONS_FILE)
    except Exception as e:
        print(f"[auth] persist sessions failed: {e}")


def create_session(user_id: str, username: str) -> str:
    token = _secrets.token_urlsafe(32)
    now = now_ms()
    with SESSION_LOCK:
        SESSIONS[token] = {
            "user_id": user_id,
            "username": username,
            "created_at": now,
            "last_seen": now,
        }
        _persist_sessions_unlocked()
    return token


def get_session(token: str):
    if not token:
        return None
    with SESSION_LOCK:
        sess = SESSIONS.get(token)
        if sess:
            sess["last_seen"] = now_ms()
        return dict(sess) if sess else None


def destroy_session(token: str):
    if not token:
        return
    with SESSION_LOCK:
        if token in SESSIONS:
            del SESSIONS[token]
            _persist_sessions_unlocked()


def current_user_id() -> str:
    """返回当前请求的用户 id；未登录上下文回退到 'anonymous'（仅防御性兜底）。"""
    return current_user_var.get() or "anonymous"


def user_data_dir() -> str:
    path = os.path.join(USERS_DIR, current_user_id())
    os.makedirs(path, exist_ok=True)
    return path


# 以下解析器替代原来的全局路径常量，实现按用户隔离（方案 A）。
def canvas_dir() -> str:
    path = os.path.join(user_data_dir(), "canvases")
    os.makedirs(path, exist_ok=True)
    return path


def conversation_base_dir() -> str:
    path = os.path.join(user_data_dir(), "conversations")
    os.makedirs(path, exist_ok=True)
    return path


def history_file() -> str:
    return os.path.join(user_data_dir(), "history.json")


def asset_library_path() -> str:
    return os.path.join(user_data_dir(), "asset_library.json")


def prompt_library_path() -> str:
    return os.path.join(user_data_dir(), "prompt_libraries.json")


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


def user_dir(user_id) -> str:
    """对话目录：data/users/<user_id>/conversations（从 main.py 原样迁移）。"""
    path = os.path.join(USERS_DIR, user_id, "conversations")
    os.makedirs(path, exist_ok=True)
    return path
