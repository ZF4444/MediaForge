"""ComfyUI backend endpoint normalization and URL construction."""
from urllib.parse import urlsplit


def normalize_comfyui_endpoint(value: str) -> str:
    """Return a canonical HTTP(S) base URL for a configured ComfyUI backend.

    Legacy ``host:port`` values are local backends and default to HTTP. A bare
    hostname is treated as a hosted gateway and defaults to HTTPS. Operators
    can always choose explicitly by supplying ``http://`` or ``https://``.
    """
    raw = str(value or "").strip().rstrip("/")
    if not raw:
        raise ValueError("ComfyUI 后端地址不能为空")

    has_scheme = "://" in raw
    parsed = urlsplit(raw if has_scheme else f"//{raw}")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("端口号不合法") from exc
    scheme = parsed.scheme.lower() if has_scheme else ("http" if port is not None else "https")
    if scheme not in {"http", "https"}:
        raise ValueError("仅支持 http:// 或 https:// 地址")
    if not parsed.hostname:
        raise ValueError("地址必须包含主机名")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("地址不能包含账号、查询参数或片段")

    host = parsed.hostname
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    port = f":{port}" if port is not None else ""
    path = parsed.path.rstrip("/")
    return f"{scheme}://{host}{port}{path}"


def comfyui_url(endpoint: str, path: str) -> str:
    """Append an API path to a configured ComfyUI endpoint."""
    return f"{normalize_comfyui_endpoint(endpoint)}/{str(path or '').lstrip('/')}"
