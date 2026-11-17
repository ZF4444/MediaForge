"""Shared API/Worker issuing service. All business authorization precedes signing."""

from datetime import datetime, timezone

from .config import Denied
from .contracts import new_token


class Service:
    def __init__(self, settings, repository, reader, authorize):
        self.settings = settings
        self.repo = repository
        self.reader = reader
        self.authorize = authorize

    async def bind(self, owner, file_id, task_id, provider_id):
        import asyncio

        self.settings.require_writer()
        entry = await self.authorize(owner, file_id, task_id, provider_id)
        snapshot = await self.reader.run(self.reader.snapshot, entry)
        retention = entry.get("expires_at")
        retention = datetime.fromtimestamp(retention / 1000, timezone.utc) if retention else None
        if retention and retention <= datetime.now(timezone.utc):
            raise Denied("素材已过期")
        source = dict(
            snapshot,
            owner_id=owner,
            file_id=file_id,
            task_id=task_id,
            provider_id=provider_id,
            retention_until=retention,
        )
        row = await asyncio.to_thread(self.repo.create_source, source)
        return {"id": row["id"], "file_id": file_id, "task_id": task_id, "provider_id": provider_id}

    async def issue(self, owner, source_id, key, ttl=None, rotate=False, encryption_key=""):
        import asyncio

        self.settings.require_writer()
        source = await asyncio.to_thread(self.repo.source, source_id)
        if not source or source["owner_id"] != owner:
            raise Denied("对象绑定不可用")
        entry = await self.authorize(owner, source["file_id"], source["task_id"], source["provider_id"])
        retention = entry.get("expires_at")
        current_retention = datetime.fromtimestamp(retention / 1000, timezone.utc) if retention else None
        if current_retention != source.get("retention_until"):
            raise Denied("素材保留期限已变化，请创建新任务重新绑定")
        await self.reader.run(self.reader.verify, source)
        ttl = ttl or self.settings.ttl
        if ttl > self.settings.max_ttl:
            raise Denied("链接有效期超过允许范围")
        token, digest = new_token()
        grant = await asyncio.to_thread(
            self.repo.issue,
            source_id,
            owner,
            digest,
            key,
            ttl,
            rotate,
            token if encryption_key else None,
            encryption_key,
        )
        return {**grant, "url": self.url(grant["id"], source["ext"], token)}

    def url(self, grant_id, ext, token):
        return f"{self.settings.base_url}/fetch/v1/{grant_id}/video.{ext}?token={token}"
