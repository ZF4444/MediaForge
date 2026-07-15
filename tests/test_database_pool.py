import sys
from types import SimpleNamespace

from app.core import database


class FakePool:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.open_calls = []
        self.close_calls = []
        self.connection_calls = []
        FakePool.instances.append(self)

    def open(self, **kwargs):
        self.open_calls.append(kwargs)

    def close(self, **kwargs):
        self.close_calls.append(kwargs)

    def connection(self, **kwargs):
        self.connection_calls.append(kwargs)
        return FakeConnection()


class FakeConnection:
    def __enter__(self):
        return "connection"

    def __exit__(self, *_args):
        return False


def test_database_pool_is_shared_and_uses_configured_timeouts(monkeypatch):
    FakePool.instances.clear()
    monkeypatch.setattr(database, "_POOL", None)
    monkeypatch.setattr(database, "DATABASE_URL", "postgresql://example/mediaforge")
    monkeypatch.setattr(database, "DATABASE_POOL_MIN_SIZE", 2)
    monkeypatch.setattr(database, "DATABASE_POOL_MAX_SIZE", 8)
    monkeypatch.setattr(database, "DATABASE_POOL_TIMEOUT_SECONDS", 4.0)
    monkeypatch.setattr(database, "DATABASE_CONNECT_TIMEOUT_SECONDS", 6)
    monkeypatch.setitem(sys.modules, "psycopg_pool", SimpleNamespace(ConnectionPool=FakePool))

    first = database.open_database_pool()
    second = database.open_database_pool()

    assert first is second
    assert len(FakePool.instances) == 1
    assert first.kwargs["min_size"] == 2
    assert first.kwargs["max_size"] == 8
    assert first.kwargs["kwargs"]["connect_timeout"] == 6
    assert "statement_timeout=" in first.kwargs["kwargs"]["options"]
    assert first.open_calls == [{"wait": True, "timeout": 4.0}]
    with database.database_connection() as conn:
        assert conn == "connection"
    assert first.connection_calls == [{"timeout": 4.0}]

    database.close_database_pool()
    assert first.close_calls == [{"timeout": 4.0}]


def test_database_pool_rejects_invalid_sizes(monkeypatch):
    monkeypatch.setattr(database, "_POOL", None)
    monkeypatch.setattr(database, "DATABASE_URL", "postgresql://example/mediaforge")
    monkeypatch.setattr(database, "DATABASE_POOL_MIN_SIZE", 5)
    monkeypatch.setattr(database, "DATABASE_POOL_MAX_SIZE", 2)

    try:
        database.open_database_pool()
    except RuntimeError as exc:
        assert "DATABASE_POOL_MAX_SIZE" in str(exc)
    else:
        raise AssertionError("invalid pool sizes should fail before opening a pool")
