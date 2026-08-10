"""历史记录数据逻辑。

从 main.py 原样迁移。save_to_history 被生成域多处复用，
get_comfy_history 被本地 ComfyUI 生图复用，故置于 service 层供多域 import。

依赖：PostgreSQL 业务元数据表与统一文件引用服务。
"""
import json
import urllib.request

from app.core.auth import current_user_id
from app.core.comfyui import comfyui_url
from app.services.business_metadata import metadata_connection, insert_history_record
from app.services.storage import compact_media_refs, file_refs_from_urls, normalize_media_refs, remove_media_url, urls_from_file_refs


def normalize_history_record(record):
    if not isinstance(record, dict):
        return {}
    normalized = dict(record)
    file_refs = normalized.get("image_refs")
    if not isinstance(file_refs, list):
        file_refs = file_refs_from_urls(normalized.get("images") or [])
    try:
        normalized_refs = normalize_media_refs(file_refs, allow_register=True)
    except Exception:
        normalized_refs = []
        for ref in file_refs:
            if not isinstance(ref, dict):
                continue
            try:
                normalized_refs.extend(normalize_media_refs([ref], allow_register=True))
            except Exception:
                continue
    normalized["image_refs"] = compact_media_refs(normalized_refs)
    normalized["images"] = urls_from_file_refs(normalized["image_refs"])
    return normalized


def compact_history_record(record):
    normalized = normalize_history_record(record)
    compacted = dict(normalized)
    compacted.pop("images", None)
    return compacted


def load_history_records(limit: int = None, offset: int = 0):
    """加载当前用户的历史记录。

    limit=None 时保持原有全量返回语义（兼容未传分页参数的现有前端调用）。
    无论是否分页，文件引用都改为一次批量查询，消除按记录逐条查询的 N+1。
    """
    uid = current_user_id()
    with metadata_connection() as conn, conn.cursor() as cur:
        if limit is not None:
            cur.execute(
                "SELECT * FROM history_records WHERE user_id=%s ORDER BY created_at DESC LIMIT %s OFFSET %s",
                (uid, int(limit), int(offset or 0)),
            )
        else:
            cur.execute("SELECT * FROM history_records WHERE user_id=%s ORDER BY created_at DESC", (uid,))
        rows = cur.fetchall()

        record_ids = [row["id"] for row in rows]
        refs_by_record = {rid: [] for rid in record_ids}
        if record_ids:
            cur.execute(
                "SELECT history_record_id,file_id,role FROM history_record_files WHERE history_record_id = ANY(%s) ORDER BY history_record_id, sort_order",
                (record_ids,),
            )
            for r in cur.fetchall():
                refs_by_record[r["history_record_id"]].append({"file_id": r["file_id"], "role": r["role"]})

        result = []
        for row in rows:
            refs = refs_by_record.get(row["id"], [])
            record = dict(row.get("extra_json") or {})
            record.update({"id": row["id"], "timestamp": row["created_at"] / 1000, "prompt": row["prompt"], "type": row["type"], "is_cloud": row["is_cloud"], "image_refs": refs})
            result.append(normalize_history_record(record))
    return result


def save_to_history(record):
    next_record = normalize_history_record(record)
    refs = next_record.get("image_refs") or []
    uid = current_user_id()
    insert_history_record(uid, next_record, refs)


def delete_history_files(record):
    normalized = normalize_history_record(record)
    for ref in normalized.get("image_refs", []):
        if not isinstance(ref, dict):
            continue
        url = str(ref.get("url") or "").strip()
        if url:
            remove_media_url(url, delete_remote=True)


def get_comfy_history(comfy_address, prompt_id):
    try:
        with urllib.request.urlopen(comfyui_url(comfy_address, f"/history/{prompt_id}")) as response:
            return json.loads(response.read())
    except Exception:
        return {}
