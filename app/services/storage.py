"""Unified object storage access backed by PostgreSQL file metadata."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.parse
import uuid
from datetime import datetime, timedelta
from io import BytesIO
from threading import Lock
from typing import Any, BinaryIO, Dict, List, Optional
from PIL import Image

from app.config import (
    DATABASE_URL,
    GLOBAL_CONFIG_LOCK,
    HEALTH_CHECK_TIMEOUT_SECONDS,
    MINIO_ACCESS_KEY,
    MINIO_BUCKET_PRIVATE,
    MINIO_BUCKET_PUBLIC,
    MINIO_BUCKET_TEMP,
    MINIO_CONNECT_TIMEOUT_SECONDS,
    MINIO_ENDPOINT,
    MINIO_READ_TIMEOUT_SECONDS,
    MINIO_SECRET_KEY,
    MINIO_SECURE,
    STORAGE_CACHE_DIR,
    STORAGE_CLEANUP_BATCH_SIZE,
    STORAGE_CLEANUP_ENABLED,
    STORAGE_CLEANUP_INTERVAL_SECONDS,
    STORAGE_INPUT_RETENTION_DAYS,
    STORAGE_METADATA_PURGE_ENABLED,
    STORAGE_METADATA_PURGE_RETENTION_DAYS,
    STORAGE_OUTPUT_RETENTION_DAYS,
    STORAGE_QUOTA_ENABLED,
    STORAGE_TEMP_RETENTION_DAYS,
    STORAGE_UPLOAD_RETENTION_DAYS,
    STORAGE_USER_QUOTA_BYTES,
)
from app.core.auth import current_user_id
from app.core.database import database_connection_sync
from app.core.logging import get_logger
from app.core.metrics import (
    BACKGROUND_FAILURES,
    BACKGROUND_RUNS,
    MINIO_BUCKET_BYTES,
    MINIO_BUCKET_OBJECTS,
    MINIO_FAILURES,
    MINIO_OPERATION_SECONDS,
    TRANSIENT_RETRIES,
)
from app.core.retry import retry_delay_seconds, retry_max_attempts, retry_operation_id
from app.core.utils import now_ms

logger = get_logger("storage")
_CLIENT = None
_HEALTH_CLIENT = None
_CLIENT_LOCK = Lock()
_BUCKETS_READY: set[str] = set()
_BUCKETS_LOCK = Lock()
_DB_READY = False
_DB_LOCK = Lock()
_QUOTA_CONFIG_CACHE: Optional[Dict[str, Any]] = None
THUMB_SIZE_DEFAULT = 512


class StorageQuotaExceeded(RuntimeError):
    def __init__(self, *, user_id: str, quota_bytes: int, used_bytes: int, incoming_bytes: int):
        self.user_id = user_id
        self.quota_bytes = int(quota_bytes or 0)
        self.used_bytes = int(used_bytes or 0)
        self.incoming_bytes = int(incoming_bytes or 0)
        super().__init__(self.message)

    @property
    def message(self) -> str:
        return (
            f"存储空间不足：当前已使用 {self.used_bytes} 字节，"
            f"本次写入 {self.incoming_bytes} 字节，配额上限 {self.quota_bytes} 字节。"
        )


class StorageUnavailableError(RuntimeError):
    """A transient MinIO failure that should be exposed as HTTP 503."""


FILES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bucket TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    legacy_url TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    ext TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'document',
    source TEXT NOT NULL DEFAULT 'upload',
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    last_accessed_at BIGINT NOT NULL DEFAULT 0,
    expires_at BIGINT,
    deleted_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_files_legacy_url ON files (legacy_url);
CREATE INDEX IF NOT EXISTS idx_files_user_category_created ON files (user_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_status ON files (status);
"""


def file_preview_url(file_id: str) -> str:
    return f"/api/files/{urllib.parse.quote(str(file_id or '').strip())}/preview"


def file_download_url(file_id: str) -> str:
    return f"/api/files/{urllib.parse.quote(str(file_id or '').strip())}/download"


def canonicalize_legacy_media_url(url: str) -> str:
    return str(url or "").strip()


def storage_enabled() -> bool:
    return bool(MINIO_ENDPOINT and MINIO_ACCESS_KEY and MINIO_SECRET_KEY)


def metadata_db_enabled() -> bool:
    return bool(DATABASE_URL)


def verify_storage_startup() -> None:
    storage_on = storage_enabled()
    db_on = metadata_db_enabled()
    if storage_on != db_on:
        raise RuntimeError(
            "文件系统配置不完整：MinIO 与 PostgreSQL 必须同时启用。"
            f" 当前 MINIO={'on' if storage_on else 'off'}，POSTGRESQL={'on' if db_on else 'off'}。"
        )
    if not storage_on and not db_on:
        raise RuntimeError("文件系统未启用：请同时配置 MinIO 与 PostgreSQL（DATABASE_URL）。")
    _ensure_files_table()
    for bucket in (MINIO_BUCKET_PRIVATE, MINIO_BUCKET_PUBLIC, MINIO_BUCKET_TEMP):
        _ensure_bucket(bucket)


def storage_readiness_status() -> Dict[str, Any]:
    """Probe required PostgreSQL and MinIO dependencies without mutating them."""
    components: Dict[str, str] = {}

    if not metadata_db_enabled():
        components["postgres"] = "not_configured"
    else:
        try:
            with database_connection_sync(max_attempts=1) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    cur.fetchone()
            components["postgres"] = "ok"
        except Exception:
            logger.warning("PostgreSQL readiness check failed", extra={"event": "postgres_readiness_failed"})
            components["postgres"] = "unavailable"

    if not storage_enabled():
        components["minio"] = "not_configured"
    else:
        try:
            client = _get_health_client()
            buckets = (MINIO_BUCKET_PRIVATE, MINIO_BUCKET_PUBLIC, MINIO_BUCKET_TEMP)
            missing = [
                bucket
                for bucket in buckets
                if not _minio_call(
                    "bucket_exists",
                    lambda name=bucket: client.bucket_exists(name),
                    max_attempts=1,
                )
            ]
            components["minio"] = "missing_bucket" if missing else "ok"
        except Exception:
            logger.warning("MinIO readiness check failed", extra={"event": "minio_readiness_failed"})
            components["minio"] = "unavailable"

    return {"ready": all(value == "ok" for value in components.values()), "components": components}


def refresh_storage_metrics() -> None:
    """Refresh registered object counts and bytes for each configured bucket."""
    buckets = (MINIO_BUCKET_PRIVATE, MINIO_BUCKET_PUBLIC, MINIO_BUCKET_TEMP)
    for bucket in buckets:
        MINIO_BUCKET_BYTES.labels(bucket=bucket).set(0)
        MINIO_BUCKET_OBJECTS.labels(bucket=bucket).set(0)
    if not metadata_db_enabled():
        return
    try:
        with _db_connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT bucket, COALESCE(SUM(size_bytes), 0) AS size_bytes, COUNT(*) AS object_count
                FROM files
                WHERE deleted_at IS NULL AND status <> 'deleted'
                GROUP BY bucket
                """
            )
            rows = cur.fetchall() or []
        for row in rows:
            bucket = str(row.get("bucket") or "unknown")
            MINIO_BUCKET_BYTES.labels(bucket=bucket).set(int(row.get("size_bytes") or 0))
            MINIO_BUCKET_OBJECTS.labels(bucket=bucket).set(int(row.get("object_count") or 0))
    except Exception:
        logger.exception("failed to refresh storage metrics", extra={"event": "storage_metrics_refresh_failed"})


def _retention_days_for_category(category: str) -> int:
    return {
        "input": int(STORAGE_INPUT_RETENTION_DAYS or 0),
        "uploads": int(STORAGE_UPLOAD_RETENTION_DAYS or 0),
        "output": int(STORAGE_OUTPUT_RETENTION_DAYS or 0),
        "temp": int(STORAGE_TEMP_RETENTION_DAYS or 0),
    }.get(str(category or "").strip(), 0)


def _quota_applies_to_category(category: str) -> bool:
    return str(category or "").strip() in {"input", "uploads", "output", "library", "temp"}


def _sanitize_storage_quota_config(raw: Any) -> Dict[str, Any]:
    data = raw if isinstance(raw, dict) else {}
    users_raw = data.get("users") if isinstance(data.get("users"), dict) else {}
    users: Dict[str, Dict[str, Optional[int]]] = {}
    for user_id, cfg in users_raw.items():
        uid = os.path.basename(str(user_id or "").strip())
        if not uid:
            continue
        quota_value = cfg.get("quota_bytes") if isinstance(cfg, dict) else None
        try:
            quota_bytes = int(quota_value) if quota_value not in (None, "") else None
        except (TypeError, ValueError):
            quota_bytes = None
        if quota_bytes is not None and quota_bytes < 0:
            quota_bytes = None
        users[uid] = {"quota_bytes": quota_bytes}
    default_value = data.get("default_quota_bytes")
    try:
        default_quota_bytes = int(default_value) if default_value not in (None, "") else None
    except (TypeError, ValueError):
        default_quota_bytes = None
    if default_quota_bytes is not None and default_quota_bytes < 0:
        default_quota_bytes = None
    return {
        "enabled": bool(data.get("enabled", STORAGE_QUOTA_ENABLED)),
        "default_quota_bytes": default_quota_bytes,
        "users": users,
    }


def load_storage_quota_config() -> Dict[str, Any]:
    global _QUOTA_CONFIG_CACHE
    with GLOBAL_CONFIG_LOCK:
        if _QUOTA_CONFIG_CACHE is not None:
            return {
                "enabled": bool(_QUOTA_CONFIG_CACHE.get("enabled", STORAGE_QUOTA_ENABLED)),
                "default_quota_bytes": _QUOTA_CONFIG_CACHE.get("default_quota_bytes"),
                "users": dict(_QUOTA_CONFIG_CACHE.get("users") or {}),
            }
        from app.services.business_metadata import get_app_setting
        _QUOTA_CONFIG_CACHE = _sanitize_storage_quota_config(get_app_setting("storage_quota", {}))
        return {
            "enabled": bool(_QUOTA_CONFIG_CACHE.get("enabled", STORAGE_QUOTA_ENABLED)),
            "default_quota_bytes": _QUOTA_CONFIG_CACHE.get("default_quota_bytes"),
            "users": dict(_QUOTA_CONFIG_CACHE.get("users") or {}),
        }


def save_storage_quota_config(config: Dict[str, Any]) -> Dict[str, Any]:
    global _QUOTA_CONFIG_CACHE
    sanitized = _sanitize_storage_quota_config(config)
    with GLOBAL_CONFIG_LOCK:
        from app.services.business_metadata import set_app_setting
        set_app_setting("storage_quota", sanitized)
        _QUOTA_CONFIG_CACHE = sanitized
    return {
        "enabled": bool(sanitized.get("enabled", STORAGE_QUOTA_ENABLED)),
        "default_quota_bytes": sanitized.get("default_quota_bytes"),
        "users": dict(sanitized.get("users") or {}),
    }


def storage_quota_enabled() -> bool:
    return bool(load_storage_quota_config().get("enabled", STORAGE_QUOTA_ENABLED))


def storage_quota_limit_bytes_for_user(user_id: str = "") -> int:
    uid = os.path.basename(str(user_id or current_user_id() or "anonymous")) or "anonymous"
    config = load_storage_quota_config()
    user_quota = ((config.get("users") or {}).get(uid) or {}).get("quota_bytes")
    if user_quota not in (None, ""):
        return int(user_quota or 0)
    default_quota = config.get("default_quota_bytes")
    if default_quota not in (None, ""):
        return int(default_quota or 0)
    return int(STORAGE_USER_QUOTA_BYTES or 0)


def storage_quota_bytes_for_user(user_id: str = "") -> int:
    uid = os.path.basename(str(user_id or current_user_id() or "anonymous")) or "anonymous"
    if not metadata_db_enabled():
        return 0
    _ensure_files_table()
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
                FROM files
                WHERE user_id = %s AND deleted_at IS NULL AND status <> 'deleted'
                """,
                (uid,),
            )
            row = cur.fetchone() or {}
    return int(row.get("total_bytes") or 0)


def enforce_storage_quota(incoming_bytes: int, *, category: str = "", user_id: str = "") -> None:
    size = int(incoming_bytes or 0)
    if size <= 0 or not storage_quota_enabled() or not metadata_db_enabled():
        return
    if not _quota_applies_to_category(category):
        return
    quota_bytes = storage_quota_limit_bytes_for_user(user_id)
    if quota_bytes <= 0:
        return
    uid = os.path.basename(str(user_id or current_user_id() or "anonymous")) or "anonymous"
    used_bytes = storage_quota_bytes_for_user(uid)
    if used_bytes + size > quota_bytes:
        raise StorageQuotaExceeded(
            user_id=uid,
            quota_bytes=quota_bytes,
            used_bytes=used_bytes,
            incoming_bytes=size,
        )


def cleanup_reason_for_entry(entry: Dict[str, Any], *, now_ms_value: Optional[int] = None) -> Optional[str]:
    if not isinstance(entry, dict):
        return None
    category = str(entry.get("category") or "").strip()
    if not category or category == "library":
        return None
    now_value = int(now_ms_value or now_ms())
    expires_at = entry.get("expires_at")
    try:
        expires_value = int(expires_at) if expires_at is not None else 0
    except (TypeError, ValueError):
        expires_value = 0
    if expires_value and expires_value <= now_value:
        return "expired"
    retention_days = _retention_days_for_category(category)
    if retention_days <= 0:
        return None
    activity_at = entry.get("last_accessed_at") or entry.get("created_at") or 0
    try:
        activity_value = int(activity_at or 0)
    except (TypeError, ValueError):
        activity_value = 0
    cutoff = now_value - retention_days * 24 * 60 * 60 * 1000
    if activity_value and activity_value <= cutoff:
        return f"{category}_retention"
    return None


# Background lifecycle cleanup is orphan-only. Explicit user deletion uses a separate path.
_UNREFERENCED_FILE_SQL = """
          AND NOT EXISTS (SELECT 1 FROM history_record_files WHERE file_id = files.id)
          AND NOT EXISTS (SELECT 1 FROM conversation_message_files WHERE file_id = files.id)
          AND NOT EXISTS (SELECT 1 FROM smart_canvas_node_files WHERE file_id = files.id)
          AND NOT EXISTS (SELECT 1 FROM asset_items WHERE file_id = files.id)
"""


def _cleanup_candidates(limit: int, now_ms_value: int) -> List[Dict[str, Any]]:
    if not metadata_db_enabled():
        return []
    _ensure_files_table()
    params: List[Any] = []
    conditions: List[str] = ["(expires_at IS NOT NULL AND expires_at <= %s)"]
    params.append(now_ms_value)
    for category in ("input", "uploads", "output", "temp"):
        retention_days = _retention_days_for_category(category)
        if retention_days <= 0:
            continue
        cutoff = now_ms_value - retention_days * 24 * 60 * 60 * 1000
        conditions.append("(category = %s AND COALESCE(NULLIF(last_accessed_at, 0), created_at) <= %s)")
        params.extend([category, cutoff])
    if not conditions:
        return []
    params.append(max(1, int(limit or STORAGE_CLEANUP_BATCH_SIZE or 500)))
    sql = f"""
        SELECT *
        FROM files
        WHERE deleted_at IS NULL
          AND status <> 'deleted'
          AND category <> 'library'
          {_UNREFERENCED_FILE_SQL}
          AND ({' OR '.join(conditions)})
        ORDER BY COALESCE(expires_at, created_at) ASC
        LIMIT %s
    """
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall() or []


def _delete_unreferenced_file_for_cleanup(entry: Dict[str, Any], deleted_at_ms: int) -> bool:
    file_id = str(entry.get("file_id") or "").strip()
    if not file_id or not metadata_db_enabled():
        return False
    with _db_connect() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "SELECT id FROM files WHERE id = %s AND deleted_at IS NULL AND status <> 'deleted' "
            + _UNREFERENCED_FILE_SQL
            + " FOR UPDATE",
            (file_id,),
        )
        if not cur.fetchone():
            return False
        delete_media_objects(entry)
        cur.execute(
            """
                UPDATE files
                SET status = 'deleted', deleted_at = %s, updated_at = %s
                WHERE id = %s
            """,
            (deleted_at_ms, deleted_at_ms, file_id),
        )
    return True


def _deleted_metadata_candidates(limit: int, deleted_before_ms: int) -> List[Dict[str, Any]]:
    if not metadata_db_enabled():
        return []
    _ensure_files_table()
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM files
                WHERE deleted_at IS NOT NULL
                  AND deleted_at <= %s
                ORDER BY deleted_at ASC
                LIMIT %s
                """,
                (deleted_before_ms, max(1, int(limit or STORAGE_CLEANUP_BATCH_SIZE or 500))),
            )
            return cur.fetchall() or []


def _hard_delete_file_row(file_id: str) -> None:
    if not file_id or not metadata_db_enabled():
        return
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM files WHERE id = %s", (file_id,))


def run_storage_cleanup_once(limit: int = 0) -> Dict[str, int]:
    if not STORAGE_CLEANUP_ENABLED:
        return {"scanned": 0, "deleted": 0}
    now_value = now_ms()
    rows = _cleanup_candidates(limit or STORAGE_CLEANUP_BATCH_SIZE, now_value)
    deleted = 0
    for row in rows:
        entry = _row_to_entry(row)
        if not cleanup_reason_for_entry({
            **entry,
            "expires_at": row.get("expires_at"),
            "last_accessed_at": row.get("last_accessed_at"),
        }, now_ms_value=now_value):
            continue
        deleted_at_ms = now_ms()
        if not _delete_unreferenced_file_for_cleanup(entry, deleted_at_ms):
            continue
        cache_path = cached_media_path(entry)
        if cache_path and os.path.isfile(cache_path):
            try:
                os.remove(cache_path)
            except OSError:
                pass
        deleted += 1
    return {"scanned": len(rows), "deleted": deleted}


def run_storage_metadata_purge_once(limit: int = 0) -> Dict[str, int]:
    if not STORAGE_METADATA_PURGE_ENABLED or not metadata_db_enabled():
        return {"scanned": 0, "purged": 0}
    retention_days = int(STORAGE_METADATA_PURGE_RETENTION_DAYS or 0)
    if retention_days <= 0:
        return {"scanned": 0, "purged": 0}
    deleted_before_ms = now_ms() - retention_days * 24 * 60 * 60 * 1000
    rows = _deleted_metadata_candidates(limit or STORAGE_CLEANUP_BATCH_SIZE, deleted_before_ms)
    purged = 0
    for row in rows:
        entry = _row_to_entry(row)
        if media_objects_exist(entry):
            continue
        _hard_delete_file_row(entry.get("file_id") or "")
        purged += 1
    return {"scanned": len(rows), "purged": purged}


async def storage_cleanup_loop() -> None:
    while True:
        try:
            result = await asyncio.to_thread(run_storage_cleanup_once)
            BACKGROUND_RUNS.labels(job="storage_cleanup", status="success").inc()
            logger.info("storage cleanup completed", extra={"event": "storage_cleanup_completed", **result})
        except Exception:
            BACKGROUND_FAILURES.labels(job="storage_cleanup").inc()
            BACKGROUND_RUNS.labels(job="storage_cleanup", status="failed").inc()
            logger.exception("storage cleanup failed", extra={"event": "storage_cleanup_failed", "alert": True})
        try:
            result = await asyncio.to_thread(run_storage_metadata_purge_once)
            BACKGROUND_RUNS.labels(job="storage_metadata_purge", status="success").inc()
            logger.info("storage metadata purge completed", extra={"event": "storage_metadata_purge_completed", **result})
        except Exception:
            BACKGROUND_FAILURES.labels(job="storage_metadata_purge").inc()
            BACKGROUND_RUNS.labels(job="storage_metadata_purge", status="failed").inc()
            logger.exception("storage metadata purge failed", extra={"event": "storage_metadata_purge_failed", "alert": True})
        await asyncio.sleep(max(60, int(STORAGE_CLEANUP_INTERVAL_SECONDS or 3600)))


def _storage_import_error() -> RuntimeError:
    return RuntimeError("MinIO SDK unavailable. Run `uv sync` to install the `minio` dependency.")


def _get_client():
    global _CLIENT
    if not storage_enabled():
        raise RuntimeError("MinIO is not configured")
    with _CLIENT_LOCK:
        if _CLIENT is None:
            _CLIENT = _create_minio_client(MINIO_CONNECT_TIMEOUT_SECONDS, MINIO_READ_TIMEOUT_SECONDS, maxsize=20)
        return _CLIENT


def _get_health_client():
    global _HEALTH_CLIENT
    if not storage_enabled():
        raise RuntimeError("MinIO is not configured")
    with _CLIENT_LOCK:
        if _HEALTH_CLIENT is None:
            _HEALTH_CLIENT = _create_minio_client(
                HEALTH_CHECK_TIMEOUT_SECONDS,
                HEALTH_CHECK_TIMEOUT_SECONDS,
                maxsize=4,
            )
        return _HEALTH_CLIENT


def _create_minio_client(connect_timeout: float, read_timeout: float, *, maxsize: int):
    try:
        from minio import Minio
        import urllib3
    except ImportError as exc:
        raise _storage_import_error() from exc
    http_client = urllib3.PoolManager(
        timeout=urllib3.Timeout(connect=connect_timeout, read=read_timeout),
        retries=False,
        maxsize=maxsize,
        num_pools=4,
    )
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=MINIO_SECURE,
        http_client=http_client,
    )


def _is_transient_storage_error(exc: BaseException) -> bool:
    try:
        import urllib3
        from minio.error import S3Error
    except ImportError:
        return isinstance(exc, (TimeoutError, OSError))
    if isinstance(exc, (TimeoutError, OSError, urllib3.exceptions.HTTPError)):
        return True
    if isinstance(exc, S3Error):
        response = getattr(exc, "response", None)
        try:
            status = int(getattr(response, "status", 0) or 0)
        except (TypeError, ValueError):
            status = 0
        return status >= 500 or str(getattr(exc, "code", "")) in {
            "InternalError", "RequestTimeout", "ServiceUnavailable", "SlowDown",
        }
    return False


def _is_storage_not_found_error(exc: BaseException) -> bool:
    try:
        from minio.error import S3Error
    except ImportError:
        return False
    return isinstance(exc, S3Error) and str(getattr(exc, "code", "")) in {
        "NoSuchBucket",
        "NoSuchKey",
        "NoSuchObject",
        "NotFound",
    }


def _minio_call(operation: str, callback, *, object_id: str = "", max_attempts: Optional[int] = None):
    attempts = retry_max_attempts() if max_attempts is None else max(1, int(max_attempts))
    operation_id = retry_operation_id("minio")
    for attempt in range(1, attempts + 1):
        started = time.perf_counter()
        status = "success"
        try:
            return callback()
        except StorageUnavailableError:
            status = "error"
            raise
        except Exception as exc:
            status = "error"
            MINIO_FAILURES.labels(operation=operation, error_type=type(exc).__name__).inc()
            is_transient = _is_transient_storage_error(exc)
            if not is_transient:
                raise
            if attempt < attempts:
                delay = retry_delay_seconds(attempt)
                TRANSIENT_RETRIES.labels(backend="minio", operation=operation).inc()
                logger.warning(
                    "retrying MinIO operation",
                    extra={
                        "event": "storage_retry_scheduled",
                        "operation": operation,
                        "operation_id": operation_id,
                        "object_id": object_id or None,
                        "attempt": attempt,
                        "max_attempts": attempts,
                        "delay_seconds": round(delay, 3),
                        "error_type": type(exc).__name__,
                    },
                )
                time.sleep(delay)
                continue
            logger.warning(
                "MinIO unavailable",
                extra={
                    "event": "storage_unavailable",
                    "operation": operation,
                    "operation_id": operation_id,
                    "object_id": object_id or None,
                    "attempts": attempts,
                    "error_type": type(exc).__name__,
                },
            )
            raise StorageUnavailableError("对象存储服务暂时不可用，请稍后重试") from exc
        finally:
            MINIO_OPERATION_SECONDS.labels(operation=operation, status=status).observe(time.perf_counter() - started)
    raise StorageUnavailableError("对象存储服务暂时不可用，请稍后重试")


def _db_connect():
    if not metadata_db_enabled():
        return None
    return database_connection_sync()


def _ensure_files_table() -> None:
    global _DB_READY
    if _DB_READY or not metadata_db_enabled():
        return
    with _DB_LOCK:
        if _DB_READY:
            return
        with _db_connect() as conn:
            with conn.cursor() as cur:
                cur.execute(FILES_TABLE_SQL)
        _DB_READY = True


def _ensure_bucket(bucket: str) -> None:
    client = _get_client()
    with _BUCKETS_LOCK:
        if bucket in _BUCKETS_READY:
            return
        if not _minio_call("bucket_exists", lambda: client.bucket_exists(bucket)):
            _minio_call("make_bucket", lambda: client.make_bucket(bucket))
        _BUCKETS_READY.add(bucket)


def save_bytes(data: bytes, object_key: str, content_type: str = "", bucket: str = "") -> Dict[str, Any]:
    bucket_name = (bucket or MINIO_BUCKET_PRIVATE).strip() or MINIO_BUCKET_PRIVATE
    _ensure_bucket(bucket_name)
    payload = data if isinstance(data, bytes) else bytes(data or b"")
    client = _get_client()
    result = _minio_call(
        "put_object",
        lambda: client.put_object(
            bucket_name,
            object_key,
            BytesIO(payload),
            len(payload),
            content_type=content_type or "application/octet-stream",
        ),
        object_id=object_key,
    )
    return {
        "bucket": bucket_name,
        "object_key": object_key,
        "etag": getattr(result, "etag", ""),
        "version_id": getattr(result, "version_id", ""),
        "size": len(payload),
    }


def save_fileobj(fileobj: BinaryIO, object_key: str, length: int, content_type: str = "", bucket: str = "") -> Dict[str, Any]:
    bucket_name = (bucket or MINIO_BUCKET_PRIVATE).strip() or MINIO_BUCKET_PRIVATE
    _ensure_bucket(bucket_name)
    client = _get_client()
    try:
        initial_position = fileobj.tell()
        fileobj.seek(initial_position)
        retryable = True
    except (AttributeError, OSError):
        initial_position = 0
        retryable = False

    def _put_fileobj():
        if retryable:
            fileobj.seek(initial_position)
        return client.put_object(
            bucket_name,
            object_key,
            fileobj,
            length,
            content_type=content_type or "application/octet-stream",
        )

    result = _minio_call(
        "put_object",
        _put_fileobj,
        object_id=object_key,
        max_attempts=retry_max_attempts() if retryable else 1,
    )
    return {
        "bucket": bucket_name,
        "object_key": object_key,
        "etag": getattr(result, "etag", ""),
        "version_id": getattr(result, "version_id", ""),
        "size": int(length or 0),
    }


def get_presigned_get_url(bucket: str, object_key: str, expires_seconds: int = 900) -> str:
    return _minio_call("presigned_get_object", lambda: _get_client().presigned_get_object(bucket, object_key, expires=timedelta(seconds=max(1, int(expires_seconds or 900)))))


def get_presigned_put_url(bucket: str, object_key: str, expires_seconds: int = 900) -> str:
    return _minio_call("presigned_put_object", lambda: _get_client().presigned_put_object(bucket, object_key, expires=timedelta(seconds=max(1, int(expires_seconds or 900)))))


def delete_object(bucket: str, object_key: str) -> None:
    _minio_call("remove_object", lambda: _get_client().remove_object(bucket, object_key), object_id=object_key)


def stat_object(bucket: str, object_key: str):
    return _minio_call("stat_object", lambda: _get_client().stat_object(bucket, object_key), object_id=object_key)


def get_object_bytes(bucket: str, object_key: str) -> bytes:
    def _read_object() -> bytes:
        response = _get_client().get_object(bucket, object_key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()
    return _minio_call("get_object", _read_object, object_id=object_key)


def object_exists(bucket: str, object_key: str) -> bool:
    try:
        stat_object(bucket, object_key)
        return True
    except StorageUnavailableError:
        raise
    except Exception as exc:
        if _is_storage_not_found_error(exc):
            return False
        raise


def _row_to_entry(row: Dict[str, Any]) -> Dict[str, Any]:
    file_id = row["id"]
    return {
        "file_id": file_id,
        "url": file_preview_url(file_id),
        "download_url": file_download_url(file_id),
        "legacy_url": row["legacy_url"],
        "bucket": row["bucket"],
        "object_key": row["object_key"],
        "filename": row["stored_name"],
        "category": row["category"],
        "original_name": row["original_name"],
        "content_type": row["mime_type"],
        "kind": row["kind"],
        "size": int(row.get("size_bytes") or 0),
        "created_at": int(row.get("created_at") or 0),
        "updated_at": int(row.get("updated_at") or 0),
        "user_id": row.get("user_id") or "",
        "status": row.get("status") or "active",
        "source": row.get("source") or "upload",
        "ext": row.get("ext") or "",
        "sha256": row.get("sha256") or "",
        "is_public": bool(row.get("is_public")),
        "last_accessed_at": int(row.get("last_accessed_at") or 0),
        "expires_at": int(row.get("expires_at") or 0) if row.get("expires_at") is not None else None,
        "deleted_at": int(row.get("deleted_at") or 0) if row.get("deleted_at") is not None else None,
    }


def _upsert_file_row(entry: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_files_table()
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO files (
                    id, user_id, bucket, object_key, legacy_url, category,
                    original_name, stored_name, ext, mime_type, size_bytes, sha256,
                    kind, source, is_public, status, created_at, updated_at,
                    last_accessed_at, expires_at, deleted_at
                ) VALUES (
                    %(file_id)s, %(user_id)s, %(bucket)s, %(object_key)s, %(url)s, %(category)s,
                    %(original_name)s, %(filename)s, %(ext)s, %(content_type)s, %(size)s, %(sha256)s,
                    %(kind)s, %(source)s, %(is_public)s, %(status)s, %(created_at)s, %(updated_at)s,
                    %(last_accessed_at)s, %(expires_at)s, %(deleted_at)s
                )
                ON CONFLICT (id) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    bucket = EXCLUDED.bucket,
                    object_key = EXCLUDED.object_key,
                    legacy_url = EXCLUDED.legacy_url,
                    category = EXCLUDED.category,
                    original_name = EXCLUDED.original_name,
                    stored_name = EXCLUDED.stored_name,
                    ext = EXCLUDED.ext,
                    mime_type = EXCLUDED.mime_type,
                    size_bytes = EXCLUDED.size_bytes,
                    sha256 = EXCLUDED.sha256,
                    kind = EXCLUDED.kind,
                    source = EXCLUDED.source,
                    is_public = EXCLUDED.is_public,
                    status = EXCLUDED.status,
                    updated_at = EXCLUDED.updated_at,
                    last_accessed_at = EXCLUDED.last_accessed_at,
                    expires_at = EXCLUDED.expires_at,
                    deleted_at = EXCLUDED.deleted_at
                """,
                entry,
            )
    return entry


def register_media_url(
    url: str,
    bucket: str,
    object_key: str,
    *,
    filename: str,
    category: str,
    original_name: str = "",
    content_type: str = "",
    kind: str = "",
    size: int = 0,
    created_at: Optional[int] = None,
    file_id: str = "",
    sha256: str = "",
    source: str = "upload",
    is_public: bool = False,
    status: str = "active",
    expires_at: Optional[int] = None,
) -> Dict[str, Any]:
    timestamp = int(created_at or now_ms())
    ext = os.path.splitext(filename)[1].lower()
    existing = lookup_media_url(url, include_deleted=True)
    entry = {
        "file_id": (existing.get("file_id") if existing else "") or file_id or uuid.uuid4().hex,
        "url": url,
        "bucket": bucket,
        "object_key": object_key,
        "filename": filename,
        "category": category,
        "original_name": original_name or filename,
        "content_type": content_type or "application/octet-stream",
        "kind": kind or "document",
        "size": int(size or 0),
        "created_at": timestamp,
        "updated_at": timestamp,
        "user_id": current_user_id(),
        "status": status or "active",
        "source": source or "upload",
        "ext": ext,
        "sha256": sha256 or "",
        "is_public": bool(is_public),
        "last_accessed_at": 0,
        "expires_at": int(expires_at) if expires_at is not None else None,
        "deleted_at": None,
    }
    return _upsert_file_row(entry)


def lookup_media_url(url: str, *, include_deleted: bool = False) -> Optional[Dict[str, Any]]:
    url = canonicalize_legacy_media_url(url)
    _ensure_files_table()
    deleted_filter = "" if include_deleted else " AND deleted_at IS NULL AND status <> 'deleted'"
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM files
                WHERE legacy_url = %s
                """ + deleted_filter + """
                LIMIT 1
                """,
                (url,),
            )
            row = cur.fetchone()
    return _row_to_entry(row) if row else None


def lookup_media_urls(urls: List[str], *, include_deleted: bool = False) -> Dict[str, Dict[str, Any]]:
    canonical_urls = []
    seen = set()
    for url in urls or []:
        canonical = canonicalize_legacy_media_url(url)
        if canonical and canonical not in seen:
            canonical_urls.append(canonical)
            seen.add(canonical)
    if not canonical_urls:
        return {}
    _ensure_files_table()
    deleted_filter = "" if include_deleted else " AND deleted_at IS NULL AND status <> 'deleted'"
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM files
                WHERE legacy_url = ANY(%s)
                """ + deleted_filter,
                (canonical_urls,),
            )
            rows = cur.fetchall() or []
    result: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        entry = _row_to_entry(row)
        legacy_url = str(entry.get("legacy_url") or "")
        if legacy_url:
            result[legacy_url] = entry
    return result


def get_file_by_id(file_id: str) -> Optional[Dict[str, Any]]:
    if not file_id:
        return None
    if not metadata_db_enabled():
        raise RuntimeError("文件元数据数据库未启用，无法通过 file_id 解析媒体；请配置 DATABASE_URL。")
    _ensure_files_table()
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM files
                WHERE id = %s AND deleted_at IS NULL AND status <> 'deleted'
                LIMIT 1
                """,
                (file_id,),
            )
            row = cur.fetchone()
    return _row_to_entry(row) if row else None


def get_files_by_ids(file_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    ids = []
    seen = set()
    for file_id in file_ids or []:
        text = str(file_id or "").strip()
        if text and text not in seen:
            ids.append(text)
            seen.add(text)
    if not ids:
        return {}
    if not metadata_db_enabled():
        raise RuntimeError("文件元数据数据库未启用，无法通过 file_id 解析媒体；请配置 DATABASE_URL。")
    _ensure_files_table()
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM files
                WHERE id = ANY(%s) AND deleted_at IS NULL AND status <> 'deleted'
                """,
                (ids,),
            )
            rows = cur.fetchall() or []
    entries = [_row_to_entry(row) for row in rows]
    return {entry["file_id"]: entry for entry in entries if entry.get("file_id")}


def get_user_files_by_ids(file_ids: List[str], *, user_id: str = "") -> Dict[str, Dict[str, Any]]:
    ids = []
    seen = set()
    for file_id in file_ids or []:
        text = str(file_id or "").strip()
        if text and text not in seen:
            ids.append(text)
            seen.add(text)
    if not ids:
        return {}
    uid = os.path.basename(str(user_id or current_user_id() or "anonymous")) or "anonymous"
    _ensure_files_table()
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM files
                WHERE id = ANY(%s)
                  AND user_id = %s
                  AND deleted_at IS NULL
                  AND status <> 'deleted'
                """,
                (ids, uid),
            )
            rows = cur.fetchall() or []
    entries = [_row_to_entry(row) for row in rows]
    return {entry["file_id"]: entry for entry in entries if entry.get("file_id")}


def resolve_file_reference(url: str = "", file_id: str = "", *, allow_register: bool = True) -> Optional[Dict[str, Any]]:
    if file_id:
        entry = get_file_by_id(file_id)
        if entry:
            return entry
    if url:
        parsed = urllib.parse.urlsplit(str(url))
        path = parsed.path or str(url)
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 3 and parts[0] == "api" and parts[1] == "files":
            entry = get_file_by_id(parts[2])
            if entry:
                return entry
        entry = lookup_media_url(url)
        if entry:
            return entry
    return None


def resolve_url_for_file_id(file_id: str, fallback_url: str = "") -> str:
    entry = get_file_by_id(file_id) if file_id else None
    if entry and entry.get("file_id"):
        return file_preview_url(entry["file_id"])
    return str(fallback_url or "")


def file_refs_from_urls(urls: List[str]) -> List[Dict[str, Any]]:
    refs: List[Dict[str, Any]] = []
    for url in urls or []:
        text = str(url or "").strip()
        if not text:
            continue
        entry = resolve_file_reference(url=text)
        ref = {
            "file_id": entry.get("file_id") if entry else "",
        }
        if not entry:
            ref["url"] = text
        refs.append(ref)
    return refs


def urls_from_file_refs(refs: List[Dict[str, Any]]) -> List[str]:
    urls: List[str] = []
    for ref in refs or []:
        if not isinstance(ref, dict):
            continue
        file_id = str(ref.get("file_id") or "").strip()
        fallback_url = str(ref.get("url") or "").strip()
        url = resolve_url_for_file_id(file_id, fallback_url)
        if url:
            urls.append(url)
    return urls


def normalize_media_ref(ref: Dict[str, Any], *, allow_register: bool = True) -> Dict[str, Any]:
    if not isinstance(ref, dict):
        return ref
    normalized = dict(ref)
    file_id = str(normalized.get("file_id") or "").strip()
    url = str(normalized.get("url") or "").strip()
    entry = resolve_file_reference(url=url, file_id=file_id, allow_register=allow_register)
    if file_id and not entry:
        raise RuntimeError(f"file_id={file_id} 的媒体元数据不存在或无法解析。")
    if entry:
        normalized["file_id"] = entry.get("file_id") or file_id
        normalized["url"] = file_preview_url(normalized["file_id"])
        normalized["download_url"] = file_download_url(normalized["file_id"])
        if not normalized.get("name"):
            normalized["name"] = entry.get("original_name") or entry.get("filename") or ""
        if not normalized.get("kind") and entry.get("kind"):
            normalized["kind"] = entry.get("kind")
    return normalized


def normalize_media_refs(
    refs: List[Dict[str, Any]],
    *,
    allow_register: bool = False,
    preserve_missing: bool = False,
) -> List[Dict[str, Any]]:
    normalized_refs = [dict(ref) for ref in (refs or []) if isinstance(ref, dict)]
    if not normalized_refs:
        return []
    file_ids = []
    urls = []
    file_api_ids = []
    for ref in normalized_refs:
        file_id = str(ref.get("file_id") or "").strip()
        url = str(ref.get("url") or "").strip()
        if file_id:
            file_ids.append(file_id)
        if url:
            urls.append(url)
            parsed = urllib.parse.urlsplit(url)
            path = parsed.path or url
            parts = [part for part in path.split("/") if part]
            if len(parts) >= 3 and parts[0] == "api" and parts[1] == "files":
                file_api_ids.append(parts[2])
    entries_by_id = get_files_by_ids(file_ids + file_api_ids) if (file_ids or file_api_ids) else {}
    entries_by_url = lookup_media_urls(urls) if urls else {}
    items: List[Dict[str, Any]] = []
    for ref in normalized_refs:
        normalized = dict(ref)
        file_id = str(normalized.get("file_id") or "").strip()
        url = str(normalized.get("url") or "").strip()
        canonical_url = canonicalize_legacy_media_url(url) if url else ""
        entry = entries_by_id.get(file_id) if file_id else None
        if not entry and url:
            parsed = urllib.parse.urlsplit(url)
            path = parsed.path or url
            parts = [part for part in path.split("/") if part]
            if len(parts) >= 3 and parts[0] == "api" and parts[1] == "files":
                entry = entries_by_id.get(parts[2])
        if not entry and canonical_url:
            entry = entries_by_url.get(canonical_url)
        if not entry and allow_register:
            entry = resolve_file_reference(url=url, file_id=file_id, allow_register=True)
        if file_id and not entry and not preserve_missing:
            raise RuntimeError(f"file_id={file_id} 的媒体元数据不存在或无法解析。")
        if entry:
            normalized["file_id"] = entry.get("file_id") or file_id
            normalized["url"] = file_preview_url(normalized["file_id"])
            normalized["download_url"] = file_download_url(normalized["file_id"])
            if not normalized.get("name"):
                normalized["name"] = entry.get("original_name") or entry.get("filename") or ""
            if not normalized.get("kind") and entry.get("kind"):
                normalized["kind"] = entry.get("kind")
        if normalized.get("url") or normalized.get("file_id"):
            items.append(normalized)
    return items


def compact_media_ref(ref: Dict[str, Any]) -> Dict[str, Any]:
    normalized = normalize_media_ref(ref or {}, allow_register=True)
    compact: Dict[str, Any] = {}
    for key in ("file_id", "url", "name", "role", "kind"):
        value = normalized.get(key)
        if value not in (None, ""):
            compact[key] = value
    return compact


def compact_media_refs(
    refs: List[Dict[str, Any]],
    *,
    preserve_missing: bool = False,
) -> List[Dict[str, Any]]:
    normalized_refs = normalize_media_refs(
        refs,
        allow_register=True,
        preserve_missing=preserve_missing,
    )
    items: List[Dict[str, Any]] = []
    for ref in normalized_refs:
        compact: Dict[str, Any] = {}
        for key in ("file_id", "url", "name", "role", "kind"):
            value = ref.get(key)
            if value not in (None, ""):
                compact[key] = value
        if compact:
            items.append(compact)
    return items


def storage_usage_summary_for_user(user_id: str = "") -> Dict[str, Any]:
    uid = os.path.basename(str(user_id or current_user_id() or "anonymous")) or "anonymous"
    quota_bytes = storage_quota_limit_bytes_for_user(uid)
    _ensure_files_table()
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT category, COALESCE(SUM(size_bytes), 0) AS size_bytes, COUNT(*) AS file_count
                FROM files
                WHERE user_id = %s AND deleted_at IS NULL AND status <> 'deleted'
                GROUP BY category
                ORDER BY size_bytes DESC, category ASC
                """,
                (uid,),
            )
            rows = cur.fetchall() or []
    categories = [
        {
            "category": str(row.get("category") or "unknown"),
            "size_bytes": int(row.get("size_bytes") or 0),
            "file_count": int(row.get("file_count") or 0),
        }
        for row in rows
    ]
    total_bytes = sum(item["size_bytes"] for item in categories)
    total_files = sum(item["file_count"] for item in categories)
    return {
        "user_id": uid,
        "quota_enabled": storage_quota_enabled(),
        "quota_bytes": quota_bytes,
        "used_bytes": total_bytes,
        "remaining_bytes": max(0, quota_bytes - total_bytes) if quota_bytes > 0 else None,
        "total_files": total_files,
        "usage_by_category": categories,
    }


def list_media_entries(prefix: str = "", *, user_id: str = "") -> List[Dict[str, Any]]:
    uid = os.path.basename(str(user_id or current_user_id() or "anonymous")) or "anonymous"
    _ensure_files_table()
    params: list[Any] = []
    sql = """
        SELECT * FROM files
        WHERE deleted_at IS NULL AND status <> 'deleted'
    """
    sql += " AND user_id = %s"
    params.append(uid)
    if prefix:
        sql += " AND legacy_url LIKE %s"
        params.append(prefix + "%")
    sql += " ORDER BY created_at DESC"
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() or []
    return [_row_to_entry(row) for row in rows]


def list_media_entries_for_user(
    *,
    user_id: str = "",
    category: str = "",
    search: str = "",
    limit: int = 200,
) -> List[Dict[str, Any]]:
    uid = os.path.basename(str(user_id or current_user_id() or "anonymous")) or "anonymous"
    _ensure_files_table()
    params: List[Any] = [uid]
    sql = """
        SELECT *
        FROM files
        WHERE user_id = %s
          AND deleted_at IS NULL
          AND status <> 'deleted'
    """
    if category:
        sql += " AND category = %s"
        params.append(str(category).strip())
    if search:
        sql += " AND (stored_name ILIKE %s OR original_name ILIKE %s OR category ILIKE %s)"
        pattern = f"%{str(search).strip()}%"
        params.extend([pattern, pattern, pattern])
    sql += " ORDER BY created_at DESC LIMIT %s"
    params.append(max(1, min(int(limit or 200), 1000)))
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() or []
    return [_row_to_entry(row) for row in rows]


def _media_entries_where_for_user(
    *,
    user_id: str = "",
    category: str = "",
    search: str = "",
    created_before: Optional[int] = None,
    unreferenced_only: bool = False,
):
    uid = os.path.basename(str(user_id or current_user_id() or "anonymous")) or "anonymous"
    q = str(search or "").strip().lower()
    params: List[Any] = [uid]
    where = """
        FROM files
        WHERE user_id = %s
          AND deleted_at IS NULL
          AND status <> 'deleted'
    """
    if category:
        where += " AND category = %s"
        params.append(str(category).strip())
    if q:
        where += " AND (stored_name ILIKE %s OR original_name ILIKE %s OR category ILIKE %s)"
        pattern = f"%{str(search).strip()}%"
        params.extend([pattern, pattern, pattern])
    if created_before is not None:
        where += " AND created_at < %s"
        params.append(int(created_before))
    if unreferenced_only:
        where += _UNREFERENCED_FILE_SQL
    return where, params


def list_user_file_ids_matching(
    *,
    user_id: str = "",
    category: str = "",
    search: str = "",
    created_before: Optional[int] = None,
    unreferenced_only: bool = False,
) -> List[str]:
    _ensure_files_table()
    where, params = _media_entries_where_for_user(
        user_id=user_id,
        category=category,
        search=search,
        created_before=created_before,
        unreferenced_only=unreferenced_only,
    )
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id " + where + " ORDER BY created_at ASC, id ASC", params)
            rows = cur.fetchall() or []
    return [str(row.get("id") or "").strip() for row in rows if str(row.get("id") or "").strip()]


def list_media_entries_page_for_user(
    *,
    user_id: str = "",
    category: str = "",
    search: str = "",
    sort_order: str = "desc",
    created_before: Optional[int] = None,
    unreferenced_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    safe_limit = max(1, min(int(limit or 50), 200))
    safe_offset = max(0, int(offset or 0))
    normalized_sort_order = "asc" if str(sort_order or "").strip().lower() == "asc" else "desc"
    _ensure_files_table()
    where, params = _media_entries_where_for_user(
        user_id=user_id,
        category=category,
        search=search,
        created_before=created_before,
        unreferenced_only=unreferenced_only,
    )
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS total " + where, params)
            total_row = cur.fetchone() or {}
            total = int(total_row.get("total") or 0)
            order_sql = "ASC" if normalized_sort_order == "asc" else "DESC"
            cur.execute(
                "SELECT * "
                + where
                + f" ORDER BY created_at {order_sql}, id {order_sql} LIMIT %s OFFSET %s",
                [*params, safe_limit, safe_offset],
            )
            rows = cur.fetchall() or []
    entries = [_row_to_entry(row) for row in rows]
    next_offset = safe_offset + len(entries)
    return {
        "entries": entries,
        "offset": safe_offset,
        "limit": safe_limit,
        "next_offset": next_offset,
        "has_more": next_offset < total,
        "total_matches": total,
        "category_filter": str(category or ""),
        "search": str(search or ""),
        "sort_order": normalized_sort_order,
        "created_before": created_before,
        "unreferenced_only": bool(unreferenced_only),
    }


def remove_media_url(url: str, *, delete_remote: bool = False) -> Optional[Dict[str, Any]]:
    removed = resolve_file_reference(url=str(url or "").strip(), allow_register=False)
    if not removed:
        removed = lookup_media_url(url)
    if not removed:
        return None
    if delete_remote:
        delete_media_objects(removed)
    deleted_at = now_ms()
    _ensure_files_table()
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE files
                SET status = 'deleted', deleted_at = %s, updated_at = %s
                WHERE id = %s
                """,
                (deleted_at, deleted_at, removed["file_id"]),
            )
    cache_path = cached_media_path(removed)
    if cache_path and os.path.isfile(cache_path):
        try:
            os.remove(cache_path)
        except OSError:
            pass
    logger.info(
        "media file deleted",
        extra={
            "event": "media_file_deleted",
            "object_id": removed.get("file_id"),
            "file_id": removed.get("file_id"),
            "bucket": removed.get("bucket"),
            "delete_remote": delete_remote,
        },
    )
    return removed


def media_entry_by_basename(name: str, categories: Optional[set[str]] = None, *, user_id: str = "") -> Optional[Dict[str, Any]]:
    uid = os.path.basename(str(user_id or current_user_id() or "anonymous")) or "anonymous"
    safe_name = os.path.basename(str(name or ""))
    if not safe_name:
        return None
    _ensure_files_table()
    sql = """
        SELECT * FROM files
        WHERE stored_name = %s AND deleted_at IS NULL AND status <> 'deleted' AND user_id = %s
    """
    params: list[Any] = [safe_name, uid]
    if categories:
        sql += " AND category = ANY(%s)"
        params.append(list(categories))
    sql += " ORDER BY created_at DESC LIMIT 1"
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
    return _row_to_entry(row) if row else None


def cached_media_path(entry: Dict[str, Any]) -> str:
    bucket = os.path.basename(str(entry.get("bucket") or "private"))
    object_key = str(entry.get("object_key") or "").strip("/").replace("..", "_")
    return os.path.join(STORAGE_CACHE_DIR, bucket, object_key)


def _touch_access(file_id: str) -> None:
    if not file_id or not metadata_db_enabled():
        return
    touched_at = now_ms()
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE files SET last_accessed_at = %s, updated_at = %s WHERE id = %s",
                (touched_at, touched_at, file_id),
            )


def materialize_media_url(url: str) -> Optional[str]:
    if isinstance(url, str):
        parsed = urllib.parse.urlsplit(url)
        path = parsed.path or url
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 3 and parts[0] == "api" and parts[1] == "files":
            file_id = parts[2]
            entry = get_file_by_id(file_id)
        else:
            entry = lookup_media_url(url)
    else:
        entry = None
    if not entry:
        return None
    target = cached_media_path(entry)
    if os.path.isfile(target):
        _touch_access(entry.get("file_id") or "")
        return target
    os.makedirs(os.path.dirname(target), exist_ok=True)
    data = get_object_bytes(entry["bucket"], entry["object_key"])
    tmp_target = f"{target}.tmp"
    with open(tmp_target, "wb") as f:
        f.write(data)
    os.replace(tmp_target, target)
    _touch_access(entry.get("file_id") or "")
    return target


def build_object_key(category: str, file_id: str, ext: str = "", *, user_id: str = "") -> str:
    uid = os.path.basename(str(user_id or current_user_id() or "anonymous")) or "anonymous"
    now = datetime.utcnow()
    year = f"{now.year:04d}"
    month = f"{now.month:02d}"
    folder = {
        "input": "inputs",
        "uploads": "uploads",
        "output": "outputs",
        "library": "assets/library",
    }.get(category, category.strip("/") or "uploads")
    suffix = ext if str(ext or "").startswith(".") else f".{ext}" if ext else ""
    return f"users/{uid}/{folder}/{year}/{month}/{file_id}{suffix}"


def build_derived_object_key(file_id: str, variant: str, ext: str, *, user_id: str = "") -> str:
    uid = os.path.basename(str(user_id or current_user_id() or "anonymous")) or "anonymous"
    suffix = ext if str(ext or "").startswith(".") else f".{ext}" if ext else ""
    return f"users/{uid}/derived/{variant}/{file_id}{suffix}"


def media_thumb_object_key(entry_or_file_id: Any, *, user_id: str = "") -> str:
    file_id = entry_or_file_id.get("file_id") if isinstance(entry_or_file_id, dict) else entry_or_file_id
    uid = user_id or (entry_or_file_id.get("user_id") if isinstance(entry_or_file_id, dict) else "")
    return build_derived_object_key(str(file_id or "").strip(), f"thumbs/s{THUMB_SIZE_DEFAULT}", ".webp", user_id=uid)


def media_poster_object_key(entry_or_file_id: Any, *, user_id: str = "") -> str:
    file_id = entry_or_file_id.get("file_id") if isinstance(entry_or_file_id, dict) else entry_or_file_id
    uid = user_id or (entry_or_file_id.get("user_id") if isinstance(entry_or_file_id, dict) else "")
    return build_derived_object_key(str(file_id or "").strip(), f"posters/s{THUMB_SIZE_DEFAULT}", ".jpg", user_id=uid)


def media_derived_object_keys(entry_or_file_id: Any, *, user_id: str = "") -> List[str]:
    file_id = entry_or_file_id.get("file_id") if isinstance(entry_or_file_id, dict) else entry_or_file_id
    uid = user_id or (entry_or_file_id.get("user_id") if isinstance(entry_or_file_id, dict) else "")
    file_id = str(file_id or "").strip()
    if not file_id:
        return []
    return [
        media_thumb_object_key(file_id, user_id=uid),
        media_poster_object_key(file_id, user_id=uid),
    ]


def delete_media_objects(entry: Dict[str, Any]) -> None:
    if not isinstance(entry, dict):
        return
    bucket = str(entry.get("bucket") or "").strip()
    object_key = str(entry.get("object_key") or "").strip()
    if not bucket:
        return
    keys = []
    if object_key:
        keys.append(object_key)
    keys.extend(media_derived_object_keys(entry))
    seen = set()
    for key in keys:
        key = str(key or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        delete_object(bucket, key)


def media_objects_exist(entry: Dict[str, Any]) -> bool:
    if not isinstance(entry, dict):
        return False
    bucket = str(entry.get("bucket") or "").strip()
    object_key = str(entry.get("object_key") or "").strip()
    if not bucket:
        return False
    keys = []
    if object_key:
        keys.append(object_key)
    keys.extend(media_derived_object_keys(entry))
    seen = set()
    for key in keys:
        key = str(key or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        try:
            if object_exists(bucket, key):
                return True
        except Exception:
            return True
    return False


def _generate_image_thumb_bytes(payload: bytes, size: int = THUMB_SIZE_DEFAULT) -> bytes:
    with Image.open(BytesIO(payload)) as img:
        frame = img.convert("RGB")
        frame.thumbnail((size, size), Image.Resampling.LANCZOS)
        out = BytesIO()
        frame.save(out, format="WEBP", quality=76, method=6)
        return out.getvalue()


def _generate_video_poster_bytes(payload: bytes, size: int = THUMB_SIZE_DEFAULT, suffix: str = ".mp4") -> bytes:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return b""
    tmp_in = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_out = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    tmp_in_path = tmp_in.name
    tmp_out_path = tmp_out.name
    tmp_in.close()
    tmp_out.close()
    try:
        with open(tmp_in_path, "wb") as f:
            f.write(payload)
        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            tmp_in_path,
            "-vf",
            f"thumbnail,scale='min({size},iw)':-2",
            "-frames:v",
            "1",
            tmp_out_path,
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        with open(tmp_out_path, "rb") as f:
            return f.read()
    except Exception:
        return b""
    finally:
        for path in (tmp_in_path, tmp_out_path):
            try:
                os.remove(path)
            except OSError:
                pass


def ensure_media_derivatives(entry: Dict[str, Any], *, payload: bytes = b"") -> None:
    if not isinstance(entry, dict):
        return
    file_id = str(entry.get("file_id") or "").strip()
    bucket = str(entry.get("bucket") or "").strip()
    kind = str(entry.get("kind") or "").strip().lower()
    if not file_id or not bucket or kind not in {"image", "video"}:
        return
    blob = payload if isinstance(payload, bytes) else b""
    if not blob:
        try:
            blob = get_object_bytes(bucket, str(entry.get("object_key") or ""))
        except Exception:
            return
    if kind == "image":
        object_key = media_thumb_object_key(entry)
        if object_exists(bucket, object_key):
            return
        thumb = _generate_image_thumb_bytes(blob, THUMB_SIZE_DEFAULT)
        if thumb:
            save_bytes(thumb, object_key, content_type="image/webp", bucket=bucket)
        return
    object_key = media_poster_object_key(entry)
    if object_exists(bucket, object_key):
        return
    ext = str(entry.get("ext") or ".mp4") or ".mp4"
    poster = _generate_video_poster_bytes(blob, THUMB_SIZE_DEFAULT, suffix=ext)
    if poster:
        save_bytes(poster, object_key, content_type="image/jpeg", bucket=bucket)


def save_media_bytes(
    category: str,
    filename: str,
    data: bytes,
    *,
    original_name: str = "",
    content_type: str = "",
    kind: str = "",
    bucket: str = "",
    source: str = "upload",
) -> Dict[str, Any]:
    payload = data if isinstance(data, bytes) else bytes(data or b"")
    enforce_storage_quota(len(payload), category=category)
    file_id = uuid.uuid4().hex
    ext = os.path.splitext(filename)[1].lower()
    object_key = build_object_key(category, file_id, ext)
    stored = save_bytes(payload, object_key, content_type=content_type, bucket=bucket)
    url = file_preview_url(file_id)
    try:
        entry = register_media_url(
            url,
            stored["bucket"],
            stored["object_key"],
            filename=filename,
            category=category,
            original_name=original_name or filename,
            content_type=content_type,
            kind=kind,
            size=stored["size"],
            file_id=file_id,
            sha256=hashlib.sha256(payload).hexdigest(),
            source=source,
            is_public=False,
            expires_at=(
                now_ms() + STORAGE_TEMP_RETENTION_DAYS * 24 * 60 * 60 * 1000
                if category == "temp" and int(STORAGE_TEMP_RETENTION_DAYS or 0) > 0
                else None
            ),
        )
    except Exception:
        try:
            delete_object(stored["bucket"], stored["object_key"])
        except Exception:
            logger.exception(
                "failed to roll back orphaned media object",
                extra={
                    "event": "media_object_rollback_failed",
                    "alert": True,
                    "object_id": file_id,
                    "file_id": file_id,
                    "bucket": stored["bucket"],
                },
            )
        raise
    ensure_media_derivatives(entry, payload=payload)
    logger.info(
        "media file stored",
        extra={
            "event": "media_file_stored",
            "object_id": file_id,
            "file_id": file_id,
            "bucket": stored["bucket"],
            "category": category,
            "size_bytes": stored["size"],
        },
    )
    return {**stored, "url": url, "entry": entry, "file_id": file_id}
