"""Migrate legacy local media files into MinIO and rewrite metadata to file_id refs."""

from __future__ import annotations

import json
import os
import urllib.parse
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Set, Tuple

from app.config import (
    ASSETS_DIR,
    DATA_DIR,
    OUTPUT_INPUT_DIR,
    OUTPUT_OUTPUT_DIR,
    ASSET_LIBRARY_DIR,
    LOCAL_UPLOAD_DIR,
)
from app.core.auth import current_user_var
from app.core.media import content_type_for_path
from app.services.assets import compact_asset_item_reference, normalize_asset_library
from app.services.history import compact_history_record, normalize_history_record
from app.services.storage import (
    build_object_key,
    ensure_media_derivatives,
    file_preview_url,
    lookup_media_url,
    object_exists,
    register_media_url,
    save_bytes,
)
from app.routers.canvases import compact_canvas, hydrate_canvas
from app.routers.conversations import compact_conversation, hydrate_conversation


LOCAL_CATEGORY_ROOTS = {
    "input": OUTPUT_INPUT_DIR,
    "output": OUTPUT_OUTPUT_DIR,
    "library": ASSET_LIBRARY_DIR,
    "uploads": LOCAL_UPLOAD_DIR,
}

CATEGORY_SOURCE = {
    "input": "upload",
    "output": "generated",
    "library": "imported",
    "uploads": "upload",
}


@dataclass
class MigrationCandidate:
    category: str
    local_path: str
    legacy_url: str
    user_id: str
    size_bytes: int
    created_at_ms: int
    original_name: str
    stored_name: str
    kind: str
    content_type: str


def canonicalize_legacy_url(url: str) -> str:
    text = str(url or "").strip()
    if not text:
        return ""
    path = urllib.parse.urlsplit(text).path or text
    if path.startswith("/output/"):
        path = "/assets/output/" + path[len("/output/"):]
    if not path.startswith("/assets/"):
        return text
    suffix = path[len("/assets/"):].lstrip("/")
    if not suffix:
        return ""
    category, _, remainder = suffix.partition("/")
    if category not in {"input", "output", "library", "uploads"} or not remainder:
        return text
    normalized = urllib.parse.quote(urllib.parse.unquote(remainder).replace("\\", "/"), safe="/._-()")
    return f"/assets/{category}/{normalized}"


def media_kind_for_path(path: str) -> str:
    content_type = content_type_for_path(path)
    if content_type.startswith("image/"):
        return "image"
    if content_type.startswith("video/"):
        return "video"
    if content_type.startswith("audio/"):
        return "audio"
    if content_type.startswith("text/"):
        return "text"
    if path.lower().endswith((".json", ".csv", ".md", ".srt", ".vtt")):
        return "text"
    return "document"


def extract_asset_urls(value: Any) -> Set[str]:
    found: Set[str] = set()
    if isinstance(value, str):
        url = canonicalize_legacy_url(value)
        if url.startswith("/assets/"):
            found.add(url)
        return found
    if isinstance(value, list):
        for item in value:
            found.update(extract_asset_urls(item))
        return found
    if isinstance(value, dict):
        for item in value.values():
            found.update(extract_asset_urls(item))
    return found


def build_reference_index(data_dir: str = DATA_DIR) -> Dict[str, Set[str]]:
    index: Dict[str, Set[str]] = {}
    user_root = os.path.join(data_dir, "users")
    for user_id in sorted(os.listdir(user_root)) if os.path.isdir(user_root) else []:
        base = os.path.join(user_root, user_id)
        for rel in ("history.json", "asset_library.json"):
            path = os.path.join(base, rel)
            _collect_references_from_json(path, user_id, index)
        for rel_dir in ("canvases", "conversations"):
            folder = os.path.join(base, rel_dir)
            for path in _iter_json_files(folder):
                _collect_references_from_json(path, user_id, index)
    return index


def _iter_json_files(folder: str) -> Iterable[str]:
    if not os.path.isdir(folder):
        return []
    items: List[str] = []
    for root, _, files in os.walk(folder):
        for name in files:
            if name.endswith(".json"):
                items.append(os.path.join(root, name))
    return items


def _collect_references_from_json(path: str, user_id: str, index: Dict[str, Set[str]]) -> None:
    if not os.path.isfile(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return
    for url in extract_asset_urls(data):
        index.setdefault(url, set()).add(user_id)


def choose_owner_for_url(url: str, reference_index: Dict[str, Set[str]]) -> str:
    users = sorted(reference_index.get(canonicalize_legacy_url(url), set()))
    if len(users) == 1:
        return users[0]
    return "anonymous"


def iter_local_asset_candidates(
    *,
    categories: Optional[Set[str]] = None,
    reference_index: Optional[Dict[str, Set[str]]] = None,
) -> List[MigrationCandidate]:
    chosen_categories = categories or set(LOCAL_CATEGORY_ROOTS.keys())
    refs = reference_index or {}
    items: List[MigrationCandidate] = []
    for category in sorted(chosen_categories):
        root = LOCAL_CATEGORY_ROOTS.get(category)
        if not root or not os.path.isdir(root):
            continue
        for base, _, names in os.walk(root):
            for name in sorted(names):
                if name.startswith("."):
                    continue
                local_path = os.path.join(base, name)
                if not os.path.isfile(local_path):
                    continue
                rel = os.path.relpath(local_path, root).replace(os.sep, "/")
                legacy_url = canonicalize_legacy_url(f"/assets/{category}/{rel}")
                stat = os.stat(local_path)
                items.append(
                    MigrationCandidate(
                        category=category,
                        local_path=local_path,
                        legacy_url=legacy_url,
                        user_id=choose_owner_for_url(legacy_url, refs),
                        size_bytes=int(stat.st_size or 0),
                        created_at_ms=int(stat.st_mtime * 1000),
                        original_name=name,
                        stored_name=name,
                        kind=media_kind_for_path(local_path),
                        content_type=content_type_for_path(local_path),
                    )
                )
    return items


def migrate_candidate(candidate: MigrationCandidate, *, dry_run: bool = False) -> Dict[str, Any]:
    existing = lookup_media_url(candidate.legacy_url, include_deleted=True)
    existing_file_id = str((existing or {}).get("file_id") or "").strip()
    existing_bucket = str((existing or {}).get("bucket") or "").strip()
    existing_object_key = str((existing or {}).get("object_key") or "").strip()
    source_exists = os.path.isfile(candidate.local_path)
    object_ready = bool(existing_bucket and existing_object_key and object_exists(existing_bucket, existing_object_key))

    if existing and dry_run and object_ready:
        return {
            "status": "skipped",
            "reason": "already_registered",
            "legacy_url": candidate.legacy_url,
            "file_id": existing_file_id,
            "user_id": existing.get("user_id") or candidate.user_id,
        }
    if dry_run:
        return {
            "status": "planned",
            "legacy_url": candidate.legacy_url,
            "user_id": candidate.user_id,
            "size_bytes": candidate.size_bytes,
            "category": candidate.category,
        }

    payload = b""
    if source_exists:
        with open(candidate.local_path, "rb") as f:
            payload = f.read()
    elif not object_ready:
        return {
            "status": "error",
            "reason": "source_missing_and_object_missing",
            "legacy_url": candidate.legacy_url,
            "file_id": existing_file_id,
            "user_id": candidate.user_id,
        }

    token = current_user_var.set(candidate.user_id)
    try:
        file_id = existing_file_id or uuid.uuid4().hex
        if object_ready:
            stored = {
                "bucket": existing_bucket,
                "object_key": existing_object_key,
                "size": int((existing or {}).get("size") or candidate.size_bytes or len(payload)),
            }
        else:
            object_key = build_object_key(
                candidate.category,
                file_id,
                os.path.splitext(candidate.stored_name)[1].lower(),
                user_id=candidate.user_id,
            )
            stored = save_bytes(payload, object_key, content_type=candidate.content_type)
        entry = register_media_url(
            candidate.legacy_url,
            stored["bucket"],
            stored["object_key"],
            filename=candidate.stored_name,
            category=candidate.category,
            original_name=candidate.original_name,
            content_type=candidate.content_type,
            kind=candidate.kind,
            size=stored["size"],
            created_at=candidate.created_at_ms,
            file_id=file_id,
            source=CATEGORY_SOURCE.get(candidate.category, "upload"),
            is_public=False,
        )
        derivative_warning = ""
        try:
            ensure_media_derivatives(entry, payload=payload)
        except Exception as exc:
            # The original object and files row are the migration source of truth.
            # A malformed previewable file must not abort the remaining batch.
            derivative_warning = f"{type(exc).__name__}: {exc}"
    finally:
        current_user_var.reset(token)

    if existing and object_ready:
        status = "repaired"
        reason = "metadata_refreshed"
    elif existing:
        status = "repaired"
        reason = "object_restored"
    else:
        status = "migrated"
        reason = ""
    result = {
        "status": status,
        "reason": reason,
        "legacy_url": candidate.legacy_url,
        "file_id": entry.get("file_id") or file_id,
        "preview_url": file_preview_url(file_id),
        "user_id": candidate.user_id,
        "size_bytes": candidate.size_bytes,
        "category": candidate.category,
        "local_path": candidate.local_path,
    }
    if derivative_warning:
        result["warning"] = "derivative_generation_failed"
        result["warning_detail"] = derivative_warning
    return result


def rewrite_all_metadata(*, dry_run: bool = False, data_dir: str = DATA_DIR) -> Dict[str, int]:
    summary = {"files": 0, "changed": 0}
    targets: List[Tuple[str, str]] = []
    user_root = os.path.join(data_dir, "users")
    for user_id in sorted(os.listdir(user_root)) if os.path.isdir(user_root) else []:
        base = os.path.join(user_root, user_id)
        for rel in ("history.json", "asset_library.json"):
            targets.append((user_id, os.path.join(base, rel)))
        for rel_dir in ("canvases", "conversations"):
            for path in _iter_json_files(os.path.join(base, rel_dir)):
                targets.append((user_id, path))
    for user_id, path in targets:
        if not os.path.exists(path):
            continue
        summary["files"] += 1
        if rewrite_metadata_file(path, user_id=user_id, dry_run=dry_run):
            summary["changed"] += 1
    return summary


def rewrite_metadata_file(path: str, *, user_id: str, dry_run: bool = False) -> bool:
    token = current_user_var.set(user_id or "anonymous")
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if path.endswith("history.json"):
            next_data = _rewrite_history_payload(raw)
        elif path.endswith("asset_library.json"):
            next_data = _rewrite_asset_library_payload(raw)
        elif "/conversations/" in path.replace("\\", "/"):
            next_data = compact_conversation(hydrate_conversation(raw))
        elif "/canvases/" in path.replace("\\", "/"):
            next_data = compact_canvas(hydrate_canvas(raw))
        else:
            next_data = raw
    finally:
        current_user_var.reset(token)
    before = json.dumps(raw, ensure_ascii=False, sort_keys=True)
    after = json.dumps(next_data, ensure_ascii=False, sort_keys=True)
    if before == after:
        return False
    if not dry_run:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(next_data, f, ensure_ascii=False, indent=2 if isinstance(next_data, dict) else 4)
    return True


def _rewrite_history_payload(raw: Any) -> Any:
    if not isinstance(raw, list):
        return raw
    return [compact_history_record(normalize_history_record(item)) for item in raw if isinstance(item, dict)]


def _rewrite_asset_library_payload(raw: Any) -> Any:
    lib = normalize_asset_library(raw)
    persisted = json.loads(json.dumps(lib, ensure_ascii=False))
    for library in persisted.get("libraries", []) if isinstance(persisted.get("libraries"), list) else []:
        for category in library.get("categories", []) if isinstance(library.get("categories"), list) else []:
            items = category.get("items")
            if not isinstance(items, list):
                continue
            for index, item in enumerate(items):
                if isinstance(item, dict):
                    items[index] = compact_asset_item_reference(item)
    return persisted


def run_local_storage_migration(
    *,
    dry_run: bool = False,
    categories: Optional[Set[str]] = None,
    limit: int = 0,
    rewrite_metadata: bool = True,
    progress_callback: Optional[Callable[[int, int, Dict[str, Any]], None]] = None,
    total_callback: Optional[Callable[[int], None]] = None,
) -> Dict[str, Any]:
    reference_index = build_reference_index()
    candidates = iter_local_asset_candidates(categories=categories, reference_index=reference_index)
    if limit > 0:
        candidates = candidates[:limit]
    if total_callback:
        total_callback(len(candidates))
    results: List[Dict[str, Any]] = []
    total = len(candidates)
    for position, candidate in enumerate(candidates, start=1):
        try:
            result = migrate_candidate(candidate, dry_run=dry_run)
        except Exception as exc:
            result = {
                "status": "error",
                "reason": "migration_exception",
                "detail": f"{type(exc).__name__}: {exc}",
                "local_path": candidate.local_path,
                "legacy_url": candidate.legacy_url,
                "user_id": candidate.user_id,
                "category": candidate.category,
            }
        results.append(result)
        if progress_callback:
            progress_callback(position, total, result)
    summary = {
        "scanned": len(candidates),
        "migrated": sum(1 for item in results if item.get("status") == "migrated"),
        "repaired": sum(1 for item in results if item.get("status") == "repaired"),
        "planned": sum(1 for item in results if item.get("status") == "planned"),
        "skipped": sum(1 for item in results if item.get("status") == "skipped"),
        "errors": sum(1 for item in results if item.get("status") == "error"),
        "warnings": sum(1 for item in results if item.get("warning")),
        "results": results,
    }
    if rewrite_metadata:
        summary["metadata"] = rewrite_all_metadata(dry_run=dry_run)
    return summary
