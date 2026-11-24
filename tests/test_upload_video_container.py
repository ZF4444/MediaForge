import asyncio
import io

import pytest

from app.routers import local_assets
from app.services import storage

QUICKTIME_HEAD = b"\x00\x00\x00\x14ftypqt  \x00\x00\x00\x00qt  \x00\x00\x00\x08wide"
MP4_HEAD = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom\x00\x00\x00\x08free"


class DummyUploadFile:
    def __init__(self, filename, content, content_type):
        self.filename = filename
        self._content = content
        self._offset = 0
        self.content_type = content_type

    async def read(self, size=-1):
        end = None if size is None or size < 0 else self._offset + size
        chunk = self._content[self._offset : end]
        self._offset += len(chunk)
        return chunk


@pytest.fixture
def stored(monkeypatch):
    """Capture what the shared storage entry points hand to the object store and registry."""
    calls = []
    monkeypatch.setattr(storage, "enforce_storage_quota", lambda *_a, **_k: None)
    monkeypatch.setattr(storage, "check_storage_quota", lambda *_a, **_k: None)
    monkeypatch.setattr(storage, "ensure_media_derivatives", lambda *_a, **_k: None)

    def fake_save(payload_or_file, object_key, *args, **kwargs):
        content = payload_or_file if isinstance(payload_or_file, bytes) else payload_or_file.read()
        calls.append({"object_key": object_key, "content": content, "storage_content_type": kwargs.get("content_type")})
        return {"bucket": "private", "object_key": object_key, "size": len(content), "etag": "", "version_id": ""}

    def fake_register(url, bucket, object_key, **kwargs):
        calls[-1].update(filename=kwargs["filename"], content_type=kwargs["content_type"], original_name=kwargs["original_name"])
        return {"url": url, "file_id": kwargs["file_id"], **kwargs}

    monkeypatch.setattr(storage, "save_bytes", fake_save)
    monkeypatch.setattr(storage, "save_fileobj", lambda fobj, key, length, **kw: fake_save(fobj, key, **kw))
    monkeypatch.setattr(storage, "register_media_url", fake_register)
    return calls


@pytest.mark.parametrize(
    ("head", "expected"),
    [(QUICKTIME_HEAD, "mov"), (MP4_HEAD, "mp4"), (b"\x00\x00\x00\x08free" + b"\x00" * 20, ""), (b"short", "")],
)
def test_video_container_from_header(head, expected):
    assert storage._video_container_from_header(head) == expected


def test_read_fileobj_header_restores_stream_position():
    stream = io.BytesIO(QUICKTIME_HEAD + b"tail")
    stream.seek(5)
    assert storage._read_fileobj_header(stream) == (QUICKTIME_HEAD + b"tail")[:16]
    assert stream.tell() == 5


def test_workflow_output_bytes_quicktime_named_mp4_is_relabelled(stored):
    """RunningHub/ComfyUI outputs go through save_media_bytes with the upstream .mp4 name."""
    storage.save_media_bytes(
        "output",
        "QQ842850240__00001_ojods_1795497140.mp4",
        QUICKTIME_HEAD + b"data",
        original_name="QQ842850240__00001_ojods_1795497140.mp4",
        content_type="video/mp4",
        kind="video",
        source="generated",
    )

    assert stored[0]["filename"].endswith(".mov")
    assert stored[0]["object_key"].endswith(".mov")
    assert stored[0]["content_type"] == "video/quicktime"
    assert stored[0]["storage_content_type"] == "video/quicktime"
    assert stored[0]["content"] == QUICKTIME_HEAD + b"data"
    # The display name is not rewritten.
    assert stored[0]["original_name"] == "QQ842850240__00001_ojods_1795497140.mp4"


def test_remote_video_download_is_relabelled(stored, monkeypatch):
    """save_remote_video_to_output forces a .mp4 name and video/mp4 when the source says nothing."""
    from app.core import media

    class Response:
        content = QUICKTIME_HEAD + b"data"
        headers = {}

        def raise_for_status(self):
            pass

    class Client:
        async def get(self, _url):
            return Response()

    class Context:
        async def __aenter__(self):
            return Client()

        async def __aexit__(self, *_exc):
            return False

    monkeypatch.setattr(media, "shared_http_client", lambda **_kw: Context())

    async def inline(function, *args, **kwargs):
        return function(*args, **kwargs)

    monkeypatch.setattr(media, "run_storage_io", inline)

    asyncio.run(media.save_remote_video_to_output("https://cdn.example.com/out/clip"))

    assert stored[0]["filename"].endswith(".mov")
    assert stored[0]["content_type"] == "video/quicktime"


@pytest.mark.parametrize(
    ("filename", "content_type", "kind", "content", "expected_ext", "expected_type"),
    [
        ("clip.mp4", "video/mp4", "video", MP4_HEAD, ".mp4", "video/mp4"),
        ("clip.mov", "video/quicktime", "video", QUICKTIME_HEAD, ".mov", "video/quicktime"),
        ("clip.mp4", "video/mp4", "video", b"\x1aE\xdf\xa3webm-ish-data", ".mp4", "video/mp4"),
        ("trip", "video/mp4", "video", QUICKTIME_HEAD, ".mov", "video/quicktime"),
        ("pic.png", "image/png", "image", QUICKTIME_HEAD, ".png", "image/png"),
        ("data.bin", "application/octet-stream", "file", QUICKTIME_HEAD, ".bin", "application/octet-stream"),
    ],
)
def test_only_quicktime_declared_as_mp4_is_rewritten(
    stored, filename, content_type, kind, content, expected_ext, expected_type
):
    storage.save_media_bytes("output", filename, content, content_type=content_type, kind=kind, source="generated")

    assert stored[0]["filename"].endswith(expected_ext)
    assert stored[0]["content_type"] == expected_type


def test_streamed_upload_is_relabelled_and_content_is_intact(stored):
    stream = io.BytesIO(QUICKTIME_HEAD + b"data")

    storage.save_media_fileobj(
        "uploads", "trip.mp4", stream, len(QUICKTIME_HEAD) + 4, content_type="video/mp4", kind="video"
    )

    assert stored[0]["filename"].endswith(".mov")
    assert stored[0]["content_type"] == "video/quicktime"
    assert stored[0]["content"] == QUICKTIME_HEAD + b"data"


def test_upload_endpoints_keep_display_name_and_relabel(stored):
    upload = DummyUploadFile("trip.mp4", QUICKTIME_HEAD + b"data", "video/mp4")

    result = asyncio.run(local_assets.upload_ai_reference([upload]))

    assert stored[0]["filename"].endswith(".mov")
    assert stored[0]["content_type"] == "video/quicktime"
    assert result["files"][0]["name"] == "trip.mp4"


def test_local_assets_upload_relabels_quicktime_declared_as_mp4(stored):
    upload = DummyUploadFile("我的 视频.mp4", QUICKTIME_HEAD, "video/mp4")

    asyncio.run(local_assets.upload_local_assets([upload]))

    assert stored[0]["filename"].endswith(".mov")
    assert stored[0]["content_type"] == "video/quicktime"
