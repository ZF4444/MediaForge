"""Storage usage, cleanup, and quota management routes."""

from __future__ import annotations

from typing import Any, Dict, List, Set

from fastapi import APIRouter, HTTPException, Query

from app.core.access_control import is_admin
from app.core.auth import (
    USERS,
    USERS_LOCK,
    current_user_id,
)
from app.core.logging import audit_event
from app.models import StorageBatchDeletePayload, StorageQuotaConfigPayload
from app.services.storage import (
    get_user_files_by_ids,
    list_media_entries_page_for_user,
    load_storage_quota_config,
    remove_media_url,
    save_storage_quota_config,
    storage_quota_bytes_for_user,
    storage_quota_limit_bytes_for_user,
    storage_usage_summary_for_user,
)

router = APIRouter()


def _require_admin() -> str:
    uid = current_user_id()
    if not is_admin(uid):
        raise HTTPException(status_code=403, detail="需要管理员权限。")
    return uid


def _registered_users() -> List[Dict[str, str]]:
    with USERS_LOCK:
        items = [
            {"user_id": uid, "username": (info or {}).get("username") or uid}
            for uid, info in USERS.items()
        ]
    items.sort(key=lambda item: item["user_id"])
    return items


def _is_media_ref(item: Any, deleted_ids: Set[str], deleted_urls: Set[str]) -> bool:
    if not isinstance(item, dict):
        return False
    file_id = str(item.get("file_id") or "").strip()
    url = str(item.get("url") or "").strip()
    return bool((file_id and file_id in deleted_ids) or (url and url in deleted_urls))


def _prune_media_refs_value(value: Any, deleted_ids: Set[str], deleted_urls: Set[str]):
    if isinstance(value, list):
        if value and all(isinstance(item, dict) and (("url" in item) or ("file_id" in item)) for item in value):
            return [item for item in value if not _is_media_ref(item, deleted_ids, deleted_urls)]
        return [_prune_media_refs_value(item, deleted_ids, deleted_urls) for item in value]
    if isinstance(value, dict):
        return {
            key: _prune_media_refs_value(item, deleted_ids, deleted_urls)
            for key, item in value.items()
        }
    return value


def _prune_user_media_references(entries: List[Dict[str, Any]]) -> None:
    deleted_ids = {str(entry.get("file_id") or "").strip() for entry in entries if str(entry.get("file_id") or "").strip()}
    deleted_urls = {str(entry.get("url") or "").strip() for entry in entries if str(entry.get("url") or "").strip()}
    if not deleted_ids and not deleted_urls:
        return
    from app.services.assets import sync_asset_library_rows
    from app.services.business_metadata import json_value, metadata_connection
    uid = current_user_id()
    ids = list(deleted_ids)
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("DELETE FROM history_record_files rf USING history_records r WHERE rf.history_record_id=r.id AND r.user_id=%s AND rf.file_id = ANY(%s)", (uid, ids))
        cur.execute("DELETE FROM history_records r WHERE r.user_id=%s AND NOT EXISTS (SELECT 1 FROM history_record_files rf WHERE rf.history_record_id=r.id)", (uid,))
        cur.execute("DELETE FROM conversation_message_files mf USING conversation_messages m, conversations c WHERE mf.message_id=m.id AND m.conversation_id=c.id AND c.user_id=%s AND mf.file_id = ANY(%s)", (uid, ids))
        cur.execute("DELETE FROM smart_canvas_node_files nf USING smart_canvas_nodes n, smart_canvases c WHERE nf.node_id=n.id AND n.canvas_id=c.id AND c.user_id=%s AND nf.file_id = ANY(%s)", (uid, ids))
        cur.execute("SELECT id,viewport_json FROM smart_canvases WHERE user_id=%s", (uid,))
        for canvas in cur.fetchall():
            pruned = _prune_media_refs_value(canvas["viewport_json"], deleted_ids, deleted_urls)
            if pruned != canvas["viewport_json"]:
                cur.execute("UPDATE smart_canvases SET viewport_json=%s WHERE id=%s", (json_value(pruned), canvas["id"]))
        cur.execute("SELECT n.id,n.data_json FROM smart_canvas_nodes n JOIN smart_canvases c ON c.id=n.canvas_id WHERE c.user_id=%s", (uid,))
        for node in cur.fetchall():
            pruned = _prune_media_refs_value(node["data_json"], deleted_ids, deleted_urls)
            if pruned != node["data_json"]:
                cur.execute("UPDATE smart_canvas_nodes SET data_json=%s WHERE id=%s", (json_value(pruned), node["id"]))
        cur.execute("SELECT id,payload_json,updated_at FROM asset_libraries WHERE user_id=%s FOR UPDATE", (uid,))
        for row in cur.fetchall():
            payload = _prune_media_refs_value(row["payload_json"] or {}, deleted_ids, deleted_urls)
            cur.execute("UPDATE asset_libraries SET payload_json=%s WHERE id=%s", (json_value(payload), row["id"]))
            sync_asset_library_rows(cur, row["id"], payload, int(row["updated_at"] or 0))


@router.get("/api/storage/usage")
async def get_storage_usage(
):
    usage = storage_usage_summary_for_user()
    return {
        **usage,
        "effective_quota_bytes": storage_quota_limit_bytes_for_user(),
    }


@router.get("/api/storage/files")
async def get_storage_files(
    category: str = Query(default=""),
    search: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    return list_media_entries_page_for_user(
        category=category,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.post("/api/storage/delete")
async def batch_delete_storage_entries(payload: StorageBatchDeletePayload):
    file_ids = [str(item or "").strip() for item in (payload.file_ids or []) if str(item or "").strip()][:500]
    if not file_ids:
        raise HTTPException(status_code=400, detail="没有选择文件。")
    entries_by_id = get_user_files_by_ids(file_ids)
    entries = [entries_by_id[file_id] for file_id in file_ids if file_id in entries_by_id]
    if not entries:
        return {"deleted": [], "removed": 0}
    _prune_user_media_references(entries)
    removed_ids: List[str] = []
    for entry in entries:
        removed = remove_media_url(entry.get("url") or "", delete_remote=True)
        if removed:
            removed_ids.append(str(removed.get("file_id") or ""))
    audit_event(
        "storage_files_deleted",
        action="delete",
        resource_type="stored_file",
        resource_id=None,
        requested_count=len(file_ids),
        removed_count=len(removed_ids),
        resource_ids=removed_ids,
    )
    return {"deleted": removed_ids, "removed": len(removed_ids)}


@router.get("/api/storage/config")
async def get_storage_quota_config():
    _require_admin()
    users = []
    for item in _registered_users():
        user_id = item["user_id"]
        users.append({
            **item,
            "used_bytes": storage_quota_bytes_for_user(user_id),
            "effective_quota_bytes": storage_quota_limit_bytes_for_user(user_id),
        })
    users.sort(key=lambda item: int(item.get("used_bytes") or 0), reverse=True)
    return {"config": load_storage_quota_config(), "users": users}


@router.put("/api/storage/config")
async def put_storage_quota_config(payload: StorageQuotaConfigPayload):
    _require_admin()
    data = {
        "enabled": bool(payload.enabled),
        "default_quota_bytes": payload.default_quota_bytes,
        "users": {
            user_id: {"quota_bytes": entry.quota_bytes}
            for user_id, entry in (payload.users or {}).items()
        },
    }
    saved = save_storage_quota_config(data)
    audit_event(
        "storage_quota_config_updated",
        action="update",
        resource_type="storage_quota_config",
        resource_id="global",
        after={"enabled": bool(saved.get("enabled")), "configured_user_count": len(saved.get("users") or {})},
    )
    return {"config": saved, "users": _registered_users()}
