import asyncio

from app.core.database import _query_operation
from app.core.metrics import MINIO_FAILURES, render_metrics
from app.services import storage


def test_query_metrics_use_operation_only():
    assert _query_operation("  SELECT * FROM secrets WHERE token = 'hidden'") == "SELECT"
    assert _query_operation("UPDATE files SET status = %s") == "UPDATE"


def test_minio_failure_metric_is_exported(monkeypatch):
    class Client:
        def stat_object(self, *_args):
            raise ValueError("bad request")

    before = MINIO_FAILURES.labels(operation="stat_object", error_type="ValueError")._value.get()
    monkeypatch.setattr(storage, "_get_client", lambda: Client())
    try:
        storage.stat_object("private", "file-1")
    except ValueError:
        pass
    after = MINIO_FAILURES.labels(operation="stat_object", error_type="ValueError")._value.get()

    assert after == before + 1
    assert b"mediaforge_minio_failures_total" in render_metrics()


def test_metrics_endpoint_returns_prometheus_payload(monkeypatch):
    import main

    refreshed = []

    async def immediate_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(main.asyncio, "to_thread", immediate_to_thread)
    monkeypatch.setattr(main, "refresh_database_metrics", lambda: refreshed.append("postgres"))
    monkeypatch.setattr(main, "refresh_storage_metrics", lambda: refreshed.append("storage"))

    response = asyncio.run(main.prometheus_metrics())

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert "text/plain" in response.headers["content-type"]
    assert b"mediaforge_pg_pool_size" in response.body
    assert set(refreshed) == {"postgres", "storage"}
