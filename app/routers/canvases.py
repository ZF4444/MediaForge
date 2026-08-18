"""画布管理路由（/api/canvases）。

从 main.py 的「画布管理」区块原样迁移。URL/请求响应模型/状态码完全一致。

依赖：
- app.core.auth：current_user_id（按用户隔离）
- app.core.utils：now_ms
- app.core.ws：manager（广播画布更新）
- app.models：CanvasCreateRequest / CanvasMetaUpdate / CanvasSaveRequest
"""
import asyncio
import uuid

from fastapi import APIRouter, HTTPException

from app.core.auth import current_user_id
from app.core.utils import now_ms
from app.core.ws import manager
from app.models import CanvasCreateRequest, CanvasMetaUpdate, CanvasSaveRequest
from app.services.storage import compact_media_refs, normalize_media_refs
from app.services.business_metadata import (
    delete_canvas_payload,
    load_canvas_payload,
    save_canvas_payload,
    touch_canvas_payload,
    update_canvas_metadata,
)

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
    return _map_canvas_value(
        dict(canvas),
        lambda refs: normalize_media_refs(refs, preserve_missing=True),
    )


def compact_canvas(canvas):
    if not isinstance(canvas, dict):
        return canvas
    return _map_canvas_value(
        dict(canvas),
        lambda refs: compact_media_refs(refs, preserve_missing=True),
    )


def read_canvas_json(canvas_id, *, hydrate=False):
    data = load_canvas_payload(current_user_id(), canvas_id)
    if data is None:
        raise HTTPException(status_code=404, detail="画布不存在")
    return hydrate_canvas(data) if hydrate else data


def save_canvas(canvas):
    canvas["updated_at"] = now_ms()
    persisted = compact_canvas(canvas)
    save_canvas_payload(current_user_id(), persisted)


def save_canvas_raw(canvas, *, update_timestamp=True):
    if update_timestamp:
        canvas["updated_at"] = now_ms()
    save_canvas_payload(current_user_id(), canvas)


def new_canvas(title="未命名画布", icon="sparkles"):
    timestamp = now_ms()
    canvas = {
        "id": uuid.uuid4().hex,
        "title": (title or "未命名画布")[:80],
        "icon": (icon or "sparkles")[:32],
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
        raise HTTPException(status_code=404, detail="画布不存在")
    return canvas


def load_canvas_raw(canvas_id):
    canvas = read_canvas_json(canvas_id, hydrate=False)
    if canvas.get("deleted_at"):
        raise HTTPException(status_code=404, detail="画布不存在")
    return canvas


CANVAS_COLORS = {"", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink", "slate"}


def normalize_canvas_color(value):
    color = str(value or "").strip().lower()
    return color if color in CANVAS_COLORS else ""


def canvas_record(data):
    return {
        "id": data.get("id"),
        "title": data.get("title", "未命名画布"),
        "icon": data.get("icon", "🧩"),
        "owner": str(data.get("owner") or "")[:40],
        "color": normalize_canvas_color(data.get("color")),
        "pinned": bool(data.get("pinned") or False),
        "created_at": data.get("created_at", 0),
        "updated_at": data.get("updated_at", 0),
        "version": data.get("version", 1),
        "node_count": data["node_count"] if "node_count" in data else len(data.get("nodes", [])),
    }


def iter_canvas_records():
    from app.services.business_metadata import list_canvas_records
    rows = list_canvas_records(current_user_id())
    return [canvas_record(row) for row in rows]


def list_canvases():
    records = iter_canvas_records()
    return sorted(
        records,
        key=lambda item: (
            0 if item.get("pinned") else 1,
            -int(item.get("updated_at") or item.get("created_at") or 0),
        ),
    )

@router.get("/api/canvases")
def canvases():
    return {"canvases": list_canvases()}


@router.post("/api/canvases")
def create_canvas(payload: CanvasCreateRequest):
    return {"canvas": new_canvas(payload.title, payload.icon)}


@router.get("/api/canvases/{canvas_id}/meta")
def get_canvas_meta(canvas_id: str):
    canvas = load_canvas_raw(canvas_id)
    return {
        "id": canvas.get("id"),
        "updated_at": canvas.get("updated_at", 0),
        "title": canvas.get("title", "未命名画布"),
        "icon": canvas.get("icon", "layers"),
        "version": canvas.get("version", 1),
    }


@router.post("/api/canvases/{canvas_id}/meta")
def update_canvas_meta(canvas_id: str, payload: CanvasMetaUpdate):
    """更新画布的轻量元数据（标题/图标/负责人/颜色/置顶）。
    刻意不走 save_canvas（它会刷新 updated_at），以免打标签/置顶把画布顶到列表最前。"""
    canvas = update_canvas_metadata(
        current_user_id(), canvas_id,
        title=(payload.title[:80] if payload.title else None),
        icon=((payload.icon or "layers")[:32] if payload.icon is not None else None),
        owner=(str(payload.owner).strip()[:40] if payload.owner is not None else None),
        color=(normalize_canvas_color(payload.color) if payload.color is not None else None),
        pinned=(bool(payload.pinned) if payload.pinned is not None else None),
    )
    if canvas is None:
        raise HTTPException(status_code=404, detail="画布不存在")
    return {"canvas": canvas_record(canvas)}


@router.get("/api/canvases/{canvas_id}")
def get_canvas(canvas_id: str):
    return {"canvas": load_canvas(canvas_id)}


@router.post("/api/canvases/{canvas_id}/touch")
def touch_canvas(canvas_id: str):
    canvas = touch_canvas_payload(current_user_id(), canvas_id, now_ms())
    if canvas is None:
        raise HTTPException(status_code=404, detail="画布不存在")
    return {"canvas": canvas_record(canvas), "updated_at": canvas.get("updated_at", 0)}


@router.put("/api/canvases/{canvas_id}")
async def update_canvas(canvas_id: str, payload: CanvasSaveRequest):
    canvas = await asyncio.to_thread(load_canvas_raw, canvas_id)
    current_updated_at = int(canvas.get("updated_at") or 0)
    last_client_id = str(canvas.get("last_client_id") or "")
    incoming_client_id = str(payload.client_id or "")
    same_client_retry = bool(incoming_client_id and incoming_client_id == last_client_id)
    if payload.base_updated_at and current_updated_at and int(payload.base_updated_at) < current_updated_at and not same_client_retry:
        hydrated = await asyncio.to_thread(hydrate_canvas, canvas)
        raise HTTPException(status_code=409, detail={
            "message": "画布已被其他页面更新，已拒绝旧版本覆盖。",
            "canvas": hydrated,
            "updated_at": current_updated_at,
        })
    canvas["title"] = (payload.title or canvas.get("title") or "未命名画布")[:80]
    canvas["icon"] = (payload.icon or canvas.get("icon") or "layers")[:32]
    canvas.pop("kind", None)
    canvas["nodes"] = payload.nodes
    canvas["connections"] = payload.connections
    canvas["viewport"] = payload.viewport
    canvas["logs"] = payload.logs[-500:]
    canvas["settings"] = payload.settings or {}
    if incoming_client_id:
        canvas["last_client_id"] = incoming_client_id
    await asyncio.to_thread(save_canvas, canvas)
    await manager.broadcast_canvas_updated(
        canvas_id, int(canvas.get("updated_at") or now_ms()), payload.client_id, current_user_id(),
    )
    saved = await asyncio.to_thread(load_canvas_raw, canvas_id)
    return {"canvas": {"id": canvas_id, "updated_at": canvas.get("updated_at", 0), "version": saved.get("version", 1)}}


@router.delete("/api/canvases/{canvas_id}")
def delete_canvas(canvas_id: str):
    load_canvas_raw(canvas_id)
    delete_canvas_payload(current_user_id(), canvas_id)
    return {"ok": True}
