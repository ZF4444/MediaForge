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
import re
import os

from fastapi import APIRouter, HTTPException

from app.models import WorkflowConfig, WorkflowUploadRequest
from app.services.business_metadata import (
    delete_comfy_workflow,
    get_comfy_workflow,
    json_value,
    list_comfy_workflows,
    metadata_connection,
    save_comfy_workflow_config,
)
from app.core.utils import now_ms

router = APIRouter()

CUSTOM_WORKFLOW_FOLDER = "custom"
LEGACY_CUSTOM_WORKFLOW_FOLDER = "自定义"
WORKFLOW_NAME_RE = re.compile(rf"^(?:(?:{CUSTOM_WORKFLOW_FOLDER}|{LEGACY_CUSTOM_WORKFLOW_FOLDER})/)?[a-zA-Z0-9_一-龥\.\-]+\.json$")


@router.get("/api/workflows")
def list_workflows():
    return {"workflows": list_comfy_workflows()}


@router.get("/api/workflows/{name:path}")
def get_workflow(name: str):
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid workflow name")
    data = get_comfy_workflow(name)
    if not data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return data


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
    stored_name = f"{CUSTOM_WORKFLOW_FOLDER}/{name}"
    with metadata_connection() as conn, conn.cursor() as cur:
        cur.execute("""INSERT INTO comfy_workflows(name,workflow_json,config_json,created_at,updated_at)
            VALUES(%s,%s,%s,%s,%s) ON CONFLICT(name) DO UPDATE SET workflow_json=EXCLUDED.workflow_json,updated_at=EXCLUDED.updated_at""", (stored_name, json_value(payload.workflow), json_value({'title': name.replace('.json',''), 'fields': [], 'media': 'image'}), now_ms(), now_ms()))
    return {"name": stored_name}


@router.put("/api/workflows/{name:path}/config")
def save_workflow_config(name: str, payload: WorkflowConfig):
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid workflow name")
    if not get_comfy_workflow(name):
        raise HTTPException(status_code=404, detail="Workflow not found")
    config = save_comfy_workflow_config(name, payload.dict())
    return {"config": config}


@router.delete("/api/workflows/{name:path}")
def delete_workflow(name: str):
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid workflow name")
    if not get_comfy_workflow(name):
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not delete_comfy_workflow(name):
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {"ok": True}
