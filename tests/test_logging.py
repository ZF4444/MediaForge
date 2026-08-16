import json
import logging
import gzip

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.core.log_context import reset_log_context, set_log_context
from app.core.logging import JsonFormatter, _file_handler, configure_logging, redact
from app.middleware.request_logging import RequestLoggingMiddleware


class _ListHandler(logging.Handler):
    def __init__(self):
        super().__init__()
        self.records = []
        self.payloads = []

    def emit(self, record):
        self.records.append(record)
        self.payloads.append(json.loads(JsonFormatter().format(record)))


def test_json_formatter_adds_context_and_redacts_secrets():
    token = set_log_context(request_id="req_test123", trace_id="trc_test123", user_id="alice")
    try:
        record = logging.LogRecord("aistudio.app.test", logging.INFO, __file__, 1, "provider called", (), None)
        record.event = "provider_called"
        record.api_key = "abcd1234567890wxyz"
        record.provider = "runninghub"
        payload = json.loads(JsonFormatter().format(record))
    finally:
        reset_log_context(token)

    assert payload["event"] == "provider_called"
    assert payload["request_id"] == "req_test123"
    assert payload["user_id"] == "alice"
    assert payload["provider"] == "runninghub"
    assert payload["api_key"] == "abcd***wxyz"
    assert redact({"path": "/api/providers", "request_id": "req_123456789012345678901234"}) == {
        "path": "/api/providers",
        "request_id": "req_123456789012345678901234",
    }


def test_redact_handles_nested_credentials_and_absolute_paths():
    value = redact({"Authorization": "Bearer abcdefghijklmnop", "file_path": "/srv/private/image.png"})
    assert value["Authorization"] == "Bear***mnop"
    assert value["file_path"] == "image.png"
    excerpt = redact('{"api_key":"abcdefghijklmnop","token":"qrstuvwxyz123456"}')
    assert excerpt == '{"api_key":"abcd***mnop","token":"qrst***3456"}'


def test_request_middleware_emits_access_record_and_request_id_header():
    configure_logging()
    root = logging.getLogger("aistudio")
    capture = _ListHandler()
    root.addHandler(capture)

    test_app = FastAPI()

    @test_app.middleware("http")
    async def fake_auth(request: Request, call_next):
        request.state.user_id = "alice"
        request.state.username = "Alice"
        return await call_next(request)

    test_app.add_middleware(RequestLoggingMiddleware)

    @test_app.get("/probe")
    async def probe():
        return {"ok": True}

    try:
        response = TestClient(test_app).get("/probe", headers={"X-Request-ID": "req_client123"})
    finally:
        root.removeHandler(capture)

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "req_client123"
    access = next(record for record in capture.records if record.name == "aistudio.access")
    assert access.event == "http_request"
    assert access.status_code == 200
    assert access.path == "/probe"
    access_payload = next(payload for payload in capture.payloads if payload["logger"] == "aistudio.access")
    assert access_payload["user_id"] == "alice"
    assert access_payload["username"] == "Alice"


def test_successful_quiet_poll_is_suppressed_but_error_is_logged():
    configure_logging()
    root = logging.getLogger("aistudio")
    capture = _ListHandler()
    root.addHandler(capture)
    test_app = FastAPI()
    test_app.add_middleware(RequestLoggingMiddleware)

    @test_app.get("/api/canvases")
    async def canvases(fail: bool = False):
        if fail:
            from fastapi import HTTPException
            raise HTTPException(status_code=503)
        return {"total": 0}

    try:
        client = TestClient(test_app)
        assert client.get("/api/canvases").status_code == 200
        assert not [record for record in capture.records if record.name == "aistudio.access"]
        assert client.get("/api/canvases?fail=true").status_code == 503
    finally:
        root.removeHandler(capture)

    access = [record for record in capture.records if record.name == "aistudio.access"]
    assert len(access) == 1
    assert access[0].status_code == 503


def test_daily_rotation_compresses_log(tmp_path):
    handler = _file_handler(tmp_path, "app", 2)
    record = logging.LogRecord("aistudio.app.test", logging.INFO, __file__, 1, "rotate me", (), None)
    record.event = "rotation_probe"
    handler.emit(record)
    handler.doRollover()
    handler.close()

    archives = list(tmp_path.glob("app.log.*.gz"))
    assert len(archives) == 1
    with gzip.open(archives[0], "rt", encoding="utf-8") as stream:
        assert json.loads(stream.readline())["event"] == "rotation_probe"
