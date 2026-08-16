"""素材库（asset-library）的数据与规范化逻辑。

从 main.py 的「素材库」相关 helper 原样迁移，行为完全一致。
被 app/routers/assets.py 复用；avatar 注册/审核路由（跨域依赖已接入的平台）
暂留在 main.py，通过 import-back 复用本模块的 load/save/find 等函数。

依赖：
- app.core.auth：current_user_id（按用户隔离）
- app.core.utils：now_ms
- app.core.shared：sanitize_asset_name
- app.core.ws：manager（广播素材库更新）
- app.core.shared_state：get_global_loop（运行期事件循环）
"""
import asyncio
import json
import os
import uuid
from typing import Any, Dict, Tuple

from app.core.shared import sanitize_asset_name
from app.core.shared_state import get_global_loop
from app.core.utils import now_ms
from app.services.storage import compact_media_ref, resolve_file_reference, resolve_url_for_file_id, save_media_bytes
from app.core.ws import manager
import re


def default_asset_library():
    categories = [
        {"id": "characters", "name": "角色", "type": "image", "items": []},
        {"id": "scenes", "name": "场景", "type": "image", "items": []},
        {"id": "workflows", "name": "工作流", "type": "workflow", "items": []},
    ]
    return {
        "active_library_id": "default",
        "libraries": [{"id": "default", "name": "默认资产库", "type": "asset", "categories": categories}],
        "categories": categories,
        "updated_at": now_ms(),
    }


def normalize_asset_library(lib):
    if not isinstance(lib, dict):
        lib = default_asset_library()
    legacy_categories = lib.get("categories") if isinstance(lib.get("categories"), list) else None
    libraries = lib.get("libraries") if isinstance(lib.get("libraries"), list) else []
    if not libraries:
        libraries = [{
            "id": "default",
            "name": "默认资产库",
            "type": "asset",
            "categories": legacy_categories or default_asset_library()["categories"],
        }]
    for library in libraries:
        library["id"] = re.sub(r"[^A-Za-z0-9_-]+", "_", str(library.get("id") or f"lib_{uuid.uuid4().hex[:8]}"))[:40]
        library["name"] = sanitize_asset_name(library.get("name") or "资产库", "资产库")
        cats = library.get("categories") if isinstance(library.get("categories"), list) else []
        if not any(c.get("type") == "workflow" for c in cats):
            cats.append({"id": "workflows", "name": "工作流", "type": "workflow", "items": []})
        for cat in cats:
            for item in (cat.get("items") or []):
                migrate_asset_item_registrations(item)
                normalize_asset_item_reference(item)
        library["categories"] = cats
    active = str(lib.get("active_library_id") or libraries[0].get("id") or "default")
    if not any(item.get("id") == active for item in libraries):
        active = libraries[0].get("id") or "default"
    active_library = next((item for item in libraries if item.get("id") == active), libraries[0])
    lib["libraries"] = libraries
    lib["active_library_id"] = active
    lib["categories"] = active_library.get("categories") or []
    lib["updated_at"] = int(lib.get("updated_at") or now_ms())
    sort_asset_library_items(lib)
    return lib


AVATAR_LEGACY_FLAT_FIELDS = ("platform", "provider_id", "project_name", "avatar_task_id",
                             "avatar_status", "avatar_detail", "asset_uri", "asset_id", "registered_at")


def migrate_asset_item_registrations(item):
    """一个素材可注册到多平台：把旧的单平台扁平字段折叠进 item['registrations'][platform]，再清掉旧字段。"""
    if not isinstance(item, dict):
        return
    regs = item.get("registrations")
    if not isinstance(regs, dict):
        regs = {}
    legacy_platform = str(item.get("platform") or "").strip()
    if legacy_platform and legacy_platform not in regs and (item.get("asset_uri") or item.get("avatar_task_id")):
        regs[legacy_platform] = {
            "provider_id": item.get("provider_id") or "",
            "project_name": item.get("project_name") or "default",
            "task_id": item.get("avatar_task_id") or "",
            "status": item.get("avatar_status") or "",
            "detail": item.get("avatar_detail") or "",
            "asset_uri": item.get("asset_uri") or "",
            "asset_id": item.get("asset_id") or "",
            "registered_at": item.get("registered_at") or 0,
        }
    item["registrations"] = regs if isinstance(regs, dict) else {}
    for key in AVATAR_LEGACY_FLAT_FIELDS:
        item.pop(key, None)


def normalize_asset_item_reference(item):
    if not isinstance(item, dict):
        return item
    file_id = str(item.get("file_id") or "").strip()
    url = str(item.get("url") or "").strip()
    entry = resolve_file_reference(url=url, file_id=file_id)
    if entry:
        item["file_id"] = entry.get("file_id") or file_id
        item["url"] = entry.get("url") or url
        item["kind"] = item.get("kind") or entry.get("kind") or "image"
        if not item.get("created_at"):
            item["created_at"] = entry.get("created_at") or now_ms()
    elif file_id and not url:
        item["url"] = resolve_url_for_file_id(file_id, "")
    return item


def compact_asset_item_reference(item):
    if not isinstance(item, dict):
        return item
    compacted = dict(item)
    media_ref = compact_media_ref({
        "file_id": compacted.get("file_id") or "",
        "url": compacted.get("url") or "",
        "name": compacted.get("name") or "",
        "kind": compacted.get("kind") or "",
    })
    compacted["file_id"] = media_ref.get("file_id", "")
    compacted.pop("url", None)
    return compacted


def load_asset_library():
    from app.services.business_metadata import metadata_connection
    from app.core.auth import current_user_id
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT payload_json FROM asset_libraries WHERE user_id=%s ORDER BY is_default DESC, created_at LIMIT 1", (current_user_id(),))
        row = cur.fetchone()
    if row and row.get("payload_json"):
        return normalize_asset_library(row["payload_json"])
    return default_asset_library()


def sort_asset_library_items(lib):
    cats = list(lib.get("categories", []))
    for library in lib.get("libraries", []) if isinstance(lib.get("libraries"), list) else []:
        cats.extend(library.get("categories") or [])
    seen = set()
    for cat in cats:
        if id(cat) in seen:
            continue
        seen.add(id(cat))
        items = cat.get("items")
        if isinstance(items, list):
            def created_at_key(item):
                if not isinstance(item, dict):
                    return 0
                try:
                    return int(float(item.get("created_at") or 0))
                except (TypeError, ValueError):
                    return 0
            items.sort(key=created_at_key, reverse=True)


def asset_library_media_kind(path: str, content_type: str = "") -> str:
    ext = os.path.splitext(path or "")[1].lower()
    ct = (content_type or "").lower()
    if ext in {".mp4", ".webm", ".mov", ".m4v", ".mkv"} or ct.startswith("video/"):
        return "video"
    if ext in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"} or ct.startswith("audio/"):
        return "audio"
    return "image"


def asset_library_safe_extension(path: str, kind: str) -> str:
    ext = os.path.splitext(path or "")[1].lower()
    allowed = {
        "image": {".png", ".jpg", ".jpeg", ".webp", ".gif"},
        "video": {".mp4", ".webm", ".mov", ".m4v", ".mkv"},
        "audio": {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"},
    }
    fallback = {"image": ".png", "video": ".mp4", "audio": ".mp3"}
    return ext if ext in allowed.get(kind, allowed["image"]) else fallback.get(kind, ".png")


def make_asset_library_item(src: str, name: str = "") -> Tuple[str, Dict[str, Any]]:
    kind = asset_library_media_kind(src)
    ext = asset_library_safe_extension(src, kind)
    safe_name = sanitize_asset_name(name or os.path.basename(src), "asset")
    if not os.path.splitext(safe_name)[1]:
        safe_name += ext
    dest_name = f"lib_{uuid.uuid4().hex[:12]}_{safe_name}"
    with open(src, "rb") as f:
        stored = save_media_bytes(
            "library",
            dest_name,
            f.read(),
            original_name=safe_name,
            content_type="",
            kind=kind,
            source="imported",
        )
    item = {
        "id": f"asset_{uuid.uuid4().hex[:12]}",
        "name": os.path.splitext(safe_name)[0][:120],
        "url": stored["url"],
        "file_id": stored.get("file_id", ""),
        "kind": kind,
        "created_at": now_ms(),
    }
    return dest_name, item


def save_asset_library(lib):
    lib = normalize_asset_library(lib)
    sort_asset_library_items(lib)
    lib["updated_at"] = now_ms()
    persisted = json.loads(json.dumps(lib, ensure_ascii=False))
    for library in persisted.get("libraries", []) if isinstance(persisted.get("libraries"), list) else []:
        for cat in library.get("categories", []) if isinstance(library.get("categories"), list) else []:
            for index, item in enumerate(cat.get("items", []) if isinstance(cat.get("items"), list) else []):
                cat["items"][index] = compact_asset_item_reference(item)
    from app.services.business_metadata import metadata_connection
    from app.core.auth import current_user_id
    uid = current_user_id()
    envelope_id = "default_" + uid
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute("INSERT INTO asset_libraries(id,user_id,name,type,is_default,created_at,updated_at,payload_json) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET updated_at=EXCLUDED.updated_at,payload_json=EXCLUDED.payload_json", (envelope_id, uid, "默认资产库", "asset", True, lib.get("updated_at", now_ms()), lib.get("updated_at", now_ms()), json.dumps(persisted, ensure_ascii=False)))
        sync_asset_library_rows(cur, envelope_id, persisted, int(lib["updated_at"]))
    loop = get_global_loop()
    if loop:
        asyncio.run_coroutine_threadsafe(
            manager.broadcast_asset_library_updated(int(lib["updated_at"]), uid), loop,
        )


def sync_asset_library_rows(cur, envelope_id: str, lib: Dict[str, Any], timestamp: int) -> None:
    """Mirror the compatibility payload into queryable category/item rows."""
    cur.execute("DELETE FROM asset_categories WHERE library_id=%s", (envelope_id,))
    for library_order, library in enumerate(lib.get("libraries") or []):
        for category_order, category in enumerate(library.get("categories") or []):
            category_id = f"{envelope_id}:{library.get('id', library_order)}:{category.get('id', category_order)}"
            cur.execute("INSERT INTO asset_categories(id,library_id,name,type,sort_order,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s)", (category_id, envelope_id, category.get("name", ""), category.get("type", "image"), category_order, timestamp, timestamp))
            for item_order, item in enumerate(category.get("items") or []):
                file_id = str(item.get("file_id") or "").strip()
                if not file_id:
                    continue
                item_id = f"{category_id}:{item.get('id', item_order)}"
                extra = {k: v for k, v in item.items() if k not in {"file_id", "name", "kind", "created_at"}}
                cur.execute("INSERT INTO asset_items(id,category_id,file_id,name,kind,created_at,updated_at,extra_json) SELECT %s,%s,%s,%s,%s,%s,%s,%s WHERE EXISTS (SELECT 1 FROM files WHERE id=%s AND deleted_at IS NULL AND status <> 'deleted' FOR KEY SHARE)", (item_id, category_id, file_id, item.get("name", ""), item.get("kind", "file"), int(item.get("created_at") or timestamp), timestamp, json.dumps(extra, ensure_ascii=False), file_id))


def find_asset_category(lib, category_id):
    for cat in lib.get("categories", []):
        if cat.get("id") == category_id:
            return cat
    return None


def find_asset_library(lib, library_id=""):
    lib = normalize_asset_library(lib)
    library_id = str(library_id or lib.get("active_library_id") or "").strip()
    return next((item for item in lib.get("libraries", []) if item.get("id") == library_id), None) or (lib.get("libraries") or [None])[0]


def find_asset_category_in_library(lib, category_id, library_id=""):
    library = find_asset_library(lib, library_id)
    if not library:
        return None
    for cat in library.get("categories", []):
        if cat.get("id") == category_id:
            return cat
    return None


def find_asset_category_with_library(lib, category_id, library_id=""):
    lib = normalize_asset_library(lib)
    preferred = str(library_id or "").strip()
    libraries = lib.get("libraries", []) or []
    if preferred:
        libraries = [item for item in libraries if item.get("id") == preferred]
    for library in libraries:
        for cat in library.get("categories", []) or []:
            if cat.get("id") == category_id:
                return library, cat
    return None, None


def find_asset_item_in_library(lib, item_id, library_id=""):
    for library in lib.get("libraries", []):
        if library_id and library.get("id") != library_id:
            continue
        for cat in library.get("categories", []):
            for item in cat.get("items", []):
                if item.get("id") == item_id:
                    return item
    return None
