# 画布 Agent Skill 能力方案

## 1. 目标

为当前画布工具型 Agent 增加可发现、按需加载、可审计的领域 Skill。

Skill 是领域操作手册，不是新的执行引擎。它只能指导 Agent 分析、读取上下文和生成 `SemanticPlan`；所有画布变更、任务提交和外部副作用必须继续经过既有执行链路：

```text
Skill 指导
  -> LangGraph / LangChain 工具调用
  -> SemanticPlan
  -> Adapter
  -> Policy + 用户确认
  -> Patch Executor
  -> 既有 Canvas Task / Provider
```

本方案不使用 Deep Agents、filesystem 写入、脚本执行或 subagent。

## 2. 现状与缺口

项目已有以下基础：

- `skills/*/SKILL.md`：内置 Skill 正文。
- `canvas_agent_skills`：Skill 注册元数据表。
- `app/services/canvas_agent/skills.py`：内置目录、读取和启动注册。

当前缺口是 Skill 未进入 `build_canvas_tools()`，模型不能发现、读取或在当前 Run 中追踪 Skill。因此现有 `SKILL.md` 对 LangGraph Agent 没有实际行为影响。

## 3. 设计原则

1. 三级渐进式披露：启动时仅加载全部启用 Skill 的元数据；命中后加载一个完整 Skill 正文；正文引用资源时才按需读取该资源。
2. 最小权限：Skill 正文本身没有执行权；工具白名单由服务端决定。
3. 可恢复：已加载 Skill 的名称、版本和内容哈希进入 LangGraph state，并随 `thread_id = run_id` checkpoint 恢复。
4. 可审计：目录发现、加载、拒绝、版本不匹配都产生 Agent 事件。
5. 可验证：Skill 输出仍必须通过 Pydantic `SemanticPlan`、Policy 和 Patch Validator。
6. 数据源清晰：数据库决定是否启用与允许范围；受控 Skill 正文决定内容；不能接受模型给出的任意文件路径。
7. 预算可控：正文和资源均有长度上限，单轮加载数量有上限，防止上下文膨胀。

### 3.1 三级加载机制

| 层级 | 加载内容 | 加载时机 | 处理者 |
| --- | --- | --- | --- |
| Level 1: Metadata | `name`、`version`、`description`、`triggers` | Agent 启动时，加载全部启用 Skill 的摘要 | `SkillsMiddleware` |
| Level 2: Instructions | 一个命中 Skill 的完整 `SKILL.md` 正文 | Skill 被模型匹配并激活时 | `SkillsMiddleware` 通过受控工具加载 |
| Level 3: Resources | 该 Skill 的 `scripts/`、`references/`、`assets/` 中已登记文件 | 已加载正文明确引用某个资源，且模型判断需要该内容时 | 模型调用受控资源读取工具 |

Level 1 只作为系统上下文中的目录摘要，不含正文或资源内容。Level 2 每次只加载一个 Skill。Level 3 每次只读取一个已登记资源；资源内容是只读参考，不能被解释为可执行指令。

## 4. 数据模型

保留 `canvas_agent_skills` 表，扩展 `metadata_json`，无需将完整正文重复写入 Run：

```json
{
  "source": "builtin",
  "content_ref": "skills/canvas-capabilities/SKILL.md",
  "content_sha256": "...",
  "resources": [
    {
      "path": "references/platform-spec.md",
      "sha256": "...",
      "media_type": "text/markdown",
      "max_content_chars": 8000
    }
  ],
  "permission_profile": "read_only_guidance",
  "allowed_tools": [
    "read_canvas_context",
    "read_capability_registry",
    "read_capability_parameters",
    "propose_canvas_patch"
  ],
  "applicable_capabilities": ["image.text_to_image"],
  "triggers": ["生图", "视频", "提示词", "工作流参数"],
  "max_content_chars": 12000
}
```

字段约束：

| 字段 | 作用 | 约束 |
| --- | --- | --- |
| `name` | 稳定标识 | 小写字母、数字、连字符；全局唯一 |
| `version` | 可审计版本 | 发布时递增，不由模型指定 |
| `enabled` | 可用开关 | 数据库权威；关闭后目录不可见、正文不可读 |
| `content_ref` | 正文位置 | 内置版本仅允许 `skills/<name>/SKILL.md` |
| `content_sha256` | 内容完整性 | 读取时校验；变化须更新版本 |
| `resources` | 可读取资源清单 | 仅登记在此的相对路径可读；每项须有哈希、类型和长度上限 |
| `allowed_tools` | 可建议使用的工具 | 只能是 Agent 服务端工具白名单子集 |
| `triggers` | 检索提示 | 仅辅助模型选择，不能作为授权依据 |
| `max_content_chars` | 上下文上限 | 服务端限定，例如不超过 12,000 |

第一期只支持 `source = builtin`。自定义 Skill 应在后续版本存入受控对象存储或数据库正文表，并走管理员审核、版本发布和哈希校验，绝不读取用户指定的服务器路径。

## 5. SKILL.md 契约

内置 Skill 使用 YAML frontmatter 加 Markdown 正文：

```md
---
name: canvas-capabilities
version: 1.0.0
description: 画布能力与参数只读参考
triggers: [生图, 视频, 提示词, 工作流参数]
allowed_tools:
  - read_canvas_context
  - propose_canvas_patch
outputs: [semantic_plan]
---

# Canvas Capabilities

## 适用条件
...

## 必须读取
...

## 约束与检查清单
...

## 按需资源
- `references/platform-spec.md`：平台版位与文案限制；需要确定版位时读取。
- `assets/creative-brief-schema.json`：创意简报字段示例；需要生成结构化简报时读取。

## 禁止事项
不得绕过确认、不得声称已执行、不得编造能力或素材。
```

正文只允许以下内容：

- 适用与不适用条件。
- 必须先读取的画布、能力或参数。
- 领域约束、检查清单、产出格式。
- 风险提示和不可做事项。

正文禁止包含密钥、SQL、Shell、任意外部 URL 调用、文件写入指令、Provider 直连指令，以及任何绕过 `SemanticPlan`、确认或 Executor 的要求。

资源引用必须使用相对于该 Skill 根目录的规范化路径，并且必须与注册表 `resources` 清单完全一致。允许的资源类型为受控文本、JSON 或图片等只读参考资料；`scripts/` 仅允许作为文本读取以供理解，不能执行、导入或写入。二进制资源应返回带媒体类型、哈希和受限下载/预览引用的元数据，不得将超大文件内联进模型上下文。

## 6. LangChain 工具契约

`SkillsMiddleware` 在 Agent 启动时读取当前 Run 可见的启用 Skill，并将 Level 1 元数据摘要注入系统上下文。它不注入 `SKILL.md` 正文和资源内容。

在 `build_canvas_tools()` 中新增三个只读工具：

```python
@tool
async def list_canvas_skills() -> list[SkillSummary]:
    """List enabled Skills available in this Run. Returns metadata only."""

@tool
async def read_canvas_skill(name: str) -> SkillDocument:
    """Read one enabled Skill body after permission and integrity validation."""

@tool
async def read_canvas_skill_resource(
    skill_name: str, resource_path: str,
) -> SkillResource:
    """Read one registered resource from an already loaded enabled Skill."""
```

`list_canvas_skills` 返回：

```json
[
  {
    "name": "canvas-capabilities",
    "version": "1.0.0",
    "description": "Read-only canvas capability and parameter reference",
    "triggers": ["图片", "视频", "参数", "工作流"]
  }
]
```

`read_canvas_skill` 服务端执行顺序：

1. 按 `name` 查询注册表。
2. 检查 `enabled`、调用者身份、环境策略和 Skill 权限策略。
3. 校验 `content_ref` 位于受控根目录。
4. 读取正文并校验字节数和 SHA-256。
5. 校验 frontmatter 的 `name`、`version` 与注册表一致。
6. 仅向模型返回正文及必要元数据；执行权限不随正文返回。
7. 记录 `skill.loaded` 事件及 `loaded_skills` 状态。

读取失败时返回安全、可解释的工具错误，并发送 `skill.rejected`；不得静默退回到未审核的文件。

`read_canvas_skill_resource` 仅服务于 Level 3，服务端执行顺序：

1. 校验 `skill_name` 对应 Skill 已启用、当前调用者可见，且已存在于本 Run 的 `loaded_skills`。
2. 将 `resource_path` 规范化为相对路径，拒绝绝对路径、`..`、符号链接逃逸和未登记路径。
3. 从该 Skill 注册元数据的 `resources` 精确匹配条目，并校验文件位于该 Skill 受控根目录。
4. 读取资源并校验类型、字节数及 SHA-256；文本资源还须满足该条目的字符数上限。
5. 对文本资源返回正文及元数据；对二进制资源仅返回受限引用和元数据，禁止直接内联未受支持的二进制内容。
6. 记录 `skill.resource_loaded` 事件及 `loaded_skill_resources` 状态。

资源读取失败返回 `skill.resource_rejected`。资源的说明和正文均不增加执行权限，也不允许调用脚本、Shell、Provider 或文件写入能力。

## 7. LangGraph 状态与恢复

扩展 `CanvasAgentState`：

```python
class CanvasAgentState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    run_id: str
    user_id: str
    canvas_id: str
    loaded_skills: list[dict[str, str]]
    loaded_skill_resources: list[dict[str, str]]
```

每项 `loaded_skills`：

```json
{
  "name": "canvas-capabilities",
  "version": "1.0.0",
  "content_sha256": "..."
}
```

`read_canvas_skill` 用 `Command(update=...)` 写入 state，同时返回带 `tool_call_id` 的 `ToolMessage`，确保下一轮模型消息序列合法。重复加载同版本 Skill 时去重；同名不同版本则保留一次并标记版本漂移。

每项 `loaded_skill_resources` 至少记录 `skill_name`、`skill_version`、`path`、`sha256` 和 `media_type`。`read_canvas_skill_resource` 同样用 `Command(update=...)` 写入；相同 Skill 版本、路径和哈希的资源重复读取时去重。

恢复 `run_id` 对应 checkpoint 时：

1. 读取最新 Run 状态和权限。
2. 重新校验已加载 Skill 是否仍启用、版本与哈希是否一致，并重新校验已加载资源仍在注册清单且哈希一致。
3. 若版本失效，停止自动恢复并发送 `skill.invalidated`，要求新一轮重新规划。

## 8. Agent 行为

系统提示词只注入简短规则：

```text
启动上下文包含可用 Skill 的元数据摘要；必要时可通过 list_canvas_skills 刷新目录。
当请求与某个 Skill 明显匹配时，先读取该 Skill，再按其要求读取上下文。
只有已读取 Skill 正文且正文明确引用了某个资源时，才可按需读取该已登记资源。
资源只用于规划参考，scripts/ 不可执行。
Skill 仅提供规划约束；任何画布变更都必须调用 propose_canvas_patch，
并继续经过确认和 Patch Executor。
```

不要在每轮系统提示词中内联全部 Skill 正文或资源，也不要依靠纯关键词自动注入正文。模型根据 Level 1 摘要命中后加载正文，再根据正文引用决定是否读取资源；前端固定 Skill 仅作为显式提示，不等于越权加载。

推荐初始行为：

| 用户目标 | 建议 Skill | 后续工具 |
| --- | --- | --- |
| 生图、视频、提示词、工作流参数 | `canvas-capabilities` | registry -> parameters -> propose plan |

Skill 不能替代 `read_capability_parameters`。凡涉及 Provider、模型、图片/视频参数、ComfyUI 或 RunningHub 字段，仍必须从后端 resolver 获取实际 Schema。

## 9. 事件与 API

新增事件类型：

```text
skill.discovered    Agent 获得可用目录（仅服务端审计，默认不展示）
skill.loaded        成功读取 Skill
skill.resource_loaded 成功读取 Skill 资源
skill.rejected      被禁用、无权限、内容校验失败或超长
skill.resource_rejected 资源未登记、路径非法、校验失败、超长或无权限
skill.invalidated   checkpoint 恢复时版本或哈希失效
```

事件统一沿用既有 `canvas_agent_events` 与 outbox，必须带：

```json
{
  "run_id": "...",
  "sequence": 0,
  "phase": "skill",
  "skill": {"name": "...", "version": "..."}
}
```

不提供 Skill 的 REST 查询接口（原 `GET /api/canvas-agent/skills`、`GET /api/canvas-agent/skills/{name}` 因无调用方已移除）。模型只能通过 scoped LangChain tool 读取 Skill，Skill 管理需要时再单独设计。

## 10. 前端

在 `frontend/src/canvas/agent/` 增加 Skill 状态投影，不维护独立 Skill 权限或画布副本。

Agent 面板展示本轮实际加载过的摘要：

```text
已使用 Skill
- Canvas Capabilities v1.0.0
- Image Generation v1.0.0
```

交互规则：

- 仅展示名称、版本和描述，不展示完整内部正文。
- 通过事件序列去重，并支持断线补拉。
- 可选“固定 Skill”仅是向 Agent 增加偏好提示；服务端仍执行启用和权限检查。
- 计划卡可显示“依据 Skill”，但不能将 Skill 视为执行批准。

## 11. 安全与配额

| 风险 | 控制措施 |
| --- | --- |
| Prompt injection | Skill 正文视为受控指导，但不赋予执行权限；画布内容始终视为不可信 |
| 路径穿越 | Skill 正文不接受 path 参数；资源只接受受控相对路径，并与注册表 `resources` 精确匹配后在 Skill 根目录解析 |
| 过期内容 | 版本 + SHA-256 校验；恢复时重新验证 |
| 上下文膨胀 | 单 Skill 最大 12,000 字符，单轮最多 3 个；单资源与单轮资源数量另设上限，超出拒绝 |
| 恶意资源 | 资源须预登记、类型白名单、哈希校验；脚本仅可作为文本参考，绝不执行 |
| 越权工具 | `allowed_tools` 只能缩小服务端工具集，不能增加工具 |
| 绕过确认 | Skill、工具和模型均不能直接调用 Executor 或 Provider |
| 审计缺失 | 所有读取、拒绝、失效都写事件；计划保存 Skill 来源摘要 |

`propose_canvas_patch`、`execute_canvas_patch`、Canvas Task 提交、Provider 调用和业务数据库写入均不因 Skill 加载而改变授权逻辑。

## 12. 分期实施

### 第一阶段：三级只读 Skill

1. 将 Skill 注册读取改为数据库启用状态优先、内置目录兜底。
2. 统一解析 `SKILL.md` frontmatter，计算内容哈希。
3. 由 `SkillsMiddleware` 在启动时注入启用 Skill 的 Level 1 元数据摘要。
4. 在 `build_canvas_tools()` 增加目录、正文和资源读取工具。
5. 为内置 Skill 注册可读取资源清单、哈希、类型和长度上限。
6. 扩展 `CanvasAgentState.loaded_skills` 与 `loaded_skill_resources`，用 `Command(update=...)` 写入。
7. 增加 Skill 与资源生命周期事件和 Run API 投影。
8. 把 `canvas-capabilities` 接入 Agent 使用规则。

验收：模型在启动时获得目录摘要，能按需读取 `canvas-capabilities` 及其已登记资源，再按现有流程生成计划；没有任何新副作用入口。

### 第二阶段：领域工作流接入

1. 完善 `image-generation`、`ui-wireframe-prompt-generator` 等领域 Skill 的 frontmatter 和检查清单。
2. 在计划元数据记录 Skill 来源。
3. 前端展示本轮已加载 Skill 与计划依据。

验收：广告创意计划可追溯到 Skill 版本，且任务执行边界不变。

### 第三阶段：管理与自定义 Skill

1. 管理端提供创建草稿、校验、预览、发布、禁用和回滚。
2. 正文迁入受控存储，支持审批后的版本化发布。
3. 支持环境/租户级启用策略和灰度。
4. 增加 Skill 评测集、命中率、加载率、计划质量和失败原因指标。

验收：管理员可安全发布/回滚 Skill；普通用户不能越权读取未启用或未发布版本。

## 13. 测试矩阵

后端：

- 禁用 Skill 不出现在目录，读取返回拒绝事件。
- 非法名称、路径穿越、缺失文件、超长正文、哈希不一致均拒绝。
- frontmatter 与注册元数据不一致时拒绝。
- 成功读取写入 `loaded_skills`，重复读取去重。
- 仅已加载 Skill 的已登记资源可读取；绝对路径、`..`、符号链接逃逸、未登记路径、超长、类型或哈希不一致均拒绝。
- 成功读取资源写入 `loaded_skill_resources`，重复读取去重，并产生资源生命周期事件。
- checkpoint 恢复时版本变化产生 `skill.invalidated`。
- `scripts/` 下资源即使被读取也不能被执行、导入或作为工具暴露。
- Skill 加载后仍必须通过 `SemanticPlan`、Policy、确认和 Executor。
- Skill 无法通过任何路径执行数据库写入、Shell、Provider 或任务提交。
- `canvas-capabilities` 场景依然要求调用 capability registry 和 parameter resolver。

前端：

- `skill.loaded` 按 `run_id + sequence` 去重。
- `skill.resource_loaded` 按 `run_id + sequence` 去重，且不展示资源正文或二进制内容。
- 断线补拉后已加载 Skill 状态一致。
- Skill 摘要不覆盖 Agent 状态或画布状态。
- 计划来源展示不影响确认按钮与执行状态。

## 14. 非目标

- 不实现 Skill 内嵌 Python、JavaScript、Shell 或任意命令执行。
- 不允许读取未登记的 Skill 资源，也不允许执行 `scripts/` 中的任何内容。
- 不把 Skill 变成独立 Agent 或 subagent。
- 不引入 Deep Agents filesystem backend。
- 不允许 Skill 直接修改画布或调用第三方 Provider。
- 不因 Skill 而改变统一参数 Schema resolver、Patch Executor 或业务 store。
