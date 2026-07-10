"""历史记录数据逻辑。

从 main.py 原样迁移。save_to_history 被生成域多处复用，
get_comfy_history 被本地 ComfyUI 生图复用，故置于 service 层供多域 import。

依赖：
- app.config：HISTORY_LOCK
- app.core.auth：history_file（按用户隔离）
"""
import json
import os
import time
import urllib.request

from app.config import HISTORY_LOCK
from app.core.auth import history_file
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


def load_history_records():
    hist_path = history_file()
    if not os.path.exists(hist_path):
        return []
    try:
        with open(hist_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    return [normalize_history_record(item) for item in data if isinstance(item, dict)]


def save_to_history(record):
    with HISTORY_LOCK:
        hist_path = history_file()
        history = load_history_records()
        next_record = normalize_history_record(record)
        if "timestamp" not in next_record:
            next_record["timestamp"] = time.time()
        history.insert(0, next_record)
        persisted = [compact_history_record(item) for item in history[:5000]]
        with open(hist_path, 'w', encoding='utf-8') as f:
            json.dump(persisted, f, ensure_ascii=False, indent=4)


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
        with urllib.request.urlopen(f"http://{comfy_address}/history/{prompt_id}") as response:
            return json.loads(response.read())
    except Exception:
        return {}
