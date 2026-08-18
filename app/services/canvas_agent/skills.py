"""Progressive, read-only Skill catalog for Fast Track."""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from app.core.utils import now_ms
from app.config import BASE_DIR
from app.services.business_metadata import json_value, metadata_connection, new_id

@dataclass(frozen=True)
class SkillSummary:
    name: str
    description: str
    version: str = "1"
    path: str = ""

_SKILLS = (
    SkillSummary("canvas-capabilities", "Read-only canvas capability and parameter reference", "1.0.0"),
    SkillSummary("product-ad-creative", "Product advertising creative workflow", "1.0.0"),
    SkillSummary("shot-list", "Shot list planning workflow", "1.0.0"),
    SkillSummary("prompt-pack", "Prompt package structure and validation", "1.0.0"),
)

def list_skill_summaries() -> list[SkillSummary]: return list(_SKILLS)
def get_skill(name: str) -> SkillSummary | None: return next((item for item in _SKILLS if item.name == name), None)
def read_skill(name: str, *, root: str = "") -> str:
    skill = get_skill(name)
    if skill is None: raise KeyError(name)
    path = Path(root or (Path(BASE_DIR) / "skills")) / name / "SKILL.md"
    if not path.is_file(): return f"# {skill.name}\n\n{skill.description}\n"
    return path.read_text(encoding="utf-8")

def register_builtin_skills() -> None:
    """Persist catalog metadata only; Skill bodies remain filesystem read-on-demand."""
    now = now_ms()
    with metadata_connection() as conn, conn.transaction(), conn.cursor() as cur:
        for skill in _SKILLS:
            cur.execute("INSERT INTO canvas_agent_skills(id,name,description,version,enabled,metadata_json,created_at,updated_at) VALUES(%s,%s,%s,%s,TRUE,%s,%s,%s) ON CONFLICT(name) DO UPDATE SET description=EXCLUDED.description,version=EXCLUDED.version,enabled=TRUE,updated_at=EXCLUDED.updated_at", (new_id(), skill.name, skill.description, skill.version, json_value({"read_only": True, "path": f"skills/{skill.name}/SKILL.md"}), now, now))
