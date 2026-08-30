from app.core import access_control
from app.routers import access_control as access_control_router


def test_user_type_permissions_and_legacy_config_migration(monkeypatch):
    monkeypatch.setattr(access_control, "all_page_ids", lambda: ["canvas", "asset-manager", "gpt-chat"])
    monkeypatch.setattr(access_control, "get_app_setting", lambda *_args: {
        "default": {"pages": ["canvas"]},
        "users": {"alice": {"pages": ["asset-manager"]}},
    })
    monkeypatch.setattr(access_control, "_ACCESS_CONTROL_CACHE", None)

    migrated = access_control.load_config()

    assert migrated["types"]["new-user"]["name"] == "默认用户"
    assert migrated["user_types"]["alice"] == "legacy-alice"
    assert access_control.effective_permissions("alice")["pages"] == ["asset-manager"]
    assert access_control.effective_permissions("new-user")["pages"] == ["canvas"]


def test_save_config_assigns_permissions_by_user_type(monkeypatch):
    monkeypatch.setattr(access_control, "all_page_ids", lambda: ["canvas", "asset-manager", "gpt-chat"])
    stored = {}
    monkeypatch.setattr(access_control, "set_app_setting", lambda _key, value: stored.update(value))
    monkeypatch.setattr(access_control, "_ACCESS_CONTROL_CACHE", None)

    saved = access_control.save_config({
        "types": {
            "creator": {"name": "创作用户", "pages": ["canvas"]},
        },
        "user_types": {"bob": "creator", "admin": "creator", "nobody": "missing"},
    })

    assert saved["user_types"] == {"bob": "creator", "admin": "creator"}
    assert saved["types"]["creator"]["pages"] == ["canvas"]
    assert stored == saved
    assert access_control.effective_permissions("bob")["user_type"] == "creator"
    assert access_control.effective_permissions("admin")["pages"] == ["canvas"]
    assert access_control.has_page_access("admin", "canvas") is True
    assert access_control.has_page_access("admin", "gpt-chat") is False


def test_assign_user_type_updates_only_the_selected_user(monkeypatch):
    config = {
        "types": {
            "new-user": {"name": "默认用户", "pages": ["canvas"]},
            "creator": {"name": "创作用户", "pages": ["canvas", "asset-manager"]},
        },
        "user_types": {"bob": "new-user"},
    }
    saved = {}
    monkeypatch.setattr(access_control_router, "current_user_id", lambda: "manager")
    monkeypatch.setattr(access_control_router, "has_page_access", lambda *_args: True)
    monkeypatch.setattr(access_control_router, "USERS", {"alice": {"username": "Alice"}, "bob": {"username": "Bob"}})
    monkeypatch.setattr(access_control_router, "load_config", lambda: config)
    monkeypatch.setattr(access_control_router, "save_config", lambda payload: saved.update(payload) or payload)
    monkeypatch.setattr(access_control_router, "audit_event", lambda *_args, **_kwargs: None)

    result = access_control_router.access_control_assign_user_type("alice", {"type_id": "creator"})

    assert result == {"ok": True, "user_id": "alice", "user_type": "creator"}
    assert saved["user_types"] == {"bob": "new-user", "alice": "creator"}
    assert saved["types"] == config["types"]
