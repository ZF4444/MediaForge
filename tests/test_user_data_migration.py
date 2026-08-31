from contextlib import contextmanager

from app.routers import user_data_migration as migration


class Cursor:
    def __init__(self):
        self.executed = []
        self._rows = iter((
            {"id": "local-user", "username": "Local User"},
            {"id": "ou_9991ec9cb01e04251020a5f7ca518944"},
        ))

    def execute(self, query, params=None):
        self.executed.append((str(query), params))

    def fetchone(self):
        return next(self._rows)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class Connection:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    @contextmanager
    def transaction(self):
        yield self


@contextmanager
def connection(cursor):
    yield Connection(cursor)


def test_migration_execution_does_not_require_cursor_rowcount(monkeypatch):
    cursor = Cursor()
    monkeypatch.setattr(migration, "current_user_id", lambda: "ou_9991ec9cb01e04251020a5f7ca518944")
    monkeypatch.setattr(migration, "metadata_connection", lambda: connection(cursor))
    monkeypatch.setattr(migration, "audit_event", lambda *_args, **_kwargs: None)

    result = migration.migration_execute({"source_user_id": "local-user", "confirmed": True})

    assert result["ok"] is True
    assert "smart_canvases" in result["migrated_tables"]
    assert any("DELETE FROM users" in query for query, _ in cursor.executed)
