"""WebSocket 连接管理与广播。

从 main.py 原样迁移 ConnectionManager 及其单例 manager。
依赖：fastapi.WebSocket、app.core.utils.now_ms。
"""
import json
from typing import Dict, List

from fastapi import WebSocket

from app.core.utils import now_ms
from app.core.logging import get_logger


logger = get_logger("websocket")


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: Dict[str, WebSocket] = {}
        self.connection_clients: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, client_id: str = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.connection_clients[websocket] = client_id or f"anon-{id(websocket)}"
        if client_id:
            self.user_connections[client_id] = websocket
        logger.info(
            "websocket connected",
            extra={"event": "websocket_connected", "connection_count": len(self.active_connections), "online_count": self.online_count()},
        )
        await self.broadcast_count()

    async def disconnect(self, websocket: WebSocket, client_id: str = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        self.connection_clients.pop(websocket, None)
        if client_id and self.user_connections.get(client_id) is websocket:
            del self.user_connections[client_id]
        logger.info(
            "websocket disconnected",
            extra={"event": "websocket_disconnected", "connection_count": len(self.active_connections), "online_count": self.online_count()},
        )
        await self.broadcast_count()

    def online_count(self):
        visible_clients = {
            client_id for client_id in self.connection_clients.values()
            if client_id and not str(client_id).startswith("canvas_")
        }
        return len(visible_clients)

    async def broadcast_count(self):
        count = self.online_count()
        data = json.dumps({"type": "stats", "online_count": count})
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception:
                logger.exception("websocket count broadcast failed", extra={"event": "websocket_broadcast_failed", "broadcast_type": "stats"})
                try:
                    self.active_connections.remove(connection)
                except ValueError:
                    pass

    async def broadcast_new_image(self, image_data: dict):
        data = json.dumps({"type": "new_image", "data": image_data})
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception:
                logger.exception("websocket image broadcast failed", extra={"event": "websocket_broadcast_failed", "broadcast_type": "new_image"})
                try:
                    self.active_connections.remove(connection)
                except ValueError:
                    pass

    async def broadcast_canvas_updated(self, canvas_id: str, updated_at: int, client_id: str = ""):
        data = json.dumps({
            "type": "canvas_updated",
            "canvas_id": canvas_id,
            "updated_at": updated_at,
            "client_id": client_id or "",
        })
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception:
                logger.exception("websocket canvas broadcast failed", extra={"event": "websocket_broadcast_failed", "broadcast_type": "canvas_updated"})
                try:
                    self.active_connections.remove(connection)
                except ValueError:
                    pass

    async def broadcast_asset_library_updated(self, updated_at: int = 0):
        data = json.dumps({
            "type": "asset_library_updated",
            "updated_at": updated_at or now_ms(),
        })
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception:
                logger.exception("websocket asset broadcast failed", extra={"event": "websocket_broadcast_failed", "broadcast_type": "asset_library_updated"})
                try:
                    self.active_connections.remove(connection)
                except ValueError:
                    pass

    async def broadcast_announcement(self, announcement: dict):
        data = json.dumps({"type": "announcement", "data": announcement})
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception:
                logger.exception("websocket announcement broadcast failed", extra={"event": "websocket_broadcast_failed", "broadcast_type": "announcement"})
                try:
                    self.active_connections.remove(connection)
                except ValueError:
                    pass

    async def send_personal_message(self, message: dict, client_id: str):
        ws = self.user_connections.get(client_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                logger.exception("websocket personal message failed", extra={"event": "websocket_personal_message_failed", "client_id": client_id})


manager = ConnectionManager()
