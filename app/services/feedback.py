import uuid
from typing import Any, Dict, List, Optional

from app.core.utils import now_ms
from app.services.business_metadata import metadata_connection


VALID_FEEDBACK_STATUSES = {"open", "reviewing", "resolved", "ignored"}
VALID_FEEDBACK_TYPES = {"issue", "idea", "question", "other"}


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
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO feedback_entries(id,user_id,username,type,content,page,user_agent,status,admin_note,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", tuple(item[key] for key in ("id","user_id","username","type","content","page","user_agent","status","admin_note","created_at","updated_at")))
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

    clauses, params = [], []
    for column, value in (("status", status_filter), ("type", type_filter), ("user_id", user_filter)):
        if value:
            clauses.append(f"{column}=%s"); params.append(value)
    if query:
        clauses.append("LOWER(content || ' ' || username || ' ' || user_id || ' ' || page || ' ' || admin_note) LIKE %s"); params.append(f"%{query}%")
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) AS count FROM feedback_entries{where}", tuple(params)); total = int(cur.fetchone()["count"])
        cur.execute(f"SELECT * FROM feedback_entries{where} ORDER BY created_at DESC LIMIT %s OFFSET %s", tuple(params + [limit, offset])); items = cur.fetchall()
    return {"items": items, "total": total}


def update_feedback(feedback_id: str, *, status: Optional[str], admin_note: Optional[str]) -> Optional[Dict[str, Any]]:
    updates, params = [], []
    if status is not None and (normalized := normalize_feedback_status(status)):
        updates.append("status=%s"); params.append(normalized)
    if admin_note is not None:
        updates.append("admin_note=%s"); params.append(str(admin_note or "").strip()[:1000])
    updates.append("updated_at=%s"); params.append(now_ms()); params.append(feedback_id)
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute(f"UPDATE feedback_entries SET {','.join(updates)} WHERE id=%s RETURNING *", tuple(params))
        return cur.fetchone()


def delete_feedback(feedback_id: str) -> bool:
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM feedback_entries WHERE id=%s RETURNING id", (feedback_id,))
        return bool(cur.fetchone())
