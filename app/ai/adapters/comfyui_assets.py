"""ComfyUI asset HTTP transport."""
from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any
import json
import urllib.request
import urllib.parse
import requests


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

    @staticmethod
    def queue_load(endpoint: Callable[[str, str], str], backend: str) -> int:
        with urllib.request.urlopen(endpoint(backend, "/queue"), timeout=1) as response:
            data = json.loads(response.read())
        return len(data.get("queue_running", [])) + len(data.get("queue_pending", []))

    @staticmethod
    def input_exists(endpoint: Callable[[str, str], str], backend: str, filename: str) -> bool:
        query = urllib.parse.urlencode({"filename": filename, "type": "input"})
        try:
            with urllib.request.urlopen(endpoint(backend, f"/view?{query}"), timeout=1) as response:
                return response.status == 200
        except Exception:
            return False

    @staticmethod
    def upload_sync(endpoint: Callable[[str, str], str], backend: str, filename: str, content: bytes, content_type: str = "application/octet-stream") -> bool:
        try:
            response = requests.post(endpoint(backend, "/upload/image"), files={"image": (filename, content, content_type)}, timeout=10)
            return response.status_code == 200
        except Exception:
            return False

    @staticmethod
    def download_sync(endpoint: Callable[[str, str], str], backend: str, filename: str, *, kind: str = "input") -> tuple[bytes, str] | None:
        try:
            query = urllib.parse.urlencode({"filename": filename, "type": kind})
            response = requests.get(endpoint(backend, f"/view?{query}"), timeout=5)
            if response.status_code != 200:
                return None
            return response.content, response.headers.get("Content-Type", "application/octet-stream")
        except Exception:
            return None
