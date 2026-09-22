"""提示词库路由（/api/prompt-libraries）。

从 main.py 的「提示词库」区块原样迁移。URL/请求响应模型/状态码完全一致。

依赖：
- app.services.prompts：数据与规范化逻辑
- app.core.shared：sanitize_asset_name
- app.core.utils：now_ms
- app.models：提示词相关请求模型
"""
import uuid

from fastapi import APIRouter, HTTPException

from app.core.access_control import is_admin
from app.core.auth import current_user_id
from app.core.shared import sanitize_asset_name
from app.core.utils import now_ms
from app.models import (
    PromptLibraryBatchDeleteRequest,
    PromptLibraryCategoryRequest,
    PromptLibraryItemRequest,
    PromptLibraryRequest,
)
from app.services.prompts import (
    find_prompt_library,
    load_prompt_libraries,
    normalize_prompt_library_item,
    public_prompt_libraries,
    save_prompt_libraries,
)

router = APIRouter()

PROMPT_BUILTIN_CATEGORY_IDS = {"builtin", "custom"}
PROMPT_RESERVED_LIBRARY_IDS = {"system", "caption", "expand"}


def _current_user_is_admin() -> bool:
    """系统管理员可以调整内置提示词库（改名分类、编辑/删除内置条目）。"""
    return is_admin(current_user_id())


def _save_prompt_libraries_for(data, library_ids="") -> dict:
    """按当前用户身份与操作涉及的库决定是否把改动同步为全局共享内容。

    系统管理员编辑保留库（system/caption/expand）时，改动落到全局
    system_prompt_libraries 表，对所有用户立即可见；其余情况维持原有的
    账户级保存语义（普通用户在保留库下新增的条目只挂在自己账户名下）。
    library_ids 可以是单个 library_id 字符串，也可以是涉及多个库的集合/列表
    （如跨库批量删除）；只要其中任意一个是保留库且当前用户是管理员即可触发。
    """
    ids = {library_ids} if isinstance(library_ids, str) else set(library_ids or ())
    sync_global = bool(ids & PROMPT_RESERVED_LIBRARY_IDS) and _current_user_is_admin()
    return save_prompt_libraries(data, sync_global_reserved=sync_global)


@router.get("/api/prompt-libraries")
def get_prompt_libraries():
    return {"library": public_prompt_libraries()}


@router.post("/api/prompt-libraries")
def create_prompt_library(payload: PromptLibraryRequest):
    data = load_prompt_libraries()
    library = {
        "id": f"lib_{uuid.uuid4().hex[:12]}",
        "name": sanitize_asset_name(payload.name, "提示词库"),
        "type": "prompt",
        "categories": [],
        "items": [],
    }
    data.setdefault("libraries", []).append(library)
    data["active_library_id"] = library["id"]
    data = save_prompt_libraries(data)
    new_lib = next((lib for lib in data.get("libraries", []) if lib.get("id") == library["id"]), library)
    return {"library": public_prompt_libraries(data), "prompt_library": new_lib}


@router.patch("/api/prompt-libraries/{library_id}")
def rename_prompt_library(library_id: str, payload: PromptLibraryRequest):
    if library_id in PROMPT_RESERVED_LIBRARY_IDS and not _current_user_is_admin():
        raise HTTPException(status_code=400, detail="内置提示词库不能改名")
    data = load_prompt_libraries()
    library = find_prompt_library(data, library_id)
    if not library or library.get("id") != library_id:
        raise HTTPException(status_code=404, detail="提示词库不存在")
    library["name"] = sanitize_asset_name(payload.name, library.get("name") or "提示词库")
    data = _save_prompt_libraries_for(data, library_id)
    return {"library": public_prompt_libraries(data), "prompt_library": library}


@router.delete("/api/prompt-libraries/{library_id}")
def delete_prompt_library(library_id: str):
    if library_id in PROMPT_RESERVED_LIBRARY_IDS:
        raise HTTPException(status_code=400, detail="内置提示词库不能删除，可以删除其中的提示词")
    data = load_prompt_libraries()
    libraries = data.get("libraries", []) or []
    kept = [lib for lib in libraries if lib.get("id") != library_id]
    if len(kept) == len(libraries):
        raise HTTPException(status_code=404, detail="提示词库不存在")
    data["libraries"] = kept
    if data.get("active_library_id") == library_id:
        data["active_library_id"] = "system"
    data = save_prompt_libraries(data)
    return {"library": public_prompt_libraries(data)}


@router.post("/api/prompt-libraries/items")
def add_prompt_library_item(payload: PromptLibraryItemRequest):
    data = load_prompt_libraries()
    library = find_prompt_library(data, payload.library_id)
    if not library:
        raise HTTPException(status_code=404, detail="提示词库不存在")
    if not str(payload.prompt or "").strip():
        raise HTTPException(status_code=400, detail="提示词内容不能为空")
    # "内置"(builtin) 分类代表全局共享内容：非管理员新增的条目即使显式
    # 传了 category="builtin"，也要纠正为 "custom"，否则账户私有条目会
    # 被误归类展示在"内置"分组下，造成语义混乱（该条目本身仍不会被标记
    # builtin=True，只有系统种子数据才是真正的内置内容，但分类归属应
    # 保持准确）。
    category = payload.category
    if str(category or "").strip() == "builtin" and not _current_user_is_admin():
        category = "custom"
    item = normalize_prompt_library_item({
        "id": f"tpl_{uuid.uuid4().hex[:12]}",
        "name": payload.name,
        "category": category,
        "prompt": payload.prompt,
        "scene": payload.scene,
        "created_at": now_ms(),
        "updated_at": now_ms(),
    })
    library.setdefault("items", []).insert(0, item)
    data["active_library_id"] = library.get("id") or data.get("active_library_id")
    data = _save_prompt_libraries_for(data, library.get("id"))
    return {"library": public_prompt_libraries(data), "item": item}


@router.patch("/api/prompt-libraries/items/{item_id}")
def update_prompt_library_item(item_id: str, payload: PromptLibraryItemRequest):
    data = load_prompt_libraries()
    for library in data.get("libraries", []) or []:
        if payload.library_id and library.get("id") != payload.library_id:
            continue
        for index, item in enumerate(library.get("items", []) or []):
            if item.get("id") == item_id:
                if item.get("builtin") and not _current_user_is_admin():
                    raise HTTPException(status_code=403, detail="内置提示词不能编辑")
                category = payload.category or item.get("category")
                if str(category or "").strip() == "builtin" and not _current_user_is_admin():
                    category = "custom"
                next_item = normalize_prompt_library_item({
                    **item,
                    "name": payload.name or item.get("name"),
                    "category": category,
                    "prompt": payload.prompt or item.get("prompt"),
                    "scene": payload.scene,
                    "updated_at": now_ms(),
                })
                library["items"][index] = next_item
                data = _save_prompt_libraries_for(data, library.get("id"))
                return {"library": public_prompt_libraries(data), "item": next_item}
    raise HTTPException(status_code=404, detail="提示词不存在")


@router.delete("/api/prompt-libraries/items/{item_id}")
def delete_prompt_library_item(item_id: str):
    data = load_prompt_libraries()
    removed = None
    removed_library_id = ""
    for library in data.get("libraries", []) or []:
        keep = []
        for item in library.get("items", []) or []:
            if item.get("id") == item_id:
                if item.get("builtin") and not _current_user_is_admin():
                    raise HTTPException(status_code=403, detail="内置提示词不能删除")
                removed = item
                removed_library_id = str(library.get("id") or "")
            else:
                keep.append(item)
        library["items"] = keep
    if not removed:
        raise HTTPException(status_code=404, detail="提示词不存在")
    data = _save_prompt_libraries_for(data, removed_library_id)
    return {"library": public_prompt_libraries(data), "removed": 1}


@router.post("/api/prompt-libraries/items/delete")
def batch_delete_prompt_library_items(payload: PromptLibraryBatchDeleteRequest):
    ids = {str(item) for item in (payload.ids or []) if str(item)}
    if not ids:
        raise HTTPException(status_code=400, detail="没有选择提示词")
    data = load_prompt_libraries()
    is_admin_user = _current_user_is_admin()
    removed = 0
    skipped_builtin = 0
    affected_library_ids = set()
    for library in data.get("libraries", []) or []:
        keep = []
        for item in library.get("items", []) or []:
            if item.get("id") in ids:
                if item.get("builtin") and not is_admin_user:
                    skipped_builtin += 1
                    keep.append(item)
                    continue
                removed += 1
                affected_library_ids.add(str(library.get("id") or ""))
            else:
                keep.append(item)
        library["items"] = keep
    data = _save_prompt_libraries_for(data, affected_library_ids)
    return {"library": public_prompt_libraries(data), "removed": removed, "skipped_builtin": skipped_builtin}


@router.post("/api/prompt-libraries/categories")
def add_prompt_library_category(payload: PromptLibraryCategoryRequest):
    data = load_prompt_libraries()
    library = find_prompt_library(data, payload.library_id) or find_prompt_library(data, "system")
    if not library:
        raise HTTPException(status_code=404, detail="提示词库不存在")
    name = sanitize_asset_name(payload.name, "新分组")
    existing = {str(c.get("id")) for c in (library.get("categories") or []) if isinstance(c, dict)} | PROMPT_BUILTIN_CATEGORY_IDS
    cat_id = f"pcat_{uuid.uuid4().hex[:10]}"
    while cat_id in existing:
        cat_id = f"pcat_{uuid.uuid4().hex[:10]}"
    category = {"id": cat_id, "name": name}
    library.setdefault("categories", []).append(category)
    data = _save_prompt_libraries_for(data, library.get("id"))
    return {"library": public_prompt_libraries(data), "category": category}


@router.patch("/api/prompt-libraries/categories/{category_id}")
def rename_prompt_library_category(category_id: str, payload: PromptLibraryCategoryRequest):
    if category_id in PROMPT_BUILTIN_CATEGORY_IDS and not _current_user_is_admin():
        raise HTTPException(status_code=400, detail="内置分组不能重命名")
    name = sanitize_asset_name(payload.name, "")
    if not name:
        raise HTTPException(status_code=400, detail="分组名称不能为空")
    data = load_prompt_libraries()
    updated = False
    affected_library_ids = set()
    for library in data.get("libraries", []) or []:
        for cat in library.get("categories") or []:
            if isinstance(cat, dict) and cat.get("id") == category_id:
                cat["name"] = name
                updated = True
                affected_library_ids.add(str(library.get("id") or ""))
    if not updated:
        raise HTTPException(status_code=404, detail="分组不存在")
    data = _save_prompt_libraries_for(data, affected_library_ids)
    return {"library": public_prompt_libraries(data)}


@router.delete("/api/prompt-libraries/categories/{category_id}")
def delete_prompt_library_category(category_id: str):
    if category_id in PROMPT_BUILTIN_CATEGORY_IDS:
        raise HTTPException(status_code=400, detail="内置分组不能删除")
    data = load_prompt_libraries()
    found = False
    for library in data.get("libraries", []) or []:
        cats = library.get("categories") or []
        kept = [c for c in cats if not (isinstance(c, dict) and c.get("id") == category_id)]
        if len(kept) != len(cats):
            found = True
            library["categories"] = kept
        for item in library.get("items", []) or []:
            if isinstance(item, dict) and item.get("category") == category_id:
                item["category"] = "custom"
    if not found:
        raise HTTPException(status_code=404, detail="分组不存在")
    data = save_prompt_libraries(data)
    return {"library": public_prompt_libraries(data)}
