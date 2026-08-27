#!/usr/bin/env python3
"""Back up MediaForge PostgreSQL, Redis, and MinIO data."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn


ROOT = Path(__file__).resolve().parents[1]


def fail(message: str) -> "NoReturn":
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def log(message: str) -> None:
    print(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {message}")


def command_exists(name: str) -> None:
    if shutil.which(name) is None:
        fail(f"required command not found: {name}")


def run_command(args: list[str]) -> None:
    try:
        subprocess.run(args, check=True)
    except FileNotFoundError:
        fail(f"required command not found: {args[0]}")
    except subprocess.CalledProcessError as exc:
        fail(f"command failed with exit code {exc.returncode}: {args[0]}")


def stat_size(path: Path) -> int:
    return path.stat().st_size


def backup_minio(run_dir: Path, manifest: list[str]) -> None:
    endpoint = os.getenv("MINIO_ENDPOINT", "").strip()
    access_key = os.getenv("MINIO_ACCESS_KEY", "").strip()
    secret_key = os.getenv("MINIO_SECRET_KEY", "").strip()
    if not endpoint or not access_key or not secret_key:
        fail("MINIO_ENDPOINT, MINIO_ACCESS_KEY, and MINIO_SECRET_KEY are required for MinIO backup")
    try:
        from minio import Minio
    except ImportError:
        fail("Python package 'minio' is required for MinIO backup")

    endpoint = endpoint.removeprefix("http://").removeprefix("https://")
    client = Minio(endpoint, access_key=access_key, secret_key=secret_key,
                   secure=os.getenv("MINIO_SECURE", "false").lower() in {"1", "true", "yes", "on"})
    buckets = [os.getenv("MINIO_BUCKET_PRIVATE", "mediaforge-private"),
               os.getenv("MINIO_BUCKET_PUBLIC", "mediaforge-public"),
               os.getenv("MINIO_BUCKET_TEMP", "mediaforge-temp")]
    for bucket in buckets:
        if not bucket or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for ch in bucket):
            fail(f"invalid MinIO bucket name: {bucket}")
        destination = run_dir / "minio" / bucket
        destination.mkdir(parents=True, exist_ok=True)
        log(f"Backing up MinIO bucket {bucket}")
        try:
            objects = client.list_objects(bucket, recursive=True)
            for obj in objects:
                target = destination / obj.object_name
                target.parent.mkdir(parents=True, exist_ok=True)
                client.fget_object(bucket, obj.object_name, str(target))
                manifest.append(f"minio_object={bucket}/{obj.object_name}")
                metadata = {"bucket": bucket, "object": obj.object_name, "size": stat_size(target),
                            "etag": obj.etag, "last_modified": obj.last_modified.isoformat() if obj.last_modified else None}
                target.with_name(target.name + ".metadata.json").write_text(json.dumps(metadata, ensure_ascii=False) + "\n", encoding="utf-8")
        except Exception as exc:
            fail(f"MinIO backup failed for bucket {bucket}: {exc}")


def write_checksums(run_dir: Path) -> None:
    entries: list[str] = []
    for path in sorted(p for p in run_dir.rglob("*") if p.is_file() and p.name != "SHA256SUMS"):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        entries.append(f"{digest}  {path.relative_to(run_dir)}")
    (run_dir / "SHA256SUMS").write_text("\n".join(entries) + ("\n" if entries else ""), encoding="utf-8")


def backup_redis(run_dir: Path, manifest: list[str]) -> None:
    """Create an ACL-friendly logical backup without REPLCONF/SYNC privileges."""
    try:
        import redis
    except ImportError:
        fail("Python package 'redis' is required for Redis backup")
    url = os.getenv("REDIS_URL", "").strip()
    if not url:
        fail("REDIS_URL is required for Redis backup")
    destination = run_dir / "redis.logical.jsonl"
    count = 0
    log("Backing up Redis (logical SCAN/DUMP; no replication privileges required)")
    try:
        client = redis.Redis.from_url(url, decode_responses=False)
        with destination.open("wb") as output:
            for raw_key in client.scan_iter():
                key = raw_key if isinstance(raw_key, bytes) else str(raw_key).encode()
                value = client.dump(key)
                if value is None:
                    continue
                import base64
                record = {"key": base64.b64encode(key).decode("ascii"),
                          "ttl_ms": int(client.pttl(key)),
                          "value": base64.b64encode(value).decode("ascii")}
                output.write((json.dumps(record, separators=(",", ":")) + "\n").encode("utf-8"))
                count += 1
        manifest.append(f"redis_logical_keys={count}")
        manifest.append(f"redis_logical_bytes={stat_size(destination)}")
    except Exception as exc:
        fail(f"Redis backup failed: {exc}")


def backup_redis_rdb(run_dir: Path, manifest: list[str], admin_url: str) -> None:
    """Create an atomic RDB backup with a Redis admin connection."""
    command_exists("redis-cli")
    destination = run_dir / "redis.rdb"
    log("Backing up Redis (RDB with admin credentials)")
    run_command(["redis-cli", "-u", admin_url, "--rdb", str(destination)])
    manifest.append(f"redis_rdb_bytes={stat_size(destination)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Back up MediaForge PostgreSQL, Redis, and MinIO data.")
    parser.add_argument("--output-dir", default=os.getenv("BACKUP_DIR", str(ROOT / "backups")))
    parser.add_argument("--retention-days", type=int, default=int(os.getenv("BACKUP_RETENTION_DAYS", "14")))
    parser.add_argument("--only", choices=("all", "postgres", "redis", "minio"), default="all")
    parser.add_argument("--redis-admin-url", default=os.getenv("REDIS_ADMIN_URL", ""),
                        help="Redis administrator URL for atomic RDB backup")
    args = parser.parse_args()
    if args.retention_days < 0:
        fail("retention days must be non-negative")
    output = Path(args.output_dir).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = output / f".in-progress-{timestamp}-{os.getpid()}"
    run_dir.mkdir(mode=0o700)
    manifest = [f"created_at={timestamp}", f"hostname={socket.gethostname()}", f"services={args.only}"]
    try:
        if args.only in ("all", "postgres"):
            database_url = os.getenv("DATABASE_URL", "").strip()
            if not database_url:
                fail("DATABASE_URL is required for PostgreSQL backup")
            command_exists("pg_dump")
            log("Backing up PostgreSQL")
            dump = run_dir / "postgres.dump"
            run_command(["pg_dump", "--dbname", database_url, "--format=custom", "--no-owner", "--no-privileges", "--file", str(dump)])
            manifest.append(f"postgres_dump_bytes={stat_size(dump)}")
        if args.only in ("all", "redis"):
            if args.redis_admin_url.strip():
                backup_redis_rdb(run_dir, manifest, args.redis_admin_url.strip())
            else:
                backup_redis(run_dir, manifest)
        if args.only in ("all", "minio"):
            backup_minio(run_dir, manifest)
        (run_dir / "manifest.txt").write_text("\n".join(manifest) + "\n", encoding="utf-8")
        write_checksums(run_dir)
        for name in ("manifest.txt", "SHA256SUMS"):
            (run_dir / name).chmod(0o600)
        final_dir = output / timestamp
        run_dir.rename(final_dir)
        for old in output.glob("20*"):
            if old.is_dir() and (datetime.now(timezone.utc).timestamp() - old.stat().st_mtime) > args.retention_days * 86400:
                log(f"Removing expired backup {old}")
                shutil.rmtree(old)
        log(f"Backup completed: {final_dir}")
    except BaseException:
        if run_dir.exists():
            shutil.rmtree(run_dir)
        raise
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
