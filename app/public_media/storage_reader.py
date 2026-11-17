"""Bounded synchronous S3 reader; callers run operations outside the event loop."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial

from minio import Minio
from minio.error import S3Error
from urllib3 import PoolManager, Timeout
from urllib3.util.retry import Retry

from .config import Denied, Unavailable


class FixedEndpointPool(PoolManager):
    def urlopen(self, method, url, **kwargs):
        # Never follow storage redirects or decompress object payloads implicitly.
        kwargs.update(redirect=False, decode_content=False)
        return super().urlopen(method, url, **kwargs)


class StorageReader:
    def __init__(self, settings):
        settings.require_reader()
        self.settings = settings
        self.executor = ThreadPoolExecutor(max_workers=settings.concurrency, thread_name_prefix="media-reader")
        self.http = FixedEndpointPool(
            maxsize=settings.concurrency,
            block=True,
            timeout=Timeout(connect=settings.io_timeout, read=settings.io_timeout),
            retries=Retry(total=0),
        )
        self.client = Minio(
            settings.endpoint,
            settings.access_key,
            settings.secret_key,
            secure=settings.secure,
            region="us-east-1",
            http_client=self.http,
        )

    async def run(self, function, *args):
        return await asyncio.get_running_loop().run_in_executor(self.executor, partial(function, *args))

    def check_location(self, bucket, key):
        if not any((bucket + "/" + key).startswith(prefix) for prefix in self.settings.prefixes):
            raise Denied("对象不在外发读取范围内")
        if (
            not bucket
            or not key
            or key.startswith("/")
            or any(part in (".", "..") for part in key.split("/"))
            or any(c in bucket + key for c in ("\x00", "\r", "\n", "\\"))
        ):
            raise Denied("对象位置无效")

    def snapshot(self, entry):
        bucket, key = entry["bucket"], entry["object_key"]
        self.check_location(bucket, key)
        try:
            stat = self.client.stat_object(bucket, key)
        except S3Error as exc:
            if exc.code in ("NoSuchKey", "NoSuchVersion", "AccessDenied", "NoSuchBucket"):
                raise Denied("视频不可读取") from exc
            raise Unavailable("存储暂不可用") from exc
        except Exception as exc:
            raise Unavailable("存储暂不可用") from exc
        version = stat.version_id or ""
        if version == "null":
            version = ""
        if not version and not self.settings.immutable:
            raise Denied("视频未固定版本，且尚未确认对象不可覆盖")
        ext = str(entry.get("ext") or "").lower().lstrip(".")
        mime = entry.get("content_type") or entry.get("mime_type")
        if ext not in ("mp4", "mov") or mime not in ("video/mp4", "video/quicktime"):
            raise Denied("仅支持已验证的 MP4/MOV 视频")
        if (
            not stat.size
            or stat.size > self.settings.max_bytes
            or int(entry.get("size") or entry.get("size_bytes") or 0) != stat.size
        ):
            raise Denied("视频大小无效或已变化")
        snapshot = {
            "bucket": bucket,
            "object_key": key,
            "version_id": version,
            "object_etag": stat.etag,
            "size_bytes": stat.size,
            "ext": ext,
        }
        response = self.open(snapshot, 0, min(64, stat.size))
        try:
            header = response.read(min(64, stat.size), decode_content=False)
        finally:
            self.release(response)
        box = header[4:8]
        if len(header) < 12 or box not in (b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip"):
            raise Denied("文件不具备 MP4/MOV 容器头")
        if box == b"ftyp":
            brand = header[8:12]
            if brand in (b"avif", b"avis", b"heic", b"heix", b"mif1") or (ext == "mp4" and brand == b"qt  "):
                raise Denied("文件容器类型与声明不符")
        elif ext != "mov":
            raise Denied("MP4 缺少格式标识")
        return snapshot

    def verify(self, source):
        self.check_location(source["bucket"], source["object_key"])
        version = source["version_id"] or None
        if not version and not self.settings.immutable:
            raise Denied("对象缺少固定版本")
        try:
            stat = self.client.stat_object(source["bucket"], source["object_key"], version_id=version)
        except S3Error as exc:
            if exc.code in ("NoSuchKey", "NoSuchVersion", "AccessDenied", "NoSuchBucket"):
                raise Denied("视频不可读取") from exc
            raise Unavailable("存储暂不可用") from exc
        except Exception as exc:
            raise Unavailable("存储暂不可用") from exc
        if stat.size != source["size_bytes"] or stat.etag != source["object_etag"]:
            raise Denied("视频对象已变化")

    def open(self, source, start, length):
        self.check_location(source["bucket"], source["object_key"])
        try:
            response = self.client.get_object(
                source["bucket"],
                source["object_key"],
                version_id=source["version_id"] or None,
                offset=start,
                length=length,
                request_headers={"If-Match": '"' + source["object_etag"] + '"'},
            )
        except S3Error as exc:
            if exc.code in (
                "NoSuchKey",
                "NoSuchVersion",
                "PreconditionFailed",
                "AccessDenied",
                "InvalidRange",
                "NoSuchBucket",
            ):
                raise Denied("视频不可读取") from exc
            raise Unavailable("存储暂不可用") from exc
        except Exception as exc:
            raise Unavailable("存储暂不可用") from exc
        if (
            response.headers.get("ETag", "").strip('"') != source["object_etag"]
            or int(response.headers.get("Content-Length", -1)) != length
        ):
            self.release(response)
            raise Denied("视频对象已变化")
        return response

    @staticmethod
    def release(response):
        try:
            response.close()
        finally:
            response.release_conn()

    def close(self):
        self.http.clear()
        self.executor.shutdown(wait=True, cancel_futures=True)
