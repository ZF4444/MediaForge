"""Redis Pub/Sub bridge for user-scoped WebSocket events."""

from __future__ import annotations

import asyncio
import contextlib
import json
from typing import Any

from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import RedisError

from app.config import CLIENT_ID, REDIS_WEBSOCKET_CHANNEL
from app.core.logging import get_logger
from app.core.redis_client import RedisUnavailableError, get_redis_client
from app.core.ws import ConnectionManager


logger = get_logger("websocket_pubsub")


async def publish_websocket_event(event: str, payload: dict[str, Any]) -> None:
    message = json.dumps({"origin": CLIENT_ID, "event": event, "payload": payload}, separators=(",", ":"))
    try:
        await get_redis_client().publish(REDIS_WEBSOCKET_CHANNEL, message)
    except (RedisError, RedisUnavailableError):
        logger.exception("websocket event publish failed", extra={"event": "websocket_pubsub_publish_failed", "message_type": event})


async def _listen_once(manager: ConnectionManager) -> None:
    pubsub = get_redis_client().pubsub()
    try:
        await pubsub.subscribe(REDIS_WEBSOCKET_CHANNEL)
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                envelope = json.loads(message.get("data") or "{}")
                if envelope.get("origin") == CLIENT_ID:
                    continue
                event = str(envelope.get("event") or "")
                payload = envelope.get("payload")
                if event and isinstance(payload, dict):
                    await manager.deliver_remote_event(event, payload)
            except (TypeError, ValueError):
                logger.warning("ignored malformed websocket pubsub event", extra={"event": "websocket_pubsub_malformed"})
            except Exception:
                logger.exception("websocket pubsub event delivery failed", extra={"event": "websocket_pubsub_delivery_failed"})
    finally:
        with contextlib.suppress(Exception):
            await pubsub.aclose()


async def websocket_pubsub_loop(manager: ConnectionManager) -> None:
    """Keep the subscription alive across transient Redis connection failures."""
    while True:
        try:
            await _listen_once(manager)
        except asyncio.CancelledError:
            raise
        except RedisConnectionError:
            # A dropped Redis socket is recoverable: _listen_once creates a new
            # Pub/Sub connection on the next iteration.
            logger.warning(
                "websocket pubsub connection lost; reconnecting",
                extra={"event": "websocket_pubsub_reconnecting"},
            )
            await asyncio.sleep(3)
        except Exception:
            logger.exception("websocket pubsub listener failed", extra={"event": "websocket_pubsub_listener_failed"})
            await asyncio.sleep(3)
