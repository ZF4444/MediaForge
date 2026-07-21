import asyncio
import json
from contextlib import asynccontextmanager

from app.core import auth


class FakePipeline:
    def __init__(self, redis):
        self.redis = redis
        self.commands = []

    def set(self, *args, **kwargs):
        self.commands.append(("set", args, kwargs))
        return self

    def zadd(self, *args, **kwargs):
        self.commands.append(("zadd", args, kwargs))
        return self

    def delete(self, *args, **kwargs):
        self.commands.append(("delete", args, kwargs))
        return self

    def zrem(self, *args, **kwargs):
        self.commands.append(("zrem", args, kwargs))
        return self

    async def execute(self):
        self.redis.pipeline_commands.extend(self.commands)
        return [True] * len(self.commands)


class FakeRedis:
    def __init__(self, raw=None, dirty_entries=None):
        self.raw = raw
        self.dirty_entries = dirty_entries or []
        self.calls = []
        self.pipeline_commands = []

    async def get(self, key):
        self.calls.append(("get", key))
        return self.raw

    async def set(self, *args, **kwargs):
        self.calls.append(("set", args, kwargs))
        return True

    async def delete(self, key):
        self.calls.append(("delete", key))
        return 1

    async def zrangebyscore(self, *args, **kwargs):
        self.calls.append(("zrangebyscore", args, kwargs))
        return self.dirty_entries

    async def zremrangebyscore(self, *args, **kwargs):
        self.calls.append(("zremrangebyscore", args, kwargs))
        return len(self.dirty_entries)

    def pipeline(self, transaction=False):
        assert transaction is False
        return FakePipeline(self)


class FakeCursor:
    def __init__(self, row=None):
        self.row = row
        self.executed = []
        self.executed_many = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def execute(self, query, params=None):
        self.executed.append((str(query), params))

    async def executemany(self, query, params):
        self.executed_many.append((str(query), list(params)))

    async def fetchone(self):
        return self.row


class FakeTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def transaction(self):
        return FakeTransaction()


def fake_database(cursor):
    @asynccontextmanager
    async def connection():
        yield FakeConnection(cursor)

    return connection


def test_session_cache_hit_does_not_query_postgres(monkeypatch):
    now = 2_000_000
    payload = {
        "user_id": "user-1",
        "username": "User One",
        "created_at": now - 1000,
        "last_seen": now,
        "expires_at": now + 60_000,
    }
    redis = FakeRedis(json.dumps(payload))
    monkeypatch.setattr(auth, "now_ms", lambda: now)
    monkeypatch.setattr(auth, "get_redis_client", lambda: redis)

    @asynccontextmanager
    async def unexpected_database():
        raise AssertionError("PostgreSQL must not be queried on a Redis hit")
        yield

    monkeypatch.setattr(auth, "database_connection", unexpected_database)

    session = asyncio.run(auth.get_session("token"))

    assert session["user_id"] == "user-1"
    assert redis.calls[0][0] == "get"


def test_session_cache_miss_selects_postgres_without_update(monkeypatch):
    now = 3_000_000
    row = {
        "user_id": "user-2",
        "username": "User Two",
        "created_at": now - 1000,
        "last_seen": now - 1000,
        "expires_at": now + 60_000,
    }
    redis = FakeRedis()
    cursor = FakeCursor(row)
    monkeypatch.setattr(auth, "now_ms", lambda: now)
    monkeypatch.setattr(auth, "get_redis_client", lambda: redis)
    monkeypatch.setattr(auth, "database_connection", fake_database(cursor))

    session = asyncio.run(auth.get_session("token"))

    assert session["user_id"] == "user-2"
    assert len(cursor.executed) == 1
    assert cursor.executed[0][0].lstrip().startswith("SELECT")
    assert "UPDATE" not in cursor.executed[0][0]
    assert [command[0] for command in redis.pipeline_commands] == ["set", "zadd"]


def test_create_session_writes_postgres_and_redis(monkeypatch):
    now = 4_000_000
    redis = FakeRedis()
    cursor = FakeCursor()
    monkeypatch.setattr(auth, "now_ms", lambda: now)
    monkeypatch.setattr(auth, "get_redis_client", lambda: redis)
    monkeypatch.setattr(auth, "database_connection", fake_database(cursor))
    monkeypatch.setattr(auth._secrets, "token_urlsafe", lambda _size: "new-token")

    token = asyncio.run(auth.create_session("user-3", "User Three"))

    assert token == "new-token"
    assert cursor.executed[0][0].lstrip().startswith("INSERT")
    assert [command[0] for command in redis.pipeline_commands] == ["set"]


def test_destroy_session_revokes_before_database_delete(monkeypatch):
    redis = FakeRedis()
    cursor = FakeCursor()
    monkeypatch.setattr(auth, "get_redis_client", lambda: redis)
    monkeypatch.setattr(auth, "database_connection", fake_database(cursor))

    asyncio.run(auth.destroy_session("token"))

    assert redis.calls[0][0] == "set"
    assert cursor.executed[0][0].lstrip().startswith("DELETE")
    assert [command[0] for command in redis.pipeline_commands] == ["delete", "zrem"]


def test_flush_last_seen_batches_postgres_updates(monkeypatch):
    redis = FakeRedis(dirty_entries=[("hash-1", 10_000.0), ("hash-2", 20_000.0)])
    cursor = FakeCursor()
    monkeypatch.setattr(auth, "now_ms", lambda: 30_000)
    monkeypatch.setattr(auth, "get_redis_client", lambda: redis)
    monkeypatch.setattr(auth, "database_connection", fake_database(cursor))

    count = asyncio.run(auth.flush_session_last_seen())

    assert count == 2
    assert cursor.executed_many[0][1] == [(10_000, "hash-1"), (20_000, "hash-2")]
    assert any(call[0] == "zremrangebyscore" for call in redis.calls)
