"""历史记录路由（/api/history）。

从 main.py 的「历史记录」区块原样迁移。URL/请求响应模型/状态码完全一致。
注意：/api/queue_status（生成队列状态）虽与历史路由相邻，但属于生成队列概念，
仍保留在 main.py。

依赖：
- app.config：HISTORY_LOCK
- app.core.auth：history_file
- app.core.media：output_file_from_url
- app.services.history：save_to_history
- app.models：SaveHistoryRequest / DeleteHistoryRequest
"""
import json
import os
import time

from fastapi import APIRouter

from app.config import HISTORY_LOCK
from app.core.auth import history_file
from app.core.media import output_file_from_url
from app.models import DeleteHistoryRequest, SaveHistoryRequest
from app.services.history import delete_history_files, load_history_records, normalize_history_record, save_to_history

router = APIRouter()


@router.get("/api/history")
async def get_history_api(type: str = None):
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
    except Exception as e:
        print(f"读取历史文件失败: {e}")
        return []


@router.post("/api/history/save")
async def save_history_api(req: SaveHistoryRequest):
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
async def delete_history(req: DeleteHistoryRequest):
    hist_path = history_file()
    if not os.path.exists(hist_path):
        return {"success": False, "message": "History file not found"}
    try:
        with HISTORY_LOCK:
            with open(hist_path, 'r', encoding='utf-8') as f:
                raw_history = json.load(f)
            history = [normalize_history_record(item) for item in raw_history if isinstance(item, dict)]
            target_record = None
            new_history = []
            for item in history:
                is_match = False
                item_ts = item.get("timestamp", 0)
                if isinstance(req.timestamp, (int, float)) and isinstance(item_ts, (int, float)):
                    if abs(float(item_ts) - float(req.timestamp)) < 0.001:
                        is_match = True
                elif str(item_ts) == str(req.timestamp):
                    is_match = True
                if is_match:
                    target_record = item
                else:
                    new_history.append(item)
            if target_record:
                with open(hist_path, 'w', encoding='utf-8') as f:
                    json.dump(new_history, f, ensure_ascii=False, indent=4)

        if target_record:
            delete_history_files(target_record)
            for img_url in target_record.get("images", []):
                file_path = output_file_from_url(img_url)
                if file_path and os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception as e:
                        print(f"Failed to delete file {file_path}: {e}")
            return {"success": True}
        else:
            return {"success": False, "message": "Record not found"}
    except Exception as e:
        print(f"Delete history error: {e}")
        return {"success": False, "message": str(e)}
