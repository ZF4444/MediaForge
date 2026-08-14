"""提示词库 / 提示词模板的数据与规范化逻辑。

从 main.py 的「提示词模板解析」与「提示词库」区块原样迁移，行为完全一致。
被 app/routers/prompts.py 与 app/routers/canvases.py（canvas 模板）复用。

依赖：
- app.config：STATIC_DIR
- app.core.utils：now_ms
- app.core.auth：current_user_id（按用户隔离）
- app.core.shared：sanitize_asset_name
"""
import json
import os
import re
import uuid

from app.config import DATA_DIR, STATIC_DIR
from app.core.auth import current_user_id
from app.services.business_metadata import get_user_setting, set_user_setting
from app.core.shared import sanitize_asset_name
from app.core.logging import get_logger


logger = get_logger("prompts")
from app.core.utils import now_ms

STATIC_PROMPT_TEMPLATE_MD = os.path.join(STATIC_DIR, "system-prompts", "infinite-canvas-prompt-templates.md")
PROMPT_TEMPLATE_PATHS = [STATIC_PROMPT_TEMPLATE_MD]
PROMPT_TEMPLATE_EN = {
    "多机位九宫格": {
        "name": "9-Angle Multi-Camera Grid",
        "scene": "Show the same subject or scene from 9 camera angles for character turnarounds, product views, or space scouting.",
    },
    "多机位九宫格4K": {
        "name": "9-Angle Multi-Camera Grid 4K",
        "scene": "A high-resolution 9-angle reference sheet for print-grade output, large displays, and fine material study.",
    },
    "剧情推演四宫格": {
        "name": "4-Panel Story Progression",
        "scene": "Preview four consecutive story beats or emotional stages for storyboard planning and narrative rhythm tests.",
    },
    "角色脸部三视图": {
        "name": "Character Face 3-View Sheet",
        "scene": "Front, side, and three-quarter face references for Actor ID locking and expression consistency.",
    },
    "产品三视图": {
        "name": "Product 3-View Sheet",
        "scene": "Front, side, and top product views for industrial design, ecommerce detail pages, and technical documents.",
    },
    "25宫格连贯分镜": {
        "name": "25-Panel Continuous Storyboard",
        "scene": "A full 5x5 storyboard for continuous scene or action flow, useful for film previews and motion continuity tests.",
    },
    "电影级光影校正": {
        "name": "Cinematic Lighting Comparison",
        "scene": "Compare the same subject or scene under different lighting conditions for mood, color, and lighting choices.",
    },
    "角色设定参考表（胸口特写+全身三视图）": {
        "name": "Character Reference Sheet: Portrait + Full-Body Views",
        "scene": "A consistency reference combining a face anchor and full-body front, side, and back views for Actor ID and costume lock.",
    },
    "6种基础表情胸像（2×3六宫格）": {
        "name": "6 Basic Expression Busts",
        "scene": "Six basic expressions of the same character for expression consistency, emotion baselines, and Seedance Talk-to-Edit reference.",
    },
    "360全景图": {
        "name": "360 Panorama VR Image",
        "scene": "Generate a seamless 360-degree VR panorama with continuous left and right edges and natural pole transitions.",
    },
}


def prompt_template_markdown_path() -> str:
    for path in PROMPT_TEMPLATE_PATHS:
        if os.path.exists(path):
            return path
    return ""


def prompt_template_category(name: str, scene: str) -> str:
    text = f"{name} {scene}"
    if any(k in text for k in ["光影", "灯光", "光效", "电影级"]):
        return "lighting"
    if any(k in text for k in ["视角", "全景", "VR", "镜头", "俯拍", "仰拍", "景别", "构图", "透视"]):
        return "view"
    if any(k in text for k in ["角色", "脸部", "表情", "Actor", "服装"]):
        return "character"
    if any(k in name for k in ["产品", "电商", "工业"]):
        return "product"
    return "storyboard"


def extract_prompt_template_section(block: str, title: str) -> str:
    pattern = rf"###\s*{re.escape(title)}\s*\n(?P<body>.*?)(?=\n###\s+|\Z)"
    match = re.search(pattern, block, re.S)
    if not match:
        return ""
    body = match.group("body").strip()
    fence = re.search(r"```(?:\w+)?\s*\n(?P<code>.*?)\n```", body, re.S)
    return (fence.group("code") if fence else body).strip()


def parse_prompt_template_markdown(text: str):
    templates = []
    matches = list(re.finditer(r"^##\s*预设\s*(\d+)\s*[：:]\s*(.+?)\s*$", text, re.M))
    for index, match in enumerate(matches):
        number = match.group(1).strip()
        name = match.group(2).strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[start:end]
        scene = extract_prompt_template_section(block, "适用场景")
        positive = extract_prompt_template_section(block, "正向提示词")
        negative = extract_prompt_template_section(block, "负向提示词")
        params_raw = extract_prompt_template_section(block, "平台参数建议")
        params = {}
        for line in params_raw.splitlines():
            item = re.match(r"[-*]\s*\*\*(.+?)\*\*\s*[：:]\s*(.+)", line.strip())
            if item:
                params[item.group(1).strip()] = item.group(2).strip()
        if not positive:
            continue
        templates.append({
            "id": f"builtin_md_{number}",
            "number": number,
            "name": name,
            "name_en": PROMPT_TEMPLATE_EN.get(name, {}).get("name", name),
            "category": prompt_template_category(name, scene),
            "scene": scene,
            "scene_en": PROMPT_TEMPLATE_EN.get(name, {}).get("scene", scene),
            "positive": positive,
            "negative": negative,
            "params": params,
            "builtin": True,
        })
    return templates


def builtin_prompt_templates():
    try:
        template_path = prompt_template_markdown_path()
        if not template_path:
            return []
        with open(template_path, "r", encoding="utf-8") as f:
            return parse_prompt_template_markdown(f.read())
    except Exception:
        logger.exception("failed to load prompt templates", extra={"event": "prompt_templates_load_failed"})
        return []


def normalize_prompt_category_id(category="custom"):
    category_id = re.sub(r"[^A-Za-z0-9_-]+", "_", str(category or "custom"))[:40] or "custom"
    return "custom" if category_id in {"mine", "my", "personal"} else category_id


def normalize_prompt_library_item(item):
    if not isinstance(item, dict):
        item = {}
    name = sanitize_asset_name(item.get("name") or "提示词", "提示词")
    positive = str(item.get("positive") or item.get("text") or "").strip()
    return {
        "id": re.sub(r"[^A-Za-z0-9_-]+", "_", str(item.get("id") or item.get("item_id") or f"tpl_{uuid.uuid4().hex[:12]}"))[:60],
        "name": name,
        "category": normalize_prompt_category_id(item.get("category") or "custom"),
        "scene": str(item.get("scene") or "").strip()[:500],
        "positive": positive,
        "negative": str(item.get("negative") or "").strip(),
        "params": item.get("params") if isinstance(item.get("params"), dict) else {},
        "created_at": int(item.get("created_at") or now_ms()),
        "updated_at": int(item.get("updated_at") or item.get("created_at") or now_ms()),
    }


def seed_system_prompt_library():
    return {
        "id": "system",
        "name": "系统提示词库",
        "type": "prompt",
        "items": builtin_prompt_templates(),
        "categories": defaultPromptTemplateCategories(),
    }


def seed_caption_prompt_library():
    return {
        "id": "caption",
        "name": "反推提示词库",
        "type": "prompt",
        "items": [{
            "id": "caption_default",
            "name": "通用图片反推",
            "category": "custom",
            "scene": "将输入图片详细描述为可用于 AI 绘画的提示词。",
            "positive": "请详细描述这张图片的内容，包括主体、场景、风格、光照、色彩、构图等信息，用自然语言输出，适合作为 AI 绘画的提示词。",
            "negative": "",
            "params": {},
        }],
        "categories": [],
    }


def seed_expand_prompt_library():
    return {
        "id": "expand",
        "name": "扩写提示词库",
        "type": "prompt",
        "items": [{
            "id": "expand_default",
            "name": "通用提示词扩写",
            "category": "custom",
            "scene": "将简短提示词扩写为更完整、可执行的图像生成提示词。",
            "positive": "将用户输入扩写为清晰、具体且适合 AI 图像生成的提示词。保留原始意图，补充主体细节、场景、构图、光线、色彩和风格；只输出最终提示词。",
            "negative": "",
            "params": {},
        }],
        "categories": [],
    }


def reserved_prompt_libraries():
    return [seed_system_prompt_library(), seed_caption_prompt_library(), seed_expand_prompt_library()]


def default_prompt_libraries():
    return {
        "active_library_id": "system",
        "libraries": reserved_prompt_libraries(),
        "updated_at": now_ms(),
    }


def defaultPromptTemplateCategories():
    return [
        {"id": "view", "name": "视角"},
        {"id": "storyboard", "name": "分镜"},
        {"id": "character", "name": "角色"},
        {"id": "product", "name": "产品"},
        {"id": "lighting", "name": "光影"},
        {"id": "custom", "name": "我的"},
    ]


def normalize_prompt_template_categories(*category_lists, include_defaults=True):
    normalized = []
    seen = set()

    def add_category(category):
        if not isinstance(category, dict):
            return
        cat_id = normalize_prompt_category_id(category.get("id") or category.get("name") or "custom")
        if cat_id in seen:
            return
        seen.add(cat_id)
        name = "我的" if cat_id == "custom" else sanitize_asset_name(category.get("name") or cat_id, cat_id)
        normalized.append({"id": cat_id, "name": name})

    if include_defaults:
        for category in defaultPromptTemplateCategories():
            add_category(category)
    for categories in category_lists:
        if isinstance(categories, list):
            for category in categories:
                add_category(category)
    return normalized


def normalize_prompt_libraries(data):
    if not isinstance(data, dict):
        data = default_prompt_libraries()
    raw_libraries = data.get("libraries") if isinstance(data.get("libraries"), list) else []
    raw_libraries = [lib for lib in raw_libraries if isinstance(lib, dict)]
    reserved_ids = {library["id"] for library in reserved_prompt_libraries()}
    existing_reserved = {lib.get("id"): lib for lib in raw_libraries if lib.get("id") in reserved_ids}
    raw_libraries = [existing_reserved.get(seed["id"], seed) for seed in reserved_prompt_libraries()] + [
        lib for lib in raw_libraries if lib.get("id") not in reserved_ids
    ]
    libraries = []
    seen_lib_ids = set()
    for raw in raw_libraries:
        is_system = raw.get("id") == "system"
        if is_system:
            lib_id = "system"
        else:
            lib_id = re.sub(r"[^A-Za-z0-9_-]+", "_", str(raw.get("id") or f"lib_{uuid.uuid4().hex[:12]}"))[:60] or f"lib_{uuid.uuid4().hex[:12]}"
        if lib_id in seen_lib_ids:
            continue
        seen_lib_ids.add(lib_id)
        items = []
        seen_items = set()
        for raw_item in (raw.get("items") if isinstance(raw.get("items"), list) else []):
            if not isinstance(raw_item, dict):
                continue
            item = normalize_prompt_library_item(raw_item)
            item_id = item.get("id") or f"tpl_{uuid.uuid4().hex[:12]}"
            if item_id in seen_items:
                continue
            seen_items.add(item_id)
            items.append(item)
        default_names = {
            "system": "系统提示词库",
            "caption": "反推提示词库",
            "expand": "扩写提示词库",
        }
        default_name = default_names.get(lib_id, "提示词库")
        raw_categories = raw.get("categories") if isinstance(raw.get("categories"), list) else []
        if not is_system:
            # 非系统库不保留任何内置分组（视角/分镜等），仅保留用户自建分组
            builtin_ids = {"view", "storyboard", "character", "product", "lighting", "custom"}
            raw_categories = [c for c in raw_categories if isinstance(c, dict) and normalize_prompt_category_id(c.get("id") or c.get("name") or "") not in builtin_ids]
        libraries.append({
            "id": lib_id,
            "name": sanitize_asset_name(raw.get("name") or default_name, default_name),
            "type": "prompt",
            "readonly": False,
            "system": is_system,
            "categories": normalize_prompt_template_categories(raw_categories, include_defaults=is_system),
            "items": items,
        })
    active = str(data.get("active_library_id") or "system")
    if not any(lib["id"] == active for lib in libraries):
        active = "system" if any(lib["id"] == "system" for lib in libraries) else (libraries[0]["id"] if libraries else "system")
    return {"active_library_id": active, "libraries": libraries, "updated_at": int(data.get("updated_at") or now_ms())}


def _legacy_rule_items(kind, user_id):
    filename = f"{kind}_rules_builtin.json"
    builtin_rules = []
    try:
        with open(os.path.join(DATA_DIR, filename), "r", encoding="utf-8") as file:
            loaded = json.load(file)
            builtin_rules = loaded if isinstance(loaded, list) else []
    except (OSError, ValueError, TypeError):
        pass
    user_rules = get_user_setting(user_id, f"{kind}_rules", [])
    user_rules = user_rules if isinstance(user_rules, list) else []
    return [rule for rule in [*builtin_rules, *user_rules] if isinstance(rule, dict) and str(rule.get("content") or "").strip()]


def _migrate_legacy_rules(data, kind, rules):
    library = find_prompt_library(data, kind)
    if not library:
        return False
    existing_ids = {str(item.get("id") or "") for item in library.get("items", []) if isinstance(item, dict)}
    migrated = False
    for index, rule in enumerate(rules):
        rule_id = re.sub(r"[^A-Za-z0-9_-]+", "_", str(rule.get("id") or index))[:48] or str(index)
        item_id = f"legacy_{kind}_{rule_id}"
        if item_id in existing_ids:
            continue
        library.setdefault("items", []).append(normalize_prompt_library_item({
            "id": item_id,
            "name": rule.get("name") or ("反推规则" if kind == "caption" else "扩写规则"),
            "category": "custom",
            "scene": "从旧画布旧规则迁移",
            "positive": rule.get("content") or "",
        }))
        existing_ids.add(item_id)
        migrated = True
    return migrated


def load_prompt_libraries():
    user_id = current_user_id()
    data = get_user_setting(user_id, "prompt_libraries", default_prompt_libraries())
    if not isinstance(data, dict):
        data = default_prompt_libraries()
    normalized = normalize_prompt_libraries(data)
    migration_state = get_user_setting(user_id, "prompt_library_rule_migrations", {})
    migration_state = migration_state if isinstance(migration_state, dict) else {}
    migrated = False
    for kind in ("caption", "expand"):
        if migration_state.get(kind):
            continue
        migrated = _migrate_legacy_rules(normalized, kind, _legacy_rule_items(kind, user_id)) or migrated
        migration_state[kind] = True
    if normalized.get("active_library_id") != data.get("active_library_id") or normalized.get("libraries") != data.get("libraries") or migrated:
        normalized = save_prompt_libraries(normalized)
    if migration_state != get_user_setting(user_id, "prompt_library_rule_migrations", {}):
        set_user_setting(user_id, "prompt_library_rule_migrations", migration_state)
    return normalized


def save_prompt_libraries(data):
    data = normalize_prompt_libraries(data)
    data["updated_at"] = now_ms()
    set_user_setting(current_user_id(), "prompt_libraries", data)
    return data


def public_prompt_libraries(data=None):
    data = normalize_prompt_libraries(data or load_prompt_libraries())
    return {
        "active_library_id": data.get("active_library_id") or (data.get("libraries") or [{}])[0].get("id") or "system",
        "libraries": data.get("libraries") or [],
        "updated_at": data.get("updated_at") or now_ms(),
    }


def find_prompt_library(data, library_id=""):
    if not isinstance(data, dict):
        return None
    libraries = data.get("libraries") if isinstance(data.get("libraries"), list) else []
    library_id = str(library_id or data.get("active_library_id") or "").strip()
    return next((item for item in libraries if item.get("id") == library_id), None) or (libraries[0] if libraries else None)
