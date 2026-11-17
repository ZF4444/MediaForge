"""Run with uvicorn app.public_media.gateway:app --no-access-log --no-proxy-headers."""

import asyncio
import time
from contextlib import asynccontextmanager, suppress
from uuid import uuid4

from fastapi import FastAPI, Request
from starlette.responses import JSONResponse, Response

from .config import Denied, load_settings
from .contracts import ID, token_digest
from .http_stream import SAFE_HEADERS, InvalidRange, response_headers, selection, strong_etag
from .repository import Repository
from .storage_reader import StorageReader
from .telemetry import Telemetry


def create_app(settings=None, repository=None, reader=None):
    settings = settings or load_settings()
    metrics = Telemetry(settings.concurrency)

    @asynccontextmanager
    async def lifespan(app):
        app.state.slots = asyncio.Semaphore(settings.concurrency)
        try:
            if settings.enabled:
                settings.require_reader()
                app.state.repo = repository or Repository(settings.validator_dsn, settings.pool_size)
                await asyncio.to_thread(app.state.repo.ready, "validator")
                app.state.reader = reader or StorageReader(settings)
            yield
        finally:
            if settings.enabled:
                if not repository and hasattr(app.state, "repo"):
                    app.state.repo.close()
                if not reader and hasattr(app.state, "reader"):
                    app.state.reader.close()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    app.add_middleware(SafetyHeaders)

    @app.get("/health/live")
    async def live():
        return Response("ok", headers=SAFE_HEADERS)

    @app.get("/health/ready")
    async def ready():
        try:
            if settings.enabled:
                await asyncio.to_thread(app.state.repo.ready, "validator")
            return JSONResponse({"ready": True, "enabled": settings.enabled}, headers=SAFE_HEADERS)
        except Exception:
            return JSONResponse({"ready": False}, status_code=503, headers=SAFE_HEADERS)

    @app.get("/health/metrics")
    async def operational_metrics():
        # The dedicated HTTPS template does not proxy /health/*.
        return JSONResponse(metrics.snapshot(getattr(app.state, "repo", None)), headers=SAFE_HEADERS)

    @app.api_route("/fetch/v1/{grant_id}/video.{ext}", methods=["GET", "HEAD"])
    async def download(request: Request, grant_id: str, ext: str):
        entered = False
        request_id = uuid4().hex
        failure_headers = {**SAFE_HEADERS, "X-Request-ID": request_id}

        def failure(status):
            if not entered:
                metrics.finish(status, "busy" if status == 429 else "invalid")
            return Response(status_code=status, headers=failure_headers)

        if not settings.enabled or not ID.fullmatch(grant_id) or ext not in ("mp4", "mov"):
            return failure(404)
        values = request.query_params.getlist("token")
        if len(values) != 1 or len(request.query_params) != 1:
            return failure(404)
        digest = token_digest(values[0])
        if not digest:
            return failure(404)
        if request.headers.get("content-length", "0") != "0" or request.headers.get("transfer-encoding"):
            return failure(400)
        if app.state.slots.locked():
            return failure(429)
        await app.state.slots.acquire()
        entered = True
        metrics.enter()
        started = time.monotonic()
        repo = app.state.repo
        stream = None
        transferred = False
        status = 503
        ip = request.client.host if request.client else ""

        async def storage_call(function, *args, close_on_cancel=False):
            storage_started = time.monotonic()
            pending = asyncio.create_task(app.state.reader.run(function, *args))
            try:
                return await asyncio.shield(pending)
            except asyncio.CancelledError:
                # Cancelling an await cannot cancel a synchronous S3 operation.
                # Keep the admission slot until it ends and close any obtained body.
                with suppress(Exception):
                    result = await pending
                    if close_on_cancel:
                        await asyncio.to_thread(app.state.reader.release, result)
                raise
            finally:
                metrics.duration("storage_setup", time.monotonic() - storage_started)

        try:
            async with asyncio.timeout(settings.timeout):
                admission_started = time.monotonic()
                try:
                    decision = await asyncio.to_thread(repo.admit, grant_id, digest, request.method)
                finally:
                    metrics.duration("admission", time.monotonic() - admission_started)
                if not decision.get("allowed"):
                    status = 429 if decision.get("reason") == "limit" else 404
                    return failure(status)
                source = decision["source"]
                if ext != source["ext"]:
                    status = 404
                    return failure(status)
                await storage_call(app.state.reader.verify, source)
                try:
                    start, length, status = selection(
                        source["size_bytes"],
                        request.headers.get("range", ""),
                        request.headers.get("if-range", ""),
                        strong_etag(source),
                        request.method,
                    )
                except InvalidRange:
                    status = 416
                    return Response(
                        status_code=416, headers={**failure_headers, "Content-Range": f"bytes */{source['size_bytes']}"}
                    )
                headers = response_headers(source, start, length, status)
                headers["X-Request-ID"] = request_id
                if request.method == "HEAD":
                    return Response(status_code=200, headers=headers)
                stream = await storage_call(app.state.reader.open, source, start, length, close_on_cancel=True)
                response = BinaryStream(
                    stream,
                    length,
                    headers,
                    status,
                    settings,
                    app.state.slots,
                    repo,
                    grant_id,
                    request_id,
                    ip,
                    started,
                    app.state.reader.release,
                    app.state.reader.run,
                    metrics,
                )
                transferred = True
                return response
        except Denied:
            status = 404
            return failure(status)
        except Exception:
            # Dependency messages may contain credentials or internal object paths.
            status = 503
            return failure(status)
        finally:
            if not transferred:
                if stream:
                    with suppress(Exception):
                        await asyncio.to_thread(app.state.reader.release, stream)
                with suppress(Exception):
                    await asyncio.to_thread(
                        repo.audit,
                        grant_id,
                        request_id,
                        request.method,
                        status,
                        0,
                        0,
                        "head" if request.method == "HEAD" and status == 200 else "rejected",
                        ip,
                    )
                app.state.slots.release()
                metrics.duration("request", time.monotonic() - started)
                metrics.finish(
                    status, "head" if request.method == "HEAD" and status == 200 else "rejected", entered=True
                )

    return app


class BinaryStream(Response):
    def __init__(
        self,
        stream,
        length,
        headers,
        status,
        settings,
        slots,
        repo,
        grant_id,
        request_id,
        ip,
        started,
        release,
        run,
        metrics,
    ):
        super().__init__(status_code=status, headers=headers)
        self.stream = stream
        self.length = length
        self.settings = settings
        self.slots = slots
        self.repo = repo
        self.grant_id = grant_id
        self.request_id = request_id
        self.ip = ip
        self.started = started
        self.release = release
        self.run = run
        self.metrics = metrics
        self.read = 0
        self.sent = 0
        self.pending = None
        self.pending_counted = False

    async def __call__(self, scope, receive, send):
        reason = "interrupted"
        stopped = asyncio.Event()

        async def watch():
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    stopped.set()
                    return

        async def timed_send(message):
            async with asyncio.timeout(self.settings.io_timeout):
                await send(message)

        async def transmit():
            nonlocal reason
            remaining = self.settings.timeout - (time.monotonic() - self.started)
            async with asyncio.timeout(max(0.001, remaining)):
                await timed_send(
                    {"type": "http.response.start", "status": self.status_code, "headers": self.raw_headers}
                )
                while self.read < self.length:
                    if stopped.is_set():
                        raise asyncio.CancelledError()
                    self.pending = asyncio.create_task(
                        self.run(self.stream.read, min(self.settings.chunk_bytes, self.length - self.read))
                    )
                    self.pending_counted = False
                    read_started = time.monotonic()
                    data = await asyncio.shield(self.pending)
                    self.metrics.duration("storage_read", time.monotonic() - read_started)
                    if not data:
                        reason = "upstream_eof"
                        raise OSError("incomplete video")
                    self.read += len(data)
                    self.pending_counted = True
                    if stopped.is_set():
                        raise asyncio.CancelledError()
                    await timed_send({"type": "http.response.body", "body": data, "more_body": True})
                    self.sent += len(data)
                await send({"type": "http.response.body", "body": b"", "more_body": False})
                reason = "complete"

        watcher = asyncio.create_task(watch())
        transmitter = asyncio.create_task(transmit())
        try:
            done, _ = await asyncio.wait((watcher, transmitter), return_when=asyncio.FIRST_COMPLETED)
            if transmitter in done:
                await transmitter
            else:
                reason = "disconnected"
        except TimeoutError:
            reason = "timeout"
        except asyncio.CancelledError:
            reason = "disconnected"
            raise
        except Exception:
            if reason == "interrupted":
                reason = "upstream_error"
            # Incomplete Content-Length closes the connection, never sends a success tail.
            raise RuntimeError("video transfer interrupted") from None
        finally:
            stopped.set()
            watcher.cancel()
            transmitter.cancel()
            await asyncio.gather(watcher, transmitter, return_exceptions=True)
            with suppress(Exception):
                await asyncio.to_thread(self.release, self.stream)
            if self.pending:
                with suppress(Exception, asyncio.CancelledError):
                    data = await asyncio.shield(self.pending)
                    if not self.pending_counted:
                        self.read += len(data)
            with suppress(Exception):
                await asyncio.to_thread(
                    self.repo.audit,
                    self.grant_id,
                    self.request_id,
                    "GET",
                    self.status_code,
                    self.read,
                    self.sent,
                    reason,
                    self.ip,
                )
            self.slots.release()
            self.metrics.duration("request", time.monotonic() - self.started)
            self.metrics.finish(self.status_code, reason, self.read, self.sent, entered=True)


class SafetyHeaders:
    """Pure ASGI middleware preserves backpressure and disconnect semantics."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        async def safe_send(message):
            if message["type"] == "http.response.start":
                headers = dict(message.get("headers", []))
                headers.update({key.lower().encode(): value.encode() for key, value in SAFE_HEADERS.items()})
                message["headers"] = list(headers.items())
            await send(message)

        await self.app(scope, receive, safe_send)


app = create_app()
