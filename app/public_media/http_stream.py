"""HTTP range handling, deliberately separate from authentication and storage."""

import hashlib
import re

from .contracts import MIME

SAFE_HEADERS = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff"}


class InvalidRange(Exception):
    pass


def selection(size, range_value="", if_range="", etag="", method="GET"):
    if method == "HEAD" or not range_value or (if_range and if_range != etag):
        return 0, size, 200
    if len(range_value) > 100:
        raise InvalidRange()
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_value)
    if not match or not any(match.groups()):
        raise InvalidRange()
    left, right = match.groups()
    if not left:
        if int(right) < 1:
            raise InvalidRange()
        start, end = max(0, size - int(right)), size - 1
    else:
        start, end = int(left), min(int(right), size - 1) if right else size - 1
    if size < 1 or start >= size or start > end:
        raise InvalidRange()
    return start, end - start + 1, 206


def response_headers(source, start=0, length=None, status=200):
    size = int(source["size_bytes"])
    headers = {
        **SAFE_HEADERS,
        "Accept-Ranges": "bytes",
        "Content-Type": MIME[source["ext"]],
        "Content-Length": str(size if length is None else length),
        "ETag": strong_etag(source),
    }
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{start + length - 1}/{size}"
    return headers


def strong_etag(source):
    identity = "|".join(str(source[k]) for k in ("id", "version_id", "object_etag", "size_bytes"))
    return '"' + hashlib.sha256(identity.encode()).hexdigest() + '"'
