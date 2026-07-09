"""画布管理路由（/api/canvases）。

从 main.py 的「画布管理」区块原样迁移。URL/请求响应模型/状态码完全一致。

依赖：
- app.config：CANVAS_LOCK / CANVAS_TRASH_RETENTION_MS
- app.core.auth：canvas_dir（按用户隔离）
- app.core.utils：now_ms
- app.core.ws：manager（广播画布更新）
- app.models：CanvasCreateRequest / CanvasMetaUpdate / CanvasSaveRequest
"""
import json
import os
import re
import uuid

from fastapi import APIRouter, HTTPException

from app.config import CANVAS_LOCK, CANVAS_TRASH_RETENTION_MS
from app.core.auth import canvas_dir
from app.core.utils import now_ms
from app.core.ws import manager
from app.models import CanvasCreateRequest, CanvasMetaUpdate, CanvasSaveRequest
from app.services.storage import compact_media_refs, normalize_media_refs

router = APIRouter()


def _map_canvas_value(value, media_mapper):
    if isinstance(value, list):
        if value and all(isinstance(item, dict) and (("url" in item) or ("file_id" in item)) for item in value):
            return media_mapper(value)
        return [_map_canvas_value(item, media_mapper) for item in value]
    if isinstance(value, dict):
        normalized = {}
        for key, item in value.items():
            if key == "images" and isinstance(item, list):
                normalized[key] = media_mapper(item)
            else:
                normalized[key] = _map_canvas_value(item, media_mapper)
        return normalized
    return value


def hydrate_canvas(canvas):
    if not isinstance(canvas, dict):
        return canvas
    return _map_canvas_value(dict(canvas), normalize_media_refs)


def compact_canvas(canvas):
    if not isinstance(canvas, dict):
        return canvas
    return _map_canvas_value(dict(canvas), compact_media_refs)


def read_canvas_json(canvas_id, *, hydrate=False):
    path = canvas_path(canvas_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="画布不存在")
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return hydrate_canvas(data) if hydrate else data
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def read_canvas_file(path, *, hydrate=False):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return hydrate_canvas(data) if hydrate else data
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def canvas_path(canvas_id):
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", canvas_id or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的画布 ID")
    return os.path.join(canvas_dir(), f"{cleaned}.json")


def save_canvas(canvas):
    canvas["updated_at"] = now_ms()
    persisted = compact_canvas(canvas)
    with CANVAS_LOCK:
        with open(canvas_path(canvas["id"]), 'w', encoding='utf-8') as f:
            json.dump(persisted, f, ensure_ascii=False, indent=2)


def save_canvas_raw(canvas, *, update_timestamp=True):
    if update_timestamp:
        canvas["updated_at"] = now_ms()
    with CANVAS_LOCK:
        with open(canvas_path(canvas["id"]), 'w', encoding='utf-8') as f:
            json.dump(canvas, f, ensure_ascii=False, indent=2)


def normalize_canvas_kind(kind="classic"):
    return "smart" if str(kind or "").strip().lower() == "smart" else "classic"


def new_canvas(title="未命名画布", icon="layers", kind="classic"):
    timestamp = now_ms()
    canvas_kind = normalize_canvas_kind(kind)
    canvas = {
        "id": uuid.uuid4().hex,
        "title": (title or ("智能画布" if canvas_kind == "smart" else "未命名画布"))[:80],
        "icon": (icon or ("sparkles" if canvas_kind == "smart" else "🧩"))[:32],
        "kind": canvas_kind,
        "owner": "",
        "color": "",
        "pinned": False,
        "created_at": timestamp,
        "updated_at": timestamp,
        "nodes": [],
        "connections": [],
        "viewport": {"x": 0, "y": 0, "scale": 1},
    }
    save_canvas(canvas)
    return canvas


def load_canvas(canvas_id):
    canvas = read_canvas_json(canvas_id, hydrate=True)
    if canvas.get("deleted_at"):
        raise HTTPException(status_code=404, detail="画布已在回收站")
    return canvas


def load_canvas_any(canvas_id):
    return read_canvas_json(canvas_id, hydrate=True)


def load_canvas_raw(canvas_id):
    canvas = read_canvas_json(canvas_id, hydrate=False)
    if canvas.get("deleted_at"):
        raise HTTPException(status_code=404, detail="画布已在回收站")
    return canvas


def load_canvas_any_raw(canvas_id):
    return read_canvas_json(canvas_id, hydrate=False)


CANVAS_COLORS = {"", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink", "slate"}


def normalize_canvas_color(value):
    color = str(value or "").strip().lower()
    return color if color in CANVAS_COLORS else ""


def canvas_record(data):
    return {
        "id": data.get("id"),
        "title": data.get("title", "未命名画布"),
        "icon": data.get("icon", "🧩"),
        "kind": normalize_canvas_kind(data.get("kind")),
        "owner": str(data.get("owner") or "")[:40],
        "color": normalize_canvas_color(data.get("color")),
        "pinned": bool(data.get("pinned") or False),
        "created_at": data.get("created_at", 0),
        "updated_at": data.get("updated_at", 0),
        "deleted_at": data.get("deleted_at", 0),
        "node_count": len(data.get("nodes", [])),
    }


def cleanup_expired_canvas_trash():
    cutoff = now_ms() - CANVAS_TRASH_RETENTION_MS
    cdir = canvas_dir()
    with CANVAS_LOCK:
        for filename in os.listdir(cdir):
            if not filename.endswith(".json"):
                continue
            path = os.path.join(cdir, filename)
            try:
                data = read_canvas_file(path, hydrate=False)
                deleted_at = int(data.get("deleted_at") or 0)
                if deleted_at and deleted_at < cutoff:
                    os.remove(path)
            except Exception:
                continue


def iter_canvas_records(include_deleted=False):
    cleanup_expired_canvas_trash()
    cdir = canvas_dir()
    records = []
    for filename in os.listdir(cdir):
        if not filename.endswith(".json"):
            continue
        try:
            data = read_canvas_file(os.path.join(cdir, filename), hydrate=False)
        except Exception:
            continue
        is_deleted = bool(data.get("deleted_at"))
        if include_deleted != is_deleted:
            continue
        records.append(canvas_record(data))
    return records


def list_canvases():
    records = iter_canvas_records(include_deleted=False)
    return sorted(
        records,
        key=lambda item: (
            0 if item.get("pinned") else 1,
            -int(item.get("updated_at") or item.get("created_at") or 0),
        ),
    )


def list_deleted_canvases():
    records = iter_canvas_records(include_deleted=True)
    return sorted(records, key=lambda item: item["deleted_at"], reverse=True)


@router.get("/api/canvases")
async def canvases():
    return {"canvases": list_canvases()}


@router.get("/api/canvases/trash")
async def trashed_canvases():
    return {"canvases": list_deleted_canvases(), "retention_days": 30}


@router.post("/api/canvases")
async def create_canvas(payload: CanvasCreateRequest):
    return {"canvas": new_canvas(payload.title, payload.icon, payload.kind)}


@router.get("/api/canvases/{canvas_id}/meta")
async def get_canvas_meta(canvas_id: str):
    canvas = load_canvas_raw(canvas_id)
    return {
        "id": canvas.get("id"),
        "updated_at": canvas.get("updated_at", 0),
        "title": canvas.get("title", "未命名画布"),
        "icon": canvas.get("icon", "layers"),
        "kind": normalize_canvas_kind(canvas.get("kind")),
    }


@router.post("/api/canvases/{canvas_id}/meta")
async def update_canvas_meta(canvas_id: str, payload: CanvasMetaUpdate):
    """更新画布的轻量元数据（标题/图标/负责人/颜色/置顶）。
    刻意不走 save_canvas（它会刷新 updated_at），以免打标签/置顶把画布顶到列表最前。"""
    canvas = load_canvas_raw(canvas_id)
    if payload.title is not None:
        canvas["title"] = (payload.title or canvas.get("title") or "未命名画布")[:80]
    if payload.icon is not None:
        canvas["icon"] = (payload.icon or "layers")[:32]
    if payload.owner is not None:
        canvas["owner"] = str(payload.owner).strip()[:40]
    if payload.color is not None:
        canvas["color"] = normalize_canvas_color(payload.color)
    if payload.pinned is not None:
        canvas["pinned"] = bool(payload.pinned)
    save_canvas_raw(canvas, update_timestamp=False)
    return {"canvas": canvas_record(canvas)}


@router.get("/api/canvases/{canvas_id}")
async def get_canvas(canvas_id: str):
    return {"canvas": load_canvas(canvas_id)}


@router.post("/api/canvases/{canvas_id}/touch")
async def touch_canvas(canvas_id: str):
    canvas = load_canvas_raw(canvas_id)
    save_canvas_raw(canvas, update_timestamp=True)
    return {"canvas": canvas_record(canvas), "updated_at": canvas.get("updated_at", 0)}


@router.put("/api/canvases/{canvas_id}")
async def update_canvas(canvas_id: str, payload: CanvasSaveRequest):
    canvas = load_canvas_raw(canvas_id)
    current_updated_at = int(canvas.get("updated_at") or 0)
    last_client_id = str(canvas.get("last_client_id") or "")
    incoming_client_id = str(payload.client_id or "")
    same_client_retry = bool(incoming_client_id and incoming_client_id == last_client_id)
    if payload.base_updated_at and current_updated_at and int(payload.base_updated_at) < current_updated_at and not same_client_retry:
        hydrated = hydrate_canvas(canvas)
        raise HTTPException(status_code=409, detail={
            "message": "画布已被其他页面更新，已拒绝旧版本覆盖。",
            "canvas": hydrated,
            "updated_at": current_updated_at,
        })
    canvas["title"] = (payload.title or canvas.get("title") or "未命名画布")[:80]
    canvas["icon"] = (payload.icon or canvas.get("icon") or "layers")[:32]
    canvas["kind"] = normalize_canvas_kind(canvas.get("kind"))
    canvas["nodes"] = payload.nodes
    canvas["connections"] = payload.connections
    if canvas["kind"] == "smart":
        canvas["viewport"] = payload.viewport
    else:
        canvas["viewport"] = canvas.get("viewport") or {"x": 0, "y": 0, "scale": 1}
    canvas["logs"] = payload.logs[-500:]
    canvas["settings"] = payload.settings or {}
    if incoming_client_id:
        canvas["last_client_id"] = incoming_client_id
    save_canvas(canvas)
    await manager.broadcast_canvas_updated(canvas_id, int(canvas.get("updated_at") or now_ms()), payload.client_id)
    return {"canvas": {"id": canvas_id, "updated_at": canvas.get("updated_at", 0)}}


@router.delete("/api/canvases/{canvas_id}")
async def delete_canvas(canvas_id: str):
    canvas = load_canvas_any_raw(canvas_id)
    if not canvas.get("deleted_at"):
        canvas["deleted_at"] = now_ms()
        save_canvas_raw(canvas, update_timestamp=True)
    return {"ok": True}


@router.post("/api/canvases/{canvas_id}/restore")
async def restore_canvas(canvas_id: str):
    canvas = load_canvas_any_raw(canvas_id)
    if canvas.get("deleted_at"):
        canvas.pop("deleted_at", None)
        save_canvas_raw(canvas, update_timestamp=True)
    return {"canvas": canvas}


@router.delete("/api/canvases/{canvas_id}/purge")
async def purge_canvas(canvas_id: str):
    path = canvas_path(canvas_id)
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}
