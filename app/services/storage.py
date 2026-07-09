"""Unified object storage access backed by PostgreSQL file metadata."""

from __future__ import annotations

import asyncio
import hashlib
import json
import mimetypes
import os
import tempfile
import urllib.parse
import uuid
from datetime import datetime, timedelta
from io import BytesIO
from threading import Lock
from typing import Any, BinaryIO, Dict, List, Optional

from app.config import (
    ASSET_LIBRARY_DIR,
    DATABASE_URL,
    LOCAL_UPLOAD_DIR,
    MINIO_ACCESS_KEY,
    MINIO_BUCKET_PRIVATE,
    MINIO_BUCKET_PUBLIC,
    MINIO_BUCKET_TEMP,
    MINIO_ENDPOINT,
    MINIO_SECRET_KEY,
    MINIO_SECURE,
    OUTPUT_INPUT_DIR,
    OUTPUT_OUTPUT_DIR,
    STORAGE_CACHE_DIR,
    STORAGE_CLEANUP_BATCH_SIZE,
    STORAGE_CLEANUP_ENABLED,
    STORAGE_CLEANUP_INTERVAL_SECONDS,
    STORAGE_INPUT_RETENTION_DAYS,
    STORAGE_OBJECT_INDEX_FILE,
    STORAGE_OUTPUT_RETENTION_DAYS,
    STORAGE_QUOTA_ENABLED,
    STORAGE_TEMP_RETENTION_DAYS,
    STORAGE_UPLOAD_RETENTION_DAYS,
    STORAGE_USER_QUOTA_BYTES,
)
from app.core.auth import current_user_id, user_data_dir
from app.core.utils import now_ms

_CLIENT = None
_CLIENT_LOCK = Lock()
_BUCKETS_READY: set[str] = set()
_BUCKETS_LOCK = Lock()
_DB_READY = False
_DB_LOCK = Lock()
_INDEX_LOCK = Lock()


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
    text = str(url or "").strip()
    if not text:
        return ""
    path = urllib.parse.urlsplit(text).path or text
    if path.startswith("/output/"):
        path = "/assets/output/" + path[len("/output/"):]
    if not path.startswith("/assets/"):
        return text
    suffix = path[len("/assets/"):].lstrip("/")
    if not suffix:
        return ""
    category, _, remainder = suffix.partition("/")
    if category not in {"input", "output", "library", "uploads"} or not remainder:
        return text
    normalized = urllib.parse.quote(urllib.parse.unquote(remainder).replace("\\", "/"), safe="/._-()")
    return f"/assets/{category}/{normalized}"


def _legacy_category_root(category: str) -> str:
    return {
        "input": OUTPUT_INPUT_DIR,
        "output": OUTPUT_OUTPUT_DIR,
        "library": ASSET_LIBRARY_DIR,
        "uploads": LOCAL_UPLOAD_DIR,
    }.get(str(category or "").strip(), "")


def _legacy_local_path(url: str) -> tuple[str, str]:
    canonical = canonicalize_legacy_media_url(url)
    if not canonical.startswith("/assets/"):
        return "", ""
    suffix = canonical[len("/assets/"):].lstrip("/")
    category, _, remainder = suffix.partition("/")
    root = _legacy_category_root(category)
    if not root or not remainder:
        return "", ""
    rel = urllib.parse.unquote(remainder).replace("\\", "/")
    local_path = os.path.abspath(os.path.join(root, rel))
    root_abs = os.path.abspath(root)
    if os.path.commonpath([root_abs, local_path]) != root_abs:
        return "", ""
    return canonical, local_path


def _kind_for_path(path: str, content_type: str = "") -> str:
    mime = str(content_type or mimetypes.guess_type(path)[0] or "").lower()
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    if mime.startswith("text/"):
        return "text"
    ext = os.path.splitext(str(path or "").lower())[1]
    if ext in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"}:
        return "image"
    if ext in {".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"}:
        return "video"
    if ext in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}:
        return "audio"
    if ext in {".txt", ".md", ".json", ".csv", ".srt", ".vtt"}:
        return "text"
    return "document"


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


def _retention_days_for_category(category: str) -> int:
    return {
        "input": int(STORAGE_INPUT_RETENTION_DAYS or 0),
        "uploads": int(STORAGE_UPLOAD_RETENTION_DAYS or 0),
        "output": int(STORAGE_OUTPUT_RETENTION_DAYS or 0),
        "temp": int(STORAGE_TEMP_RETENTION_DAYS or 0),
    }.get(str(category or "").strip(), 0)


def _quota_applies_to_category(category: str) -> bool:
    return str(category or "").strip() in {"input", "uploads", "output", "library", "temp"}


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
    if size <= 0 or not STORAGE_QUOTA_ENABLED or not metadata_db_enabled():
        return
    if not _quota_applies_to_category(category):
        return
    quota_bytes = int(STORAGE_USER_QUOTA_BYTES or 0)
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
          AND ({' OR '.join(conditions)})
        ORDER BY COALESCE(expires_at, created_at) ASC
        LIMIT %s
    """
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall() or []


def _mark_file_deleted(file_id: str, deleted_at_ms: int) -> None:
    if not file_id or not metadata_db_enabled():
        return
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE files
                SET status = 'deleted', deleted_at = %s, updated_at = %s
                WHERE id = %s
                """,
                (deleted_at_ms, deleted_at_ms, file_id),
            )


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
        _mark_file_deleted(entry.get("file_id") or "", deleted_at_ms)
        try:
            delete_object(entry["bucket"], entry["object_key"])
        except Exception:
            pass
        cache_path = cached_media_path(entry)
        if cache_path and os.path.isfile(cache_path):
            try:
                os.remove(cache_path)
            except OSError:
                pass
        deleted += 1
    return {"scanned": len(rows), "deleted": deleted}


async def storage_cleanup_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(run_storage_cleanup_once)
        except Exception:
            pass
        await asyncio.sleep(max(60, int(STORAGE_CLEANUP_INTERVAL_SECONDS or 3600)))


def _storage_import_error() -> RuntimeError:
    return RuntimeError("MinIO SDK unavailable. Run `uv sync` to install the `minio` dependency.")


def _database_import_error() -> RuntimeError:
    return RuntimeError("PostgreSQL driver unavailable. Run `uv sync` to install the `psycopg` dependency.")


def _get_client():
    global _CLIENT
    if not storage_enabled():
        raise RuntimeError("MinIO is not configured")
    with _CLIENT_LOCK:
        if _CLIENT is None:
            try:
                from minio import Minio
            except ImportError as exc:
                raise _storage_import_error() from exc
            _CLIENT = Minio(
                MINIO_ENDPOINT,
                access_key=MINIO_ACCESS_KEY,
                secret_key=MINIO_SECRET_KEY,
                secure=MINIO_SECURE,
            )
        return _CLIENT


def _db_connect():
    if not metadata_db_enabled():
        return None
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise _database_import_error() from exc
    return psycopg.connect(DATABASE_URL, autocommit=True, row_factory=dict_row)


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
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
        _BUCKETS_READY.add(bucket)


def save_bytes(data: bytes, object_key: str, content_type: str = "", bucket: str = "") -> Dict[str, Any]:
    bucket_name = (bucket or MINIO_BUCKET_PRIVATE).strip() or MINIO_BUCKET_PRIVATE
    _ensure_bucket(bucket_name)
    payload = data if isinstance(data, bytes) else bytes(data or b"")
    client = _get_client()
    result = client.put_object(
        bucket_name,
        object_key,
        BytesIO(payload),
        len(payload),
        content_type=content_type or "application/octet-stream",
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
    result = client.put_object(
        bucket_name,
        object_key,
        fileobj,
        length,
        content_type=content_type or "application/octet-stream",
    )
    return {
        "bucket": bucket_name,
        "object_key": object_key,
        "etag": getattr(result, "etag", ""),
        "version_id": getattr(result, "version_id", ""),
        "size": int(length or 0),
    }


def get_presigned_get_url(bucket: str, object_key: str, expires_seconds: int = 900) -> str:
    return _get_client().presigned_get_object(bucket, object_key, expires=timedelta(seconds=max(1, int(expires_seconds or 900))))


def get_presigned_put_url(bucket: str, object_key: str, expires_seconds: int = 900) -> str:
    return _get_client().presigned_put_object(bucket, object_key, expires=timedelta(seconds=max(1, int(expires_seconds or 900))))


def delete_object(bucket: str, object_key: str) -> None:
    _get_client().remove_object(bucket, object_key)


def stat_object(bucket: str, object_key: str):
    return _get_client().stat_object(bucket, object_key)


def get_object_bytes(bucket: str, object_key: str) -> bytes:
    response = _get_client().get_object(bucket, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def _index_path() -> str:
    return os.path.join(user_data_dir(), STORAGE_OBJECT_INDEX_FILE)


def _load_index() -> Dict[str, Dict[str, Any]]:
    path = _index_path()
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _save_index(index: Dict[str, Dict[str, Any]]) -> None:
    path = _index_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=os.path.dirname(path), delete=False)
    try:
        with tmp:
            json.dump(index, tmp, ensure_ascii=False, indent=2)
        os.replace(tmp.name, path)
    finally:
        if os.path.exists(tmp.name):
            try:
                os.remove(tmp.name)
            except OSError:
                pass


def _fallback_upsert(entry: Dict[str, Any]) -> Dict[str, Any]:
    with _INDEX_LOCK:
        index = _load_index()
        index[entry["url"]] = entry
        _save_index(index)
    return entry


def _fallback_lookup(url: str) -> Optional[Dict[str, Any]]:
    with _INDEX_LOCK:
        return _load_index().get(url)


def _fallback_list(prefix: str = "") -> List[Dict[str, Any]]:
    with _INDEX_LOCK:
        items = list(_load_index().values())
    if prefix:
        items = [item for item in items if str(item.get("url") or "").startswith(prefix)]
    items = [item for item in items if item.get("status") != "deleted"]
    items.sort(key=lambda item: int(item.get("created_at") or 0), reverse=True)
    return items


def _fallback_remove(url: str) -> Optional[Dict[str, Any]]:
    removed = None
    with _INDEX_LOCK:
        index = _load_index()
        removed = index.pop(url, None)
        if removed is not None:
            _save_index(index)
    return removed


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
    }


def _upsert_file_row(entry: Dict[str, Any]) -> Dict[str, Any]:
    if not metadata_db_enabled():
        return _fallback_upsert(entry)
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
    if not metadata_db_enabled():
        return _fallback_lookup(url)
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


def ensure_local_media_registered(url: str) -> Optional[Dict[str, Any]]:
    canonical, local_path = _legacy_local_path(url)
    if not canonical or not local_path or not os.path.isfile(local_path) or not storage_enabled():
        return None
    existing = lookup_media_url(canonical)
    if existing:
        return existing
    try:
        with open(local_path, "rb") as f:
            payload = f.read()
    except OSError:
        return None
    filename = os.path.basename(local_path)
    category = canonical[len("/assets/"):].split("/", 1)[0]
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    kind = _kind_for_path(local_path, content_type)
    file_id = uuid.uuid4().hex
    object_key = build_object_key(category, file_id, os.path.splitext(filename)[1].lower())
    stored = save_bytes(payload, object_key, content_type=content_type)
    entry = register_media_url(
        canonical,
        stored["bucket"],
        stored["object_key"],
        filename=filename,
        category=category,
        original_name=filename,
        content_type=content_type,
        kind=kind,
        size=stored["size"],
        file_id=file_id,
        sha256=hashlib.sha256(payload).hexdigest(),
        source="generated" if category == "output" else ("imported" if category == "library" else "upload"),
        is_public=False,
    )
    return lookup_media_url(canonical) or entry


def resolve_file_reference(url: str = "", file_id: str = "") -> Optional[Dict[str, Any]]:
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
        return ensure_local_media_registered(url)
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
        refs.append({
            "file_id": entry.get("file_id") if entry else "",
        })
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


def normalize_media_ref(ref: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(ref, dict):
        return ref
    normalized = dict(ref)
    file_id = str(normalized.get("file_id") or "").strip()
    url = str(normalized.get("url") or "").strip()
    entry = resolve_file_reference(url=url, file_id=file_id)
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


def normalize_media_refs(refs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for ref in refs or []:
        if not isinstance(ref, dict):
            continue
        normalized = normalize_media_ref(ref)
        if normalized.get("url") or normalized.get("file_id"):
            items.append(normalized)
    return items


def compact_media_ref(ref: Dict[str, Any]) -> Dict[str, Any]:
    normalized = normalize_media_ref(ref or {})
    compact: Dict[str, Any] = {}
    for key in ("file_id", "name", "role", "kind"):
        value = normalized.get(key)
        if value not in (None, ""):
            compact[key] = value
    return compact


def compact_media_refs(refs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for ref in refs or []:
        compact = compact_media_ref(ref)
        if compact:
            items.append(compact)
    return items


def list_media_entries(prefix: str = "") -> List[Dict[str, Any]]:
    if not metadata_db_enabled():
        return _fallback_list(prefix)
    _ensure_files_table()
    params: list[Any] = []
    sql = """
        SELECT * FROM files
        WHERE deleted_at IS NULL AND status <> 'deleted'
    """
    if prefix:
        sql += " AND legacy_url LIKE %s"
        params.append(prefix + "%")
    sql += " ORDER BY created_at DESC"
    with _db_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() or []
    return [_row_to_entry(row) for row in rows]


def remove_media_url(url: str, *, delete_remote: bool = False) -> Optional[Dict[str, Any]]:
    removed = lookup_media_url(url)
    if not removed:
        removed = _fallback_remove(url)
    if not removed:
        return None
    if metadata_db_enabled():
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
    if delete_remote:
        try:
            delete_object(removed["bucket"], removed["object_key"])
        except Exception:
            pass
    cache_path = cached_media_path(removed)
    if cache_path and os.path.isfile(cache_path):
        try:
            os.remove(cache_path)
        except OSError:
            pass
    return removed


def media_entry_by_basename(name: str, categories: Optional[set[str]] = None) -> Optional[Dict[str, Any]]:
    safe_name = os.path.basename(str(name or ""))
    if not safe_name:
        return None
    if not metadata_db_enabled():
        for item in _fallback_list():
            if item.get("filename") != safe_name:
                continue
            if categories and item.get("category") not in categories:
                continue
            return item
        return None
    _ensure_files_table()
    sql = """
        SELECT * FROM files
        WHERE stored_name = %s AND deleted_at IS NULL AND status <> 'deleted'
    """
    params: list[Any] = [safe_name]
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


def save_compat_media_bytes(
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
    return {**stored, "url": url, "entry": entry, "file_id": file_id}
