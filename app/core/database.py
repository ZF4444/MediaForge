"""Shared PostgreSQL connection-pool lifecycle and access helpers."""

from __future__ import annotations

from contextlib import ExitStack, contextmanager
import re
from threading import Lock
import time
from typing import Any

import psycopg

from app.config import (
    DATABASE_CONNECT_TIMEOUT_SECONDS,
    DATABASE_POOL_MAX_IDLE_SECONDS,
    DATABASE_POOL_MAX_LIFETIME_SECONDS,
    DATABASE_POOL_MAX_SIZE,
    DATABASE_POOL_MIN_SIZE,
    DATABASE_POOL_TIMEOUT_SECONDS,
    DATABASE_STATEMENT_TIMEOUT_MS,
    DATABASE_LOCK_TIMEOUT_MS,
    DATABASE_SLOW_QUERY_THRESHOLD_MS,
    DATABASE_URL,
)
from app.core.logging import get_logger
from app.core.metrics import (
    DB_ACTIVE_CONNECTIONS,
    DB_LOCK_WAITING,
    DB_POOL_WAIT_SECONDS,
    DB_QUERY_SECONDS,
    DB_SLOW_QUERIES,
    TRANSIENT_RETRIES,
    update_pool_stats,
)
from app.core.retry import retry_delay_seconds, retry_max_attempts, retry_operation_id


logger = get_logger("database")
_POOL: Any = None
_POOL_LOCK = Lock()


class DatabaseUnavailableError(RuntimeError):
    """A transient PostgreSQL failure that should be exposed as HTTP 503."""


def _query_operation(query: Any) -> str:
    text = str(query or "").lstrip()
    match = re.match(r"([A-Za-z]+)", text)
    return (match.group(1).upper() if match else "OTHER")[:16]


class ObservableCursor(psycopg.Cursor):
    """Cursor that records query latency without exposing SQL or parameters."""

    def execute(self, query, params=None, *, prepare=None, binary=None):
        operation = _query_operation(query)
        started = time.perf_counter()
        status = "success"
        try:
            return super().execute(query, params, prepare=prepare, binary=binary)
        except Exception:
            status = "error"
            raise
        finally:
            elapsed = time.perf_counter() - started
            DB_QUERY_SECONDS.labels(operation=operation, status=status).observe(elapsed)
            if elapsed * 1000 >= DATABASE_SLOW_QUERY_THRESHOLD_MS:
                DB_SLOW_QUERIES.labels(operation=operation).inc()
                logger.warning(
                    "slow PostgreSQL query",
                    extra={
                        "event": "database_slow_query",
                        "operation": operation,
                        "duration_ms": round(elapsed * 1000, 2),
                    },
                )


def _validate_pool_settings() -> None:
    if DATABASE_POOL_MIN_SIZE < 0:
        raise RuntimeError("DATABASE_POOL_MIN_SIZE 不能小于 0")
    if DATABASE_POOL_MAX_SIZE < 1 or DATABASE_POOL_MAX_SIZE < DATABASE_POOL_MIN_SIZE:
        raise RuntimeError("DATABASE_POOL_MAX_SIZE 必须大于等于 DATABASE_POOL_MIN_SIZE 且至少为 1")
    if DATABASE_POOL_TIMEOUT_SECONDS <= 0 or DATABASE_CONNECT_TIMEOUT_SECONDS <= 0:
        raise RuntimeError("数据库连接与连接池超时必须大于 0")
    if DATABASE_STATEMENT_TIMEOUT_MS < 1000 or DATABASE_LOCK_TIMEOUT_MS < 1000:
        raise RuntimeError("数据库语句与锁超时不能小于 1000 毫秒")


def open_database_pool() -> Any:
    """Create and warm the process-local pool once during application startup."""
    global _POOL
    if _POOL is not None:
        return _POOL
    if not DATABASE_URL:
        raise RuntimeError("业务元数据系统必须配置 DATABASE_URL")

    with _POOL_LOCK:
        if _POOL is not None:
            return _POOL
        _validate_pool_settings()
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except ImportError as exc:
            raise RuntimeError("PostgreSQL 连接池依赖不可用，请执行 uv sync") from exc

        pool = ConnectionPool(
            conninfo=DATABASE_URL,
            min_size=DATABASE_POOL_MIN_SIZE,
            max_size=DATABASE_POOL_MAX_SIZE,
            timeout=DATABASE_POOL_TIMEOUT_SECONDS,
            max_idle=DATABASE_POOL_MAX_IDLE_SECONDS,
            max_lifetime=DATABASE_POOL_MAX_LIFETIME_SECONDS,
            kwargs={
                "autocommit": True,
                "row_factory": dict_row,
                "cursor_factory": ObservableCursor,
                "connect_timeout": DATABASE_CONNECT_TIMEOUT_SECONDS,
                "options": (
                    f"-c statement_timeout={DATABASE_STATEMENT_TIMEOUT_MS} "
                    f"-c lock_timeout={DATABASE_LOCK_TIMEOUT_MS}"
                ),
            },
            open=False,
        )
        try:
            pool.open(wait=True, timeout=DATABASE_POOL_TIMEOUT_SECONDS)
        except Exception:
            pool.close()
            raise
        _POOL = pool
        logger.info(
            "PostgreSQL connection pool opened",
            extra={
                "event": "database_pool_opened",
                "min_size": DATABASE_POOL_MIN_SIZE,
                "max_size": DATABASE_POOL_MAX_SIZE,
                "timeout_seconds": DATABASE_POOL_TIMEOUT_SECONDS,
            },
        )
        return _POOL


def _is_transient_database_error(exc: BaseException) -> bool:
    try:
        import psycopg
        from psycopg_pool import PoolTimeout
    except ImportError:
        return False
    return isinstance(exc, (PoolTimeout, psycopg.OperationalError, psycopg.errors.QueryCanceled))


@contextmanager
def database_connection(*, max_attempts: int | None = None):
    """Check out a pooled connection and normalize transient failures."""
    started = time.perf_counter()
    wait_observed = False
    stack = None
    operation_id = retry_operation_id("db")
    try:
        attempts = retry_max_attempts() if max_attempts is None else max(1, int(max_attempts))
        for attempt in range(1, attempts + 1):
            candidate_stack = ExitStack()
            try:
                pool = open_database_pool()
                conn = candidate_stack.enter_context(pool.connection(timeout=DATABASE_POOL_TIMEOUT_SECONDS))
                stack = candidate_stack
                break
            except Exception as exc:
                candidate_stack.close()
                if not _is_transient_database_error(exc) or attempt >= attempts:
                    raise
                delay = retry_delay_seconds(attempt)
                TRANSIENT_RETRIES.labels(backend="postgres", operation="connection_checkout").inc()
                logger.warning(
                    "retrying PostgreSQL connection checkout",
                    extra={
                        "event": "database_retry_scheduled",
                        "operation": "connection_checkout",
                        "operation_id": operation_id,
                        "attempt": attempt,
                        "max_attempts": attempts,
                        "delay_seconds": round(delay, 3),
                        "error_type": type(exc).__name__,
                    },
                )
                time.sleep(delay)
        if stack is None:
            raise DatabaseUnavailableError("PostgreSQL 服务暂时不可用，请稍后重试")
        with stack:
            DB_POOL_WAIT_SECONDS.observe(time.perf_counter() - started)
            wait_observed = True
            yield conn
    except DatabaseUnavailableError:
        raise
    except Exception as exc:
        if not _is_transient_database_error(exc):
            raise
        logger.warning(
            "PostgreSQL unavailable",
            extra={
                "event": "database_unavailable",
                "operation_id": operation_id,
                "error_type": type(exc).__name__,
            },
        )
        raise DatabaseUnavailableError("PostgreSQL 服务暂时不可用，请稍后重试") from exc
    finally:
        if not wait_observed:
            DB_POOL_WAIT_SECONDS.observe(time.perf_counter() - started)


def refresh_database_metrics() -> None:
    """Refresh point-in-time pool, active-session, and lock-wait gauges."""
    pool = _POOL
    if pool is None:
        return
    update_pool_stats(pool.get_stats())
    try:
        with database_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE state = 'active') AS active,
                    COUNT(*) FILTER (WHERE wait_event_type = 'Lock') AS lock_waiting
                FROM pg_stat_activity
                WHERE datname = current_database()
                """
            )
            row = cur.fetchone() or {}
        DB_ACTIVE_CONNECTIONS.set(int(row.get("active") or 0))
        DB_LOCK_WAITING.set(int(row.get("lock_waiting") or 0))
    except Exception:
        logger.exception("failed to refresh PostgreSQL metrics", extra={"event": "database_metrics_refresh_failed"})


def close_database_pool() -> None:
    """Stop accepting checkouts and release all PostgreSQL connections."""
    global _POOL
    with _POOL_LOCK:
        pool = _POOL
        _POOL = None
    if pool is None:
        return
    pool.close(timeout=DATABASE_POOL_TIMEOUT_SECONDS)
    logger.info("PostgreSQL connection pool closed", extra={"event": "database_pool_closed"})
