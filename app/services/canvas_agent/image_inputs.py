"""Resolve API image inputs from the current, owned canvas snapshot."""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any
from urllib.parse import urlsplit

from app.ai.domain import ResolvedTarget
from app.ai.image_registry import select_target_image_adapter
from app.services.canvas_agent.canvas_context import _connection_endpoints
from app.services.storage import file_preview_url, resolve_file_reference


def image_input_contract(target: ResolvedTarget) -> dict[str, Any]:
    """Describe transport support, rather than promise upstream model support."""
    try:
        adapter = select_target_image_adapter(target)
    except LookupError:
        adapter = ""
    limit = {"openai": 4, "volcengine": 4, "gemini": 16, "omnilojo": 16, "cloudwise_gemini": 14}.get(adapter, 0)
    return {"supported": bool(limit), "max_images": limit, "scope": "transport"}


def canvas_image_inputs(canvas: dict[str, Any], node: dict[str, Any], user_id: str) -> list[dict[str, Any]]:
    """Resolve explicit input edges in canvas order, respecting blocked images.

    Own outputs and historical runInputRefs are not implicit inputs. Resolve
    original files afresh; an empty or missing image source must not silently
    turn an image-to-image request into a text-to-image request.
    """
    nodes = {str(item.get("id")): item for item in canvas.get("nodes", []) if isinstance(item, dict)}
    source_ids = list(node.get("inputNodeIds") or [])
    for connection in canvas.get("connections") or []:
        source, destination = _connection_endpoints(connection)
        if destination == node["id"] and connection.get("kind") == "input":
            source_ids.append(source)
    blocked = set(node.get("blockedInputRefs") or [])
    seen_sources: set[str] = set()
    seen_images: set[str] = set()
    refs: list[dict[str, Any]] = []
    for source_id in source_ids:
        if source_id in seen_sources:
            continue
        seen_sources.add(source_id)
        source = nodes.get(source_id)
        if source is None or source_id == node["id"]:
            raise ValueError(f"参考图片节点不存在或不能引用自身：{source_id}")
        if source.get("type") == "smart-prompt":
            continue
        images = source.get("images") or []
        if not images:
            raise ValueError(f"参考图片节点尚无图片：{source_id}")
        for index, image in enumerate(images):
            if not isinstance(image, dict):
                raise ValueError(f"参考图片格式无效：{source_id}[{index}]")
            url = str(image.get("url") or "").strip()
            file_id = str(image.get("file_id") or "").strip()
            if f"{source_id}|{index}" in blocked or (url and f"url|{url}" in blocked):
                continue
            if not (url or file_id):
                raise ValueError(f"参考图片缺少原图地址：{source_id}[{index}]")
            entry = resolve_file_reference(url=url, file_id=file_id, allow_register=False)
            if entry:
                if (
                    str(entry.get("user_id") or "") != user_id
                    or entry.get("deleted_at") is not None
                    or entry.get("status") == "deleted"
                ):
                    raise PermissionError("参考图片不存在或无权访问")
                file_id = str(entry.get("file_id") or file_id)
                url = file_preview_url(file_id)
            elif file_id or urlsplit(url).path.startswith("/api/files/"):
                raise ValueError("参考图片文件已失效")
            kind = str((entry or {}).get("kind") or image.get("kind") or "").lower()
            mime = str(
                (entry or {}).get("content_type")
                or (entry or {}).get("mime")
                or (entry or {}).get("mime_type")
                or image.get("mime")
                or ""
            ).lower()
            suffix = PurePosixPath(urlsplit(url).path).suffix.lower()
            if (
                kind in {"video", "audio", "file"}
                or (mime and mime != "application/octet-stream" and not mime.startswith("image/"))
                or suffix in {".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg", ".pdf", ".zip"}
            ):
                raise ValueError("AI 图生图仅接受图片参考素材")
            key = file_id or url
            if key in seen_images:
                continue
            seen_images.add(key)
            refs.append(
                {
                    "file_id": file_id,
                    "url": url,
                    "name": str(image.get("name") or source.get("title") or f"图{len(refs) + 1}"),
                    "role": f"image_{len(refs) + 1}",
                    "kind": "image",
                    "mime": mime,
                }
            )
    if (
        source_ids
        and seen_sources
        and not refs
        and any(nodes.get(s, {}).get("type") != "smart-prompt" for s in seen_sources)
    ):
        raise ValueError("参考图片已全部排除，请选择图片后重试")
    return refs
