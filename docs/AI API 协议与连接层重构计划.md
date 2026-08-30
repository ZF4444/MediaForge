# AI API 协议与连接层重构计划

## 1. 目的

本文档规划并记录 MediaForge 的 AI API 重构，使 GPT 对话、智能画布、画布 Agent 和后台 AI 任务共享一套清晰、稳定、可扩展的调用抽象。文档同时记录已落地的迁移基础、兼容边界和后续切流条件。

## 2. 目标

- 移除业务代码中的 `provider` 概念。
- 分离连接配置、协议适配、模型/工作流资源和业务能力。
- 统一 GPT 对话、画布和 Canvas Agent 的 AI 调用入口。
- 支持五类协议/执行方式：`openai`、`gemini`、`omnilojo`、`runninghub_app`、`comfyui_workflow`。
- 同一种协议支持多个独立连接。
- 保留旧 API 和旧数据的迁移期兼容能力。

## 3. 当前问题

当前 `provider` 记录同时承担平台身份、协议、Base URL、密钥、模型列表、模型级协议覆盖、RunningHub 应用、ComfyUI 配置、Omnilojo 计费以及任务路由/限流等职责。

现有代码还存在以下耦合：

- 通过 `provider.id` 推断协议，例如 `runninghub`、`volcengine`、`comfyui`。
- 通过 `model_protocols` 为单个模型覆盖协议。
- GPT 对话、图片生成、视频生成和 Canvas Agent 使用不同的 provider 解析路径。
- RunningHub 和 ComfyUI 被部分当成普通模型平台处理。
- 前端 API 设置页以 Provider 卡片为中心，连接、协议和资源混在一起。
- 使用量、权限、任务持久化、限流和熔断都以 `provider_id` 为核心字段。

## 4. 五类目标项的边界

这五项不完全属于同一层级：

| 项目 | 类型 | 说明 |
| --- | --- | --- |
| OpenAI | 模型 API 协议 | OpenAI-compatible 请求、聊天、模型发现 |
| Gemini | 模型 API 协议 | Gemini 原生请求和响应格式 |
| Omnilojo | 模型 API 协议 | 鉴权、用量和计费规则 |
| RunningHub RH 应用 | 远程应用执行协议 | 执行指定应用及输入字段 |
| ComfyUI 工作流 | 工作流执行协议 | 提交工作流、上传输入并轮询输出 |

因此不应把五项全部建模为“模型供应商”。目标结构是：

```text
业务能力 -> AI Gateway -> Connection -> Protocol Adapter -> 上游服务
```

## 5. 目标领域模型

### 5.1 Protocol

协议是固定的适配器类型：

```text
openai
gemini
omnilojo
runninghub_app
comfyui_workflow
```

协议声明能力，例如 `chat`、`stream_chat`、`structured_output`、`tool_calling`、`generate_image`、`generate_video`、`list_models`、`run_app`、`run_workflow`。

业务模块不得自行根据协议拼接 URL、Header 或解析响应。

### 5.2 Connection

Connection 表示一个实际可使用的连接，不再叫 Provider：

```json
{
  "id": "openai-main",
  "protocol": "openai",
  "name": "主 OpenAI 接口",
  "base_url": "https://api.example.com/v1",
  "secret_ref": "ai_secret_xxx",
  "enabled": true
}
```

### 5.3 Model

模型显式绑定 Connection，不再通过模型名或 `model_protocols` 猜协议：

```json
{
  "id": "gpt-5.5",
  "connection_id": "openai-main",
  "kind": "chat",
  "alias": "GPT 5.5",
  "enabled": true
}
```

同名模型如果属于不同连接，应是不同的模型资源记录。

### 5.4 RunningHub App 和 ComfyUI Workflow

RunningHub 应用、ComfyUI 工作流都是独立资源，分别绑定 `connection_id`，拥有自己的输入/输出 schema，不参与普通模型列表和聊天模型选择。

## 6. 统一 AI Gateway

所有业务模块只依赖能力接口：

```python
await ai_gateway.chat(request)
await ai_gateway.stream_chat(request)
await ai_gateway.generate_image(request)
await ai_gateway.generate_video(request)
await ai_gateway.run_runninghub_app(request)
await ai_gateway.run_comfyui_workflow(request)
```

Gateway 负责权限、资源解析、适配器选择、超时、重试、限流、熔断、取消、trace ID、审计、用量和统一错误转换。

业务层不得直接调用 `httpx`、读取 API Key 或拼接上游地址。

## 7. 三类业务的目标调用方式

### GPT 对话

```text
GPT 对话 -> chat / stream_chat -> connection_id + model_id -> 适配器
```

Canvas Agent 复用同一聊天接口，只额外传递 tools、结构化输出 schema、上下文、trace ID 和取消信号。

### 画布

```text
聊天节点       -> chat
图片模型节点   -> generate_image
视频模型节点   -> generate_video
RH 应用节点    -> run_runninghub_app
Comfy 节点     -> run_comfyui_workflow
```

画布任务持久化保存 `connection_id`、`model_id` 或 `resource_id`，不再保存 provider 对象快照。

### Canvas Agent

模型解析器从：

```python
resolve_canvas_agent_model(provider, model)
```

迁移为：

```python
resolve_agent_model(model_id, connection_id="")
```

Agent 运行时只接收统一的 ChatModel 接口，不知道底层协议。

## 8. 字段迁移和兼容

新字段：

```text
connection_id
model_id
resource_id
protocol
```

迁移期后端同时接受 `connection_id` 和旧 `provider_id`，优先使用新字段；没有新字段时将旧 ID 映射为兼容 Connection，并记录迁移日志。旧字段不得再进入新模块。

迁移完成后删除或封存：

- `model_protocols`
- `effective_protocol`
- 通过 ID 猜协议的逻辑
- 业务层的 `get_api_provider` 和 `normalize_provider`
- 以 provider 为核心的新 API 和新指标

## 9. 分阶段实施计划

### 阶段 0：契约冻结和现状盘点

盘点 GPT 对话、画布节点、Canvas Agent、RunningHub、ComfyUI、模型发现、连接测试、权限、用量、限流和审计链路。产出五协议能力矩阵、统一请求/响应契约、字段映射表，以及 Volcengine 处理决定。

### 阶段 1：建立协议适配层

建议目录：

```text
app/ai/
  contracts.py
  gateway.py
  connections.py
  errors.py
  protocols/
    openai.py
    gemini.py
    omnilojo.py
    runninghub_app.py
    comfyui_workflow.py
```

先让旧业务通过 Gateway 调用，暂不改变数据库和前端。

### 阶段 2：配置和密钥迁移

将现有配置拆分为 `ai_connections`、`ai_models`、`runninghub_apps`、`comfyui_workflows`。密钥统一使用 `secret_ref` 和集中密钥存储，旧 `api_providers` 作为只读兼容视图保留。

### 阶段 3：迁移 GPT 对话

迁移聊天模型解析、流式输出、模型权限、Omnilojo 用量和历史消息来源字段。完成后 GPT 对话不得直接访问 provider 配置。

### 阶段 4：迁移画布和任务队列

迁移图片、视频、RH 应用和 ComfyUI 工作流节点。任务队列改存新资源字段，并支持旧任务读取 `provider_id`。

### 阶段 5：迁移 Canvas Agent

迁移 Agent model resolver、Planner、结构化输出、工具调用、取消和重试链路，确保 Agent 与 GPT 对话使用同一个 Chat Gateway。

### 阶段 6：迁移前端设置页

页面拆分为“AI 连接、模型、RunningHub 应用、ComfyUI 工作流”。删除 Provider 卡片、模型级协议选择和通过 ID 猜协议的逻辑；旧 `/api/providers` 保留兼容别名。

### 阶段 7：删除兼容层

确认新请求不再依赖 `provider_id`、历史任务可读取、前端不再请求旧接口、配置迁移和回滚演练完成，并且旧字段使用量连续一个发布周期为零后，再删除兼容代码。

## 10. Volcengine 处理建议

当前实现仍包含 Volcengine/Ark 视频、模型和素材库逻辑，而目标五协议未包含它。建议第一阶段保留为隐藏兼容适配器，不进入新协议选择 UI；确认业务不再使用后，再决定迁移到 OpenAI-compatible、作为扩展协议保留，或彻底删除。未决定前不应直接删除相关字段、密钥和任务处理逻辑。

## 11. 验收标准

- GPT 对话、画布和 Canvas Agent 均通过同一个 AI Gateway 发起 AI 请求。
- 业务模块不再根据协议拼接请求或解析上游响应。
- 同一种协议可以配置多个 Connection。
- 模型、RH App、ComfyUI Workflow 类型清晰可区分。
- 迁移期旧 `provider_id` 仍可工作并产生迁移日志。
- 限流、熔断、重试、取消、审计和用量统计统一生效。
- 五种协议及两类工作流执行器均有独立适配器测试。
- Canvas Agent 支持统一的流式、工具调用和结构化输出契约。
- 完成配置迁移、历史任务读取和回滚演练。

## 12. 待确认决策

1. Volcengine 是保留为隐藏兼容协议，还是彻底移除。
2. 是否接受 `Connection / Model / Resource / Capability` 四层模型。
3. 是否允许同一种协议配置多个连接。
4. 旧 `/api/providers` 兼容接口保留几个版本周期。
5. RunningHub 和 ComfyUI 是否都纳入统一任务队列。

## 13. 结论

不应把 `provider` 简单替换成 `protocol`。推荐移除 Provider 作为业务领域对象，采用：

```text
业务能力 -> AI Gateway -> Connection -> Protocol Adapter -> 上游服务
```

这样 GPT 对话、画布和 Canvas Agent 可以共享统一的模型调用、错误处理、限流、审计和用量能力，同时保留 RunningHub 应用和 ComfyUI 工作流的专有执行语义。

---

## 14. 实施约束与非目标

本计划是一次内部架构迁移，首要原则是外部行为不变。

### 14.1 必须保持不变的契约

- 根入口继续为 `main:app`；现有启动方式、认证中间件和静态页面不变。
- 当前请求字段 `provider_id`、`provider`、`model`、`ms_model` 及现有响应字段、状态码、SSE 事件格式在兼容期不变。
- 现有路由路径继续可用：`/api/providers`、`/api/chat`、`/api/chat/stream`、`/api/chat/agent`、`/api/canvas-llm`、`/api/canvas-image-tasks`、视频与模型发现接口。
- `APP_SECRET_KEY` 启用时，密钥继续仅从加密密钥存储读取；未启用时继续兼容 `API/.env`。
- `provider_operation()` 的并发、Redis 限流、熔断和 Prometheus 指标语义不变。
- 运行中的画布任务、历史对话和旧版前端可继续读取和提交。

### 14.2 本轮非目标

- 不改变任一上游平台的请求参数、超时、轮询间隔或重试策略。
- 不在第一阶段更换数据库表结构或删除 `api_providers`。
- 不把前端设置页改造成新页面；先保持 Provider UI 和 API，内部映射至新领域对象。
- 不合并 RunningHub App 与普通图片/视频模型，也不把 ComfyUI 伪装为聊天模型。
- 不进行大规模代码格式化或无关模块迁移。

## 15. 当前到目标的映射

### 15.1 术语映射

| 当前概念 | 迁移期概念 | 目标概念 | 说明 |
| --- | --- | --- | --- |
| `ApiProviderPayload` / `api_providers` 项 | Legacy Provider | Connection + 资源集合 | 保留旧配置格式，通过仓库投影为目标对象。 |
| `provider.id` | `legacy_provider_id` | `connection_id` | 不再用 ID 名称推断协议。 |
| `image_models` / `chat_models` / `video_models` 字符串数组 | Legacy model name | Model Resource | 每一个模型有稳定资源 ID、连接归属与能力类型。 |
| `model_protocols` | 兼容覆盖 | Model.protocol | 完成回填后不再保留覆盖表。 |
| RunningHub workflow/app 配置 | Legacy app config | Executable Resource | 与模型资源隔离。 |
| ComfyUI workflow | Workflow config | Executable Resource | 与 Connection 关联但不参与模型发现。 |

### 15.2 协议决策

目标支持的适配器集合为 `openai`、`gemini`、`omnilojo`、`runninghub_app`、`comfyui_workflow`，并增加一个过渡协议 `volcengine`。

`volcengine` 不能在未完成业务确认前删除：当前它具有 Ark 任务提交、素材资产、视频轮询与 OpenAI 兼容聊天的专有逻辑。它在新层中作为独立 Adapter 实现，默认不出现在新增连接引导中；后续再依据实际使用数据决定保留或下线。

### 15.3 端点迁移映射

| 现有入口 | 当前主要实现 | 迁移后薄路由调用 | 适配器能力 |
| --- | --- | --- | --- |
| `POST /api/chat` | `build_chat_text_reply` | `ai_gateway.chat` | `chat` |
| `POST /api/chat/stream` | 路由内 `httpx.stream` | `ai_gateway.stream_chat` | `stream_chat` |
| `POST /api/canvas-llm` | `_canvas_llm_impl` | `ai_gateway.chat` | `chat` |
| Canvas Agent | `MediaForgeChatModel` | `GatewayChatModel` | `chat`、`tool_calling` |
| 在线生图/画布图片 | `generate_ai_image` | `ai_gateway.generate_image` | `generate_image` |
| 画布视频 | 视频生成 helpers | `ai_gateway.generate_video` | `generate_video` |
| RunningHub 运行 | RunningHub helpers | `ai_gateway.run_app` | `run_app`、`poll_task` |
| ComfyUI 工作流 | ComfyUI helpers | `ai_gateway.run_workflow` | `run_workflow` |
| Provider 连接测试/模型拉取 | `main.py` 探测 helpers | `connection_service.probe/discover` | `probe`、`list_models` |

## 16. 目标模块与依赖方向

目标目录在不改变根 `main.py` 入口的前提下建立。`main.py` 只保留应用装配、旧路由兼容包装和尚未迁移的领域。

```text
app/ai/
  contracts.py              # 不依赖 FastAPI/httpx 的请求、结果、错误数据类型
  domain.py                 # Connection、Model、ExecutableResource、Capability
  errors.py                 # 上游错误到稳定领域错误的转换
  repository.py             # 配置读取、兼容投影、版本与密钥引用
  resolver.py               # 资源选择、权限前的归属/能力校验
  gateway.py                # 治理与统一能力入口；保留 provider_operation
  adapters/
    base.py                 # Adapter Protocol 和能力声明
    openai.py
    gemini.py
    omnilojo.py
    volcengine.py
    runninghub.py
    comfyui.py
  services/
    chat.py                 # 会话调用、SSE 转换、消息/多模态规整
    images.py               # 图像请求与结果规范化
    videos.py               # 视频提交、轮询、媒体归档
    discovery.py            # 连接探测和模型发现
  compatibility/
    providers.py            # legacy provider -> Connection/Model 投影
    requests.py             # provider_id/model 与新 ID 的双读解析
  routers/
    ai.py                   # 新路由；仅在迁移完成后承接已有路由实现
```

依赖必须单向：`routers -> gateway/services -> resolver/repository/adapters -> core`。`adapters` 不得导入 `main`、路由或 Canvas Agent；`services` 不得读环境变量或直接查密钥；业务层不得直接使用 `httpx` 调用上游。

为避免当前 `from main import ...` 的反向依赖，以下迁移应优先完成：

| 当前反向依赖 | 替换依赖 |
| --- | --- |
| `canvas_agent/model_resolver.py -> resolve_chat_provider` | `app.ai.gateway.resolve_chat_model` |
| `canvas_agent/task_dispatch.py -> get_api_provider/require_model_access` | `app.ai.resolver.resolve_model`、`app.ai.gateway.authorize` |
| `canvas_agent/capabilities.py`、`planner.py -> load_api_providers` | `app.ai.repository.list_resources` |
| `provider_parameters/resolver.py -> load_api_providers` | `app.ai.repository.list_legacy_projection` |

## 17. 核心接口定义

以下类型是模块边界，不要求首阶段替换 HTTP 请求模型。具体字段可用 `dataclass` 或 Pydantic 实现，但必须保持语义。

```python
@dataclass(frozen=True)
class ResolvedTarget:
    connection_id: str
    protocol: str
    model_id: str | None
    upstream_model: str | None
    resource_id: str | None
    capabilities: frozenset[str]

@dataclass(frozen=True)
class ChatCommand:
    target: ResolvedTarget
    messages: list[ChatMessage]
    stream: bool = False
    tools: list[dict] | None = None
    response_format: dict | None = None
    idempotency_key: str = ""

@dataclass(frozen=True)
class ImageCommand:
    target: ResolvedTarget
    prompt: str
    size: str
    quality: str
    references: list[MediaReference]
    idempotency_key: str = ""
```

Gateway 的唯一公开能力接口：

```python
class AIGateway(Protocol):
    async def chat(self, command: ChatCommand, *, actor: Actor) -> ChatResult: ...
    async def stream_chat(self, command: ChatCommand, *, actor: Actor) -> AsyncIterator[ChatEvent]: ...
    async def generate_image(self, command: ImageCommand, *, actor: Actor) -> ImageResult: ...
    async def generate_video(self, command: VideoCommand, *, actor: Actor) -> VideoTaskResult: ...
    async def run_app(self, command: AppCommand, *, actor: Actor) -> TaskResult: ...
    async def run_workflow(self, command: WorkflowCommand, *, actor: Actor) -> TaskResult: ...
```

每个 Adapter 必须声明能力并只接受已解析的 `ResolvedTarget`。Gateway 在调用 Adapter 前完成权限、预算、并发、限流、熔断、trace、审计与超时配置；Adapter 只做协议转换、上游 HTTP 调用、响应规范化和可恢复任务信息提取。

## 18. 数据、密钥与兼容设计

### 18.1 迁移期存储策略

第一阶段不新建业务表。`app_settings.api_providers` 仍是唯一写入源，`ProviderRepository` 将其转换为内存中的 Connection 和 Model Resource：

```text
legacy provider p
  -> connection id: legacy:p.id
  -> model id: legacy:p.id:chat:<escaped-name>
  -> model id: legacy:p.id:image:<escaped-name>
  -> model id: legacy:p.id:video:<escaped-name>
```

新内部代码只使用投影后的 ID；HTTP 兼容层接收旧字段后执行转换。这样可先消除运行期耦合，再进行数据库迁移。

第二阶段新增版本化数据模型或等价的 `app_settings` 分区：`ai_connections`、`ai_models`、`ai_resources`。迁移脚本必须幂等，并保存以下可逆映射：

```text
legacy_provider_id -> connection_id
(legacy_provider_id, kind, model_name) -> model_id
workflow/app legacy ID -> resource_id
```

在一个完整发布周期内，配置 API 采用双写：目标存储写成功后生成旧 `/api/providers` 兼容视图。任何一边失败都必须整体失败，不得出现元数据已更新而密钥/投影不同步。

### 18.2 密钥边界

- `secret_ref` 是 Connection 的唯一密钥引用；Adapter 不得读取 `os.environ`。
- Repository/Secret service 是唯一可以读取 `provider_secrets` 或 `.env` 兼容层的位置。
- API 响应只返回 `has_key`、`key_preview` 和密钥引用状态，绝不返回原文。
- 迁移完成前保留当前 `provider_env_key_value()`，但把它降级为 Legacy Secret Resolver 内部实现。

### 18.3 请求和任务双读

兼容解析优先级固定如下：

1. 显式 `model_id` / `resource_id`；
2. 显式 `connection_id` 加 `model`；
3. 旧 `provider_id` 或 `provider` 加 `model`；
4. 仅旧模型名时按当前首选连接选择，且记录 warning/audit。

画布任务新增字段时不得删除旧字段。读取任务时优先新字段；若只有 `provider_id`，在 worker 执行前解析并回填新引用。回填失败必须保留原始任务并以可读错误终止，不得静默切换到其他连接。

## 19. 分阶段执行清单

每阶段都是一个或多个可独立回滚的提交。下一阶段的前提是上一阶段的回归与灰度指标均通过。

### 阶段 A：建立安全网与基线

1. 扩充现有测试，冻结 Provider 配置、聊天、SSE、图片、视频、模型发现和错误映射的请求/响应契约。
2. 为 `resolve_chat_provider`、`api_headers`、`effective_protocol`、URL 生成与模型选择写表驱动测试，覆盖全部协议及空配置、禁用配置、缺密钥场景。
3. 将现有可观测性基线记录为每协议的成功率、延迟、429、5xx、熔断和任务恢复数量。
4. 建立 Mock 上游，确保迁移测试不触发计费 API。

完成条件：现有 `tests/test_provider_api.py`、`test_ai_gateway.py`、`test_canvas_agent_*` 及新增契约测试通过；路由、schema 快照无变化。

### 阶段 B：引入纯领域模型与 Legacy Repository

1. 新建 `app/ai/domain.py`、`contracts.py`、`repository.py` 和 `compatibility/providers.py`。
2. 从 `main.py` 提取无副作用的 Provider 规整、协议解析和默认值逻辑；迁移前后用相同样例对比输出。
3. Repository 读取当前缓存/配置，产出 Connection 与 Model Resource，不修改保存 API。
4. `app/ai/gateway.py` 保持现有治理功能，增加接收目标 ID 的内部入口但不改调用方。

完成条件：新 Repository 的 Legacy 投影与 `/api/providers` 返回的启用状态、模型集合、Base URL 和有效协议逐项一致。

### 阶段 C：抽取 Adapter，先迁移图片

1. 将 OpenAI、Gemini、Omnilojo、Volcengine、RunningHub 的图片实现从 `main.py` 迁入 `app/ai/adapters/`。
2. 图片 adapter 的每一个请求必须保留当前 URL、Header、multipart/body、超时与任务轮询行为。
3. `generate_ai_image()` 改为兼容包装，内部委托 `ai_gateway.generate_image()`。
4. 用录制的成功、异步任务、编辑、错误和内容审核响应建立 adapter 契约测试。

完成条件：`/api/canvas-image-tasks`、在线生图、GPT Agent 生图均经 Gateway；原 `IMAGE_ADAPTERS` 可删除或仅作为新 Registry 的兼容别名。

### 阶段 D：迁移聊天和流式聊天

1. 实现 `OpenAIChatAdapter`、`GeminiChatAdapter` 与 Omnilojo 用量挂钩；Volcengine 走显式 adapter，不依赖 ID 判断。
2. 统一消息规整：系统提示、文本、多模态图片、工具调用、usage、finish reason 和上游 request ID。
3. `POST /api/chat`、`/api/chat/stream`、`/api/canvas-llm` 改为调用相同 Gateway；路由保留会话存取和 SSE 外壳。
4. `MediaForgeChatModel` 重命名或替换为 `GatewayChatModel`，只依赖 Gateway，不再 `from main import`。

完成条件：非流式文本、流式事件顺序、图片附件、Omnilojo usage、错误中文映射与当前测试基线完全一致。

### 阶段 E：迁移视频、RunningHub 和 ComfyUI

1. 为视频 adapter 规范化提交结果、上游任务 ID、轮询、取消能力和最终媒体引用。
2. RunningHub Adapter 单独实现上传、应用运行、查询和输出解析，保留现有预算校验。
3. ComfyUI Adapter 只承担工作流执行，不参与聊天模型解析或 `/v1/models`。
4. 画布 worker 根据 `resource_id` 调用 Gateway；旧任务通过兼容解析执行并回填引用。

完成条件：重启/接管后的任务可依据 Adapter 声明决定轮询恢复、标记 interrupted 或进入死信；不得盲目重投可能计费的请求。

### 阶段 F：配置仓库与前端迁移

1. 新建 Connection/Model/Resource 写模型与数据库迁移，导入现有 Provider 配置。
2. `/api/providers` 继续提供 Provider 兼容视图；新增内部或管理 API 使用 Connection/Model 语义。
3. 前端先继续使用旧接口；待后端稳定后，分步骤把 API 设置页改为“连接、模型、执行资源”三个编辑区域。
4. 设置页保存应使用单个版本号 CAS，密钥更新和元数据更新拥有同一事务边界。

完成条件：新旧入口读到相同配置；并发保存仍返回 `409`；回滚到旧版本时旧页面仍能正确读取配置。

### 阶段 G：清理兼容层

1. 统计旧字段、旧路由和 `from main import` 的调用量。
2. 连续一个发布周期没有旧字段写入，且历史任务回填率达到 100% 后，停止双写。
3. 删除 `model_protocols`、通过 Provider ID 推断协议、旧 Adapter 分支和仅用于兼容的全局变量。
4. 将 `/api/providers` 标记为弃用后，再按版本策略删除。

完成条件：业务模块、Agent、worker、参数解析器均不导入 `main.py` 的 AI helper；`main.py` 不再包含上游 API 请求实现。

## 20. 测试、观测与发布门槛

### 20.1 测试矩阵

| 层级 | 必测内容 |
| --- | --- |
| Domain/Repository | Legacy 投影、模型解析优先级、禁用/缺密钥/权限拒绝、配置版本冲突。 |
| Adapter | URL、鉴权、请求体、multipart、响应解析、分页、异步任务、超时、429/5xx。 |
| Gateway | 限流、熔断、并发、预算、审计、idempotency key、错误归一化。 |
| Route | HTTP 状态、响应 schema、SSE event 序列、旧字段兼容。 |
| Worker | 任务回填、租约接管、取消、死信、可恢复与不可恢复上游任务。 |
| E2E | Chat、图片、视频、RunningHub、ComfyUI、Canvas Agent 各至少一条 Mock 上游路径。 |

### 20.2 灰度顺序

新实现以 feature flag 按能力开启：`AI_GATEWAY_IMAGES_V2`、`AI_GATEWAY_CHAT_V2`、`AI_GATEWAY_VIDEO_V2`、`AI_CONNECTIONS_V2`。默认关闭；每次只打开一个协议加一个能力面，并保留旧路径作为紧急回退。

灰度期间每次请求记录 `implementation=legacy|gateway_v2`、`connection_id`、`protocol`、`capability`、`upstream_status` 和脱敏错误分类。不得记录提示词原文、密钥或媒体内容。

### 20.3 Go/No-Go 标准

- 所有契约测试、路由快照、schema 快照和对应 worker 测试通过。
- 灰度流量下新旧实现的成功率、状态码分布和 P95 延迟没有超出预先定义的容差。
- 不出现重复计费、跨用户结果泄露、明文密钥日志或因配置变更导致的跨进程不一致。
- Redis 不可用、上游超时、错误响应、取消和 worker 接管均有自动化覆盖。
- 每个阶段均完成一次回退演练：关闭 feature flag 后新建请求立即回到旧实现，已创建任务仍由其创建时的实现可读、可查询。

## 21. 交付物与责任边界

| 交付物 | 完成阶段 | 责任边界 |
| --- | --- | --- |
| 领域模型、Legacy Repository、兼容解析器 | B | 仅配置读取和资源解析，不做 HTTP。 |
| Adapter 契约与实现 | C-E | 仅协议转换和上游交互。 |
| Gateway 能力服务 | C-E | 治理、授权、审计、调度，不包含路由/页面逻辑。 |
| 薄路由与 Agent ChatModel | D-E | HTTP/SSE、会话编排、LangChain 接口适配。 |
| 数据迁移与双写 | F | 版本化配置、密钥引用、回滚。 |
| 前端设置页演进 | F | 仅消费稳定管理 API，不包含上游协议判断。 |

## 22. 首个实施批次

首批只做阶段 A 和 B，范围严格限定为新增模块和测试，不改变任何线上调用路径：

1. 新建 `app/ai/domain.py`、`contracts.py`、`repository.py`、`compatibility/providers.py`。
2. 为 Legacy Provider 到 Connection/Model Resource 的投影建立单元测试与样例夹具，覆盖 OpenAI、Gemini、Omnilojo、RunningHub、ComfyUI、Volcengine 和自定义 Provider。
3. 为当前 `resolve_chat_provider()`、`api_headers()`、图片 Adapter 选择补齐表驱动回归测试。
4. 只在 Canvas Agent 的模型列表读取路径做只读试接入，并以日志比较新旧解析结果；不切流。

首批验收后，再开始图片 Adapter 迁移。这样可以先验证目标数据模型和依赖方向，避免在没有安全网的情况下直接移动计费调用。

## 23. 实施状态（2026-08-30）

本次已完成阶段 A/B 的可执行基础，并提前完成 Canvas Agent 的最小双读入口；尚未开启任何付费上游请求路径的切流。

- 已新增 `app/ai/domain.py`、`contracts.py`、`repository.py` 与 `runtime.py`。Legacy Provider 会被只读投影为稳定的 `legacy:<provider>` Connection、模型资源和 RunningHub App 资源。
- 已新增 `GET /api/ai/resources`，只返回脱敏后的 Connection/Model/Resource 选择信息；旧 `/api/providers` 的读写契约未改变。
- Canvas Agent 请求支持可选 `model_id`，优先解析稳定模型资源 ID，旧 `provider + model` 仍然可用；该 ID 会在同一 Run 的回答与确认执行阶段持续保存和复用。
- Canvas Agent、Provider 参数解析器不再直接导入 `main.py` 的 AI helper。迁移期使用窄运行时端口承接现有模型授权、预算、参数归一化和媒体引用逻辑，保持原有鉴权与队列行为。
- 新增 Legacy 投影、资源 ID 解析、资源发现接口和 Canvas Agent 兼容路径回归测试；未接触密钥存储格式、`api_providers` 写入格式或前端 Provider 设置页。
- 图片调用编排已迁入 `LegacyImageGateway`：`generate_ai_image()` 仅保留兼容包装，Provider 解析、预算校验、治理和 Adapter 分发由 Gateway 统一承担；各协议的 HTTP 请求、超时和异步轮询仍保持原实现，待契约测试补齐后再逐个迁出。
- 普通非流式文本聊天已接入 `LegacyChatGateway`：`build_chat_text_reply()` 继续负责会话历史、错误中文化和 Omnilojo 用量记录，Gateway 负责 Provider 兼容解析、模型授权、预算校验、治理和上游 Chat Completions 请求；请求超时复用 `AI_REQUEST_TIMEOUT`。图片聊天 Agent 的意图路由也已复用该 Gateway，Canvas Agent 仍保留原 LangChain 链路。
- 流式文本聊天已接入 `LegacyChatGateway.stream_chat()`；Gateway 负责连接解析、授权、预算、治理和 SSE 上游读取，路由继续负责增量解析、事件格式、会话落库与用量记录。
- 视频入口已接入 `LegacyVideoGateway`；视频协议提交、轮询和媒体落库仍保留在现有适配器中，但模型授权、预算、治理和协议分发已统一。`CanvasVideoRequest` 支持 `model_id`，显式传入时会解析为兼容连接与模型。
- Canvas LLM 和图片聊天会话的文本分支已复用 `LegacyChatGateway`；业务层仅负责媒体预处理、SSE/响应解析、会话落库及用量记录。
- Canvas Agent 的上游重试与 HTTP 传输已下沉到 `app.ai.chat.complete_with_retry()`；`MediaForgeChatModel` 仅保留 LangChain 消息/工具调用转换和响应映射，后续可无缝替换为正式 `GatewayChatModel`。
- Canvas Agent 模型已正式命名为 `GatewayChatModel`，保留 `MediaForgeChatModel` 兼容别名；新增 `app/ai/adapters/base.py` 与 `legacy.py`，为具体协议 Adapter 提供稳定契约和迁移期包装。
- OpenAI-compatible Chat 已迁入 `app/ai/adapters/openai.py`，Legacy Chat Gateway 对 OpenAI 协议优先使用独立 Adapter，其他协议继续走兼容分支，便于逐协议灰度和回滚。
- Gemini 与 Omnilojo Chat 已分别建立显式 Adapter（`app/ai/adapters/gemini.py`、`omnilojo.py`），Gateway 按解析后的协议选择 Adapter；当前仍复用既有兼容端点和鉴权语义，尚未完成各协议原生响应模型的独立实现。
- 已新增 `RunningHubAppAdapter` 与 `ComfyUIWorkflowAdapter`，通过 `AppCommand/WorkflowCommand` 接收统一执行请求；两者均采用回调注入旧任务提交/轮询逻辑，避免适配器反向依赖 `main.py`，并已覆盖资源类型校验和任务查询测试。
- 已新增 `ResourceGateway`，统一执行资源解析、适配器选择、治理计量和 `run_app/run_workflow` 入口；现有路由可通过注入 Resolver 与旧任务回调逐步切流。
- 已增加 `AI_PROVIDER_COMPAT` 最终切换开关：最终版本默认 `0`，旧 `/api/providers` 读写、探测和模型发现接口返回 `410`；仅需要临时回滚时显式设置为 `1`，不涉及数据库回滚。
- 新增只读门禁脚本 `scripts/validate_ai_final_cutover.py`。生产删除兼容代码前运行该脚本；它校验新表、孤儿资源、映射完整性、旧 `api_providers` 配置是否仍存在以及兼容开关状态，任一条件不满足即返回非零。
- 已新增 Feature Flag 基础（`AI_GATEWAY_CHAT_V2`、`IMAGES_V2`、`VIDEO_V2`、`WORKFLOWS_V2`、`CONNECTIONS_V2`）和 `/api/ai/status` 状态接口；新增 `ConnectionDiscoveryService` 与 `/api/ai/connections/{connection_id}/discover`，新客户端可基于稳定 Connection ID 执行模型发现。
- 已在业务元数据初始化 SQL 中加入 `ai_connections`、`ai_models`、`ai_resources`、`ai_legacy_mappings` 四张幂等表，并提供管理员专用 `/api/ai/resources/sync-legacy` 导入接口；当前仍由 `api_providers` 作为事实写入源，尚未开启双写。
- 新增只读资源管理接口：`GET /api/ai/connections`、`GET /api/ai/models`、`GET /api/ai/executable-resources`，支持按类型和连接过滤，供前端分阶段切换；旧 Provider 设置接口仍保留。
- 新增管理员迁移状态接口 `GET /api/ai/migration-status`；`AI_CONNECTIONS_V2=1` 时 Provider 保存会触发新资源表同步，默认关闭并保留旧写入源，便于灰度和回滚。
- Canvas 任务 worker 已实现资源双读：优先 `model_id/connection_id/resource_id`，旧任务在执行前解析并回填稳定引用；解析失败进入明确失败状态，不会静默切换到其他连接。
- Legacy Provider 读取接口已增加 `Deprecation`、`Sunset` 和 successor `Link` 响应头；新资源同步会保留模型级协议覆盖，避免 `model_protocols` 在迁移中丢失。
- 工作流资源已纳入 Legacy Repository 投影，`WorkflowRunRequest` 的 `resource_id/connection_id` 会在执行前校验 ComfyUI 资源归属，并写入生成任务参数供后续任务回填使用。
- 画布图片任务创建已保存 `connection_id/model_id` 快照（批任务父子任务均保存），旧 `provider_id/model` 字段继续保留供现有 worker 读取。

当前未完成的阶段 C-G 包括：将各协议的 HTTP 实现真正迁出 `main.py`、Canvas Agent 统一切换、工作流任务资源字段写入专用数据库列、Connection/Model/Resource 持久化与双写、前端设置页拆分，以及旧 Provider 兼容层下线。这些阶段需要独立数据库迁移和灰度发布，不能直接删除现有兼容路径。

## 24. 发布迁移与落盘执行手册

本节是代码迁移完成后的实际发布流程。数据库切换、配置双写、前端切换和兼容层删除必须分阶段执行，每一步都保留可回滚路径。

### 24.1 发布前检查

确认 PostgreSQL、Redis、对象存储和任务 Worker 均可用，并完成数据库备份、Provider 配置导出和当前 `api_providers` 版本记录。首个发布默认关闭所有新实现开关：

```env
AI_CONNECTIONS_V2=0
AI_GATEWAY_CHAT_V2=0
AI_GATEWAY_IMAGES_V2=0
AI_GATEWAY_VIDEO_V2=0
AI_GATEWAY_WORKFLOWS_V2=0
```

### 24.2 数据库初始化与 Legacy 导入

部署后运行现有业务元数据初始化，幂等创建以下表：

```text
ai_connections
ai_models
ai_resources
ai_legacy_mappings
```

由管理员调用：

```http
POST /api/ai/resources/sync-legacy
GET /api/ai/migration-status
```

检查每个启用连接、聊天/图片/视频模型、RunningHub App 和 ComfyUI Workflow 是否均有稳定 ID，并确认 `ai_legacy_mappings` 没有重复或缺失记录。

### 24.3 资源 API 验证

新客户端依次验证：

```http
GET /api/ai/connections
GET /api/ai/models?kind=chat
GET /api/ai/models?kind=image
GET /api/ai/models?kind=video
GET /api/ai/executable-resources?kind=runninghub_app
GET /api/ai/executable-resources?kind=comfyui_workflow
GET /api/ai/status
```

客户端选择和提交请求优先保存 `connection_id`、`model_id`、`resource_id`，旧 `provider_id` 仅作为兼容字段保留。

### 24.4 配置双写灰度

测试环境先开启：

```env
AI_CONNECTIONS_V2=1
```

保存一次连接、模型、协议覆盖、API Key、RunningHub App 和 ComfyUI Workflow 配置，然后对比新旧存储。必须验证版本冲突返回 `409`，新表写失败时旧配置不提交，密钥不会出现在响应或日志中。

发现投影失败时，关闭 `AI_CONNECTIONS_V2`，保留 `api_providers` 作为唯一事实源。

### 24.5 Gateway 灰度顺序

按以下顺序逐项开启，每次只开启一个能力面：

```text
Chat -> Image -> Video -> ComfyUI Workflow -> RunningHub -> Canvas Agent
```

对应开关为：

```env
AI_GATEWAY_CHAT_V2=1
AI_GATEWAY_IMAGES_V2=1
AI_GATEWAY_VIDEO_V2=1
AI_GATEWAY_WORKFLOWS_V2=1
```

每项至少观察成功率、4xx/5xx、429、P95 延迟、超时率、重试次数、usage 差异和重复计费。超过预设容差时立即关闭对应开关回退旧实现。

### 24.6 Worker 与任务验收

分别提交旧字段任务和新字段任务，确认 Worker 优先读取新资源字段；旧任务执行前解析并回填新引用。连接或资源不存在时必须明确失败，不得自动切换其他连接。重启、租约接管、取消、超时和死信任务都要完成一次演练。

### 24.7 前端切换

前端分三步发布：先只读新资源 API，再将选择值改为稳定资源 ID，最后切换保存接口。页面拆分为“AI 连接、模型、RunningHub 应用、ComfyUI 工作流”，旧 Provider 页面保留为只读回滚入口。

### 24.8 兼容层下线门槛

满足以下条件后才允许下线 Provider：

- 新字段稳定写入至少一个完整发布周期。
- 旧字段写入量为零，历史任务回填率达到 100%。
- 新旧配置读取结果一致。
- 前端不再请求 `/api/providers`。
- 所有 Worker 和 Agent 均支持新字段。
- 完成数据库恢复、Redis 不可用、Worker 接管和 Gateway 回滚演练。

### 24.9 分版本删除顺序

第一个版本将 `/api/providers` 改为只读并停止新增代码使用 Provider；第二个版本再删除 `model_protocols`、`effective_protocol`、`get_api_provider`、旧 Adapter 分支和 Provider 专用指标，最后删除 Legacy Repository 和旧配置分区。

### 24.10 最终切换脚本

最终切换必须配置稳定的 `APP_SECRET_KEY`（至少 16 个字符）。先执行只读门禁：

```bash
DATABASE_URL=... AI_PROVIDER_COMPAT=0 .venv/bin/python scripts/validate_ai_final_cutover.py
```

确认密钥已准备好后执行一次性迁移。脚本会创建 `ai_cutover_archive` 回滚归档，补齐历史任务的 `connection_id/model_id/resource_id`，改写画布节点模型引用，迁移加密密钥到 `ai_connection_secrets`，并删除 `app_settings.api_providers`：

```bash
DATABASE_URL=... APP_SECRET_KEY=... .venv/bin/python scripts/finalize_ai_cutover.py --apply
```

需要恢复旧配置时执行 `scripts/finalize_ai_cutover.py --rollback`；随后临时设置 `AI_PROVIDER_COMPAT=1` 并重启服务。切换完成后再次运行门禁，退出码必须为 `0`。
