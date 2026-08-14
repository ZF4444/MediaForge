"""Authenticated, user-scoped WebSocket connection management."""

from __future__ import annotations

import json
from collections import defaultdict
from typing import Awaitable, Callable, DefaultDict

from fastapi import WebSocket

from app.core.logging import get_logger
from app.core.utils import now_ms


logger = get_logger("websocket")


class ConnectionManager:
    def __init__(self):
        self.active_connections: set[WebSocket] = set()
        self.connection_clients: dict[WebSocket, str] = {}
        self.connection_users: dict[WebSocket, str] = {}
        self.user_connections: DefaultDict[tuple[str, str], set[WebSocket]] = defaultdict(set)
        self._publisher: Callable[[str, dict], Awaitable[None]] | None = None

    def set_publisher(self, publisher: Callable[[str, dict], Awaitable[None]]) -> None:
        self._publisher = publisher

    async def _publish(self, event: str, payload: dict) -> None:
        if self._publisher is not None:
            await self._publisher(event, payload)

    async def connect(self, websocket: WebSocket, user_id: str, client_id: str = "") -> None:
        await websocket.accept()
        client_id = str(client_id or "")[:128]
        self.active_connections.add(websocket)
        self.connection_users[websocket] = user_id
        self.connection_clients[websocket] = client_id
        if client_id:
            self.user_connections[(user_id, client_id)].add(websocket)
        logger.info(
            "websocket connected",
            extra={"event": "websocket_connected", "connection_count": len(self.active_connections), "online_count": self.online_count()},
        )
        await self.broadcast_count()

    async def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)
        user_id = self.connection_users.pop(websocket, "")
        client_id = self.connection_clients.pop(websocket, "")
        if user_id and client_id:
            key = (user_id, client_id)
            connections = self.user_connections.get(key)
            if connections:
                connections.discard(websocket)
                if not connections:
                    self.user_connections.pop(key, None)
        logger.info(
            "websocket disconnected",
            extra={"event": "websocket_disconnected", "connection_count": len(self.active_connections), "online_count": self.online_count()},
        )
        await self.broadcast_count()

    def online_count(self) -> int:
        return len({user_id for user_id in self.connection_users.values() if user_id})

    async def _send(self, connections: set[WebSocket], data: str, event: str) -> None:
        for connection in list(connections):
            try:
                await connection.send_text(data)
            except Exception:
                logger.exception("websocket broadcast failed", extra={"event": "websocket_broadcast_failed", "broadcast_type": event})
                await self.disconnect(connection)

    async def broadcast_count(self) -> None:
        await self._send(
            self.active_connections,
            json.dumps({"type": "stats", "online_count": self.online_count()}),
            "stats",
        )

    async def broadcast_to_user(self, user_id: str, message: dict, event: str) -> None:
        if not user_id:
            logger.warning("refused unscoped websocket event", extra={"event": "websocket_unscoped_event", "broadcast_type": event})
            return
        connections = {ws for ws, owner in self.connection_users.items() if owner == user_id}
        await self._send(connections, json.dumps(message), event)

    async def broadcast_new_image(self, image_data: dict, user_id: str) -> None:
        await self._publish("new_image", {"user_id": user_id, "image_data": image_data})
        await self.broadcast_to_user(user_id, {"type": "new_image", "data": image_data}, "new_image")

    async def broadcast_canvas_updated(self, canvas_id: str, updated_at: int, client_id: str, user_id: str) -> None:
        message = {
            "type": "canvas_updated",
            "canvas_id": canvas_id,
            "updated_at": updated_at,
            "client_id": client_id or "",
        }
        await self._publish("canvas_updated", {"user_id": user_id, "message": message})
        await self.broadcast_to_user(user_id, message, "canvas_updated")

    async def broadcast_asset_library_updated(self, updated_at: int, user_id: str) -> None:
        message = {
            "type": "asset_library_updated",
            "updated_at": updated_at or now_ms(),
        }
        await self._publish("asset_library_updated", {"user_id": user_id, "message": message})
        await self.broadcast_to_user(user_id, message, "asset_library_updated")

    async def broadcast_announcement(self, announcement: dict) -> None:
        message = {"type": "announcement", "data": announcement}
        await self._publish("announcement", {"message": message})
        await self._send(self.active_connections, json.dumps(message), "announcement")

    async def send_personal_message(self, message: dict, client_id: str, user_id: str) -> None:
        if not client_id or not user_id:
            return
        await self._publish("personal", {"user_id": user_id, "client_id": client_id, "message": message})
        await self._send(self.user_connections.get((user_id, str(client_id)[:128]), set()), json.dumps(message), "personal")

    async def deliver_remote_event(self, event: str, payload: dict) -> None:
        """Deliver a Pub/Sub event locally without publishing it again."""
        if event == "new_image":
            await self.broadcast_to_user(str(payload.get("user_id") or ""), {"type": "new_image", "data": payload.get("image_data") or {}}, event)
        elif event in {"canvas_updated", "asset_library_updated"}:
            await self.broadcast_to_user(str(payload.get("user_id") or ""), payload.get("message") or {}, event)
        elif event == "personal":
            key = (str(payload.get("user_id") or ""), str(payload.get("client_id") or "")[:128])
            await self._send(self.user_connections.get(key, set()), json.dumps(payload.get("message") or {}), event)
        elif event == "announcement":
            await self._send(self.active_connections, json.dumps(payload.get("message") or {}), event)


manager = ConnectionManager()
