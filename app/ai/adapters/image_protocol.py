"""Protocol response parsing for image-generation adapters.

The functions in this module are deliberately independent of HTTP routes and
connection configuration.  They accept upstream payloads and return the
normalized image reference consumed by the storage layer.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote, urlsplit

from fastapi import HTTPException

# Cloudwise serves these Gemini image models through the native
# ``generateContent`` API only (no OpenAI-compatible image facade).
CLOUDWISE_GEMINI_IMAGE_MODELS = (
    "gemini-3.1-flash-image",
    "gemini-3-pro-image",
)


def is_cloudwise_gemini_image(base_url: Any, model: Any) -> bool:
    """Whether a request must use Cloudwise's native Gemini image endpoint."""
    host = urlsplit(str(base_url or "")).hostname
    return host == "api.cloudwise.ai" and str(model or "").strip().lower() in CLOUDWISE_GEMINI_IMAGE_MODELS


def cloudwise_gemini_image_url(base_url: str, model: str) -> str:
    """Build ``/api/v1beta/models/{model}:generateContent`` from any Cloudwise base URL form."""
    parsed = urlsplit(str(base_url or ""))
    return f"{parsed.scheme}://{parsed.netloc}/api/v1beta/models/{quote(str(model), safe='.-_')}:generateContent"


def gemini_usage(meta: Any) -> dict[str, int]:
    """Translate Gemini ``usageMetadata`` into the OpenAI-style usage used for billing.

    Thinking tokens are billed at the output rate, so they are folded into
    ``completion_tokens``.
    """
    if not isinstance(meta, dict):
        return {}

    def number(value: Any) -> int:
        try:
            return max(0, int(value or 0))
        except (TypeError, ValueError):
            return 0

    prompt = number(meta.get("promptTokenCount"))
    completion = number(meta.get("candidatesTokenCount")) + number(meta.get("thoughtsTokenCount"))
    usage = {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": number(meta.get("totalTokenCount")) or prompt + completion,
    }
    cached = number(meta.get("cachedContentTokenCount"))
    if cached:
        usage["cached_tokens"] = cached
    text = image = 0
    for item in meta.get("promptTokensDetails") or []:
        if not isinstance(item, dict):
            continue
        modality = str(item.get("modality") or "").upper()
        if modality == "TEXT":
            text += number(item.get("tokenCount"))
        elif modality == "IMAGE":
            image += number(item.get("tokenCount"))
    if text or image:
        usage["text_input_tokens"], usage["image_input_tokens"] = text, image
    return usage


def gemini_failure_reason(data: Any) -> str:
    """Explain why a Gemini response carries no image (blocked prompt, safety stop, text-only)."""
    if not isinstance(data, dict):
        return ""
    feedback = data.get("promptFeedback")
    if isinstance(feedback, dict) and feedback.get("blockReason"):
        return f"提示词被拦截（{feedback['blockReason']}）"
    texts: list[str] = []
    for candidate in data.get("candidates") or []:
        if not isinstance(candidate, dict):
            continue
        reason = str(candidate.get("finishReason") or "")
        if reason and reason != "STOP":
            return f"生成被终止（{reason}）"
        content = candidate.get("content")
        for part in (content.get("parts") if isinstance(content, dict) else None) or []:
            if isinstance(part, dict) and part.get("text"):
                texts.append(str(part["text"]))
    return f"模型只返回了文字：{' '.join(texts)[:300]}" if texts else ""


def image_from_value(value: Any) -> dict[str, str] | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.startswith("data:image/") and ";base64," in text:
        header, encoded = text.split(";base64,", 1)
        return {"type": "b64", "value": encoded, "mime_type": header.replace("data:", "", 1) or "image/png"}
    if text.startswith(("http://", "https://")):
        return {"type": "url", "value": text}
    return None


def image_from_inline_payload(value: Any) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    mime_type = value.get("mimeType") or value.get("mime_type") or value.get("type") or value.get("media_type") or ""
    data = value.get("b64_json") or value.get("base64") or value.get("base64_data")
    mime_text = str(mime_type or "").lower()
    if data is None and (
        "mimeType" in value
        or "mime_type" in value
        or "media_type" in value
        or mime_text == "image"
        or mime_text.startswith("image/")
    ):
        data = value.get("data")
    if not isinstance(data, str) or not data.strip():
        return None
    data = data.strip()
    result = image_from_value(data)
    if result:
        return result
    if isinstance(mime_type, str) and mime_type.startswith("image/"):
        return {"type": "b64", "value": data, "mime_type": mime_type}
    return {"type": "b64", "value": data, "mime_type": "image/png"}


def extract_image_deep(value: Any, depth: int = 0) -> dict[str, str] | None:
    if depth > 8 or value is None:
        return None
    result = image_from_value(value) if isinstance(value, str) else None
    if result:
        return result
    if isinstance(value, list):
        for item in value:
            result = extract_image_deep(item, depth + 1)
            if result:
                return result
        return None
    if not isinstance(value, dict):
        return None
    for key in ("inlineData", "inline_data", "image_data"):
        result = image_from_inline_payload(value.get(key))
        if result:
            return result
    result = image_from_inline_payload(value)
    if result:
        return result
    image_url = value.get("image_url")
    if isinstance(image_url, dict):
        result = extract_image_deep(image_url.get("url"), depth + 1)
    elif image_url:
        result = extract_image_deep(image_url, depth + 1)
    else:
        result = None
    if result:
        return result
    file_data = value.get("fileData") or value.get("file_data") or {}
    if isinstance(file_data, dict):
        result = extract_image_deep(
            file_data.get("fileUri") or file_data.get("file_uri") or file_data.get("url"), depth + 1
        )
        if result:
            return result
    for key in (
        "url",
        "uri",
        "src",
        "path",
        "image",
        "images",
        "imageUrl",
        "image_url",
        "output",
        "outputs",
        "output_url",
        "outputUrl",
        "download_url",
        "downloadUrl",
        "data",
        "result",
        "results",
        "content",
        "parts",
        "message",
        "choices",
    ):
        if key in value:
            result = extract_image_deep(value.get(key), depth + 1)
            if result:
                return result
    return None


def _chat_text(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            str(item.get("text") or item.get("content") or "") for item in content if isinstance(item, dict)
        )
    return str(content)


def extract_image_from_chat_response(data: dict[str, Any]) -> dict[str, str]:
    choices = data.get("choices") if isinstance(data, dict) else None
    text = _chat_text(data) if isinstance(data, dict) else ""
    if isinstance(choices, list) and choices:
        message = choices[0].get("message") if isinstance(choices[0], dict) else {}
        result = extract_image_deep(message or {})
        if result:
            return result
        for match in re.findall(
            r"!\[[^\]]*\]\(([^)]+)\)|(data:image/[^\s)\"']+)|(https?://[^\s)\"']+\.(?:png|jpe?g|webp|gif))", text, re.I
        ):
            for candidate in match:
                result = image_from_value(candidate)
                if result:
                    return result
    raise HTTPException(
        status_code=502,
        detail=f"聊天接口没有返回可识别的图片, 完成原因: {choices[0].get('finish_reason') if choices else ''}, 响应文本为: {text}",
    )


def _gemini_candidate_image(data: dict[str, Any]) -> dict[str, str] | None:
    """Pick the final image from a Gemini ``candidates`` payload.

    Thinking-enabled image models (e.g. gemini-3-pro-image) interleave draft
    images flagged ``"thought": true`` before the final image, which is the only
    part at the requested resolution. Prefer the last non-thought image and fall
    back to the last draft only when no final image exists.
    """
    final: dict[str, str] | None = None
    draft: dict[str, str] | None = None
    for candidate in data.get("candidates") or []:
        content = candidate.get("content") or {} if isinstance(candidate, dict) else {}
        parts = content.get("parts") if isinstance(content, dict) else None
        for part in parts or []:
            if not isinstance(part, dict):
                continue
            inline = part.get("inlineData") or part.get("inline_data") or {}
            if not (isinstance(inline, dict) and inline.get("data")):
                continue
            image = {
                "type": "b64",
                "value": inline["data"],
                "mime_type": inline.get("mimeType") or inline.get("mime_type") or "image/png",
            }
            if part.get("thought") is True:
                draft = image
            else:
                final = image
    return final or draft


def extract_image(data: dict[str, Any]) -> dict[str, str]:
    candidates = data.get("candidates") if isinstance(data, dict) else None
    if isinstance(candidates, list):
        image = _gemini_candidate_image(data)
        if image:
            return image
    if isinstance(data.get("data"), dict) and isinstance(data["data"].get("result"), dict):
        data = data["data"]
    if isinstance(data.get("result"), dict):
        images = data["result"].get("images") or []
        if images:
            url = images[0].get("url")
            if isinstance(url, list) and url:
                return {"type": "url", "value": url[0]}
            if isinstance(url, str) and url:
                return {"type": "url", "value": url}
    if isinstance(data.get("data"), dict) and isinstance(data["data"].get("data"), dict):
        data = data["data"]["data"]
    images = data.get("data") or []
    if not isinstance(images, list) or not images:
        raise HTTPException(status_code=502, detail="生图接口没有返回图片数据")
    first = images[0]
    if first.get("url"):
        return {"type": "url", "value": first["url"]}
    if first.get("b64_json"):
        return {"type": "b64", "value": first["b64_json"]}
    raise HTTPException(status_code=502, detail="无法识别生图接口返回格式")


def extract_task_id(data: dict[str, Any]) -> str | None:
    if data.get("task_id"):
        return str(data["task_id"])
    if data.get("id") and str(data.get("id", "")).startswith("task"):
        return str(data["id"])
    nested = data.get("data")
    if isinstance(nested, list) and nested and isinstance(nested[0], dict):
        return extract_task_id(nested[0])
    if isinstance(nested, dict):
        return extract_task_id(nested)
    return None
