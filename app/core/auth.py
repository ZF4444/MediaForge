"""认证 / 会话 / 用户数据隔离。

从 main.py 的「认证 / 会话 / 用户数据隔离」区块原样迁移。
- 无密码登录：用户名 -> user_id，持久化会话 token。
- current_user_var：由 HTTP 认证中间件设置当前请求用户，数据路径解析器据此隔离。

依赖：app.config（路径常量），app.core.utils.now_ms。
本模块不引用 FastAPI app 对象，避免循环导入（中间件仍注册在 main.py）。
"""
import asyncio
import contextvars
import hashlib
import json
import math
import re
import secrets as _secrets
from threading import Lock
from typing import Any, Dict

from redis.exceptions import RedisError

from app.config import (
    REDIS_LAST_SEEN_FLUSH_INTERVAL_SECONDS,
    REDIS_LAST_SEEN_WRITE_INTERVAL_SECONDS,
    REDIS_SESSION_PREFIX,
)
from app.core.database import database_connection
from app.core.logging import get_logger
from app.core.metrics import AUTH_SESSION_CACHE_REQUESTS, REDIS_OPERATION_SECONDS
from app.core.redis_client import RedisUnavailableError, get_redis_client
from app.core.utils import now_ms
from app.services.business_metadata import metadata_connection

SESSION_COOKIE_NAME = "sid"
SESSION_MAX_AGE = 365 * 24 * 60 * 60  # 1 年：同一台电脑不用反复登录
# 当前请求的登录用户（由认证中间件设置），数据路径解析器据此隔离。
current_user_var: "contextvars.ContextVar[str]" = contextvars.ContextVar("current_user", default="")
# 用户注册表（无密码，仅记录已注册的用户名）。user_id -> {username, created_at}
USERS_LOCK = Lock()
USERS: Dict[str, Dict[str, Any]] = {}
logger = get_logger("auth")
_LAST_SEEN_DIRTY_KEY = f"{REDIS_SESSION_PREFIX}last_seen_dirty"


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


def _session_key(token_hash: str) -> str:
    return f"{REDIS_SESSION_PREFIX}{token_hash}"


def _session_payload(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "user_id": str(row.get("user_id") or ""),
        "username": str(row.get("username") or ""),
        "created_at": int(row.get("created_at") or 0),
        "last_seen": int(row.get("last_seen") or 0),
        "expires_at": int(row.get("expires_at") or 0),
    }


def _redis_unavailable(operation: str, exc: BaseException) -> RedisUnavailableError:
    logger.warning(
        "Redis authentication operation failed",
        extra={"event": "redis_auth_operation_failed", "operation": operation, "error_type": type(exc).__name__},
    )
    return RedisUnavailableError("Redis 认证缓存暂时不可用")


async def _cache_session(token_hash: str, session: Dict[str, Any], *, mark_dirty: bool) -> None:
    ttl_seconds = max(1, math.ceil((int(session["expires_at"]) - now_ms()) / 1000))
    client = get_redis_client()
    try:
        with REDIS_OPERATION_SECONDS.labels(operation="session_write").time():
            pipeline = client.pipeline(transaction=False)
            pipeline.set(_session_key(token_hash), json.dumps(session, separators=(",", ":")), ex=ttl_seconds)
            if mark_dirty:
                pipeline.zadd(_LAST_SEEN_DIRTY_KEY, {token_hash: int(session["last_seen"])})
            await pipeline.execute()
    except RedisError as exc:
        raise _redis_unavailable("session_write", exc) from exc


async def create_session(user_id: str, username: str) -> str:
    token = _secrets.token_urlsafe(32)
    now = now_ms()
    token_hash = _token_hash(token)
    session = {
        "user_id": user_id,
        "username": username,
        "created_at": now,
        "last_seen": now,
        "expires_at": now + SESSION_MAX_AGE * 1000,
    }
    async with database_connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO user_sessions(token_hash,user_id,username,created_at,last_seen,expires_at) VALUES(%s,%s,%s,%s,%s,%s)",
            (token_hash, user_id, username, now, now, session["expires_at"]),
        )
    await _cache_session(token_hash, session, mark_dirty=False)
    return token


async def get_session(token: str):
    if not token:
        return None
    now = now_ms()
    token_hash = _token_hash(token)
    client = get_redis_client()
    try:
        with REDIS_OPERATION_SECONDS.labels(operation="session_read").time():
            raw = await client.get(_session_key(token_hash))
    except RedisError as exc:
        raise _redis_unavailable("session_read", exc) from exc

    if raw:
        try:
            session = json.loads(raw)
        except (TypeError, ValueError):
            session = None
        if isinstance(session, dict) and session.get("revoked"):
            AUTH_SESSION_CACHE_REQUESTS.labels(result="revoked").inc()
            return None
        if isinstance(session, dict):
            session = _session_payload(session)
            if session["user_id"] and session["expires_at"] > now:
                AUTH_SESSION_CACHE_REQUESTS.labels(result="hit").inc()
                write_interval_ms = REDIS_LAST_SEEN_WRITE_INTERVAL_SECONDS * 1000
                if now - session["last_seen"] >= write_interval_ms:
                    session["last_seen"] = now
                    await _cache_session(token_hash, session, mark_dirty=True)
                return session
        try:
            await client.delete(_session_key(token_hash))
        except RedisError as exc:
            raise _redis_unavailable("invalid_session_delete", exc) from exc

    AUTH_SESSION_CACHE_REQUESTS.labels(result="miss").inc()
    async with database_connection() as conn, conn.cursor() as cur:
        await cur.execute(
            "SELECT user_id,username,created_at,last_seen,expires_at FROM user_sessions WHERE token_hash=%s AND expires_at>%s",
            (token_hash, now),
        )
        row = await cur.fetchone()
    if not row:
        return None
    session = _session_payload(row)
    session["last_seen"] = now
    await _cache_session(token_hash, session, mark_dirty=True)
    return session


async def destroy_session(token: str):
    if not token:
        return
    token_hash = _token_hash(token)
    client = get_redis_client()
    revoked = json.dumps({"revoked": True}, separators=(",", ":"))
    try:
        await client.set(_session_key(token_hash), revoked, ex=SESSION_MAX_AGE)
    except RedisError as exc:
        raise _redis_unavailable("session_revoke", exc) from exc
    async with database_connection() as conn, conn.cursor() as cur:
        await cur.execute("DELETE FROM user_sessions WHERE token_hash=%s", (token_hash,))
    try:
        pipeline = client.pipeline(transaction=False)
        pipeline.delete(_session_key(token_hash))
        pipeline.zrem(_LAST_SEEN_DIRTY_KEY, token_hash)
        await pipeline.execute()
    except RedisError as exc:
        raise _redis_unavailable("session_delete", exc) from exc


async def flush_session_last_seen() -> int:
    """Persist Redis last_seen values that were stable before this flush began."""
    client = get_redis_client()
    cutoff = now_ms() - 1000
    try:
        entries = await client.zrangebyscore(_LAST_SEEN_DIRTY_KEY, "-inf", cutoff, withscores=True)
    except RedisError as exc:
        raise _redis_unavailable("last_seen_read", exc) from exc
    if not entries:
        return 0

    params = [(int(score), str(token_hash)) for token_hash, score in entries]
    async with database_connection() as conn, conn.transaction(), conn.cursor() as cur:
        await cur.executemany(
            "UPDATE user_sessions SET last_seen=GREATEST(last_seen,%s) WHERE token_hash=%s",
            params,
        )
    try:
        await client.zremrangebyscore(_LAST_SEEN_DIRTY_KEY, "-inf", cutoff)
    except RedisError as exc:
        raise _redis_unavailable("last_seen_ack", exc) from exc
    return len(params)


async def session_last_seen_flush_loop() -> None:
    while True:
        await asyncio.sleep(REDIS_LAST_SEEN_FLUSH_INTERVAL_SECONDS)
        try:
            flushed = await flush_session_last_seen()
            if flushed:
                logger.info(
                    "session last_seen values flushed",
                    extra={"event": "session_last_seen_flushed", "count": flushed},
                )
        except RedisUnavailableError:
            logger.exception("Redis unavailable during last_seen flush", extra={"event": "session_last_seen_flush_failed"})
        except Exception:
            logger.exception("session last_seen flush failed", extra={"event": "session_last_seen_flush_failed"})


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
