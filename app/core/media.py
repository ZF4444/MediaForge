"""媒体路径/URL 公共工具。

从 main.py 原样迁移的本地媒体路径解析器，被多个功能域（素材库、生成、上传等）
复用。单独成模块以避免 router 之间循环导入。

依赖：app.config 的路径常量。
"""
import os
import urllib.parse

from app.config import (
    ASSETS_DIR,
    OUTPUT_DIR,
    OUTPUT_INPUT_DIR,
    OUTPUT_OUTPUT_DIR,
)


def output_storage(category="output"):
    return (OUTPUT_INPUT_DIR, "input") if category == "input" else (OUTPUT_OUTPUT_DIR, "output")


def output_url_for(filename, category="output"):
    _, subdir = output_storage(category)
    return f"/assets/{subdir}/{filename}"


def output_path_for(filename, category="output"):
    folder, _ = output_storage(category)
    return os.path.join(folder, filename)


def output_file_from_url(url):
    if isinstance(url, dict):
        url = url.get("url", "")
    if not url or not (url.startswith("/output/") or url.startswith("/assets/")):
        return None
    clean = urllib.parse.unquote(url.split("?", 1)[0]).replace("\\", "/")
    if clean.startswith("/assets/"):
        root = ASSETS_DIR
        rel = clean[len("/assets/"):]
    else:
        root = OUTPUT_DIR
        rel = clean[len("/output/"):]
    rel = rel.lstrip("/")
    if not rel:
        return None
    path = os.path.abspath(os.path.join(root, rel))
    output_root = os.path.abspath(root)
    if os.path.commonpath([output_root, path]) != output_root or not os.path.exists(path):
        return None
    return path


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
