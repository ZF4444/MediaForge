"""RunningHub and Omnilojo USD usage ledger and organization budget queries."""
from __future__ import annotations

import asyncio
import json
import urllib.parse
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.core.utils import now_ms
from app.core.http_client import shared_http_client
from app.services.business_metadata import json_value, metadata_connection, new_id

_SHANGHAI = timezone(timedelta(hours=8))


def current_billing_month() -> str:
    return datetime.now(_SHANGHAI).strftime("%Y-%m")


def _month_range(month: str) -> tuple[int, int]:
    try:
        start = datetime.strptime(month, "%Y-%m").replace(tzinfo=_SHANGHAI)
    except ValueError:
        raise ValueError("月份必须为 YYYY-MM。") from None
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return int(start.timestamp() * 1000), int(end.timestamp() * 1000)


def _decimal(value: Any) -> Decimal:
    try:
        return max(Decimal("0"), Decimal(str(value if value is not None else 0)))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _number(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.0001")))


def _usage_object(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    if isinstance(raw.get("usage"), dict):
        return raw["usage"]
    data = raw.get("data")
    if isinstance(data, dict) and isinstance(data.get("usage"), dict):
        return data["usage"]
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and any(key in item for key in ("consumeMoney", "consumeCoins", "thirdPartyConsumeMoney", "taskCostTime")):
                return item
    return {}


def _usage_values(raw: Any) -> dict[str, float]:
    # RunningHub returns both money fields in USD. Legacy database columns retain
    # their original ``*_cny`` names for compatibility, but store USD amounts.
    usage = _usage_object(raw)
    runtime = _decimal(usage.get("consumeMoney"))
    third_party = _decimal(usage.get("thirdPartyConsumeMoney"))
    return {
        "consume_money_cny": _number(runtime),
        "third_party_money_cny": _number(third_party),
        "total_money_cny": _number(runtime + third_party),
        "consume_coins": _number(_decimal(usage.get("consumeCoins"))),
        "task_cost_seconds": _number(_decimal(usage.get("taskCostTime"))),
    }


def _org_for_user(cur, user_id: str) -> str | None:
    cur.execute("SELECT org_id FROM users WHERE id=%s", (user_id,))
    row = cur.fetchone()
    return str(row["org_id"]) if row and row.get("org_id") else None


def assert_runninghub_budget_available(user_id: str, month: str | None = None) -> None:
    """Enforce every enabled organization and personal USD budget.

    A missing budget is deliberately unlimited. When both levels are enabled,
    both must have remaining balance before a new request can be submitted.
    """
    month = month or current_billing_month()
    start, end = _month_range(month)
    with metadata_connection() as conn, conn.cursor() as cur:
        org_id = _org_for_user(cur, user_id)
        if org_id:
            cur.execute("SELECT monthly_budget_cny,enabled FROM organization_budgets WHERE organization_id=%s", (org_id,))
            budget = cur.fetchone()
            if budget and budget["enabled"] and budget["monthly_budget_cny"] is not None:
                cur.execute(
                    """SELECT COALESCE((SELECT SUM(total_money_cny) FROM runninghub_usage_records WHERE org_id=%s AND submitted_at>=%s AND submitted_at<%s AND status='succeeded'),0)
                             + COALESCE((SELECT SUM(cost_usd) FROM omnilojo_usage_records WHERE org_id=%s AND created_at>=%s AND created_at<%s AND status='succeeded'),0) AS total""",
                    (org_id, start, end, org_id, start, end),
                )
                if _decimal(cur.fetchone()["total"]) >= _decimal(budget["monthly_budget_cny"]):
                    raise ValueError("所在组织本月 USD 预算已用尽，无法继续提交任务。")
        cur.execute("SELECT monthly_budget_usd,enabled FROM user_budgets WHERE user_id=%s", (user_id,))
        budget = cur.fetchone()
        if budget and budget["enabled"] and budget["monthly_budget_usd"] is not None:
            cur.execute(
                """SELECT COALESCE((SELECT SUM(total_money_cny) FROM runninghub_usage_records WHERE user_id=%s AND submitted_at>=%s AND submitted_at<%s AND status='succeeded'),0)
                         + COALESCE((SELECT SUM(cost_usd) FROM omnilojo_usage_records WHERE user_id=%s AND created_at>=%s AND created_at<%s AND status='succeeded'),0) AS total""",
                (user_id, start, end, user_id, start, end),
            )
            if _decimal(cur.fetchone()["total"]) >= _decimal(budget["monthly_budget_usd"]):
                raise ValueError("个人本月 USD 预算已用尽，无法继续提交任务。")


def record_runninghub_submission(user_id: str, upstream_task_id: str, *, operation: str, model: str = "") -> None:
    task_id = str(upstream_task_id or "").strip()
    if not task_id:
        return
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        org_id = _org_for_user(cur, user_id)
        cur.execute(
            """INSERT INTO runninghub_usage_records(id,upstream_task_id,user_id,org_id,operation,model,status,submitted_at,created_at,updated_at)
               VALUES(%s,%s,%s,%s,%s,%s,'submitted',%s,%s,%s)
               ON CONFLICT(upstream_task_id) DO NOTHING""",
            (new_id(), task_id, user_id, org_id, str(operation or ""), str(model or ""), now, now, now),
        )


def settle_runninghub_usage(user_id: str, upstream_task_id: str, raw: Any, *, status: str, operation: str = "", model: str = "") -> None:
    task_id = str(upstream_task_id or "").strip()
    if not task_id:
        return
    values = _usage_values(raw)
    normalized_status = str(status or "submitted").lower()
    if normalized_status in {"success", "succeeded"}:
        normalized_status = "succeeded"
    elif normalized_status in {"failed", "error"}:
        normalized_status = "failed"
    else:
        normalized_status = "submitted"
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        org_id = _org_for_user(cur, user_id)
        cur.execute(
            """INSERT INTO runninghub_usage_records(
                    id,upstream_task_id,user_id,org_id,operation,model,status,submitted_at,completed_at,
                    consume_money_cny,third_party_money_cny,total_money_cny,consume_coins,task_cost_seconds,raw_usage,created_at,updated_at)
               VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT(upstream_task_id) DO UPDATE SET
                    status=EXCLUDED.status, completed_at=EXCLUDED.completed_at,
                    consume_money_cny=EXCLUDED.consume_money_cny, third_party_money_cny=EXCLUDED.third_party_money_cny,
                    total_money_cny=EXCLUDED.total_money_cny, consume_coins=EXCLUDED.consume_coins,
                    task_cost_seconds=EXCLUDED.task_cost_seconds, raw_usage=EXCLUDED.raw_usage, updated_at=EXCLUDED.updated_at""",
            (new_id(), task_id, user_id, org_id, str(operation or ""), str(model or ""), normalized_status, now,
             now if normalized_status in {"succeeded", "failed"} else None, values["consume_money_cny"], values["third_party_money_cny"],
             values["total_money_cny"], values["consume_coins"], values["task_cost_seconds"], json_value(_usage_object(raw)), now, now),
        )


def set_organization_budget(org_id: str, monthly_budget_cny: Any, enabled: bool) -> dict[str, Any]:
    amount = _decimal(monthly_budget_cny)
    if amount > Decimal("9999999999.9999"):
        raise ValueError("预算金额过大。")
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM organizations WHERE id=%s", (org_id,))
        if not cur.fetchone():
            raise ValueError("组织不存在。")
        cur.execute(
            """INSERT INTO organization_budgets(organization_id,monthly_budget_cny,enabled,created_at,updated_at)
               VALUES(%s,%s,%s,%s,%s)
               ON CONFLICT(organization_id) DO UPDATE SET monthly_budget_cny=EXCLUDED.monthly_budget_cny,enabled=EXCLUDED.enabled,updated_at=EXCLUDED.updated_at""",
            (org_id, str(amount), bool(enabled), now, now),
        )
    return {"organization_id": org_id, "monthly_budget_cny": _number(amount), "enabled": bool(enabled)}


def set_user_budget(user_id: str, monthly_budget_usd: Any, enabled: bool) -> dict[str, Any]:
    amount = _decimal(monthly_budget_usd)
    if amount > Decimal("9999999999.9999"):
        raise ValueError("预算金额过大。")
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM users WHERE id=%s", (user_id,))
        if not cur.fetchone():
            raise ValueError("用户不存在。")
        cur.execute(
            """INSERT INTO user_budgets(user_id,monthly_budget_usd,enabled,created_at,updated_at)
               VALUES(%s,%s,%s,%s,%s)
               ON CONFLICT(user_id) DO UPDATE SET monthly_budget_usd=EXCLUDED.monthly_budget_usd,enabled=EXCLUDED.enabled,updated_at=EXCLUDED.updated_at""",
            (user_id, str(amount), bool(enabled), now, now),
        )
    return {"user_id": user_id, "monthly_budget_usd": _number(amount), "enabled": bool(enabled)}


def runninghub_usage_dashboard(month: str | None = None, limit: int = 100) -> dict[str, Any]:
    month = month or current_billing_month()
    start, end = _month_range(month)
    limit = max(1, min(500, int(limit)))
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT o.id,o.name,b.monthly_budget_cny,b.enabled,
                      COALESCE(SUM(r.total_money_cny) FILTER (WHERE r.status='succeeded' AND r.submitted_at>=%s AND r.submitted_at<%s),0)
                        + COALESCE((SELECT SUM(x.cost_usd) FROM omnilojo_usage_records x WHERE x.org_id=o.id AND x.status='succeeded' AND x.created_at>=%s AND x.created_at<%s),0) AS spent,
                      COALESCE(SUM(r.consume_coins) FILTER (WHERE r.status='succeeded' AND r.submitted_at>=%s AND r.submitted_at<%s),0) AS coins,
                      COUNT(r.id) FILTER (WHERE r.submitted_at>=%s AND r.submitted_at<%s) AS task_count
               FROM organizations o LEFT JOIN organization_budgets b ON b.organization_id=o.id
               LEFT JOIN runninghub_usage_records r ON r.org_id=o.id
               GROUP BY o.id,o.name,b.monthly_budget_cny,b.enabled ORDER BY o.name""",
            (start, end, start, end, start, end, start, end),
        )
        organizations = [{
            "id": row["id"], "name": row["name"], "monthly_budget_cny": _number(_decimal(row["monthly_budget_cny"])),
            "budget_enabled": bool(row["enabled"]), "spent_cny": _number(_decimal(row["spent"])),
            "consume_coins": _number(_decimal(row["coins"])), "task_count": int(row["task_count"] or 0),
        } for row in cur.fetchall()]
        cur.execute(
            """SELECT r.upstream_task_id,r.user_id,COALESCE(u.username,r.user_id) AS username,r.org_id,COALESCE(o.name,'未分配') AS organization_name,
                      r.operation,r.model,r.status,r.submitted_at,r.completed_at,r.consume_money_cny,r.third_party_money_cny,r.total_money_cny,r.consume_coins,r.task_cost_seconds
               FROM runninghub_usage_records r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN organizations o ON o.id=r.org_id
               WHERE r.submitted_at>=%s AND r.submitted_at<%s ORDER BY r.submitted_at DESC LIMIT %s""",
            (start, end, limit),
        )
        records = [dict(row) for row in cur.fetchall()]
        cur.execute(
            """SELECT u.id AS user_id,u.username,u.org_id,COALESCE(o.name,'未分配') AS organization_name,
                      b.monthly_budget_usd,b.enabled,
                      COALESCE((SELECT SUM(r.total_money_cny) FROM runninghub_usage_records r WHERE r.user_id=u.id AND r.status='succeeded' AND r.submitted_at>=%s AND r.submitted_at<%s),0)
                        + COALESCE((SELECT SUM(x.cost_usd) FROM omnilojo_usage_records x WHERE x.user_id=u.id AND x.status='succeeded' AND x.created_at>=%s AND x.created_at<%s),0) AS spent
               FROM users u LEFT JOIN user_budgets b ON b.user_id=u.id LEFT JOIN organizations o ON o.id=u.org_id
               ORDER BY u.username,u.id""",
            (start, end, start, end),
        )
        user_budgets = [dict(row) for row in cur.fetchall()]
    for record in records:
        for key in ("consume_money_cny", "third_party_money_cny", "total_money_cny", "consume_coins", "task_cost_seconds"):
            record[key] = _number(_decimal(record[key]))
    for budget in user_budgets:
        budget["monthly_budget_usd"] = _number(_decimal(budget["monthly_budget_usd"]))
        budget["spent_usd"] = _number(_decimal(budget["spent"]))
        budget["budget_enabled"] = bool(budget.pop("enabled"))
        budget.pop("spent", None)
    return {"month": month, "organizations": organizations, "user_budgets": user_budgets, "records": records}


def user_usage_dashboard(user_id: str, month: str | None = None, limit: int = 20) -> dict[str, Any]:
    """Return a user's own monthly consumption and recent activity only."""
    month = month or current_billing_month()
    start, end = _month_range(month)
    limit = max(1, min(100, int(limit)))
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT u.id,u.username,u.org_id,COALESCE(o.name,'未分配') AS organization_name,
                      b.monthly_budget_usd,b.enabled AS budget_enabled
               FROM users u
               LEFT JOIN organizations o ON o.id=u.org_id
               LEFT JOIN user_budgets b ON b.user_id=u.id
               WHERE u.id=%s""",
            (user_id,),
        )
        profile = cur.fetchone() or {"id": user_id, "username": user_id, "organization_name": "未分配", "monthly_budget_usd": 0, "budget_enabled": False}
        cur.execute(
            """SELECT
                   COALESCE(SUM(total_money_cny) FILTER (WHERE status='succeeded' AND submitted_at>=%s AND submitted_at<%s),0) AS runninghub_cost_usd,
                   COALESCE(SUM(consume_coins) FILTER (WHERE status='succeeded' AND submitted_at>=%s AND submitted_at<%s),0) AS runninghub_coins,
                   COUNT(*) FILTER (WHERE submitted_at>=%s AND submitted_at<%s) AS runninghub_tasks
               FROM runninghub_usage_records WHERE user_id=%s""",
            (start, end, start, end, start, end, user_id),
        )
        runninghub = cur.fetchone() or {}
        cur.execute(
            """SELECT COALESCE(SUM(cost_usd),0) AS omnilojo_cost_usd,
                      COUNT(*) AS omnilojo_requests
               FROM omnilojo_usage_records
               WHERE user_id=%s AND status='succeeded' AND created_at>=%s AND created_at<%s""",
            (user_id, start, end),
        )
        omnilojo = cur.fetchone() or {}
        cur.execute(
            """SELECT * FROM (
                   SELECT 'RunningHub' AS source,upstream_task_id AS reference,operation,model,status,
                          total_money_cny AS cost_usd,consume_coins AS units,completed_at AS timestamp
                   FROM runninghub_usage_records WHERE user_id=%s AND submitted_at>=%s AND submitted_at<%s
                   UNION ALL
                   SELECT 'Omnilojo' AS source,COALESCE(NULLIF(request_id,''),NULLIF(upstream_request_id,''),upstream_log_id) AS reference,
                          '' AS operation,model,status,cost_usd,
                          prompt_tokens + completion_tokens AS units,created_at AS timestamp
                   FROM omnilojo_usage_records WHERE user_id=%s AND created_at>=%s AND created_at<%s
               ) activity ORDER BY timestamp DESC NULLS LAST LIMIT %s""",
            (user_id, start, end, user_id, start, end, limit),
        )
        records = [dict(row) for row in cur.fetchall()]

    runninghub_cost = _decimal(runninghub.get("runninghub_cost_usd"))
    omnilojo_cost = _decimal(omnilojo.get("omnilojo_cost_usd"))
    budget = _decimal(profile.get("monthly_budget_usd"))
    organization = None
    org_id = str(profile.get("org_id") or "").strip()
    if org_id:
        with metadata_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """SELECT COALESCE(SUM(total_money_cny) FILTER (WHERE status='succeeded'),0) AS runninghub_cost_usd,
                          COALESCE(SUM(consume_coins) FILTER (WHERE status='succeeded'),0) AS runninghub_coins,
                          COUNT(*) FILTER (WHERE status='succeeded') AS task_count
                   FROM runninghub_usage_records WHERE org_id=%s AND submitted_at>=%s AND submitted_at<%s""",
                (org_id, start, end),
            )
            org_runninghub = cur.fetchone() or {}
            cur.execute(
                """SELECT COALESCE(SUM(cost_usd),0) AS omnilojo_cost_usd,
                          COUNT(*) AS request_count
                   FROM omnilojo_usage_records WHERE org_id=%s AND status='succeeded' AND created_at>=%s AND created_at<%s""",
                (org_id, start, end),
            )
            org_omnilojo = cur.fetchone() or {}
        organization = {
            "name": str(profile.get("organization_name") or "未分配"),
            "total_usd": _number(_decimal(org_runninghub.get("runninghub_cost_usd")) + _decimal(org_omnilojo.get("omnilojo_cost_usd"))),
            "runninghub_coins": _number(_decimal(org_runninghub.get("runninghub_coins"))),
            "task_count": int(org_runninghub.get("task_count") or 0),
            "request_count": int(org_omnilojo.get("request_count") or 0),
        }
    for record in records:
        record["cost_usd"] = _number(_decimal(record.get("cost_usd")))
        record["units"] = _number(_decimal(record.get("units")))
    return {
        "month": month,
        "profile": {
            "user_id": str(profile.get("id") or user_id),
            "username": str(profile.get("username") or user_id),
            "organization_name": str(profile.get("organization_name") or "未分配"),
        },
        "spending": {
            "total_usd": _number(runninghub_cost + omnilojo_cost),
            "runninghub_usd": _number(runninghub_cost),
            "omnilojo_usd": _number(omnilojo_cost),
            "runninghub_coins": _number(_decimal(runninghub.get("runninghub_coins"))),
            "task_count": int(runninghub.get("runninghub_tasks") or 0),
            "request_count": int(omnilojo.get("omnilojo_requests") or 0),
            "monthly_budget_usd": _number(budget),
            "budget_enabled": bool(profile.get("budget_enabled")),
        },
        "organization": organization,
        "records": records,
    }


def _omnilojo_number(value: Any) -> Decimal:
    return _decimal(value)


def _omnilojo_log_items(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or payload.get("success") is False:
        message = payload.get("message") if isinstance(payload, dict) else "响应格式不正确"
        raise ValueError(f"Omnilojo 日志接口返回失败：{message or '未知错误'}")
    data = payload.get("data")
    if isinstance(data, dict):
        data = data.get("items", [])
    return [item for item in (data or []) if isinstance(item, dict)]


def _omnilojo_request_ids(item: dict[str, Any]) -> tuple[str, str]:
    """Read request correlation IDs from current and legacy New API log shapes."""
    values: list[dict[str, Any]] = [item]
    for key in ("other", "extra", "metadata"):
        nested = item.get(key)
        if isinstance(nested, str):
            try:
                nested = json.loads(nested)
            except json.JSONDecodeError:
                nested = None
        if isinstance(nested, dict):
            values.append(nested)

    def first(*keys: str) -> str:
        for value in values:
            for key in keys:
                candidate = str(value.get(key) or "").strip()
                if candidate:
                    return candidate
        return ""

    return (
        first("request_id", "requestId"),
        first("upstream_request_id", "upstreamRequestId"),
    )


def omnilojo_response_usage_values(provider: dict[str, Any], model: str, usage: dict[str, Any]) -> dict[str, Any]:
    """Calculate a priced token usage snapshot from one completion response."""
    prompt_tokens = int(_omnilojo_number(usage.get("prompt_tokens", usage.get("input_tokens"))))
    completion_tokens = int(_omnilojo_number(usage.get("completion_tokens", usage.get("output_tokens"))))
    prices = provider.get("omnilojo_model_prices") or {}
    configured_price = prices.get(str(model or ""), {}) if isinstance(prices, dict) else {}
    text_input_per_million = _omnilojo_number(configured_price.get("text_input_per_million", configured_price.get("input_per_million"))) if isinstance(configured_price, dict) else Decimal("0")
    image_input_per_million = _omnilojo_number(configured_price.get("image_input_per_million")) if isinstance(configured_price, dict) else Decimal("0")
    output_per_million = _omnilojo_number(configured_price.get("output_per_million")) if isinstance(configured_price, dict) else Decimal("0")
    details = usage.get("prompt_tokens_details") if isinstance(usage.get("prompt_tokens_details"), dict) else {}
    text_tokens = int(_omnilojo_number(details.get("text_tokens")))
    image_tokens = int(_omnilojo_number(details.get("image_tokens")))
    if text_tokens + image_tokens <= 0:
        text_tokens, image_tokens = prompt_tokens, 0
    cost_usd = (Decimal(text_tokens) * text_input_per_million + Decimal(image_tokens) * image_input_per_million + Decimal(completion_tokens) * output_per_million) / Decimal("1000000")
    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "text_input_tokens": text_tokens,
        "image_input_tokens": image_tokens,
        "text_input_per_million": text_input_per_million,
        "image_input_per_million": image_input_per_million,
        "input_per_million": text_input_per_million,
        "output_per_million": output_per_million,
        "cost_usd": cost_usd,
        "configured": bool(isinstance(configured_price, dict) and str(model or "") in prices),
    }


def record_omnilojo_response_usage(user_id: str, provider: dict[str, Any], model: str, raw: Any, *, operation: str) -> bool:
    """Persist a user-attributed charge from an OpenAI-compatible response.

    Omnilojo does not return a cash amount in the completion response. The price
    snapshot is therefore stored alongside the returned usage so historical
    reports do not change when a user later edits model pricing.
    """
    if not isinstance(raw, dict):
        return False
    usage = raw.get("usage")
    request_id = str(raw.get("id") or raw.get("request_id") or "").strip()
    if not isinstance(usage, dict):
        return False
    # Some OpenAI-compatible image gateways omit an ID. Use a deterministic
    # local correlation key supplied by the caller, or generate one so the
    # successful generation still appears in the account usage ledger.
    request_id = request_id or str(raw.get("local_request_id") or new_id())
    values = omnilojo_response_usage_values(provider, model, usage)
    now = now_ms()
    raw_usage = {
        "usage": usage,
        "operation": str(operation or ""),
        "pricing": {
            "input_per_million": str(values["input_per_million"]),
            "output_per_million": str(values["output_per_million"]),
            "currency": "USD",
            "configured": values["configured"],
        },
    }
    with metadata_connection() as conn, conn.cursor() as cur:
        org_id = _org_for_user(cur, user_id)
        cur.execute(
            """INSERT INTO omnilojo_usage_records(id,provider_id,upstream_log_id,request_id,upstream_request_id,user_id,org_id,external_username,token_name,model,quota,cost_usd,total_money_cny,prompt_tokens,completion_tokens,status,created_at,raw_log,inserted_at,updated_at)
               VALUES(%s,%s,%s,%s,'',%s,%s,'','',%s,0,%s,%s,%s,%s,'succeeded',%s,%s,%s,%s)
               ON CONFLICT(provider_id,upstream_log_id) DO NOTHING
               RETURNING id""",
            (new_id(), str(provider.get("id") or ""), request_id, request_id, str(user_id or ""), org_id,
             str(model or ""), str(values["cost_usd"]), "0", values["prompt_tokens"], values["completion_tokens"], now,
             json_value(raw_usage), now, now),
        )
        return cur.fetchone() is not None


async def sync_omnilojo_usage(provider: dict[str, Any], credential: str, month: str | None = None, *, use_token_log: bool = True) -> dict[str, Any]:
    """Import New API consumption logs. Logs retain their raw quota and a configured cash conversion."""
    month = month or current_billing_month()
    start_ms, end_ms = _month_range(month)
    credential = str(credential or "").strip()
    base_url = str(provider.get("base_url") or "").strip().rstrip("/")
    if base_url.endswith("/v1"):
        base_url = base_url[:-3]
    if not base_url or not credential:
        raise ValueError("Omnilojo 尚未配置 API Key 或 Base URL。")
    quota_per_usd = _omnilojo_number(provider.get("omnilojo_quota_per_usd") or 500000)
    cny_per_usd = _omnilojo_number(provider.get("omnilojo_cny_per_usd") or 7.2)
    if quota_per_usd <= 0 or cny_per_usd <= 0:
        raise ValueError("Omnilojo 的额度换算参数必须大于 0。")
    headers = {"Accept": "application/json"}
    admin_user_id = str(provider.get("omnilojo_admin_user_id") or "").strip()
    # New API documents ``key`` for /api/log/token. Sending the same token in
    # Authorization also supports deployments that read the standard header.
    headers["Authorization"] = f"Bearer {credential}"
    if admin_user_id and not use_token_log:
        headers["New-Api-User"] = admin_user_id
    params = {"key": credential} if use_token_log else {"p": 1, "page_size": 100, "type": 2, "start_timestamp": start_ms // 1000, "end_timestamp": end_ms // 1000}
    path = "/api/log/token" if use_token_log else "/api/log/"
    log_url = f"{base_url}{path}"
    if use_token_log:
        log_url = f"{log_url}?{urllib.parse.urlencode(params)}"
        params = None
    try:
        async with shared_http_client(timeout=httpx.Timeout(connect=15, read=45, write=15, pool=15)) as client:
            response = await client.get(log_url, headers=headers, params=params)
            response.raise_for_status()
            items = _omnilojo_log_items(response.json())
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text.strip()[:300] or f"HTTP {exc.response.status_code}"
        raise ValueError(f"Omnilojo 日志接口请求失败：{detail}") from None
    except httpx.HTTPError as exc:
        raise ValueError(f"无法连接 Omnilojo 日志接口：{exc}") from None
    items = [item for item in items if str(item.get("type") or "2") == "2" and start_ms <= int(_omnilojo_number(item.get("created_at")) * 1000) < end_ms]
    imported = await asyncio.to_thread(_store_omnilojo_usage_records, provider, items, quota_per_usd, cny_per_usd)
    return {"month": month, "imported": imported, "quota_per_usd": _number(quota_per_usd), "cny_per_usd": _number(cny_per_usd)}


def _store_omnilojo_usage_records(provider: dict[str, Any], items: list[dict[str, Any]], quota_per_usd: Decimal, cny_per_usd: Decimal) -> int:
    """Persist records outside the async request loop."""
    imported = 0
    now = now_ms()
    with metadata_connection() as conn, conn.cursor() as cur:
        for item in items:
            log_id = str(item.get("id") or "").strip()
            if not log_id:
                continue
            quota = _omnilojo_number(item.get("quota"))
            cost_usd = quota / quota_per_usd
            cost_cny = cost_usd * cny_per_usd
            external_username = str(item.get("username") or "")
            # A New API token can be shared by several MediaForge users. Do not invent attribution.
            cur.execute("SELECT id,org_id FROM users WHERE username=%s", (external_username,))
            user = cur.fetchone()
            created_at = int(_omnilojo_number(item.get("created_at")) * 1000)
            if created_at <= 0:
                created_at = now
            request_id, upstream_request_id = _omnilojo_request_ids(item)
            cur.execute(
                """INSERT INTO omnilojo_usage_records(id,provider_id,upstream_log_id,request_id,upstream_request_id,user_id,org_id,external_username,token_name,model,quota,cost_usd,total_money_cny,prompt_tokens,completion_tokens,status,created_at,raw_log,inserted_at,updated_at)
                   VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'succeeded',%s,%s,%s,%s)
                   ON CONFLICT(provider_id,upstream_log_id) DO UPDATE SET request_id=EXCLUDED.request_id,upstream_request_id=EXCLUDED.upstream_request_id,quota=EXCLUDED.quota,cost_usd=EXCLUDED.cost_usd,total_money_cny=EXCLUDED.total_money_cny,prompt_tokens=EXCLUDED.prompt_tokens,completion_tokens=EXCLUDED.completion_tokens,raw_log=EXCLUDED.raw_log,updated_at=EXCLUDED.updated_at""",
                (new_id(), provider["id"], log_id, request_id, upstream_request_id, user["id"] if user else "", user["org_id"] if user else None, external_username,
                 str(item.get("token_name") or ""), str(item.get("model_name") or ""), str(quota), str(cost_usd), str(cost_cny),
                 int(_omnilojo_number(item.get("prompt_tokens"))), int(_omnilojo_number(item.get("completion_tokens"))), created_at, json_value(item), now, now),
            )
            imported += 1
    return imported


def omnilojo_usage_dashboard(month: str | None = None, limit: int = 100) -> dict[str, Any]:
    month = month or current_billing_month()
    start, end = _month_range(month)
    limit = max(1, min(500, int(limit)))
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("""SELECT x.upstream_log_id,x.request_id,x.upstream_request_id,x.provider_id,x.user_id,COALESCE(u.username,x.external_username,'未分配') AS username,x.org_id,COALESCE(o.name,'未分配') AS organization_name,x.token_name,x.model,x.quota,x.cost_usd,x.total_money_cny,x.prompt_tokens,x.completion_tokens,x.created_at FROM omnilojo_usage_records x LEFT JOIN users u ON u.id=x.user_id LEFT JOIN organizations o ON o.id=x.org_id WHERE x.created_at>=%s AND x.created_at<%s ORDER BY x.created_at DESC LIMIT %s""", (start, end, limit))
        records = [dict(row) for row in cur.fetchall()]
    for record in records:
        for key in ("quota", "cost_usd", "total_money_cny"):
            record[key] = _number(_decimal(record[key]))
        record["source"] = "omnilojo"
    return {"month": month, "records": records}
