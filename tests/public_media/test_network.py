"""Real sockets + private Uvicorn/Nginx processes; no production ports or calls."""

import hashlib
import io
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from contextlib import contextmanager
from dataclasses import replace
from pathlib import Path

import httpx
import psycopg
import pytest

from app.public_media.contracts import new_token

from .conftest import port, source


@contextmanager
def gateway(real, **overrides):
    settings = replace(real["settings"], **overrides)
    listen_port = port()
    root = real["root"]
    log_path = root / f"gateway-{listen_port}.log"
    env = {
        "PATH": os.environ["PATH"],
        "LANG": "C.UTF-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PUBLIC_VIDEO_ENABLED": "true",
        "PUBLIC_VIDEO_VALIDATOR_DSN": settings.validator_dsn,
        "PUBLIC_VIDEO_MINIO_ENDPOINT": settings.endpoint,
        "PUBLIC_VIDEO_MINIO_ACCESS_KEY": settings.access_key,
        "PUBLIC_VIDEO_MINIO_SECRET_KEY": settings.secret_key,
        "PUBLIC_VIDEO_MINIO_SECURE": "false",
        "PUBLIC_VIDEO_PREFIXES": ",".join(settings.prefixes),
        "PUBLIC_VIDEO_DOWNLOAD_CONCURRENCY": str(settings.concurrency),
        "PUBLIC_VIDEO_DOWNLOAD_TIMEOUT_SECONDS": str(settings.timeout),
        "PUBLIC_VIDEO_IO_TIMEOUT_SECONDS": str(settings.io_timeout),
    }
    with log_path.open("wb") as log:
        process = subprocess.Popen(
            [
                os.getenv("PUBLIC_VIDEO_TEST_GATEWAY_PYTHON", sys.executable),
                "-m",
                "uvicorn",
                "app.public_media.gateway:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(listen_port),
                "--no-access-log",
                "--no-proxy-headers",
            ],
            env=env,
            stdout=log,
            stderr=log,
        )
        try:
            base = f"http://127.0.0.1:{listen_port}"
            for _ in range(100):
                try:
                    if httpx.get(base + "/health/live", timeout=0.2).status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                time.sleep(0.05)
            else:
                raise AssertionError("Isolated gateway startup failed")
            yield {"base": base, "port": listen_port, "process": process, "log": log_path}
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


@contextmanager
def nginx(real, upstream_port, host="localhost"):
    binary = os.getenv("PUBLIC_VIDEO_TEST_NGINX") or shutil.which("nginx")
    private_binary = Path(".runtime/public-media-tools/extracted/usr/sbin/nginx").resolve()
    if not binary and private_binary.exists():
        binary = str(private_binary)
    assert binary, "Full integration requires a local nginx executable (PUBLIC_VIDEO_TEST_NGINX)"
    root = real["root"] / f"nginx-{port()}"
    root.mkdir()
    cert, key = root / "cert.pem", root / "key.pem"
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            str(key),
            "-out",
            str(cert),
            "-subj",
            f"/CN={host}",
            "-addext",
            "subjectAltName=DNS:localhost" if host == "localhost" else f"subjectAltName=IP:{host}",
            "-days",
            "1",
        ],
        check=True,
        capture_output=True,
    )
    listen_port = port()
    from scripts.public_media.render_nginx import render

    replacements = {
        "LISTEN": f"127.0.0.1:{listen_port}",
        "HOST": host,
        "CERT": str(cert),
        "KEY": str(key),
        "ACCESS_LOG": str(root / "access.log"),
        "UPSTREAM": f"127.0.0.1:{upstream_port}",
    }
    config = render(replacements)
    conf_path = root / "nginx.conf"
    temp_paths = "\n".join(
        f"{kind}_temp_path {root}/{kind};" for kind in ("client_body", "proxy", "fastcgi", "uwsgi", "scgi")
    )
    conf_path.write_text(
        f"pid {root}/nginx.pid;\nerror_log {root}/master.log crit;\nevents {{ worker_connections 128; }}\nhttp {{\n{temp_paths}\n{config}\n}}"
    )
    subprocess.run([binary, "-p", str(root), "-c", str(conf_path), "-t"], check=True, capture_output=True)
    with (root / "process.log").open("wb") as log:
        process = subprocess.Popen(
            [binary, "-p", str(root), "-c", str(conf_path), "-g", "daemon off;"], stdout=log, stderr=log
        )
        try:
            for _ in range(100):
                try:
                    with socket.create_connection(("127.0.0.1", listen_port), timeout=0.2):
                        break
                except OSError:
                    time.sleep(0.02)
            yield {"base": f"https://{host}:{listen_port}", "root": root, "cert": str(cert), "port": listen_port}
        finally:
            process.terminate()
            process.wait(timeout=5)


def issue(real, row, key="socket-test-123"):
    token, digest = new_token()
    grant = real["writer"].issue(row["id"], "alice", digest, key, 1800)
    return grant, token, f"/fetch/v1/{grant['id']}/video.mp4?token={token}"


def events(real, grant_id):
    with psycopg.connect(real["admin_dsn"]) as conn:
        return conn.execute(
            "SELECT reason,bytes_read,bytes_sent FROM media.media_access_events WHERE grant_id=%s", (grant_id,)
        ).fetchall()


def rss(pid):
    for line in Path(f"/proc/{pid}/status").read_text().splitlines():
        if line.startswith("VmRSS:"):
            return int(line.split()[1]) * 1024
    raise AssertionError("RSS unavailable")


def test_nginx_https_supplier_download_and_no_secret_logs(real):
    row = source(real)
    grant, token, path = issue(real, row)
    with gateway(real) as gw, nginx(real, gw["port"]) as edge:
        with httpx.Client(verify=edge["cert"], trust_env=False) as supplier:
            url = edge["base"] + path
            head = supplier.head(url)
            assert head.status_code == 200 and head.content == b""
            request_id = head.headers["x-request-id"]
            assert len(request_id) == 32 and all(char in "0123456789abcdef" for char in request_id)
            first = supplier.get(url, headers={"Range": "bytes=0-127"})
            assert first.status_code == 206 and first.content == real["content"][:128]
            entire = supplier.get(url)
            assert hashlib.sha256(entire.content).digest() == hashlib.sha256(real["content"]).digest()
            assert entire.headers["content-type"] == "video/mp4"
            assert entire.headers["cache-control"] == "no-store"
            for other_path in (
                "/api/files/file-a/preview",
                "/health/live",
                "/health/metrics",
                "/docs",
                "/openapi.json",
                "/api/public-video-grants",
            ):
                assert supplier.get(edge["base"] + other_path).status_code == 404
            assert supplier.get(url.replace(token, "0" * 43)).status_code == 404
            rejected_method = supplier.post(url)
            assert rejected_method.status_code == 405 and rejected_method.headers["allow"] == "GET, HEAD"
            try:
                response = supplier.get(url, headers={"Host": "other.test"})
                assert response.status_code >= 400
            except httpx.RemoteProtocolError:
                pass  # default vhost intentionally closes with 444
            with httpx.Client(verify=False, trust_env=False) as wrong_sni:
                with pytest.raises(httpx.RemoteProtocolError):
                    wrong_sni.get(f"https://127.0.0.1:{edge['port']}" + path, headers={"Host": "localhost"})
            assert (
                supplier.get(
                    url,
                    headers={"X-Forwarded-Host": "evil.test", "X-Forwarded-For": "1.2.3.4", "Cookie": "sid=untrusted"},
                ).content
                == real["content"]
            )
            real["writer"].revoke(grant["id"], "alice")
            assert supplier.get(url).status_code == 404
        time.sleep(0.05)
        all_logs = gw["log"].read_text() + "".join(p.read_text() for p in edge["root"].glob("*.log"))
        assert token not in all_logs and "token=" not in all_logs and "allowed/input.mp4" not in all_logs
        assert request_id in all_logs
        with psycopg.connect(real["admin_dsn"]) as conn:
            assert (
                conn.execute(
                    "SELECT method FROM media.media_access_events WHERE request_id=%s", (request_id,)
                ).fetchone()[0]
                == "HEAD"
            )
        assert "proxy_buffering off" in (edge["root"] / "nginx.conf").read_text()


@pytest.mark.parametrize("concurrency", [2, 16])
def test_real_socket_disconnect_backpressure_timeout_and_memory(real, concurrency):
    content = real["content"] + b"a-video-test-block-" * (4 * 1024 * 1024)  # large synthetic container fixture
    real["admin"].put_object(
        "media-test-versioned", "allowed/large.mp4", io.BytesIO(content), len(content), content_type="video/mp4"
    )
    snapshot = real["reader"].snapshot(
        {
            "bucket": "media-test-versioned",
            "object_key": "allowed/large.mp4",
            "size": len(content),
            "ext": "mp4",
            "content_type": "video/mp4",
        }
    )
    row = real["writer"].create_source(
        dict(snapshot, owner_id="alice", file_id="large-video", task_id="large-task", provider_id="supplier")
    )
    grant, token, path = issue(real, row)
    with gateway(real, concurrency=concurrency, io_timeout=1, timeout=4) as gw:
        # Warm pools/imports before measuring the streaming working set.
        with httpx.Client(trust_env=False) as client:
            assert client.get(gw["base"] + path, headers={"Range": "bytes=0-15"}).content == content[:16]
        baseline = rss(gw["process"].pid)
        sockets = []
        try:
            for _ in range(concurrency):
                sock = socket.socket()
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1024)
                sock.connect(("127.0.0.1", gw["port"]))
                sock.sendall(f"GET {path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n".encode())
                assert b"200 OK" in sock.recv(512)
                sockets.append(sock)
            assert httpx.head(gw["base"] + path, timeout=1).status_code == 429
            peak = rss(gw["process"].pid)
            peak_threads = len(list(Path(f"/proc/{gw['process'].pid}/task").iterdir()))
            peak_fds = len(list(Path(f"/proc/{gw['process'].pid}/fd").iterdir()))
            metrics = httpx.get(gw["base"] + "/health/metrics", timeout=1).json()
            assert metrics["active_downloads"] == concurrency
            assert metrics["database_pool"]["pool_size"] <= 4
            assert metrics["database_pool"]["requests_waiting"] == 0
            assert peak - baseline < 48 * 1024 * 1024
            cleanup_started = time.monotonic()
            sockets[0].close()  # Abrupt disconnect while response remains unread.
            deadline = time.monotonic() + 6
            while time.monotonic() < deadline:
                records = events(real, grant["id"])
                if len([record for record in records if record[0] != "complete"]) >= concurrency:
                    break
                time.sleep(0.1)
            assert len(records) >= concurrency + 1, "All response slots must be reclaimed"
            slow = [record for record in records if record[0] != "complete"]
            assert len(slow) >= concurrency and all(record[1] < 12 * 1024 * 1024 for record in slow), records
            assert any(record[0] == "timeout" for record in slow)
            assert httpx.head(gw["base"] + path, timeout=2).status_code == 200
            assert rss(gw["process"].pid) - baseline < 48 * 1024 * 1024
            stats = {
                "concurrency": concurrency,
                "file_bytes": len(content),
                "baseline_rss": baseline,
                "peak_rss": peak,
                "cleanup_seconds": round(time.monotonic() - cleanup_started, 3),
                "peak_sample_threads": peak_threads,
                "peak_sample_open_fds": peak_fds,
                "peak_download_slots": metrics["peak_active_downloads"],
                "database_connections": metrics["database_pool"]["pool_size"],
                "database_waiting": metrics["database_pool"]["requests_waiting"],
                "reclaimed_download_slots": httpx.get(gw["base"] + "/health/metrics").json()["active_downloads"],
                "max_read_bytes": max(record[1] for record in slow),
            }
            artifact = Path(f".runtime/public-media-network-{concurrency}.json")
            artifact.parent.mkdir(exist_ok=True)
            artifact.write_text(json.dumps(stats, indent=2))
            # No filesystem copy of the source can be produced by the gateway.
            assert not list(real["root"].glob("gateway-*/*.mp4"))
        finally:
            for sock in sockets:
                sock.close()
        assert token not in gw["log"].read_text()


def test_ip_https_without_sni_keeps_download_boundaries(real):
    row = source(real)
    grant, token, path = issue(real, row)
    with gateway(real) as gw, nginx(real, gw["port"], host="127.0.0.1") as edge:
        with httpx.Client(verify=edge["cert"], trust_env=False) as client:
            url = edge["base"] + path
            assert client.head(url).status_code == 200
            assert client.get(url, headers={"Range": "bytes=0-127"}).content == real["content"][:128]
            assert client.get(url).content == real["content"]
            assert client.post(url).status_code == 405
            assert client.get(edge["base"] + "/health/ready").status_code == 404
            assert client.get(url.replace(token, "x" * len(token))).status_code == 404
            for host in ("evil.test", "127.0.0.2", "127.0.0.1.evil.test"):
                with pytest.raises(httpx.RemoteProtocolError):
                    client.get(url, headers={"Host": host})
            real["writer"].revoke(grant["id"], "alice")
            assert client.get(url).status_code == 404
        assert token not in "".join(p.read_text() for p in edge["root"].glob("*.log"))
