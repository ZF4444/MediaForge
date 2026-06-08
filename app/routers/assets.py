"""素材库路由（/api/asset-library，数据 CRUD 部分）。

从 main.py 的「素材库」区块原样迁移。URL/请求响应模型/状态码完全一致。
注意：avatar 注册/审核两个路由（/items/{id}/register-avatar、/items/{id}/avatar-status）
跨域依赖 apimart/volcengine 认证 helper，暂留在 main.py，待相关域抽离后再迁移。

依赖：
- app.services.assets：素材库数据与规范化逻辑
- app.core.media：output_file_from_url（本地媒体路径解析）
- app.core.shared：sanitize_asset_name
- app.config：ASSET_LIBRARY_DIR
- app.models：素材库相关请求模型
"""
import os
import tempfile
import uuid

from fastapi import APIRouter, HTTPException
from PIL import Image

from app.core.media import output_file_from_url
from app.core.shared import sanitize_asset_name
from app.models import (
    AssetLibraryAddRequest,
    AssetLibraryBatchAddRequest,
    AssetLibraryBatchCropRequest,
    AssetLibraryBatchDeleteRequest,
    AssetLibraryBatchMoveRequest,
    AssetLibraryCategoryRequest,
    AssetLibraryRenameRequest,
    AssetLibraryRequest,
)
from app.services.assets import (
    find_asset_category_in_library,
    find_asset_category_with_library,
    find_asset_library,
    load_asset_library,
    make_asset_library_item,
    save_asset_library,
)

router = APIRouter()


@router.get("/api/asset-library")
async def get_asset_library():
    return {"library": load_asset_library()}


@router.post("/api/asset-library/libraries")
async def create_asset_library(payload: AssetLibraryRequest):
    lib = load_asset_library()
    library = {"id": f"lib_{uuid.uuid4().hex[:12]}", "name": sanitize_asset_name(payload.name, "资产库"), "type": "asset", "categories": []}
    library["categories"].append({"id": f"cat_{uuid.uuid4().hex[:12]}", "name": "默认分组", "type": "image", "items": []})
    library["categories"].append({"id": f"wf_{uuid.uuid4().hex[:12]}", "name": "工作流", "type": "workflow", "items": []})
    lib.setdefault("libraries", []).append(library)
    lib["active_library_id"] = library["id"]
    save_asset_library(lib)
    return {"library": lib, "asset_library": library}


@router.patch("/api/asset-library/libraries/{library_id}")
async def rename_asset_library(library_id: str, payload: AssetLibraryRenameRequest):
    lib = load_asset_library()
    library = find_asset_library(lib, library_id)
    if not library or library.get("id") != library_id:
        raise HTTPException(status_code=404, detail="资产库不存在")
    library["name"] = sanitize_asset_name(payload.name, library.get("name") or "资产库")
    save_asset_library(lib)
    return {"library": lib, "asset_library": library}


@router.delete("/api/asset-library/libraries/{library_id}")
async def delete_asset_library(library_id: str):
    lib = load_asset_library()
    libraries = lib.get("libraries") or []
    if len(libraries) <= 1:
        raise HTTPException(status_code=400, detail="至少保留一个资产库")
    if not any(item.get("id") == library_id for item in libraries):
        raise HTTPException(status_code=404, detail="资产库不存在")
    lib["libraries"] = [item for item in libraries if item.get("id") != library_id]
    if lib.get("active_library_id") == library_id:
        lib["active_library_id"] = lib["libraries"][0].get("id")
    save_asset_library(lib)
    return {"library": lib}


@router.post("/api/asset-library/categories")
async def create_asset_library_category(payload: AssetLibraryCategoryRequest):
    lib = load_asset_library()
    library = find_asset_library(lib, payload.library_id)
    if not library:
        raise HTTPException(status_code=404, detail="资产库不存在")
    cat_type = "workflow" if str(payload.type or "").lower() == "workflow" else "image"
    category = {"id": f"cat_{uuid.uuid4().hex[:12]}", "name": sanitize_asset_name(payload.name, "新文件夹"), "type": cat_type, "items": []}
    library.setdefault("categories", []).append(category)
    lib["active_library_id"] = library.get("id") or lib.get("active_library_id")
    save_asset_library(lib)
    return {"library": lib, "category": category}


@router.patch("/api/asset-library/categories/{category_id}")
async def rename_asset_library_category(category_id: str, payload: AssetLibraryRenameRequest):
    lib = load_asset_library()
    _, cat = find_asset_category_with_library(lib, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    cat["name"] = sanitize_asset_name(payload.name, cat.get("name") or "新文件夹")
    save_asset_library(lib)
    return {"library": lib, "category": cat}


@router.delete("/api/asset-library/categories/{category_id}")
async def delete_asset_library_category(category_id: str):
    lib = load_asset_library()
    library, cat = find_asset_category_with_library(lib, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    if cat.get("type") == "workflow" and category_id == "workflows":
        raise HTTPException(status_code=400, detail="默认工作流分类不能删除")
    library["categories"] = [c for c in library.get("categories", []) if c.get("id") != category_id]
    save_asset_library(lib)
    return {"library": lib}


@router.post("/api/asset-library/items")
async def add_asset_library_item(payload: AssetLibraryAddRequest):
    lib = load_asset_library()
    cat = find_asset_category_in_library(lib, payload.category_id, payload.library_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    if cat.get("type") != "image":
        raise HTTPException(status_code=400, detail="该分类暂不支持添加媒体")
    src = output_file_from_url(payload.url)
    if not src:
        raise HTTPException(status_code=400, detail="只支持保存本地 /assets 或 /output 媒体")
    _, item = make_asset_library_item(src, payload.name or os.path.basename(src))
    cat.setdefault("items", []).append(item)
    save_asset_library(lib)
    return {"library": lib, "item": item}


@router.post("/api/asset-library/items/batch")
async def batch_add_asset_library_items(payload: AssetLibraryBatchAddRequest):
    added = []
    lib = load_asset_library()
    cat = find_asset_category_in_library(lib, payload.category_id, payload.library_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    for entry in (payload.items or [])[:200]:
        entry.category_id = payload.category_id
        entry.library_id = payload.library_id
        src = output_file_from_url(entry.url)
        if not src:
            continue
        _, item = make_asset_library_item(src, entry.name or os.path.basename(src))
        cat.setdefault("items", []).append(item)
        added.append(item)
    save_asset_library(lib)
    return {"library": lib, "items": added}


@router.patch("/api/asset-library/items/{item_id}")
async def rename_asset_library_item(item_id: str, payload: AssetLibraryRenameRequest):
    lib = load_asset_library()
    for library in lib.get("libraries", []):
        for cat in library.get("categories", []):
            for item in cat.get("items", []):
                if item.get("id") == item_id:
                    item["name"] = sanitize_asset_name(payload.name, item.get("name") or "asset")
                    save_asset_library(lib)
                    return {"library": lib, "item": item}
    raise HTTPException(status_code=404, detail="资产不存在")


@router.delete("/api/asset-library/items/{item_id}")
async def delete_asset_library_item(item_id: str):
    lib = load_asset_library()
    removed = None
    for library in lib.get("libraries", []):
        for cat in library.get("categories", []):
            keep = []
            for item in cat.get("items", []):
                if item.get("id") == item_id:
                    removed = item
                else:
                    keep.append(item)
            cat["items"] = keep
    if not removed:
        raise HTTPException(status_code=404, detail="资产不存在")
    save_asset_library(lib)
    return {"library": lib}


@router.post("/api/asset-library/items/delete")
async def batch_delete_asset_library_items(payload: AssetLibraryBatchDeleteRequest):
    ids = {str(item) for item in (payload.ids or []) if str(item)}
    if not ids:
        raise HTTPException(status_code=400, detail="没有选择资产")
    lib = load_asset_library()
    removed = 0
    for library in lib.get("libraries", []):
        if payload.library_id and library.get("id") != payload.library_id:
            continue
        for cat in library.get("categories", []):
            keep = []
            for item in cat.get("items", []):
                if item.get("id") in ids:
                    removed += 1
                else:
                    keep.append(item)
            cat["items"] = keep
    save_asset_library(lib)
    return {"library": lib, "removed": removed}


@router.post("/api/asset-library/items/move")
async def batch_move_asset_library_items(payload: AssetLibraryBatchMoveRequest):
    ids = {str(item) for item in (payload.ids or []) if str(item)}
    if not ids:
        raise HTTPException(status_code=400, detail="没有选择资产")
    lib = load_asset_library()
    target_cat = find_asset_category_in_library(lib, payload.target_category_id, payload.target_library_id)
    if not target_cat:
        raise HTTPException(status_code=404, detail="目标分组不存在")
    if target_cat.get("type") != "image":
        raise HTTPException(status_code=400, detail="目标分组不支持媒体")
    moved = []
    for library in lib.get("libraries", []):
        if payload.library_id and library.get("id") != payload.library_id:
            continue
        for cat in library.get("categories", []):
            keep = []
            for item in cat.get("items", []):
                if item.get("id") in ids:
                    moved.append(item)
                else:
                    keep.append(item)
            cat["items"] = keep
    existing_ids = {item.get("id") for item in target_cat.get("items", [])}
    for item in moved:
        if item.get("id") not in existing_ids:
            target_cat.setdefault("items", []).append(item)
            existing_ids.add(item.get("id"))
    save_asset_library(lib)
    return {"library": lib, "moved": len(moved)}


@router.post("/api/asset-library/items/crop")
async def batch_crop_asset_library_items(payload: AssetLibraryBatchCropRequest):
    ids = {str(item) for item in (payload.ids or []) if str(item)}
    if not ids:
        raise HTTPException(status_code=400, detail="没有选择资产")
    lib = load_asset_library()
    target_cat = None
    if payload.target_category_id:
        target_cat = find_asset_category_in_library(lib, payload.target_category_id, payload.target_library_id)
        if not target_cat:
            raise HTTPException(status_code=404, detail="目标分组不存在")
        if target_cat.get("type") != "image":
            raise HTTPException(status_code=400, detail="目标分组不支持媒体")
    added = []
    for library in lib.get("libraries", []):
        if payload.library_id and library.get("id") != payload.library_id:
            continue
        for cat in library.get("categories", []):
            if cat.get("type") != "image":
                continue
            source_items = [item for item in (cat.get("items", []) or []) if item.get("id") in ids]
            for item in source_items:
                src = output_file_from_url(item.get("url") or "")
                if not src or not os.path.isfile(src):
                    continue
                try:
                    with Image.open(src) as img:
                        img = img.convert("RGBA")
                        w, h = img.size
                        side = min(w, h)
                        if side <= 0:
                            continue
                        left = max(0, (w - side) // 2)
                        top = max(0, (h - side) // 2)
                        cropped = img.crop((left, top, left + side, top + side))
                        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
                        tmp_path = tmp.name
                        tmp.close()
                        try:
                            cropped.save(tmp_path, "PNG")
                            base_name = os.path.splitext(item.get("name") or "asset")[0] + "_crop.png"
                            _, next_item = make_asset_library_item(tmp_path, base_name)
                            (target_cat or cat).setdefault("items", []).append(next_item)
                            added.append(next_item)
                        finally:
                            try:
                                os.remove(tmp_path)
                            except Exception:
                                pass
                except Exception:
                    continue
    save_asset_library(lib)
    return {"library": lib, "added": len(added), "items": added}
