"""Cross-process delivery for durable Canvas Agent events."""
from __future__ import annotations

import asyncio
import contextlib
import json
from typing import Any

from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import RedisError

from app.config import CLIENT_ID, REDIS_AGENT_EVENT_CHANNEL
from app.core.logging import get_logger
from app.core.redis_client import RedisUnavailableError, get_redis_client
from app.core.ws import ConnectionManager

logger = get_logger("agent_event_pubsub")


async def publish_agent_event(payload: dict[str, Any]) -> None:
    message = json.dumps({"origin": CLIENT_ID, "payload": payload}, separators=(",", ":"), ensure_ascii=False)
    await get_redis_client().publish(REDIS_AGENT_EVENT_CHANNEL, message)


async def _listen_once(manager: ConnectionManager) -> None:
    pubsub = get_redis_client().pubsub()
    try:
        await pubsub.subscribe(REDIS_AGENT_EVENT_CHANNEL)
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                envelope = json.loads(message.get("data") or "{}")
                payload = envelope.get("payload")
                if isinstance(payload, dict):
                    await manager.deliver_remote_event("agent.event.v1", payload)
            except (TypeError, ValueError):
                logger.warning("ignored malformed agent event", extra={"event": "agent_event_pubsub_malformed"})
    finally:
        with contextlib.suppress(Exception):
            await pubsub.aclose()


async def agent_event_pubsub_loop(manager: ConnectionManager) -> None:
    while True:
        try:
            await _listen_once(manager)
        except asyncio.CancelledError:
            raise
        except (RedisConnectionError, RedisError, RedisUnavailableError):
            logger.warning("agent event subscriber reconnecting", extra={"event": "agent_event_pubsub_reconnecting"})
            await asyncio.sleep(3)
        except Exception:
            logger.exception("agent event subscriber failed", extra={"event": "agent_event_pubsub_failed"})
            await asyncio.sleep(3)
