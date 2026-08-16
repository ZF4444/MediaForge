import asyncio
import threading

import main
from app.services import business_metadata


def test_provider_version_lookup_runs_off_the_application_event_loop(monkeypatch):
    request_thread = threading.get_ident()

    def get_setting(_key, _default):
        assert threading.get_ident() != request_thread
        return [], 7

    monkeypatch.setattr(business_metadata, "get_app_setting_with_version", get_setting)
    monkeypatch.setattr(main, "public_api_providers", lambda **_kwargs: [])

    response = asyncio.run(main.api_providers())

    assert response == {"providers": [], "version": 7}
