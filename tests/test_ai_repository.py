"""Regression coverage for AI connection resources."""
from __future__ import annotations

from app.ai.database_repository import DatabaseAIRepository


def test_ai_resources_endpoint_exposes_ids_without_connection_settings(monkeypatch):
    import asyncio
    import main
    from app.ai.domain import Connection, ModelResource

    class Repository:
        def connections(self): return [Connection("conn-a", "openai", "Team A", "https://a.example/v1", True)]
        def models(self): return [ModelResource("model-a", "conn-a", "gpt-main", "chat", "openai")]
        def executable_resources(self): return []
    monkeypatch.setattr("app.ai.database_repository.DatabaseAIRepository", Repository)

    payload = asyncio.run(main.ai_resources())

    assert payload["connections"] == [{
        "id": "conn-a", "protocol": "openai",
        "name": "Team A", "base_url": "https://a.example/v1", "primary": False,
    }]
    assert payload["models"][0]["id"] == "model-a"
    assert "api_key" not in payload["connections"][0]
