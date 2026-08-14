"""Bounded exponential-backoff helpers for transient dependency failures."""

from __future__ import annotations

import random
import uuid

from app.config import (
    TRANSIENT_RETRY_BASE_DELAY_SECONDS,
    TRANSIENT_RETRY_JITTER_SECONDS,
    TRANSIENT_RETRY_MAX_ATTEMPTS,
    TRANSIENT_RETRY_MAX_DELAY_SECONDS,
)
from app.core.log_context import get_log_context


def retry_max_attempts() -> int:
    return max(1, min(int(TRANSIENT_RETRY_MAX_ATTEMPTS or 1), 5))


def retry_delay_seconds(failed_attempt: int) -> float:
    base = max(0.0, float(TRANSIENT_RETRY_BASE_DELAY_SECONDS or 0))
    maximum = max(base, float(TRANSIENT_RETRY_MAX_DELAY_SECONDS or base))
    jitter = max(0.0, float(TRANSIENT_RETRY_JITTER_SECONDS or 0))
    exponential = min(maximum, base * (2 ** max(0, int(failed_attempt) - 1)))
    return exponential + (random.uniform(0, jitter) if jitter else 0.0)


def retry_operation_id(prefix: str) -> str:
    context = get_log_context()
    request_id = str(context.get("request_id") or "").strip()
    task_id = str(context.get("task_id") or "").strip()
    # Background workers do not have an HTTP request ID. Their durable task ID
    # is the correct idempotency scope across worker restarts and retries.
    return request_id or task_id or f"{prefix}_{uuid.uuid4().hex}"
