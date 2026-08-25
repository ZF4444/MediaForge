"""Cross-process invalidation for non-secret provider configuration caches."""

from __future__ import annotations

import asyncio
import contextlib
import inspect
import json
from collections.abc import Callable

from redis.exceptions import NoPermissionError
from redis.exceptions import RedisError

from app.config import CLIENT_ID, PROVIDER_CONFIG_CACHE_REFRESH_SECONDS, REDIS_PROVIDER_CONFIG_CHANNEL
from app.core.logging import get_logger
from app.core.redis_client import RedisUnavailableError, get_redis_client


logger = get_logger("provider_config_events")


async def _refresh_cache(refresh: Callable[[], object]) -> None:
    if inspect.iscoroutinefunction(refresh):
        await refresh()
    else:
        await asyncio.to_thread(refresh)


async def publish_provider_config_changed() -> None:
    """Publish only an invalidation marker; credentials never enter Redis Pub/Sub."""
    try:
        message = json.dumps({"origin": CLIENT_ID, "event": "providers_changed"}, separators=(",", ":"))
        await get_redis_client().publish(REDIS_PROVIDER_CONFIG_CHANNEL, message)
    except (RedisError, RedisUnavailableError):
        logger.exception("provider config invalidation publish failed", extra={"event": "provider_config_publish_failed"})


async def _listen_once(refresh: Callable[[], object]) -> None:
    pubsub = get_redis_client().pubsub()
    try:
        await pubsub.subscribe(REDIS_PROVIDER_CONFIG_CHANNEL)
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                envelope = json.loads(message.get("data") or "{}")
                if envelope.get("origin") == CLIENT_ID or envelope.get("event") != "providers_changed":
                    continue
                await _refresh_cache(refresh)
                logger.info("provider config cache refreshed from peer", extra={"event": "provider_config_peer_refresh"})
            except (TypeError, ValueError):
                logger.warning("ignored malformed provider config event", extra={"event": "provider_config_event_malformed"})
            except Exception:
                logger.exception("provider config peer refresh failed", extra={"event": "provider_config_peer_refresh_failed"})
    finally:
        with contextlib.suppress(Exception):
            await pubsub.aclose()


async def provider_config_event_loop(refresh: Callable[[], object]) -> None:
    """Use Pub/Sub for immediate updates and polling as a missed-event backstop."""
    pubsub_disabled = False
    while True:
        if pubsub_disabled:
            # The Redis ACL user may be intentionally restricted to data
            # commands. Keep cache invalidation functional through polling.
            try:
                await _refresh_cache(refresh)
            except Exception:
                logger.exception("provider config periodic refresh failed", extra={"event": "provider_config_periodic_refresh_failed"})
            await asyncio.sleep(PROVIDER_CONFIG_CACHE_REFRESH_SECONDS)
            continue
        try:
            await asyncio.wait_for(
                _listen_once(refresh), timeout=PROVIDER_CONFIG_CACHE_REFRESH_SECONDS,
            )
        except TimeoutError:
            try:
                await _refresh_cache(refresh)
            except Exception:
                logger.exception("provider config periodic refresh failed", extra={"event": "provider_config_periodic_refresh_failed"})
        except asyncio.CancelledError:
            raise
        except NoPermissionError:
            pubsub_disabled = True
            logger.warning(
                "Redis ACL does not allow SUBSCRIBE; using periodic provider config refresh",
                extra={"event": "provider_config_pubsub_disabled"},
            )
        except Exception:
            logger.exception("provider config listener failed", extra={"event": "provider_config_listener_failed"})
            await asyncio.sleep(3)
