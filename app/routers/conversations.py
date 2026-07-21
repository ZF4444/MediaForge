"""对话管理路由（/api/conversations）。

从 main.py 的「对话管理」区块原样迁移。URL 路径、请求/响应模型、状态码
与原 main.py 完全一致（纯结构重构，行为零变更）。

依赖：
- app.core.auth：safe_user_id / current_user 隔离
- app.core.utils：now_ms
- app.config：CONVERSATION_LOCK
- app.models：ConversationCreateRequest
"""
import uuid

from fastapi import APIRouter, Header, HTTPException, Request

from app.core.auth import safe_user_id
from app.core.utils import now_ms
from app.models import ConversationCreateRequest
from app.services.storage import compact_media_refs, normalize_media_refs
from app.services.business_metadata import metadata_connection, new_id, json_value

router = APIRouter()


def hydrate_conversation(conversation):
    if not isinstance(conversation, dict):
        return conversation
    normalized = dict(conversation)
    messages = []
    for message in normalized.get("messages", []) if isinstance(normalized.get("messages"), list) else []:
        if not isinstance(message, dict):
            continue
        msg = dict(message)
        attachments = msg.get("attachments")
        if isinstance(attachments, list):
            msg["attachments"] = normalize_media_refs(attachments)
        messages.append(msg)
    normalized["messages"] = messages
    return normalized


def compact_conversation(conversation):
    if not isinstance(conversation, dict):
        return conversation
    compacted = dict(conversation)
    messages = []
    for message in compacted.get("messages", []) if isinstance(compacted.get("messages"), list) else []:
        if not isinstance(message, dict):
            continue
        msg = dict(message)
        attachments = msg.get("attachments")
        if isinstance(attachments, list):
            msg["attachments"] = compact_media_refs(attachments)
        messages.append(msg)
    compacted["messages"] = messages
    return compacted


def conversation_path(user_id, conversation_id):
    if not str(conversation_id or "").strip():
        raise HTTPException(status_code=400, detail="无效的对话 ID")
    return str(conversation_id)


def save_conversation(user_id, conversation):
    conversation = hydrate_conversation(conversation)
    persisted = compact_conversation(conversation)
    with metadata_connection() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("INSERT INTO conversations(id,user_id,title,created_at,updated_at,extra_json) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,updated_at=EXCLUDED.updated_at,extra_json=EXCLUDED.extra_json", (conversation["id"], user_id, persisted.get("title", ""), persisted.get("created_at", now_ms()), persisted.get("updated_at", now_ms()), json_value({k:v for k,v in persisted.items() if k not in {"id","title","created_at","updated_at","messages"}})))
                cur.execute("DELETE FROM conversation_messages WHERE conversation_id=%s", (conversation["id"],))
                for order, msg in enumerate(persisted.get("messages", [])):
                    mid = msg.get("id") or new_id()
                    cur.execute("INSERT INTO conversation_messages(id,conversation_id,role,content,sort_order,created_at,updated_at,extra_json) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)", (mid, conversation["id"], msg.get("role", "user"), msg.get("content", ""), order, msg.get("created_at", now_ms()), msg.get("updated_at", now_ms()), json_value({k:v for k,v in msg.items() if k not in {"id","role","content","created_at","updated_at","attachments"}})))
                    for aorder, attachment in enumerate(msg.get("attachments") or []):
                        if isinstance(attachment, dict) and attachment.get("file_id"):
                            cur.execute("INSERT INTO conversation_message_files(id,message_id,file_id,sort_order,kind,role) SELECT %s,%s,%s,%s,%s,%s WHERE EXISTS (SELECT 1 FROM files WHERE id=%s AND deleted_at IS NULL AND status <> 'deleted' FOR KEY SHARE) ON CONFLICT DO NOTHING", (new_id(), mid, attachment["file_id"], aorder, attachment.get("kind", ""), attachment.get("role", ""), attachment["file_id"]))


def new_conversation(user_id, title="新对话"):
    timestamp = now_ms()
    conversation = {
        "id": uuid.uuid4().hex,
        "title": (title or "新对话")[:80],
        "created_at": timestamp,
        "updated_at": timestamp,
        "messages": [],
    }
    save_conversation(user_id, conversation)
    return conversation


def load_conversation(user_id, conversation_id):
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM conversations WHERE id=%s AND user_id=%s", (conversation_id, user_id)); row = cur.fetchone()
        if not row: raise HTTPException(status_code=404, detail="对话不存在")
        cur.execute("SELECT * FROM conversation_messages WHERE conversation_id=%s ORDER BY sort_order", (conversation_id,)); messages = cur.fetchall()
        mids = [m["id"] for m in messages]
        attachments = {}
        if mids:
            cur.execute("SELECT message_id,file_id,sort_order,kind,role FROM conversation_message_files WHERE message_id = ANY(%s) ORDER BY sort_order", (mids,))
            for a in cur.fetchall(): attachments.setdefault(a["message_id"], []).append({"file_id": a["file_id"], "kind": a["kind"], "role": a["role"]})
    conversation = dict(row.get("extra_json") or {})
    hydrated_messages = []
    for message in messages:
        item = dict(message.get("extra_json") or {})
        item.update({"id": message["id"], "role": message["role"], "content": message["content"], "created_at": message["created_at"], "updated_at": message["updated_at"], "attachments": attachments.get(message["id"], [])})
        hydrated_messages.append(item)
    conversation.update({"id": row["id"], "title": row["title"], "created_at": row["created_at"], "updated_at": row["updated_at"], "messages": hydrated_messages})
    return hydrate_conversation(conversation)


def list_conversations(user_id):
    records = []
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT c.id, c.title, c.created_at, c.updated_at,
                   COALESCE((SELECT m.content FROM conversation_messages m
                             WHERE m.conversation_id=c.id AND m.role <> 'system'
                             ORDER BY m.sort_order DESC LIMIT 1), '') AS last_message
            FROM conversations c WHERE c.user_id=%s ORDER BY c.updated_at DESC
        """, (user_id,))
        rows = cur.fetchall()
    for data in rows:
        records.append({
            "id": data["id"], "title": data["title"], "created_at": data["created_at"], "updated_at": data["updated_at"], "last_message": data["last_message"],
        })
    return records


@router.get("/api/conversations")
async def conversations(request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"user_id": user_id, "conversations": list_conversations(user_id)}


@router.post("/api/conversations")
async def create_conversation(payload: ConversationCreateRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"conversation": new_conversation(user_id, payload.title)}


@router.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"conversation": load_conversation(user_id, conversation_id)}


@router.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM conversations WHERE id=%s AND user_id=%s", (conversation_id, user_id))
    return {"ok": True}
