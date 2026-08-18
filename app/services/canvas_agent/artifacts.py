"""Doc Chain artifact stages, Anchor normalization and deterministic prompts."""
from __future__ import annotations

from typing import Any

ARTIFACT_STAGES = ("brief", "creative_direction", "script", "asset_anchors", "shot_list", "prompt_pack")
ANCHOR_TYPES = ("characters", "scenes", "props", "style", "sound")
STAGE_SOURCES = {
    "creative_direction": ("brief",), "script": ("brief", "creative_direction"),
    "asset_anchors": ("script",), "shot_list": ("script", "asset_anchors"),
    "prompt_pack": ("shot_list", "asset_anchors"),
}

def validate_stage(stage: str) -> str:
    value = str(stage or "").strip().lower()
    if value not in ARTIFACT_STAGES: raise ValueError(f"unsupported artifact stage: {stage}")
    return value

def normalize_anchors(content: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for anchor_type in ANCHOR_TYPES:
        items = content.get(anchor_type, []) if isinstance(content, dict) else []
        if isinstance(items, dict): items = [items]
        result[anchor_type] = [{"id": str(item.get("id") or f"{anchor_type}_{index + 1}"), "name": str(item.get("name") or item.get("title") or f"{anchor_type}_{index + 1}"), **{k: v for k, v in item.items() if k not in {"id", "name", "title"}}} for index, item in enumerate(items or []) if isinstance(item, dict)]
    return result

def compile_prompt(*, shot: dict[str, Any], anchors: dict[str, Any] | None = None) -> dict[str, Any]:
    normalized = normalize_anchors(anchors or {})
    sections = []
    for key in ANCHOR_TYPES:
        values = normalized[key]
        if values: sections.append(f"{key}: " + "; ".join(" ".join(f"{field}={value}" for field, value in item.items() if value not in (None, "", [])) for item in values))
    description = str(shot.get("description") or shot.get("prompt") or shot.get("content") or "")
    prompt = description if not sections else description + "\n\n" + "\n".join(sections)
    return {"prompt": prompt.strip(), "shot_id": shot.get("id", ""), "anchor_types": [key for key in ANCHOR_TYPES if normalized[key]], "source_anchor_ids": [item["id"] for key in ANCHOR_TYPES for item in normalized[key]]}
