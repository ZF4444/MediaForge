import asyncio

from fastapi import HTTPException

import main
from app.services import usage
from app.services.usage import _usage_values


def test_runninghub_usage_values_from_legacy_outputs_response():
    raw = {
        "data": [{
            "consumeMoney": "1.25",
            "thirdPartyConsumeMoney": "2.50",
            "consumeCoins": "17",
            "taskCostTime": "83",
        }]
    }

    assert _usage_values(raw) == {
        "consume_money_cny": 1.25,
        "third_party_money_cny": 2.5,
        "total_money_cny": 3.75,
        "consume_coins": 17.0,
        "task_cost_seconds": 83.0,
    }


def test_runninghub_usage_values_from_v2_usage_response():
    raw = {"usage": {"consumeMoney": None, "thirdPartyConsumeMoney": "8", "consumeCoins": "0"}}

    assert _usage_values(raw)["total_money_cny"] == 8.0


def test_user_usage_dashboard_is_scoped_to_the_requested_user(monkeypatch):
    class Cursor:
        def __init__(self):
            self.params = []
            self.index = 0

        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def execute(self, _query, params): self.params.append(params)
        def fetchone(self):
            rows = [
                {"id": "user-1", "username": "Ada", "org_id": "org-1", "organization_name": "Design", "monthly_budget_usd": "10", "budget_enabled": True},
                {"runninghub_cost_usd": "1.25", "runninghub_coins": "8", "runninghub_tasks": 2},
                {"omnilojo_cost_usd": "0.75", "omnilojo_requests": 3},
                {"runninghub_cost_usd": "4", "runninghub_coins": "20", "task_count": 4},
                {"omnilojo_cost_usd": "2", "request_count": 5},
            ]
            row = rows[self.index]
            self.index += 1
            return row
        def fetchall(self):
            return [{"source": "Omnilojo", "reference": "request-1", "status": "succeeded", "cost_usd": "0.75", "units": 12, "timestamp": 1}]

    cursor = Cursor()

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def cursor(self): return cursor

    monkeypatch.setattr(usage, "metadata_connection", lambda: Connection())
    result = usage.user_usage_dashboard("user-1", "2026-08")

    assert result["profile"] == {"user_id": "user-1", "username": "Ada", "organization_name": "Design"}
    assert result["spending"]["total_usd"] == 2.0
    assert result["organization"] == {"name": "Design", "total_usd": 6.0, "runninghub_coins": 20.0, "task_count": 4, "request_count": 5}
    assert result["records"][0]["reference"] == "request-1"
    assert all("user-1" in params for params in cursor.params[:4])
    assert all("org-1" in params for params in cursor.params[4:])


def test_budget_exhaustion_returns_structured_error_for_task_clients(monkeypatch):
    monkeypatch.setattr(main, "is_runninghub_provider", lambda _provider: True)
    monkeypatch.setattr(main, "is_omnilojo_provider", lambda _provider: False)
    monkeypatch.setattr(usage, "assert_runninghub_budget_available", lambda _user_id: (_ for _ in ()).throw(ValueError("个人本月 USD 预算已用尽，无法继续提交任务。")))

    try:
        asyncio.run(main.assert_provider_budget_available({"id": "runninghub"}, "user-1"))
    except HTTPException as exc:
        assert exc.status_code == 429
        assert exc.detail == {
            "error_code": "usage_budget_exceeded",
            "message": "个人本月 USD 预算已用尽，无法继续提交任务。",
            "contact_admin": True,
        }
    else:
        raise AssertionError("expected budget exhaustion to block the task")


def test_model_access_uses_the_resolved_legacy_provider(monkeypatch):
    monkeypatch.setattr(main, "current_user_id", lambda: "user-1")
    monkeypatch.setattr(main.access_control, "is_admin", lambda _user_id: False)
    monkeypatch.setattr(main, "get_api_provider", lambda _provider_id: {"id": "google"})
    checked = []
    monkeypatch.setattr(
        main.access_control,
        "is_model_allowed",
        lambda user_id, provider_id, model: checked.append((user_id, provider_id, model)) or True,
    )

    assert main.require_model_access("comfly", "gemini-3-pro") == "user-1"
    assert checked == [("user-1", "google", "gemini-3-pro")]
