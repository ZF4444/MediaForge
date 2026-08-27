"""Progressive, read-only Skill catalog for the Canvas Agent."""
from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
from pathlib import Path
import re
from typing import Any

import yaml

from app.config import BASE_DIR
from app.core.utils import now_ms
from app.services.business_metadata import json_value, metadata_connection, new_id


MAX_SKILL_CONTENT_CHARS = 12_000
MAX_RESOURCE_CONTENT_CHARS = 8_000
MAX_RESOURCES_PER_TURN = 6
_SKILL_NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
_TEXT_RESOURCE_SUFFIXES = {".md", ".txt", ".json", ".yaml", ".yml", ".csv"}


@dataclass(frozen=True)
class SkillResource:
    path: str
    media_type: str = "text/markdown"
    max_content_chars: int = MAX_RESOURCE_CONTENT_CHARS


@dataclass(frozen=True)
class SkillSummary:
    name: str
    description: str
    version: str = "1"
    path: str = ""
    triggers: tuple[str, ...] = ()
    resources: tuple[SkillResource, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class SkillDocument:
    name: str
    description: str
    version: str
    content: str
    content_sha256: str
    triggers: tuple[str, ...] = ()


@dataclass(frozen=True)
class SkillResourceDocument:
    skill_name: str
    skill_version: str
    path: str
    media_type: str
    content: str
    content_sha256: str


_SKILLS = (
    SkillSummary(
        "canvas-capabilities", "Read-only canvas capability and parameter reference", "1.0.0",
        triggers=("图片", "视频", "参数", "工作流"),
        resources=(SkillResource("references/capability-reading.md"),),
    ),
    SkillSummary("product-ad-creative", "Product advertising creative workflow", "1.0.0", triggers=("产品广告", "主视觉", "电商")),
    SkillSummary("shot-list", "Shot list planning workflow", "1.0.0", triggers=("分镜", "镜头", "shot list")),
    SkillSummary("prompt-pack", "Prompt package structure and validation", "1.0.0", triggers=("提示词", "prompt", "批量生成")),
    SkillSummary(
        "image-generation", "Canvas image-generation planning and iteration workflow", "1.0.0",
        triggers=("生图", "文生图", "图生图", "图片生成", "画面", "提示词"),
    ),
)


def list_skill_summaries() -> list[SkillSummary]:
    return list(_SKILLS)


def _enabled_skill_names() -> set[str] | None:
    """Return the database authority when available; bootstrap falls back to builtins."""
    try:
        with metadata_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT name FROM canvas_agent_skills WHERE enabled=TRUE")
            return {str(row["name"]) for row in cur.fetchall()}
    except Exception:
        return None


def list_enabled_skill_summaries() -> list[SkillSummary]:
    enabled = _enabled_skill_names()
    return list(_SKILLS) if enabled is None else [skill for skill in _SKILLS if skill.name in enabled]


def get_skill(name: str) -> SkillSummary | None:
    return next((item for item in _SKILLS if item.name == name), None)


def get_enabled_skill(name: str) -> SkillSummary | None:
    skill = get_skill(name)
    enabled = _enabled_skill_names()
    return skill if skill and (enabled is None or skill.name in enabled) else None


def skill_metadata_prompt() -> str:
    """Level 1 catalog injected once for an Agent invocation."""
    rows = [
        f"- {skill.name} v{skill.version}: {skill.description}"
        + (f"（触发提示：{'、'.join(skill.triggers)}）" if skill.triggers else "")
        for skill in list_enabled_skill_summaries()
    ]
    return "可用 Skill（仅元数据，未加载正文）：\n" + "\n".join(rows)


def _skill_root(root: str = "") -> Path:
    return Path(root).resolve() if root else (Path(BASE_DIR) / "skills").resolve()


def _safe_relative_path(value: str) -> Path:
    path = Path(str(value or ""))
    if not value or path.is_absolute() or ".." in path.parts:
        raise ValueError("资源路径必须是已登记的相对路径")
    return path


def _resolve_under(root: Path, relative_path: Path) -> Path:
    candidate = (root / relative_path).resolve()
    if candidate == root or root not in candidate.parents:
        raise ValueError("资源路径超出 Skill 受控目录")
    return candidate


def _read_text(path: Path, limit: int) -> tuple[str, str]:
    if not path.is_file():
        raise ValueError("Skill 内容不存在")
    raw = path.read_bytes()
    digest = sha256(raw).hexdigest()
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("Skill 资源必须为 UTF-8 文本") from exc
    if len(content) > limit:
        raise ValueError("Skill 内容超过允许长度")
    return content, digest


def _frontmatter(content: str) -> tuple[dict[str, Any], str]:
    if not content.startswith("---\n"):
        return {}, content
    end = content.find("\n---\n", 4)
    if end < 0:
        raise ValueError("Skill frontmatter 未闭合")
    try:
        data = yaml.safe_load(content[4:end]) or {}
    except yaml.YAMLError as exc:
        raise ValueError("Skill frontmatter 格式无效") from exc
    if not isinstance(data, dict):
        raise ValueError("Skill frontmatter 必须是对象")
    return data, content[end + 5:]


def read_skill_document(name: str, *, root: str = "", _allow_builtin_registration: bool = False) -> SkillDocument:
    if not _SKILL_NAME.fullmatch(str(name or "")):
        raise KeyError(name)
    skill = get_skill(name) if _allow_builtin_registration else get_enabled_skill(name)
    if skill is None:
        raise KeyError(name)
    skill_root = _resolve_under(_skill_root(root), Path(skill.name))
    content, digest = _read_text(_resolve_under(skill_root, Path("SKILL.md")), MAX_SKILL_CONTENT_CHARS)
    frontmatter, _ = _frontmatter(content)
    if frontmatter:
        if str(frontmatter.get("name") or "") != skill.name:
            raise ValueError("Skill frontmatter 名称不匹配")
        if str(frontmatter.get("version") or "") != skill.version:
            raise ValueError("Skill frontmatter 版本不匹配")
    return SkillDocument(skill.name, skill.description, skill.version, content, digest, skill.triggers)


def read_skill(name: str, *, root: str = "") -> str:
    """Compatibility API returning the complete Level 2 instruction body."""
    return read_skill_document(name, root=root).content


def read_skill_resource(name: str, resource_path: str, *, root: str = "", _allow_builtin_registration: bool = False) -> SkillResourceDocument:
    """Read one Level 3 resource that is explicitly registered for a Skill."""
    skill = get_skill(name) if _allow_builtin_registration else get_enabled_skill(name)
    if skill is None:
        raise KeyError(name)
    relative_path = _safe_relative_path(resource_path)
    registration = next((item for item in skill.resources if item.path == relative_path.as_posix()), None)
    if registration is None:
        raise PermissionError("该资源未在 Skill 注册表中登记")
    if relative_path.suffix.lower() not in _TEXT_RESOURCE_SUFFIXES:
        raise ValueError("当前仅支持受控文本资源")
    skill_root = _resolve_under(_skill_root(root), Path(skill.name))
    content, digest = _read_text(_resolve_under(skill_root, relative_path), registration.max_content_chars)
    return SkillResourceDocument(skill.name, skill.version, registration.path, registration.media_type, content, digest)


def register_builtin_skills() -> None:
    """Persist catalog metadata only; bodies and resources remain read-on-demand."""
    now = now_ms()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        for skill in _SKILLS:
            document = read_skill_document(skill.name, _allow_builtin_registration=True)
            resources = []
            for resource in skill.resources:
                resource_document = read_skill_resource(skill.name, resource.path, _allow_builtin_registration=True)
                resources.append({
                    "path": resource.path,
                    "sha256": resource_document.content_sha256,
                    "media_type": resource.media_type,
                    "max_content_chars": resource.max_content_chars,
                })
            metadata = {
                "read_only": True,
                "content_ref": f"skills/{skill.name}/SKILL.md",
                "content_sha256": document.content_sha256,
                "triggers": list(skill.triggers),
                "max_content_chars": MAX_SKILL_CONTENT_CHARS,
                "resources": resources,
            }
            cur.execute(
                "INSERT INTO canvas_agent_skills(id,name,description,version,enabled,metadata_json,created_at,updated_at) "
                "VALUES(%s,%s,%s,%s,TRUE,%s,%s,%s) "
                "ON CONFLICT(name) DO UPDATE SET description=EXCLUDED.description,version=EXCLUDED.version,enabled=TRUE,metadata_json=EXCLUDED.metadata_json,updated_at=EXCLUDED.updated_at",
                (new_id(), skill.name, skill.description, skill.version, json_value(metadata), now, now),
            )
