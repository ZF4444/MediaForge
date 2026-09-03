"""Filesystem-discovered Agent Skills using the standard SKILL.md format."""
from __future__ import annotations
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
import re
from typing import Any
import yaml
from app.config import BASE_DIR
from app.core.utils import now_ms
from app.services.business_metadata import json_value, metadata_connection, new_id

MAX_SKILL_CONTENT_CHARS = 12_000
_SKILL_NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")

@dataclass(frozen=True)
class SkillSummary:
    name: str
    description: str
    path: str = ""

@dataclass(frozen=True)
class SkillDocument:
    name: str
    description: str
    content: str
    content_sha256: str

def _skill_root(root: str = "") -> Path:
    return Path(root).resolve() if root else (Path(BASE_DIR) / "skills").resolve()
def _read_text(path: Path) -> tuple[str, str]:
    if not path.is_file(): raise ValueError("Skill 内容不存在")
    raw = path.read_bytes(); digest = sha256(raw).hexdigest()
    try: content = raw.decode("utf-8")
    except UnicodeDecodeError as exc: raise ValueError("Skill 必须是 UTF-8 文本") from exc
    if len(content) > MAX_SKILL_CONTENT_CHARS: raise ValueError("Skill 内容超过允许长度")
    return content, digest
def _frontmatter(content: str) -> tuple[dict[str, Any], str]:
    if not content.startswith("---\n"): raise ValueError("Skill 必须提供 YAML frontmatter manifest")
    end = content.find("\n---\n", 4)
    if end < 0: raise ValueError("Skill frontmatter 未闭合")
    try: data = yaml.safe_load(content[4:end]) or {}
    except yaml.YAMLError as exc: raise ValueError("Skill frontmatter 格式无效") from exc
    if not isinstance(data, dict): raise ValueError("Skill frontmatter 必须是对象")
    return data, content[end + 5:]
def _summary_from_file(skill_dir: Path) -> SkillSummary:
    content, _ = _read_text(skill_dir / "SKILL.md"); manifest, _ = _frontmatter(content)
    name = str(manifest.get("name") or "")
    if not _SKILL_NAME.fullmatch(name) or name != skill_dir.name: raise ValueError("Skill manifest name 必须匹配目录名")
    description = str(manifest.get("description") or "").strip()
    if not description: raise ValueError("Skill manifest 缺少 description")
    return SkillSummary(name, description, skill_dir.as_posix())
def list_skill_summaries(*, root: str = "") -> list[SkillSummary]:
    skill_root = _skill_root(root)
    if not skill_root.is_dir(): return []
    return [_summary_from_file(path.resolve()) for path in sorted(skill_root.iterdir(), key=lambda item: item.name) if path.is_dir() and (path / "SKILL.md").is_file()]
def _skill_enablement() -> dict[str, bool] | None:
    try:
        with metadata_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT name, enabled FROM canvas_agent_skills")
            return {str(row["name"]): bool(row["enabled"]) for row in cur.fetchall()}
    except Exception: return None
def list_enabled_skill_summaries(*, root: str = "") -> list[SkillSummary]:
    skills = list_skill_summaries(root=root); enabled = _skill_enablement()
    return skills if enabled is None else [skill for skill in skills if enabled.get(skill.name, True)]
def get_skill(name: str, *, root: str = "") -> SkillSummary | None:
    return next((item for item in list_skill_summaries(root=root) if item.name == name), None)
def get_enabled_skill(name: str, *, root: str = "") -> SkillSummary | None:
    skill = get_skill(name, root=root); enabled = _skill_enablement()
    return skill if skill and (enabled is None or enabled.get(skill.name, True)) else None
def skill_metadata_prompt() -> str:
    return "可用 Skill（仅元数据，未加载正文）：\n" + "\n".join(f"- {s.name}: {s.description}" for s in list_enabled_skill_summaries())
def read_skill_document(name: str, *, root: str = "", _allow_builtin_registration: bool = False) -> SkillDocument:
    if not _SKILL_NAME.fullmatch(str(name or "")): raise KeyError(name)
    skill = get_skill(name, root=root) if _allow_builtin_registration else get_enabled_skill(name, root=root)
    if skill is None: raise KeyError(name)
    content, digest = _read_text(_skill_root(root) / skill.name / "SKILL.md"); manifest, body = _frontmatter(content)
    if str(manifest.get("name") or "") != skill.name or str(manifest.get("description") or "").strip() != skill.description: raise ValueError("Skill manifest 与目录元数据不匹配")
    return SkillDocument(skill.name, skill.description, body, digest)
def read_skill(name: str, *, root: str = "") -> str: return read_skill_document(name, root=root).content
def register_builtin_skills() -> None:
    now = now_ms()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        for skill in list_skill_summaries():
            document = read_skill_document(skill.name, _allow_builtin_registration=True)
            metadata = {"read_only": True, "content_ref": f"skills/{skill.name}/SKILL.md", "content_sha256": document.content_sha256, "max_content_chars": MAX_SKILL_CONTENT_CHARS}
            cur.execute("INSERT INTO canvas_agent_skills(id,name,description,enabled,metadata_json,created_at,updated_at) VALUES(%s,%s,%s,TRUE,%s,%s,%s) ON CONFLICT(name) DO UPDATE SET description=EXCLUDED.description,metadata_json=EXCLUDED.metadata_json,updated_at=EXCLUDED.updated_at", (new_id(), skill.name, skill.description, json_value(metadata), now, now))
