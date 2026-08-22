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
