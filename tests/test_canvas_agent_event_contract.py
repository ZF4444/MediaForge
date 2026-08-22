from app.services.canvas_agent.event_types import event_envelope, normalize_event_type, sanitize_payload


def test_event_contract_rejects_unknown_types_and_redacts_secrets():
    try:
        normalize_event_type("unexpected.event")
    except ValueError:
        pass
    else:
        raise AssertionError("unknown event type must be rejected")
    payload = sanitize_payload({"api_key": "secret", "nested": {"Authorization": "token"}, "message": "ok"})
    assert payload == {"api_key": "[redacted]", "nested": {"Authorization": "[redacted]"}, "message": "ok"}


def test_event_envelope_has_stable_client_fields():
    envelope = event_envelope({"id": "evt", "run_id": "run", "sequence": 2, "type": "progress.agent", "created_at": 1, "payload_json": {"message": "working"}})
    assert envelope["schema_version"] == 1
    assert envelope["run_id"] == "run"
    assert envelope["payload"]["message"] == "working"


def test_worker_auth_context_is_available_in_to_thread():
    import asyncio
    from app.core.auth import current_user_id, current_user_var

    async def check() -> str:
        token = current_user_var.set("agent-owner")
        try:
            return await asyncio.to_thread(current_user_id)
        finally:
            current_user_var.reset(token)

    assert asyncio.run(check()) == "agent-owner"
