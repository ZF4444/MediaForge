"""按用户区分的访问控制（侧边栏页面 + 无限画布节点）。

- 管理员：用户名（清洗后的 user_id）等于 ADMIN_USER_ID（默认 "admin"）。
- PostgreSQL `app_settings.access_control`，结构：
    {
      "users": {
        "<user_id>": {"pages": ["canvas", ...], "nodes": ["comfly::gpt-image-1", ...]}
      }
    }
- 语义：
    * admin 始终拥有全部页面与节点权限，且不可被配置裁剪。
    * 未在配置中出现的用户，默认拥有全部页面与节点（向后兼容）。
    * 出现在配置中的用户，仅拥有其 pages/nodes 列表中列出的项。
    * 校验/保存时会过滤掉不在全集清单中的非法 id。
    * "节点"（nodes）特指智能画布「AI生成」引擎（engine=api）下可选的具体模型，
      id 格式为 "<provider_id>::<model>"，随 API 设置里的 provider/模型配置动态变化。

依赖：PostgreSQL app_settings 与用户注册表。
本模块不引用 FastAPI app 对象，避免循环导入。
"""
import os
import re
from threading import Lock
from typing import Any, Dict, List

from app.config import STATIC_DIR
from app.services.business_metadata import get_app_setting, set_app_setting

# 管理员用户 id（用户名经 clean_user_id 清洗后的值）。
ADMIN_USER_ID = "admin"

ACCESS_CONTROL_LOCK = Lock()

# 侧边栏首页文件（唯一真实来源）：页面清单从这里动态解析，避免与本文件的硬编码列表脱节。
STUDIO_INDEX_HTML_FILE = os.path.join(STATIC_DIR, "index.html")

# 导航项开标签之后、下一个同级闭合前，最近的可见文案 span（data-i18n 缺省时取其内文本兜底）。
_LABEL_SPAN_RE = re.compile(
    r'<span[^>]*class="(?:nav-text|side-pill-text)"[^>]*>(?P<text>.*?)</span>',
    re.DOTALL,
)

# 解析失败（文件缺失/格式变化导致 0 结果）时的兜底清单，避免访问控制页面完全瘫痪。
_FALLBACK_ALL_PAGES: List[Dict[str, str]] = [
    {"id": "angle", "label": "视角粗调"},
    {"id": "gaussian", "label": "视角微调"},
    {"id": "pose-studio", "label": "姿势编辑"},
    {"id": "gpt-chat", "label": "GPT 对话"},
    {"id": "canvas", "label": "无限画布"},
    {"id": "asset-manager", "label": "素材库"},
    {"id": "api-settings", "label": "API 设置"},
    {"id": "comfyui-settings", "label": "工作流设置"},
]


def _extract_nav_items(html: str) -> List[Dict[str, str]]:
    """从 index.html 源码中提取全部 switchUI(this, 'id') 导航入口及其可见文案。

    仅保留侧边栏可见入口；带 id="nav-xxx" 前缀的入口视为管理员专属（access-control/
    feedback-admin/broadcast-admin 等，默认 style="display:none"，由前端按 admin 身份显示），
    不参与按用户裁剪，因此排除在外。
    """
    items: List[Dict[str, str]] = []
    seen = set()
    matches = list(re.finditer(r'<[^>]*onclick="switchUI\(this,\s*\'([a-zA-Z0-9-]+)\'\)"[^>]*>', html))
    for idx, m in enumerate(matches):
        tag = m.group(0)
        page_id = m.group(1)
        if page_id in seen:
            continue
        # 管理员专属入口（id="nav-xxx"）不纳入按用户裁剪的全集清单。
        if re.search(r'\bid="nav-[a-zA-Z0-9-]+"', tag):
            continue
        # 在该导航项标签之后、下一个导航项标签开始之前的区间内查找可见文案 span，
        # 取其内文本作为 label（不依赖固定字符数，避免图标标记变化导致窗口不够）。
        end = matches[idx + 1].start() if idx + 1 < len(matches) else min(len(html), m.end() + 4000)
        tail = html[m.end():end]
        label_match = _LABEL_SPAN_RE.search(tail)
        label = re.sub(r'<[^>]*>', '', label_match.group("text")).strip() if label_match else page_id
        seen.add(page_id)
        items.append({"id": page_id, "label": label or page_id})
    return items


def _load_all_pages() -> List[Dict[str, str]]:
    """动态解析 static/index.html，得到当前侧边栏实际存在的页面清单。

    这样新增/删除页面时只需改 index.html 的导航项，访问控制的全集清单会自动同步，
    不再需要手动维护第二份硬编码列表。解析失败或结果为空时回退到静态兜底清单。
    """
    try:
        with open(STUDIO_INDEX_HTML_FILE, "r", encoding="utf-8") as f:
            html = f.read()
        items = _extract_nav_items(html)
        if items:
            return items
    except Exception as e:
        print(f"[access_control] 解析 index.html 导航页面清单失败，使用兜底清单：{e}")
    return list(_FALLBACK_ALL_PAGES)


def all_pages() -> List[Dict[str, str]]:
    """对外暴露的页面全集清单（每次调用都重新解析，随 index.html 改动即时生效）。"""
    return _load_all_pages()


def all_page_ids() -> List[str]:
    return [p["id"] for p in all_pages()]

# --- 无限画布可用「节点」：动态感知智能画布 AI 生成引擎下的全部模型 ---
# 不再使用固定的节点类型清单（image/prompt/loop/... 已废弃），改为按
# "provider_id::model" 枚举智能画布「AI生成」引擎（engine=api）下可选的图片模型 + 视频模型。
# 数据来源由 main.py 通过 set_image_models_provider() 注入 load_api_providers，
# 避免 core 模块反向依赖 main.py 造成循环引用。
_image_models_provider = None  # Callable[[], List[dict]]，返回值形如 load_api_providers() 的 provider 列表


def set_image_models_provider(fn) -> None:
    """由 main.py 在 load_api_providers 定义后调用，注入获取当前 provider 列表的函数。"""
    global _image_models_provider
    _image_models_provider = fn


def _provider_display_name(provider: Dict[str, Any]) -> str:
    return str(provider.get("name") or provider.get("id") or "").strip() or str(provider.get("id") or "")


def all_nodes() -> List[Dict[str, str]]:
    """动态枚举智能画布「AI生成」引擎（engine=api）下可选的全部模型。

    id 格式："<provider_id>::<model>"，覆盖该引擎下的图片模型（image_models）与
    视频模型（video_models）。provider 未启用（enabled=False）时跳过。
    每次调用都重新读取，随 data/api_providers.json 的改动即时生效。
    """
    if _image_models_provider is None:
        return []
    try:
        providers = _image_models_provider() or []
    except Exception as e:
        print(f"[access_control] 获取 provider 模型清单失败：{e}")
        return []
    items: List[Dict[str, str]] = []
    seen = set()
    for provider in providers:
        if not isinstance(provider, dict) or provider.get("enabled") is False:
            continue
        provider_id = str(provider.get("id") or "").strip()
        if not provider_id:
            continue
        display_name = _provider_display_name(provider)
        for model in provider.get("image_models") or []:
            model = str(model or "").strip()
            if not model:
                continue
            node_id = f"{provider_id}::{model}"
            if node_id in seen:
                continue
            seen.add(node_id)
            items.append({"id": node_id, "label": f"{display_name} · {model}"})
        for model in provider.get("video_models") or []:
            model = str(model or "").strip()
            if not model:
                continue
            node_id = f"{provider_id}::{model}"
            if node_id in seen:
                continue
            seen.add(node_id)
            items.append({"id": node_id, "label": f"{display_name} · {model}"})
    return items


def all_node_ids() -> List[str]:
    return [n["id"] for n in all_nodes()]


def is_model_allowed(user_id: str, provider_id: str, model: str) -> bool:
    """校验指定用户是否有权限使用某个「provider_id + model」组合（供路由层调用）。

    admin 始终允许。未配置任何画布节点限制的用户默认允许全部。
    """
    node_id = f"{str(provider_id or '').strip()}::{str(model or '').strip()}"
    perms = effective_permissions(user_id)
    return node_id in set(perms.get("nodes") or [])


def is_admin(user_id: str) -> bool:
    """是否为管理员用户。"""
    return (user_id or "") == ADMIN_USER_ID


def _load_config_unlocked() -> Dict[str, Any]:
    data = get_app_setting("access_control", {})
    if isinstance(data, dict) and isinstance(data.get("users"), dict):
        if "default" not in data or not isinstance(data.get("default"), dict):
            data["default"] = None
        return data
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
    valid_page_ids = all_page_ids()
    valid_node_ids = all_node_ids()
    pages = valid_page_ids if raw_pages is None else [p for p in valid_page_ids if p in set(raw_pages)]
    nodes = valid_node_ids if raw_nodes is None else [n for n in valid_node_ids if n in set(raw_nodes)]
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
        set_app_setting("access_control", sanitized)
    return sanitized


def effective_permissions(user_id: str) -> Dict[str, Any]:
    """计算指定用户的有效权限。

    优先级：admin（全权）> 用户独立配置 > 默认配置(default) > 全集（全开）。
    返回：{is_admin, pages: [...], nodes: [...]}。
    """
    if is_admin(user_id):
        return {"is_admin": True, "pages": all_page_ids(), "nodes": all_node_ids()}
    config = load_config()
    entry = config.get("users", {}).get(user_id)
    if entry is None:
        # 无独立配置：回退到默认配置；默认未设置则全开。
        default = config.get("default")
        if isinstance(default, dict):
            sd = _sanitize_user_entry(default)
            return {"is_admin": False, "pages": sd["pages"], "nodes": sd["nodes"]}
        return {"is_admin": False, "pages": all_page_ids(), "nodes": all_node_ids()}
    sanitized = _sanitize_user_entry(entry)
    return {"is_admin": False, "pages": sanitized["pages"], "nodes": sanitized["nodes"]}
