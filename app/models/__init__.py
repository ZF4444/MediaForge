"""全部 Pydantic 请求/数据模型（50 个）。

从 main.py 原样迁移，字段与默认值完全一致，并保持原有定义顺序
（部分模型相互引用，定义顺序需要保持稳定）。

依赖：pydantic、typing、app.config 中的长度/默认值常量。
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.config import (
    LLM_MESSAGE_MAX_LENGTH,
    ONLINE_IMAGE_PROMPT_MAX_LENGTH,
    VIDEO_PROMPT_MAX_LENGTH,
    VOLCENGINE_DEFAULT_PROJECT_NAME,
    VOLCENGINE_DEFAULT_REGION,
)


class GenerateRequest(BaseModel):
    prompt: str = ""
    width: int = 1024
    height: int = 1024
    workflow_json: str = "Z-Image.json"
    params: Dict[str, Any] = {}
    type: str = "zimage"
    client_id: str = ""
    convert_to_jpg: bool = False


class DeleteHistoryRequest(BaseModel):
    timestamp: float


class SaveHistoryRequest(BaseModel):
    images: List[str]
    type: str = "zimage"
    prompt: str = ""
    is_cloud: bool = False


class TokenRequest(BaseModel):
    token: str


class CloudGenRequest(BaseModel):
    prompt: str
    api_key: str = ""
    model: str = ""
    resolution: str = "1024x1024"
    type: str = "zimage"
    image_urls: List[str] = []
    loras: Optional[Any] = None
    client_id: Optional[str] = None


class CloudPollRequest(BaseModel):
    task_id: str
    api_key: str = ""
    client_id: Optional[str] = None


class AIReference(BaseModel):
    file_id: str = ""
    url: str = ""
    name: str = ""
    role: str = ""


class OnlineImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=ONLINE_IMAGE_PROMPT_MAX_LENGTH)
    provider_id: str = "comfly"
    model: str = ""
    size: str = "1024x1024"
    quality: str = "auto"
    n: int = 1
    reference_images: List[AIReference] = []


class ImageTaskQueryRequest(BaseModel):
    provider_id: str = "comfly"
    task_id: str = Field(min_length=1, max_length=240)


class CanvasVideoRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=VIDEO_PROMPT_MAX_LENGTH)
    provider_id: str = "comfly"
    model: str = "veo3-fast"
    duration: int = 5
    aspect_ratio: str = "16:9"
    resolution: str = ""
    size: str = ""
    images: List[AIReference] = []
    videos: List[str] = []
    audios: List[str] = []
    enhance_prompt: bool = False
    enable_upsample: bool = False
    watermark: bool = False
    seed: Optional[int] = None
    camerafixed: bool = False
    return_last_frame: bool = False
    generate_audio: bool = False
    multimodal: bool = False
    trusted_asset: bool = False


class TempShUploadRequest(BaseModel):
    url: str = ""


class CloudVideoUploadRequest(BaseModel):
    url: str = ""
    service: str = "auto"


class RunningHubSubmitRequest(BaseModel):
    webappId: str = ""
    nodeInfoList: List[Dict[str, Any]] = []
    instanceType: str = ""


class RunningHubUploadAssetRequest(BaseModel):
    url: str = ""


class JimengHelpRequest(BaseModel):
    command: str = ""


class JimengQueryMediaRequest(BaseModel):
    submit_id: str = ""
    kind: str = "image"


class ApiProviderPayload(BaseModel):
    id: str = ""
    name: str = ""
    base_url: str = ""
    protocol: str = "openai"
    image_generation_endpoint: str = ""
    image_edit_endpoint: str = ""
    enabled: bool = True
    primary: bool = False
    image_models: List[str] = []
    chat_models: List[str] = []
    video_models: List[str] = []
    model_protocols: Dict[str, str] = {}
    model_aliases: Dict[str, str] = {}
    ms_loras: List[Dict[str, Any]] = []
    ms_defaults_version: int = 0
    rh_apps: List[Dict[str, Any]] = []
    volcengine_project_name: str = VOLCENGINE_DEFAULT_PROJECT_NAME
    volcengine_region: str = VOLCENGINE_DEFAULT_REGION
    volcengine_access_key_id: Optional[str] = None
    volcengine_secret_access_key: Optional[str] = None
    api_key: Optional[str] = None
    clear_key: bool = False
    clear_volcengine_access_key_id: bool = False
    clear_volcengine_secret_access_key: bool = False


class ChatRequest(BaseModel):
    conversation_id: str = ""
    message: str = Field(min_length=1, max_length=LLM_MESSAGE_MAX_LENGTH)
    model: str = ""
    image_model: str = ""
    mode: str = "chat"
    size: str = "1024x1024"
    quality: str = "auto"
    reference_images: List[AIReference] = []
    provider: str = "comfly"
    ms_model: str = ""


class MsGenerateRequest(BaseModel):
    prompt: str
    api_key: str = ""
    model: str = "black-forest-labs/FLUX.2-klein-9B"
    image_urls: List[str] = []
    width: int = 0
    height: int = 0
    size: str = ""
    loras: Optional[Any] = None
    client_id: Optional[str] = None


class CanvasLLMRequest(BaseModel):
    message: str = Field(min_length=1, max_length=LLM_MESSAGE_MAX_LENGTH)
    system_prompt: str = ""
    model: str = ""
    messages: List[Dict[str, Any]] = []
    provider: str = "comfly"
    ms_model: str = ""
    images: List[str] = []   # 可以是 /output/*.png、/assets/*.png 本地路径 或 http(s) URL 或 data URL
    videos: List[str] = []   # 可以是 /output/*.mp4、/assets/*.mp4 本地路径 或 http(s) URL 或 data URL


class ConversationCreateRequest(BaseModel):
    title: str = "新对话"


class CanvasCreateRequest(BaseModel):
    title: str = "未命名画布"
    icon: str = "🧩"
    kind: str = "classic"


class CanvasMetaUpdate(BaseModel):
    title: Optional[str] = None
    icon: Optional[str] = None
    owner: Optional[str] = None
    color: Optional[str] = None
    pinned: Optional[bool] = None


class CanvasSaveRequest(BaseModel):
    title: str = "未命名画布"
    icon: str = "🧩"
    nodes: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []
    viewport: Dict[str, Any] = {}
    logs: List[Dict[str, Any]] = []
    settings: Dict[str, Any] = {}
    client_id: str = ""
    base_updated_at: int = 0


class CanvasAssetCheckRequest(BaseModel):
    urls: List[str] = []


class CanvasAssetDownloadRequest(BaseModel):
    urls: List[str] = []
    items: List[Dict[str, Any]] = []
    filename: str = "canvas-output-images.zip"


class CanvasWorkflowExportRequest(BaseModel):
    nodes: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []
    filename: str = "canvas-workflow.zip"
    include_resources: bool = False


class SmartCanvasGroupExportItem(BaseModel):
    kind: str = ""
    url: str = ""
    text: str = ""
    name: str = ""


class SmartCanvasGroupExportRequest(BaseModel):
    folder: str = ""
    group_name: str = "group"
    items: List[SmartCanvasGroupExportItem] = []


class LocalImageImportRequest(BaseModel):
    path: str = ""
    paths: List[str] = Field(default_factory=list)


class AssetLibraryCategoryRequest(BaseModel):
    name: str = "新文件夹"
    type: str = "image"
    library_id: str = ""


class AssetLibraryRequest(BaseModel):
    name: str = "资产库"


class AssetLibraryAddRequest(BaseModel):
    category_id: str = ""
    file_id: str = ""
    name: str = ""
    library_id: str = ""


class AssetLibraryBatchAddRequest(BaseModel):
    category_id: str = ""
    library_id: str = ""
    items: List[AssetLibraryAddRequest] = []


class SharedFolderRegister(BaseModel):
    path: str = ""
    name: str = ""


class SharedFolderImport(BaseModel):
    library_id: str = ""
    category_id: str = ""
    folder_id: str = ""
    paths: List[str] = []


class AssetLibraryRenameRequest(BaseModel):
    name: str = ""


class AssetLibraryBatchDeleteRequest(BaseModel):
    ids: List[str] = []
    library_id: str = ""


class AssetLibraryBatchMoveRequest(BaseModel):
    ids: List[str] = []
    library_id: str = ""
    target_library_id: str = ""
    target_category_id: str = ""


class AssetLibraryBatchCropRequest(BaseModel):
    ids: List[str] = []
    library_id: str = ""
    target_library_id: str = ""
    target_category_id: str = ""
    mode: str = "square"


class AssetAvatarRegisterRequest(BaseModel):
    library_id: str = ""
    provider_id: str = ""
    project_name: str = "default"
    group_name: str = ""


class PromptLibraryRequest(BaseModel):
    name: str = "提示词库"


class PromptLibraryItemRequest(BaseModel):
    library_id: str = ""
    item_id: str = ""
    name: str = "提示词"
    category: str = "custom"
    positive: str = ""
    negative: str = ""
    scene: str = ""


class PromptLibraryBatchDeleteRequest(BaseModel):
    ids: List[str] = []


class PromptLibraryCategoryRequest(BaseModel):
    name: str = "新分组"
    library_id: str = ""


class LoginRequest(BaseModel):
    username: str = ""


class TestConnectionPayload(BaseModel):
    base_url: str = ""
    api_key: str = ""
    provider_id: str = ""
    protocol: str = "openai"


class WorkflowField(BaseModel):
    id: str
    node: str = ""
    input: str = ""
    name: str = ""
    type: str = "text"
    default: Any = None
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None
    options: List[str] = []
    random_enabled: bool = False


class WorkflowConfig(BaseModel):
    title: str = ""
    fields: List[WorkflowField] = []
    mini_cards: Dict[str, Any] = {}


class WorkflowUploadRequest(BaseModel):
    name: str
    workflow: Dict[str, Any]


class WorkflowRunRequest(BaseModel):
    fields: Dict[str, Any] = {}
    config: WorkflowConfig
    client_id: str = ""


class ComfyInstancesPayload(BaseModel):
    instances: List[str] = []


class AccessControlUserEntry(BaseModel):
    pages: List[str] = Field(default_factory=list)
    nodes: List[str] = Field(default_factory=list)


class AccessControlConfigPayload(BaseModel):
    users: Dict[str, AccessControlUserEntry] = Field(default_factory=dict)
    # default 为新用户的默认权限：
    #   - 字段未出现：保留磁盘已有默认配置（不变更）
    #   - 显式传 null：清除默认配置（新用户全开）
    #   - 传对象：作为新的默认配置
    default: Optional[AccessControlUserEntry] = None


class FeedbackCreatePayload(BaseModel):
    type: str = Field(default="issue", max_length=40)
    content: str = Field(min_length=1, max_length=2000)
    page: str = Field(default="", max_length=80)
    user_agent: str = Field(default="", max_length=500)


class FeedbackUpdatePayload(BaseModel):
    status: Optional[str] = Field(default=None, max_length=40)
    admin_note: Optional[str] = Field(default=None, max_length=1000)


class HelpMarkdownPayload(BaseModel):
    content: str = Field(default="", max_length=100000)
    page: str = Field(default="index", max_length=64)


class AnnouncementPayload(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class StorageBatchDeletePayload(BaseModel):
    file_ids: List[str] = Field(default_factory=list, max_length=500)


class StorageQuotaUserConfigPayload(BaseModel):
    quota_bytes: Optional[int] = Field(default=None, ge=0)


class StorageQuotaConfigPayload(BaseModel):
    enabled: bool = True
    default_quota_bytes: Optional[int] = Field(default=None, ge=0)
    users: Dict[str, StorageQuotaUserConfigPayload] = Field(default_factory=dict)
