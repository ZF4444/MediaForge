import copy

import pytest

from app.core import access_control
from app.routers import access_control as access_control_router


@pytest.fixture(autouse=True)
def permission_store(monkeypatch):
    state = {"value": {}, "version": 0}

    def save(_key, value):
        state["value"] = copy.deepcopy(value)
        state["version"] += 1

    monkeypatch.setattr(access_control, "_ACCESS_CONTROL_CACHE", None)
    monkeypatch.setattr(access_control, "_ACCESS_CONTROL_VERSION", None)
    monkeypatch.setattr(access_control, "get_app_setting_version", lambda _key: state["version"])
    monkeypatch.setattr(
        access_control, "get_app_setting_with_version", lambda *_args: (copy.deepcopy(state["value"]), state["version"])
    )
    monkeypatch.setattr(access_control, "set_app_setting", save)
    return state


def test_user_type_permissions_and_legacy_config_migration(monkeypatch):
    monkeypatch.setattr(access_control, "all_page_ids", lambda: ["canvas", "asset-manager", "gpt-chat"])
    monkeypatch.setattr(
        access_control,
        "get_app_setting_with_version",
        lambda *_args: (
            {
                "default": {"pages": ["canvas"]},
                "users": {"alice": {"pages": ["asset-manager"]}},
            },
            1,
        ),
    )
    monkeypatch.setattr(access_control, "_ACCESS_CONTROL_CACHE", None)

    migrated = access_control.load_config()

    assert migrated["types"]["new-user"]["name"] == "默认用户"
    assert migrated["user_types"]["alice"] == "legacy-alice"
    assert access_control.effective_permissions("alice")["pages"] == ["asset-manager"]
    assert access_control.effective_permissions("new-user")["pages"] == ["canvas"]


def test_save_config_assigns_permissions_by_user_type(monkeypatch):
    monkeypatch.setattr(access_control, "all_page_ids", lambda: ["canvas", "asset-manager", "gpt-chat"])
    stored = {}
    save = access_control.set_app_setting

    def capture(key, value):
        stored.update(value)
        save(key, value)

    monkeypatch.setattr(access_control, "set_app_setting", capture)
    monkeypatch.setattr(access_control, "_ACCESS_CONTROL_CACHE", None)

    saved = access_control.save_config(
        {
            "types": {
                "creator": {"name": "创作用户", "pages": ["canvas"]},
            },
            "user_types": {"bob": "creator", "admin": "creator", "nobody": "missing"},
        }
    )

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


def test_model_permissions_by_type_and_connection(monkeypatch):
    monkeypatch.setattr(access_control, "all_page_ids", lambda: ["canvas"])
    monkeypatch.setattr(
        access_control,
        "all_models",
        lambda: [
            {"id": "model-a", "connection_id": "a", "upstream_model": "same"},
            {"id": "model-b", "connection_id": "b", "upstream_model": "same"},
        ],
    )
    monkeypatch.setattr(access_control, "_ACCESS_CONTROL_CACHE", None)
    access_control.save_config(
        {
            "types": {
                "restricted": {"pages": ["canvas"], "models": ["model-a"]},
                "blocked": {"pages": ["canvas"], "models": []},
            },
            "user_types": {"alice": "restricted", "bob": "blocked", "operator": "sys-admin"},
        }
    )
    assert access_control.is_model_allowed("alice", "a", "same")
    assert not access_control.is_model_allowed("alice", "b", "same")
    assert not access_control.is_model_allowed("bob", "a", "same")
    assert access_control.is_model_allowed("operator", "b", "same")
    assert access_control.is_model_allowed("legacy-user", "b", "same")


def test_saving_permissions_without_assignments_preserves_latest_user_types(monkeypatch):
    from app.models import AccessControlConfigPayload

    saved = {}
    monkeypatch.setattr(access_control_router, "_require_user_management", lambda: "manager")
    monkeypatch.setattr(access_control_router, "load_config", lambda: {"user_types": {"alice": "creator"}})
    monkeypatch.setattr(access_control_router, "save_config", lambda payload: saved.update(payload) or payload)
    monkeypatch.setattr(access_control_router, "audit_event", lambda *_args, **_kwargs: None)
    payload = AccessControlConfigPayload(types={"creator": {"name": "创作团队", "pages": ["canvas"], "models": []}})
    access_control_router.access_control_put_config(payload)
    assert saved["user_types"] == {"alice": "creator"}
    assert saved["types"]["creator"]["models"] == []


def test_external_permission_revision_refreshes_grants_and_revocations(monkeypatch, permission_store):
    monkeypatch.setattr(access_control, "all_page_ids", lambda: ["canvas"])
    access_control.save_config({"types": {"new-user": {"models": []}}})
    assert not access_control.is_model_allowed("alice", "connection", "model", model_id="model-id")
    permission_store["value"]["types"]["new-user"]["models"] = ["model-id"]
    permission_store["version"] += 1
    assert access_control.is_model_allowed("alice", "connection", "model", model_id="model-id")
    permission_store["value"]["types"]["new-user"]["models"] = []
    permission_store["version"] += 1
    assert not access_control.is_model_allowed("alice", "connection", "model", model_id="model-id")


def test_unchanged_revision_reuses_configuration_without_catalogue_scan(monkeypatch):
    access_control.save_config({"types": {"new-user": {"models": ["model-id"]}}})
    access_control.load_config()

    def unexpected(*_args):
        raise AssertionError("unchanged permissions should not reload configuration or models")

    monkeypatch.setattr(access_control, "get_app_setting_with_version", unexpected)
    monkeypatch.setattr(access_control, "all_models", unexpected)
    assert access_control.is_model_allowed("alice", "connection", "model", model_id="model-id")


def test_database_failure_does_not_use_cached_permissions(monkeypatch):
    access_control.save_config({"types": {"new-user": {"models": None}}})
    access_control.load_config()

    def unavailable(*_args):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(access_control, "get_app_setting_version", unavailable)
    with pytest.raises(RuntimeError, match="database unavailable"):
        access_control.is_model_allowed("alice", "connection", "model", model_id="model-id")
