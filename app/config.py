"""集中配置：路径常量、环境变量、全局锁与队列。

从 main.py 的「配置区域」原样迁移，值保持完全一致。

注意 BASE_DIR：本文件位于 app/ 下，项目根是其上一级目录，
因此用 dirname(dirname(__file__)) 还原出与原 main.py 相同的 BASE_DIR。
"""
import os
import uuid
from threading import Lock

# --- 路径常量 ---
CLIENT_ID = str(uuid.uuid4())
# 项目根目录（app/ 的上一级），与原 main.py 中 BASE_DIR 取值一致
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKFLOW_DIR = os.path.join(BASE_DIR, "workflows")
WORKFLOW_PATH = os.path.join(WORKFLOW_DIR, "Z-Image.json")
STATIC_DIR = os.path.join(BASE_DIR, "static")
STATIC_RUNNINGHUB_DIR = os.path.join(STATIC_DIR, "runninghub")
STATIC_RUNNINGHUB_THUMBNAIL_DIR = os.path.join(STATIC_RUNNINGHUB_DIR, "thumbnails")
STATIC_RUNNINGHUB_API_PROVIDERS_FILE = os.path.join(STATIC_RUNNINGHUB_DIR, "api_providers.json")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
OUTPUT_INPUT_DIR = os.path.join(ASSETS_DIR, "input")
OUTPUT_OUTPUT_DIR = os.path.join(ASSETS_DIR, "output")
ASSET_LIBRARY_DIR = os.path.join(ASSETS_DIR, "library")
LOCAL_UPLOAD_DIR = os.path.join(ASSETS_DIR, "uploads")
HISTORY_FILE = os.path.join(BASE_DIR, "history.json")  # 旧的全局历史文件（仅遗留，已改为每用户 history_file()）
API_ENV_FILE = os.path.join(BASE_DIR, "API", ".env")
DATA_DIR = os.path.join(BASE_DIR, "data")
# 每个登录用户的私有数据根目录：data/users/<user_id>/
USERS_DIR = os.path.join(DATA_DIR, "users")
SESSIONS_FILE = os.path.join(DATA_DIR, "sessions.json")
USERS_REGISTRY_FILE = os.path.join(DATA_DIR, "users_registry.json")
# 兼容旧的全局路径（仅用于历史遗留/默认回退，不再直接读写用户数据）。
LEGACY_CONVERSATION_DIR = os.path.join(DATA_DIR, "conversations")
LEGACY_CANVAS_DIR = os.path.join(DATA_DIR, "canvases")
API_PROVIDERS_FILE = os.path.join(DATA_DIR, "api_providers.json")
RUNNINGHUB_WORKFLOW_STORE_FILE = os.path.join(DATA_DIR, "runninghub_workflows.json")
SHARED_FOLDERS_FILE = os.path.join(DATA_DIR, "shared_folders.json")
GLOBAL_CONFIG_FILE = os.path.join(BASE_DIR, "global_config.json")
FEEDBACK_FILE = os.path.join(DATA_DIR, "feedback.json")
HELP_MARKDOWN_FILE = os.path.join(DATA_DIR, "help.md")
CANVAS_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
LOCAL_IMAGE_IMPORT_MAX_BYTES = int(os.getenv("LOCAL_IMAGE_IMPORT_MAX_BYTES", str(50 * 1024 * 1024)))
LOCAL_IMAGE_IMPORT_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
RUNNINGHUB_THUMBNAIL_EXTS = (".jpg",)

# --- 模型字段默认值/校验所需常量 ---
VOLCENGINE_DEFAULT_PROJECT_NAME = "default"
VOLCENGINE_DEFAULT_REGION = "cn-beijing"
ONLINE_IMAGE_PROMPT_MAX_LENGTH = int(os.getenv("ONLINE_IMAGE_PROMPT_MAX_LENGTH", "20000"))
VIDEO_PROMPT_MAX_LENGTH = int(os.getenv("VIDEO_PROMPT_MAX_LENGTH", "4000"))
LLM_MESSAGE_MAX_LENGTH = int(os.getenv("LLM_MESSAGE_MAX_LENGTH", "20000"))
# 视频任务轮询超时（秒）
VIDEO_POLL_TIMEOUT = float(os.getenv("VIDEO_POLL_TIMEOUT", "1800"))

# --- 队列与全局锁 ---
QUEUE = []
QUEUE_LOCK = Lock()
HISTORY_LOCK = Lock()
GLOBAL_CONFIG_LOCK = Lock()
FEEDBACK_LOCK = Lock()
HELP_LOCK = Lock()
CONVERSATION_LOCK = Lock()
CANVAS_LOCK = Lock()
LOAD_LOCK = Lock()
RUNNINGHUB_WORKFLOW_LOCK = Lock()
