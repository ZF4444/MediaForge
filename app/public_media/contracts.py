"""Opaque capabilities and strictly recognized internal references."""

import hashlib
import re
import secrets
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field

ID = re.compile(r"^[0-9a-f]{32}$")
TOKEN = re.compile(r"^[A-Za-z0-9_-]{43}$")
MIME = {"mp4": "video/mp4", "mov": "video/quicktime"}
CAPABILITY_URL = re.compile(r"https?://[^\s\"'<>]+/fetch/v1/[0-9a-f]{32}/video\.(?:mp4|mov)\?token=[A-Za-z0-9_-]+")


def scrub(value, secrets=()):
    if isinstance(value, str):
        value = CAPABILITY_URL.sub("[private-video-link]", value)
        # Suppliers can reflect an encoded URL or just its token. The submitting
        # call keeps its own secrets in memory only and scrubs those exact bytes.
        for secret in secrets:
            if secret:
                value = value.replace(secret, "[private-video-token]")
        return value
    if isinstance(value, dict):
        return {scrub(key, secrets): scrub(item, secrets) for key, item in value.items()}
    if isinstance(value, list):
        return [scrub(item, secrets) for item in value]
    return value


def new_token():
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode("ascii")).hexdigest()


def token_digest(token):
    if not TOKEN.fullmatch(token):
        return None
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def internal_file_id(value: str, origins=()) -> str | None:
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in origins:
            return None
    match = re.fullmatch(r"/api/files/([A-Za-z0-9_-]{1,128})(?:/(?:preview|download))?", parsed.path)
    if not match or parsed.query or parsed.fragment:
        return None
    return match[1]


class SourceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    file_id: str = Field(min_length=1, max_length=128)
    task_id: str = Field(min_length=1, max_length=128)
    provider_id: str = Field(min_length=1, max_length=128)


class GrantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    idempotency_key: str = Field(min_length=8, max_length=128)
    rotate: bool = False
    ttl_seconds: int | None = Field(default=None, ge=1)


class BatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: str = Field(pattern="^(task|file)$")
    key: str = Field(min_length=1, max_length=128)


class PolicyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: str = Field(pattern="^(global|task|file)$")
    key: str = Field(min_length=1, max_length=128)
    enabled: bool
    daily_bytes: int = Field(default=34359738368, ge=1, le=1099511627776)
    active_bytes: int = Field(default=2147483648, ge=1, le=1099511627776)
