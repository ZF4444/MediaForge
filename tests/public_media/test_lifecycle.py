import asyncio
from unittest.mock import MagicMock

import pytest

from app.public_media import lifecycle
from app.public_media.config import Denied, Unavailable
from app.public_media.contracts import new_token

from .conftest import source
from .test_network import issue


@pytest.mark.parametrize("scope", ["organization", "user"])
def test_disabling_budget_does_not_revoke_video_permission(monkeypatch, scope):
    from app.services import usage

    # A disabled budget removes a spending limit; it does not disable an account.
    connection = MagicMock()
    connection.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = {"id": "alice"}
    monkeypatch.setattr(usage, "metadata_connection", lambda: connection)
    barrier = MagicMock(side_effect=AssertionError("Budget updates must not revoke video grants"))
    monkeypatch.setattr(lifecycle, "barrier", barrier)
    setter = usage.set_organization_budget if scope == "organization" else usage.set_user_budget
    assert setter("alice", 100, False)["enabled"] is False
    barrier.assert_not_called()


def test_file_delete_revokes_before_storage_and_blocks_late_signer(real, monkeypatch):
    from app.services import storage

    row = source(real)
    grant, token, path = issue(real, row)
    monkeypatch.setattr(lifecycle, "enabled", lambda: True)
    monkeypatch.setattr(lifecycle, "repository", lambda: real["writer"])
    removed = []

    def delete(bucket, key):
        assert not real["writer"].active_file("file-a")
        removed.append((bucket, key))

    monkeypatch.setattr(storage, "delete_object", delete)
    storage.delete_media_objects({"file_id": "file-a", "bucket": row["bucket"], "object_key": row["object_key"]})
    assert removed
    with pytest.raises(Denied):
        real["writer"].issue(row["id"], "alice", new_token()[1], "late-issue-123", 1800, True)


def test_failed_revocation_cannot_confirm_file_or_account_deletion(monkeypatch):
    from app.core import auth
    from app.services import storage

    def failed(*args):
        raise Unavailable("injected dependency failure")

    monkeypatch.setattr(lifecycle, "barrier", failed)
    objects = []
    monkeypatch.setattr(storage, "delete_object", lambda *a: objects.append(a))
    with pytest.raises(Unavailable):
        storage.delete_media_objects({"file_id": "file-a", "bucket": "test", "object_key": "object"})
    assert not objects
    monkeypatch.setitem(auth.USERS, "alice", {"username": "Alice"})
    with pytest.raises(Unavailable):
        asyncio.run(auth.delete_user("alice"))
    assert "alice" in auth.USERS


def test_unconfirmed_cancellation_retains_submitted_link_but_not_prepared_link(real, monkeypatch):
    monkeypatch.setattr(lifecycle, "enabled", lambda: True)
    monkeypatch.setattr(lifecycle, "repository", lambda: real["writer"])
    row = source(real)
    issue(real, row)
    real["writer"].submission("task-a", "supplier", "submitting")
    asyncio.run(lifecycle.task_changed({"id": "task-a", "type": "online-video", "status": "cancelled"}))
    assert real["writer"].active_file("file-a")
    asyncio.run(lifecycle.task_changed({"id": "task-a", "type": "online-video", "status": "succeeded"}))
    assert not real["writer"].active_file("file-a")
    prepared = source(real, file_id="file-b", task_id="task-b")
    issue(real, prepared)
    asyncio.run(lifecycle.task_changed({"id": "task-b", "type": "online-video", "status": "failed"}))
    assert not real["writer"].active_file("file-b")
