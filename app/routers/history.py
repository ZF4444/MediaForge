"""历史记录路由（/api/history）。

从 main.py 的「历史记录」区块原样迁移。URL/请求响应模型/状态码完全一致。
依赖：
- app.core.media：output_file_from_url
- app.services.history：save_to_history
- app.models：SaveHistoryRequest / DeleteHistoryRequest
"""
import os
import time

from fastapi import APIRouter

from app.core.media import output_file_from_url
from app.core.logging import audit_event, get_logger
from app.models import DeleteHistoryRequest, SaveHistoryRequest
from app.services.history import delete_history_files, load_history_records, normalize_history_record, save_to_history

router = APIRouter()
logger = get_logger("history")


@router.get("/api/history")
def get_history_api(type: str = None):
    try:
        data = load_history_records()
        if type:
            data = [item for item in data if item.get("type", "zimage") == type]
        data = [item for item in data if item.get("images") and len(item["images"]) > 0]

        def sort_key(item):
            ts = item.get("timestamp", 0)
            if isinstance(ts, (int, float)):
                return float(ts)
            return 0

        data.sort(key=sort_key, reverse=True)
        return data
    except Exception:
        logger.exception("failed to load history", extra={"event": "history_load_failed"})
        return []


@router.post("/api/history/save")
def save_history_api(req: SaveHistoryRequest):
    images = [u for u in (req.images or []) if u]
    if not images:
        return {"success": False, "message": "no images"}
    record = {
        "timestamp": time.time(),
        "prompt": req.prompt or "",
        "images": images,
        "type": req.type or "zimage",
        "is_cloud": bool(req.is_cloud),
    }
    save_to_history(record)
    return {"success": True, "record": normalize_history_record(record)}


@router.post("/api/history/delete")
def delete_history(req: DeleteHistoryRequest):
    try:
        from app.services.business_metadata import metadata_connection
        from app.core.auth import current_user_id
        uid = current_user_id()
        target_record = None
        with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
            cur.execute("SELECT id FROM history_records WHERE user_id=%s AND ABS(created_at - %s) < 2 LIMIT 1", (uid, int(float(req.timestamp) * 1000)))
            row = cur.fetchone()
            if row:
                target_record = next((item for item in load_history_records() if item.get("id") == row["id"]), None)
                cur.execute("DELETE FROM history_records WHERE id=%s", (row["id"],))

        if target_record:
            delete_history_files(target_record)
            for img_url in target_record.get("images", []):
                file_path = output_file_from_url(img_url)
                if file_path and os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception:
                        logger.exception("failed to delete history file", extra={"event": "history_file_delete_failed", "file_path": file_path})
            audit_event(
                "history_deleted",
                action="delete",
                resource_type="history_record",
                resource_id=target_record.get("id") or req.timestamp,
                before={"type": target_record.get("type"), "image_count": len(target_record.get("images") or [])},
            )
            return {"success": True}
        else:
            return {"success": False, "message": "Record not found"}
    except Exception as e:
        logger.exception("failed to delete history", extra={"event": "history_delete_failed"})
        audit_event("history_delete_failed", action="delete", resource_type="history_record", resource_id=req.timestamp, result="failure", error_type=type(e).__name__)
        return {"success": False, "message": str(e)}
