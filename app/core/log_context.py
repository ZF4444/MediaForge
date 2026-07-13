"""Context local fields shared by application, access, audit, and task logs."""

from __future__ import annotations

import contextvars
from typing import Any


_DEFAULTS = {
    "request_id": None,
    "trace_id": None,
    "user_id": None,
    "username": None,
    "task_id": None,
}

_context: contextvars.ContextVar[dict[str, Any]] = contextvars.ContextVar(
    "log_context", default=_DEFAULTS
)


def get_log_context() -> dict[str, Any]:
    return dict(_context.get())


def set_log_context(**fields: Any) -> contextvars.Token:
    values = dict(_DEFAULTS)
    values.update({key: value for key, value in fields.items() if key in values})
    return _context.set(values)


def bind_log_context(**fields: Any) -> None:
    values = get_log_context()
    values.update({key: value for key, value in fields.items() if key in values})
    _context.set(values)


def reset_log_context(token: contextvars.Token) -> None:
    _context.reset(token)
