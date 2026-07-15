import asyncio

import pytest
import urllib3

from app.services import storage
from app.services.storage import StorageUnavailableError


def test_minio_timeout_becomes_storage_unavailable(monkeypatch):
    class Client:
        def get_object(self, *_args):
            raise urllib3.exceptions.ConnectTimeoutError(None, "MinIO timed out")

    monkeypatch.setattr(storage, "_get_client", lambda: Client())
    monkeypatch.setattr(storage.time, "sleep", lambda _delay: None)

    with pytest.raises(StorageUnavailableError):
        storage.get_object_bytes("private", "asset.png")


def test_service_unavailable_handlers_return_retryable_503():
    from app.core.database import DatabaseUnavailableError
    from main import database_unavailable_exception_handler, storage_unavailable_exception_handler

    database_response = asyncio.run(database_unavailable_exception_handler(None, DatabaseUnavailableError("database down")))
    storage_response = asyncio.run(storage_unavailable_exception_handler(None, StorageUnavailableError("storage down")))

    assert database_response.status_code == 503
    assert database_response.headers["retry-after"] == "3"
    assert b'"error":"database_unavailable"' in database_response.body
    assert storage_response.status_code == 503
    assert storage_response.headers["retry-after"] == "3"
    assert b'"error":"storage_unavailable"' in storage_response.body
