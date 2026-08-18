"""Fast Track Canvas Agent API."""
from __future__ import annotations
import asyncio
import time
from fastapi import APIRouter, Header, HTTPException, Request

from app.core.auth import safe_user_id
from app.core.utils import now_ms
from app.core.ws import manager
from app.models import CanvasAgentAnswerRequest, CanvasAgentConfirmRequest, CanvasAgentMessageRequest, CanvasAgentRedoRequest, CanvasAgentRetryRequest, CanvasAgentReviewRequest, CanvasAgentRunCreateRequest, CanvasArtifactAdvanceRequest, CanvasArtifactStatusRequest, CanvasArtifactUpsertRequest, CanvasCostEstimateRequest, CanvasOrchestrationRequest, CanvasProjectAssetShareRequest, CanvasPromptCompileRequest, CanvasPromptPackCompileRequest, CanvasPromptPackGenerateRequest, CanvasTemplateCreateRequest, CanvasTemplateInstantiateRequest
from app.models.canvas_agent import SemanticPlan
from app.services.business_metadata import load_canvas_payload
from app.services.canvas_agent.adapter import semantic_plan_to_patch
from app.services.canvas_agent.context import build_canvas_context
from app.services.canvas_agent.events import emit_agent_event
from app.services.canvas_agent.planner import plan_fast_track
from app.services.canvas_agent.model_resolver import resolve_canvas_agent_model
from app.services.canvas_agent.planner import plan_with_deep_agent
from app.services.canvas_agent.checkpoint import create_checkpointer
from app.services.canvas_agent.reliability import DEFAULT_RUN_LIMITS, canvas_structure_fingerprint, classify_failure, enforce_plan_limits
from app.config import CANVAS_TASK_TIMEOUT_SECONDS
from app.core.logging import audit_event, get_logger
from app.core.metrics import AGENT_RUNS, AGENT_OPERATION_SECONDS, AGENT_FAILURES
from app.services.canvas_agent.store import append_message, create_run, create_template, get_artifact, get_run, get_template, latest_plan, list_artifacts, list_events, list_messages, list_operations, list_project_assets, list_runs, list_templates, save_artifact, save_plan, set_artifact_status, share_project_asset, update_run
from app.services.canvas_agent.artifacts import ARTIFACT_STAGES, compile_prompt, normalize_anchors, validate_stage
from app.services.canvas_agent.skills import get_skill, list_skill_summaries, read_skill
from app.services.canvas_agent.doc_chain import stage_sources, validate_stage_sources
from app.services.canvas_agent.evaluation import evaluate_artifact_quality, record_evaluation
from app.services.canvas_agent.orchestration import build_specialist_plan, enforce_budget, estimate_plan_cost
from app.services.canvas_agent.executor import PatchConflictError, PatchPermissionError, apply_patch_idempotently
from app.services.canvas_agent.task_dispatch import submit_run_requests
from app.services.canvas_tasks import enqueue_canvas_task, get_canvas_task, release_canvas_task_dispatch, update_canvas_task

router = APIRouter()
logger = get_logger("canvas_agent")

def _user(request: Request, x_user_id: str) -> str:
    return safe_user_id(x_user_id, request)

async def _require_run(user_id: str, run_id: str) -> dict:
    run = await asyncio.to_thread(get_run, user_id, run_id)
    if not run: raise HTTPException(status_code=404, detail="Agent Run 不存在")
    return run

@router.post("/api/canvas-agent/runs")
async def create_agent_run(payload: CanvasAgentRunCreateRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id)
    limits = {**DEFAULT_RUN_LIMITS, **payload.limits, "max_steps": payload.max_steps}
    try: run = await asyncio.to_thread(create_run, user_id, payload.canvas_id, mode=payload.mode, conversation_id=payload.conversation_id, max_steps=payload.max_steps)
    except PermissionError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc
    await asyncio.to_thread(update_run, user_id, run["id"], metadata_json={"limits": limits})
    AGENT_RUNS.labels(mode=payload.mode, status="created").inc()
    await emit_agent_event(user_id, run["id"], "run.created", {"canvas_id": payload.canvas_id, "mode": payload.mode})
    return {"run": run}

@router.get("/api/canvas-agent/runs")
async def list_agent_runs(canvas_id: str, request: Request, limit: int = 50, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id)
    if not canvas_id.strip():
        raise HTTPException(status_code=422, detail="canvas_id 不能为空")
    # The store query scopes by both owner and canvas, so a guessed canvas ID
    # cannot expose runs belonging to another user.
    runs = await asyncio.to_thread(list_runs, user_id, canvas_id, limit=limit)
    return {"runs": runs}

@router.get("/api/canvas-agent/runs/{run_id}")
async def get_agent_run(run_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); run = await _require_run(user_id, run_id)
    messages, plan, events, operations, artifacts = await asyncio.gather(
        asyncio.to_thread(list_messages, user_id, run_id),
        asyncio.to_thread(latest_plan, user_id, run_id),
        asyncio.to_thread(list_events, user_id, run_id),
        asyncio.to_thread(list_operations, user_id, run_id),
        asyncio.to_thread(list_artifacts, user_id, run_id),
    )
    task_ids = list((run.get("metadata_json") or {}).get("task_ids") or [])
    tasks = await asyncio.gather(*(get_canvas_task(task_id) for task_id in task_ids)) if task_ids else []
    return {"run": run, "messages": messages, "plan": plan, "events": events, "operations": operations, "artifacts": artifacts, "tasks": [task for task in tasks if task]}

@router.post("/api/canvas-agent/runs/{run_id}/messages")
async def post_agent_message(run_id: str, payload: CanvasAgentMessageRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); run = await _require_run(user_id, run_id)
    if run["status"] in {"cancelled", "completed", "failed", "blocked"}: raise HTTPException(status_code=409, detail="Run 当前状态不可继续规划")
    await asyncio.to_thread(append_message, user_id, run_id, "user", payload.content, {"selected_node_ids": payload.selected_node_ids, "mention_node_ids": payload.mention_node_ids})
    try:
        context = await asyncio.to_thread(build_canvas_context, user_id, run["canvas_id"], selected_node_ids=payload.selected_node_ids, mention_node_ids=payload.mention_node_ids)
        context["run_id"] = run_id
        if payload.use_model:
            model = await asyncio.to_thread(resolve_canvas_agent_model, payload.provider, payload.model)
            with create_checkpointer() as checkpointer:
                plan = await plan_with_deep_agent(model, payload.content, context, checkpointer=checkpointer, harness_key="mediaforgechatmodel", resume=bool((run.get("metadata_json") or {}).get("model_thread_started")))
            await asyncio.to_thread(update_run, user_id, run_id, metadata_json={"model_thread_started": True, "model_provider": payload.provider, "model_name": payload.model})
        else:
            plan = plan_fast_track(payload.content, context)
        plan_json = plan.model_dump(mode="json")
        estimate = estimate_plan_cost(plan_json)
        plan_json["execution"]["estimated_cost"] = estimate["estimated_cost"]
        plan = SemanticPlan.model_validate(plan_json)
        enforce_plan_limits(plan_json, (run.get("metadata_json") or {}).get("limits"))
        saved = await asyncio.to_thread(save_plan, user_id, run_id, plan_json, status="awaiting_confirmation")
        await asyncio.to_thread(update_run, user_id, run_id, status="awaiting_confirmation", phase="planning", base_canvas_version=context["canvas_version"], step_count=int(run.get("step_count") or 0) + 1, metadata_json={"planned_canvas_fingerprint": canvas_structure_fingerprint(await asyncio.to_thread(load_canvas_payload, user_id, run["canvas_id"]))})
    except Exception as exc:
        AGENT_FAILURES.labels(stage="planning", category=classify_failure(exc)).inc()
        await asyncio.to_thread(update_run, user_id, run_id, status="failed", phase="planning")
        await emit_agent_event(user_id, run_id, "run.failed", {"error": str(exc)[:500]})
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await emit_agent_event(user_id, run_id, "plan.created", {"plan_version": saved["version"], "plan": plan.model_dump(mode="json")})
    return {"run": await asyncio.to_thread(get_run, user_id, run_id), "plan": saved}

@router.post("/api/canvas-agent/runs/{run_id}/answers")
async def answer_agent_question(run_id: str, payload: CanvasAgentAnswerRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); run = await _require_run(user_id, run_id)
    await asyncio.to_thread(append_message, user_id, run_id, "user", payload.answer, {"kind": "answer"})
    metadata = run.get("metadata_json") or {}
    if payload.use_model or metadata.get("model_thread_started"):
        try:
            context = await asyncio.to_thread(build_canvas_context, user_id, run["canvas_id"])
            context["run_id"] = run_id
            provider, model_name = payload.provider or metadata.get("model_provider", ""), payload.model or metadata.get("model_name", "")
            model = await asyncio.to_thread(resolve_canvas_agent_model, provider, model_name)
            with create_checkpointer() as checkpointer:
                plan = await plan_with_deep_agent(model, payload.answer, context, checkpointer=checkpointer, harness_key="mediaforgechatmodel", resume=True)
            saved = await asyncio.to_thread(save_plan, user_id, run_id, plan.model_dump(mode="json"), status="awaiting_confirmation")
            await asyncio.to_thread(update_run, user_id, run_id, status="awaiting_confirmation", phase="planning", base_canvas_version=context["canvas_version"], metadata_json={"model_thread_started": True, "model_provider": provider, "model_name": model_name})
            await emit_agent_event(user_id, run_id, "plan.created", {"plan_version": saved["version"], "plan": plan.model_dump(mode="json"), "resumed": True})
            return {"run": await asyncio.to_thread(get_run, user_id, run_id), "plan": saved}
        except Exception as exc:
            await asyncio.to_thread(update_run, user_id, run_id, status="failed", phase="planning")
            await emit_agent_event(user_id, run_id, "run.failed", {"error": str(exc)[:500]})
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    await asyncio.to_thread(update_run, user_id, run_id, status="planning", phase="planning")
    await emit_agent_event(user_id, run_id, "input.received", {"kind": "answer"})
    return {"run": await asyncio.to_thread(get_run, user_id, run_id)}

@router.post("/api/canvas-agent/runs/{run_id}/confirm")
async def confirm_agent_plan(run_id: str, payload: CanvasAgentConfirmRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); run = await _require_run(user_id, run_id); plan_row = await asyncio.to_thread(latest_plan, user_id, run_id)
    if not plan_row or int(plan_row["version"]) != payload.plan_version: raise HTTPException(status_code=409, detail="计划版本已过期")
    if run["status"] != "awaiting_confirmation": raise HTTPException(status_code=409, detail="Run 不在等待确认状态")
    if not payload.approved:
        await asyncio.to_thread(update_run, user_id, run_id, status="blocked", phase="planning")
        await emit_agent_event(user_id, run_id, "run.blocked", {"reason": "user_rejected_plan", "plan_version": payload.plan_version})
        return {"run": await asyncio.to_thread(get_run, user_id, run_id), "approved": False}
    canvas = await asyncio.to_thread(load_canvas_payload, user_id, run["canvas_id"])
    if not canvas: raise HTTPException(status_code=404, detail="画布不存在")
    current_version = int(canvas.get("version") or 1)
    run_metadata = run.get("metadata_json") or {}
    if current_version != int(run["base_canvas_version"]):
        planned_fingerprint = run_metadata.get("planned_canvas_fingerprint")
        current_fingerprint = canvas_structure_fingerprint(canvas)
        if planned_fingerprint and planned_fingerprint == current_fingerprint:
            # Only placement/viewport changed: rebuild the Patch against the latest version.
            await asyncio.to_thread(update_run, user_id, run_id, base_canvas_version=current_version, metadata_json={"placement_recomputed": True})
        else:
            await asyncio.to_thread(update_run, user_id, run_id, status="blocked", phase="planning")
            await emit_agent_event(user_id, run_id, "run.blocked", {"reason": "canvas_structure_conflict", "current_version": current_version, "base_version": run["base_canvas_version"]})
            raise HTTPException(status_code=409, detail={"message": "画布内容或连线已变化，请重新规划", "current_version": current_version})
    try:
        plan = SemanticPlan.model_validate(plan_row["content_json"])
        plan_json = plan.model_dump(mode="json")
        estimate = estimate_plan_cost(plan_json, budget=(run_metadata.get("limits") or {}).get("max_budget"))
        enforce_budget(estimate)
        plan_json["execution"]["estimated_cost"] = estimate["estimated_cost"]
        plan = SemanticPlan.model_validate(plan_json)
        enforce_plan_limits(plan_json, run_metadata.get("limits"))
        patch = semantic_plan_to_patch(plan, run["canvas_id"], current_version, canvas=canvas)
        await asyncio.to_thread(update_run, user_id, run_id, status="applying", phase="applying")
        result = await asyncio.to_thread(apply_patch_idempotently, user_id, run_id, f"{run_id}:plan:{payload.plan_version}", patch, risk="confirm", allow_user_node_changes=bool(payload.authorized_node_ids), authorized_node_ids=set(payload.authorized_node_ids))
    except (PatchConflictError, PatchPermissionError, ValueError) as exc:
        AGENT_FAILURES.labels(stage="applying", category=classify_failure(exc)).inc()
        await asyncio.to_thread(update_run, user_id, run_id, status="blocked", phase="applying")
        await emit_agent_event(user_id, run_id, "run.blocked", {"reason": str(exc)[:500]})
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    requested_tasks = len(result.get("run_requests") or [])
    limit_tasks = int((run_metadata.get("limits") or {}).get("max_tasks", DEFAULT_RUN_LIMITS["max_tasks"]))
    if requested_tasks > limit_tasks:
        await asyncio.to_thread(update_run, user_id, run_id, status="blocked", phase="running", metadata_json={"blocked_reason": "task_quota_exceeded"})
        await emit_agent_event(user_id, run_id, "run.blocked", {"reason": "task_quota_exceeded", "requested": requested_tasks, "limit": limit_tasks})
        raise HTTPException(status_code=409, detail="Run 任务配额超限")
    try:
        tasks = await submit_run_requests(user_id, run["canvas_id"], run_id, result.get("run_requests") or [], prompt=plan.goal)
    except Exception as exc:
        AGENT_FAILURES.labels(stage="task_submission", category=classify_failure(exc)).inc()
        await asyncio.to_thread(update_run, user_id, run_id, status="failed", phase="running")
        await emit_agent_event(user_id, run_id, "run.failed", {"error": str(exc)[:500], "stage": "task_submission"})
        raise HTTPException(status_code=502, detail="画布已更新，但生成任务提交失败") from exc
    await asyncio.to_thread(update_run, user_id, run_id, status="running" if tasks else "completed", phase="running" if tasks else "reviewing", metadata_json={"task_ids": [task["task_id"] for task in tasks]})
    AGENT_RUNS.labels(mode=run.get("mode", "fast_track"), status="running" if tasks else "completed").inc()
    audit_event("canvas_agent_plan_applied", action="apply_patch", resource_type="canvas_agent_run", resource_id=run_id, result="success", run_id=run_id, canvas_id=run["canvas_id"], operation_id=f"{run_id}:plan:{payload.plan_version}", request_id=request.headers.get("x-request-id", ""))
    await manager.broadcast_canvas_updated(run["canvas_id"], now_ms(), "", user_id)
    await emit_agent_event(user_id, run_id, "patch.applied", result)
    if tasks: await emit_agent_event(user_id, run_id, "tasks.queued", {"tasks": tasks})
    else: await emit_agent_event(user_id, run_id, "run.completed", {"version": result["version"]})
    return {"run": await asyncio.to_thread(get_run, user_id, run_id), "result": result, "tasks": tasks}

@router.post("/api/canvas-agent/runs/{run_id}/cancel")
async def cancel_agent_run(run_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); run = await _require_run(user_id, run_id)
    if run["status"] in {"completed", "cancelled"}: return {"run": run}
    task_ids = list((run.get("metadata_json") or {}).get("task_ids") or [])
    for task_id in task_ids:
        task = await get_canvas_task(task_id)
        if task and task.get("status") in {"queued", "running"}:
            await update_canvas_task(task_id, expected_status=task["status"], status="cancelled", cancellation_requested=True, error="Run 已取消")
            await release_canvas_task_dispatch(task_id)
    await asyncio.to_thread(update_run, user_id, run_id, status="cancelled", phase="cancelling")
    await emit_agent_event(user_id, run_id, "run.cancelled", {})
    return {"run": await asyncio.to_thread(get_run, user_id, run_id)}

@router.post("/api/canvas-agent/runs/{run_id}/retry")
async def retry_agent_run(run_id: str, payload: CanvasAgentRetryRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); run = await _require_run(user_id, run_id)
    metadata = run.get("metadata_json") or {}; retries = int(metadata.get("auto_repairs", 0) or 0); max_repairs = int((metadata.get("limits") or {}).get("max_auto_repairs", DEFAULT_RUN_LIMITS["max_auto_repairs"]))
    if retries >= max_repairs:
        await asyncio.to_thread(update_run, user_id, run_id, status="blocked", phase="reviewing", metadata_json={"blocked_reason": "auto_repair_quota_exceeded"})
        raise HTTPException(status_code=409, detail="Run 自动修复次数已用尽")
    await asyncio.to_thread(update_run, user_id, run_id, status="planning", phase="planning", metadata_json={"auto_repairs": retries + 1})
    await emit_agent_event(user_id, run_id, "run.retrying", {"operation_id": payload.operation_id})
    return {"run": await asyncio.to_thread(get_run, user_id, run_id)}

@router.post("/api/canvas-agent/runs/{run_id}/redo")
async def redo_agent_node(run_id: str, payload: CanvasAgentRedoRequest, request: Request, x_user_id: str = Header(default="")):
    """Create a child Run for a local prompt replacement and rerun branch."""
    user_id = _user(request, x_user_id); parent = await _require_run(user_id, run_id)
    canvas = await asyncio.to_thread(load_canvas_payload, user_id, parent["canvas_id"])
    if not canvas or not any(str(node.get("id")) == payload.node_id for node in canvas.get("nodes", []) if isinstance(node, dict)):
        raise HTTPException(status_code=404, detail="目标节点不存在")
    child = await asyncio.to_thread(create_run, user_id, parent["canvas_id"], mode=parent.get("mode", "fast_track"), conversation_id=parent.get("conversation_id", ""), base_canvas_version=int(canvas.get("version") or 1), max_steps=int(parent.get("max_steps") or 12))
    await asyncio.to_thread(update_run, user_id, child["id"], metadata_json={"parent_run_id": run_id, "redo_node_id": payload.node_id, "limits": (parent.get("metadata_json") or {}).get("limits", DEFAULT_RUN_LIMITS)})
    await asyncio.to_thread(append_message, user_id, child["id"], "user", payload.prompt, {"kind": "local_redo", "parent_run_id": run_id, "node_id": payload.node_id})
    plan = SemanticPlan(mode="fast_track", goal=payload.prompt, steps=[
        {"id": "replace", "action": "canvas.replace_node_content", "target_node_id": payload.node_id, "node": {"semantic_type": "prompt", "content": payload.prompt}},
        {"id": "rerun", "action": "canvas.run_node", "target_node_id": payload.node_id},
    ], confirmation={"required": True, "reason": "局部重做将替换目标节点内容并重新提交生成任务"}, execution={"auto_run": True, "parallelism": 1, "capabilities": ["canvas.replace_node_content", "canvas.run_node"], "estimated_cost": 1})
    saved = await asyncio.to_thread(save_plan, user_id, child["id"], plan.model_dump(mode="json"), status="awaiting_confirmation")
    await asyncio.to_thread(update_run, user_id, child["id"], status="awaiting_confirmation", phase="planning", metadata_json={"planned_canvas_fingerprint": canvas_structure_fingerprint(canvas)})
    await emit_agent_event(user_id, child["id"], "plan.created", {"plan_version": saved["version"], "plan": plan.model_dump(mode="json"), "parent_run_id": run_id, "local_redo": True})
    return {"run": await asyncio.to_thread(get_run, user_id, child["id"]), "plan": saved, "parent_run_id": run_id}

@router.post("/api/canvas-agent/runs/{run_id}/tasks/{task_id}/retry")
async def retry_agent_task(run_id: str, task_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); run = await _require_run(user_id, run_id)
    task = await get_canvas_task(task_id)
    if not task or task.get("owner_id") != user_id or task.get("agent_run_id") != run_id:
        raise HTTPException(status_code=404, detail="Agent 任务不存在")
    if task.get("status") not in {"failed", "interrupted", "timed_out"}:
        raise HTTPException(status_code=409, detail="只有失败任务可以重试")
    await release_canvas_task_dispatch(task_id)
    queued = await update_canvas_task(task_id, expected_status=task.get("status") or "failed", status="queued", error="", attempt=int(task.get("attempt", 1) or 1) + 1, deadline_at=time.time() + CANVAS_TASK_TIMEOUT_SECONDS)
    if not queued: raise HTTPException(status_code=409, detail="任务状态已变化")
    await enqueue_canvas_task(task_id)
    await emit_agent_event(user_id, run_id, "task.retrying", {"task_id": task_id, "node_id": task.get("agent_node_id")})
    return {"task": queued}

@router.post("/api/canvas-agent/runs/{run_id}/review")
async def review_agent_run(run_id: str, payload: CanvasAgentReviewRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); run = await _require_run(user_id, run_id)
    status = str(payload.status or "approved").strip().lower()
    if status not in {"approved", "rejected", "needs_revision"}:
        raise HTTPException(status_code=422, detail="无效的 Review 状态")
    next_status = "completed" if status == "approved" else "blocked"
    await asyncio.to_thread(update_run, user_id, run_id, status=next_status, phase="reviewing", metadata_json={"review_status": status, "review_note": payload.note})
    await emit_agent_event(user_id, run_id, "run.reviewed", {"status": status, "note": payload.note})
    return {"run": await asyncio.to_thread(get_run, user_id, run_id)}

@router.get("/api/canvas-agent/runs/{run_id}/events")
async def get_agent_events(run_id: str, request: Request, after_sequence: int = 0, limit: int = 500, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); await _require_run(user_id, run_id)
    events = await asyncio.to_thread(list_events, user_id, run_id, after_sequence=after_sequence, limit=limit)
    return {"events": events, "after_sequence": after_sequence}

@router.get("/api/canvas-agent/runs/{run_id}/artifacts")
async def get_agent_artifacts(run_id: str, request: Request, artifact_type: str = "", x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); await _require_run(user_id, run_id)
    if artifact_type: validate_stage(artifact_type)
    return {"artifacts": await asyncio.to_thread(list_artifacts, user_id, run_id, artifact_type=artifact_type)}

@router.post("/api/canvas-agent/runs/{run_id}/artifacts")
async def upsert_agent_artifact(run_id: str, payload: CanvasArtifactUpsertRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); await _require_run(user_id, run_id); stage = validate_stage(payload.type)
    if payload.status not in {"draft", "approved", "rejected"}: raise HTTPException(status_code=422, detail="无效的 Artifact 状态")
    content = normalize_anchors(payload.content) if stage == "asset_anchors" else payload.content
    artifact = await asyncio.to_thread(save_artifact, user_id, run_id, stage, content, status=payload.status, source_artifact_ids=payload.source_artifact_ids)
    await emit_agent_event(user_id, run_id, "artifact.created", {"artifact_id": artifact["id"], "type": stage, "version": artifact["version"], "stale_downstream": True})
    return {"artifact": artifact}

@router.post("/api/canvas-agent/runs/{run_id}/artifacts/advance")
async def advance_agent_artifact(run_id: str, payload: CanvasArtifactAdvanceRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); await _require_run(user_id, run_id)
    stage = validate_stage(payload.target_stage)
    all_artifacts = await asyncio.to_thread(list_artifacts, user_id, run_id)
    sources = [item for item in all_artifacts if item["id"] in set(payload.source_artifact_ids)]
    if not payload.source_artifact_ids:
        required_types = set(stage_sources(stage))
        sources = [item for item in all_artifacts if item.get("type") in required_types and item.get("status") == "approved" and not item.get("stale")]
    try: validate_stage_sources(stage, sources)
    except ValueError as exc: raise HTTPException(status_code=409, detail=str(exc)) from exc
    source_ids = [item["id"] for item in sources]
    content = normalize_anchors(payload.content) if stage == "asset_anchors" else payload.content
    artifact = await asyncio.to_thread(save_artifact, user_id, run_id, stage, content, status="draft", source_artifact_ids=source_ids)
    await emit_agent_event(user_id, run_id, "artifact.advanced", {"artifact_id": artifact["id"], "type": stage, "version": artifact["version"], "source_artifact_ids": source_ids})
    return {"artifact": artifact, "required_sources": stage_sources(stage)}

@router.post("/api/canvas-agent/runs/{run_id}/artifacts/{artifact_id}/status")
async def update_agent_artifact_status(run_id: str, artifact_id: str, payload: CanvasArtifactStatusRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); await _require_run(user_id, run_id)
    if payload.status not in {"approved", "rejected", "stale", "draft"}: raise HTTPException(status_code=422, detail="无效的 Artifact 状态")
    artifact = await asyncio.to_thread(set_artifact_status, user_id, run_id, artifact_id, payload.status, actor=user_id, rejection_note=payload.note)
    if not artifact: raise HTTPException(status_code=404, detail="Artifact 不存在")
    await emit_agent_event(user_id, run_id, "artifact.status_changed", {"artifact_id": artifact_id, "status": payload.status, "version": artifact["version"]})
    return {"artifact": artifact}

@router.post("/api/canvas-agent/runs/{run_id}/prompt-compile")
async def compile_agent_prompt(run_id: str, payload: CanvasPromptCompileRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); await _require_run(user_id, run_id)
    anchors = {}
    if payload.anchor_artifact_id:
        artifact = await asyncio.to_thread(get_artifact, user_id, run_id, payload.anchor_artifact_id)
        if not artifact: raise HTTPException(status_code=404, detail="Anchor Artifact 不存在")
        if artifact.get("stale"): raise HTTPException(status_code=409, detail="Anchor Artifact 已过期，请先重新批准")
        anchors = artifact.get("content_json") or {}
    return {"compiled": compile_prompt(shot=payload.shot, anchors=anchors)}

@router.post("/api/canvas-agent/runs/{run_id}/prompt-pack/compile")
async def compile_agent_prompt_pack(run_id: str, payload: CanvasPromptPackCompileRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); await _require_run(user_id, run_id)
    shot_list = await asyncio.to_thread(get_artifact, user_id, run_id, payload.shot_list_artifact_id)
    anchors = await asyncio.to_thread(get_artifact, user_id, run_id, payload.anchor_artifact_id)
    if not shot_list or not anchors: raise HTTPException(status_code=404, detail="Shot List 或 Anchor Artifact 不存在")
    if shot_list.get("stale") or anchors.get("stale") or shot_list.get("status") != "approved" or anchors.get("status") != "approved": raise HTTPException(status_code=409, detail="Shot List 与 Anchor 必须已批准且未过期")
    shots = (shot_list.get("content_json") or {}).get("shots") or []
    prompts = [compile_prompt(shot=shot, anchors=anchors.get("content_json") or {}) for shot in shots if isinstance(shot, dict)]
    artifact = await asyncio.to_thread(save_artifact, user_id, run_id, "prompt_pack", {"prompts": prompts}, status="draft", source_artifact_ids=[shot_list["id"], anchors["id"]])
    await emit_agent_event(user_id, run_id, "prompt_pack.compiled", {"artifact_id": artifact["id"], "version": artifact["version"], "prompt_count": len(prompts)})
    return {"artifact": artifact}

@router.post("/api/canvas-agent/runs/{run_id}/prompt-pack/{artifact_id}/generate")
async def generate_from_prompt_pack(run_id: str, artifact_id: str, payload: CanvasPromptPackGenerateRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); run = await _require_run(user_id, run_id)
    pack = await asyncio.to_thread(get_artifact, user_id, run_id, artifact_id)
    if not pack: raise HTTPException(status_code=404, detail="Prompt Pack 不存在")
    if pack.get("stale") or pack.get("status") != "approved": raise HTTPException(status_code=409, detail="Prompt Pack 必须已批准且未过期")
    prompts = (pack.get("content_json") or {}).get("prompts") or []
    requested_ids = list(payload.node_ids)
    prompt_map = {str(item.get("shot_id") or ""): str(item.get("prompt") or "") for item in prompts if isinstance(item, dict)}
    if requested_ids and len(requested_ids) != len(prompts): raise HTTPException(status_code=422, detail="节点数量必须与 Prompt Pack 数量一致")
    if not requested_ids: raise HTTPException(status_code=422, detail="生成 Prompt Pack 必须提供目标画布节点")
    node_ids = requested_ids
    requests = [{"op": "run_node", "node_id": node_id} for node_id in node_ids]
    prompts_by_node = {node_id: prompt for node_id, prompt in zip(node_ids, [item.get("prompt", "") for item in prompts])}
    tasks = await submit_run_requests(user_id, run["canvas_id"], run_id, requests, prompt="", prompts_by_node=prompts_by_node)
    await asyncio.to_thread(update_run, user_id, run_id, status="running", phase="running", metadata_json={"task_ids": [task["task_id"] for task in tasks], "prompt_pack_id": artifact_id})
    await emit_agent_event(user_id, run_id, "prompt_pack.tasks_queued", {"artifact_id": artifact_id, "tasks": tasks})
    return {"tasks": tasks}

@router.get("/api/canvas-agent/skills")
async def list_agent_skills():
    return {"skills": [summary.__dict__ for summary in list_skill_summaries()]}

@router.get("/api/canvas-agent/skills/{name}")
async def read_agent_skill(name: str):
    if not get_skill(name): raise HTTPException(status_code=404, detail="Skill 不存在")
    return {"name": name, "content": read_skill(name)}

@router.post("/api/canvas-agent/runs/{run_id}/cost-estimate")
async def estimate_agent_run_cost(run_id: str, payload: CanvasCostEstimateRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); await _require_run(user_id, run_id)
    plan = await asyncio.to_thread(latest_plan, user_id, run_id)
    if not plan: raise HTTPException(status_code=404, detail="尚无可估算成本的计划")
    return {"estimate": estimate_plan_cost(plan["content_json"], budget=payload.budget)}

@router.post("/api/canvas-agent/runs/{run_id}/orchestrate")
async def orchestrate_agent_run(run_id: str, payload: CanvasOrchestrationRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); await _require_run(user_id, run_id)
    try: orchestration = build_specialist_plan(payload.goal, roles=payload.roles)
    except ValueError as exc: raise HTTPException(status_code=422, detail=str(exc)) from exc
    await emit_agent_event(user_id, run_id, "orchestration.proposed", orchestration)
    return {"orchestration": orchestration, "budget": payload.budget}

@router.post("/api/canvas-agent/runs/{run_id}/artifacts/{artifact_id}/quality")
async def evaluate_agent_artifact_quality(run_id: str, artifact_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); await _require_run(user_id, run_id)
    artifact = await asyncio.to_thread(get_artifact, user_id, run_id, artifact_id)
    if not artifact: raise HTTPException(status_code=404, detail="Artifact 不存在")
    metrics = evaluate_artifact_quality(artifact)
    evaluation_id = await asyncio.to_thread(record_evaluation, metrics, run_id=run_id)
    await emit_agent_event(user_id, run_id, "artifact.quality_evaluated", {"artifact_id": artifact_id, "evaluation_id": evaluation_id, "score": metrics["score"]})
    return {"evaluation_id": evaluation_id, "metrics": metrics}

@router.get("/api/canvas-agent/templates")
async def get_agent_templates(request: Request, x_user_id: str = Header(default="")):
    return {"templates": await asyncio.to_thread(list_templates, _user(request, x_user_id))}

@router.post("/api/canvas-agent/templates")
async def create_agent_template(payload: CanvasTemplateCreateRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id)
    if payload.source_run_id: await _require_run(user_id, payload.source_run_id)
    template = await asyncio.to_thread(create_template, user_id, payload.name, payload.content, description=payload.description, source_run_id=payload.source_run_id)
    return {"template": template}

@router.post("/api/canvas-agent/templates/{template_id}/instantiate")
async def instantiate_agent_template(template_id: str, payload: CanvasTemplateInstantiateRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); await _require_run(user_id, payload.run_id)
    template = await asyncio.to_thread(get_template, user_id, template_id)
    if not template: raise HTTPException(status_code=404, detail="模板不存在")
    await emit_agent_event(user_id, payload.run_id, "template.instantiated", {"template_id": template_id, "version": template["version"]})
    return {"template": template, "content": template["content_json"]}

@router.get("/api/canvas-agent/project-assets")
async def get_agent_project_assets(project_id: str, request: Request, x_user_id: str = Header(default="")):
    if not project_id: raise HTTPException(status_code=422, detail="project_id 必填")
    return {"assets": await asyncio.to_thread(list_project_assets, _user(request, x_user_id), project_id)}

@router.post("/api/canvas-agent/project-assets")
async def share_agent_project_asset(payload: CanvasProjectAssetShareRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id); await _require_run(user_id, payload.run_id)
    try: asset = await asyncio.to_thread(share_project_asset, user_id, payload.run_id, payload.artifact_id, payload.project_id, asset_type=payload.asset_type)
    except PermissionError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc
    await emit_agent_event(user_id, payload.run_id, "project_asset.shared", {"asset_id": asset["id"], "project_id": payload.project_id, "artifact_id": payload.artifact_id})
    return {"asset": asset}
