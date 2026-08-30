"""修复用户类型的页面权限。

常用命令：

    # 仅给默认用户类型增加“用户管理”页面权限。
    .venv/bin/python scripts/grant_user_management_page.py new-user

    # 将默认用户类型同步为当前侧边栏的全部页面权限。
    .venv/bin/python scripts/grant_user_management_page.py new-user --all-sidebar-pages

    # 预览变更，不写入数据库。
    .venv/bin/python scripts/grant_user_management_page.py new-user --all-sidebar-pages --dry-run

    # 修复其他用户类型，例如 creator。
    .venv/bin/python scripts/grant_user_management_page.py creator --all-sidebar-pages

The script preserves every existing user type, assignment, and page permission.
It is intended as a recovery tool when no currently assigned type can open the
user-management page.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core import access_control
from app.config import DATABASE_URL
from app.core.utils import now_ms


PAGE_ID = "user-management"


def update_pages(type_id: str, *, all_sidebar_pages: bool, dry_run: bool = False) -> tuple[dict, bool]:
    type_id = str(type_id or "").strip()
    if not type_id:
        raise ValueError("用户类型 ID 不能为空")
    if not DATABASE_URL:
        raise RuntimeError("未配置 DATABASE_URL")

    with psycopg.connect(DATABASE_URL) as conn, conn.transaction(), conn.cursor() as cur:
        # Serialize with other recovery runs before reading and replacing the JSON setting.
        cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("access_control",))
        cur.execute("SELECT value_json FROM app_settings WHERE key=%s FOR UPDATE", ("access_control",))
        row = cur.fetchone()
        config = access_control._normalize_config(row[0] if row else {})
        types = config.get("types") if isinstance(config.get("types"), dict) else {}
        if type_id not in types:
            available = ", ".join(sorted(types)) or "（无）"
            raise ValueError(f"用户类型不存在：{type_id}。可用类型：{available}")

        entry = types[type_id] if isinstance(types[type_id], dict) else {}
        pages = access_control.all_page_ids() if all_sidebar_pages else list(entry.get("pages") or [])
        changed = pages != list(entry.get("pages") or [])
        if not all_sidebar_pages and PAGE_ID not in pages:
            pages.append(PAGE_ID)
            changed = True
        if changed:
            entry = {**entry, "pages": pages}
            types = {**types, type_id: entry}
            config = access_control._normalize_config({**config, "types": types})
            if not dry_run:
                now = now_ms()
                cur.execute(
                    """INSERT INTO app_settings(key,value_json,created_at,updated_at)
                       VALUES(%s,%s::jsonb,%s,%s)
                       ON CONFLICT(key) DO UPDATE SET value_json=EXCLUDED.value_json,
                           updated_at=EXCLUDED.updated_at, version=app_settings.version+1""",
                    ("access_control", json.dumps(config, ensure_ascii=False), now, now),
                )
        return config, changed


def main() -> int:
    parser = argparse.ArgumentParser(description="修复指定用户类型的页面权限")
    parser.add_argument("type_id", help="用户类型 ID，例如 new-user 或 creator")
    parser.add_argument("--dry-run", action="store_true", help="仅检查并打印结果，不写入数据库")
    parser.add_argument("--all-sidebar-pages", action="store_true", help="将权限同步为当前侧边栏全部页面")
    args = parser.parse_args()

    try:
        config, changed = update_pages(args.type_id, all_sidebar_pages=args.all_sidebar_pages, dry_run=args.dry_run)
    except Exception as exc:
        print(f"操作失败：{exc}", file=sys.stderr)
        return 1

    action = "全部侧边栏页面权限" if args.all_sidebar_pages else "用户管理权限"
    status = "将更新" if args.dry_run and changed else "已更新" if changed else "已是最新"
    pages = config["types"][args.type_id].get("pages", [])
    print(f"用户类型：{args.type_id}")
    print(f"{action}：{status}")
    print(f"当前页面权限：{json.dumps(pages, ensure_ascii=False)}")
    if args.dry_run:
        print("预览模式：未写入数据库。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
