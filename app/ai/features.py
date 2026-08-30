"""Feature flags for incremental AI gateway rollout."""
from __future__ import annotations

import os


def enabled(name: str, *, default: bool = False) -> bool:
    value = os.getenv(str(name), "1" if default else "0").strip().lower()
    return value in {"1", "true", "yes", "on"}


def gateway_enabled(capability: str) -> bool:
    key = "AI_GATEWAY_" + "_".join(str(capability or "").upper().split()) + "_V2"
    return enabled(key)
