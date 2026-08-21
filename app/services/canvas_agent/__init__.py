"""Canvas Agent Phase 0 deterministic infrastructure."""

from .adapter import semantic_plan_to_patch
from .capabilities import CapabilityRegistry, from_provider_configuration
from .executor import apply_patch, apply_patch_idempotently
from .policy import validate_patch, assess_patch
from .runtime import create_canvas_agent
from .store import create_run, get_run, update_run, append_message, list_messages, latest_plan, save_plan, begin_operation, finish_operation, save_artifact, latest_artifact, get_artifact, list_artifacts, set_artifact_status, append_event, list_events
from .artifacts import ARTIFACT_STAGES, ANCHOR_TYPES, compile_prompt, normalize_anchors
from .doc_chain import stage_sources, validate_stage_sources
from .evaluation import FIXED_CANVAS_SCENARIOS, evaluate_plan, record_evaluation

__all__ = ["CapabilityRegistry", "from_provider_configuration", "semantic_plan_to_patch", "validate_patch", "assess_patch", "apply_patch", "apply_patch_idempotently", "create_canvas_agent", "create_run", "get_run", "update_run", "append_message", "list_messages", "latest_plan", "save_plan", "begin_operation", "finish_operation", "save_artifact", "latest_artifact", "get_artifact", "list_artifacts", "set_artifact_status", "append_event", "list_events", "ARTIFACT_STAGES", "ANCHOR_TYPES", "compile_prompt", "normalize_anchors", "stage_sources", "validate_stage_sources", "FIXED_CANVAS_SCENARIOS", "evaluate_plan", "record_evaluation"]
