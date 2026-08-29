"""组织（Organization）管理：创建组织、把用户分配到组织。

- PostgreSQL `organizations` 表（id, name, created_at, updated_at）。
- `users.org_id` 外键指向 organizations.id（ON DELETE SET NULL：删除组织不会删除用户，仅解除归属）。
- 组织管理权限由页面权限控制，鉴权在路由层完成（app/routers/organizations.py）。

依赖：app.services.business_metadata（PostgreSQL 连接与建表），app.core.auth（USERS 注册表）。
本模块不引用 FastAPI app 对象，避免循环导入。
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.core.utils import now_ms
from app.services.business_metadata import metadata_connection, new_id


def list_organizations() -> List[Dict[str, Any]]:
    """全部组织，按名称排序，附带成员数量。"""
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT o.id, o.name, o.created_at, o.updated_at, COUNT(u.id) AS member_count
            FROM organizations o
            LEFT JOIN users u ON u.org_id = o.id
            GROUP BY o.id, o.name, o.created_at, o.updated_at
            ORDER BY o.name
            """
        )
        rows = cur.fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "member_count": int(row["member_count"] or 0),
        }
        for row in rows
    ]


def create_organization(name: str) -> Dict[str, Any]:
    """创建组织；名称为空或已存在时抛出 ValueError。"""
    clean_name = (name or "").strip()
    if not clean_name:
        raise ValueError("组织名称不能为空。")
    now = now_ms()
    org_id = new_id()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM organizations WHERE name=%s", (clean_name,))
        if cur.fetchone():
            raise ValueError("组织名称已存在。")
        cur.execute(
            "INSERT INTO organizations(id,name,created_at,updated_at) VALUES(%s,%s,%s,%s)",
            (org_id, clean_name, now, now),
        )
    return {"id": org_id, "name": clean_name, "created_at": now, "updated_at": now, "member_count": 0}


def rename_organization(org_id: str, name: str) -> bool:
    clean_name = (name or "").strip()
    if not clean_name:
        raise ValueError("组织名称不能为空。")
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM organizations WHERE name=%s AND id<>%s", (clean_name, org_id))
        if cur.fetchone():
            raise ValueError("组织名称已存在。")
        cur.execute(
            "UPDATE organizations SET name=%s, updated_at=%s WHERE id=%s RETURNING id",
            (clean_name, now, org_id),
        )
        return cur.fetchone() is not None


def delete_organization(org_id: str) -> bool:
    """删除组织；归属该组织的用户会自动解除归属（org_id 置空），不会被删除。"""
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM organizations WHERE id=%s RETURNING id", (org_id,))
        return cur.fetchone() is not None


def organization_exists(org_id: str) -> bool:
    if not org_id:
        return False
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM organizations WHERE id=%s", (org_id,))
        return cur.fetchone() is not None
