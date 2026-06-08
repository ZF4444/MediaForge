"""本地素材 / 上传路由（部分）。

从 main.py 的「本地素材导入 / 上传」区块原样迁移可独立的路由。URL/模型/状态码完全一致。
注意：以下路由因依赖运行期 ComfyUI 实例列表或云上传 helper（跨域）暂留 main.py：
- GET /api/view、POST /api/upload（依赖 COMFYUI_INSTANCES 运行期可变全局）
- POST /api/temp-sh/upload、POST /api/cloud-video/upload（依赖 upload_local_video_to_cloud 云上传集群）

依赖：
- app.config：LOCAL_UPLOAD_DIR
- app.core.media：output_path_for/output_url_for/output_file_from_url/content_type_for_path/
  local_media_file_by_basename/filename_from_media_url/fetch_remote_media_bytes/
  sanitize_export_filename/ensure_same_origin_request/normalize_local_image_path/import_local_image_file
- app.models：LocalImageImportRequest
"""
import os
import re
import urllib.parse
import uuid
from typing import List

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response

from app.config import LOCAL_UPLOAD_DIR
from app.core.media import (
    content_type_for_path,
    ensure_same_origin_request,
    fetch_remote_media_bytes,
    filename_from_media_url,
    import_local_image_file,
    local_media_file_by_basename,
    normalize_local_image_path,
    output_path_for,
    output_url_for,
    output_file_from_url,
    sanitize_export_filename,
)
from app.models import LocalImageImportRequest

router = APIRouter()


@router.get("/api/download-output")
def download_output(url: str, name: str = "", inline: bool = False):
    path = output_file_from_url(url)
    if not path:
        path = local_media_file_by_basename(filename_from_media_url(url, ""))
    if path:
        filename = sanitize_export_filename(os.path.basename(name) if name else os.path.basename(path), os.path.basename(path))
        return FileResponse(path, media_type=content_type_for_path(path), filename=None if inline else filename)
    try:
        remote = fetch_remote_media_bytes(url)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"远程文件下载失败：{exc}")
    if not remote:
        raise HTTPException(status_code=404, detail="文件不存在")
    content, content_type = remote
    fallback = filename_from_media_url(url, "download.bin")
    filename = sanitize_export_filename(os.path.basename(name) if name else fallback, fallback)
    disposition = "inline" if inline else "attachment"
    headers = {"Content-Disposition": f"{disposition}; filename*=UTF-8''{urllib.parse.quote(filename)}"}
    return Response(content, media_type=content_type, headers=headers)


@router.post("/api/ai/upload")
async def upload_ai_reference(files: List[UploadFile] = File(...)):
    uploaded = []
    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    video_exts = {".mp4", ".webm", ".mov", ".m4v"}
    audio_exts = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
    for file in files:
        content = await file.read()
        if not content:
            continue
        ext = os.path.splitext(file.filename or "")[1].lower()
        content_type = (file.content_type or "").lower()
        kind = "image"
        if ext in video_exts or content_type.startswith("video/"):
            kind = "video"
            if ext not in video_exts:
                ext = ".webm" if "webm" in content_type else ".mov" if "quicktime" in content_type else ".mp4"
        elif ext in audio_exts or content_type.startswith("audio/"):
            kind = "audio"
            if ext not in audio_exts:
                ext = ".wav" if "wav" in content_type else ".ogg" if "ogg" in content_type else ".m4a" if "mp4" in content_type else ".mp3"
        elif ext in image_exts or content_type.startswith("image/"):
            kind = "image"
            if ext not in image_exts:
                ext = ".jpg" if "jpeg" in content_type else ".webp" if "webp" in content_type else ".gif" if "gif" in content_type else ".png"
        else:
            continue
        filename = f"ai_ref_{uuid.uuid4().hex[:12]}{ext}"
        path = output_path_for(filename, "input")
        with open(path, "wb") as f:
            f.write(content)
        uploaded.append({"url": output_url_for(filename, "input"), "name": file.filename or filename, "kind": kind})
    return {"files": uploaded}


def _local_upload_kind_ext(filename, content_type):
    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    video_exts = {".mp4", ".webm", ".mov", ".m4v"}
    audio_exts = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
    ext = os.path.splitext(filename or "")[1].lower()
    ct = (content_type or "").lower()
    if ext in video_exts or ct.startswith("video/"):
        if ext not in video_exts:
            ext = ".webm" if "webm" in ct else ".mov" if "quicktime" in ct else ".mp4"
        return "video", ext
    if ext in audio_exts or ct.startswith("audio/"):
        if ext not in audio_exts:
            ext = ".wav" if "wav" in ct else ".ogg" if "ogg" in ct else ".m4a" if "mp4" in ct else ".mp3"
        return "audio", ext
    if ext in image_exts or ct.startswith("image/"):
        if ext not in image_exts:
            ext = ".jpg" if "jpeg" in ct else ".webp" if "webp" in ct else ".gif" if "gif" in ct else ".png"
        return "image", ext
    return None, ext


def _local_upload_display_name(filename):
    # 文件名形如 up_<hex>_<原始名>；去掉前缀还原展示名
    m = re.match(r"^up_[0-9a-f]{12}_(.+)$", filename)
    return m.group(1) if m else filename


def _local_upload_item(filename):
    path = os.path.join(LOCAL_UPLOAD_DIR, filename)
    try:
        stat = os.stat(path)
        size = stat.st_size
        created_at = stat.st_mtime
    except OSError:
        size = 0
        created_at = 0
    kind, _ = _local_upload_kind_ext(filename, "")
    return {
        "id": filename,
        "file": filename,
        "name": _local_upload_display_name(filename),
        "url": f"/assets/uploads/{filename}",
        "kind": kind or "image",
        "size": size,
        "created_at": created_at,
    }


@router.post("/api/local-assets/upload")
async def upload_local_assets(files: List[UploadFile] = File(...)):
    uploaded = []
    for file in files:
        content = await file.read()
        if not content:
            continue
        kind, ext = _local_upload_kind_ext(file.filename, file.content_type)
        if kind is None:
            continue
        base = os.path.splitext(os.path.basename(file.filename or "file"))[0]
        base = re.sub(r"[^0-9A-Za-z一-鿿._-]+", "_", base).strip("_") or "file"
        base = base[:60]
        filename = f"up_{uuid.uuid4().hex[:12]}_{base}{ext}"
        path = os.path.join(LOCAL_UPLOAD_DIR, filename)
        with open(path, "wb") as f:
            f.write(content)
        uploaded.append(_local_upload_item(filename))
    return {"files": uploaded}


@router.get("/api/local-assets")
async def list_local_assets():
    try:
        names = os.listdir(LOCAL_UPLOAD_DIR)
    except OSError:
        names = []
    items = []
    for name in names:
        if name.startswith("."):
            continue
        if not os.path.isfile(os.path.join(LOCAL_UPLOAD_DIR, name)):
            continue
        items.append(_local_upload_item(name))
    items.sort(key=lambda it: it.get("created_at") or 0, reverse=True)
    return {"items": items}


@router.post("/api/local-assets/delete")
async def delete_local_assets(payload: dict, request: Request):
    ensure_same_origin_request(request)
    names = payload.get("names") if isinstance(payload, dict) else None
    if not isinstance(names, list):
        names = []
    deleted = []
    for name in names:
        name = os.path.basename(str(name or "").strip())
        if not name:
            continue
        path = os.path.join(LOCAL_UPLOAD_DIR, name)
        if os.path.isfile(path):
            try:
                os.remove(path)
                deleted.append(name)
            except OSError:
                pass
    return {"deleted": deleted}


@router.post("/api/ai/import-local-image")
async def import_local_ai_reference(payload: LocalImageImportRequest, request: Request):
    ensure_same_origin_request(request)
    requested = [payload.path] if payload.path else []
    requested.extend(payload.paths or [])
    requested = [p for p in requested if str(p or "").strip()][:20]
    if not requested:
        raise HTTPException(status_code=400, detail="没有可导入的本地图片")
    return {"files": [import_local_image_file(normalize_local_image_path(path)) for path in requested]}
