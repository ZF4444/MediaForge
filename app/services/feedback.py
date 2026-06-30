import json
import os
import uuid
from typing import Any, Dict, List, Optional

from app.config import DATA_DIR, FEEDBACK_FILE, FEEDBACK_LOCK
from app.core.utils import now_ms


VALID_FEEDBACK_STATUSES = {"open", "reviewing", "resolved", "ignored"}
VALID_FEEDBACK_TYPES = {"issue", "idea", "question", "other"}


def _read_items_unlocked() -> List[Dict[str, Any]]:
    if not os.path.exists(FEEDBACK_FILE):
        return []
    try:
        with open(FEEDBACK_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
    except Exception:
        return []
    return []


def _write_items_unlocked(items: List[Dict[str, Any]]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = FEEDBACK_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    os.replace(tmp, FEEDBACK_FILE)


def normalize_feedback_type(raw: str) -> str:
    value = (raw or "issue").strip().lower()
    return value if value in VALID_FEEDBACK_TYPES else "other"


def normalize_feedback_status(raw: str) -> Optional[str]:
    if raw is None:
        return None
    value = str(raw or "").strip().lower()
    return value if value in VALID_FEEDBACK_STATUSES else None


def create_feedback(payload: Dict[str, Any], user_id: str, username: str) -> Dict[str, Any]:
    now = now_ms()
    item = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "username": username or user_id,
        "type": normalize_feedback_type(payload.get("type") or "issue"),
        "content": str(payload.get("content") or "").strip(),
        "page": str(payload.get("page") or "").strip()[:80],
        "user_agent": str(payload.get("user_agent") or "").strip()[:500],
        "status": "open",
        "admin_note": "",
        "created_at": now,
        "updated_at": now,
    }
    with FEEDBACK_LOCK:
        items = _read_items_unlocked()
        items.insert(0, item)
        _write_items_unlocked(items)
    return item


def list_feedback(
    *,
    status: Optional[str] = None,
    feedback_type: Optional[str] = None,
    user_id: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    limit = max(1, min(int(limit or 50), 200))
    offset = max(0, int(offset or 0))
    status_filter = normalize_feedback_status(status) if status else None
    type_filter = normalize_feedback_type(feedback_type) if feedback_type else None
    user_filter = (user_id or "").strip()
    query = (q or "").strip().lower()

    with FEEDBACK_LOCK:
        items = _read_items_unlocked()

    def match(item: Dict[str, Any]) -> bool:
        if status_filter and item.get("status") != status_filter:
            return False
        if type_filter and item.get("type") != type_filter:
            return False
        if user_filter and item.get("user_id") != user_filter:
            return False
        if query:
            haystack = " ".join(
                str(item.get(k) or "")
                for k in ("content", "username", "user_id", "page", "admin_note")
            ).lower()
            if query not in haystack:
                return False
        return True

    filtered = [item for item in items if match(item)]
    return {"items": filtered[offset : offset + limit], "total": len(filtered)}


def update_feedback(feedback_id: str, *, status: Optional[str], admin_note: Optional[str]) -> Optional[Dict[str, Any]]:
    with FEEDBACK_LOCK:
        items = _read_items_unlocked()
        for item in items:
            if item.get("id") != feedback_id:
                continue
            if status is not None:
                normalized = normalize_feedback_status(status)
                if normalized:
                    item["status"] = normalized
            if admin_note is not None:
                item["admin_note"] = str(admin_note or "").strip()[:1000]
            item["updated_at"] = now_ms()
            _write_items_unlocked(items)
            return item
    return None


def delete_feedback(feedback_id: str) -> bool:
    with FEEDBACK_LOCK:
        items = _read_items_unlocked()
        next_items = [item for item in items if item.get("id") != feedback_id]
        if len(next_items) == len(items):
            return False
        _write_items_unlocked(next_items)
    return True
