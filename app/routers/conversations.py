"""对话管理路由（/api/conversations）。

从 main.py 的「对话管理」区块原样迁移。URL 路径、请求/响应模型、状态码
与原 main.py 完全一致（纯结构重构，行为零变更）。

依赖：
- app.core.auth：safe_user_id / user_dir / current_user 隔离
- app.core.utils：now_ms
- app.config：CONVERSATION_LOCK
- app.models：ConversationCreateRequest
"""
import json
import os
import re
import uuid

from fastapi import APIRouter, Header, HTTPException, Request

from app.config import CONVERSATION_LOCK
from app.core.auth import safe_user_id, user_dir
from app.core.utils import now_ms
from app.models import ConversationCreateRequest

router = APIRouter()


def conversation_path(user_id, conversation_id):
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", conversation_id or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的对话 ID")
    return os.path.join(user_dir(user_id), f"{cleaned}.json")


def save_conversation(user_id, conversation):
    with CONVERSATION_LOCK:
        path = conversation_path(user_id, conversation["id"])
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(conversation, f, ensure_ascii=False, indent=2)


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
    path = conversation_path(user_id, conversation_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="对话不存在")
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def list_conversations(user_id):
    records = []
    for filename in os.listdir(user_dir(user_id)):
        if not filename.endswith(".json"):
            continue
        path = os.path.join(user_dir(user_id), filename)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            continue
        messages = data.get("messages", [])
        last_message = next((m for m in reversed(messages) if m.get("role") != "system"), None)
        records.append({
            "id": data.get("id"),
            "title": data.get("title", "新对话"),
            "created_at": data.get("created_at", 0),
            "updated_at": data.get("updated_at", 0),
            "last_message": (last_message or {}).get("content", ""),
        })
    return sorted(records, key=lambda item: item["updated_at"], reverse=True)


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
    path = conversation_path(user_id, conversation_id)
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}
