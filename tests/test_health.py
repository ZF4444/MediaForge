import asyncio

from app.services import storage


def test_storage_readiness_requires_postgres_and_minio(monkeypatch):
    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def execute(self, _sql): pass
        def fetchone(self): return {"ok": 1}

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def cursor(self): return Cursor()

    class Client:
        def bucket_exists(self, _bucket): return True

    monkeypatch.setattr(storage, "metadata_db_enabled", lambda: True)
    monkeypatch.setattr(storage, "storage_enabled", lambda: True)
    monkeypatch.setattr(storage, "database_connection_sync", lambda **_kwargs: Connection())
    monkeypatch.setattr(storage, "_get_health_client", lambda: Client())

    assert storage.storage_readiness_status() == {
        "ready": True,
        "components": {"postgres": "ok", "minio": "ok"},
    }


def test_health_routes_return_live_and_not_ready(monkeypatch):
    import main

    async def immediate_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(main, "storage_readiness_status", lambda: {
        "ready": False,
        "components": {"postgres": "ok", "minio": "unavailable"},
    })
    monkeypatch.setattr(main.asyncio, "to_thread", immediate_to_thread)

    live = asyncio.run(main.health_live())
    ready = asyncio.run(main.health_ready())

    assert live.status_code == 200
    assert live.headers["cache-control"] == "no-store"
    assert b'"status":"ok"' in live.body
    assert ready.status_code == 503
    assert ready.headers["cache-control"] == "no-store"
    assert ready.headers["retry-after"] == "5"
    assert b'"status":"not_ready"' in ready.body
    assert b'"minio":"unavailable"' in ready.body
