"""Configuration intentionally independent of app.config and its business secrets."""

import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Settings:
    enabled: bool = False
    base_url: str = ""
    writer_dsn: str = field(default="", repr=False)
    validator_dsn: str = field(default="", repr=False)
    endpoint: str = ""
    access_key: str = field(default="", repr=False)
    secret_key: str = field(default="", repr=False)
    secure: bool = True
    prefixes: tuple[str, ...] = ()
    immutable: bool = False
    ttl: int = 1800
    max_ttl: int = 7200
    max_bytes: int = 524288000
    concurrency: int = 16
    chunk_bytes: int = 262144
    timeout: int = 600
    io_timeout: int = 15
    pool_size: int = 4

    def __post_init__(self):
        for name in ("ttl", "max_ttl", "max_bytes", "concurrency", "chunk_bytes", "timeout", "io_timeout", "pool_size"):
            if not isinstance(getattr(self, name), int) or getattr(self, name) < 1:
                raise ValueError(f"PUBLIC_VIDEO: invalid {name}")
        if (
            self.ttl > self.max_ttl
            or self.max_ttl > 7200
            or self.max_bytes > 524288000
            or self.chunk_bytes > 1048576
            or self.concurrency > 64
            or self.pool_size > 16
            or self.timeout > 600
        ):
            raise ValueError("PUBLIC_VIDEO: inconsistent limits")
        if self.io_timeout >= self.timeout:
            raise ValueError("PUBLIC_VIDEO: I/O timeout must be less than total timeout")
        if self.base_url:
            parsed = urlsplit(self.base_url)
            if (
                parsed.scheme != "https"
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.query
                or parsed.fragment
                or parsed.path not in ("", "/")
                or any(c.isspace() for c in self.base_url)
            ):
                raise ValueError("PUBLIC_VIDEO_BASE_URL must be an HTTPS origin")
            parsed.port  # Reject malformed/out-of-range ports at startup.
        if self.endpoint:
            endpoint = urlsplit("//" + self.endpoint)
            if (
                not endpoint.hostname
                or endpoint.username
                or endpoint.password
                or endpoint.path
                or endpoint.query
                or endpoint.fragment
                or any(c.isspace() for c in self.endpoint)
            ):
                raise ValueError("PUBLIC_VIDEO_MINIO_ENDPOINT must be a fixed host[:port]")
            endpoint.port
        for prefix in self.prefixes:
            if (
                "/" not in prefix
                or not prefix.endswith("/")
                or ".." in prefix
                or any(c in prefix for c in "?*\\\x00\r\n")
            ):
                raise ValueError("PUBLIC_VIDEO_PREFIXES must contain literal bucket/prefix values")

    def require_writer(self):
        if not self.enabled:
            raise Disabled("视频外发功能未启用")
        if not self.writer_dsn or not self.base_url:
            raise Unavailable("视频外发配置不完整")

    def require_reader(self):
        if not self.endpoint or not self.access_key or not self.secret_key or not self.prefixes:
            raise Unavailable("视频读取配置不完整")


class Disabled(Exception):
    pass


class Unavailable(Exception):
    pass


class Denied(Exception):
    pass


class Conflict(Exception):
    pass


def load_settings() -> Settings:
    def boolean(key, default="false"):
        value = os.getenv("PUBLIC_VIDEO_" + key, default).lower()
        if value not in ("true", "false"):
            raise ValueError("Invalid PUBLIC_VIDEO boolean")
        return value == "true"

    values = {}
    for key, env in (
        ("ttl", "DEFAULT_TTL_SECONDS"),
        ("max_ttl", "MAX_TTL_SECONDS"),
        ("max_bytes", "MAX_FILE_BYTES"),
        ("concurrency", "DOWNLOAD_CONCURRENCY"),
        ("chunk_bytes", "STREAM_CHUNK_BYTES"),
        ("timeout", "DOWNLOAD_TIMEOUT_SECONDS"),
        ("io_timeout", "IO_TIMEOUT_SECONDS"),
        ("pool_size", "DATABASE_POOL_SIZE"),
    ):
        values[key] = int(os.getenv("PUBLIC_VIDEO_" + env, str(getattr(Settings(), key))))
    return Settings(
        enabled=boolean("ENABLED"),
        base_url=os.getenv("PUBLIC_VIDEO_BASE_URL", "").rstrip("/"),
        writer_dsn=os.getenv("PUBLIC_VIDEO_WRITER_DSN", ""),
        validator_dsn=os.getenv("PUBLIC_VIDEO_VALIDATOR_DSN", ""),
        endpoint=os.getenv("PUBLIC_VIDEO_MINIO_ENDPOINT", ""),
        access_key=os.getenv("PUBLIC_VIDEO_MINIO_ACCESS_KEY", ""),
        secret_key=os.getenv("PUBLIC_VIDEO_MINIO_SECRET_KEY", ""),
        secure=boolean("MINIO_SECURE", "true"),
        prefixes=tuple(p.strip() for p in os.getenv("PUBLIC_VIDEO_PREFIXES", "").split(",") if p.strip()),
        immutable=boolean("IMMUTABLE_OBJECTS"),
        **values,
    )
