"""Storage usage, cleanup, and quota management routes."""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Set

from fastapi import APIRouter, HTTPException, Query

from app.config import CANVAS_LOCK, CONVERSATION_LOCK, HISTORY_LOCK
from app.core.access_control import is_admin
from app.core.auth import (
    USERS,
    USERS_LOCK,
    asset_library_path,
    canvas_dir,
    conversation_base_dir,
    current_user_id,
    history_file,
)
from app.models import StorageBatchDeletePayload, StorageQuotaConfigPayload
from app.services import assets, history
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


def _prune_user_history_refs(deleted_ids: Set[str], deleted_urls: Set[str]) -> None:
    hist_path = history_file()
    if not os.path.exists(hist_path):
        return
    with HISTORY_LOCK:
        records = history.load_history_records()
        next_records = []
        for record in records:
            refs = []
            for ref in record.get("image_refs", []) if isinstance(record.get("image_refs"), list) else []:
                if _is_media_ref(ref, deleted_ids, deleted_urls):
                    continue
                refs.append(ref)
            if not refs:
                continue
            updated = dict(record)
            updated["image_refs"] = refs
            next_records.append(history.compact_history_record(updated))
        with open(hist_path, "w", encoding="utf-8") as f:
            json.dump(next_records, f, ensure_ascii=False, indent=4)


def _prune_user_asset_library_refs(deleted_ids: Set[str], deleted_urls: Set[str]) -> None:
    lib = assets.load_asset_library()
    changed = False
    for library in lib.get("libraries", []) if isinstance(lib.get("libraries"), list) else []:
        for category in library.get("categories", []) if isinstance(library.get("categories"), list) else []:
            items = category.get("items") if isinstance(category.get("items"), list) else []
            kept = []
            for item in items:
                if _is_media_ref(item, deleted_ids, deleted_urls):
                    changed = True
                    continue
                kept.append(item)
            category["items"] = kept
    if changed:
        assets.save_asset_library(lib)


def _rewrite_json_file(path: str, deleted_ids: Set[str], deleted_urls: Set[str], *, lock=None) -> None:
    if not os.path.exists(path):
        return
    if lock is None:
        _rewrite_json_file_unlocked(path, deleted_ids, deleted_urls)
        return
    with lock:
        _rewrite_json_file_unlocked(path, deleted_ids, deleted_urls)


def _rewrite_json_file_unlocked(path: str, deleted_ids: Set[str], deleted_urls: Set[str]) -> None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return
    pruned = _prune_media_refs_value(data, deleted_ids, deleted_urls)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(pruned, f, ensure_ascii=False, indent=2)


def _prune_user_canvas_and_conversation_refs(deleted_ids: Set[str], deleted_urls: Set[str]) -> None:
    canvas_root = canvas_dir()
    if os.path.isdir(canvas_root):
        for name in os.listdir(canvas_root):
            if name.endswith(".json"):
                _rewrite_json_file(os.path.join(canvas_root, name), deleted_ids, deleted_urls, lock=CANVAS_LOCK)
    convo_root = conversation_base_dir()
    if os.path.isdir(convo_root):
        for name in os.listdir(convo_root):
            if name.endswith(".json"):
                _rewrite_json_file(os.path.join(convo_root, name), deleted_ids, deleted_urls, lock=CONVERSATION_LOCK)


def _prune_user_media_references(entries: List[Dict[str, Any]]) -> None:
    deleted_ids = {str(entry.get("file_id") or "").strip() for entry in entries if str(entry.get("file_id") or "").strip()}
    deleted_urls = {str(entry.get("url") or "").strip() for entry in entries if str(entry.get("url") or "").strip()}
    if not deleted_ids and not deleted_urls:
        return
    _prune_user_history_refs(deleted_ids, deleted_urls)
    _prune_user_asset_library_refs(deleted_ids, deleted_urls)
    _prune_user_canvas_and_conversation_refs(deleted_ids, deleted_urls)


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
    removed_ids: List[str] = []
    removed_entries: List[Dict[str, Any]] = []
    for entry in entries:
        removed = remove_media_url(entry.get("url") or "", delete_remote=True)
        if removed:
            removed_ids.append(str(removed.get("file_id") or ""))
            removed_entries.append(removed)
    if removed_entries:
        _prune_user_media_references(removed_entries)
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
    return {"config": save_storage_quota_config(data), "users": _registered_users()}
