"""ComfyUI asset HTTP transport."""
from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any


class ComfyUIAssetTransport:
    def __init__(self, *, endpoint: Callable[[str, str], str], client: Any):
        self._endpoint = endpoint
        self._client = client

    async def view(self, backend: str, filename: str, *, kind: str = "input", subfolder: str = ""):
        response = await self._client.get(self._endpoint(backend, "/view"), params={"filename": filename, "type": kind, "subfolder": subfolder}, timeout=1)
        return response

    async def upload(self, backend: str, filename: str, content: bytes, content_type: str = "application/octet-stream", *, overwrite: bool = False):
        data = {"overwrite": "true", "type": "input"} if overwrite else None
        return await self._client.post(self._endpoint(backend, "/upload/image"), data=data, files={"image": (filename, content, content_type)}, timeout=30 if overwrite else 5)

    async def download(self, backend: str, filename: str, *, kind: str = "output", subfolder: str = "", timeout: float = 30) -> tuple[bytes, str]:
        response = await self._client.get(self._endpoint(backend, "/view"), params={"filename": filename, "subfolder": subfolder, "type": kind}, timeout=timeout)
        response.raise_for_status()
        return response.content, response.headers.get("content-type", "application/octet-stream")
