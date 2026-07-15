"""Prometheus metrics shared by database, storage, and background jobs."""

from __future__ import annotations

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, generate_latest


REGISTRY = CollectorRegistry()

DB_POOL_SIZE = Gauge("mediaforge_pg_pool_size", "Current PostgreSQL pool size.", registry=REGISTRY)
DB_POOL_AVAILABLE = Gauge("mediaforge_pg_pool_available", "Idle PostgreSQL pool connections.", registry=REGISTRY)
DB_POOL_WAITING = Gauge("mediaforge_pg_pool_waiting", "Requests currently waiting for a PostgreSQL connection.", registry=REGISTRY)
DB_POOL_WAIT_SECONDS = Histogram(
    "mediaforge_pg_pool_wait_seconds",
    "Time spent waiting to check out a PostgreSQL connection.",
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5),
    registry=REGISTRY,
)
DB_QUERY_SECONDS = Histogram(
    "mediaforge_pg_query_seconds",
    "PostgreSQL query duration by operation and result.",
    ("operation", "status"),
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10),
    registry=REGISTRY,
)
DB_SLOW_QUERIES = Counter(
    "mediaforge_pg_slow_queries_total",
    "Queries exceeding the configured slow-query threshold.",
    ("operation",),
    registry=REGISTRY,
)
DB_ACTIVE_CONNECTIONS = Gauge("mediaforge_pg_active_connections", "Active PostgreSQL sessions for the current database.", registry=REGISTRY)
DB_LOCK_WAITING = Gauge("mediaforge_pg_lock_waiting", "PostgreSQL sessions waiting on locks.", registry=REGISTRY)

MINIO_OPERATION_SECONDS = Histogram(
    "mediaforge_minio_operation_seconds",
    "MinIO operation duration by operation and result.",
    ("operation", "status"),
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30),
    registry=REGISTRY,
)
MINIO_FAILURES = Counter(
    "mediaforge_minio_failures_total",
    "Failed MinIO operations.",
    ("operation", "error_type"),
    registry=REGISTRY,
)
MINIO_BUCKET_BYTES = Gauge(
    "mediaforge_minio_bucket_catalog_bytes",
    "Active object bytes registered in PostgreSQL by MinIO bucket.",
    ("bucket",),
    registry=REGISTRY,
)
MINIO_BUCKET_OBJECTS = Gauge(
    "mediaforge_minio_bucket_catalog_objects",
    "Active objects registered in PostgreSQL by MinIO bucket.",
    ("bucket",),
    registry=REGISTRY,
)

BACKGROUND_FAILURES = Counter(
    "mediaforge_background_failures_total",
    "Background job failures that require alerting.",
    ("job",),
    registry=REGISTRY,
)
BACKGROUND_RUNS = Counter(
    "mediaforge_background_runs_total",
    "Completed background job runs by result.",
    ("job", "status"),
    registry=REGISTRY,
)

TRANSIENT_RETRIES = Counter(
    "mediaforge_transient_retries_total",
    "Retries of transient dependency failures.",
    ("backend", "operation"),
    registry=REGISTRY,
)


def update_pool_stats(stats: dict) -> None:
    DB_POOL_SIZE.set(float(stats.get("pool_size", 0) or 0))
    DB_POOL_AVAILABLE.set(float(stats.get("pool_available", 0) or 0))
    DB_POOL_WAITING.set(float(stats.get("requests_waiting", 0) or 0))


def render_metrics() -> bytes:
    return generate_latest(REGISTRY)
