import os
import subprocess
import sys

import pytest
from pydantic import ValidationError

from app.public_media.config import Disabled, Settings, load_settings
from app.public_media.contracts import SourceRequest, internal_file_id, new_token, scrub, token_digest
from app.public_media.http_stream import InvalidRange, selection


def test_configuration(monkeypatch):
    with pytest.raises(Disabled):
        Settings().require_writer()
    for kwargs in (
        {"base_url": "http://example.com"},
        {"base_url": "https://user:x@example.com"},
        {"ttl": 9000},
        {"concurrency": 65},
        {"chunk_bytes": 2**21},
        {"prefixes": ("bucket/*",)},
    ):
        with pytest.raises(ValueError):
            Settings(**kwargs)
    monkeypatch.setenv("PUBLIC_VIDEO_ENABLED", "yes")
    with pytest.raises(ValueError):
        load_settings()


def test_independent_import():
    env = {
        k: v
        for k, v in os.environ.items()
        if k not in ("APP_SECRET_KEY", "DATABASE_URL") and not k.startswith("PUBLIC_VIDEO_")
    }
    subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; import app.public_media.gateway; assert 'main' not in sys.modules; assert 'app.config' not in sys.modules",
        ],
        env=env,
        check=True,
        capture_output=True,
    )


def test_capabilities_and_internal_origins():
    token, digest = new_token()
    assert len(token) == 43 and len(digest) == 64 and token_digest(token) == digest
    assert token_digest("short") is None
    assert internal_file_id("/api/files/a/preview") == "a"
    assert internal_file_id("https://app.test/api/files/a/preview", ("https://app.test",)) == "a"
    for url in ("https://evil.test/api/files/a", "//evil.test/api/files/a", "/api/files/a?token=x", "/api/files/../a"):
        assert internal_file_id(url, ("https://app.test",)) is None
    assert token not in scrub({"raw": f"https://media.test/fetch/v1/{'a' * 32}/video.mp4?token={token}"})["raw"]
    with pytest.raises(ValidationError):
        SourceRequest(file_id="a", task_id="t", provider_id="p", owner_id="bob")


@pytest.mark.parametrize(
    "header,expected",
    [
        ("", (0, 10, 200)),
        ("bytes=1-3", (1, 3, 206)),
        ("bytes=7-", (7, 3, 206)),
        ("bytes=-3", (7, 3, 206)),
        ("bytes=-30", (0, 10, 206)),
        ("bytes=0-99", (0, 10, 206)),
    ],
)
def test_ranges(header, expected):
    assert selection(10, header, "", '"etag"', "GET") == expected


@pytest.mark.parametrize(
    "header", ["bytes=10-", "bytes=3-1", "bytes=0-1,4-5", "bytes=-0", "bytes=", "items=0-1", "bytes=" + "9" * 101 + "-"]
)
def test_invalid_ranges(header):
    with pytest.raises(InvalidRange):
        selection(10, header, "", '"etag"', "GET")
    assert selection(10, header, "", '"etag"', "HEAD") == (0, 10, 200)
    assert selection(10, header, '"different"', '"etag"', "GET") == (0, 10, 200)
