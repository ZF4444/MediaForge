"""Retry generated-video downloads without resubmitting generation or billing."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

import httpx

from app.core.logging import get_logger

logger = get_logger("media")


def _retryable(error: httpx.HTTPError) -> bool:
    if isinstance(error, httpx.HTTPStatusError):
        status = error.response.status_code
        # Signed URLs can expire or point at files that are not yet available.
        return status in {401, 403, 404, 408, 410, 425, 429} or status >= 500
    return isinstance(error, httpx.RequestError)


async def download_generated_videos(
    result: Mapping[str, Any],
    *,
    task_id: str | None,
    output_urls: Callable[[Mapping[str, Any]], list[str]],
    download: Callable[[str], Awaitable[str]],
    query_task: Callable[[str], Awaitable[Mapping[str, Any]]],
) -> tuple[list[str], Mapping[str, Any]]:
    """Try each video at most three times, refreshing task links before retries.

    Keep successful downloads when a later video fails. Querying the original
    task only retrieves results; generation submission and billing stay outside
    this function. Storage/quota failures are deliberately not retried.
    """
    urls = output_urls(result)
    local_urls: list[str] = []
    latest_result = result
    for index in range(len(urls)):
        for attempt in range(3):
            try:
                local_urls.append(await download(urls[index]))
                break
            except httpx.HTTPError as exc:
                if attempt == 2 or not _retryable(exc):
                    raise
                logger.warning(
                    "retrying generated video download",
                    extra={
                        "event": "video_download_retry",
                        "upstream_task_id": task_id or "",
                        "attempt": attempt + 2,
                        "status_code": exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None,
                    },
                )
                await asyncio.sleep(2 ** (attempt + 1))
                if task_id:
                    try:
                        refreshed = await query_task(task_id)
                        refreshed_urls = output_urls(refreshed)
                        # Match by position only while the output count agrees.
                        if len(refreshed_urls) == len(urls):
                            urls = refreshed_urls
                            latest_result = refreshed
                    except (httpx.HTTPError, ValueError) as query_error:
                        logger.warning(
                            "video link refresh failed; retrying existing link",
                            extra={
                                "event": "video_download_refresh_failed",
                                "upstream_task_id": task_id,
                                "error_type": type(query_error).__name__,
                            },
                        )
    return local_urls, latest_result
