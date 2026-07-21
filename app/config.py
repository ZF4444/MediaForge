"""集中配置：路径常量、环境变量、全局锁与队列。

从 main.py 的「配置区域」原样迁移，值保持完全一致。

注意 BASE_DIR：本文件位于 app/ 下，项目根是其上一级目录，
因此用 dirname(dirname(__file__)) 还原出与原 main.py 相同的 BASE_DIR。
"""
import os
import tempfile
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
API_ENV_FILE = os.path.join(BASE_DIR, "API", ".env")
DATA_DIR = os.path.join(BASE_DIR, "data")
HELP_DEFAULT_PAGE = "index"
LOCAL_IMAGE_IMPORT_MAX_BYTES = int(os.getenv("LOCAL_IMAGE_IMPORT_MAX_BYTES", str(50 * 1024 * 1024)))
LOCAL_IMAGE_IMPORT_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
RUNNINGHUB_THUMBNAIL_EXTS = (".jpg",)

# --- 对象存储配置 ---
DATABASE_URL = str(os.getenv("DATABASE_URL", "")).strip()
DATABASE_POOL_MIN_SIZE = int(os.getenv("DATABASE_POOL_MIN_SIZE", "4"))
DATABASE_POOL_MAX_SIZE = int(os.getenv("DATABASE_POOL_MAX_SIZE", "20"))
DATABASE_POOL_TIMEOUT_SECONDS = float(os.getenv("DATABASE_POOL_TIMEOUT_SECONDS", "3"))
DATABASE_CONNECT_TIMEOUT_SECONDS = int(os.getenv("DATABASE_CONNECT_TIMEOUT_SECONDS", "5"))
DATABASE_POOL_MAX_IDLE_SECONDS = float(os.getenv("DATABASE_POOL_MAX_IDLE_SECONDS", "300"))
DATABASE_POOL_MAX_LIFETIME_SECONDS = float(os.getenv("DATABASE_POOL_MAX_LIFETIME_SECONDS", "3600"))
DATABASE_STATEMENT_TIMEOUT_MS = int(os.getenv("DATABASE_STATEMENT_TIMEOUT_MS", "10000"))
DATABASE_LOCK_TIMEOUT_MS = int(os.getenv("DATABASE_LOCK_TIMEOUT_MS", "3000"))
DATABASE_SLOW_QUERY_THRESHOLD_MS = float(os.getenv("DATABASE_SLOW_QUERY_THRESHOLD_MS", "500"))
MINIO_ENDPOINT = str(os.getenv("MINIO_ENDPOINT", "")).strip()
MINIO_ACCESS_KEY = str(os.getenv("MINIO_ACCESS_KEY", "")).strip()
MINIO_SECRET_KEY = str(os.getenv("MINIO_SECRET_KEY", "")).strip()
MINIO_SECURE = str(os.getenv("MINIO_SECURE", "false")).strip().lower() in {"1", "true", "yes", "on"}
MINIO_CONNECT_TIMEOUT_SECONDS = float(os.getenv("MINIO_CONNECT_TIMEOUT_SECONDS", "5"))
MINIO_READ_TIMEOUT_SECONDS = float(os.getenv("MINIO_READ_TIMEOUT_SECONDS", "30"))
HEALTH_CHECK_TIMEOUT_SECONDS = float(os.getenv("HEALTH_CHECK_TIMEOUT_SECONDS", "5"))
TRANSIENT_RETRY_MAX_ATTEMPTS = int(os.getenv("TRANSIENT_RETRY_MAX_ATTEMPTS", "3"))
TRANSIENT_RETRY_BASE_DELAY_SECONDS = float(os.getenv("TRANSIENT_RETRY_BASE_DELAY_SECONDS", "0.2"))
TRANSIENT_RETRY_MAX_DELAY_SECONDS = float(os.getenv("TRANSIENT_RETRY_MAX_DELAY_SECONDS", "1"))
TRANSIENT_RETRY_JITTER_SECONDS = float(os.getenv("TRANSIENT_RETRY_JITTER_SECONDS", "0.1"))
MINIO_BUCKET_PRIVATE = str(os.getenv("MINIO_BUCKET_PRIVATE", "mediaforge-private")).strip() or "mediaforge-private"
MINIO_BUCKET_PUBLIC = str(os.getenv("MINIO_BUCKET_PUBLIC", "mediaforge-public")).strip() or "mediaforge-public"
MINIO_BUCKET_TEMP = str(os.getenv("MINIO_BUCKET_TEMP", "mediaforge-temp")).strip() or "mediaforge-temp"
STORAGE_CACHE_DIR = str(
    os.getenv("STORAGE_CACHE_DIR", os.path.join(tempfile.gettempdir(), "mediaforge-storage-cache"))
).strip() or os.path.join(tempfile.gettempdir(), "mediaforge-storage-cache")
STORAGE_CACHE_CLEANUP_ENABLED = str(
    os.getenv("STORAGE_CACHE_CLEANUP_ENABLED", os.getenv("STORAGE_CACHE_ENABLED", "true"))
).strip().lower() in {"1", "true", "yes", "on"}
# Deprecated compatibility alias. Materialization itself is always available
# because several downstream integrations require a local filesystem path.
STORAGE_CACHE_ENABLED = STORAGE_CACHE_CLEANUP_ENABLED
STORAGE_CACHE_MAX_BYTES = int(os.getenv("STORAGE_CACHE_MAX_BYTES", str(10 * 1024 * 1024 * 1024)))
STORAGE_CACHE_TARGET_BYTES = int(os.getenv("STORAGE_CACHE_TARGET_BYTES", str(8 * 1024 * 1024 * 1024)))
STORAGE_CACHE_IDLE_TTL_SECONDS = int(os.getenv("STORAGE_CACHE_IDLE_TTL_SECONDS", str(7 * 24 * 60 * 60)))
STORAGE_CACHE_CLEANUP_INTERVAL_SECONDS = int(os.getenv("STORAGE_CACHE_CLEANUP_INTERVAL_SECONDS", "600"))
STORAGE_CACHE_TMP_TTL_SECONDS = int(os.getenv("STORAGE_CACHE_TMP_TTL_SECONDS", "3600"))
STORAGE_CACHE_ACCESS_GRACE_SECONDS = int(os.getenv("STORAGE_CACHE_ACCESS_GRACE_SECONDS", "900"))
STORAGE_CACHE_MIN_FREE_BYTES = int(os.getenv("STORAGE_CACHE_MIN_FREE_BYTES", str(10 * 1024 * 1024 * 1024)))
STORAGE_CACHE_ACCESS_TOUCH_INTERVAL_SECONDS = int(os.getenv("STORAGE_CACHE_ACCESS_TOUCH_INTERVAL_SECONDS", "300"))
STORAGE_CACHE_ORPHAN_SCAN_ENABLED = str(os.getenv("STORAGE_CACHE_ORPHAN_SCAN_ENABLED", "true")).strip().lower() in {"1", "true", "yes", "on"}
STORAGE_CACHE_ORPHAN_SCAN_INTERVAL_SECONDS = int(os.getenv("STORAGE_CACHE_ORPHAN_SCAN_INTERVAL_SECONDS", "86400"))
STORAGE_CACHE_CLEANUP_BATCH_SIZE = int(os.getenv("STORAGE_CACHE_CLEANUP_BATCH_SIZE", "1000"))
STORAGE_CACHE_DRY_RUN = str(os.getenv("STORAGE_CACHE_DRY_RUN", "false")).strip().lower() in {"1", "true", "yes", "on"}
STORAGE_QUOTA_ENABLED = str(os.getenv("STORAGE_QUOTA_ENABLED", "true")).strip().lower() in {"1", "true", "yes", "on"}
STORAGE_USER_QUOTA_BYTES = int(os.getenv("STORAGE_USER_QUOTA_BYTES", str(10 * 1024 * 1024 * 1024)))
STORAGE_CLEANUP_ENABLED = str(os.getenv("STORAGE_CLEANUP_ENABLED", "true")).strip().lower() in {"1", "true", "yes", "on"}
STORAGE_CLEANUP_INTERVAL_SECONDS = int(os.getenv("STORAGE_CLEANUP_INTERVAL_SECONDS", "3600"))
STORAGE_CLEANUP_BATCH_SIZE = int(os.getenv("STORAGE_CLEANUP_BATCH_SIZE", "500"))
STORAGE_METADATA_PURGE_ENABLED = str(os.getenv("STORAGE_METADATA_PURGE_ENABLED", "true")).strip().lower() in {"1", "true", "yes", "on"}
STORAGE_METADATA_PURGE_RETENTION_DAYS = int(os.getenv("STORAGE_METADATA_PURGE_RETENTION_DAYS", "30"))
STORAGE_INPUT_RETENTION_DAYS = int(os.getenv("STORAGE_INPUT_RETENTION_DAYS", "30"))
STORAGE_UPLOAD_RETENTION_DAYS = int(os.getenv("STORAGE_UPLOAD_RETENTION_DAYS", "30"))
STORAGE_OUTPUT_RETENTION_DAYS = int(os.getenv("STORAGE_OUTPUT_RETENTION_DAYS", "30"))
STORAGE_TEMP_RETENTION_DAYS = int(os.getenv("STORAGE_TEMP_RETENTION_DAYS", "3"))

# --- 模型字段默认值/校验所需常量 ---
VOLCENGINE_DEFAULT_PROJECT_NAME = "default"
VOLCENGINE_DEFAULT_REGION = "cn-beijing"
ONLINE_IMAGE_PROMPT_MAX_LENGTH = int(os.getenv("ONLINE_IMAGE_PROMPT_MAX_LENGTH", "20000"))
VIDEO_PROMPT_MAX_LENGTH = int(os.getenv("VIDEO_PROMPT_MAX_LENGTH", "4000"))
LLM_MESSAGE_MAX_LENGTH = int(os.getenv("LLM_MESSAGE_MAX_LENGTH", "20000"))
# 视频任务轮询超时（秒）
VIDEO_POLL_TIMEOUT = float(os.getenv("VIDEO_POLL_TIMEOUT", "1800"))

# --- 全局锁 ---
TASK_ID_LOCK = Lock()
HISTORY_LOCK = Lock()
GLOBAL_CONFIG_LOCK = Lock()
FEEDBACK_LOCK = Lock()
HELP_LOCK = Lock()
ANNOUNCEMENT_LOCK = Lock()
CONVERSATION_LOCK = Lock()
CANVAS_LOCK = Lock()
LOAD_LOCK = Lock()
