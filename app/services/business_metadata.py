"""Business metadata schema and small persistence helpers.

The service is deliberately independent from the file storage implementation:
files are owned by ``files`` and this module only owns business rows and their
explicit file references. PostgreSQL is required; there is no JSON fallback.
"""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, Iterable, Optional

from app.config import DATABASE_URL
from app.core.database import database_connection


BUSINESS_METADATA_SQL = """
CREATE TABLE IF NOT EXISTS history_records (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'zimage',
    prompt TEXT NOT NULL DEFAULT '', is_cloud BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, extra_json JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_history_records_user_created ON history_records(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS history_record_files (
    id TEXT PRIMARY KEY, history_record_id TEXT NOT NULL REFERENCES history_records(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT, sort_order INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT '', created_at BIGINT NOT NULL, UNIQUE(history_record_id, file_id, role)
);
CREATE INDEX IF NOT EXISTS idx_history_record_files_file ON history_record_files(file_id);
CREATE TABLE IF NOT EXISTS asset_libraries (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'default',
    is_default BOOLEAN NOT NULL DEFAULT FALSE, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
    UNIQUE(user_id, name)
);
ALTER TABLE asset_libraries ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS asset_categories (
    id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES asset_libraries(id) ON DELETE CASCADE,
    name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'default', sort_order INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, UNIQUE(library_id, name)
);
CREATE TABLE IF NOT EXISTS asset_items (
    id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES asset_categories(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT, name TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'file',
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, extra_json JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_asset_items_category ON asset_items(category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_items_file ON asset_items(file_id);
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL, extra_json JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS conversation_messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, extra_json JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS conversation_message_files (
    id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT, sort_order INTEGER NOT NULL DEFAULT 0,
    kind TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_conversation_message_files_file ON conversation_message_files(file_id);
CREATE TABLE IF NOT EXISTS smart_canvases (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '',
    owner TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '', pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, deleted_at BIGINT, viewport_json JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_smart_canvases_user_updated ON smart_canvases(user_id, updated_at DESC);
UPDATE smart_canvases SET deleted_at = NULL WHERE deleted_at = 0;
CREATE TABLE IF NOT EXISTS smart_canvas_nodes (
    id TEXT PRIMARY KEY, canvas_id TEXT NOT NULL REFERENCES smart_canvases(id) ON DELETE CASCADE,
    node_type TEXT NOT NULL DEFAULT '', position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
    position_y DOUBLE PRECISION NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
    data_json JSONB NOT NULL DEFAULT '{}'::jsonb, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS smart_canvas_node_files (
    id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES smart_canvas_nodes(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT, field_name TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_smart_canvas_node_files_file ON smart_canvas_node_files(file_id);
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY, value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT NOT NULL, key TEXT NOT NULL, value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY(user_id, key)
);
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL, created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL, created_at BIGINT NOT NULL, last_seen BIGINT NOT NULL, expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE TABLE IF NOT EXISTS feedback_entries (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL, type TEXT NOT NULL,
    content TEXT NOT NULL, page TEXT NOT NULL DEFAULT '', user_agent TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open', admin_note TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback_entries(status, created_at DESC);
CREATE TABLE IF NOT EXISTS help_pages (
    slug TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '', updated_at BIGINT NOT NULL
);
"""


def _connect():
    return database_connection()


def initialize_business_metadata() -> bool:
    if not DATABASE_URL:
        raise RuntimeError("业务元数据系统必须配置 DATABASE_URL；不支持本地 JSON 存储")
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(BUSINESS_METADATA_SQL)
    return True


def new_id() -> str:
    return str(uuid.uuid4())


def json_value(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=False)


def _file_refs(value: Any, field_name: str = ""):
    if isinstance(value, dict):
        file_id = str(value.get("file_id") or "").strip()
        if file_id:
            yield file_id, field_name, str(value.get("role") or "")
        for key, child in value.items():
            yield from _file_refs(child, str(key))
    elif isinstance(value, list):
        for child in value:
            yield from _file_refs(child, field_name)


def insert_history_record(user_id: str, record: Dict[str, Any], file_refs: Iterable[Dict[str, Any]] = ()) -> str:
    """Insert a history record and its file references atomically."""
    from app.core.utils import now_ms
    rid = new_id()
    raw_created = record.get("created_at")
    if raw_created is None and record.get("timestamp") is not None:
        raw_created = float(record.get("timestamp") or 0) * 1000
    try:
        now = int(raw_created) if raw_created else now_ms()
    except (TypeError, ValueError):
        now = now_ms()
    extra = dict(record.get("extra_json") or {})
    extra.update({
        key: value for key, value in record.items()
        if key not in {"id", "user_id", "type", "prompt", "is_cloud", "timestamp", "created_at", "updated_at", "images", "image_refs", "extra_json"}
    })
    with _connect() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("INSERT INTO history_records(id,user_id,type,prompt,is_cloud,created_at,updated_at,extra_json) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)", (rid, user_id, record.get('type','zimage'), record.get('prompt',''), bool(record.get('is_cloud')), now, now, json_value(extra)))
                for order, ref in enumerate(file_refs):
                    fid = str(ref.get('file_id') or '').strip()
                    if fid:
                        cur.execute("INSERT INTO history_record_files(id,history_record_id,file_id,sort_order,role,created_at) SELECT %s,%s,%s,%s,%s,%s WHERE EXISTS (SELECT 1 FROM files WHERE id=%s AND deleted_at IS NULL AND status <> 'deleted' FOR KEY SHARE)", (new_id(), rid, fid, order, ref.get('role',''), now, fid))
    return rid


def metadata_connection():
    """Return a PostgreSQL connection; business metadata never has a JSON fallback."""
    if not DATABASE_URL:
        raise RuntimeError("业务元数据系统必须配置 DATABASE_URL")
    return _connect()


def get_app_setting(key: str, default: Any = None) -> Any:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT value_json FROM app_settings WHERE key=%s", (key,))
        row = cur.fetchone()
    return row["value_json"] if row else default


def set_app_setting(key: str, value: Any) -> Any:
    from app.core.utils import now_ms
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO app_settings(key,value_json,created_at,updated_at) VALUES(%s,%s,%s,%s) ON CONFLICT(key) DO UPDATE SET value_json=EXCLUDED.value_json,updated_at=EXCLUDED.updated_at", (key, json_value(value), now, now))
    return value


def get_user_setting(user_id: str, key: str, default: Any = None) -> Any:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT value_json FROM user_settings WHERE user_id=%s AND key=%s", (user_id, key))
        row = cur.fetchone()
    return row["value_json"] if row else default


def set_user_setting(user_id: str, key: str, value: Any) -> Any:
    from app.core.utils import now_ms
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO user_settings(user_id,key,value_json,created_at,updated_at) VALUES(%s,%s,%s,%s,%s) ON CONFLICT(user_id,key) DO UPDATE SET value_json=EXCLUDED.value_json,updated_at=EXCLUDED.updated_at", (user_id, key, json_value(value), now, now))
    return value


def save_canvas_payload(user_id: str, canvas: Dict[str, Any]) -> None:
    now = int(canvas.get("updated_at") or 0)
    payload = dict(canvas)
    nodes = payload.pop("nodes", [])
    try:
        deleted_at = int(payload.get("deleted_at") or 0) or None
    except (TypeError, ValueError):
        deleted_at = None
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("INSERT INTO smart_canvases(id,user_id,title,icon,owner,color,pinned,created_at,updated_at,deleted_at,viewport_json) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,icon=EXCLUDED.icon,owner=EXCLUDED.owner,color=EXCLUDED.color,pinned=EXCLUDED.pinned,updated_at=EXCLUDED.updated_at,deleted_at=EXCLUDED.deleted_at,viewport_json=EXCLUDED.viewport_json", (payload["id"], user_id, payload.get("title", ""), payload.get("icon", ""), payload.get("owner", ""), payload.get("color", ""), bool(payload.get("pinned")), payload.get("created_at", now), now, deleted_at, json_value({"viewport": payload.get("viewport", {}), "payload": {k:v for k,v in payload.items() if k not in {"id","title","icon","owner","color","pinned","created_at","updated_at","deleted_at","viewport"}}})))
        cur.execute("DELETE FROM smart_canvas_node_files WHERE node_id IN (SELECT id FROM smart_canvas_nodes WHERE canvas_id=%s)", (payload["id"],))
        cur.execute("DELETE FROM smart_canvas_nodes WHERE canvas_id=%s", (payload["id"],))
        for order, node in enumerate(nodes):
            node_id = node.get("id") or new_id()
            cur.execute("INSERT INTO smart_canvas_nodes(id,canvas_id,node_type,position_x,position_y,sort_order,data_json,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)", (node_id, payload["id"], node.get("type", node.get("node_type", "")), float(node.get("x", 0) or 0), float(node.get("y", 0) or 0), order, json_value(node), node.get("created_at", now), now))
            for ref_order, (file_id, field_name, role) in enumerate(_file_refs(node)):
                cur.execute("INSERT INTO smart_canvas_node_files(id,node_id,file_id,field_name,sort_order,role) SELECT %s,%s,%s,%s,%s,%s WHERE EXISTS (SELECT 1 FROM files WHERE id=%s AND deleted_at IS NULL AND status <> 'deleted' FOR KEY SHARE)", (new_id(), node_id, file_id, field_name, ref_order, role, file_id))


def load_canvas_payload(user_id: str, canvas_id: str) -> Optional[Dict[str, Any]]:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM smart_canvases WHERE id=%s AND user_id=%s", (canvas_id, user_id)); row = cur.fetchone()
        if not row: return None
        cur.execute("SELECT data_json FROM smart_canvas_nodes WHERE canvas_id=%s ORDER BY sort_order", (canvas_id,)); nodes = [r["data_json"] for r in cur.fetchall()]
    meta = row.get("viewport_json") or {}; payload = dict(meta.get("payload") or {})
    payload.update({"id": row["id"], "title": row["title"], "icon": row["icon"], "owner": row["owner"], "color": row["color"], "pinned": row["pinned"], "created_at": row["created_at"], "updated_at": row["updated_at"], "deleted_at": row["deleted_at"], "viewport": meta.get("viewport") or {}, "nodes": nodes})
    return payload


def delete_canvas_payload(user_id: str, canvas_id: str) -> None:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM smart_canvases WHERE id=%s AND user_id=%s", (canvas_id, user_id))
