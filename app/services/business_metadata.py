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
from app.core.database import database_connection_sync


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
CREATE INDEX IF NOT EXISTS idx_smart_canvas_nodes_canvas_sort ON smart_canvas_nodes(canvas_id, sort_order);
CREATE TABLE IF NOT EXISTS smart_canvas_node_files (
    id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES smart_canvas_nodes(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL REFERENCES files(id) ON DELETE RESTRICT, field_name TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_smart_canvas_node_files_node ON smart_canvas_node_files(node_id);
CREATE INDEX IF NOT EXISTS idx_smart_canvas_node_files_file ON smart_canvas_node_files(file_id);
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY, value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, version BIGINT NOT NULL DEFAULT 1
);
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS ai_task_archive (
    task_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', task_type TEXT NOT NULL DEFAULT '',
    provider_id TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
    created_at DOUBLE PRECISION NOT NULL, completed_at DOUBLE PRECISION NOT NULL,
    upstream_task_id TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', payload_json JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ai_task_archive_owner_created ON ai_task_archive(owner_id, completed_at DESC);
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT NOT NULL, key TEXT NOT NULL, value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY(user_id, key)
);
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL, created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
    UNIQUE(name)
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE TABLE IF NOT EXISTS organization_budgets (
    organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    monthly_budget_cny NUMERIC(14, 4), enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_budgets (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    monthly_budget_usd NUMERIC(14, 4), enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS runninghub_usage_records (
    id TEXT PRIMARY KEY, upstream_task_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL DEFAULT '', org_id TEXT,
    operation TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'submitted',
    submitted_at BIGINT NOT NULL, completed_at BIGINT,
    consume_money_cny NUMERIC(14, 4) NOT NULL DEFAULT 0,
    third_party_money_cny NUMERIC(14, 4) NOT NULL DEFAULT 0,
    total_money_cny NUMERIC(14, 4) NOT NULL DEFAULT 0,
    consume_coins NUMERIC(14, 4) NOT NULL DEFAULT 0,
    task_cost_seconds NUMERIC(14, 4) NOT NULL DEFAULT 0,
    raw_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runninghub_usage_org_submitted ON runninghub_usage_records(org_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_runninghub_usage_user_submitted ON runninghub_usage_records(user_id, submitted_at DESC);
CREATE TABLE IF NOT EXISTS omnilojo_usage_records (
    id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, upstream_log_id TEXT NOT NULL,
    request_id TEXT NOT NULL DEFAULT '', upstream_request_id TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL DEFAULT '', org_id TEXT, external_username TEXT NOT NULL DEFAULT '', token_name TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '', quota NUMERIC(18, 4) NOT NULL DEFAULT 0,
    cost_usd NUMERIC(14, 6) NOT NULL DEFAULT 0, total_money_cny NUMERIC(14, 4) NOT NULL DEFAULT 0,
    prompt_tokens BIGINT NOT NULL DEFAULT 0, completion_tokens BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'succeeded', created_at BIGINT NOT NULL, raw_log JSONB NOT NULL DEFAULT '{}'::jsonb,
    inserted_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, UNIQUE(provider_id, upstream_log_id)
);
ALTER TABLE omnilojo_usage_records ADD COLUMN IF NOT EXISTS request_id TEXT NOT NULL DEFAULT '';
ALTER TABLE omnilojo_usage_records ADD COLUMN IF NOT EXISTS upstream_request_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_omnilojo_usage_org_created ON omnilojo_usage_records(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_omnilojo_usage_created ON omnilojo_usage_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_omnilojo_usage_user_created ON omnilojo_usage_records(user_id, created_at DESC);
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
    return database_connection_sync()


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


def get_app_setting_with_version(key: str, default: Any = None) -> tuple[Any, int]:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT value_json,version FROM app_settings WHERE key=%s", (key,))
        row = cur.fetchone()
    return (row["value_json"], int(row["version"])) if row else (default, 0)


def set_app_setting(key: str, value: Any) -> Any:
    from app.core.utils import now_ms
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO app_settings(key,value_json,created_at,updated_at) VALUES(%s,%s,%s,%s) ON CONFLICT(key) DO UPDATE SET value_json=EXCLUDED.value_json,updated_at=EXCLUDED.updated_at,version=app_settings.version+1", (key, json_value(value), now, now))
    return value


def set_app_setting_if_version(key: str, value: Any, expected_version: int) -> int | None:
    """Compare-and-set an application setting and return its next version."""
    from app.core.utils import now_ms
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO app_settings(key,value_json,created_at,updated_at,version)
               VALUES(%s,%s,%s,%s,1)
               ON CONFLICT(key) DO UPDATE SET value_json=EXCLUDED.value_json,
                   updated_at=EXCLUDED.updated_at,version=app_settings.version+1
               WHERE app_settings.version=%s RETURNING version""",
            (key, json_value(value), now, now, expected_version),
        )
        row = cur.fetchone()
    return int(row["version"]) if row else None


def archive_ai_task(task: Dict[str, Any]) -> None:
    """Persist a terminal task once so Redis expiration does not erase its audit trail."""
    from app.core.utils import now_ms
    task_id = str(task.get("id") or "").strip()
    if not task_id:
        return
    payload = {key: value for key, value in task.items() if key not in {"request", "result"}}
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO ai_task_archive(task_id,owner_id,task_type,provider_id,model,status,created_at,completed_at,upstream_task_id,error,payload_json)
               VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT(task_id) DO UPDATE SET status=EXCLUDED.status, completed_at=EXCLUDED.completed_at,
                 upstream_task_id=EXCLUDED.upstream_task_id, error=EXCLUDED.error, payload_json=EXCLUDED.payload_json""",
            (task_id, str(task.get("owner_id") or ""), str(task.get("type") or ""), str(task.get("provider_id") or ""),
             str(task.get("model") or ""), str(task.get("status") or ""), float(task.get("created_at") or now_ms() / 1000),
             float(task.get("updated_at") or now_ms() / 1000), str(task.get("upstream_task_id") or ""), str(task.get("error") or ""), json_value(payload)),
        )


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
        cur.execute("SELECT id,sort_order,data_json FROM smart_canvas_nodes WHERE canvas_id=%s", (payload["id"],))
        existing_nodes = {row["id"]: row for row in cur.fetchall()}
        for order, node in enumerate(nodes):
            node_id = node.get("id") or new_id()
            node["id"] = node_id
            existing = existing_nodes.pop(node_id, None)
            node_changed = existing is None or existing["data_json"] != node
            if existing is None:
                cur.execute("INSERT INTO smart_canvas_nodes(id,canvas_id,node_type,position_x,position_y,sort_order,data_json,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)", (node_id, payload["id"], node.get("type", node.get("node_type", "")), float(node.get("x", 0) or 0), float(node.get("y", 0) or 0), order, json_value(node), node.get("created_at", now), now))
            elif node_changed or existing["sort_order"] != order:
                cur.execute("UPDATE smart_canvas_nodes SET node_type=%s,position_x=%s,position_y=%s,sort_order=%s,data_json=%s,updated_at=%s WHERE id=%s AND canvas_id=%s", (node.get("type", node.get("node_type", "")), float(node.get("x", 0) or 0), float(node.get("y", 0) or 0), order, json_value(node), now, node_id, payload["id"]))
            old_refs = list(_file_refs(existing["data_json"])) if existing else []
            new_refs = list(_file_refs(node))
            if existing is None or old_refs != new_refs:
                if existing is not None:
                    cur.execute("DELETE FROM smart_canvas_node_files WHERE node_id=%s", (node_id,))
                for ref_order, (file_id, field_name, role) in enumerate(new_refs):
                    cur.execute("INSERT INTO smart_canvas_node_files(id,node_id,file_id,field_name,sort_order,role) SELECT %s,%s,%s,%s,%s,%s WHERE EXISTS (SELECT 1 FROM files WHERE id=%s AND deleted_at IS NULL AND status <> 'deleted' FOR KEY SHARE)", (new_id(), node_id, file_id, field_name, ref_order, role, file_id))
        for removed_node_id in existing_nodes:
            cur.execute("DELETE FROM smart_canvas_nodes WHERE id=%s AND canvas_id=%s", (removed_node_id, payload["id"]))


def update_canvas_metadata(user_id: str, canvas_id: str, *, title: Optional[str] = None,
                           icon: Optional[str] = None, owner: Optional[str] = None,
                           color: Optional[str] = None, pinned: Optional[bool] = None) -> Optional[Dict[str, Any]]:
    """Update canvas metadata without loading or rewriting its nodes."""
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """WITH updated AS (
                   UPDATE smart_canvases
                   SET title=COALESCE(%s,title), icon=COALESCE(%s,icon),
                       owner=COALESCE(%s,owner), color=COALESCE(%s,color),
                       pinned=COALESCE(%s,pinned)
                   WHERE id=%s AND user_id=%s
                   RETURNING id,title,icon,owner,color,pinned,created_at,updated_at
               )
               SELECT updated.*, (SELECT COUNT(*) FROM smart_canvas_nodes WHERE canvas_id=updated.id) AS node_count
               FROM updated""",
            (title, icon, owner, color, pinned, canvas_id, user_id),
        )
        return cur.fetchone()


def touch_canvas_payload(user_id: str, canvas_id: str, updated_at: int) -> Optional[Dict[str, Any]]:
    """Advance a canvas timestamp without rewriting its nodes or file references."""
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """WITH updated AS (
                   UPDATE smart_canvases SET updated_at=%s
                   WHERE id=%s AND user_id=%s
                   RETURNING id,title,icon,owner,color,pinned,created_at,updated_at
               )
               SELECT updated.*, (SELECT COUNT(*) FROM smart_canvas_nodes WHERE canvas_id=updated.id) AS node_count
               FROM updated""",
            (updated_at, canvas_id, user_id),
        )
        return cur.fetchone()


def load_canvas_payload(user_id: str, canvas_id: str) -> Optional[Dict[str, Any]]:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM smart_canvases WHERE id=%s AND user_id=%s", (canvas_id, user_id)); row = cur.fetchone()
        if not row: return None
        cur.execute("SELECT data_json FROM smart_canvas_nodes WHERE canvas_id=%s ORDER BY sort_order", (canvas_id,)); nodes = [r["data_json"] for r in cur.fetchall()]
    meta = row.get("viewport_json") or {}; payload = dict(meta.get("payload") or {})
    payload.update({"id": row["id"], "title": row["title"], "icon": row["icon"], "owner": row["owner"], "color": row["color"], "pinned": row["pinned"], "created_at": row["created_at"], "updated_at": row["updated_at"], "deleted_at": row["deleted_at"], "viewport": meta.get("viewport") or {}, "nodes": nodes})
    return payload


def list_canvas_records(user_id: str) -> list:
    """聚合查询画布列表：SQL 层直接算出 node_count，不拉取节点 data_json。

    避免「先查全部 id 再逐个 load_canvas_payload」的 N+1 + 全量节点加载模式。
    返回的字典字段与 load_canvas_payload 的元数据字段保持一致（不含 nodes/viewport），
    交由调用方复用现有的规范化逻辑（如 canvas_record）。
    """
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.id, c.title, c.icon, c.owner, c.color, c.pinned,
                   c.created_at, c.updated_at, c.viewport_json,
                   COUNT(n.id) AS node_count
            FROM smart_canvases c
            LEFT JOIN smart_canvas_nodes n ON n.canvas_id = c.id
            WHERE c.user_id=%s AND c.deleted_at IS NULL
            GROUP BY c.id, c.title, c.icon, c.owner, c.color, c.pinned,
                     c.created_at, c.updated_at, c.viewport_json
            """,
            (user_id,),
        )
        rows = cur.fetchall()
    records = []
    for row in rows:
        meta = row.get("viewport_json") or {}
        payload = dict(meta.get("payload") or {})
        records.append({
            "id": row["id"],
            "title": row["title"],
            "icon": row["icon"],
            "owner": row["owner"],
            "color": row["color"],
            "pinned": row["pinned"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "kind": payload.get("kind"),
            "node_count": int(row["node_count"] or 0),
        })
    return records


def delete_canvas_payload(user_id: str, canvas_id: str) -> None:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM smart_canvases WHERE id=%s AND user_id=%s", (canvas_id, user_id))
