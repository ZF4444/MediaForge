import asyncio

from app.core.ws import ConnectionManager


class Socket:
    def __init__(self):
        self.messages = []

    async def accept(self):
        return None

    async def send_text(self, message):
        self.messages.append(message)


def test_user_scoped_websocket_delivery():
    async def scenario():
        manager = ConnectionManager()
        alice = Socket()
        bob = Socket()
        await manager.connect(alice, "alice", "shared-client-id")
        await manager.connect(bob, "bob", "shared-client-id")
        alice.messages.clear()
        bob.messages.clear()

        await manager.send_personal_message({"type": "cloud_status"}, "shared-client-id", "alice")
        assert len(alice.messages) == 1
        assert bob.messages == []

        await manager.broadcast_new_image({"images": ["/api/files/a"]}, "alice")
        assert len(alice.messages) == 2
        assert bob.messages == []

        await manager.deliver_remote_event(
            "canvas_updated",
            {"user_id": "alice", "message": {"type": "canvas_updated", "canvas_id": "c1"}},
        )
        assert len(alice.messages) == 3
        assert bob.messages == []

    asyncio.run(scenario())
