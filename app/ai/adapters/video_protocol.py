"""Protocol-neutral video response and status helpers."""
from __future__ import annotations

from typing import Any


def api_root(base_url: str, protocol: str) -> str:
    root = str(base_url or "").rstrip("/")
    if protocol == "volcengine" and root.endswith("/api/v3"):
        return root[:-7]
    if protocol != "volcengine" and (root.endswith("/v1") or root.endswith("/v2")):
        return root.rsplit("/", 1)[0]
    return root


def submit_url_candidates(base_url: str, protocol: str) -> list[str]:
    root = api_root(base_url, protocol)
    if protocol == "volcengine":
        return [f"{root}/api/v3/contents/generations/tasks"]
    return [f"{root}/v1/videos/generations", f"{root}/v2/videos/generations"]


def task_url_candidates(base_url: str, protocol: str, task_id: str, submit_url: str = "") -> list[str]:
    root = api_root(base_url, protocol)
    if protocol == "volcengine":
        return [f"{root}/api/v3/contents/generations/tasks/{task_id}"]
    v1 = f"{root}/v1/videos/generations/{task_id}"
    generic = f"{root}/v1/tasks/{task_id}"
    v2 = f"{root}/v2/videos/generations/{task_id}"
    return [v2, v1, generic] if "/v2/videos/generations" in str(submit_url or "") else [v1, generic, v2]

VIDEO_URL_KEYS = (
    "url", "video_url", "videoUrl", "mp4_url", "mp4Url", "output", "output_url", "outputUrl",
    "download_url", "downloadUrl", "video", "src", "uri", "preview_url", "previewUrl", "path",
    "last_frame_url", "lastFrameUrl",
)
VIDEO_TASK_SUCCESS_STATUSES = {"SUCCESS", "SUCCEED", "SUCCEEDED", "COMPLETED", "COMPLETE", "DONE", "FINISHED", "FINISH", "OK", "READY"}
VIDEO_TASK_FAILURE_STATUSES = {"FAILURE", "FAILED", "FAIL", "ERROR", "ERRORED", "CANCELED", "CANCELLED", "TIMEOUT", "TIMEDOUT", "REJECTED", "EXPIRED"}


def _collect_video_url(value: Any, urls: list[str]) -> None:
    if not value:
        return
    if isinstance(value, str):
        if value.startswith(("http://", "https://", "/api/files/")):
            urls.append(value)
        return
    if isinstance(value, list):
        for item in value:
            _collect_video_url(item, urls)
        return
    if isinstance(value, dict):
        for key in ("videos", "outputs", "data", "result", "content"):
            if key in value:
                _collect_video_url(value[key], urls)
        for key in VIDEO_URL_KEYS:
            if key in value:
                _collect_video_url(value[key], urls)


def video_output_urls(raw: Any) -> list[str]:
    if not isinstance(raw, dict):
        return []
    urls: list[str] = []
    candidates: list[dict[str, Any]] = [raw]
    for key in ("data", "content"):
        value = raw.get(key)
        if isinstance(value, dict):
            candidates.append(value)
        elif isinstance(value, list):
            candidates.extend(item for item in value if isinstance(item, dict))
    for node in list(candidates):
        result = node.get("result")
        if isinstance(result, dict):
            candidates.append(result)
        elif isinstance(result, list):
            candidates.extend(item for item in result if isinstance(item, dict))
    for node in candidates:
        for key in ("videos", "outputs", "content", *VIDEO_URL_KEYS):
            if key in node:
                _collect_video_url(node[key], urls)
    return list(dict.fromkeys(urls))


def humanize_video_task_failure(reason: Any) -> str:
    text = str(reason or "").strip()
    upper = text.upper()
    if "PROMINENT_PEOPLE" in upper:
        return f"视频生成被上游内容安全策略拦截：检测到知名人物或真人面孔（错误码：{text}）。请更换提示词或参考图。"
    if any(token in upper for token in ("SAFETY", "CONTENT_FILTER", "POLICY")):
        return f"视频生成被上游内容安全策略拦截（错误码：{text}）。请调整提示词或参考图。"
    return f"视频生成任务失败：{text}"


def volcengine_generation_body(*, model: str, prompt: str, duration: int, ratio: str = "", resolution: str = "", content: list[dict[str, Any]] | None = None, seed: Any = None, generate_audio: bool = False) -> dict[str, Any]:
    """Build Ark/Volcengine content-generation request payload."""
    body: dict[str, Any] = {"model": model, "content": [{"type": "text", "text": prompt}]}
    body["duration"] = duration
    if ratio:
        body["ratio"] = ratio
    if resolution:
        body["resolution"] = resolution
    if content:
        body["content"].extend(content)
    if seed is not None:
        body["seed"] = seed
    if generate_audio:
        body["generate_audio"] = True
    return body
