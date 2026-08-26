"""Durable Canvas Agent event append service and transactional outbox."""
from __future__ import annotations

from typing import Any

from app.core.utils import now_ms
from app.services.business_metadata import json_value, metadata_connection, new_id
from .event_types import EVENT_SCHEMA_VERSION, PHASES, SEVERITIES, normalize_event_type, sanitize_payload


class AgentEventService:
    topic = "agent.event.v1"

    @classmethod
    def append_sync(cls, *, user_id: str, run_id: str, event_type: str, payload: dict[str, Any] | None = None,
                    operation_id: str | None = None, phase: str = "", severity: str = "info") -> dict[str, Any]:
        event_type = normalize_event_type(event_type)
        phase = str(phase or "")
        severity = str(severity or "info")
        if phase not in PHASES:
            raise ValueError(f"unsupported agent event phase: {phase}")
        if severity not in SEVERITIES:
            raise ValueError(f"unsupported agent event severity: {severity}")
        body = sanitize_payload(payload)
        now = now_ms()
        with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
            cur.execute("SELECT 1 FROM canvas_agent_runs WHERE id=%s AND user_id=%s FOR UPDATE", (run_id, user_id))
            if not cur.fetchone():
                raise PermissionError("run not found")
            cur.execute("SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM canvas_agent_events WHERE run_id=%s", (run_id,))
            sequence = int(cur.fetchone()["sequence"])
            event_id = new_id()
            cur.execute(
                "INSERT INTO canvas_agent_events(id,run_id,sequence,type,payload_json,operation_id,phase,severity,schema_version,created_at) "
                "VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                (event_id, run_id, sequence, event_type, json_value(body), operation_id or None, phase or None, severity, EVENT_SCHEMA_VERSION, now),
            )
            event = cur.fetchone()
            outbox_payload = {"user_id": user_id, "event": {
                "schema_version": EVENT_SCHEMA_VERSION, "id": event_id, "sequence": sequence, "run_id": run_id,
                "operation_id": operation_id or "", "type": event_type, "phase": phase, "severity": severity,
                "created_at": now, "payload": body,
            }}
            cur.execute(
                "INSERT INTO canvas_agent_event_outbox(id,event_id,run_id,user_id,topic,payload_json,status,attempts,available_at,created_at,updated_at) "
                "VALUES(%s,%s,%s,%s,%s,%s,'pending',0,%s,%s,%s)",
                (new_id(), event_id, run_id, user_id, cls.topic, json_value(outbox_payload), now, now, now),
            )
            return event

    @classmethod
    async def append(cls, **kwargs: Any) -> dict[str, Any]:
        import asyncio
        return await asyncio.to_thread(cls.append_sync, **kwargs)


def claim_outbox_batch(limit: int = 100) -> list[dict[str, Any]]:
    """Lease events for one publisher. PostgreSQL remains the retry authority."""
    now = now_ms()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM canvas_agent_event_outbox WHERE status IN ('pending','retrying') AND available_at<=%s "
            "ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT %s", (now, max(1, min(limit, 500))),
        )
        rows = cur.fetchall()
        for row in rows:
            cur.execute("UPDATE canvas_agent_event_outbox SET status='publishing',attempts=attempts+1,updated_at=%s WHERE id=%s", (now, row["id"]))
            row["attempts"] = int(row.get("attempts") or 0) + 1
        return rows


def mark_outbox_delivered(outbox_id: str) -> None:
    with metadata_connection() as conn, conn.cursor() as cur:
        now = now_ms()
        cur.execute("UPDATE canvas_agent_event_outbox SET status='delivered',delivered_at=%s,updated_at=%s WHERE id=%s", (now, now, outbox_id))


def retry_outbox(outbox_id: str, attempts: int, error: str) -> None:
    now = now_ms()
    delay_ms = min(60_000, 250 * (2 ** min(8, max(0, attempts - 1))))
    status = "dead" if attempts >= 12 else "retrying"
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE canvas_agent_event_outbox SET status=%s,available_at=%s,last_error=%s,updated_at=%s WHERE id=%s", (status, now + delay_ms, str(error)[:1000], now, outbox_id))


async def agent_event_outbox_loop() -> None:
    """Publish persisted events at least once; clients dedupe by run/sequence."""
    import asyncio
    from app.config import AGENT_EVENT_OUTBOX_BATCH_SIZE, AGENT_EVENT_OUTBOX_POLL_SECONDS
    from app.core.agent_event_pubsub import publish_agent_event
    from app.core.metrics import AGENT_EVENT_PUBLISHES
    while True:
        try:
            rows = await asyncio.to_thread(claim_outbox_batch, AGENT_EVENT_OUTBOX_BATCH_SIZE)
            if not rows:
                await asyncio.sleep(AGENT_EVENT_OUTBOX_POLL_SECONDS)
                continue
            for row in rows:
                try:
                    await publish_agent_event(dict(row.get("payload_json") or {}))
                    await asyncio.to_thread(mark_outbox_delivered, row["id"])
                    AGENT_EVENT_PUBLISHES.labels(result="delivered").inc()
                except Exception as exc:
                    await asyncio.to_thread(retry_outbox, row["id"], int(row.get("attempts") or 1), exc)
                    AGENT_EVENT_PUBLISHES.labels(result="retrying").inc()
        except asyncio.CancelledError:
            raise
        except Exception:
            await asyncio.sleep(AGENT_EVENT_OUTBOX_POLL_SECONDS)
