import asyncio
import json
from contextlib import nullcontext
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import main
from app.ai.database_repository import DatabaseAIRepository


def test_update_only_writes_selected_resource(monkeypatch):
    calls = []

    class Cursor:
        def execute(self, sql, args=None):
            calls.append((sql, args))

        def fetchone(self):
            return {'name': 'Workflow', 'enabled': True, 'settings_json': {'fields': [1], 'media': 'image'}}

    connection = SimpleNamespace(cursor=lambda: nullcontext(Cursor()), transaction=nullcontext)
    monkeypatch.setattr('app.ai.database_repository.database_connection_sync', lambda: nullcontext(connection))
    monkeypatch.setattr(main, 'require_api_settings_access', lambda: None)
    assert asyncio.run(main.update_ai_executable_resource('selected', {'settings': {'media': 'video'}})) == {'ok': True}
    assert len(calls) == 2
    sql, args = calls[1]
    assert sql.startswith('UPDATE ai_resources ')
    assert args[-1] == 'selected'
    assert json.loads(args[2]) == {'fields': [1], 'media': 'video'}


def test_update_requires_permission(monkeypatch):
    def deny():
        raise HTTPException(status_code=403)
    monkeypatch.setattr(main, 'require_api_settings_access', deny)
    monkeypatch.setattr(DatabaseAIRepository, 'update_resource', lambda *a: pytest.fail('unexpected write'))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.update_ai_executable_resource('selected', {}))
    assert exc.value.status_code == 403


@pytest.mark.parametrize('payload', [{'connection_id': 'other'}, {'settings': []}, {'enabled': 'false'}, {'name': None}])
def test_update_rejects_invalid_changes(monkeypatch, payload):
    monkeypatch.setattr(main, 'require_api_settings_access', lambda: None)
    monkeypatch.setattr(DatabaseAIRepository, 'update_resource', lambda *a: pytest.fail('unexpected write'))
    with pytest.raises(HTTPException) as exc:
        asyncio.run(main.update_ai_executable_resource('selected', payload))
    assert exc.value.status_code == 400
