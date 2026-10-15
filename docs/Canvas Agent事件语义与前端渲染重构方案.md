# Canvas Agent 事件语义与前端渲染重构方案

> 实施状态：M0-M4 已完成代码落地。M4 已加入超时工具组的最终失败收敛、指标、告警和旧前端业务分支清理；必须部署新构建并重启 API/Agent Worker 后，才会导出新增指标并开始生产观察期。

> 状态：实施完成，待上线观测
>
> 范围：Canvas Agent 的运行进度、Skill 读取事件、画布生成任务事件，以及 Agent 面板和画布的事件消费。
>
> 关联文档：[Agent运行事件总线方案.md](Agent运行事件总线方案.md)。本文只收敛**事件语义与展示职责**，不重复实施 Outbox、多 Worker 分发、命令队列等基础设施能力。

## 1. 背景

当前事件流已经由后端统一写入 `canvas_agent_events` 并向客户端分发，但用户可见的语义仍分散在两处：

- `app/services/canvas_agent/runtime.py` 的 `tool_progress_message()` 根据工具名拼装“正在读取技能说明”等文案，再发送 `progress.tool_started`。
- `frontend/src/canvas/agent/agent-panel.js` 的 `liveEventText()` 根据 `skill.*`、`task.*` 再拼装“已读取 Skill”“生成任务已完成”等文案。

同一次 Skill 调用因而会产生两种事件：

```text
progress.tool_started     正在读取技能说明
skill.loaded              已读取 xxx 技能
```

它们表示的事实并不相同：前者是工具开始，后者是 Skill 成功加载。但二者没有共同的关联 ID，前端只能将其当作两条独立进度；同时，任务事件还被画布节点和 Agent 面板分别解释。这造成以下问题：

1. 同一产品文案在后端和前端各维护一份，新增工具或事件时容易漏改。
2. 前端按事件类型推断业务语义，历史重放、WebSocket 实时事件和画布节点状态容易不一致。
3. 成功、失败、拒绝事件没有完整的开始/结束关联，进度会停留在“正在执行”。
4. `liveEventText()` 虽处理 `task.*`，但历史对话时间线的 `conversationEventTypes` 未纳入这些事件；同一事件在不同路径的表现不一致。

本次重构的目标不是“把所有事件都显示在对话中”，而是让后端成为**事件语义、可见文案、展示指令和关联关系**的唯一权威；前端只将后端给出的契约投影到面板、Skill 标签和画布刷新动作。

## 2. 范围与非目标

### 2.1 本次范围

1. 规范 Agent Event 的可展示字段，并保持现有事件信封和持久化链路。
2. 为工具生命周期建立 `tool_call_id` 关联，支持同一进度项从开始更新到成功、失败或拒绝。
3. 后端为所有需要展示的事件提供统一 `message` 和 `presentation`。
4. 前端删除 Skill、任务、工具的中文业务文案和依赖事件类型的展示判断。
5. 将任务画布状态以服务端持久化投影为准，前端收到事件后做通用刷新。
6. 以渐进方式迁移，不改变既有 `/events`、WebSocket 信封和历史事件读取接口。

### 2.2 非目标

- 不新增独立的前端状态机、事件 DSL、可执行的前端 `effects` 协议。
- 不重做 Redis Outbox、命令 Worker、跨进程事件投递；这些遵循既有事件总线方案。
- 不引入多语言 `message_key`、服务端模板系统或客户端国际化重构。当前界面为中文，第一期后端直接下发经过脱敏的中文 `message`。
- 不把所有 `task.*` 放进对话时间线。任务主状态仍展示在画布节点；面板只展示明确标记为对话进度的事件。
- 不修改 Skill 的权限、文件读取、渐进加载和系统提示词逻辑。

## 3. 目标架构与职责边界

```text
LangGraph / Skill Tool / Task Worker / Router
                    |
                    v
         Canvas Agent Event Factory
      语义校验、文案、关联 ID、展示契约
                    |
                    v
   emit_agent_event -> DB Event -> WS / HTTP catch-up
                    |
                    v
     Browser Event Projector
  只按 presentation 渲染进度、标签与画布刷新
```

### 3.1 后端职责

后端必须：

1. 决定事件类型、发生时机、严重级别和可展示文案。
2. 在所有同一工具调用的事件上携带相同 `tool_call_id`。
3. 为需展示的事件提供 `presentation`，明确它应进入哪个 UI 表面以及是开始、更新还是结束。
4. 先完成任务到画布节点的持久化投影，再发出含 `canvas_version` 的任务事件。
5. 仅暴露经脱敏且尺寸受限的数据；`message` 不能包含 API Key、原始模型响应或完整用户私密内容。

### 3.2 前端职责

前端只负责：

1. 按 `(run_id, sequence)` 去重和顺序应用事件。
2. 读取 `payload.presentation`，以 `group_id` 定位并更新同一进度项。
3. 原样显示 `payload.message`，未知或旧事件仅显示通用降级文本。
4. 根据 `presentation.targets` 渲染面板进度、Skill 标签或触发画布数据刷新。
5. 当事件含有 `canvas_version` 时刷新画布数据，避免在浏览器中重复推导任务生命周期。

前端不得根据 `type === 'skill.loaded'`、工具名或任务状态拼装中文业务文本，不得根据事件类型自行猜测“开始/完成/失败”。允许按 `targets` 选择组件和图标，这是渲染选择而非业务语义。

## 4. 统一事件契约

### 4.1 保持的公共信封

继续沿用现有事件信封，不变更事件表主结构：

```json
{
  "schema_version": 1,
  "id": "evt_01",
  "sequence": 42,
  "run_id": "run_01",
  "operation_id": "op_01",
  "type": "progress.tool_started",
  "phase": "tool",
  "severity": "info",
  "created_at": 1780000000000,
  "payload": {}
}
```

`payload` 增加以下稳定字段。它们是展示契约的一部分，字段缺失的历史事件继续按兼容规则处理。

```json
{
  "message": "正在读取 video-storyboard 技能说明",
  "tool_name": "read_canvas_skill",
  "tool_call_id": "call_abc",
  "subject": {
    "kind": "skill",
    "name": "video-storyboard"
  },
  "presentation": {
    "targets": ["conversation_progress"],
    "group_id": "tool:call_abc",
    "state": "started",
    "history": false
  }
}
```

字段定义：

| 字段 | 必填条件 | 说明 |
| --- | --- | --- |
| `message` | `presentation.targets` 非空时必填 | 已脱敏的最终展示文本，最长 500 字符。 |
| `tool_name` | 工具生命周期事件必填 | 内部稳定工具标识，不直接展示。 |
| `tool_call_id` | 工具生命周期事件必填 | LangGraph 原始调用 ID；无法获取时由后端生成稳定 UUID。 |
| `subject` | 有明确业务对象时建议提供 | Skill、resource、task、plan 等对象的最小公开标识。 |
| `presentation` | 事件要触发 UI 渲染时必填 | 仅描述渲染投影，不承载业务副作用。 |
| `presentation.targets` | 同上 | 可选值：`conversation_progress`、`skill_badge`、`canvas_refresh`、`system_notice`。 |
| `presentation.group_id` | `conversation_progress` 时必填 | 同一进度项的稳定键，通常为 `tool:<tool_call_id>`。 |
| `presentation.state` | `conversation_progress` 时必填 | `started`、`updated`、`succeeded`、`failed`、`rejected`。 |
| `presentation.history` | 可选，默认 `false` | `true` 表示终态保留在对话时间线；`false` 表示只更新实时状态。 |

`presentation` 不允许包含 JavaScript、URL、HTML、任意方法名或前端可执行指令。它是封闭枚举的显示元数据，而不是通用命令通道。

### 4.2 事件分类

| 类别 | 事件 | 事实含义 | 默认展示策略 |
| --- | --- | --- | --- |
| 运行进度 | `progress.context`、`progress.agent` | 上下文构建或模型分析正在进行 | 对话进度，单独分组。 |
| 工具生命周期 | `progress.tool_started`、`progress.tool_completed`、`progress.tool_failed` | 某个真实 tool call 的开始、成功、异常失败 | 同一 `tool_call_id` 更新同一条。 |
| Skill 结果 | `skill.loaded`、`skill.resource_loaded`、`skill.rejected`、`skill.resource_rejected` | Skill 或资源读取的领域事实 | 作为工具终态补充，并更新 Skill 标签；不另起重复进度。 |
| 画布任务 | `task.queued`、`task.running`、`task.succeeded`、`task.failed`、`task.timed_out`、`task.cancelled` | 生成任务状态已发生变化 | `canvas_refresh`；默认不进入对话时间线。 |
| 业务结果 | `plan.created`、`patch.applied`、`message.replied`、`run.*` | 计划、画布写入和 Run 状态变化 | 由相应面板渲染；必要时为 `system_notice`。 |

`progress.tool_*` 描述工具调用生命周期，`skill.*` 描述 Skill 领域状态。二者可以都存在，但必须共享 `tool_call_id` 和 `presentation.group_id`，使浏览器将其投影为一个连续进度项，而不是两条重复提示。

### 4.3 工具与领域事件的标准顺序

Skill 成功读取：

```text
progress.tool_started       group=tool:call_1, state=started
skill.loaded                group=tool:call_1, state=succeeded, targets=[conversation_progress, skill_badge]
progress.tool_completed     group=tool:call_1, state=succeeded, targets=[]
```

为避免同一成功被前端显示两次，`skill.loaded` 是该工具在面板中的终态事实；随后的 `progress.tool_completed` 只保留审计/可观测性，不带 `conversation_progress` target。若工具没有领域结果（如 `read_canvas_context`），则 `progress.tool_completed` 自己承担对话进度终态。

Skill 被安全策略拒绝：

```text
progress.tool_started       group=tool:call_2, state=started
skill.rejected              group=tool:call_2, state=rejected, severity=warning
```

不要仅在 Python 异常时发送 `progress.tool_failed`。Skill 工具以 `ToolMessage` 返回的权限拒绝也是可观察的终态，必须借由 `skill.rejected` 或 `skill.resource_rejected` 关闭该进度项。

生成任务：

```text
task.queued -> 服务端投影节点待处理状态 -> event(canvas_version, targets=[canvas_refresh])
task.running -> 服务端投影节点运行状态     -> event(canvas_version, targets=[canvas_refresh])
task.succeeded/failed/... -> 服务端投影终态 -> event(canvas_version, targets=[canvas_refresh])
```

任务不采用 `tool_call_id`，以 `task_id` 作为业务关联键。只有产品明确要求“Agent 已提交生成任务”出现在聊天面板时，后端才为 `task.queued` 加入 `conversation_progress` target 和独立 `group_id: task:<task_id>`；这应是产品决定，不是前端兜底行为。

## 5. 后端实现设计

### 5.1 新增事件构造层

在 `app/services/canvas_agent/` 新增轻量模块 `event_factory.py`，集中构造可展示事件 payload。它不负责写库、广播或画布投影；这些职责仍在 `events.py`。

建议接口：

```python
def tool_started(*, tool_name: str, tool_call_id: str, message: str, subject: dict | None = None) -> EventSpec: ...
def tool_completed(*, tool_name: str, tool_call_id: str, message: str) -> EventSpec: ...
def tool_failed(*, tool_name: str, tool_call_id: str, message: str) -> EventSpec: ...
def skill_loaded(*, tool_call_id: str, name: str, content_sha256: str) -> EventSpec: ...
def skill_rejected(*, tool_call_id: str, name: str, reason: str) -> EventSpec: ...
def task_lifecycle(*, status: str, task_id: str, node_id: str, ...) -> EventSpec: ...
```

`EventSpec` 可是冻结 dataclass，也可只是 `{event_type, payload, phase, severity}` 的 TypedDict。第一期无需 Pydantic、注册中心或动态插件机制。每个构造函数负责：

1. 产生一致的 `message`、`subject`、`presentation`。
2. 截断和脱敏可展示错误；保留原有 `sanitize_payload()` 作为最终防线。
3. 确保 `tool_call_id` 和 `presentation.group_id` 一致。
4. 拒绝不在 Factory 中执行 I/O 或写状态，保持可单元测试。

### 5.2 `runtime.py`：从自由文本回调改为结构化事件

当前 `emit_progress(run_id, {phase, message})` 仅能表达自由文本。将回调替换为接收 `EventSpec` 的 `emit_event`，或在不改变调用方签名的情况下让 `progress()` 接收结构化 payload。

建议最小变更：

1. 删除 `tool_progress_message()`，由 `event_factory.tool_started()` 生成事件文本与展示字段。
2. `tools_node()` 遍历真实 `tool_calls` 时，使用 `call["id"]` 作为 `tool_call_id`，先发送 `progress.tool_started`。
3. `ToolNode.ainvoke()` 成功后，对没有领域终态的工具发送 `progress.tool_completed`；发生异常时发送同一 `tool_call_id` 的 `progress.tool_failed`。
4. 将 `tool_call_id` 写入 Agent state 的短生命周期映射，供具体 Tool 函数在发送 `skill.*` 事件时取得。不要从工具名反查，也不要随机生成第二个关联 ID。

工具结果的归属规则：

| 工具类别 | 终态事件 |
| --- | --- |
| `read_canvas_skill` | `skill.loaded` / `skill.rejected` |
| `read_canvas_skill_file` | `skill.resource_loaded` / `skill.resource_rejected` |
| 无领域输出的只读工具 | `progress.tool_completed` / `progress.tool_failed` |
| 会提交任务或应用 Patch 的工具 | 保留 `patch.applied`、`task.*` 等业务事件；`progress.tool_completed` 只作运行审计，不进对话进度。 |

### 5.3 `tools.py`：Skill 事件成为工具终态

扩展 `emit_skill_event` 回调签名，使其接收 `tool_call_id`，并从 `runtime: ToolRuntime` 中传入。Skill 事件必须改为通过 Factory 构造：

```python
await emit_skill_event(
    skill_loaded(
        tool_call_id=runtime.tool_call_id,
        name=document.name,
        content_sha256=document.content_sha256,
    )
)
```

资源读取事件同理；`offset`、`limit`、`line_count` 可保留为结构化资源元数据，但 `message` 由后端统一生成，避免前端重新拼接文件路径和分页信息。

### 5.4 `events.py`：保持唯一写入口并校验展示契约

`emit_agent_event()` 继续是唯一出口，并新增以下轻量校验：

1. `presentation` 存在时校验 `targets`、`state` 为封闭枚举。
2. `conversation_progress` target 必须有非空 `message` 和 `group_id`。
3. `tool_name` 出现时必须有 `tool_call_id`；`group_id` 必须为 `tool:<tool_call_id>`。
4. `task.*` 仍先调用 `_project_task_to_canvas()`，将返回的 `canvas_version` 写入 payload；Factory 只负责显示字段，不能绕过该顺序。
5. 对历史调用逐步迁移。迁移期没有 `presentation` 的事件可正常写入，不阻塞旧业务。

校验失败应在开发/测试环境抛出明确异常，在生产环境记录结构化错误并降级为不带 presentation 的事件，不能因一条进度提示导致 Agent Run 中断。

### 5.5 Router 与 Task Worker

- `app/routers/canvas_agent.py` 的 `progress()`、`emit_skill_event()` 闭包改为传递 Factory 产生的 EventSpec，而不是重写 `phase` 或文案。
- `app/services/canvas_tasks.py` 与 `task_dispatch.py` 经 Factory 产生 `task.*` 的 `message` 和 `presentation`，然后继续调用 `emit_agent_event()`。
- task worker 的 `operation_id` 可继续是任务自身标识；不要伪造 LangGraph `tool_call_id`。这两个关联维度服务不同生命周期。

## 6. 前端实现设计

### 6.1 通用事件投影器

在 `frontend/src/canvas/agent/` 增加 `agent-event-projector.js`，将当前分散在 `agent-panel.js`、`agent-events.js` 的显示判断收敛为一个无业务文本的投影器。

输入是标准 event envelope，输出是有限的视图更新：

```js
projectAgentEvent(event) => {
  progress?: { groupId, state, message, history, severity },
  skillBadge?: { name, version },
  refreshCanvas?: { version },
  notice?: { message, severity },
}
```

该函数只读取 `payload.presentation`、`payload.message`、`payload.subject` 和 `payload.canvas_version`。它不含 `switch (event.type)` 的文案映射，不认识具体工具名，也不根据 task status 推断显示文字。

### 6.2 `agent-panel.js` 改造

1. 删除 `conversationEventTypes` 与 `liveEventText()` 中的 `skill.*`、`task.*`、`progress.*` 文案分支。
2. 用 `presentation.targets.includes('conversation_progress')` 决定是否渲染到事件时间线。
3. 用 `group_id` 存储 live progress。收到 `started` 创建条目；`updated` 修改；`succeeded`、`failed`、`rejected` 关闭条目，`history=true` 时保留终态记录。
4. 文案只使用 `payload.message`。缺失时显示“处理中”或“操作状态已更新”，并在开发模式记录协议告警，不回退到业务文案。
5. 历史 `renderRun()` 和实时 `applyEvent()` 必须使用同一 projector，以保证重放和实时显示完全一致。

### 6.3 `agent-events.js` 改造

1. 删除对 `task.queued`、`task.succeeded` 等类型调用 `startNodeTask()`、`finishNodeTask()` 的专门分支。
2. 任何事件带 `presentation.targets: ['canvas_refresh']` 或 `payload.canvas_version` 时，调用唯一的 `CanvasAgentBridge.refreshCanvas()`；画布的真实状态由服务端已持久化的节点数据决定。
3. `skill_badge` target 使用 `payload.subject` / `payload.skill` 的公开元数据更新标签，不拼接文案。标签列表在 `renderRun()` 中以服务端事件重放结果为准。
4. 计划、回复、Run 状态等已有专用 UI 可以继续按事件类型接收结构化 payload；它们不是进度文本映射，暂不在本次重构范围内。

### 6.4 历史兼容与降级

事件可能来自当前版本 Worker、滚动发布中的旧 Worker 或历史数据库。兼容规则：

| 事件形态 | 前端行为 |
| --- | --- |
| 有完整 `presentation` 和 `message` | 按新 projector 渲染。 |
| 只有旧 `payload.message` | 在通用状态区域显示，但不创建可关联进度项。 |
| 旧 `skill.loaded` / `skill.resource_loaded` 无 `message` | 更新 Skill 标签；时间线不再拼装旧文案。 |
| 旧 `task.*` | 若带 `canvas_version` 则刷新画布；不进入对话进度。 |
| 任何未知事件 | 保留 sequence，忽略展示，不抛错。 |

新前端应先上线并兼容旧事件，后端开始发送新契约后才删除旧前端文本分支。这样支持滚动发布与历史 Run 回放。

## 7. 实施阶段

### M0：冻结契约与测试夹具

1. 在 `event_types.py` 定义 `PRESENTATION_TARGETS`、`PRESENTATION_STATES` 和 payload 校验函数。
2. 编写 `event_factory.py`，覆盖工具、Skill、Skill 资源和任务生命周期的构造函数。
3. 添加单测：未知 target/state、缺失 message/group ID、错误 tool group ID、敏感字段、超长 message。

验收：Factory 在不依赖数据库、LangGraph 或浏览器的情况下可完整测试；旧调用不受影响。

### M1：后端工具与 Skill 事件收敛

1. 改造 `runtime.py`，以真实 `tool_call_id` 发送开始与终态事件。
2. 改造 `tools.py`，Skill 成功、资源成功和拒绝事件均携带同一关联 ID 与展示契约。
3. 改造 router callback，统一接收 EventSpec。
4. 补充 LangGraph 运行测试：成功 Skill、资源分页读取、权限拒绝、ToolNode 异常、无领域结果工具。

验收：每一条 `progress.tool_started` 都能在后续事件中找到同一 `group_id` 的终态；Skill 成功不会产生两条对话进度。

### M2：任务事件与服务端画布投影收敛

1. 使用 Factory 为 `task_dispatch.py` 和 `canvas_tasks.py` 的任务事件补足 `message` 与 `presentation`。
2. 确保 queued、running、终态事件都带正确 `canvas_version`。
3. 为“是否在对话中显示任务提交”设置一个后端产品配置；默认关闭。
4. 添加 task 事件顺序、快速完成、失败和重放测试。

验收：前端不需要调用 `startNodeTask()` / `finishNodeTask()` 也能通过刷新得到正确画布节点状态；快速成功不会被迟到 queued 覆盖。

### M3：前端通用投影器

1. 新增 projector 并让实时 WebSocket 和 `/events` catch-up 共同使用。
2. 迁移 `agent-panel.js` 的 live progress 逻辑，移除 `liveEventText()` 的业务分支。
3. 迁移 `agent-events.js` 的任务专用 UI 副作用为通用 `canvas_refresh`。
4. 在浏览器测试中覆盖实时事件、断线补偿、历史 Run 回放、并发工具调用和旧事件降级。

验收：同一个 Run 的实时视图与刷新后的历史视图一致；前端源码中不再有 `已读取 ${...} 技能`、`生成任务已完成` 之类的 Agent 事件业务文本。

### M4：清理与观测

1. 已删除旧的 `conversationEventTypes`、任务直接桥接分支和前端业务文案回退映射；历史事件没有 `presentation` 时只作通用降级，不再推断其业务状态。
2. 已在日志和指标中记录 presentation 校验降级次数、未闭合 tool group、前端未知 target 数；指标分别为 `mediaforge_canvas_agent_event_presentation_invalid_total`、`mediaforge_canvas_agent_open_tool_groups`、`mediaforge_canvas_agent_event_presentation_unknown_targets_total`。
3. 已由 Outbox Worker 定期扫描未闭合工具组。超过 `AGENT_EVENT_TOOL_GROUP_TIMEOUT_SECONDS`（默认 300 秒）后，服务端原子写入同一 `tool:<id>` 的 `progress.tool_failed` 终态；扫描周期由 `AGENT_EVENT_TOOL_GROUP_SCAN_SECONDS`（默认 15 秒）控制。
4. 已在 `monitoring/prometheus-alerts.yml` 增加 presentation 校验、未知 target、长期未闭合工具组和超时自动收敛的告警。

验收：代码测试确认超时事件会关闭原 group，且并发扫描只能成功写入一次终态。上线后观察一个发布周期：生产中不存在持续增长的未闭合 `tool:<id>` 进度组，`presentation_invalid_total` 不再增长；若触发告警，按 run ID、tool call ID 和事件序列排查并修复。

## 8. 测试矩阵

| 场景 | 后端预期 | 前端预期 |
| --- | --- | --- |
| Skill 正文读取成功 | started 与 loaded 同 `tool_call_id`；loaded 为终态 | 一条进度从“正在读取”更新为“已读取”；出现 Skill 标签。 |
| Skill 资源分页读取成功 | started 与 resource_loaded 同关联 | 一条进度显示读取的资源和范围。 |
| Skill 未启用/未先加载资源 | `skill.rejected` / `skill.resource_rejected` 为终态，warning | 进度关闭并保留拒绝原因；不显示为系统异常。 |
| 普通工具成功 | started + tool_completed | 同一条进度关闭。 |
| ToolNode 抛异常 | started + tool_failed，error | 同一条进度显示失败，Run 后续失败照常处理。 |
| 两个并发工具 | 每个 call 独立 group ID | 两条独立进度，互不覆盖。 |
| queued 后快速 succeeded | 服务端节点版本单调，两个事件都有 canvas_version | 通用刷新后节点为完成，不被 queued 覆盖。 |
| WebSocket 漏一条 | HTTP 按 sequence 补齐 | 状态与实时无差别，不重复添加记录。 |
| 旧历史事件 | 无 presentation 合法 | 不报错，按兼容规则有限展示。 |

## 9. 风险与约束

1. **文案耦合后端。** 当前产品单语言，后端 `message` 是最小成本方案。将来引入多语言时，可在保持 `presentation` 不变的前提下新增 `message_key` 与参数；在那之前不要过早引入翻译基础设施。
2. **LangGraph tool call ID 可用性。** 必须确认 `runtime.tool_call_id` 与模型 `tool_calls[].id` 在当前 LangChain/LangGraph 版本中保持一致；测试中同时覆盖不存在 ID 的兼容生成路径。
3. **事件顺序不等于 UI 立即一致。** `sequence` 保证 Run 内顺序，但画布刷新是异步网络请求。客户端应使用 `canvas_version` 丢弃过期刷新结果，避免旧响应覆盖新节点状态。
4. **不能让展示校验影响主流程。** presentation 不合法时可观察并降级，不得阻断 Patch、任务投递或模型回复。
5. **任务与对话是不同表面。** 默认不让 `task.*` 污染对话时间线；产品需要时由后端显式开放 `conversation_progress`，而不是前端私自加入类型列表。

## 10. 完成标准

以下条件全部满足，视为本重构完成：

1. `emit_agent_event()` 是可展示 Agent 事件的唯一写入口；所有携带 `presentation` 的新事件均经 Factory 构造。纯领域事件（如 Run 状态与模型回复）可直接持久化，但不得自行推导展示语义。
2. 所有 `conversation_progress` 事件都有 `message`、`group_id`、终态语义，并可按 `tool_call_id` 闭合。
3. `runtime.py` 不再维护 `tool_progress_message()`；`agent-panel.js` 不再维护 Skill/任务/工具的中文事件文案。
4. Skill、资源、任务事件在实时接收和历史重放中的结果一致。
5. 画布任务状态仅以服务端节点投影为权威，前端通过 `canvas_version` 做通用刷新。
6. 新旧 Worker 与新旧历史事件在滚动发布期间均不会导致 Agent 面板报错或重复展示。
