"""Process-local aggregates; never use URLs, tokens or IDs as metric labels.

All updates happen on the ASGI event loop. Restart resets these operational
metrics; durable per-request records remain in the authorization database.
"""


class Telemetry:
    def __init__(self, capacity):
        self.capacity = capacity
        self.active = 0
        self.peak_active = 0
        self.outcomes = {}
        self.latency = {}
        self.bytes_read = 0
        self.bytes_sent = 0

    def enter(self):
        self.active += 1
        self.peak_active = max(self.peak_active, self.active)

    def duration(self, phase, seconds):
        stats = self.latency.setdefault(phase, {"count": 0, "sum": 0.0, "max": 0.0})
        stats["count"] += 1
        stats["sum"] += seconds
        stats["max"] = max(stats["max"], seconds)

    def finish(self, status, reason, read=0, sent=0, entered=False):
        if entered:
            self.active -= 1
        label = f"{status}_{reason}"
        self.outcomes[label] = self.outcomes.get(label, 0) + 1
        self.bytes_read += read
        self.bytes_sent += sent

    def snapshot(self, repo=None):
        pool = repo.pool.get_stats() if repo is not None else {}
        return {
            "download_capacity": self.capacity,
            "active_downloads": self.active,
            "peak_active_downloads": self.peak_active,
            "outcomes": dict(self.outcomes),
            "bytes_read": self.bytes_read,
            "bytes_sent": self.bytes_sent,
            "latency_seconds": {key: dict(value) for key, value in self.latency.items()},
            "database_pool": {
                key: pool.get(key, 0)
                for key in ("pool_size", "pool_available", "requests_waiting", "connections_errors", "requests_errors")
            },
        }
