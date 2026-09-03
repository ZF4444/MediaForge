"""PostgreSQL-backed authoritative repository for AI connections and resources."""
from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from app.ai.domain import Connection, ExecutableResource, ModelResource, ResolvedTarget
from app.core.database import database_connection_sync
from app.core.utils import now_ms


def _json(value: Any, fallback: Any) -> Any:
    if isinstance(value, str):
        try: value = json.loads(value)
        except ValueError: return fallback
    return value if isinstance(value, type(fallback)) else fallback


class DatabaseAIRepository:
    """The final configuration source. It never reads legacy configuration records."""

    def connections(self, *, include_disabled: bool = False) -> list[Connection]:
        query = "SELECT * FROM ai_connections" + ("" if include_disabled else " WHERE enabled=TRUE") + " ORDER BY name,id"
        with database_connection_sync() as conn, conn.cursor() as cur:
            cur.execute(query); rows = cur.fetchall()
        return [Connection(id=row["id"], protocol=row["protocol"], name=row["name"], base_url=row["base_url"], enabled=bool(row["enabled"]), primary=bool(row["primary_connection"]), settings=_json(row["settings_json"], {})) for row in rows]

    def models(self, *, include_disabled: bool = False) -> list[ModelResource]:
        query = "SELECT * FROM ai_models" + ("" if include_disabled else " WHERE enabled=TRUE") + " ORDER BY alias,upstream_model,id"
        with database_connection_sync() as conn, conn.cursor() as cur:
            cur.execute(query); rows = cur.fetchall()
        return [ModelResource(id=row["id"], connection_id=row["connection_id"], upstream_model=row["upstream_model"], kind=row["kind"], protocol=row["protocol"], enabled=bool(row["enabled"]), alias=row["alias"], capabilities=frozenset(_json(row["capabilities_json"], [])), settings=_json(row.get("settings_json"), {})) for row in rows]

    def executable_resources(self, *, include_disabled: bool = False) -> list[ExecutableResource]:
        query = "SELECT * FROM ai_resources" + ("" if include_disabled else " WHERE enabled=TRUE") + " ORDER BY name,id"
        with database_connection_sync() as conn, conn.cursor() as cur:
            cur.execute(query); rows = cur.fetchall()
        return [ExecutableResource(id=row["id"], connection_id=row["connection_id"], kind=row["kind"], name=row["name"], enabled=bool(row["enabled"]), settings=_json(row["settings_json"], {})) for row in rows]

    def runtime_configurations(self) -> list[dict[str, Any]]:
        """Build the short-lived shape consumed by unmigrated executors.

        This adapter is sourced exclusively from the final tables. It is not a
        persistence format and will disappear as the remaining executors move
        to ``ResolvedTarget`` directly.
        """
        connections = self.connections(include_disabled=True)
        by_id: dict[str, dict[str, Any]] = {}
        for connection in connections:
            settings = dict(connection.settings)
            runtime_id = str(settings.get("runtime_id") or settings.get("id") or connection.id)
            by_id[connection.id] = {
                **settings,
                "id": runtime_id,
                "connection_id": connection.id,
                "name": connection.name,
                "protocol": connection.protocol,
                "base_url": connection.base_url,
                "enabled": connection.enabled,
                "primary": connection.primary,
                "chat_models": [], "image_models": [], "video_models": [],
                "model_aliases": {}, "model_enabled": {}, "rh_apps": [], "comfy_workflows": [],
                "model_prices": {},
                "omnilojo_model_prices": {},
            }
        for model in self.models(include_disabled=True):
            config = by_id.get(model.connection_id)
            if config is None: continue
            key = f"{model.kind}_models"
            config[key].append(model.upstream_model)
            config["model_aliases"][model.upstream_model] = model.alias
            config["model_enabled"][model.upstream_model] = model.enabled
            if any(model.settings.get(key) is not None for key in ("text_input_per_million", "input_per_million", "image_input_per_million", "output_per_million")):
                price = {
                    "text_input_per_million": model.settings.get("text_input_per_million", model.settings.get("input_per_million", 0)),
                    "input_per_million": model.settings.get("input_per_million", model.settings.get("text_input_per_million", 0)),
                    "cached_input_per_million": model.settings.get("cached_input_per_million", model.settings.get("input_per_million", model.settings.get("text_input_per_million", 0))),
                    "image_input_per_million": model.settings.get("image_input_per_million", 0),
                    "output_per_million": model.settings.get("output_per_million", 0),
                }
                config["model_prices"][model.upstream_model] = price
                config["omnilojo_model_prices"][model.upstream_model] = price
        for resource in self.executable_resources(include_disabled=True):
            config = by_id.get(resource.connection_id)
            if config is None: continue
            item = {**dict(resource.settings), "name": resource.name, "enabled": resource.enabled}
            config["rh_apps" if resource.kind == "runninghub_app" else "comfy_workflows"].append(item)
        return list(by_id.values())

    def resolve_model(self, *, model_id: str = "", connection_id: str = "", model: str = "", kind: str = "") -> ResolvedTarget:
        models = self.models()
        found = next((item for item in models if item.id == model_id), None) if model_id else next((item for item in models if (not connection_id or item.connection_id == connection_id) and (not model or item.upstream_model == model) and (not kind or item.kind == kind)), None)
        if found is None: raise LookupError("AI model resource not found")
        connection = next((item for item in self.connections() if item.id == found.connection_id), None)
        if connection is None: raise LookupError("AI connection not found")
        return ResolvedTarget(connection=connection, model=found)

    def resolve_executable(self, *, resource_id: str = "", connection_id: str = "", kind: str = "") -> ResolvedTarget:
        resources = self.executable_resources()
        found = next((item for item in resources if item.id == resource_id), None) if resource_id else next((item for item in resources if (not connection_id or item.connection_id == connection_id) and (not kind or item.kind == kind)), None)
        if found is None: raise LookupError("AI executable resource not found")
        connection = next((item for item in self.connections() if item.id == found.connection_id), None)
        if connection is None: raise LookupError("AI connection not found")
        return ResolvedTarget(connection=connection, resource=found)

    def replace(self, *, connections: Iterable[dict[str, Any]], models: Iterable[dict[str, Any]], resources: Iterable[dict[str, Any]]) -> None:
        now = now_ms()
        connection_rows = list(connections); model_rows = list(models); resource_rows = list(resources)
        connection_ids = {str(item.get("id") or "") for item in connection_rows}
        if not connection_ids or "" in connection_ids: raise ValueError("at least one valid AI connection is required")
        for item in [*model_rows, *resource_rows]:
            if str(item.get("connection_id") or "") not in connection_ids: raise ValueError("AI resource references an unknown connection")
        with database_connection_sync() as conn, conn.transaction(), conn.cursor() as cur:
            cur.execute("DELETE FROM ai_resources"); cur.execute("DELETE FROM ai_models"); cur.execute("DELETE FROM ai_connections")
            for item in connection_rows:
                cur.execute("INSERT INTO ai_connections(id,protocol,name,base_url,secret_ref,enabled,primary_connection,settings_json,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", (item["id"], item["protocol"], item.get("name") or item["id"], item.get("base_url") or "", item.get("secret_ref") or item["id"], bool(item.get("enabled", True)), bool(item.get("primary", False)), json.dumps(item.get("settings") or {}), now, now))
            for item in model_rows:
                cur.execute("INSERT INTO ai_models(id,connection_id,kind,upstream_model,protocol,alias,capabilities_json,settings_json,enabled,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", (item["id"], item["connection_id"], item["kind"], item["upstream_model"], item.get("protocol") or "openai", item.get("alias") or item["upstream_model"], json.dumps(item.get("capabilities") or []), json.dumps(item.get("settings") or {}), bool(item.get("enabled", True)), now, now))
            for item in resource_rows:
                cur.execute("INSERT INTO ai_resources(id,connection_id,kind,name,schema_json,settings_json,enabled,created_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)", (item["id"], item["connection_id"], item["kind"], item.get("name") or item["id"], json.dumps(item.get("schema") or {}), json.dumps(item.get("settings") or {}), bool(item.get("enabled", True)), now, now))
