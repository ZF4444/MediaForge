# Agent Skill 基础重构方案（参考 tau，当前实现状态）

## 1. 目标与范围

本次重构只解决 Skill 的基础使用闭环：

```text
发现 Skill -> 解析 SKILL.md -> 构建系统提示摘要 -> 命中后读取正文
-> 按需读取 Skill 目录内参考文件 -> 写入当前 Run 状态
-> 按既有画布规划、确认和执行链路继续处理
```

目标是让新增 Skill 不再需要修改 Python 注册代码，同时保持现有 Canvas Agent 的安全边界和 API 兼容性。

本次不实现 tau 中与 MediaForge 当前产品形态无关的能力：多层用户/项目资源覆盖、Skill 诊断流、TUI Skill Picker、Prompt Template、热重载、扩展插件、脚本执行、远程 Skill 市场和跨会话资源缓存。上述能力留作后续演进，不应提前引入抽象。

## 2. 现状评估

当前项目已经具备以下基础：

- `skills/<name>/SKILL.md` 目录结构。
- YAML frontmatter 解析、UTF-8 和内容长度校验。
- `canvas_agent_skills` 数据表及 `enabled` 开关。
- `read_canvas_skill`、`read_canvas_skill_file` 两个只读 Agent 工具。
- `loaded_skills` LangGraph 状态和 `skill.*` 事件。
- `GET /api/canvas-agent/skills` 及单 Skill 读取接口（已移除：前端和后端均无调用方，Agent 仅通过工具读取 Skill）。
- 独立的 `system_prompt.py`，按 section 组装工具、规则和 Skill 摘要。

主要问题：

1. Skill 发现、数据库注册、运行时读取仍有历史兼容逻辑，尚未完全收敛为单一 catalog。
2. 当前 `SkillSummary`/`SkillDocument` 尚未统一暴露 `version` 和 `disable-model-invocation` 字段。
3. 当前摘要在 Agent 节点构建时读取，尚未固化为 Run 级 catalog 快照。
4. 受限参考文件读取已经具备统一工具错误和 `skill.resource_*` 事件，但资源注册清单尚未实现。
5. `register_builtin_skills()` 仍是现行启动同步入口，后续可改名为 catalog 同步函数。
6. tau 的显式 `/skill:<name>` 消息预处理尚未接入；当前采用模型根据系统提示调用 `read_canvas_skill`。

## 3. 参考 tau 后保留的核心设计

### 3.1 统一 Skill 文件协议

每个 Skill 必须是一个目录中的 `SKILL.md`：

```text
skills/
  image-generation/
    SKILL.md
```

建议 frontmatter：

```yaml
---
name: image-generation
version: 1.0.0
description: Create and revise image-generation nodes on the canvas.
disable-model-invocation: false
---
```

字段规则：

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `name` | 是 | `^[a-z0-9][a-z0-9-]{0,63}$`，且必须等于目录名 |
| `description` | 是 | 非空，作为 Level 1 摘要；长度限制 500 字符 |
| `version` | 否 | 默认 `1.0.0`，仅用于展示、审计和状态校验 |
| `disable-model-invocation` | 否 | 仅接受布尔值；为 true 时不注入模型摘要，但仍可显式调用 |

正文为 Markdown 指导文本，只能描述适用条件、输入要求、画布读取顺序、规划约束和输出格式。正文不获得工具权限，禁止要求执行 Shell、写文件、直连 Provider、读取密钥或绕过确认。

### 3.2 简化的资源来源

第一期只扫描项目内受控目录 `${MEDIAFORGE_SKILLS_DIR:-<BASE_DIR>/skills}`，不扫描 `~/.agents`、用户 Home 或请求传入的任意路径。这样适配当前单体部署和多用户服务模型，也避免服务进程意外读取宿主机文件。

未来如果需要管理员自定义 Skill，再增加“审核后的对象存储/数据库来源”，不改变 Agent 工具契约。

### 3.3 两级渐进式披露

| 层级 | 内容 | 时机 |
| --- | --- | --- |
| Level 1 | `name`、`version`、`description` | Run 创建或首次 Agent 调用时注入系统提示 |
| Level 2 | 单个 Skill 的完整正文 | 模型判断请求匹配时调用 `read_canvas_skill` |

本期提供最小 Level 3 基础工具 `read_canvas_skill_file(skill_name, path, offset, limit)`：它复用 tau `read` 的按行偏移、输出截断和续读语义，但只能读取已加载 Skill 目录下的 UTF-8 文本。它服务于 `references/` 等参考资料的渐进加载，不支持图片、二进制文件、脚本执行或任意服务器路径。

## 4. 目标模块设计

### 4.0 独立系统提示词构建器

新增 `app/services/canvas_agent/system_prompt.py`，参考 tau 的 section 组装方式，统一生成 Canvas Agent 的系统提示词。当前基础版本只组合以下内容：

- Agent 身份和画布规划规则。
- 本次 Agent 实例实际暴露的工具名称。
- 启用 Skill 的 XML 元数据摘要。
- Skill 正文和受限参考文件的读取规则。

`runtime.py` 只负责将 `build_canvas_system_prompt(...)` 包装为 `SystemMessage`，不再维护长字符串。该构建器保持纯函数特征，便于单元测试和后续按 Run 注入 Skill 快照；不实现 tau 的自文档、项目上下文文件、模板、工具 guideline 聚合和自定义系统提示覆盖。

### 4.1 `skills.py` 作为 Skill 领域入口

重构 `app/services/canvas_agent/skills.py`，保留现有函数名兼容调用方，内部改为以下职责：

- 当前实现以 `SkillSummary`、`SkillDocument` 和 `SkillResource` 三个不可变对象表达摘要、正文和参考文件片段。
- `list_skill_summaries(root=None)` 扫描 `<root>/*/SKILL.md`，按名称排序并校验 frontmatter。
- `read_skill_document(name, root=None)` 校验启用状态、UTF-8、长度及 frontmatter 后读取正文。
- `read_skill_resource(name, path, offset, limit, root=None)` 只读取 Skill 目录内的受限 UTF-8 文本，支持分页和续读。
- `skill_metadata_prompt(skills=None, xml=False)` 是唯一的元数据格式化入口：默认返回兼容的列表格式，`xml=True` 返回 tau 风格的 `<available_skills>` 摘要。
- `system_prompt.py` 负责 section 组合，并调用 `skill_metadata_prompt(..., xml=True)`，不再重复遍历和格式化 Skill。
- `load_skills_with_diagnostics`、catalog hash 和显式命令展开仍属于后续迭代，不应视为当前已实现能力。

现有函数名继续保留，以兼容 REST、启动同步和历史测试；后续再按实际调用收敛 API。

### 4.2 Run 级 Skill 快照（后续迭代）

当前只持久化已读取 Skill 的名称和内容哈希：

```python
loaded_skills: list[dict[str, str]]
```

当前系统提示每次 Agent 节点执行时从启用目录生成摘要，尚未计算 catalog hash，也未将完整 catalog 固化到 checkpoint。需要解决 Run 内文件变化一致性时，再引入 catalog hash 和快照校验。

已加载项至少记录：

```json
{
  "name": "image-generation",
  "version": "1.0.0",
  "content_sha256": "..."
}
```

重复读取相同哈希的 Skill 去重；读取到不同哈希时返回明确错误并记录 `skill.invalidated`，不自动混用两个版本。

### 4.3 Agent 工具契约（当前实现）

当前暴露两个只读工具：

```python
read_canvas_skill(name: str, runtime: ToolRuntime) -> Command
read_canvas_skill_file(skill_name: str, path: str, offset: int, limit: int, runtime: ToolRuntime) -> Command
```

约束：

1. Skill 元数据已通过系统提示注入，故不再暴露 `list_canvas_skills` Agent 工具；REST 查询仍保留。
2. `read_canvas_skill` 校验启用状态、frontmatter、UTF-8、长度和 SHA-256，并通过 `Command(update=...)` 写入 `loaded_skills`。
3. `read_canvas_skill_file` 必须先看到对应的 `loaded_skills`，路径只能是 Skill 根目录下的相对路径。
4. 参考文件限制为 UTF-8 文本、单文件 128KB、单次最多 400 行和 12,000 字符，支持 1-based `offset` 和 `limit`。
5. 成功和失败分别发送 `skill.resource_loaded`、`skill.resource_rejected`；错误响应不返回堆栈。
6. Skill 正文和参考文件不会自动增加或改变可用工具集合。

### 4.4 显式调用（后续迭代）

tau 风格的 `/skill:<name>` 消息预处理暂未实现。后续接入时再增加：

- `/skill:image-generation`：展开完整正文。
- `/skill:image-generation 生成一张电商主图`：正文后追加用户指令。
- 未知 Skill 返回用户可理解的错误，不触发模型调用。
- 普通文本保持原样。

显式调用仍需检查 `enabled`；`disable-model-invocation: true` 只禁止模型自动发现，不禁止用户显式使用。

## 5. 数据库与启动流程

继续使用 `canvas_agent_skills` 作为启用状态和管理元数据的持久化位置，但不把正文复制进数据库。当前启动入口仍为 `register_builtin_skills()`：

- 启动时同步有效 Skill 的 `name`、`description` 和正文哈希等元数据。
- 已存在的 `enabled=false` 必须保留，不能因同步而重新启用。
- 目录中被删除的 Skill 标记为不可用或从管理列表隐藏，不影响历史 Run 的事件记录。
- 数据库不可用时，Skill 发现仍可读取文件，但管理开关按“默认启用”处理并记录 warning。

当前启动/运行流程为：

```text
应用启动 -> register_builtin_skills -> 写入启用状态
Agent 节点 -> system_prompt.py 读取 Skill 摘要并注入
模型命中 -> read_canvas_skill -> read_canvas_skill_file（可选）
-> 规划/确认/执行
```

后续可将 `register_builtin_skills()` 改名为 `sync_builtin_skill_catalog()`；当前不做该兼容迁移。

## 6. API 与前端影响

现有接口保持兼容：

- `POST /api/canvas-agent/runs/{run_id}/tasks/{task_id}/retry` 等 Run 相关接口不受影响。
- 原 `GET /api/canvas-agent/skills` 与 `GET /api/canvas-agent/skills/{name}` 已移除（无调用方）；Skill 摘要与正文只通过 `read_canvas_skill` 等 Agent 工具读取，禁用或不存在的 Skill 统一视为不存在。

本期不增加 Skill 编辑器、上传接口或前端 Skill Picker。现有事件展示继续使用：

- `skill.loaded`：携带名称、版本和哈希。
- `skill.resource_loaded`：携带相对路径、哈希、行范围和截断状态。
- `skill.rejected`：携带名称和规范化原因。
- `skill.invalidated`：预留事件，当前尚未产生。

## 7. 安全边界

- 根目录由服务端配置决定，拒绝请求参数覆盖。
- 只接受目录下的 `SKILL.md`，拒绝绝对路径、`..` 和符号链接逃逸。
- 限制正文最大字符数和原始字节数；建议沿用现有 `12,000` 字符上限。
- YAML 只解析为字典，拒绝未知危险结构；禁止把 frontmatter 中的字段解释为可执行权限。
- 事件和 API 响应不返回 Skill 绝对路径、环境变量、凭据或完整异常堆栈。
- Skill 只能指导 `SemanticPlan`，任何变更仍必须经过现有 Policy、用户确认和 Patch Executor。

## 8. 分阶段实施

### Phase 1：基础读取与提示词（已完成）

- 保留 `skills/<name>/SKILL.md` 目录发现、frontmatter、UTF-8、长度和哈希校验。
- 增加 `SkillResource` 及受限 `read_skill_resource` 分页读取原语。
- 新增 `system_prompt.py`，统一组装工具、画布规则和 Skill 元数据摘要。
- 从 Agent 工具列表移除冗余的 `list_canvas_skills`，保留 REST 查询接口。
- `read_canvas_skill` 和 `read_canvas_skill_file` 通过 `Command` 写入状态并产生 Skill 事件。

### Phase 2：Runtime 深化（后续迭代）

- 在 Run 创建时生成 Skill 快照。
- 将当前动态摘要改为 Run 创建时固化的 Skill 快照。
- 更新 `tools.py` 只依赖快照读取，并增加版本/哈希失效校验。
- 增加 `/skill:<name>` 消息预处理。

### Phase 3：数据库/API/文档收敛（后续迭代）

- 将 `register_builtin_skills` 迁移为 catalog 同步函数。
- 扩展 REST 返回字段并保持旧字段兼容。
- 更新 `skill_backend.py` 为快照只读适配器。
- 将旧方案文档标注为历史方案，补充本方案作为当前基线。

## 9. 测试与验收标准

当前已覆盖：

- 有效目录发现、按名称排序、无 Python 注册即可生效。
- 缺少 `SKILL.md`、非法名称、frontmatter 错误、UTF-8 错误、超长正文的诊断与跳过。
- `name` 与目录名不一致时拒绝。
- 工具成功写入 `loaded_skills`，重复加载去重，失败返回 `ToolMessage` 和 `skill.rejected`。
- Skill 参考文件支持 `offset`/`limit` 分页、截断提示和续读。
- 未加载 Skill、路径穿越、绝对路径、超大或非 UTF-8 资源均被拒绝。
- 系统提示词包含工具、规则和可用 Skill 摘要，且不暴露 `list_canvas_skills`。
- 路径穿越、绝对路径和符号链接逃逸均被拒绝。
- 现有 Canvas Agent、确认、执行和历史 Run 测试全部通过。

验收结果应满足：

1. 新增 `skills/demo/SKILL.md` 后无需修改 Python，重启服务即可在 REST 列表和 Agent 摘要中出现。
2. 用户请求命中 Skill 时，事件顺序为 `skill.loaded` -> 后续规划事件；读取参考资料时追加 `skill.resource_loaded`。
3. Skill 正文不会让 Agent 绕过既有画布执行边界。
4. 单个非法 Skill 不阻断应用启动，且可在日志或诊断接口中定位。

## 10. 暂缓事项

以下内容明确不纳入本次重构：

- tau 四级资源来源和同名覆盖优先级。
- 用户级/项目级 Skill 管理与权限隔离。
- Skill 资源的二进制预览、图片输入和脚本目录。
- `/skills` 交互式选择器、TUI 展示和 token 统计。
- Prompt Template、插件扩展和远程市场。
- 热加载、跨 Run 缓存和分布式 catalog 一致性。

当未来出现自定义 Skill、跨项目复用或资源文件读取需求时，再以本方案的 `Skill`/快照/工具契约为基础增量扩展，避免现在为未使用场景引入复杂资源框架。
