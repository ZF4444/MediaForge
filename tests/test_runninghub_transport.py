import asyncio

import httpx
import pytest

from app.ai.adapters.runninghub_protocol import extract_outputs, fail_reason, normalized_status
from app.ai.adapters.runninghub_transport import RunningHubTransport


@pytest.mark.parametrize("wrapped", [False, True])
@pytest.mark.parametrize("status, results, expected", [
    ("SUCCESS", [], "FAILED"),
    ("SUCCESS", [{"fileUrl": "https://example.com/output.png"}], "SUCCESS"),
    ("RUNNING", [], "RUNNING"),
])
def test_empty_legacy_outputs_checks_full_task_status(wrapped, status, results, expected):
    requests = []

    def handle(request):
        requests.append(request)
        if request.url.path == "/task/openapi/outputs":
            return httpx.Response(200, json={"code": 0, "data": []})
        assert request.url.path == "/openapi/v2/query"
        assert request.headers["Authorization"] == "Bearer test-key"
        payload = {"taskId": "task-1", "status": status, "results": results}
        return httpx.Response(200, json={"code": 0, "data": payload} if wrapped else payload)

    adapter = RunningHubTransport(
        endpoint=lambda connection, path: "https://example.com" + path,
        headers=lambda key, body: {"Authorization": "Bearer " + key},
        client_factory=lambda **kwargs: httpx.AsyncClient(transport=httpx.MockTransport(handle), **kwargs),
        timeout=5,
    )
    raw = asyncio.run(adapter.query({}, "test-key", "task-1"))
    urls = extract_outputs(raw)
    assert normalized_status(raw, raw.get("code"), urls) == expected
    assert len(requests) == 2
    if expected == "FAILED":
        assert "未返回任何输出文件" in fail_reason(raw)


@pytest.mark.parametrize("payload", [
    {"code": 804, "msg": "APIKEY_TASK_IS_RUNNING"},
    {"code": 0, "data": [{"fileUrl": "https://example.com/output.png"}]},
])
def test_legacy_outputs_with_known_state_does_not_query_again(payload):
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json=payload)

    adapter = RunningHubTransport(
        endpoint=lambda connection, path: "https://example.com" + path,
        headers=lambda key, body: {},
        client_factory=lambda **kwargs: httpx.AsyncClient(transport=httpx.MockTransport(handle), **kwargs),
        timeout=5,
    )
    assert asyncio.run(adapter.query({}, "test-key", "task-1")) == payload
    assert len(requests) == 1
