"""save_asset_library 必须复用该用户已有的资产库行，不能假定 id 是 default_<uid>。

asset_libraries 表有 UNIQUE(user_id, name)。历史迁移或账号迁移产生的行 id 不一定是
default_<uid>，此时只按 id 做 ON CONFLICT 会撞唯一约束并返回 500。
"""

from app.core import auth
from app.services import assets, business_metadata

UID = "ou_test_user"


class FakeCursor:
    def __init__(self, existing_row):
        self.existing_row = existing_row
        self.executed = []

    def execute(self, query, params=None):
        self.executed.append((" ".join(str(query).split()), params))

    def fetchone(self):
        return self.existing_row

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def transaction(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def _save(monkeypatch, existing_row):
    cursor = FakeCursor(existing_row)
    monkeypatch.setattr(business_metadata, "metadata_connection", lambda: FakeConnection(cursor))
    monkeypatch.setattr(auth, "current_user_id", lambda: UID)
    monkeypatch.setattr(assets, "get_global_loop", lambda: None)
    assets.save_asset_library(assets.default_asset_library())
    return cursor


def _statements(cursor, prefix):
    return [item for item in cursor.executed if item[0].startswith(prefix)]


def test_reuses_existing_row_id_when_it_is_not_the_default_envelope_id(monkeypatch):
    cursor = _save(monkeypatch, {"id": "legacy_row_1"})

    select = _statements(cursor, "SELECT id FROM asset_libraries")
    assert len(select) == 1
    assert select[0][1] == (UID,)
    assert "FOR UPDATE" in select[0][0]

    insert = _statements(cursor, "INSERT INTO asset_libraries")
    assert len(insert) == 1
    assert insert[0][1][0] == "legacy_row_1"
    assert insert[0][1][1] == UID

    # 分类、素材行以实际使用的 envelope id 为前缀/外键，不能指向不存在的 default_<uid>。
    delete = _statements(cursor, "DELETE FROM asset_categories")
    assert delete[0][1] == ("legacy_row_1",)
    categories = _statements(cursor, "INSERT INTO asset_categories")
    assert categories
    for _, params in categories:
        assert params[0].startswith("legacy_row_1:")
        assert params[1] == "legacy_row_1"


def test_uses_default_envelope_id_when_user_has_no_row(monkeypatch):
    cursor = _save(monkeypatch, None)

    insert = _statements(cursor, "INSERT INTO asset_libraries")
    assert len(insert) == 1
    assert insert[0][1][0] == f"default_{UID}"

    delete = _statements(cursor, "DELETE FROM asset_categories")
    assert delete[0][1] == (f"default_{UID}",)
    for _, params in _statements(cursor, "INSERT INTO asset_categories"):
        assert params[1] == f"default_{UID}"


def test_existing_row_lookup_matches_load_asset_library_ordering(monkeypatch):
    """写入的目标行必须与 load_asset_library 读到的是同一行，否则读写会分叉。"""
    cursor = _save(monkeypatch, {"id": "legacy_row_1"})
    select = _statements(cursor, "SELECT id FROM asset_libraries")[0][0]
    assert "WHERE user_id=%s ORDER BY is_default DESC, created_at LIMIT 1" in select
