"""Deterministic Doc Chain stage advancement and dependency checks."""
from __future__ import annotations
from typing import Any
from .artifacts import STAGE_SOURCES, validate_stage

def validate_stage_sources(target_stage: str, sources: list[dict[str, Any]]) -> None:
    stage = validate_stage(target_stage)
    required = set(STAGE_SOURCES.get(stage, ()))
    available = {str(item.get("type")) for item in sources if item.get("status") == "approved" and not item.get("stale")}
    missing = sorted(required - available)
    if missing: raise ValueError(f"阶段 {stage} 缺少已批准且有效的来源: {', '.join(missing)}")

def stage_sources(target_stage: str) -> tuple[str, ...]:
    return tuple(STAGE_SOURCES.get(validate_stage(target_stage), ()))
