"""Business-only adapter; gateway must never import this module."""

import asyncio
import os
from datetime import datetime, timezone
from functools import lru_cache
from urllib.parse import urlsplit

from .config import Denied, load_settings
from .contracts import internal_file_id
from .repository import Repository
from .service import Service
from .storage_reader import StorageReader


def origins():
    return tuple(
        x.rstrip("/")
        for x in (
            os.getenv("PUBLIC_BASE_URL", ""),
            os.getenv("PUBLIC_MEDIA_BASE_URL", ""),
            *os.getenv("PUBLIC_VIDEO_INTERNAL_ORIGINS", "").split(","),
        )
        if x
    )


async def authorize(owner, file_id, task_id, provider_id):
    from app.ai.authorization import require_model_access
    from app.ai.database_repository import DatabaseAIRepository
    from app.core.auth import user_exists
    from app.services.canvas_tasks import get_canvas_task
    from app.services.storage import get_file_by_id

    if not owner or not await asyncio.to_thread(user_exists, owner):
        raise Denied("用户不可用")
    task = await get_canvas_task(task_id)
    request = (task or {}).get("request") or {}
    if not task or task.get("owner_id") != owner or task.get("status") not in ("queued", "running"):
        raise Denied("需要属于当前用户的有效任务")
    if str(task.get("connection_id") or request.get("connection_id") or "") != provider_id:
        raise Denied("任务与供应商不匹配")
    refs = request.get("videos") or []
    if file_id not in {internal_file_id(str(ref), origins()) for ref in refs if isinstance(ref, str)}:
        raise Denied("视频不在任务输入中")
    entry = await asyncio.to_thread(get_file_by_id, file_id)
    if not entry or entry.get("user_id") != owner or entry.get("status") == "deleted":
        raise Denied("仅允许外发本人拥有且明确许可的视频")

    def check_provider():
        repo = DatabaseAIRepository()
        if task.get("kind") == "media_asset_registration":
            if not any(c.id == provider_id for c in repo.connections()):
                raise Denied("供应商不可用")
        else:
            target = repo.resolve_model(
                model_id=str(task.get("model_id") or request.get("model_id") or ""),
                connection_id=provider_id,
                kind="video",
            )
            if not target.connection.enabled or not target.model.enabled or target.connection.id != provider_id:
                raise Denied("模型不可用")
            require_model_access(target, owner)
            for settings in (target.connection.settings, target.model.settings):
                limit = settings.get("max_reference_video_bytes")
                if limit is not None and (int(limit) < 1 or int(entry.get("size") or 0) > int(limit)):
                    raise Denied("参考视频超过模型允许的大小")

    await asyncio.to_thread(check_provider)
    return entry


@lru_cache(maxsize=1)
def get_service():
    settings = load_settings()
    settings.require_writer()
    return Service(settings, Repository(settings.writer_dsn, settings.pool_size), StorageReader(settings), authorize)


def close_service():
    if get_service.cache_info().currsize:
        service = get_service()
        service.repo.close()
        service.reader.close()
        get_service.cache_clear()


async def reference_url(value, owner, task_id, provider_id):
    """Only transforms recognized internal references; never stores URLs in tasks."""
    file_id = internal_file_id(str(value), origins())
    if not file_id:
        parsed = urlsplit(str(value))
        if str(value).startswith("/api/files/") or (
            f"{parsed.scheme}://{parsed.netloc}" in origins() and parsed.path.startswith("/api/files/")
        ):
            raise Denied("内部视频引用格式无效")
        if parsed.scheme == "asset" and parsed.netloc:
            return value
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise Denied("参考视频必须是已授权的内部文件、公网 URL 或 Asset ID")
        return value
    service = get_service()
    if not task_id:
        raise Denied("本地视频外发需要持久任务上下文")
    await authorize(owner, file_id, task_id, provider_id)
    key = os.getenv("APP_SECRET_KEY", "")
    if len(key) < 16:
        raise Denied("任务交付加密密钥未配置")
    old = await asyncio.to_thread(service.repo.existing_delivery, task_id, provider_id, file_id, key)
    if old:
        if old["submission_state"] != "prepared":
            raise Denied("上游已提交或提交结果未知，请查询原任务，禁止重复提交")
        if not old["token"] or old["expires_at"] <= datetime.now(timezone.utc):
            raise Denied("原交付链接已到期，请创建新任务")
        source = await service.bind(owner, file_id, task_id, provider_id)
        row = await asyncio.to_thread(service.repo.source, source["id"])
        return service.url(old["id"], row["ext"], old["token"])
    source = await service.bind(owner, file_id, task_id, provider_id)
    result = await service.issue(owner, source["id"], "worker:" + task_id, encryption_key=key)
    return result["url"]
