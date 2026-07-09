import json
import os

from app.services import storage_migration


def test_canonicalize_legacy_url_normalizes_output_alias_and_encoding():
    assert storage_migration.canonicalize_legacy_url("/output/demo image.png") == "/assets/output/demo%20image.png"
    assert storage_migration.canonicalize_legacy_url("/assets/input/a/b.png") == "/assets/input/a/b.png"


def test_build_reference_index_collects_user_refs_only(tmp_path):
    data_dir = tmp_path / "data"
    user_dir = data_dir / "users" / "alice"
    user_dir.mkdir(parents=True)
    (user_dir / "history.json").write_text(json.dumps([{"images": ["/output/demo.png"]}]), encoding="utf-8")

    index = storage_migration.build_reference_index(str(data_dir))

    assert index["/assets/output/demo.png"] == {"alice"}


def test_iter_local_asset_candidates_uses_reference_owner(tmp_path):
    input_root = tmp_path / "assets" / "input"
    input_root.mkdir(parents=True)
    file_path = input_root / "foo.png"
    file_path.write_bytes(b"png")

    original_roots = storage_migration.LOCAL_CATEGORY_ROOTS
    storage_migration.LOCAL_CATEGORY_ROOTS = {
        "input": str(input_root),
    }
    try:
        items = storage_migration.iter_local_asset_candidates(
            categories={"input"},
            reference_index={"/assets/input/foo.png": {"alice"}},
        )
    finally:
        storage_migration.LOCAL_CATEGORY_ROOTS = original_roots

    assert len(items) == 1
    assert items[0].legacy_url == "/assets/input/foo.png"
    assert items[0].user_id == "alice"


def test_migrate_candidate_dry_run_and_existing_skip(monkeypatch, tmp_path):
    file_path = tmp_path / "demo.png"
    file_path.write_bytes(b"png")
    candidate = storage_migration.MigrationCandidate(
        category="input",
        local_path=str(file_path),
        legacy_url="/assets/input/demo.png",
        user_id="alice",
        size_bytes=3,
        created_at_ms=123,
        original_name="demo.png",
        stored_name="demo.png",
        kind="image",
        content_type="image/png",
    )

    monkeypatch.setattr(storage_migration, "lookup_media_url", lambda url: None)
    planned = storage_migration.migrate_candidate(candidate, dry_run=True)
    assert planned["status"] == "planned"

    monkeypatch.setattr(storage_migration, "lookup_media_url", lambda url: {"file_id": "file-1", "user_id": "alice"})
    skipped = storage_migration.migrate_candidate(candidate, dry_run=False)
    assert skipped == {
        "status": "skipped",
        "reason": "already_registered",
        "legacy_url": "/assets/input/demo.png",
        "file_id": "file-1",
        "user_id": "alice",
    }


def test_run_local_storage_migration_applies_limit_and_metadata_flag(monkeypatch):
    candidates = [
        storage_migration.MigrationCandidate("input", "/tmp/a", "/assets/input/a.png", "u1", 1, 1, "a.png", "a.png", "image", "image/png"),
        storage_migration.MigrationCandidate("input", "/tmp/b", "/assets/input/b.png", "u1", 1, 1, "b.png", "b.png", "image", "image/png"),
    ]
    monkeypatch.setattr(storage_migration, "build_reference_index", lambda: {})
    monkeypatch.setattr(storage_migration, "iter_local_asset_candidates", lambda **kwargs: candidates)
    monkeypatch.setattr(storage_migration, "migrate_candidate", lambda candidate, dry_run=False: {"status": "planned", "legacy_url": candidate.legacy_url})
    monkeypatch.setattr(storage_migration, "rewrite_all_metadata", lambda dry_run=False: {"files": 2, "changed": 1})

    summary = storage_migration.run_local_storage_migration(dry_run=True, limit=1, rewrite_metadata=True)

    assert summary["scanned"] == 1
    assert summary["planned"] == 1
    assert summary["metadata"] == {"files": 2, "changed": 1}
