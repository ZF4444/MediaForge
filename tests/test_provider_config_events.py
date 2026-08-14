import asyncio
import json

from app.core import provider_config_events


class Redis:
    def __init__(self):
        self.published = []

    async def publish(self, channel, message):
        self.published.append((channel, message))
        return 1


def test_provider_cache_invalidation_event_contains_no_configuration(monkeypatch):
    redis = Redis()
    monkeypatch.setattr(provider_config_events, "get_redis_client", lambda: redis)

    asyncio.run(provider_config_events.publish_provider_config_changed())

    _channel, raw = redis.published[0]
    message = json.loads(raw)
    assert message["event"] == "providers_changed"
    assert set(message) == {"origin", "event"}
