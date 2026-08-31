"""OpenAI Images protocol execution for canonical image commands."""
from __future__ import annotations

import os
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

import httpx
from fastapi import HTTPException

from app.ai.adapters.openai import OpenAIImageAdapter
from app.ai.adapters.image_protocol import extract_image, extract_task_id
from app.ai.registry import ImageGenerationRequest


class OpenAIImagesExecutor:
    """Execute Images generations/edits without depending on HTTP routes."""

    protocol = "openai_images"

    def __init__(self, *, endpoint: Callable[[Mapping[str, Any], str, str], str], headers: Callable[..., Mapping[str, str]], api_key: Callable[[str], Awaitable[str]], resolve_file: Callable[[str], Awaitable[str | None]], to_data_url: Callable[[Any], Awaitable[str]], content_type: Callable[[str], str], is_cloudwise: Callable[[Mapping[str, Any]], bool], unsupported: Callable[[Any], bool], wait_task: Callable[[Any, str, Mapping[str, Any]], Awaitable[Any]], client_factory: Callable[..., Any], timeout: Any, long_timeout: Any):
        self._endpoint, self._headers, self._api_key = endpoint, headers, api_key
        self._resolve_file, self._to_data_url = resolve_file, to_data_url
        self._content_type, self._is_cloudwise = content_type, is_cloudwise
        self._unsupported, self._wait_task = unsupported, wait_task
        self._client_factory, self._timeout, self._long_timeout = client_factory, timeout, long_timeout

    async def generate(self, request: ImageGenerationRequest) -> tuple[dict[str, str], dict[str, Any]]:
        target = request.target
        if target is None:
            raise ValueError("image adapter requests require a resolved target")
        connection: Mapping[str, Any] = {"id": target.connection.id, "connection_id": target.connection.id, "base_url": target.connection.base_url, **dict(target.connection.settings or {})}
        model = request.model
        if not model:
            raise ValueError("image request requires an upstream model")
        gen_url = self._endpoint(connection, "image_generation_endpoint", "/v1/images/generations")
        edit_url = self._endpoint(connection, "image_edit_endpoint", "/v1/images/edits")
        image_refs, mask_refs = OpenAIImageAdapter.split_references(request.reference_images)
        key = await self._api_key(target.connection.id)
        is_gpt2 = str(model).lower().startswith("gpt-image-2") or str(model).lower() == "gptimage2"
        quality = str(request.quality or "").lower() if str(request.quality or "").lower() in {"low", "medium", "high"} else ""
        timeout = self._long_timeout if is_gpt2 else self._timeout

        async with self._client_factory(timeout=timeout) as client:
            async def post_edits(files=None):
                data = OpenAIImageAdapter.edit_fields(model=model, prompt=request.prompt, size=request.size, quality=quality, gpt_image_2=is_gpt2)
                return await client.post(edit_url, headers=dict(self._headers(connection=connection, model=model, api_key=key, json_body=False)), data=data, files=files if files is not None else {})

            response = None
            if is_gpt2 and not image_refs and not mask_refs:
                body = OpenAIImageAdapter.generation_body(model=model, prompt=request.prompt, size=request.size, quality=quality, gpt_image_2=True)
                response = await client.post(gen_url, headers=dict(self._headers(connection=connection, model=model, api_key=key)), json=body)
                if response.status_code >= 400 and self._unsupported(response):
                    response = await post_edits()
            elif image_refs:
                files, opened = [], []
                try:
                    for ref in image_refs[:4]:
                        path = await self._resolve_file(str(ref.get("url") or ""))
                        if not path:
                            continue
                        handle = open(path, "rb")
                        opened.append(handle)
                        field = "image[]" if self._is_cloudwise(connection) else "image"
                        files.append((field, (os.path.basename(path), handle, self._content_type(path))))
                    if mask_refs:
                        path = await self._resolve_file(str(mask_refs[0].get("url") or ""))
                        if path:
                            handle = open(path, "rb")
                            opened.append(handle)
                            files.append(("mask", (os.path.basename(path), handle, self._content_type(path))))
                    try:
                        response = await post_edits(files)
                    except httpx.HTTPError:
                        response = None
                finally:
                    for handle in opened:
                        handle.close()
                if response is None or response.status_code >= 400:
                    if is_gpt2:
                        raise HTTPException(status_code=502, detail="GPT-Image-2 编辑接口调用失败")
                    payload = [await self._to_data_url(ref) for ref in image_refs[:4]]
                    body = OpenAIImageAdapter.generation_body(model=model, prompt=request.prompt, size=request.size, quality=quality, image=payload)
                    response = await client.post(gen_url, headers=dict(self._headers(connection=connection, model=model, api_key=key)), json=body)
            else:
                body = OpenAIImageAdapter.generation_body(model=model, prompt=request.prompt, size=request.size, quality=quality)
                response = await client.post(gen_url, headers=dict(self._headers(connection=connection, model=model, api_key=key)), json=body)
                if response.status_code >= 400 and self._unsupported(response):
                    response = await post_edits()
            response.raise_for_status()
            raw = response.json()
            try:
                return extract_image(raw), raw
            except HTTPException:
                task_id = extract_task_id(raw)
                if not task_id:
                    raise
            result = await self._wait_task(client, task_id, connection)
            return extract_image(result), result
