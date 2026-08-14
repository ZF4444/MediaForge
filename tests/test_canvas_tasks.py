import asyncio

from app.services import canvas_tasks


class Pipeline:
    def __init__(self, redis):
        self.redis = redis
        self.commands = []

    def set(self, key, value, **kwargs):
        self.commands.append(("set", key, value, kwargs))
        return self

    def zadd(self, key, values):
        self.commands.append(("zadd", key, values, {}))
        return self

    async def execute(self):
        for command, key, value, kwargs in self.commands:
            if command == "set":
                await self.redis.set(key, value, **kwargs)
            else:
                await self.redis.zadd(key, value)


class Redis:
    def __init__(self):
        self.values = {}
        self.sorted_sets = {}
        self.streams = {}
        self.acks = []
        self.pending = {}

    def pipeline(self, transaction=False):
        assert transaction is False
        return Pipeline(self)

    async def set(self, key, value, nx=False, **_kwargs):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    async def get(self, key):
        return self.values.get(key)

    async def delete(self, key):
        return 1 if self.values.pop(key, None) is not None else 0

    async def expire(self, key, _seconds):
        return key in self.values

    async def eval(self, script, _numkeys, key, worker_id, *_args):
        if "TASK_UPDATE_IF_CLAIMED" in script:
            task_key, lease_key, index_key = key, worker_id, _args[0]
            lease_token, changes_json, updated_at, _ttl, task_id = _args[1:]
            if self.values.get(lease_key) != lease_token or task_key not in self.values:
                return False
            record = __import__("json").loads(self.values[task_key])
            record.update(__import__("json").loads(changes_json))
            record["updated_at"] = updated_at
            self.values[task_key] = __import__("json").dumps(record, separators=(",", ":"))
            if record.get("status") in {"queued", "running"}:
                self.sorted_sets.setdefault(index_key, {})[task_id] = updated_at + _ttl
            else:
                self.sorted_sets.get(index_key, {}).pop(task_id, None)
            return self.values[task_key]
        if self.values.get(key) != worker_id:
            return 0
        if "EXPIRE" in script:
            return 1
        self.values.pop(key, None)
        return 1

    async def zadd(self, key, values):
        self.sorted_sets.setdefault(key, {}).update(values)
        return 1

    async def zrem(self, key, member):
        self.sorted_sets.get(key, {}).pop(member, None)
        return 1

    async def zrange(self, key, _start, _end):
        return list(self.sorted_sets.get(key, {}))

    async def zremrangebyscore(self, key, _minimum, maximum):
        values = self.sorted_sets.get(key, {})
        for member in [member for member, score in values.items() if score <= maximum]:
            values.pop(member, None)

    async def xgroup_create(self, *_args, **_kwargs):
        return True

    async def xadd(self, stream, fields, **_kwargs):
        entries = self.streams.setdefault(stream, [])
        message_id = f"{len(entries) + 1}-0"
        entries.append((message_id, fields))
        return message_id

    async def xreadgroup(self, _group, consumer, streams, **_kwargs):
        stream = next(iter(streams))
        entries = self.streams.get(stream, [])
        self.streams[stream] = []
        for message_id, fields in entries:
            self.pending[message_id] = (consumer, fields)
        return [(stream, entries)] if entries else []

    async def xautoclaim(self, _stream, _group, consumer, **_kwargs):
        entries = []
        for message_id, (_old_consumer, fields) in self.pending.items():
            self.pending[message_id] = (consumer, fields)
            entries.append((message_id, fields))
        return "0-0", entries, []

    async def xack(self, stream, _group, message_id):
        self.acks.append((stream, message_id))
        self.pending.pop(message_id, None)
        return 1


def test_canvas_tasks_persist_update_claim_and_recover(monkeypatch):
    redis = Redis()
    monkeypatch.setattr(canvas_tasks, "get_redis_client", lambda: redis)

    async def scenario():
        await canvas_tasks.create_canvas_task({"id": "task-1", "status": "queued", "type": "online-image"})
        assert (await canvas_tasks.get_canvas_task("task-1"))["status"] == "queued"
        worker_a_lease = await canvas_tasks.claim_canvas_task("task-1", "worker-a")
        assert worker_a_lease
        assert await canvas_tasks.claim_canvas_task("task-1", "worker-b") is None
        assert await canvas_tasks.refresh_canvas_task_lease("task-1", worker_a_lease) is True
        await canvas_tasks.release_canvas_task_claim("task-1", worker_a_lease)
        worker_b_lease = await canvas_tasks.claim_canvas_task("task-1", "worker-b")
        assert worker_b_lease
        await canvas_tasks.release_canvas_task_claim("task-1", worker_a_lease)
        assert await canvas_tasks.has_canvas_task_claim("task-1") is True
        assert await canvas_tasks.update_claimed_canvas_task("task-1", worker_a_lease, status="running") is None
        assert (await canvas_tasks.update_claimed_canvas_task("task-1", worker_b_lease, status="running"))["status"] == "running"
        assert [task["id"] for task in await canvas_tasks.list_recoverable_canvas_tasks()] == ["task-1"]
        await canvas_tasks.update_canvas_task("task-1", status="succeeded", result={"images": []})
        assert await canvas_tasks.list_recoverable_canvas_tasks() == []
        await canvas_tasks.ensure_canvas_task_consumer_group()
        message_id = await canvas_tasks.enqueue_canvas_task("task-2")
        assert await canvas_tasks.dequeue_canvas_tasks("worker-a") == [(message_id, "task-2")]
        assert await canvas_tasks.enqueue_canvas_task("task-2") == ""
        assert await canvas_tasks.reclaim_canvas_task_messages("worker-b") == [(message_id, "task-2")]
        await canvas_tasks.acknowledge_canvas_task(message_id)
        await canvas_tasks.release_canvas_task_dispatch("task-2")
        assert await canvas_tasks.enqueue_canvas_task("task-2")
        assert redis.acks

    asyncio.run(scenario())
