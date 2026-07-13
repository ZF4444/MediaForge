"""Migrate remaining mutable data/global JSON and help Markdown to PostgreSQL."""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import DATA_DIR
from app.core.utils import now_ms
from app.services.business_metadata import (
    get_app_setting,
    initialize_business_metadata,
    json_value,
    metadata_connection,
    set_app_setting,
    set_user_setting,
)


def read_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    initialize_business_metadata()
    data = Path(DATA_DIR)
    counts = {}
    mappings = {
        "access_control": data / "access_control.json",
        "announcement": data / "announcement.json",
        "api_providers": data / "api_providers.json",
        "shared_folders": data / "shared_folders.json",
        "system_prompt_libraries": data / "prompt_libraries.json",
    }
    for key, path in mappings.items():
        if path.exists():
            value = read_json(path, [] if key == "api_providers" else {})
            set_app_setting(key, value)
            counts[key] = len(value) if isinstance(value, (list, dict)) else 1

    global_config = ROOT / "global_config.json"
    if global_config.exists():
        config = read_json(global_config, {})
        if isinstance(config.get("storage_quota"), dict):
            set_app_setting("storage_quota", config["storage_quota"])
            counts["storage_quota"] = 1

    users = read_json(data / "users_registry.json", {})
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        for uid, info in users.items():
            cur.execute("INSERT INTO users(id,username,created_at) VALUES(%s,%s,%s) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username", (uid, info.get("username") or uid, int(info.get("created_at") or now_ms())))
    counts["users"] = len(users)

    feedback_path = data / "feedback.json"
    feedback = read_json(feedback_path, []) if feedback_path.exists() else get_app_setting("feedback", [])
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        for item in feedback if isinstance(feedback, list) else []:
            cur.execute("INSERT INTO feedback_entries(id,user_id,username,type,content,page,user_agent,status,admin_note,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,admin_note=EXCLUDED.admin_note,updated_at=EXCLUDED.updated_at", tuple(item.get(key, "") for key in ("id","user_id","username","type","content","page","user_agent","status","admin_note","created_at","updated_at")))
    counts["feedback"] = len(feedback) if isinstance(feedback, list) else 0
    if counts["feedback"]:
        with metadata_connection() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM app_settings WHERE key='feedback'")

    sessions = read_json(data / "sessions.json", {})
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        for token, session in sessions.items():
            uid = str(session.get("user_id") or "")
            if uid not in users:
                continue
            created = int(session.get("created_at") or now_ms())
            last_seen = int(session.get("last_seen") or created)
            cur.execute("INSERT INTO user_sessions(token_hash,user_id,username,created_at,last_seen,expires_at) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(token_hash) DO NOTHING", (hashlib.sha256(token.encode()).hexdigest(), uid, session.get("username") or uid, created, last_seen, last_seen + 365 * 24 * 60 * 60 * 1000))
    counts["sessions"] = len(sessions)

    for user_dir in (data / "users").iterdir() if (data / "users").exists() else []:
        if not user_dir.is_dir():
            continue
        uid = user_dir.name
        for key, filename, default in (
            ("caption_rules", "caption_rules.json", []),
            ("expand_rules", "expand_rules.json", []),
            ("prompt_libraries", "prompt_libraries.json", {}),
        ):
            path = user_dir / filename
            if path.exists():
                set_user_setting(uid, key, read_json(path, default))
                counts[key] = counts.get(key, 0) + 1

    help_dir = data / "help_pages"
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        for path in help_dir.glob("*.md") if help_dir.exists() else []:
            cur.execute("INSERT INTO help_pages(slug,content,updated_at) VALUES(%s,%s,%s) ON CONFLICT(slug) DO UPDATE SET content=EXCLUDED.content,updated_at=EXCLUDED.updated_at", (path.stem, path.read_text(encoding="utf-8"), now_ms()))
            counts["help_pages"] = counts.get("help_pages", 0) + 1
        legacy_help = data / "help.md"
        if legacy_help.exists():
            cur.execute("INSERT INTO help_pages(slug,content,updated_at) VALUES(%s,%s,%s) ON CONFLICT(slug) DO NOTHING", ("index", legacy_help.read_text(encoding="utf-8"), now_ms()))
            counts["legacy_help"] = 1

    with metadata_connection() as conn, conn.cursor() as cur:
        totals = {}
        for table in ("app_settings", "user_settings", "users", "user_sessions", "help_pages"):
            cur.execute(f"SELECT COUNT(*) AS count FROM {table}")
            totals[table] = int(cur.fetchone()["count"])

    print("configuration migration complete")
    print(json.dumps(counts, ensure_ascii=False, indent=2))
    print("database totals")
    print(json.dumps(totals, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
