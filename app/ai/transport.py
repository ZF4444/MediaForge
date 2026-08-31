"""Protocol-neutral transport metadata derived from canonical AI connections."""
from __future__ import annotations

import re
import urllib.parse
from typing import Mapping, Any

from app.ai.domain import ResolvedTarget
from app.services.connection_secrets import get_connection_secret


_GEMINI_IMAGE_RATIOS = (
    (1, 1, "1:1"), (16, 9, "16:9"), (9, 16, "9:16"),
    (4, 3, "4:3"), (3, 4, "3:4"), (3, 2, "3:2"), (2, 3, "2:3"),
    (5, 4, "5:4"), (4, 5, "4:5"),
)


def gemini_image_options(size: str) -> dict[str, str]:
    """Translate a pixel size into Gemini image aspect and resolution options."""
    raw = str(size or "").strip().upper()
    match = re.match(r"^\s*(\d+)\s*[Xx:]\s*(\d+)\s*$", str(size or ""))
    if not match:
        return {"aspectRatio": "1:1", "imageSize": raw if raw in {"1K", "2K", "4K"} else "1K"}
    width, height = int(match.group(1)), int(match.group(2))
    ratio = width / max(1, height)
    _rw, _rh, aspect = min(_GEMINI_IMAGE_RATIOS, key=lambda item: abs(ratio - item[0] / item[1]))
    longest = max(width, height)
    return {"aspectRatio": aspect, "imageSize": "4K" if longest > 3000 else "2K" if longest > 1500 else "1K"}


def endpoint_for_target(target: ResolvedTarget, operation: str = "chat") -> str:
    connection = target.connection
    root = str(connection.base_url or "").rstrip("/")
    if not root:
        raise ValueError("AI connection has no Base URL")
    settings = dict(connection.settings or {})
    override = str(settings.get(f"{operation}_endpoint") or "").strip()
    if override.startswith("http://") or override.startswith("https://"):
        return override.rstrip("/")
    if override:
        return f"{root}{override if override.startswith('/') else '/' + override}"
    if operation == "chat":
        suffix = "/v1beta" if target.protocol == "gemini" else "/api/v3" if target.protocol == "volcengine" else "/v1"
        return root if root.endswith(suffix) else f"{root}{suffix}"
    return root


def headers_for_target(target: ResolvedTarget, *, json_body: bool = True) -> Mapping[str, str]:
    secret = get_connection_secret(target.connection.id, "api_key")
    if not secret:
        raise ValueError("AI connection has no API key")
    if target.protocol == "gemini":
        headers = {"Accept": "application/json", "x-goog-api-key": secret}
    else:
        headers = {"Accept": "application/json", "Authorization": f"Bearer {secret}"}
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers


def endpoint_for_connection(connection: Mapping[str, Any] | None, key: str, default_path: str, *, fallback_base: str = "") -> str:
    """Resolve an endpoint from a canonical connection view.

    This helper accepts only connection metadata; it does not infer a target
    from a provider registry. It is used by protocol adapters during the
    incremental migration of legacy route handlers.
    """
    item = connection or {}
    base_url = str(item.get("base_url") or fallback_base).strip().rstrip("/")
    protocol = str(item.get("protocol") or "").strip().lower()
    if protocol == "openai" and "api.cloudwise.ai" in base_url.lower() and re.match(r"^https?://api\.cloudwise\.ai$", base_url, re.I):
        base_url = f"{base_url}/api/v1"
    cloudwise_root = "api.cloudwise.ai" in base_url.lower()
    override = str(item.get(key) or "").strip()
    if override:
        if re.match(r"^https?://", override, re.I):
            return override.rstrip("/")
        parsed = urllib.parse.urlsplit(base_url)
        if parsed.scheme and parsed.netloc:
            if "api.cloudwise.ai" in base_url.lower() and base_url.endswith("/api/v1") and override.startswith("/v1/"):
                return f"{base_url}{override[len('/v1'):]}"
            if "api.cloudwise.ai" in base_url.lower() and override.startswith("/v1/") and not base_url.endswith("/api/v1"):
                return f"{parsed.scheme}://{parsed.netloc}/api{override}"
            return f"{parsed.scheme}://{parsed.netloc}{override if override.startswith('/') else '/' + override}"
        return override
    for prefix in ("/api/v1", "/api/v3", "/v1beta", "/v1", "/v2"):
        if base_url.endswith(prefix) and default_path.startswith(f"{prefix}/"):
            return f"{base_url}{default_path[len(prefix):]}"
    if cloudwise_root and default_path.startswith("/v1/") and not base_url.endswith("/api/v1"):
        return f"{base_url}/api{default_path}"
    return f"{base_url}{default_path}"


def headers_for_connection(connection: Mapping[str, Any] | None, *, json_body: bool = True, api_key: str = "", idempotency_key: str = "") -> Mapping[str, str]:
    item = connection or {}
    secret = str(api_key or item.get("api_key") or "").strip()
    if not secret:
        raise ValueError("AI connection has no API key")
    if str(item.get("protocol") or "").strip().lower() == "gemini":
        headers: dict[str, str] = {"Accept": "application/json", "x-goog-api-key": secret}
    else:
        headers = {"Accept": "application/json", "Authorization": f"Bearer {secret}"}
    if json_body:
        headers["Content-Type"] = "application/json"
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    return headers


def models_endpoint(base_url: str, protocol: str) -> str:
    root = str(base_url or "").rstrip("/")
    protocol = str(protocol or "openai").strip().lower()
    if protocol == "gemini":
        return f"{root}/models" if root.endswith("/v1beta") else f"{root}/v1beta/models"
    if protocol == "volcengine":
        return f"{root}/models" if root.endswith("/api/v3") else f"{root}/api/v3/models"
    if protocol == "runninghub":
        return f"{root}/openapi/v2/models"
    return f"{root}/models" if root.endswith("/v1") else f"{root}/v1/models"


def model_headers(api_key: str, protocol: str) -> Mapping[str, str]:
    key = str(api_key or "").strip()
    protocol = str(protocol or "openai").strip().lower()
    if protocol == "gemini":
        return {"x-goog-api-key": key, "Accept": "application/json"}
    if protocol == "runninghub":
        return {"Authorization": re.sub(r"^Bearer\s+", "", key, flags=re.IGNORECASE), "Accept": "application/json"}
    return {"Authorization": f"Bearer {key}", "Accept": "application/json"}


def classify_model(model: str) -> str:
    value = str(model or "").lower()
    if any(key in value for key in ("veo", "sora", "wan2", "wanx", "seedance", "kling", "hailuo", "video", "t2v-", "i2v-", "s2v")):
        return "video"
    if any(key in value for key in ("banana", "image", "dalle", "dall-e", "imagen", "flux", "stable", "sdxl", "midjourney", "ideogram", "fal-ai", "z-image", "qwen-image", "klein", "seedream", "text-to-image", "image-to-image")):
        return "image"
    return "chat"


def parse_models_payload(raw: Any, protocol: str = "openai") -> tuple[dict[str, list[str]], list[str]]:
    items = raw.get("data") if isinstance(raw, dict) else None
    if not items and isinstance(raw, dict):
        items = raw.get("models") or raw.get("list") or []
    if not isinstance(items, list):
        items = []
    ids: list[str] = []
    for item in items:
        model = item if isinstance(item, str) else item.get("id") or item.get("name") or item.get("model") if isinstance(item, dict) else ""
        if model:
            value = str(model)
            if protocol == "gemini" and value.startswith("models/"):
                value = value[len("models/"):]
            ids.append(value)
    ids = sorted(set(ids))
    grouped = {"image": [], "chat": [], "video": []}
    for model in ids:
        grouped[classify_model(model)].append(model)
    return grouped, ids
