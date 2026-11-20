"""Separate, bounded sync pools. Call these methods off the ASGI event loop."""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

from .config import Conflict, Denied, Unavailable


class Repository:
    def __init__(self, dsn, size=4):
        if not dsn:
            raise Unavailable("授权数据库未配置")
        self.pool = ConnectionPool(
            dsn,
            min_size=0,
            max_size=size,
            timeout=3,
            open=False,
            kwargs={
                "row_factory": dict_row,
                "autocommit": True,
                "connect_timeout": 3,
                "options": "-c statement_timeout=3000 -c lock_timeout=2000",
            },
        )
        self.pool.open()

    @contextmanager
    def connection(self):
        try:
            with self.pool.connection() as conn:
                yield conn
        except (psycopg.Error, PoolTimeout) as exc:
            raise Unavailable("授权服务暂不可用") from exc

    def close(self):
        self.pool.close()

    def ready(self, role):
        """Read-only version/role check; validator never gets schema-table access."""
        expected = {"writer": "media_writer", "validator": "media_validator"}[role]
        with self.connection() as conn:
            row = conn.execute(
                "SELECT current_user AS name, media.runtime_status() AS version, "
                "rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR "
                "EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AS elevated "
                "FROM pg_roles WHERE rolname=current_user"
            ).fetchone()
            if not row or row["name"] != expected or row["version"] != 3 or row["elevated"]:
                raise Unavailable("授权库版本或运行账号权限不符合要求，请执行统一初始化")
            if role == "validator":
                elevated = conn.execute(
                    "SELECT bool_or(has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS elevated "
                    "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='media' AND c.relkind IN ('r','p')"
                ).fetchone()["elevated"]
                if elevated:
                    raise Unavailable("下载校验账号不得直接访问授权表")
            else:
                conn.execute("SELECT id FROM media.media_grants LIMIT 0")
                conn.execute("SELECT id FROM media.media_sources LIMIT 0")
        return True

    def admit(self, grant_id, digest, method):
        with self.connection() as conn:
            return conn.execute(
                "SELECT media.validate_and_admit(%s,%s,%s) AS result", (grant_id, digest, method)
            ).fetchone()["result"]

    def audit(self, grant_id, request_id, method, status, read=0, sent=0, reason="complete", ip=""):
        with self.connection() as conn:
            conn.execute(
                "SELECT media.append_access(%s,%s,%s,%s,%s,%s,%s,%s)",
                (grant_id, request_id, method, status, read, sent, reason, ip),
            )

    @contextmanager
    def locked(self):
        with self.connection() as conn, conn.transaction():
            conn.execute("SELECT 1 FROM media.media_policy_state WHERE scope='global' AND key='*' FOR UPDATE")
            yield conn

    def check_policies(self, conn, source, exclude_source=False):
        pairs = [
            ("global", "*"),
            ("file", source["file_id"]),
            ("task", source["task_id"]),
        ]
        for scope, key in pairs:
            row = conn.execute(
                "SELECT * FROM media.media_policy_state WHERE scope=%s AND key=%s", (scope, key)
            ).fetchone()
            if (not row and scope == "global") or (row and not row["enabled"]):
                raise Denied("未获得视频外发许可或链接已被撤回")
            if row:
                column = {"user": "owner_id", "provider": "provider_id", "file": "file_id", "task": "task_id"}.get(
                    scope
                )
                query = "SELECT COALESCE(sum(s.size_bytes),0) AS total FROM media.media_grants g JOIN media.media_sources s ON g.source_id=s.id WHERE g.state='active' AND g.expires_at>now()"
                params = ()
                if column:
                    query += f" AND s.{column}=%s"
                    params = (key,)
                if exclude_source:
                    query += " AND s.id<>%s"
                    params = (*params, source["id"])
                if conn.execute(query, params).fetchone()["total"] + source["size_bytes"] > row["active_bytes"]:
                    raise Denied("活动授权配额不足")

    def create_source(self, source):
        with self.locked() as conn:
            old = conn.execute(
                "SELECT * FROM media.media_sources WHERE owner_id=%s AND file_id=%s AND task_id=%s AND provider_id=%s",
                tuple(source[k] for k in ("owner_id", "file_id", "task_id", "provider_id")),
            ).fetchone()
            self.check_policies(conn, dict(source, id=old["id"] if old else uuid4().hex), exclude_source=True)
            if old:
                if any(
                    old[k] != source.get(k)
                    for k in (
                        "bucket",
                        "object_key",
                        "version_id",
                        "object_etag",
                        "size_bytes",
                        "ext",
                        "retention_until",
                    )
                ):
                    raise Conflict("素材已变化，请使用新任务重新提交")
                return old
            source = {"id": uuid4().hex, **source}
            cols = tuple(source)
            conn.execute(
                f"INSERT INTO media.media_sources({','.join(cols)}) VALUES({','.join(['%s'] * len(cols))})",
                tuple(source.values()),
            )
            return source

    def source(self, source_id):
        with self.connection() as conn:
            return conn.execute("SELECT * FROM media.media_sources WHERE id=%s", (source_id,)).fetchone()

    def issue(self, source_id, owner_id, digest, key, ttl, rotate=False, encrypted_token=None, encryption_key=""):
        if not 1 <= ttl <= 7200:
            raise Denied("链接有效期超过允许范围")
        with self.locked() as conn:
            source = conn.execute(
                "SELECT * FROM media.media_sources WHERE id=%s AND owner_id=%s", (source_id, owner_id)
            ).fetchone()
            if not source:
                raise Denied("对象绑定不可用")
            self.check_policies(conn, source, exclude_source=True)
            duplicate = conn.execute(
                "SELECT id FROM media.media_grants WHERE source_id=%s AND idempotency_key=%s", (source_id, key)
            ).fetchone()
            if duplicate:
                raise Conflict("请求已处理；原凭证不可再次展示，请显式轮换")
            old = conn.execute(
                "SELECT id FROM media.media_grants WHERE source_id=%s AND state='active' AND expires_at>now()",
                (source_id,),
            ).fetchone()
            if old and not rotate:
                raise Conflict("已有授权，请显式轮换")
            # Count revoked grants as well: rotating/revoking must not reset the
            # signing rate. The global policy lock serializes these checks.
            for column, value, rate in ((None, None, 120), ("owner_id", owner_id, 30)):
                where = f" AND s.{column}=%s" if column else ""
                params = (value,) if column else ()
                count = conn.execute(
                    "SELECT count(*) AS n FROM media.media_grants g JOIN media.media_sources s ON s.id=g.source_id WHERE g.created_at>clock_timestamp()-interval '1 minute'"
                    + where,
                    params,
                ).fetchone()["n"]
                if count >= rate:
                    raise Denied("签发频率超过限制，请稍后重试")
            active = conn.execute(
                "SELECT count(*) AS n FROM media.media_grants WHERE state='active' AND expires_at>clock_timestamp() AND source_id<>%s",
                (source_id,),
            ).fetchone()["n"]
            if active >= 1024:
                raise Denied("全局活动授权数量超过限制")
            conn.execute(
                "UPDATE media.media_grants SET state='revoked',revoked_at=now(),reason='rotated' WHERE source_id=%s AND state='active'",
                (source_id,),
            )
            database_now = conn.execute("SELECT clock_timestamp() AS current_time").fetchone()["current_time"]
            expires = database_now + timedelta(seconds=ttl)
            if source.get("retention_until"):
                expires = min(expires, source["retention_until"])
            if expires <= database_now:
                raise Denied("素材已过期")
            grant = conn.execute(
                "INSERT INTO media.media_grants(id,source_id,token_hash,idempotency_key,expires_at) VALUES(%s,%s,%s,%s,%s) RETURNING id,expires_at",
                (uuid4().hex, source_id, digest, key, expires),
            ).fetchone()
            if encrypted_token:
                if len(encryption_key) < 16:
                    raise Unavailable("任务交付加密密钥未配置")
                conn.execute(
                    "INSERT INTO media.media_deliveries(grant_id,ciphertext,expires_at) VALUES(%s,public.pgp_sym_encrypt(%s,%s),%s)",
                    (grant["id"], encrypted_token, encryption_key, expires),
                )
            return grant

    def list_grants(self, owner_id=None, offset=0, limit=30, state=""):
        with self.connection() as conn:
            where = "WHERE (%s::text IS NULL OR s.owner_id=%s) AND (%s='' OR (CASE WHEN g.state='active' AND g.expires_at<=now() THEN 'expired' ELSE g.state END)=%s)"
            params = (owner_id, owner_id, state, state)
            total = conn.execute(
                "SELECT count(*) AS n FROM media.media_grants g JOIN media.media_sources s ON s.id=g.source_id "
                + where,
                params,
            ).fetchone()["n"]
            rows = conn.execute(
                "SELECT g.id,g.source_id,s.owner_id,s.file_id,s.task_id,s.provider_id,s.ext,s.size_bytes,g.created_at,g.expires_at,g.revoked_at,g.reason,g.get_count,g.head_count,g.reserved_bytes,g.upstream_id,CASE WHEN g.state='active' AND g.expires_at<=now() THEN 'expired' ELSE g.state END AS state, (SELECT max(occurred_at) FROM media.media_access_events e WHERE e.grant_id=g.id) AS last_access, (SELECT COALESCE(sum(bytes_sent),0) FROM media.media_access_events e WHERE e.grant_id=g.id) AS bytes_sent FROM media.media_grants g JOIN media.media_sources s ON s.id=g.source_id "
                + where
                + " ORDER BY g.created_at DESC LIMIT %s OFFSET %s",
                (*params, limit, offset),
            ).fetchall()
            return {"items": rows, "total": total, "offset": offset, "limit": limit}

    def revoke(self, grant_id, owner_id=None):
        with self.locked() as conn:
            row = conn.execute(
                "UPDATE media.media_grants g SET state='revoked',revoked_at=COALESCE(revoked_at,now()),reason='manual' FROM media.media_sources s WHERE g.source_id=s.id AND g.id=%s AND (%s::text IS NULL OR s.owner_id=%s) RETURNING g.id",
                (grant_id, owner_id, owner_id),
            ).fetchone()
            if not row:
                raise Denied("授权不存在")
            conn.execute("DELETE FROM media.media_deliveries WHERE grant_id=%s", (grant_id,))

    def set_policy(self, scope, key, enabled, daily_bytes=34359738368, active_bytes=2147483648):
        if scope not in ("global", "file", "task", "user", "provider") or (scope == "global" and key != "*"):
            raise Denied("无效的外发策略范围")
        if scope in ("user", "provider") and enabled:
            raise Denied("用户和供应商不再设置独立外发策略")
        with self.locked() as conn:
            if scope not in ("user", "provider"):
                conn.execute(
                    "INSERT INTO media.media_policy_state(scope,key,enabled,daily_bytes,active_bytes) VALUES(%s,%s,%s,%s,%s) ON CONFLICT(scope,key) DO UPDATE SET enabled=EXCLUDED.enabled,daily_bytes=EXCLUDED.daily_bytes,active_bytes=EXCLUDED.active_bytes,updated_at=now()",
                    (scope, key, enabled, daily_bytes, active_bytes),
                )
            if not enabled:
                column = {"user": "owner_id", "provider": "provider_id", "file": "file_id", "task": "task_id"}.get(
                    scope
                )
                where = f" AND s.{column}=%s" if column else ""
                args = (key,) if column else ()
                if scope in ("user", "provider"):
                    # Business mutations revoke affected tasks without reintroducing
                    # a user/provider approval switch. Old tasks cannot sign again.
                    conn.execute(
                        "INSERT INTO media.media_policy_state(scope,key,enabled) "
                        "SELECT DISTINCT 'task',s.task_id,false FROM media.media_sources s WHERE " + f"s.{column}=%s "
                        "ON CONFLICT(scope,key) DO UPDATE SET enabled=false,updated_at=now()",
                        args,
                    )
                conn.execute(
                    "UPDATE media.media_grants g SET state='revoked',revoked_at=now(),reason='scope_revoked' FROM media.media_sources s WHERE g.source_id=s.id AND g.state='active'"
                    + where,
                    args,
                )
                conn.execute(
                    "DELETE FROM media.media_deliveries d USING media.media_grants g WHERE d.grant_id=g.id AND g.state='revoked'"
                )

    def policies(self):
        with self.connection() as conn:
            return conn.execute(
                "SELECT * FROM media.media_policy_state WHERE scope IN ('global','task','file') ORDER BY scope,key"
            ).fetchall()

    def list_policies(self, offset=0, limit=30, scope="", enabled=None, keyword=""):
        """Paged, filtered view of the policy table for the management page.

        ``policies()`` stays unbounded for internal callers. Task and file rows are
        written for every finished task and deleted file, so the table only grows.
        """
        pattern = "%" + keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where = (
            "WHERE scope IN ('global','task','file') AND (%s='' OR scope=%s) "
            "AND (%s::boolean IS NULL OR enabled=%s) AND (%s='' OR key ILIKE %s ESCAPE '\\')"
        )
        params = (scope, scope, enabled, enabled, keyword, pattern)
        with self.connection() as conn:
            total = conn.execute("SELECT count(*) AS n FROM media.media_policy_state " + where, params).fetchone()["n"]
            rows = conn.execute(
                "SELECT * FROM media.media_policy_state " + where + " ORDER BY scope,key LIMIT %s OFFSET %s",
                (*params, limit, offset),
            ).fetchall()
            return {"items": rows, "total": total, "offset": offset, "limit": limit}

    def invalidate_restored_authorizations(self):
        """Explicit recovery barrier, run with the download entrance stopped.

        Database restore cannot be detected from the restored database itself.
        Re-enabling global policy later never reactivates these grant rows.
        """
        with self.locked() as conn:
            conn.execute(
                "UPDATE media.media_policy_state SET enabled=false,updated_at=now() WHERE scope='global' AND key='*'"
            )
            count = conn.execute(
                "UPDATE media.media_grants SET state='revoked',revoked_at=COALESCE(revoked_at,now()),reason='database_restore' WHERE state='active'"
            ).rowcount
            conn.execute("DELETE FROM media.media_deliveries")
            conn.execute(
                "SELECT media.append_access(NULL,%s,'RESTORE',0,0,0,'authorization_restore','')", (uuid4().hex,)
            )
            return count

    def active_file(self, file_id):
        with self.connection() as conn:
            return bool(
                conn.execute(
                    "SELECT 1 FROM media.media_grants g JOIN media.media_sources s ON g.source_id=s.id WHERE s.file_id=%s AND g.state='active' AND g.expires_at>now() LIMIT 1",
                    (file_id,),
                ).fetchone()
            )

    def cleanup_barrier(self, file_id):
        with self.locked() as conn:
            active = conn.execute(
                "SELECT 1 FROM media.media_grants g JOIN media.media_sources s ON g.source_id=s.id WHERE s.file_id=%s AND g.state='active' AND g.expires_at>now() LIMIT 1",
                (file_id,),
            ).fetchone()
            if active:
                return False
            conn.execute(
                "INSERT INTO media.media_policy_state(scope,key,enabled) VALUES('file',%s,false) ON CONFLICT(scope,key) DO UPDATE SET enabled=false,updated_at=now()",
                (file_id,),
            )
            return True

    def active_tasks(self):
        with self.connection() as conn:
            return conn.execute(
                "SELECT DISTINCT s.task_id FROM media.media_sources s JOIN media.media_grants g ON s.id=g.source_id WHERE g.state='active' AND g.expires_at>now()"
            ).fetchall()

    def settle_task(self, task_id, confirmed=False):
        with self.locked() as conn:
            if (
                not confirmed
                and conn.execute(
                    "SELECT 1 FROM media.media_grants g JOIN media.media_sources s ON s.id=g.source_id WHERE s.task_id=%s AND g.state='active' AND g.submission_state IN ('submitting','submitted') LIMIT 1",
                    (task_id,),
                ).fetchone()
            ):
                return False
            conn.execute(
                "INSERT INTO media.media_policy_state(scope,key,enabled) VALUES('task',%s,false) ON CONFLICT(scope,key) DO UPDATE SET enabled=false,updated_at=now()",
                (task_id,),
            )
            conn.execute(
                "UPDATE media.media_grants g SET state='revoked',submission_state='terminal',revoked_at=COALESCE(revoked_at,now()),reason='task_terminal' FROM media.media_sources s WHERE g.source_id=s.id AND s.task_id=%s",
                (task_id,),
            )
            conn.execute(
                "DELETE FROM media.media_deliveries d USING media.media_grants g,media.media_sources s WHERE d.grant_id=g.id AND g.source_id=s.id AND s.task_id=%s",
                (task_id,),
            )
            return True

    def maintenance(self, retention_days=90):
        with self.locked() as conn:
            conn.execute(
                "DELETE FROM media.media_deliveries WHERE expires_at<=now() OR grant_id IN (SELECT id FROM media.media_grants WHERE state='revoked')"
            )
            conn.execute(
                "DELETE FROM media.media_access_events WHERE occurred_at < now() - make_interval(days => %s)",
                (retention_days,),
            )

    def submission(self, task_id, provider_id, state, upstream_id=""):
        with self.locked() as conn:
            if state == "submitting":
                sources = conn.execute(
                    "SELECT s.*,g.state AS grant_state,g.expires_at FROM media.media_grants g JOIN media.media_sources s ON s.id=g.source_id WHERE s.task_id=%s AND s.provider_id=%s",
                    (task_id, provider_id),
                ).fetchall()
                if not sources or any(
                    s["grant_state"] != "active" or s["expires_at"] <= datetime.now(timezone.utc) for s in sources
                ):
                    raise Denied("任务视频授权已失效")
                for source in sources:
                    self.check_policies(conn, source, exclude_source=True)
                existing = conn.execute(
                    "SELECT g.submission_state FROM media.media_grants g JOIN media.media_sources s ON s.id=g.source_id WHERE s.task_id=%s AND s.provider_id=%s AND g.submission_state<>'prepared' LIMIT 1",
                    (task_id, provider_id),
                ).fetchone()
                if existing:
                    raise Conflict("上游提交已开始，请查询原任务，禁止重复提交")
                if (
                    task_id.startswith("asset:")
                    and conn.execute(
                        "SELECT 1 FROM media.media_sources s JOIN media.media_grants g ON g.source_id=s.id JOIN media.media_sources current ON current.task_id=%s AND current.provider_id=%s WHERE s.owner_id=current.owner_id AND s.file_id=current.file_id AND s.provider_id=current.provider_id AND s.task_id<>current.task_id AND s.task_id LIKE 'asset:%%' AND g.submission_state IN ('submitting','submitted') LIMIT 1",
                        (task_id, provider_id),
                    ).fetchone()
                ):
                    # Asset registration creates an operation task per request.
                    # Serialize duplicate requests even with different task IDs,
                    # stale business snapshots, expiry or a process restart.
                    raise Conflict("此视频已有提交中或结果未知的素材认证，请查询原任务")
            conn.execute(
                "UPDATE media.media_grants g SET submission_state=%s,upstream_id=CASE WHEN %s='' THEN upstream_id ELSE %s END FROM media.media_sources s WHERE s.id=g.source_id AND s.task_id=%s AND s.provider_id=%s AND g.state='active'",
                (state, upstream_id, upstream_id, task_id, provider_id),
            )

    def existing_delivery(self, task_id, provider_id, file_id, encryption_key):
        with self.connection() as conn:
            row = conn.execute(
                "SELECT g.id,g.submission_state,g.upstream_id,g.expires_at,public.pgp_sym_decrypt(d.ciphertext,%s) AS token FROM media.media_grants g JOIN media.media_sources s ON g.source_id=s.id LEFT JOIN media.media_deliveries d ON d.grant_id=g.id WHERE s.task_id=%s AND s.provider_id=%s AND s.file_id=%s AND g.state='active' ORDER BY g.created_at DESC LIMIT 1",
                (encryption_key, task_id, provider_id, file_id),
            ).fetchone()
            return row
