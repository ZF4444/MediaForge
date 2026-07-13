"""全局广播公告的持久化。

管理员发送的公告仅保留「最新一条」，持久化到 PostgreSQL，
用于用户刷新页面/重新连接 WebSocket 后仍能看到尚未手动关闭的公告。

存储结构：
    {
        "id": "<uuid>",
        "content": "<公告文本>",
        "created_at": <毫秒时间戳>,
        "created_by": "<管理员用户名>"
    }
清空公告时文件内容为 {}。
"""
import uuid
from typing import Any, Dict, Optional

from app.config import ANNOUNCEMENT_LOCK
from app.core.utils import now_ms
from app.services.business_metadata import get_app_setting, set_app_setting


def _read_unlocked() -> Dict[str, Any]:
    data = get_app_setting("announcement", {})
    return data if isinstance(data, dict) else {}


def _write_unlocked(data: Dict[str, Any]) -> None:
    set_app_setting("announcement", data)


def get_latest_announcement() -> Optional[Dict[str, Any]]:
    """返回最新公告，若不存在或已被清空返回 None。"""
    with ANNOUNCEMENT_LOCK:
        data = _read_unlocked()
    return data if data.get("id") else None


def create_announcement(content: str, created_by: str) -> Dict[str, Any]:
    """保存新公告（覆盖此前的最新公告）并返回保存后的记录。"""
    item = {
        "id": uuid.uuid4().hex,
        "content": content,
        "created_at": now_ms(),
        "created_by": created_by or "",
    }
    with ANNOUNCEMENT_LOCK:
        _write_unlocked(item)
    return item


def clear_announcement() -> None:
    """清空当前公告，之后的新连接/刷新不再收到该公告。"""
    with ANNOUNCEMENT_LOCK:
        _write_unlocked({})
