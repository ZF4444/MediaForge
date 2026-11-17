"""Explicit administrative bootstrap; never imported by runtime startup hooks."""

import json
import secrets
from pathlib import Path

import psycopg
from minio import Minio
from minio.credentials import StaticProvider
from minio.error import S3Error
from minio.minioadmin import MinioAdmin
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo


class BootstrapError(ValueError):
    def __init__(self, message):
        super().__init__(message)
        self.safe_message = message


def policy_signature(value):
    # MinIO canonicalizes action/resource order and may add an empty Sid.
    # Compare complete permissions, rather than overwriting an existing policy.
    if isinstance(value, dict):
        return {k: policy_signature(v) for k, v in value.items() if k != "Sid" or v}
    if isinstance(value, list):
        return sorted((policy_signature(v) for v in value), key=lambda v: json.dumps(v, sort_keys=True))
    return value


def migrate(dsn, writer_password, validator_password, *, rotate_passwords=False):
    if min(len(writer_password), len(validator_password)) < 24:
        raise BootstrapError("Runtime passwords must have at least 24 characters")
    with psycopg.connect(dsn, autocommit=True) as conn:
        database = conn.info.dbname
        if conn.execute("SHOW server_encoding").fetchone()[0] != "UTF8":
            raise BootstrapError("The dedicated authorization database must use UTF8")
        if database in ("postgres", "template0", "template1") or "media" not in database:
            raise BootstrapError("Use an explicitly named, dedicated media authorization database")
        conn.execute("SELECT pg_advisory_lock(683763101)")
        try:
            with conn.transaction():
                if conn.execute("SELECT to_regclass('media.schema_version')").fetchone()[0]:
                    version = conn.execute("SELECT max(version) FROM media.schema_version").fetchone()[0]
                    if version and version > 3:
                        raise BootstrapError("Authorization schema is newer than this application")
                for name in ("media_owner", "media_writer", "media_validator"):
                    exists = conn.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (name,)).fetchone()
                    if not exists:
                        conn.execute(sql.SQL("CREATE ROLE {} NOLOGIN").format(sql.Identifier(name)))
                    if conn.execute(
                        "SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=%s)",
                        (name,),
                    ).fetchone():
                        raise BootstrapError("Dedicated media roles must not inherit or assume other roles")
                    if name == "media_owner":
                        if conn.execute(
                            "SELECT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=%s",
                            (name,),
                        ).fetchone()[0]:
                            raise BootstrapError("media_owner must be a dedicated NOLOGIN role")
                        continue
                    if (
                        exists
                        and not conn.execute("SELECT rolcanlogin FROM pg_roles WHERE rolname=%s", (name,)).fetchone()[0]
                    ):
                        raise BootstrapError("Existing disabled media role must be reviewed explicitly")
                    if not exists:
                        conn.execute(sql.SQL("ALTER ROLE {} LOGIN").format(sql.Identifier(name)))
                    password = writer_password if name == "media_writer" else validator_password
                    conn.execute(
                        sql.SQL(
                            "ALTER ROLE {} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
                        ).format(sql.Identifier(name))
                    )
                    if not exists or rotate_passwords:
                        conn.execute(
                            sql.SQL("ALTER ROLE {} PASSWORD {}").format(sql.Identifier(name), sql.Literal(password))
                        )
                    conn.execute(sql.SQL("ALTER ROLE {} SET log_parameter_max_length = 0").format(sql.Identifier(name)))
                    conn.execute(
                        sql.SQL("ALTER ROLE {} SET log_parameter_max_length_on_error = 0").format(sql.Identifier(name))
                    )
                conn.execute(sql.SQL("REVOKE ALL ON DATABASE {} FROM PUBLIC").format(sql.Identifier(database)))
                conn.execute(
                    sql.SQL("GRANT CONNECT ON DATABASE {} TO media_writer,media_validator,media_owner").format(
                        sql.Identifier(database)
                    )
                )
                conn.execute(sql.SQL("GRANT CREATE ON DATABASE {} TO media_owner").format(sql.Identifier(database)))
                conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
                conn.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
                conn.execute("SET LOCAL ROLE media_owner")
                conn.execute(Path(__file__).with_name("schema.sql").read_text())
                conn.execute("GRANT USAGE ON SCHEMA media TO media_writer,media_validator")
                conn.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA media TO media_writer")
                conn.execute("GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA media TO media_writer")
                conn.execute("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA media TO media_writer")
                conn.execute(
                    "GRANT EXECUTE ON FUNCTION media.validate_and_admit(text,text,text),media.append_access(text,text,text,integer,bigint,bigint,text,text),media.runtime_status() TO media_validator"
                )
        finally:
            conn.execute("SELECT pg_advisory_unlock(683763101)")
    for role, password in (("media_writer", writer_password), ("media_validator", validator_password)):
        with psycopg.connect(make_conninfo(dsn, user=role, password=password), connect_timeout=3) as runtime:
            runtime.execute("SELECT media.runtime_status()")


def initialize_authorizations(admin_dsn, writer_dsn, validator_dsn):
    """Create a dedicated database explicitly, including on an existing PG volume."""
    writer, validator = conninfo_to_dict(writer_dsn), conninfo_to_dict(validator_dsn)
    database = writer.get("dbname", "")
    if database in ("postgres", "template0", "template1") or "media" not in database:
        raise BootstrapError("Use a dedicated media authorization database")
    if (
        validator.get("dbname") != database
        or writer.get("user") != "media_writer"
        or validator.get("user") != "media_validator"
    ):
        raise BootstrapError("Writer and validator must use separate dedicated roles in the same database")
    admin = conninfo_to_dict(admin_dsn)
    if any(writer.get(k) != validator.get(k) or writer.get(k) != admin.get(k) for k in ("host", "port")):
        raise BootstrapError("Bootstrap and runtime connections must target the same PostgreSQL instance")
    with psycopg.connect(admin_dsn, autocommit=True, connect_timeout=5) as conn:
        if conn.info.dbname == database:
            raise BootstrapError("Bootstrap administrator must initially connect to a different database")
        conn.execute("SELECT pg_advisory_lock(683763102)")
        try:
            if not conn.execute("SELECT 1 FROM pg_database WHERE datname=%s", (database,)).fetchone():
                conn.execute(
                    sql.SQL("CREATE DATABASE {} ENCODING 'UTF8' TEMPLATE template0").format(sql.Identifier(database))
                )
        finally:
            conn.execute("SELECT pg_advisory_unlock(683763102)")
    migrate(make_conninfo(admin_dsn, dbname=database), writer.get("password", ""), validator.get("password", ""))


def initialize_storage_reader(settings, admin_endpoint, admin_key, admin_secret, *, secure=False):
    """Provision a dedicated reader once; never rotate/re-enable existing users."""
    settings.require_reader()
    if settings.endpoint != admin_endpoint or settings.access_key == admin_key or len(settings.secret_key) < 24:
        raise BootstrapError("Use a dedicated storage reader on the configured MinIO instance")
    management = MinioAdmin(endpoint=admin_endpoint, credentials=StaticProvider(admin_key, admin_secret), secure=secure)
    name = "mediaforge-video-read"
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": ["s3:GetObject", "s3:GetObjectVersion"],
                "Resource": [f"arn:aws:s3:::{prefix}*" for prefix in settings.prefixes],
            }
        ],
    }
    policies = json.loads(management.policy_list())
    if name in policies:
        existing = json.loads(management.policy_info(name))
        existing = existing.get("policy", existing)
        if isinstance(existing, str):
            existing = json.loads(existing)
        if policy_signature(existing) != policy_signature(policy):
            raise BootstrapError("Existing media read policy differs; review explicitly before changing permissions")
    else:
        management.policy_add(name, policy=policy)
    users = json.loads(management.user_list())
    if settings.access_key not in users:
        management.user_add(settings.access_key, settings.secret_key)
        management.policy_set(name, user=settings.access_key)
    else:
        info = json.loads(management.user_info(settings.access_key))
        if info.get("status") != "enabled" or info.get("policyName") != name or info.get("memberOf"):
            raise BootstrapError("Existing media reader must be enabled and attached only to the dedicated read policy")
    # Signed HEAD proves that the configured secret works. No object is created,
    # no bucket versioning is changed and no ListBucket permission is required.
    reader = Minio(
        settings.endpoint, settings.access_key, settings.secret_key, secure=settings.secure, region="us-east-1"
    )
    for prefix in settings.prefixes:
        bucket, key_prefix = prefix.split("/", 1)
        try:
            reader.stat_object(bucket, key_prefix + ".initialization-" + secrets.token_hex(16))
        except S3Error as exc:
            if exc.code != "NoSuchKey":
                raise BootstrapError(
                    "Storage reader credentials or read policy verification failed: "
                    + (exc.code if exc.code.isalnum() else "storage_error")
                ) from None
