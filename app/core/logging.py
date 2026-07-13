"""Structured logging configuration and domain-specific logger helpers."""

from __future__ import annotations

import gzip
import hashlib
import json
import logging
import os
import re
import shutil
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from typing import Any, Mapping

from app.config import BASE_DIR
from app.core.log_context import get_log_context


_ROOT_LOGGER = "aistudio"
_STANDARD_RECORD_FIELDS = set(logging.makeLogRecord({}).__dict__) | {
    "message", "asctime", "event"
}
_SENSITIVE_KEY = re.compile(
    r"(?:authorization|cookie|password|passwd|secret|api[_-]?key|access[_-]?key|token|session|credential)",
    re.IGNORECASE,
)
_BEARER = re.compile(r"(?i)\b(bearer\s+)([^\s,;]+)")
_SECRET_ASSIGNMENT = re.compile(
    r"(?i)\b(api[_ -]?key|access[_ -]?key|secret(?:[_ -]?key)?|token|authorization|cookie)"
    r"([\"']?\s*[:=]\s*[\"']?|\s+)([^\s,;\}\]\"']+)"
)
_PATH_KEY = re.compile(r"(?:file|local|directory|folder|filesystem)[_-]?path", re.IGNORECASE)
_ABSOLUTE_PRIVATE_PATH = re.compile(r"(?<!:)/(?:home|root|tmp|var|srv|opt)/[^\s\"']+")
_configured = False


def _masked(value: Any) -> str:
    text = str(value or "")
    if len(text) <= 8:
        return "***"
    return f"{text[:4]}***{text[-4:]}"


def _safe_path(value: str) -> str:
    if not os.path.isabs(value):
        return value
    try:
        relative = os.path.relpath(value, BASE_DIR)
        if relative != ".." and not relative.startswith(f"..{os.sep}"):
            return relative
    except ValueError:
        pass
    return os.path.basename(value)


def redact(value: Any, key: str = "") -> Any:
    """Return a JSON-safe value with credentials and sensitive paths removed."""
    if _SENSITIVE_KEY.search(str(key)):
        return _masked(value)
    if isinstance(value, Mapping):
        return {str(k): redact(v, str(k)) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [redact(item) for item in value]
    if isinstance(value, Path):
        return _safe_path(str(value))
    if isinstance(value, BaseException):
        return f"{type(value).__name__}: {redact(str(value))}"
    if isinstance(value, str):
        text = _safe_path(value) if _PATH_KEY.search(str(key)) and os.path.isabs(value) else value
        text = _ABSOLUTE_PRIVATE_PATH.sub(lambda match: _safe_path(match.group(0)), text)
        text = _BEARER.sub(lambda match: match.group(1) + _masked(match.group(2)), text)
        return _SECRET_ASSIGNMENT.sub(
            lambda match: f"{match.group(1)}{match.group(2)}{_masked(match.group(3))}", text
        )
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return redact(str(value))


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        context = get_log_context()
        extras = {
            key: value
            for key, value in record.__dict__.items()
            if key not in _STANDARD_RECORD_FIELDS and not key.startswith("_")
        }
        event = getattr(record, "event", None) or "log_message"
        payload: dict[str, Any] = {
            "ts": datetime.now().astimezone().isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "event": event,
            "message": record.getMessage(),
            **context,
        }
        payload.update(extras)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(redact(payload), ensure_ascii=False, separators=(",", ":"))


class _DomainFilter(logging.Filter):
    def __init__(self, domain: str):
        super().__init__()
        self.prefix = f"{_ROOT_LOGGER}.{domain}"

    def filter(self, record: logging.LogRecord) -> bool:
        return record.name == self.prefix or record.name.startswith(f"{self.prefix}.")


def _gzip_rotator(source: str, destination: str) -> None:
    with open(source, "rb") as source_file, gzip.open(destination, "wb") as target_file:
        shutil.copyfileobj(source_file, target_file)
    os.remove(source)


def _file_handler(log_dir: Path, name: str, retention_days: int) -> TimedRotatingFileHandler:
    handler = TimedRotatingFileHandler(
        log_dir / f"{name}.log",
        when="midnight",
        interval=1,
        backupCount=max(1, retention_days),
        encoding="utf-8",
        utc=False,
        delay=True,
    )
    handler.setFormatter(JsonFormatter())
    handler.namer = lambda filename: f"{filename}.gz"
    handler.rotator = _gzip_rotator
    return handler


def configure_logging() -> None:
    global _configured
    if _configured:
        return

    log_dir = Path(os.getenv("LOG_DIR", os.path.join(BASE_DIR, "logs"))).expanduser()
    log_dir.mkdir(parents=True, exist_ok=True)
    level_name = os.getenv("LOG_LEVEL", "INFO").strip().upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger(_ROOT_LOGGER)
    root.setLevel(level)
    root.propagate = False
    root.handlers.clear()

    retention = {
        "app": int(os.getenv("LOG_APP_RETENTION_DAYS", "15")),
        "access": int(os.getenv("LOG_ACCESS_RETENTION_DAYS", "15")),
        "audit": int(os.getenv("LOG_AUDIT_RETENTION_DAYS", "180")),
        "task": int(os.getenv("LOG_TASK_RETENTION_DAYS", "30")),
    }
    for domain, days in retention.items():
        handler = _file_handler(log_dir, domain, days)
        handler.addFilter(_DomainFilter(domain))
        root.addHandler(handler)

    error_handler = _file_handler(
        log_dir, "error", int(os.getenv("LOG_ERROR_RETENTION_DAYS", "30"))
    )
    error_handler.setLevel(logging.ERROR)
    root.addHandler(error_handler)

    if os.getenv("LOG_STDOUT", "true").strip().lower() in {"1", "true", "yes", "on"}:
        stream = logging.StreamHandler()
        stream.setLevel(level)
        stream.setFormatter(JsonFormatter())
        stream.addFilter(_DomainFilter("app"))
        root.addHandler(stream)

    logging.getLogger("uvicorn.access").disabled = True
    _configured = True


def get_logger(name: str) -> logging.Logger:
    configure_logging()
    return logging.getLogger(f"{_ROOT_LOGGER}.app.{name.strip('.')}")


def get_access_logger() -> logging.Logger:
    configure_logging()
    return logging.getLogger(f"{_ROOT_LOGGER}.access")


def get_audit_logger() -> logging.Logger:
    configure_logging()
    return logging.getLogger(f"{_ROOT_LOGGER}.audit")


def get_task_logger(name: str = "worker") -> logging.Logger:
    configure_logging()
    return logging.getLogger(f"{_ROOT_LOGGER}.task.{name.strip('.')}")


def audit_event(
    event: str,
    *,
    action: str,
    resource_type: str,
    resource_id: Any = None,
    result: str = "success",
    message: str | None = None,
    **fields: Any,
) -> None:
    get_audit_logger().info(
        message or event.replace("_", " "),
        extra={
            "event": event,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "result": result,
            **fields,
        },
    )


def prompt_summary(prompt: str) -> dict[str, Any]:
    text = str(prompt or "")
    return {
        "length": len(text),
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest()[:16] if text else None,
    }
