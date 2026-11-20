import asyncio
import io

import pytest

from app.routers import local_assets

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
def saved(monkeypatch):
    calls = []

    def fake_save_media_fileobj(category, filename, fileobj, length, **kwargs):
        calls.append({"category": category, "filename": filename, "content": fileobj.read(), **kwargs})
        return {"entry": {"url": "/api/files/f1/preview", "file_id": "f1", "filename": filename, "kind": "video"}}

    monkeypatch.setattr(local_assets, "save_media_fileobj", fake_save_media_fileobj)
    return calls


@pytest.mark.parametrize(
    ("head", "expected"),
    [(QUICKTIME_HEAD, "mov"), (MP4_HEAD, "mp4"), (b"\x00\x00\x00\x08free" + b"\x00" * 20, ""), (b"short", "")],
)
def test_sniff_video_container(head, expected):
    assert local_assets._sniff_video_container(io.BytesIO(head)) == expected


def test_sniff_restores_stream_position():
    stream = io.BytesIO(QUICKTIME_HEAD + b"tail")
    stream.seek(5)
    local_assets._sniff_video_container(stream)
    assert stream.tell() == 5


def test_ai_upload_relabels_quicktime_declared_as_mp4(saved):
    upload = DummyUploadFile("trip.mp4", QUICKTIME_HEAD + b"data", "video/mp4")

    result = asyncio.run(local_assets.upload_ai_reference([upload]))

    assert saved[0]["filename"].endswith(".mov")
    assert saved[0]["content_type"] == "video/quicktime"
    assert saved[0]["content"] == QUICKTIME_HEAD + b"data"
    assert result["files"][0]["name"] == "trip.mp4"


def test_ai_upload_relabels_when_only_mime_declares_mp4(saved):
    upload = DummyUploadFile("trip", QUICKTIME_HEAD, "video/mp4")

    asyncio.run(local_assets.upload_ai_reference([upload]))

    assert saved[0]["filename"].endswith(".mov")
    assert saved[0]["content_type"] == "video/quicktime"


def test_ai_upload_keeps_genuine_mp4(saved):
    upload = DummyUploadFile("clip.mp4", MP4_HEAD, "video/mp4")

    asyncio.run(local_assets.upload_ai_reference([upload]))

    assert saved[0]["filename"].endswith(".mp4")
    assert saved[0]["content_type"] == "video/mp4"


def test_ai_upload_keeps_real_mov(saved):
    upload = DummyUploadFile("clip.mov", QUICKTIME_HEAD, "video/quicktime")

    asyncio.run(local_assets.upload_ai_reference([upload]))

    assert saved[0]["filename"].endswith(".mov")
    assert saved[0]["content_type"] == "video/quicktime"


def test_ai_upload_leaves_unrecognised_video_untouched(saved):
    upload = DummyUploadFile("clip.mp4", b"\x1aE\xdf\xa3webm-ish-data", "video/mp4")

    asyncio.run(local_assets.upload_ai_reference([upload]))

    assert saved[0]["filename"].endswith(".mp4")
    assert saved[0]["content_type"] == "video/mp4"


def test_ai_upload_does_not_sniff_images(saved):
    upload = DummyUploadFile("pic.png", QUICKTIME_HEAD, "image/png")

    asyncio.run(local_assets.upload_ai_reference([upload]))

    assert saved[0]["filename"].endswith(".png")
    assert saved[0]["content_type"] == "image/png"


def test_local_assets_upload_relabels_quicktime_declared_as_mp4(saved):
    upload = DummyUploadFile("我的 视频.mp4", QUICKTIME_HEAD, "video/mp4")

    asyncio.run(local_assets.upload_local_assets([upload]))

    assert saved[0]["category"] == "uploads"
    assert saved[0]["filename"].endswith(".mov")
    assert saved[0]["content_type"] == "video/quicktime"
