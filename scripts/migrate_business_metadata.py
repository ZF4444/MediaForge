"""One-time migration of legacy user JSON into PostgreSQL business metadata."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.business_metadata import initialize_business_metadata, metadata_connection, save_canvas_payload
from app.config import USERS_DIR
from app.services.storage import resolve_file_reference

def main():
    initialize_business_metadata()
    migrated = {"history": 0, "conversations": 0, "messages": 0, "assets": 0, "canvases": 0, "nodes": 0}
    from app.services.business_metadata import metadata_connection
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM files WHERE status <> 'deleted' AND deleted_at IS NULL")
        valid_file_ids = {str(row["id"]) for row in cur.fetchall()}
    root = Path(USERS_DIR)
    for user_dir in root.iterdir() if root.exists() else []:
        if not user_dir.is_dir(): continue
        uid = user_dir.name
        history = user_dir / "history.json"
        if history.exists():
            for item in json.loads(history.read_text(encoding="utf-8") or "[]"):
                from app.services.business_metadata import insert_history_record
                raw_refs = item.get("image_refs") or []
                if not raw_refs:
                    raw_refs = [{"url": url} for url in (item.get("images") or [])]
                refs = []
                for ref in raw_refs:
                    if not isinstance(ref, dict): continue
                    fid = str(ref.get("file_id") or "")
                    if not fid and ref.get("url"):
                        resolved = resolve_file_reference(url=ref.get("url")) or {}
                        fid = str(resolved.get("file_id") or "")
                    if fid in valid_file_ids:
                        refs.append({**ref, "file_id": fid})
                insert_history_record(uid, item, refs)
                migrated["history"] += 1
        conversations = user_dir / "conversations"
        if conversations.exists():
            from app.services.business_metadata import metadata_connection, json_value
            for path in conversations.glob("*.json"):
                try:
                    conversation = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    continue
                if not isinstance(conversation, dict):
                    continue
                cid = str(conversation.get("id") or path.stem)
                with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
                    cur.execute("INSERT INTO conversations(id,user_id,title,created_at,updated_at,extra_json) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,updated_at=EXCLUDED.updated_at,extra_json=EXCLUDED.extra_json", (cid, uid, conversation.get("title", "新对话"), conversation.get("created_at", 0), conversation.get("updated_at", 0), json_value({k:v for k,v in conversation.items() if k not in {"id","title","created_at","updated_at","messages"}})))
                    cur.execute("DELETE FROM conversation_messages WHERE conversation_id=%s", (cid,))
                    for order, message in enumerate(conversation.get("messages") or []):
                        if not isinstance(message, dict): continue
                        mid = str(message.get("id") or f"{cid}_{order}")
                        migrated["messages"] += 1
                        cur.execute("INSERT INTO conversation_messages(id,conversation_id,role,content,sort_order,created_at,updated_at,extra_json) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)", (mid, cid, message.get("role", "user"), message.get("content", ""), order, message.get("created_at", 0), message.get("updated_at", 0), json_value({k:v for k,v in message.items() if k not in {"id","role","content","created_at","updated_at","attachments"}})))
                        for attachment_order, attachment in enumerate(message.get("attachments") or []):
                            if isinstance(attachment, dict) and str(attachment.get("file_id") or "") in valid_file_ids:
                                cur.execute("INSERT INTO conversation_message_files(id,message_id,file_id,sort_order,kind,role) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING", (f"{mid}_{attachment_order}", mid, attachment["file_id"], attachment_order, attachment.get("kind", ""), attachment.get("role", "")))
                migrated["conversations"] += 1
        asset = user_dir / "asset_library.json"
        if asset.exists():
            from app.services.assets import save_asset_library
            from app.core.auth import current_user_var
            token = current_user_var.set(uid)
            try:
                library = json.loads(asset.read_text(encoding="utf-8"))
                for lib in library.get("libraries", []) if isinstance(library, dict) else []:
                    for cat in lib.get("categories", []) if isinstance(lib, dict) else []:
                        for item in cat.get("items", []) if isinstance(cat, dict) else []:
                            if isinstance(item, dict) and item.get("file_id") and str(item["file_id"]) not in valid_file_ids:
                                item.pop("file_id", None)
                                item.pop("url", None)
                save_asset_library(library)
                migrated["assets"] += 1
            finally: current_user_var.reset(token)
        for path in (user_dir / "canvases").glob("*.json") if (user_dir / "canvases").exists() else []:
            token = __import__('app.core.auth', fromlist=['current_user_var']).current_user_var.set(uid)
            canvas = json.loads(path.read_text(encoding="utf-8"))
            try: save_canvas_payload(uid, canvas)
            finally: __import__('app.core.auth', fromlist=['current_user_var']).current_user_var.reset(token)
            migrated["canvases"] += 1
            migrated["nodes"] += len(canvas.get("nodes") or [])
    tables = {
        "history_records": "history_records", "conversations": "conversations",
        "conversation_messages": "conversation_messages", "asset_libraries": "asset_libraries",
        "smart_canvases": "smart_canvases", "smart_canvas_nodes": "smart_canvas_nodes",
    }
    totals = {}
    with metadata_connection() as conn, conn.cursor() as cur:
        for key, table in tables.items():
            cur.execute(f"SELECT COUNT(*) AS count FROM {table}")
            totals[key] = int(cur.fetchone()["count"])
    print("business metadata migration complete")
    print("migrated:", migrated)
    print("database totals:", totals)
    if migrated["canvases"] and totals["smart_canvases"] == 0:
        raise RuntimeError("发现画布 JSON，但 smart_canvases 写入后仍为空")
if __name__ == "__main__": main()
