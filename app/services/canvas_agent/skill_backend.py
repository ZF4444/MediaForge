"""Read-only backend used by Skill lookup; it cannot access user files."""
from __future__ import annotations
from .skills import list_enabled_skill_summaries, read_skill

class SkillBackend:
    def list(self): return list_enabled_skill_summaries()
    def read(self, name: str) -> str: return read_skill(name)
    def write(self, *_args, **_kwargs): raise PermissionError("Skill backend is read-only")
    def execute(self, *_args, **_kwargs): raise PermissionError("Skill backend does not execute commands")
