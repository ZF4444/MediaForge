"""按用户区分的访问控制（侧边栏页面 + 无限画布节点）。

- 管理员：用户名（清洗后的 user_id）等于 ADMIN_USER_ID（默认 "admin"）。
- 配置文件：data/access_control.json，结构：
    {
      "users": {
        "<user_id>": {"pages": ["zimage", ...], "nodes": ["image", ...]}
      }
    }
- 语义：
    * admin 始终拥有全部页面与节点权限，且不可被配置裁剪。
    * 未在配置中出现的用户，默认拥有全部页面与节点（向后兼容）。
    * 出现在配置中的用户，仅拥有其 pages/nodes 列表中列出的项。
    * 校验/保存时会过滤掉不在全集清单中的非法 id。

依赖：app.config（DATA_DIR），app.core.auth（current_user_id, USERS 注册表）。
本模块不引用 FastAPI app 对象，避免循环导入。
"""
import json
import os
from threading import Lock
from typing import Any, Dict, List

from app.config import DATA_DIR

# 管理员用户 id（用户名经 clean_user_id 清洗后的值）。
ADMIN_USER_ID = "admin"

ACCESS_CONTROL_FILE = os.path.join(DATA_DIR, "access_control.json")
ACCESS_CONTROL_LOCK = Lock()

# --- 全集清单：必须与前端保持一致 ---
# 侧边栏可访问页面（与 static/index.html 的 PAGE_IDS 对应）。
# access-control 自身不在此清单内：它仅对 admin 可见，不参与按用户裁剪。
ALL_PAGES: List[Dict[str, str]] = [
    {"id": "zimage", "label": "文生图"},
    {"id": "enhance", "label": "细节增强"},
    {"id": "klein", "label": "图片编辑"},
    {"id": "angle", "label": "视角粗调"},
    {"id": "gaussian", "label": "视角微调"},
    {"id": "pose-studio", "label": "姿势编辑"},
    {"id": "online", "label": "在线生图"},
    {"id": "gpt-chat", "label": "GPT 对话"},
    {"id": "canvas", "label": "无限画布"},
    {"id": "asset-manager", "label": "素材库"},
    {"id": "api-settings", "label": "API 设置"},
    {"id": "comfyui-settings", "label": "工作流设置"},
]

# 无限画布可用节点（与 static/canvas.html 工具栏按钮对应）。
ALL_NODES: List[Dict[str, str]] = [
    {"id": "image", "label": "图片"},
    {"id": "prompt", "label": "提示词"},
    {"id": "loop", "label": "循环"},
    {"id": "llm", "label": "LLM"},
    {"id": "generator", "label": "AI生成"},
    {"id": "msgen", "label": "MS生成"},
    {"id": "video", "label": "视频生成"},
    {"id": "rh", "label": "RH生成"},
    {"id": "comfy", "label": "ComfyUI"},
    {"id": "ltx", "label": "LTX Director"},
    {"id": "output", "label": "Output"},
    {"id": "group", "label": "分组"},
]

ALL_PAGE_IDS = [p["id"] for p in ALL_PAGES]
ALL_NODE_IDS = [n["id"] for n in ALL_NODES]


def is_admin(user_id: str) -> bool:
    """是否为管理员用户。"""
    return (user_id or "") == ADMIN_USER_ID


def _load_config_unlocked() -> Dict[str, Any]:
    if os.path.exists(ACCESS_CONTROL_FILE):
        try:
            with open(ACCESS_CONTROL_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and isinstance(data.get("users"), dict):
                if "default" not in data or not isinstance(data.get("default"), dict):
                    data["default"] = None
                return data
        except Exception:
            pass
    return {"default": None, "users": {}}


def load_config() -> Dict[str, Any]:
    """读取整份访问控制配置。"""
    with ACCESS_CONTROL_LOCK:
        return _load_config_unlocked()


def _sanitize_user_entry(entry: Any) -> Dict[str, List[str]]:
    """把单个用户配置规范化为 {pages, nodes}，过滤非法 id 并去重保序。"""
    entry = entry if isinstance(entry, dict) else {}
    raw_pages = entry.get("pages")
    raw_nodes = entry.get("nodes")
    # None 表示"全部"（未限制），保存为完整全集；列表表示显式集合。
    pages = ALL_PAGE_IDS if raw_pages is None else [p for p in ALL_PAGE_IDS if p in set(raw_pages)]
    nodes = ALL_NODE_IDS if raw_nodes is None else [n for n in ALL_NODE_IDS if n in set(raw_nodes)]
    return {"pages": pages, "nodes": nodes}


def save_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    """规范化并持久化访问控制配置，返回保存后的配置。

    payload 形如 {"default": {pages,nodes} | None, "users": {uid: {pages,nodes}}}。
    - default 缺省（键不存在）时保留磁盘上已有的 default，避免被误清空。
    - default 显式传 None 表示「不设默认，新用户全开」。
    """
    payload = payload if isinstance(payload, dict) else {}
    users_in = payload.get("users")
    users_in = users_in if isinstance(users_in, dict) else {}
    sanitized: Dict[str, Any] = {"default": None, "users": {}}

    # default：未传该键则沿用磁盘已有值；传 dict 则规范化；传 None 则清空。
    if "default" in payload:
        default_in = payload.get("default")
        sanitized["default"] = _sanitize_user_entry(default_in) if isinstance(default_in, dict) else None
    else:
        existing = _load_config_unlocked().get("default")
        sanitized["default"] = existing if isinstance(existing, dict) else None

    for uid, entry in users_in.items():
        if not uid or uid == ADMIN_USER_ID:
            # admin 不可被裁剪，忽略针对 admin 的配置。
            continue
        sanitized["users"][uid] = _sanitize_user_entry(entry)
    with ACCESS_CONTROL_LOCK:
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            tmp = ACCESS_CONTROL_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(sanitized, f, ensure_ascii=False, indent=2)
            os.replace(tmp, ACCESS_CONTROL_FILE)
        except Exception as e:
            print(f"[access_control] persist failed: {e}")
    return sanitized


def effective_permissions(user_id: str) -> Dict[str, Any]:
    """计算指定用户的有效权限。

    优先级：admin（全权）> 用户独立配置 > 默认配置(default) > 全集（全开）。
    返回：{is_admin, pages: [...], nodes: [...]}。
    """
    if is_admin(user_id):
        return {"is_admin": True, "pages": list(ALL_PAGE_IDS), "nodes": list(ALL_NODE_IDS)}
    config = load_config()
    entry = config.get("users", {}).get(user_id)
    if entry is None:
        # 无独立配置：回退到默认配置；默认未设置则全开。
        default = config.get("default")
        if isinstance(default, dict):
            sd = _sanitize_user_entry(default)
            return {"is_admin": False, "pages": sd["pages"], "nodes": sd["nodes"]}
        return {"is_admin": False, "pages": list(ALL_PAGE_IDS), "nodes": list(ALL_NODE_IDS)}
    sanitized = _sanitize_user_entry(entry)
    return {"is_admin": False, "pages": sanitized["pages"], "nodes": sanitized["nodes"]}
