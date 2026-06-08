"""ComfyUI 工作流管理路由（/api/workflows）。

从 main.py 的「ComfyUI 工作流管理」区块原样迁移。URL/模型/状态码完全一致。
注意：
- /api/comfyui/instances GET/PUT 依赖运行期可变全局 COMFYUI_INSTANCES/COMFYUI_ADDRESS/
  BACKEND_LOCAL_LOAD 与 update_env_values，暂留 main.py。
- /api/workflows/{name}/run 调用 generate()（生成域，仍在 main.py），暂留 main.py。

依赖：
- app.config：WORKFLOW_DIR
- app.models：WorkflowUploadRequest / WorkflowConfig
"""
import json
import os
import re

from fastapi import APIRouter, HTTPException

from app.config import WORKFLOW_DIR
from app.models import WorkflowConfig, WorkflowUploadRequest

router = APIRouter()

BUILTIN_WORKFLOWS = {"Z-Image.json", "Z-Image-Enhance.json", "2511.json", "klein-enhance.json", "Flux2-Klein.json", "upscale.json"}
CUSTOM_WORKFLOW_FOLDER = "custom"
LEGACY_CUSTOM_WORKFLOW_FOLDER = "自定义"
WORKFLOW_NAME_RE = re.compile(rf"^(?:(?:{CUSTOM_WORKFLOW_FOLDER}|{LEGACY_CUSTOM_WORKFLOW_FOLDER})/)?[a-zA-Z0-9_一-龥\.\-]+\.json$")


def workflow_path_from_name(name: str) -> str:
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid workflow name")
    path = os.path.abspath(os.path.join(WORKFLOW_DIR, *name.split("/")))
    workflow_root = os.path.abspath(WORKFLOW_DIR)
    if os.path.commonpath([workflow_root, path]) != workflow_root:
        raise HTTPException(status_code=400, detail="Invalid workflow name")
    return path


def workflow_config_path(name: str) -> str:
    return workflow_path_from_name(name).replace(".json", ".config.json")


def is_builtin_workflow(name: str) -> bool:
    return "/" not in name and os.path.basename(name) in BUILTIN_WORKFLOWS


@router.get("/api/workflows")
def list_workflows():
    if not os.path.isdir(WORKFLOW_DIR):
        return {"workflows": []}
    items = []
    for root, dirs, files in os.walk(WORKFLOW_DIR):
        if os.path.abspath(root) == os.path.abspath(WORKFLOW_DIR):
            dirs[:] = [d for d in dirs if d in {CUSTOM_WORKFLOW_FOLDER, LEGACY_CUSTOM_WORKFLOW_FOLDER}]
        for fn in sorted(files):
            if not fn.endswith(".json") or fn.endswith(".config.json"):
                continue
            rel = os.path.relpath(os.path.join(root, fn), WORKFLOW_DIR).replace("\\", "/")
            if is_builtin_workflow(rel):
                continue
            cfg = {}
            cfg_path = workflow_config_path(rel)
            if os.path.exists(cfg_path):
                try:
                    with open(cfg_path, "r", encoding="utf-8") as f:
                        cfg = json.load(f) or {}
                except Exception:
                    cfg = {}
            items.append({
                "name": rel,
                "title": cfg.get("title") or fn.replace(".json", ""),
                "builtin": False,
                "field_count": len(cfg.get("fields") or []),
            })
    items.sort(key=lambda item: (0 if item["name"].startswith(f"{CUSTOM_WORKFLOW_FOLDER}/") else 1, item["title"]))
    return {"workflows": items}


@router.get("/api/workflows/{name:path}")
def get_workflow(name: str):
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid workflow name")
    workflow_path = workflow_path_from_name(name)
    if not os.path.exists(workflow_path):
        raise HTTPException(status_code=404, detail="Workflow not found")
    with open(workflow_path, "r", encoding="utf-8") as f:
        workflow = json.load(f)
    cfg = {"title": name.replace(".json", ""), "fields": []}
    cfg_path = workflow_config_path(name)
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f) or cfg
        except Exception:
            pass
    return {"name": name, "workflow": workflow, "config": cfg, "builtin": is_builtin_workflow(name)}


@router.post("/api/workflows")
def upload_workflow(payload: WorkflowUploadRequest):
    name = os.path.basename(payload.name.strip())
    if not name.endswith(".json"):
        name = name + ".json"
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="工作流名称不合法，请使用中文/英文/数字/_-.")
    if not isinstance(payload.workflow, dict) or not payload.workflow:
        raise HTTPException(status_code=400, detail="工作流 JSON 为空")
    # 简单校验：是 API 格式（节点 id 为 key，含 class_type）
    sample = next(iter(payload.workflow.values()), None)
    if not isinstance(sample, dict) or "class_type" not in sample:
        raise HTTPException(status_code=400, detail="不是有效的 ComfyUI API 工作流 JSON（需包含 class_type）")
    custom_dir = os.path.join(WORKFLOW_DIR, CUSTOM_WORKFLOW_FOLDER)
    os.makedirs(custom_dir, exist_ok=True)
    stored_name = f"{CUSTOM_WORKFLOW_FOLDER}/{name}"
    path = workflow_path_from_name(stored_name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload.workflow, f, ensure_ascii=False, indent=2)
    return {"name": stored_name}


@router.put("/api/workflows/{name:path}/config")
def save_workflow_config(name: str, payload: WorkflowConfig):
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid workflow name")
    workflow_path = workflow_path_from_name(name)
    if not os.path.exists(workflow_path):
        raise HTTPException(status_code=404, detail="Workflow not found")
    cfg_path = workflow_config_path(name)
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(payload.dict(), f, ensure_ascii=False, indent=2)
    return {"config": payload.dict()}


@router.delete("/api/workflows/{name:path}")
def delete_workflow(name: str):
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid workflow name")
    if is_builtin_workflow(name):
        raise HTTPException(status_code=400, detail="内置工作流不可删除")
    workflow_path = workflow_path_from_name(name)
    cfg_path = workflow_config_path(name)
    if not os.path.exists(workflow_path):
        raise HTTPException(status_code=404, detail="Workflow not found")
    os.remove(workflow_path)
    if os.path.exists(cfg_path):
        os.remove(cfg_path)
    return {"ok": True}
