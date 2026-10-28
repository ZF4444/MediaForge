"""Fast Track Canvas Agent API."""

from __future__ import annotations

import asyncio
import json
import time
from types import SimpleNamespace

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.types import Command

from app.config import CANVAS_TASK_TIMEOUT_SECONDS
from app.core.access_control import has_page_access
from app.core.auth import current_user_id, safe_user_id
from app.core.logging import audit_event, get_logger
from app.core.metrics import (
    AGENT_EVENT_PRESENTATION_UNKNOWN_TARGETS,
    AGENT_FAILURES,
    AGENT_RUNS,
)
from app.core.utils import now_ms
from app.core.ws import manager
from app.models import (
    CanvasAgentAnswerRequest,
    CanvasAgentConfirmRequest,
    CanvasAgentMessageRequest,
    CanvasAgentRunCreateRequest,
)
from app.services.business_metadata import load_canvas_payload
from app.services.canvas_agent.agent_runner import run_canvas_agent
from app.services.canvas_agent.canvas_adapter import capability_schema_resolver, semantic_plan_to_patch
from app.services.canvas_agent.canvas_context import build_canvas_context
from app.services.canvas_agent.canvas_cost_estimate import (
    enforce_budget,
    estimate_plan_cost,
)
from app.services.canvas_agent.canvas_executor import (
    PatchConflictError,
    PatchPermissionError,
    apply_patch_idempotently,
)
from app.services.canvas_agent.canvas_task_dispatch import submit_run_requests
from app.services.canvas_agent.checkpoint import create_async_checkpointer
from app.services.canvas_agent.event_factory import EventSpec, patch_applied, task_lifecycle
from app.services.canvas_agent.event_factory import progress as progress_event
from app.services.canvas_agent.event_types import PRESENTATION_TARGETS
from app.services.canvas_agent.events import emit_agent_event
from app.services.canvas_agent.model_adapter import (
    CanvasAgentUpstreamError,
    resolve_canvas_agent_model,
)
from app.services.canvas_agent.reliability_helpers import (
    DEFAULT_RUN_LIMITS,
    canvas_structure_fingerprint,
    classify_failure,
    enforce_plan_limits,
)
from app.services.canvas_agent.schemas import CanvasPatch, SemanticPlan, with_semantic_prompt
from app.services.canvas_agent.store import (
    append_message,
    create_run,
    delete_run,
    get_run,
    latest_plan,
    list_events,
    list_messages,
    list_operations,
    list_runs,
    rename_run,
    replace_plan_content,
    request_run_command_cancellation,
    save_plan,
    set_plan_status,
    submit_command,
    update_run,
)
from app.services.canvas_tasks import (
    enqueue_canvas_task,
    get_canvas_task,
    release_canvas_task_dispatch,
    update_canvas_task,
)


async def _emit_event_spec(user_id: str, run_id: str, spec: EventSpec) -> None:
    """Send one canonical Agent event through the sole persistence boundary."""
    await emit_agent_event(
        user_id,
        run_id,
        spec.event_type,
        spec.payload,
        phase=spec.phase,
        severity=spec.severity,
    )


def _require_canvas_agent_access() -> str:
    user_id = current_user_id()
    if not has_page_access(user_id, "canvas-agent"):
        raise HTTPException(status_code=403, detail="需要“画布 Agent”页面权限。")
    return user_id


router = APIRouter(dependencies=[Depends(_require_canvas_agent_access)])
logger = get_logger("canvas_agent")


def _user(request: Request, x_user_id: str) -> str:
    return safe_user_id(x_user_id, request)


@router.post("/api/canvas-agent/presentation-diagnostics", status_code=204)
async def canvas_agent_presentation_diagnostics(request: Request, x_user_id: str = Header(default="")):
    """Record a client/server presentation-contract version mismatch."""
    user_id = _user(request, x_user_id)
    try:
        body = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return Response(status_code=204)
    target = str((body or {}).get("target") or "")[:64] if isinstance(body, dict) else ""
    if target and target not in PRESENTATION_TARGETS:
        AGENT_EVENT_PRESENTATION_UNKNOWN_TARGETS.inc()
        logger.warning(
            "unknown Canvas Agent presentation target reported by client",
            extra={
                "event": "canvas_agent_event_presentation_unknown_target",
                "user_id": user_id,
                "target": target,
            },
        )
    return Response(status_code=204)


def _can_continue_planning(status: str) -> bool:
    """A completed execution ends one turn, not the Agent conversation."""
    return str(status or "") not in {"cancelled", "failed", "blocked"}


def _normalize_semantic_type(raw: str) -> str:
    """Map a canvas/frontend node type onto a valid SemanticNodeType literal.

    Live canvas nodes carry frontend-only types (e.g. ``smart-asset-image`` for
    pasted/cropped asset nodes, ``smart-loop``) that are not part of the
    SemanticNode contract. Passing them through unmapped makes SemanticPlan
    validation fail during cost estimation, so collapse them to the closest
    valid semantic type with an image default.
    """
    value = str(raw or "").strip()
    mapping = {
        "prompt": "prompt",
        "smart-prompt": "smart-prompt",
        "image_generation": "image_generation",
        "video_generation": "video_generation",
        "workflow_generation": "workflow_generation",
        "smart-image": "smart-image",
        "smart-asset-image": "image_generation",
        "group": "group",
        "smart-group": "smart-group",
        "smart-loop": "smart-prompt",
    }
    if value in mapping:
        return mapping[value]
    if "video" in value:
        return "video_generation"
    if "prompt" in value:
        return "smart-prompt"
    return "image_generation"


def _overlay_params(target: dict, proposed: dict) -> None:
    """Deep-merge model-proposed params into a node snapshot; proposed values win.

    RunningHub fields persist as ``{"value": ...}``. When the snapshot holds that
    envelope and the proposal is a bare scalar, update the envelope in place so
    the stored shape stays consistent.
    """
    for key, value in proposed.items():
        current = target.get(key)
        if isinstance(value, dict) and isinstance(current, dict):
            _overlay_params(current, value)
        elif isinstance(current, dict) and set(current) == {"value"} and not isinstance(value, dict):
            current["value"] = value
        else:
            target[key] = json.loads(json.dumps(value))


def _hydrate_plan_nodes(plan_json: dict, canvas: dict | None) -> dict:
    """Attach node snapshots to every configurable step for the UI.

    A run step may target a node created earlier in the same plan. That node is
    not present in the persisted canvas yet, so looking only at the canvas
    snapshot leaves the second confirmation card without its title, prompt, or
    parameters. Keep the create-step snapshot as a local source as well.
    """
    nodes = {str(item.get("id") or ""): item for item in (canvas or {}).get("nodes", []) if isinstance(item, dict)}
    planned_nodes = {
        str(step.get("id") or ""): step.get("node")
        for step in plan_json.get("steps", [])
        if isinstance(step, dict) and step.get("action") == "canvas.create_node" and isinstance(step.get("node"), dict)
    }
    for step in plan_json.get("steps", []):
        if not isinstance(step, dict) or not step.get("target_node_id"):
            continue
        target_id = str(step["target_node_id"])
        proposed_node = step.get("node")
        source = nodes.get(target_id)
        planned = planned_nodes.get(target_id)
        if not source and not planned:
            continue
        if planned and not source and not step.get("node"):
            # The semantic node shape is already what the confirmation UI
            # expects; copy it so later mutation cannot affect the source step.
            step["node"] = json.loads(json.dumps(planned))
            continue
        if not source:
            # Keep a provider-supplied snapshot when the target is not yet
            # persisted and no create-step snapshot is available.
            continue
        # Canvas nodes have accumulated a few storage shapes over time. In
        # particular, `text` can be an imported file path while the actual
        # generation prompt lives in promptDraftText/runPrompt.
        source_params = source.get("params") if isinstance(source.get("params"), dict) else {}
        source_settings = source.get("settings") if isinstance(source.get("settings"), dict) else {}
        source_run_settings = source.get("runSettings") if isinstance(source.get("runSettings"), dict) else {}
        params = dict(source_params)
        if source_settings:
            params.setdefault("runSettings", dict(source_settings))
        if source_run_settings:
            merged_settings = dict(params.get("runSettings") or {})
            merged_settings.update(source_run_settings)
            params["runSettings"] = merged_settings
        prompt = next(
            (
                source.get(key)
                for key in ("promptDraftText", "runPrompt", "prompt", "content", "text")
                if isinstance(source.get(key), str) and source.get(key).strip()
            ),
            "",
        )
        capability = str(source.get("capability") or "")
        raw_type = str(source.get("type") or source.get("semantic_type") or "")
        semantic_type = _normalize_semantic_type(raw_type)
        if not capability:
            node_type = semantic_type
            api_kind = str(source_run_settings.get("apiKind") or source.get("genKind") or "").lower()
            engine = str(source_run_settings.get("engine") or "").lower()
            if node_type in {"smart-prompt", "prompt"}:
                capability = "prompt.generate"
            elif engine == "comfy":
                capability = f"comfyui.workflow.{'video' if api_kind == 'video' else 'image'}"
            elif engine == "runninghub" or source_run_settings.get("resource_id"):
                capability = f"runninghub.app.{'video' if api_kind == 'video' else 'image'}"
            elif api_kind == "video":
                capability = "video.text_to_video"
            elif node_type in {"smart-image", "image_generation", "video_generation", "workflow_generation"}:
                capability = "image.text_to_image"
        hydrated_params = json.loads(json.dumps(with_semantic_prompt(params, prompt)))
        # An update step carries the values the model wants to change. The
        # snapshot only supplies the surrounding settings, so the proposal must
        # win; otherwise the confirmation card shows (and applies) stale values.
        proposed = proposed_node.get("params") if isinstance(proposed_node, dict) else None
        if step.get("action") == "canvas.update_node_params" and isinstance(proposed, dict) and proposed:
            if "runSettings" not in proposed:
                # Flat {field_id: value} form: let the backend place and coerce
                # the values the same way it does for newly created nodes.
                target = SimpleNamespace(
                    capability=capability,
                    connection_id=str(source_run_settings.get("connection_id") or source.get("connection_id") or ""),
                    resource_id=str(source_run_settings.get("resource_id") or source.get("resource_id") or ""),
                    model_id=str(source_run_settings.get("model_id") or source.get("model_id") or ""),
                )
                schema = capability_schema_resolver(target)
                if schema:
                    from app.services.ai_parameters import normalize_capability_params

                    proposed = normalize_capability_params(schema, proposed)
            _overlay_params(hydrated_params, proposed)
        step["node"] = {
            "schema_version": 1,
            "semantic_type": semantic_type,
            "title": source.get("title") or source.get("name") or "",
            "capability": capability,
            "params": hydrated_params,
        }
    return plan_json


async def _require_run(user_id: str, run_id: str) -> dict:
    run = await asyncio.to_thread(get_run, user_id, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Agent Run 不存在")
    return run


async def _append_plan_reply(user_id: str, run_id: str) -> str:
    """Persist the user-facing end of a planning turn before rendering its plan."""
    reply = "我已整理好执行计划，请确认后继续。"
    await asyncio.to_thread(append_message, user_id, run_id, "assistant", reply, {"kind": "plan_ready"})
    await emit_agent_event(user_id, run_id, "message.replied", {"reply": reply})
    return reply


async def _append_execution_reply(
    user_id: str, run_id: str, canvas_id: str, execution_result: dict, tasks: list[dict], model=None
) -> None:
    """Persist the post-confirmation Agent reply and its live node references."""
    canvas = await asyncio.to_thread(load_canvas_payload, user_id, canvas_id)
    nodes = {str(node.get("id") or ""): node for node in (canvas or {}).get("nodes", []) if isinstance(node, dict)}
    node_ids = list(
        dict.fromkeys(
            [
                *[str(node_id) for node_id in (execution_result.get("changed_node_ids") or []) if node_id],
                *[
                    str(item.get("node_id") or "")
                    for item in (execution_result.get("run_requests") or [])
                    if isinstance(item, dict)
                ],
            ]
        )
    )
    references = [
        {
            "node_id": node_id,
            "image_index": -1,
            "empty": True,
            "source": "canvas",
            "url": "",
            "thumbnail": "",
            "preview_url": "",
            "name": str(nodes.get(node_id, {}).get("title") or nodes.get(node_id, {}).get("name") or node_id),
        }
        for node_id in node_ids
    ]
    created = len(execution_result.get("node_refs") or {})
    changed = max(0, len(node_ids) - created)
    fallback = "已创建节点。" if created == 1 else (f"已创建 {created} 个节点。" if created else "已完成画布节点更新。")
    if changed:
        fallback += " 已更新关联节点。"
    if tasks:
        fallback += " 生成任务已提交，结果会显示在下方节点中。"
    if model is not None:
        try:
            response = await model.ainvoke(
                [
                    SystemMessage(
                        content="你是画布 Agent。根据已执行工具的真实结果，用中文写一到两句简短交付说明。不要声称任务已完成；若任务已提交，说明正在生成。不要使用 Markdown、列表或提问。"
                    ),
                    HumanMessage(
                        content=json.dumps(
                            {
                                "created_nodes": created,
                                "updated_nodes": changed,
                                "submitted_tasks": len(tasks),
                                "node_names": [item["name"] for item in references],
                            },
                            ensure_ascii=False,
                        )
                    ),
                ]
            )
            content = str(getattr(response, "content", "") or "").strip()
            if content and not getattr(response, "tool_calls", None):
                fallback = content[:500]
        except Exception:
            logger.warning(
                "canvas agent execution reply generation failed",
                exc_info=True,
                extra={"event": "canvas_agent_execution_reply_failed", "run_id": run_id},
            )
    await asyncio.to_thread(
        append_message,
        user_id,
        run_id,
        "assistant",
        fallback,
        {"kind": "execution_result", "media_references": references},
    )
    await emit_agent_event(user_id, run_id, "message.replied", {"reply": fallback, "media_references": references})


def _merge_existing_params(current: dict, incoming: dict) -> dict:
    """Apply only keys already proposed by the model; do not accept new execution fields from the browser."""
    merged = dict(current)
    for key, value in incoming.items():
        if key not in current:
            continue
        if isinstance(current[key], dict) and isinstance(value, dict):
            merged[key] = _merge_existing_params(current[key], value)
        elif isinstance(value, (str, int, float, bool)) or value is None:
            merged[key] = value
    return merged


def _merge_confirmed_params(node, incoming: dict) -> dict:
    """Accept new parameter keys only when the selected capability declares them."""
    merged = _merge_existing_params(node.params, incoming)
    schema = capability_schema_resolver(node)
    if not schema:
        return merged
    from app.services.ai_parameters import normalize_capability_params

    path = str(schema.get("params_path") or "runSettings").split(".")
    values = incoming
    for key in path:
        values = values.get(key, {}) if isinstance(values, dict) else {}
    flat = dict(node.params)
    if isinstance(values, dict):
        flat.update({key: value.get("value") if isinstance(value, dict) else value for key, value in values.items()})
    canonical = normalize_capability_params(schema, flat)

    def merge(target, source):
        for key, value in source.items():
            if isinstance(value, dict):
                if not isinstance(target.get(key), dict):
                    target[key] = {}
                merge(target[key], value)
            else:
                target[key] = value
    merge(merged, canonical)
    return merged


async def _confirmed_plan(plan_row: dict, overrides: list[dict]) -> SemanticPlan:
    plan = SemanticPlan.model_validate(plan_row["content_json"])
    steps = {step.id: step for step in plan.steps if step.node is not None}
    if len(overrides) > len(steps):
        raise HTTPException(status_code=422, detail="节点配置数量无效")
    seen: set[str] = set()
    for override in overrides:
        step_id = str(override.get("step_id") or "")
        step = steps.get(step_id)
        if not step or step_id in seen:
            raise HTTPException(status_code=422, detail="节点配置目标无效")
        seen.add(step_id)
        node = step.node
        assert node is not None
        if "title" in override:
            node.title = str(override["title"] or "")[:200]
        params = override.get("params")
        if params is not None:
            if not isinstance(params, dict):
                raise HTTPException(status_code=422, detail="节点参数格式无效")
            try:
                node.params = await asyncio.to_thread(_merge_confirmed_params, node, params)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        # The prompt now lives in params.runSettings.prompt. Accept the legacy
        # top-level "content" override for compatibility and write it there so
        # a user-edited prompt is preserved regardless of the merge guard.
        if "content" in override:
            node.params = with_semantic_prompt(node.params, str(override["content"] or "")[:20000])
    return plan


async def _apply_confirmation_overrides(user_id: str, run_id: str, plan_row: dict, overrides: list[dict]) -> None:
    if not overrides:
        return
    plan = await _confirmed_plan(plan_row, overrides)
    saved = await asyncio.to_thread(
        replace_plan_content, user_id, run_id, int(plan_row["version"]), plan.model_dump(mode="json")
    )
    if not saved:
        raise HTTPException(status_code=409, detail="计划版本已过期")


async def _execute_approved_canvas_patch(
    user_id: str, run_id: str, canvas_id: str, plan_version: int, authorized_node_ids: list[str],
    *, execution_patch: dict | None = None, canvas_fingerprint: str = "",
) -> dict:
    """The graph-owned mutation boundary invoked only after confirmation."""
    run = await _require_run(user_id, run_id)
    plan_row = await asyncio.to_thread(latest_plan, user_id, run_id)
    if not plan_row or int(plan_row["version"]) != int(plan_version):
        raise HTTPException(status_code=409, detail="计划版本已过期")
    canvas = await asyncio.to_thread(load_canvas_payload, user_id, canvas_id)
    if not canvas:
        raise HTTPException(status_code=404, detail="画布不存在")
    if canvas_fingerprint and canvas_fingerprint != canvas_structure_fingerprint(canvas):
        raise HTTPException(status_code=409, detail="画布内容已变化，请重新确认计划")
    current_version = int(canvas.get("version") or 1)
    run_metadata = run.get("metadata_json") or {}
    if current_version != int(run["base_canvas_version"]):
        planned_fingerprint = canvas_fingerprint or run_metadata.get("planned_canvas_fingerprint")
        if planned_fingerprint and planned_fingerprint == canvas_structure_fingerprint(canvas):
            await asyncio.to_thread(
                update_run,
                user_id,
                run_id,
                base_canvas_version=current_version,
                metadata_json={"placement_recomputed": True},
            )
        else:
            await asyncio.to_thread(update_run, user_id, run_id, status="blocked", phase="planning")
            await emit_agent_event(
                user_id,
                run_id,
                "run.blocked",
                {
                    "reason": "canvas_structure_conflict",
                    "current_version": current_version,
                    "base_version": run["base_canvas_version"],
                },
            )
            raise HTTPException(
                status_code=409,
                detail={"message": "画布内容或连线已变化，请重新规划", "current_version": current_version},
            )
    from app.services.canvas_agent.events import current_operation_id
    from app.services.canvas_agent.store import command_cancel_requested

    operation_id = current_operation_id()
    if operation_id and await asyncio.to_thread(command_cancel_requested, operation_id):
        raise HTTPException(status_code=409, detail="操作已取消")
    try:
        plan = SemanticPlan.model_validate(plan_row["content_json"])
        plan_json = plan.model_dump(mode="json")
        estimate = estimate_plan_cost(plan_json, budget=(run_metadata.get("limits") or {}).get("max_budget"))
        enforce_budget(estimate)
        plan_json["execution"]["estimated_cost"] = estimate["estimated_cost"]
        plan = SemanticPlan.model_validate(plan_json)
        enforce_plan_limits(plan_json, run_metadata.get("limits"))
        if execution_patch:
            patch = CanvasPatch.model_validate(execution_patch)
            if patch.canvas_id != canvas_id:
                raise ValueError("确认计划的画布不匹配")
            # Preserve layout recomputation for moves without reloading model
            # parameter schemas or changing the admitted targets/settings.
            if patch.base_version != current_version and any(op.op == "add_node" for op in patch.operations):
                layout = await asyncio.to_thread(
                    semantic_plan_to_patch, plan, canvas_id, current_version, canvas, None,
                )
                placements = {op.client_ref: op.placement for op in layout.operations if op.op == "add_node"}
                for operation in patch.operations:
                    if operation.op == "add_node":
                        operation.placement = placements.get(operation.client_ref, operation.placement)
            patch = patch.model_copy(update={"base_version": current_version})
        else:
            # Commands accepted before execution snapshots were introduced.
            patch = await asyncio.to_thread(
                semantic_plan_to_patch, plan, canvas_id, current_version, canvas, capability_schema_resolver,
            )
        await asyncio.to_thread(update_run, user_id, run_id, status="applying", phase="applying")
        result = await asyncio.to_thread(
            apply_patch_idempotently,
            user_id,
            run_id,
            f"{run_id}:plan:{plan_version}",
            patch,
            risk="confirm",
            allow_user_node_changes=True,
            authorized_node_ids={str(node["id"]) for node in canvas.get("nodes", []) if node.get("id")},
        )
    except (PatchConflictError, PatchPermissionError, ValueError) as exc:
        AGENT_FAILURES.labels(stage="applying", category=classify_failure(exc)).inc()
        await asyncio.to_thread(update_run, user_id, run_id, status="blocked", phase="applying")
        await emit_agent_event(user_id, run_id, "run.blocked", {"reason": str(exc)[:500]})
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    requested_tasks = len(result.get("run_requests") or [])
    limit_tasks = int((run_metadata.get("limits") or {}).get("max_tasks", DEFAULT_RUN_LIMITS["max_tasks"]))
    if requested_tasks > limit_tasks:
        await asyncio.to_thread(
            update_run,
            user_id,
            run_id,
            status="blocked",
            phase="running",
            metadata_json={"blocked_reason": "task_quota_exceeded"},
        )
        await emit_agent_event(
            user_id,
            run_id,
            "run.blocked",
            {"reason": "task_quota_exceeded", "requested": requested_tasks, "limit": limit_tasks},
        )
        raise HTTPException(status_code=409, detail="Run 任务配额超限")
    return {**result, "plan_goal": plan.goal, "plan_version": plan_version, "task_limit": limit_tasks}


async def _dispatch_approved_canvas_tasks(
    user_id: str, run_id: str, canvas_id: str, execution_result: dict, *, model=None
) -> list[dict]:
    """Submit deferred generation tasks after the graph records patch success."""
    from app.services.canvas_agent.events import current_operation_id
    from app.services.canvas_agent.store import command_cancel_requested

    operation_id = current_operation_id()
    if operation_id and await asyncio.to_thread(command_cancel_requested, operation_id):
        raise HTTPException(status_code=409, detail="操作已取消")
    try:
        tasks = await submit_run_requests(
            user_id,
            canvas_id,
            run_id,
            execution_result.get("run_requests") or [],
            prompt=str(execution_result.get("plan_goal") or ""),
        )
    except Exception as exc:
        AGENT_FAILURES.labels(stage="task_submission", category=classify_failure(exc)).inc()
        await asyncio.to_thread(update_run, user_id, run_id, status="failed", phase="running")
        await emit_agent_event(user_id, run_id, "run.failed", {"error": str(exc)[:500], "stage": "task_submission"})
        raise HTTPException(status_code=502, detail="画布已更新，但生成任务提交失败") from exc
    await asyncio.to_thread(
        update_run,
        user_id,
        run_id,
        status="running" if tasks else "completed",
        phase="running" if tasks else "reviewing",
        metadata_json={"task_ids": [task["task_id"] for task in tasks]},
    )
    run = await _require_run(user_id, run_id)
    AGENT_RUNS.labels(mode=run.get("mode", "fast_track"), status="running" if tasks else "completed").inc()
    audit_event(
        "canvas_agent_plan_applied",
        action="apply_patch",
        resource_type="canvas_agent_run",
        resource_id=run_id,
        result="success",
        run_id=run_id,
        canvas_id=canvas_id,
        operation_id=f"{run_id}:plan:{execution_result.get('plan_version', '')}",
        request_id="",
    )
    await manager.broadcast_canvas_updated(canvas_id, now_ms(), "", user_id)
    await _emit_event_spec(
        user_id,
        run_id,
        patch_applied(
            {key: value for key, value in execution_result.items() if key not in {"plan_goal", "task_limit"}}
        ),
    )
    if tasks:
        await emit_agent_event(user_id, run_id, "tasks.queued", {"tasks": tasks})
    else:
        await emit_agent_event(user_id, run_id, "run.completed", {"version": execution_result["version"]})
    try:
        await _append_execution_reply(user_id, run_id, canvas_id, execution_result, tasks, model=model)
    except Exception:
        logger.exception(
            "canvas agent execution reply projection failed",
            extra={"event": "canvas_agent_execution_reply_projection_failed", "run_id": run_id},
        )
    return tasks


@router.post("/api/canvas-agent/runs")
async def create_agent_run(payload: CanvasAgentRunCreateRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id)
    limits = {**DEFAULT_RUN_LIMITS, **payload.limits, "max_steps": payload.max_steps}
    try:
        run = await asyncio.to_thread(
            create_run,
            user_id,
            payload.canvas_id,
            mode=payload.mode,
            conversation_id=payload.conversation_id,
            max_steps=payload.max_steps,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
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


@router.patch("/api/canvas-agent/runs/{run_id}")
async def rename_agent_run(run_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id)
    try:
        payload = await request.json()
        run = await asyncio.to_thread(rename_run, user_id, run_id, payload.get("title", ""))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not run:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"run": run}


@router.delete("/api/canvas-agent/runs/{run_id}")
async def delete_agent_run(run_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id)
    if not await asyncio.to_thread(delete_run, user_id, run_id):
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"deleted": True, "run_id": run_id}


@router.get("/api/canvas-agent/runs/{run_id}")
async def get_agent_run(run_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id)
    run = await _require_run(user_id, run_id)
    messages, plan, events, operations = await asyncio.gather(
        asyncio.to_thread(list_messages, user_id, run_id),
        asyncio.to_thread(latest_plan, user_id, run_id),
        asyncio.to_thread(list_events, user_id, run_id),
        asyncio.to_thread(list_operations, user_id, run_id),
    )
    task_ids = list((run.get("metadata_json") or {}).get("task_ids") or [])
    tasks = await asyncio.gather(*(get_canvas_task(task_id) for task_id in task_ids)) if task_ids else []
    return {
        "run": run,
        "messages": messages,
        "plan": plan,
        "events": events,
        "operations": operations,
        "tasks": [task for task in tasks if task],
    }


async def execute_message_command(user_id: str, run_id: str, payload: CanvasAgentMessageRequest):
    """Run one planning turn for a new user message and persist the resulting plan.

    Builds the canvas context, resolves the LLM model, invokes the LangGraph
    agent, and saves the produced ``SemanticPlan`` with status
    ``awaiting_confirmation``. If the graph returns no plan (e.g. a pure
    conversational reply), the assistant message is persisted directly and the
    function returns early without a plan. On upstream provider errors the run
    is marked ``failed`` and a 503 is raised so the caller can retry; all other
    exceptions yield 422.

    Args:
        user_id: Authenticated owner of the run.
        run_id: Target Canvas Agent run.
        payload: User message content plus optional model/connection overrides
            and node selection hints.

    Returns:
        A dict with ``run``, ``plan`` (when produced), and ``reply``.

    Raises:
        HTTPException 409: Run status does not allow further planning.
        HTTPException 503: Upstream LLM provider is unavailable (retryable).
        HTTPException 422: Planning failed for any other reason.
    """
    run = await _require_run(user_id, run_id)
    if not _can_continue_planning(run["status"]):
        raise HTTPException(status_code=409, detail="Run 当前状态不可继续规划")
    if run["status"] == "completed":
        # A new user request starts the next planning turn on the same
        # LangGraph thread. The completed status only describes the previous
        # patch execution, not the lifetime of the conversation.
        run = await asyncio.to_thread(update_run, user_id, run_id, status="planning", phase="planning") or run
    try:
        await _emit_event_spec(user_id, run_id, progress_event("context", "正在读取画布上下文…"))
        context = await asyncio.to_thread(
            build_canvas_context,
            user_id,
            run["canvas_id"],
            selected_node_ids=payload.selected_node_ids,
            mention_node_ids=payload.mention_node_ids,
            media_references=payload.media_references,
        )
        context["run_id"] = run_id
        context["user_id"] = user_id
        context["canvas_id"] = run["canvas_id"]
        model = await asyncio.to_thread(
            resolve_canvas_agent_model,
            model=payload.model,
            model_id=payload.model_id,
            connection_id=payload.connection_id,
        )

        async def progress(event_run_id: str, spec: EventSpec):
            await _emit_event_spec(user_id, event_run_id, spec)

        # Closures passed into the graph so it can mutate the canvas without
        # importing router symbols directly (avoids circular dependencies).
        async def execute_patch(plan_version: int, authorized_node_ids: list[str]) -> dict:
            return await _execute_approved_canvas_patch(
                user_id, run_id, run["canvas_id"], plan_version, authorized_node_ids
            )

        async def dispatch_tasks(execution_result: dict) -> list[dict]:
            return await _dispatch_approved_canvas_tasks(
                user_id, run_id, run["canvas_id"], execution_result, model=model
            )

        previous_plan = await asyncio.to_thread(latest_plan, user_id, run_id)
        async with create_async_checkpointer() as checkpointer:
            graph_result = await run_canvas_agent(
                model,
                payload.content,
                context,
                checkpointer=checkpointer,
                emit_progress=progress,
                execute_patch=execute_patch,
                dispatch_tasks=dispatch_tasks,
            )
        latest = await asyncio.to_thread(latest_plan, user_id, run_id)
        if not latest or (previous_plan and latest["version"] <= previous_plan["version"]):
            # The graph answered conversationally without producing a plan.
            messages = graph_result.get("messages") or []
            reply = (
                str(getattr(messages[-1], "content", "我可以帮助你处理画布内容。"))
                if messages
                else "我可以帮助你处理画布内容。"
            )
            await asyncio.to_thread(append_message, user_id, run_id, "assistant", reply, {"kind": "tool_agent_reply"})
            await emit_agent_event(user_id, run_id, "message.replied", {"reply": reply})
            await asyncio.to_thread(update_run, user_id, run_id, status="completed", phase="reviewing")
            return {"run": await asyncio.to_thread(get_run, user_id, run_id), "reply": reply}
        plan = SemanticPlan.model_validate(latest["content_json"])
        await asyncio.to_thread(
            update_run,
            user_id,
            run_id,
            metadata_json={
                "model_thread_started": True,
                "model_id": payload.model_id,
                "model_connection_id": payload.connection_id,
            },
        )
        plan_json = plan.model_dump(mode="json")
        # Attach live canvas node snapshots so the confirmation UI can render
        # titles and parameters for nodes that don't exist in the canvas yet.
        plan_json = _hydrate_plan_nodes(
            plan_json, await asyncio.to_thread(load_canvas_payload, user_id, run["canvas_id"])
        )
        estimate = estimate_plan_cost(plan_json)
        plan_json["execution"]["estimated_cost"] = estimate["estimated_cost"]
        plan = SemanticPlan.model_validate(plan_json)
        enforce_plan_limits(plan_json, (run.get("metadata_json") or {}).get("limits"))
        saved = await asyncio.to_thread(save_plan, user_id, run_id, plan_json, status="awaiting_confirmation")
        # Snapshot the canvas fingerprint so execute_confirm_command can detect
        # structural changes between planning and confirmation.
        await asyncio.to_thread(
            update_run,
            user_id,
            run_id,
            status="awaiting_confirmation",
            phase="planning",
            base_canvas_version=context["canvas_version"],
            step_count=int(run.get("step_count") or 0) + 1,
            metadata_json={
                "planned_canvas_fingerprint": canvas_structure_fingerprint(
                    await asyncio.to_thread(load_canvas_payload, user_id, run["canvas_id"])
                )
            },
        )
    except CanvasAgentUpstreamError as exc:
        logger.exception(
            "canvas agent planning provider unavailable",
            extra={
                "event": "canvas_agent_planning_provider_unavailable",
                "run_id": run_id,
                "canvas_id": run["canvas_id"],
                "phase": "message",
            },
        )
        AGENT_FAILURES.labels(stage="planning", category="transient").inc()
        await asyncio.to_thread(update_run, user_id, run_id, status="failed", phase="planning")
        await emit_agent_event(user_id, run_id, "run.failed", {"error": str(exc), "category": "transient"})
        raise HTTPException(status_code=503, detail=str(exc), headers={"Retry-After": "3"}) from exc
    except Exception as exc:
        logger.exception(
            "canvas agent planning failed",
            extra={
                "event": "canvas_agent_planning_failed",
                "run_id": run_id,
                "canvas_id": run["canvas_id"],
                "phase": "message",
            },
        )
        AGENT_FAILURES.labels(stage="planning", category=classify_failure(exc)).inc()
        await asyncio.to_thread(update_run, user_id, run_id, status="failed", phase="planning")
        await emit_agent_event(user_id, run_id, "run.failed", {"error": str(exc)[:500]})
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    reply = await _append_plan_reply(user_id, run_id)
    await emit_agent_event(
        user_id, run_id, "plan.created", {"plan_version": saved["version"], "plan": plan.model_dump(mode="json")}
    )
    return {"run": await asyncio.to_thread(get_run, user_id, run_id), "plan": saved, "reply": reply}


async def execute_answer_command(user_id: str, run_id: str, payload: CanvasAgentAnswerRequest):
    run = await _require_run(user_id, run_id)
    metadata = run.get("metadata_json") or {}
    try:
        await _emit_event_spec(user_id, run_id, progress_event("context", "正在恢复画布上下文…"))
        context = await asyncio.to_thread(build_canvas_context, user_id, run["canvas_id"])
        context["run_id"] = run_id
        context["user_id"] = user_id
        context["canvas_id"] = run["canvas_id"]
        model_name = payload.model
        model_id = payload.model_id or metadata.get("model_id", "")
        connection_id = payload.connection_id or metadata.get("model_connection_id", "")
        model = await asyncio.to_thread(
            resolve_canvas_agent_model, model=model_name, model_id=model_id, connection_id=connection_id
        )

        async def progress(event_run_id: str, spec: EventSpec):
            await _emit_event_spec(user_id, event_run_id, spec)

        async def execute_patch(plan_version: int, authorized_node_ids: list[str]) -> dict:
            return await _execute_approved_canvas_patch(
                user_id, run_id, run["canvas_id"], plan_version, authorized_node_ids
            )

        async def dispatch_tasks(execution_result: dict) -> list[dict]:
            return await _dispatch_approved_canvas_tasks(
                user_id, run_id, run["canvas_id"], execution_result, model=model
            )

        previous_plan = await asyncio.to_thread(latest_plan, user_id, run_id)
        async with create_async_checkpointer() as checkpointer:
            graph_result = await run_canvas_agent(
                model,
                payload.answer,
                context,
                checkpointer=checkpointer,
                emit_progress=progress,
                execute_patch=execute_patch,
                dispatch_tasks=dispatch_tasks,
            )
        latest = await asyncio.to_thread(latest_plan, user_id, run_id)
        if not latest or (previous_plan and latest["version"] <= previous_plan["version"]):
            messages = graph_result.get("messages") or []
            reply = str(getattr(messages[-1], "content", "请补充你希望对画布执行的操作。")) if messages else "请补充你希望对画布执行的操作。"
            await asyncio.to_thread(append_message, user_id, run_id, "assistant", reply, {"kind": "tool_agent_reply"})
            await emit_agent_event(user_id, run_id, "message.replied", {"reply": reply})
            await asyncio.to_thread(update_run, user_id, run_id, status="completed", phase="reviewing")
            return {"run": await asyncio.to_thread(get_run, user_id, run_id), "reply": reply}
        plan = SemanticPlan.model_validate(latest["content_json"])
        plan_json = _hydrate_plan_nodes(
            plan.model_dump(mode="json"), await asyncio.to_thread(load_canvas_payload, user_id, run["canvas_id"])
        )
        plan = SemanticPlan.model_validate(plan_json)
        saved = await asyncio.to_thread(
            save_plan, user_id, run_id, plan.model_dump(mode="json"), status="awaiting_confirmation"
        )
        await asyncio.to_thread(
            update_run,
            user_id,
            run_id,
            status="awaiting_confirmation",
            phase="planning",
            base_canvas_version=context["canvas_version"],
            metadata_json={
                "model_thread_started": True,
                "model_name": model_name,
                "model_id": model_id,
                "model_connection_id": connection_id,
            },
        )
        reply = await _append_plan_reply(user_id, run_id)
        await emit_agent_event(
            user_id,
            run_id,
            "plan.created",
            {"plan_version": saved["version"], "plan": plan.model_dump(mode="json"), "resumed": True},
        )
        return {"run": await asyncio.to_thread(get_run, user_id, run_id), "plan": saved, "reply": reply}
    except CanvasAgentUpstreamError as exc:
        logger.exception(
            "canvas agent planning provider unavailable",
            extra={
                "event": "canvas_agent_planning_provider_unavailable",
                "run_id": run_id,
                "canvas_id": run["canvas_id"],
                "phase": "answer",
            },
        )
        await asyncio.to_thread(update_run, user_id, run_id, status="failed", phase="planning")
        await emit_agent_event(user_id, run_id, "run.failed", {"error": str(exc), "category": "transient"})
        raise HTTPException(status_code=503, detail=str(exc), headers={"Retry-After": "3"}) from exc
    except Exception as exc:
        logger.exception(
            "canvas agent planning failed",
            extra={
                "event": "canvas_agent_planning_failed",
                "run_id": run_id,
                "canvas_id": run["canvas_id"],
                "phase": "answer",
            },
        )
        await asyncio.to_thread(update_run, user_id, run_id, status="failed", phase="planning")
        await emit_agent_event(user_id, run_id, "run.failed", {"error": str(exc)[:500]})
        raise HTTPException(status_code=422, detail=str(exc)) from exc


async def execute_confirm_command(user_id: str, run_id: str, payload: CanvasAgentConfirmRequest):
    run = await _require_run(user_id, run_id)
    plan_row = await asyncio.to_thread(latest_plan, user_id, run_id)
    if not plan_row or int(plan_row["version"]) != payload.plan_version:
        raise HTTPException(status_code=409, detail="计划版本已过期")
    if run["status"] != "awaiting_confirmation":
        raise HTTPException(status_code=409, detail="Run 不在等待确认状态")
    if not payload.approved:
        # A rejected plan ends only the interrupted planning turn. Resume the
        # graph so its confirmation interrupt is consumed before accepting the
        # next user message on this Run.
        async with create_async_checkpointer() as checkpointer:
            from app.services.canvas_agent.runtime import create_canvas_agent

            graph = create_canvas_agent(
                model=None, user_id=user_id, run_id=run_id, canvas_id=run["canvas_id"], checkpointer=checkpointer
            )
            await graph.ainvoke(Command(resume={"approved": False}), config={"configurable": {"thread_id": run_id}})
        await asyncio.to_thread(update_run, user_id, run_id, status="planning", phase="planning")
        await asyncio.to_thread(set_plan_status, user_id, run_id, payload.plan_version, "rejected")
        return {"run": await asyncio.to_thread(get_run, user_id, run_id), "approved": False}
    await _apply_confirmation_overrides(user_id, run_id, plan_row, payload.node_overrides)
    # Resume the same graph thread. The graph deterministically emits the
    # execution tool call, records its ToolMessage, then dispatches tasks.
    metadata = run.get("metadata_json") or {}
    model_name = ""
    model = await asyncio.to_thread(
        resolve_canvas_agent_model,
        model=model_name,
        model_id=payload.model_id or metadata.get("model_id", ""),
        connection_id=payload.connection_id or metadata.get("model_connection_id", ""),
    )
    await _emit_event_spec(user_id, run_id, progress_event("context", "正在校验当前画布…"))
    context = await asyncio.to_thread(build_canvas_context, user_id, run["canvas_id"])
    context.update({"run_id": run_id, "user_id": user_id, "canvas_id": run["canvas_id"]})

    async def progress(event_run_id: str, spec: EventSpec):
        await _emit_event_spec(user_id, event_run_id, spec)

    async def execute_patch(plan_version: int, authorized_node_ids: list[str]) -> dict:
        return await _execute_approved_canvas_patch(
            user_id, run_id, run["canvas_id"], plan_version, authorized_node_ids,
            execution_patch=payload.execution_patch, canvas_fingerprint=payload.canvas_fingerprint,
        )

    async def dispatch_tasks(execution_result: dict) -> list[dict]:
        return await _dispatch_approved_canvas_tasks(user_id, run_id, run["canvas_id"], execution_result, model=model)

    async with create_async_checkpointer() as checkpointer:
        from app.services.canvas_agent.runtime import create_canvas_agent

        graph = create_canvas_agent(
            model=model,
            user_id=user_id,
            run_id=run_id,
            canvas_id=run["canvas_id"],
            checkpointer=checkpointer,
            emit_progress=progress,
            execute_patch=execute_patch,
            dispatch_tasks=dispatch_tasks,
        )
        graph_result = await graph.ainvoke(
            Command(
                resume={
                    "approved": True,
                    "plan_version": payload.plan_version,
                    "authorized_node_ids": payload.authorized_node_ids,
                }
            ),
            config={"configurable": {"thread_id": run_id}},
        )
    await asyncio.to_thread(set_plan_status, user_id, run_id, payload.plan_version, "confirmed")
    return {
        "run": await asyncio.to_thread(get_run, user_id, run_id),
        "result": graph_result.get("execution_result") or {},
        "tasks": graph_result.get("tasks") or [],
    }


async def _authorize_agent_chat(user_id: str, payload: dict, run: dict) -> None:
    """Pin and authorize the chat target before accepting a durable command."""
    from app.ai.authorization import require_model_access
    from app.ai.database_repository import DatabaseAIRepository

    metadata = run.get("metadata_json") or {}
    try:
        target = await asyncio.to_thread(
            DatabaseAIRepository().resolve_model,
            model_id=payload.get("model_id") or metadata.get("model_id", ""),
            connection_id=payload.get("connection_id") or metadata.get("model_connection_id", ""),
            model=payload.get("model", ""), kind="chat",
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Agent 聊天模型不存在或已禁用") from exc
    await asyncio.to_thread(require_model_access, target, user_id)
    payload.update(model_id=target.model.id, connection_id=target.connection.id)


async def _authorize_agent_plan(user_id: str, run: dict, plan_row: dict, overrides: list[dict]) -> dict:
    """Authorize generation targets in the effective plan, including user edits."""
    from copy import deepcopy

    from app.ai.authorization import require_model_access
    from app.ai.database_repository import DatabaseAIRepository

    canvas = await asyncio.to_thread(load_canvas_payload, user_id, run["canvas_id"])
    if not canvas:
        raise HTTPException(status_code=404, detail="画布不存在")
    plan = await _confirmed_plan(plan_row, overrides)
    patch = await asyncio.to_thread(
        semantic_plan_to_patch, plan, run["canvas_id"], int(canvas.get("version") or 1),
        canvas, capability_schema_resolver,
    )
    # Mirror the executor's node updates without writing the canvas. run_node
    # requests execute after the entire patch, so authorize their final targets.
    nodes = {str(node["id"]): deepcopy(node) for node in canvas.get("nodes", [])}
    run_ids = []
    for operation in patch.operations:
        if operation.op == "add_node":
            nodes[operation.client_ref] = deepcopy(operation.node)
        elif operation.op == "update_node_params" and operation.node_id in nodes:
            nodes[operation.node_id].update(deepcopy(operation.params))
        elif operation.op == "run_node":
            run_ids.append(operation.node_id)
        elif operation.op == "run_group":
            raise HTTPException(status_code=422, detail="暂不支持执行节点组，请指定生图节点")
    resolved_targets = {}
    pinned_updates = []
    for node_id in dict.fromkeys(run_ids):
        node = nodes.get(node_id)
        if not node:
            raise HTTPException(status_code=422, detail="指定的画布节点不存在")
        settings = node.get("runSettings") or {}
        model_id = str(settings.get("model_id") or node.get("model_id") or "")
        connection_id = str(settings.get("connection_id") or node.get("connection_id") or "")
        if settings.get("resource_id") or node.get("resource_id") or settings.get("engine") == "runninghub":
            continue  # Executable resources have no model ACL.
        kind = "video" if (settings.get("apiKind") or node.get("genKind")) == "video" else "image"
        key = (model_id, connection_id, str(settings.get("model") or node.get("model") or ""), kind)
        target = resolved_targets.get(key)
        if target is None:
            try:
                target = await asyncio.to_thread(
                    DatabaseAIRepository().resolve_model, model_id=model_id, connection_id=connection_id,
                    model=key[2], kind=kind,
                )
            except LookupError as exc:
                raise HTTPException(status_code=404, detail="生图节点的模型不存在或已禁用") from exc
            await asyncio.to_thread(require_model_access, target, user_id)
            resolved_targets[key] = target
        # The worker must execute this model, even when admission selected a
        # connection's default model or its parameter schema changes later.
        pinned_updates.append({"op": "update_node_params", "node_id": node_id, "params": {
            "runSettings": {**settings, "model_id": target.model.id, "connection_id": target.connection.id},
        }})
    snapshot = patch.model_dump(mode="json")
    snapshot["operations"].extend(pinned_updates)
    return {"execution_patch": snapshot, "canvas_fingerprint": canvas_structure_fingerprint(canvas)}


async def _accept_command(user_id: str, run_id: str, operation_type: str, payload: dict) -> JSONResponse:
    try:
        operation, created = await asyncio.to_thread(
            submit_command, user_id, run_id, operation_type, str(payload.get("client_request_id") or ""), payload
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if created:
        await emit_agent_event(
            user_id,
            run_id,
            "operation.accepted",
            {"message": "请求已受理，等待 Agent Worker 执行", "command_type": operation_type},
            operation_id=operation["id"],
            phase="confirmation" if operation_type == "agent.confirm" else "planning",
        )
    events = await asyncio.to_thread(list_events, user_id, run_id)
    return JSONResponse(
        status_code=202,
        content={
            "run_id": run_id,
            "operation_id": operation["id"],
            "status": operation["status"],
            "events_after_sequence": max((int(event["sequence"]) for event in events), default=0),
        },
    )


@router.post("/api/canvas-agent/runs/{run_id}/messages")
async def post_agent_message(
    run_id: str, payload: CanvasAgentMessageRequest, request: Request, x_user_id: str = Header(default="")
):
    user_id = _user(request, x_user_id)
    run = await _require_run(user_id, run_id)
    if not _can_continue_planning(run["status"]):
        raise HTTPException(status_code=409, detail="Run 当前状态不可继续规划")
    body = payload.model_dump()
    await _authorize_agent_chat(user_id, body, run)
    return await _accept_command(user_id, run_id, "agent.message", body)


@router.post("/api/canvas-agent/runs/{run_id}/answers")
async def answer_agent_question(
    run_id: str, payload: CanvasAgentAnswerRequest, request: Request, x_user_id: str = Header(default="")
):
    user_id = _user(request, x_user_id)
    run = await _require_run(user_id, run_id)
    body = payload.model_dump()
    await _authorize_agent_chat(user_id, body, run)
    return await _accept_command(user_id, run_id, "agent.answer", body)


@router.post("/api/canvas-agent/runs/{run_id}/confirm")
async def confirm_agent_plan(
    run_id: str, payload: CanvasAgentConfirmRequest, request: Request, x_user_id: str = Header(default="")
):
    user_id = _user(request, x_user_id)
    run = await _require_run(user_id, run_id)
    plan = await asyncio.to_thread(latest_plan, user_id, run_id)
    if not plan or int(plan["version"]) != payload.plan_version:
        raise HTTPException(status_code=409, detail="计划版本已过期")
    if run["status"] != "awaiting_confirmation":
        raise HTTPException(status_code=409, detail="Run 不在等待确认状态")
    body = payload.model_dump()
    if payload.approved:
        await _authorize_agent_chat(user_id, body, run)
        body.update(await _authorize_agent_plan(user_id, run, plan, payload.node_overrides))
    return await _accept_command(user_id, run_id, "agent.confirm", body)


@router.post("/api/canvas-agent/runs/{run_id}/cancel")
async def cancel_agent_run(run_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id)
    run = await _require_run(user_id, run_id)
    if run["status"] in {"completed", "cancelled"}:
        return {"run": run}
    operations = await asyncio.to_thread(request_run_command_cancellation, user_id, run_id)
    for operation in operations:
        await emit_agent_event(
            user_id,
            run_id,
            "operation.cancel_requested",
            {"message": "已请求取消 Agent 命令"},
            operation_id=operation["id"],
            phase="cancelling",
        )
    task_ids = list((run.get("metadata_json") or {}).get("task_ids") or [])
    for task_id in task_ids:
        task = await get_canvas_task(task_id)
        if task and task.get("status") in {"queued", "running"}:
            await update_canvas_task(
                task_id,
                expected_status=task["status"],
                status="cancelled",
                cancellation_requested=True,
                error="Run 已取消",
            )
            await release_canvas_task_dispatch(task_id)
    await asyncio.to_thread(update_run, user_id, run_id, status="cancelled", phase="cancelling")
    await emit_agent_event(user_id, run_id, "run.cancelled", {})
    return {"run": await asyncio.to_thread(get_run, user_id, run_id)}


@router.post("/api/canvas-agent/runs/{run_id}/tasks/{task_id}/retry")
async def retry_agent_task(run_id: str, task_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = _user(request, x_user_id)
    await _require_run(user_id, run_id)
    task = await get_canvas_task(task_id)
    if not task or task.get("owner_id") != user_id or task.get("agent_run_id") != run_id:
        raise HTTPException(status_code=404, detail="Agent 任务不存在")
    if task.get("status") not in {"failed", "interrupted", "timed_out"}:
        raise HTTPException(status_code=409, detail="只有失败任务可以重试")
    if not any(
        str(task.get(key) or (task.get("request") or {}).get(key) or "").strip()
        for key in ("connection_id", "model_id", "resource_id")
    ):
        raise HTTPException(status_code=409, detail="任务缺少已迁移的 connection_id/model_id/resource_id，无法重试")
    if task.get("type") in {"online-image", "online-video"}:
        from app.ai.authorization import require_model_access
        from app.ai.database_repository import DatabaseAIRepository

        snapshot = task.get("request") or {}
        retry_model_id = str(task.get("model_id") or snapshot.get("model_id") or "").strip()
        retry_model = str(task.get("model") or snapshot.get("model") or "").strip()
        if not (retry_model_id or retry_model):
            # With neither a pinned id nor an upstream name, resolve_model would take the connection's first
            # model of this kind, so the permission check could target a model the task never used.
            raise HTTPException(status_code=409, detail="任务缺少 model_id，无法确认模型权限，请重新提交任务")
        try:
            target = await asyncio.to_thread(
                DatabaseAIRepository().resolve_model,
                model_id=retry_model_id,
                connection_id=task.get("connection_id") or snapshot.get("connection_id", ""),
                model=retry_model,
                kind="video" if task["type"] == "online-video" else "image",
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail="任务模型不存在或已禁用") from exc
        await asyncio.to_thread(require_model_access, target, user_id)
    await release_canvas_task_dispatch(task_id)
    queued = await update_canvas_task(
        task_id,
        expected_status=task.get("status") or "failed",
        status="queued",
        error="",
        attempt=int(task.get("attempt", 1) or 1) + 1,
        deadline_at=time.time() + CANVAS_TASK_TIMEOUT_SECONDS,
    )
    if not queued:
        raise HTTPException(status_code=409, detail="任务状态已变化")
    await enqueue_canvas_task(task_id)
    retry_event = task_lifecycle(
        "retrying",
        {
            "task_id": task_id,
            "node_id": task.get("agent_node_id"),
            "status": "retrying",
        },
    )
    await _emit_event_spec(user_id, run_id, retry_event)
    return {"task": queued}


@router.get("/api/canvas-agent/runs/{run_id}/events")
async def get_agent_events(
    run_id: str, request: Request, after_sequence: int = 0, limit: int = 500, x_user_id: str = Header(default="")
):
    user_id = _user(request, x_user_id)
    await _require_run(user_id, run_id)
    events = await asyncio.to_thread(list_events, user_id, run_id, after_sequence=after_sequence, limit=limit)
    return {
        "events": events,
        "after_sequence": after_sequence,
        "next_sequence": int(events[-1]["sequence"]) if events else int(after_sequence),
        "has_more": len(events) >= min(max(1, limit), 2000),
    }
