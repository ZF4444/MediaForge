"""素材库（asset-library）的数据与规范化逻辑。

从 main.py 的「素材库」相关 helper 原样迁移，行为完全一致。
被 app/routers/assets.py 复用；avatar 注册/审核路由（跨域依赖 apimart/volcengine）
暂留在 main.py，通过 import-back 复用本模块的 load/save/find 等函数。

依赖：
- app.config：ASSET_LIBRARY_DIR
- app.core.auth：asset_library_path / user_data_dir（按用户隔离）
- app.core.utils：now_ms
- app.core.shared：sanitize_asset_name
- app.core.ws：manager（广播素材库更新）
- app.core.shared_state：get_global_loop（运行期事件循环）
"""
import asyncio
import json
import os
import shutil
import uuid
from typing import Any, Dict, Tuple

from app.config import ASSET_LIBRARY_DIR
from app.core.auth import asset_library_path, user_data_dir
from app.core.shared import sanitize_asset_name
from app.core.shared_state import get_global_loop
from app.core.utils import now_ms
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


def load_asset_library():
    lib_path = asset_library_path()
    if not os.path.exists(lib_path):
        lib = default_asset_library()
        save_asset_library(lib)
        return lib
    try:
        with open(lib_path, "r", encoding="utf-8") as f:
            lib = json.load(f)
    except Exception:
        lib = default_asset_library()
    return normalize_asset_library(lib)


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
    dest_path = os.path.join(ASSET_LIBRARY_DIR, dest_name)
    shutil.copy2(src, dest_path)
    item = {
        "id": f"asset_{uuid.uuid4().hex[:12]}",
        "name": os.path.splitext(safe_name)[0][:120],
        "url": f"/assets/library/{dest_name}",
        "kind": kind,
        "created_at": now_ms(),
    }
    return dest_name, item


def save_asset_library(lib):
    lib = normalize_asset_library(lib)
    sort_asset_library_items(lib)
    lib["updated_at"] = now_ms()
    os.makedirs(user_data_dir(), exist_ok=True)
    with open(asset_library_path(), "w", encoding="utf-8") as f:
        json.dump(lib, f, ensure_ascii=False, indent=2)
    loop = get_global_loop()
    if loop:
        asyncio.run_coroutine_threadsafe(manager.broadcast_asset_library_updated(int(lib["updated_at"])), loop)


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
