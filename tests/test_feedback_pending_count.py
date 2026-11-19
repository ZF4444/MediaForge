import pytest
from fastapi import HTTPException

from app.routers import feedback as feedback_router
from app.services import feedback as feedback_service


class _FakeCursor:
    def __init__(self, calls):
        self.calls = calls

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql, params=()):
        self.calls.append((sql, params))

    def fetchone(self):
        return {"count": 7}


class _FakeConn:
    def __init__(self, calls):
        self.calls = calls

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self):
        return _FakeCursor(self.calls)


def test_count_pending_feedback_counts_open_and_reviewing_only(monkeypatch):
    calls = []
    monkeypatch.setattr(feedback_service, "metadata_connection", lambda: _FakeConn(calls))

    assert feedback_service.count_pending_feedback() == 7

    sql, params = calls[0]
    assert "feedback_entries" in sql
    assert params == (["open", "reviewing"],)


def test_pending_count_endpoint_requires_feedback_page_access(monkeypatch):
    monkeypatch.setattr(feedback_router, "current_user_id", lambda: "normal-user")
    monkeypatch.setattr(feedback_router, "has_page_access", lambda _uid, _page: False)
    monkeypatch.setattr(feedback_router, "count_pending_feedback", lambda: pytest.fail("must not query"))

    with pytest.raises(HTTPException) as exc:
        feedback_router.feedback_admin_pending_count()
    assert exc.value.status_code == 403


def test_pending_count_endpoint_returns_count_for_admin(monkeypatch):
    monkeypatch.setattr(feedback_router, "current_user_id", lambda: "admin")
    monkeypatch.setattr(feedback_router, "has_page_access", lambda _uid, page: page == "feedback-admin")
    monkeypatch.setattr(feedback_router, "count_pending_feedback", lambda: 3)

    assert feedback_router.feedback_admin_pending_count() == {"count": 3}
