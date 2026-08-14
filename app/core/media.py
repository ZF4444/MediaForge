"""Media helpers backed by MinIO file references."""
import os
import urllib.parse
import uuid

from app.core.logging import get_logger


logger = get_logger("media")


def output_file_from_url(url):
    if isinstance(url, dict):
        url = url.get("url", "")
    if not url:
        return None
    if not url.startswith("/api/files/"):
        return None
    try:
        from app.services.storage import materialize_media_url
        return materialize_media_url(url)
    except Exception:
        return None


def content_type_for_path(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in [".mp4", ".m4v"]:
        return "video/mp4"
    if ext == ".webm":
        return "video/webm"
    if ext == ".mov":
        return "video/quicktime"
    if ext == ".mp3":
        return "audio/mpeg"
    if ext == ".wav":
        return "audio/wav"
    if ext == ".m4a":
        return "audio/mp4"
    if ext == ".aac":
        return "audio/aac"
    if ext == ".ogg":
        return "audio/ogg"
    if ext == ".flac":
        return "audio/flac"
    if ext == ".gif":
        return "image/gif"
    if ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    if ext == ".txt":
        return "text/plain; charset=utf-8"
    if ext == ".json":
        return "application/json; charset=utf-8"
    if ext == ".csv":
        return "text/csv; charset=utf-8"
    if ext == ".md":
        return "text/markdown; charset=utf-8"
    if ext == ".srt":
        return "application/x-subrip; charset=utf-8"
    if ext == ".vtt":
        return "text/vtt; charset=utf-8"
    if ext == ".png":
        return "image/png"
    return "application/octet-stream"


# --- 文件名/远程下载/本地导入等媒体工具（从 main.py 原样迁移，多域复用） ---
import re
import urllib.request

import requests
from fastapi import HTTPException
from PIL import Image

from app.config import LOCAL_IMAGE_IMPORT_EXTS, LOCAL_IMAGE_IMPORT_MAX_BYTES


def sanitize_export_filename(name: str, fallback: str) -> str:
    base = os.path.basename(str(name or "").strip()) or fallback
    base = re.sub(r'[\\/:*?"<>|]+', "_", base)
    return base or fallback


def local_media_file_by_basename(name: str):
    safe = os.path.basename(urllib.parse.unquote(str(name or "")))
    if not safe:
        return None
    try:
        from app.services.storage import materialize_media_url, media_entry_by_basename
    except Exception:
        return None
    entry = media_entry_by_basename(safe, categories={"input", "uploads", "output", "library"})
    if entry:
        try:
            return materialize_media_url(entry.get("url") or "")
        except Exception:
            return None
    return None


def filename_from_media_url(url: str, fallback: str = "download.bin") -> str:
    path = urllib.parse.urlsplit(str(url or "")).path
    name = os.path.basename(urllib.parse.unquote(path))
    return sanitize_export_filename(name or fallback, fallback)


def fetch_remote_media_bytes(url: str, timeout: float = 30.0, max_bytes: int = 200 * 1024 * 1024):
    text = str(url or "").strip()
    parsed = urllib.parse.urlparse(text)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    with requests.get(text, stream=True, timeout=timeout, headers={"User-Agent": "ComfyUI-API-Modelscope/1.0"}) as response:
        response.raise_for_status()
        content_type = response.headers.get("content-type") or "application/octet-stream"
        chunks = []
        total = 0
        for chunk in response.iter_content(chunk_size=1024 * 256):
            if not chunk:
                continue
            total += len(chunk)
            if total > max_bytes:
                raise HTTPException(status_code=413, detail="文件太大，无法下载")
            chunks.append(chunk)
        return b"".join(chunks), content_type


def origin_from_url(value):
    parsed = urllib.parse.urlparse(str(value or ""))
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}".lower()


def ensure_same_origin_request(request):
    host = str(request.headers.get("host") or "").lower()
    # Support reverse proxy: prefer X-Forwarded-Proto/Host
    scheme = (
        str(request.headers.get("x-forwarded-proto") or "").lower()
        or request.url.scheme
    )
    fwd_host = str(request.headers.get("x-forwarded-host") or "").lower() or host
    expected = f"{scheme}://{fwd_host}".lower() if fwd_host else ""
    origin = origin_from_url(request.headers.get("origin", ""))
    referer = origin_from_url(request.headers.get("referer", ""))
    actual = origin or referer
    if not actual:
        return  # Allow requests without Origin/Referer (e.g. same-origin navigations)
    if expected and actual != expected:
        raise HTTPException(status_code=403, detail="只允许从当前页面导入本地图片")


def normalize_local_image_path(value):
    text = str(value or "").strip().strip('"').strip("'")
    if not text:
        raise HTTPException(status_code=400, detail="本地图片路径为空")
    if text.lower().startswith("file:"):
        parsed = urllib.parse.urlparse(text)
        if parsed.scheme.lower() != "file":
            raise HTTPException(status_code=400, detail="只支持本地图片路径")
        if parsed.netloc and re.match(r"^[a-zA-Z]:$", parsed.netloc) and os.name == "nt":
            path = f"{parsed.netloc}{urllib.request.url2pathname(parsed.path or '')}"
        elif parsed.netloc and parsed.netloc.lower() not in ("localhost",):
            raise HTTPException(status_code=400, detail="只支持本机图片路径")
        else:
            path = urllib.request.url2pathname(parsed.path or "")
    else:
        path = text
    path = path.strip().strip('"').strip("'")
    if re.match(r"^/[a-zA-Z]:[\\/]", path):
        path = path[1:]
    if re.match(r"^[a-zA-Z]:[\\/]", path):
        return os.path.abspath(path)
    if path.startswith("/") and os.name != "nt":
        return os.path.abspath(path)
    raise HTTPException(status_code=400, detail="只支持本机绝对图片路径")


def import_local_image_file(path):
    ext = os.path.splitext(path)[1].lower()
    if ext not in LOCAL_IMAGE_IMPORT_EXTS:
        raise HTTPException(status_code=400, detail="仅支持 PNG、JPG、JPEG、WEBP、GIF 图片")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="本地图片不存在或无法读取")
    try:
        size = os.path.getsize(path)
    except OSError:
        raise HTTPException(status_code=404, detail="本地图片不存在或无法读取")
    if size <= 0:
        raise HTTPException(status_code=400, detail="本地图片为空")
    if size > LOCAL_IMAGE_IMPORT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="本地图片过大，请使用 50MB 以内的图片")
    try:
        with Image.open(path) as img:
            img.verify()
    except Exception:
        raise HTTPException(status_code=400, detail="文件不是可识别的图片")
    filename = f"ai_ref_{uuid.uuid4().hex[:12]}{ext}"
    display_name = os.path.basename(path) or filename
    try:
        with open(path, "rb") as f:
            stored = save_media_bytes(
                "input",
                filename,
                f.read(),
                original_name=display_name,
                content_type=content_type_for_path(path),
                kind="image",
                source="imported",
            )
    except OSError:
        raise HTTPException(status_code=500, detail="导入本地图片失败")
    return {
        "url": stored["url"],
        "file_id": stored.get("file_id", ""),
        "name": display_name,
        "kind": "image",
    }


# --- 上游图片/视频写入 MinIO（生成域与即梦域复用） ---
import base64

import httpx

from app.config import VIDEO_POLL_TIMEOUT
from app.core.http_client import shared_http_client
from app.core.outbound import validate_external_http_url
from app.core.storage_io import run_storage_io
from app.services.storage import normalize_media_ref, save_media_bytes


async def save_ai_image_to_output(image_data, prefix="online_", category="output"):
    filename = f"{prefix}{uuid.uuid4().hex[:10]}.png"
    if image_data["type"] == "b64":
        mime_type = str(image_data.get("mime_type") or "").lower()
        if "jpeg" in mime_type or "jpg" in mime_type:
            filename = filename[:-4] + ".jpg"
        elif "webp" in mime_type:
            filename = filename[:-4] + ".webp"
        payload = base64.b64decode(image_data["value"])
        stored = await run_storage_io(
            save_media_bytes,
            category,
            filename,
            payload,
            original_name=filename,
            content_type=mime_type or content_type_for_path(filename),
            kind="image",
            source="generated",
        )
        return stored["url"]
    value = image_data["value"]
    if value.startswith("/api/files/"):
        ref = await run_storage_io(normalize_media_ref, {"url": value})
        return ref.get("url") or value
    if value.startswith("/output/") or value.startswith("/assets/"):
        raise RuntimeError("本地媒体 URL 已停用；请使用 MinIO file_id")
    try:
        timeout = httpx.Timeout(connect=20.0, read=300.0, write=60.0, pool=20.0)
        async with shared_http_client(timeout=timeout) as client:
            response = await client.get(validate_external_http_url(value, label="生成结果地址"))
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "")
            if "jpeg" in content_type or "jpg" in content_type:
                filename = filename[:-4] + ".jpg"
            elif "webp" in content_type:
                filename = filename[:-4] + ".webp"
            stored = await run_storage_io(
                save_media_bytes,
                category,
                filename,
                response.content,
                original_name=filename,
                content_type=content_type,
                kind="image",
                source="generated",
            )
            return stored["url"]
    except Exception:
        logger.exception(
            "failed to persist remote image",
            extra={"event": "remote_image_save_failed", "provider": "remote", "operation": "download"},
        )
        raise


async def save_remote_video_to_output(url, prefix="video_", category="output"):
    if not url:
        return ""
    if url.startswith("/api/files/"):
        ref = await run_storage_io(normalize_media_ref, {"url": url})
        return ref.get("url") or url
    if url.startswith("/output/") or url.startswith("/assets/"):
        raise RuntimeError("本地媒体 URL 已停用；请使用 MinIO file_id")
    filename = f"{prefix}{uuid.uuid4().hex[:10]}.mp4"
    try:
        async with shared_http_client(timeout=VIDEO_POLL_TIMEOUT) as client:
            response = await client.get(url)
            response.raise_for_status()
            content_type = (response.headers.get("Content-Type") or "").lower()
            clean_path = urllib.parse.urlparse(url).path
            ext = os.path.splitext(clean_path)[1].lower()
            if ext in {".mp4", ".webm", ".mov"}:
                filename = filename[:-4] + ext
            elif "webm" in content_type:
                filename = filename[:-4] + ".webm"
            elif "quicktime" in content_type or "mov" in content_type:
                filename = filename[:-4] + ".mov"
            stored = await run_storage_io(
                save_media_bytes,
                category,
                filename,
                response.content,
                original_name=filename,
                content_type=content_type or "video/mp4",
                kind="video",
                source="generated",
            )
            return stored["url"]
    except Exception:
        logger.exception(
            "failed to persist remote video",
            extra={"event": "remote_video_save_failed", "provider": "remote", "operation": "download"},
        )
        raise
