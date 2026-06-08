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


def save_to_history(record):
    with HISTORY_LOCK:
        hist_path = history_file()
        history = []
        if os.path.exists(hist_path):
            try:
                with open(hist_path, 'r', encoding='utf-8') as f:
                    history = json.load(f)
            except Exception:
                pass
        if "timestamp" not in record:
            record["timestamp"] = time.time()
        history.insert(0, record)
        with open(hist_path, 'w', encoding='utf-8') as f:
            json.dump(history[:5000], f, ensure_ascii=False, indent=4)


def get_comfy_history(comfy_address, prompt_id):
    try:
        with urllib.request.urlopen(f"http://{comfy_address}/history/{prompt_id}") as response:
            return json.loads(response.read())
    except Exception:
        return {}
