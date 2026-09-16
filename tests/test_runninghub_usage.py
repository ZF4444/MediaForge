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
    monkeypatch.setattr(main, "is_runninghub_connection", lambda _provider: True)
    monkeypatch.setattr(main, "is_omnilojo_connection", lambda _provider: False)
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


def test_priced_openai_connection_is_budget_enforced(monkeypatch):
    # GPT-Image-2 走 OpenAI 兼容协议，既非 runninghub 也非 omnilojo。只要模型配置了
    # 价格（model_prices 非空），就应纳入预算并在超支时拦截。
    monkeypatch.setattr(main, "is_runninghub_connection", lambda _provider: False)
    monkeypatch.setattr(usage, "assert_runninghub_budget_available", lambda _user_id: (_ for _ in ()).throw(ValueError("个人本月 USD 预算已用尽，无法继续提交任务。")))

    provider = {"id": "comfly", "protocol": "openai", "model_prices": {"gpt-image-2": {"output_per_million": 40}}}
    try:
        asyncio.run(main.assert_provider_budget_available(provider, "user-1"))
    except HTTPException as exc:
        assert exc.status_code == 429
        assert exc.detail["error_code"] == "usage_budget_exceeded"
    else:
        raise AssertionError("expected priced OpenAI connection to be budget enforced")


def test_unpriced_connection_bypasses_budget(monkeypatch):
    # 未配置价格且非 runninghub 的连接不计费，因此不应触发预算查询。
    monkeypatch.setattr(main, "is_runninghub_connection", lambda _provider: False)

    def _fail(_user_id):
        raise AssertionError("budget lookup must not run for unpriced connections")

    monkeypatch.setattr(usage, "assert_runninghub_budget_available", _fail)
    # 返回 None 即视为放行（无异常）。
    assert asyncio.run(main.assert_provider_budget_available({"id": "local-comfy", "protocol": "comfyui"}, "user-1")) is None
