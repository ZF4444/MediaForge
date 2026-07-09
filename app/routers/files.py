"""File access routes backed by file_id."""

import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.media import content_type_for_path
from app.services.storage import get_file_by_id, materialize_media_url

router = APIRouter()


def _materialized_path(file_id: str):
    entry = get_file_by_id(file_id)
    if not entry:
        raise HTTPException(status_code=404, detail="文件不存在")
    path = materialize_media_url(entry.get("url") or "")
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="文件不存在")
    return entry, path


@router.get("/api/files/{file_id}")
async def get_file_meta(file_id: str):
    entry = get_file_by_id(file_id)
    if not entry:
        raise HTTPException(status_code=404, detail="文件不存在")
    return {
        "file_id": entry.get("file_id"),
        "name": entry.get("original_name") or entry.get("filename") or "",
        "kind": entry.get("kind") or "",
        "mime_type": entry.get("content_type") or "application/octet-stream",
        "size": entry.get("size") or 0,
        "preview_url": entry.get("url") or "",
        "download_url": entry.get("download_url") or "",
    }


@router.get("/api/files/{file_id}/preview")
async def preview_file(file_id: str):
    _, path = _materialized_path(file_id)
    return FileResponse(path, media_type=content_type_for_path(path))


@router.get("/api/files/{file_id}/download")
async def download_file(file_id: str):
    entry, path = _materialized_path(file_id)
    filename = entry.get("original_name") or entry.get("filename") or os.path.basename(path)
    return FileResponse(path, media_type=content_type_for_path(path), filename=filename)
