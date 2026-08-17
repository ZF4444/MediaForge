# MediaForge 画布 Agent 最终架构方案

## 1. 结论

MediaForge 的画布 Agent 应设计为一个“服务端编排、客户端呈现、画布协议驱动”的创作运行时，而不是把 RH/OpenClaw 的文本工具协议原样复制进来。

推荐架构：

```text
用户 -> Agent 面板 -> Agent Runtime -> Planner -> Policy/Validator
                                  |                 |
                                  v                 v
                             Agent Run Store    Canvas Patch
                                  |                 |
                                  +------> Executor +------> 画布/生成任务
                                                    |
                                                    v
                                              Event Stream -> 客户端
```

核心原则：

1. Agent 的计划、操作和运行状态必须是结构化数据，不依赖模型输出中的 XML 文本。
2. 服务端是 Agent Run、权限、确认、幂等和审计的权威来源。
3. 画布改动通过版本化 Patch 执行，不能让模型直接修改画布 JSON。
4. 客户端工具只负责选区、视口、确认弹窗等浏览器能力。
5. Fast Track 与 Doc Chain 共用同一套 Planner、Patch、Executor 和事件协议。
6. RH/OpenClaw 的 `<tool_call>` 和 Fence Block 只作为模型兼容适配层。

## 2. 为什么不完全照搬 RH

RH 的协议适合以 OpenClaw 为中心的运行环境，但不应成为 MediaForge 的内部核心协议：

| RH/OpenClaw 做法 | MediaForge 推荐做法 | 原因 |
| --- | --- | --- |
| `<tool_call>` 嵌入回复文本 | 服务端保存结构化 `tool_calls` | XML 文本解析脆弱，难以校验和审计 |
| `thinking` 中保存阶段状态 | 数据库保存 Agent Run 和阶段 | 状态不能依赖模型记忆 |
| 客户端承担工具幂等 | 服务端幂等键和操作记录 | 刷新、多端协作时更可靠 |
| Agent 自己生成画布节点 schema | 语义计划经 Adapter 转换为现有节点 | 避免模型耦合节点内部字段 |
| 每轮读取全量画布 | 服务端构造相关子图上下文 | 降低 token、延迟和信息泄露风险 |
| `subType` 隐式路由模型 | Capability Registry 显式选择能力 | 可校验比例、时长、参考图和成本 |

可以借鉴 RH 的工具边界、结构化追问、Quick Actions 和 Doc Chain 体验，但运行时可靠性应由 MediaForge 自己保证。

## 3. 产品能力边界

### 3.1 第一版支持

- 理解用户的自然语言创作目标。
- 感知当前画布、选中节点、上下游、媒体输出和可用模型。
- 创建 Prompt、图片、视频、分组和连线。
- 修改节点的技术参数。
- 基于选中节点进行增量创作。
- 在用户确认后运行单节点或工作流。
- 展示实时进度、失败原因、重试和后续建议。
- 保存对话、计划、操作和阶段文档。

### 3.2 第一版不支持

- 模型生成或执行任意 JavaScript/Python/SQL。
- 静默删除用户节点。
- 静默覆盖已确认资产锚点。
- 无上限地自主循环或批量生成。
- 跨用户、跨画布读取资产。
- 仅依赖聊天历史恢复长任务。

## 4. 总体分层

### 4.1 Agent UI

位于画布右侧，负责：

- 对话输入和 `@节点` 引用。
- 结构化追问表单。
- 计划预览和变更差异。
- 运行确认和成本提示。
- Doc Chain 阶段导航。
- 进度、错误、重试和取消。
- Quick Actions。

### 4.2 Agent API

负责鉴权、请求校验、Run 创建、确认、取消和事件输出，不直接拼接 Prompt。

### 4.3 Agent Runtime

Agent 的核心状态机，负责：

- 加载 Run 和会话状态。
- 构造画布上下文。
- 调用 Planner。
- 校验计划。
- 请求确认。
- 执行 Patch 或生成任务。
- 处理工具结果和失败。
- 决定结束、重试或继续下一阶段。

### 4.4 Planner

使用 LLM 将目标转换为语义计划，不直接输出 MediaForge 节点的完整内部对象。

### 4.5 Policy/Validator

确定操作是否合法、是否需要确认、是否超过资源上限，以及节点/模型参数是否匹配。

### 4.6 Canvas Adapter

把稳定的语义操作转换成当前项目的 `smart-prompt`、`smart-image`、视频、分组、循环等实际节点字段。

### 4.7 Executor

执行画布 Patch、提交生成任务、记录 operation 和发送事件。每次操作必须可幂等重放。

## 5. 权威状态设计

### 5.1 Agent Run

每次用户目标对应一个 Run：

```json
{
  "id": "ar_01",
  "canvas_id": "canvas_01",
  "conversation_id": "conv_01",
  "mode": "fast_track",
  "status": "awaiting_confirmation",
  "phase": "planning",
  "base_canvas_version": 42,
  "step_count": 2,
  "max_steps": 12,
  "created_at": 0,
  "updated_at": 0
}
```

状态机：

```text
created
  -> gathering_context
  -> awaiting_input
  -> planning
  -> awaiting_confirmation
  -> applying
  -> running
  -> reviewing
  -> completed

任意可运行状态 -> cancelling -> cancelled
任意可运行状态 -> failed / blocked
```

### 5.2 Agent Operation

每个真实副作用都保存为操作记录：

```json
{
  "id": "op_01",
  "run_id": "ar_01",
  "idempotency_key": "ar_01:create:shot_01",
  "type": "canvas.apply_patch",
  "risk": "confirm",
  "status": "succeeded",
  "input": {},
  "result": {},
  "error": null
}
```

同一 `idempotency_key` 只能产生一次副作用。

### 5.3 Artifact

Doc Chain 产物使用结构化 Artifact，而不是藏在 `thinking` 中：

```json
{
  "id": "artifact_01",
  "run_id": "ar_01",
  "type": "shot_list",
  "version": 1,
  "status": "approved",
  "content": {},
  "source_artifact_ids": ["artifact_script_01"]
}
```

## 6. 语义计划协议

Planner 输出稳定的领域语义，不关心前端节点内部实现：

```json
{
  "mode": "fast_track",
  "goal": "根据产品图创建三个竖屏广告镜头",
  "questions": [],
  "steps": [
    {
      "id": "step_prompt_01",
      "action": "canvas.create_node",
      "node": {
        "semantic_type": "prompt",
        "title": "产品广告视觉提示词",
        "content": "高端护肤品广告，冷白背景，柔和侧光"
      }
    },
    {
      "id": "step_image_01",
      "action": "canvas.create_node",
      "node": {
        "semantic_type": "image_generation",
        "title": "产品主视觉",
        "capability": "image.text_to_image",
        "params": {"aspect_ratio": "9:16"}
      }
    },
    {
      "id": "step_edge_01",
      "action": "canvas.connect",
      "from_step": "step_prompt_01",
      "to_step": "step_image_01",
      "relation": "prompt"
    }
  ],
  "execution": {
    "auto_run": false,
    "parallelism": 2
  },
  "confirmation": {
    "required": true,
    "reason": "将创建并运行三个图片生成任务"
  }
}
```

Canvas Adapter 再将 `semantic_type` 和 `capability` 转成 MediaForge 当前节点字段。这样未来修改节点 schema 不需要重写 Agent Prompt。

## 7. Canvas Patch 协议

Planner 的语义计划经 Adapter 转换为受控 Patch：

```json
{
  "canvas_id": "canvas_01",
  "base_version": 42,
  "operations": [
    {
      "op": "add_node",
      "client_ref": "step_prompt_01",
      "node": {
        "type": "smart-prompt",
        "title": "产品广告视觉提示词",
        "text": "高端护肤品广告，冷白背景，柔和侧光",
        "agent": {"run_id": "ar_01", "step_id": "step_prompt_01"}
      },
      "placement": {"strategy": "after_selection"}
    },
    {
      "op": "add_connection",
      "from_ref": "step_prompt_01",
      "to_ref": "step_image_01",
      "kind": "prompt"
    }
  ]
}
```

第一版允许的 Patch 操作：

```text
add_node
update_node_params
add_connection
remove_connection
add_group
move_node
run_node
run_group
```

`delete_node` 第二阶段再开放，并强制确认。Prompt 修改应使用独立的 `replace_node_content`，避免与技术参数更新混用。

## 8. 画布并发和事务

MediaForge 已有多端画布合并机制，Agent 仍需使用乐观并发：

1. Planner 记录 `base_canvas_version`。
2. 确认前再次获取最新画布版本。
3. 如果只发生位置变化，可重新计算 placement 后应用。
4. 如果目标节点内容、连线或所有权发生变化，停止执行并重新规划。
5. 一组结构性 Patch 应原子应用；生成任务在 Patch 成功后提交。

不能简单地把 Agent 的旧画布快照覆盖到服务器。

## 9. 上下文构建

Context Builder 不向模型发送全量画布，而是构造相关子图：

```json
{
  "canvas": {"id": "canvas_01", "title": "护肤品广告", "version": 42},
  "selection": ["node_product"],
  "nodes": [],
  "connections": [],
  "assets": [],
  "running_tasks": [],
  "capabilities": [],
  "active_artifacts": []
}
```

选择规则：

- 始终包含选中节点。
- 包含选中节点上下游两跳。
- 包含用户在消息中 `@` 引用的节点。
- 包含当前 Run 创建的节点。
- 长 Prompt 先摘要，但保留原内容的引用 ID。
- 媒体只传 `file_id`、类型、尺寸、缩略图引用，不传任意外部 URL。
- 用户明确要求“分析整个画布”时才扩大范围。

## 10. Capability Registry

Agent 不应猜测模型代码。服务端提供标准能力描述：

```json
{
  "capability": "video.image_to_video",
  "provider": "runninghub",
  "model": "resolved-server-side",
  "inputs": ["image", "prompt"],
  "constraints": {
    "aspect_ratios": ["16:9", "9:16", "1:1"],
    "durations": [5, 10],
    "max_references": 1
  },
  "cost_class": "high",
  "enabled": true
}
```

Planner 选择 `capability`，Resolver 根据用户配置、权限和可用性选择真实 provider/model。选择结果在确认卡中展示。

## 11. 确认和权限

风险等级：

| 等级 | 示例 | 策略 |
| --- | --- | --- |
| `read` | 获取节点、聚焦视口 | 自动 |
| `edit` | 新建 Prompt、移动 Agent 节点 | 可自动 |
| `confirm` | 创建生成节点、批量运行、修改用户节点 | 用户确认 |
| `dangerous` | 删除节点、替换锚点、大批量高成本生成 | 强制二次确认 |

规则：

- Agent 默认只修改自己当前 Run 创建的节点。
- 修改用户节点必须有本轮明确指令，不能只依赖历史消息。
- 删除节点必须列出目标节点并二次确认。
- 运行前展示模型、数量、并发、分辨率、时长和可获得的成本信息。
- Policy 在服务端执行，不能只依赖前端按钮。

## 12. Planner/Executor 循环

```text
1. Gather Context
2. Plan
3. Validate
4. Ask / Confirm / Execute
5. Observe Result
6. Review
7. Continue or Finish
```

硬限制：

- 单 Run 最大规划步数。
- 单轮最大工具调用数。
- 自动修复最多 2 次。
- 单次创建节点和生成任务上限。
- 达到限制后进入 `blocked`，向用户说明具体原因。

模型的自然语言回复与执行状态分开存储。即使回复解析失败，Run 状态也不能丢失。

## 13. Fast Track

适合单次或短链路任务：

```text
用户目标 -> 相关子图 -> 最小语义计划 -> 变更预览 -> 执行 -> 结果回顾
```

第一版典型场景：

- 为选中图片创建视频节点。
- 为选中 Prompt 创建多种比例的图片节点。
- 描述图片并创建增强 Prompt。
- 基于现有结果创建局部重做分支。
- 将一组节点编组并运行。

## 14. Doc Chain

Doc Chain 是 Artifact 状态机，不是多个聊天 Prompt 的松散串联：

```text
brief -> creative_direction -> script -> asset_anchors
      -> shot_list -> prompt_pack -> generation -> review -> delivery
```

每个阶段定义：

- 输入 Artifact 类型。
- 输出 JSON Schema。
- 完成条件。
- Self-Check 规则。
- 是否需要确认。
- 下一阶段允许的转换。

用户可以修改、批准或退回某个 Artifact。下游 Artifact 保存来源版本；上游变化时，相关下游标记为 `stale`，由用户决定是否重新生成。

## 15. Anchor First

锚点是版本化 Artifact：

```text
character_anchor
scene_anchor
prop_anchor
style_anchor
voice_anchor
```

镜头保存锚点 ID 和版本，而不是复制一份无法追踪的描述。实际运行 Prompt 由 Prompt Compiler 合并：

```text
系统规则 + 风格锚点 + 角色锚点 + 场景锚点 + 镜头动作 + 模型约束
```

锚点更新不会直接覆盖已生成镜头；系统只提示哪些 Shot 和节点需要重新编译或重新生成。

## 16. 客户端协议

服务端向前端发送统一事件：

```json
{
  "event_id": "evt_01",
  "run_id": "ar_01",
  "type": "agent.plan.ready",
  "sequence": 7,
  "created_at": 0,
  "payload": {}
}
```

事件类型：

```text
agent.message.delta
agent.question.required
agent.plan.ready
agent.confirmation.required
agent.operation.started
agent.operation.completed
agent.operation.failed
agent.task.progress
agent.artifact.created
agent.run.completed
agent.run.blocked
```

第一版可以复用现有 WebSocket；如果 Agent 流量和画布协作事件互相影响，再拆成独立 SSE/WebSocket 通道。

浏览器侧 Client Actions 仅包含：

```text
focus_canvas_area
highlight_nodes
open_asset_picker
show_confirmation
show_quick_actions
```

这些动作不作为画布持久化事实，失败也不影响 Run 的业务状态。

## 17. RH/OpenClaw 兼容层

如果某个模型或外部 Agent 只能输出 RH 风格文本协议，可以增加 Adapter：

```text
<tool_call> -> 解析 -> Tool Schema -> Policy -> Operation
workflow-json -> 解析 -> Semantic Plan -> Canvas Adapter
form-fields -> Agent Question
creative-doc -> Artifact
progress -> 忽略外部状态，映射为非权威展示事件
```

兼容层约束：

- XML/Fence 内容永远先校验，不能直接执行。
- `thinking` 只作为摘要文本，不作为权威状态。
- 外部节点类型先映射成 MediaForge `semantic_type`。
- 外部 ID 只作为 `client_ref`，真实节点 ID 由服务端生成。
- 外部 `autoRun` 仍受本地确认和额度策略约束。

## 18. API 设计

```text
POST /api/canvas-agent/runs
GET  /api/canvas-agent/runs/{run_id}
POST /api/canvas-agent/runs/{run_id}/messages
POST /api/canvas-agent/runs/{run_id}/answers
POST /api/canvas-agent/runs/{run_id}/confirm
POST /api/canvas-agent/runs/{run_id}/cancel
POST /api/canvas-agent/runs/{run_id}/retry
GET  /api/canvas-agent/runs/{run_id}/events
```

创建 Run：

```json
{
  "canvas_id": "canvas_01",
  "message": "把选中的产品图做成三个竖屏广告镜头",
  "selected_node_ids": ["node_product"],
  "mode": "auto"
}
```

确认请求必须携带计划版本：

```json
{
  "plan_version": 2,
  "decision": "approve",
  "approved_step_ids": ["step_prompt_01", "step_image_01"]
}
```

## 19. 代码落点

后端建议：

```text
app/routers/canvas_agent.py
app/models/canvas_agent.py
app/services/canvas_agent/
  runtime.py
  context.py
  planner.py
  schemas.py
  policy.py
  capabilities.py
  adapter.py
  executor.py
  events.py
  artifacts.py
```

前端建议：

```text
frontend/src/canvas/agent-state.js
frontend/src/canvas/agent-panel.js
frontend/src/canvas/agent-client.js
frontend/src/canvas/agent-events.js
frontend/src/canvas/agent-plan.js
frontend/src/canvas/agent-artifacts.js
```

当前画布采用经典 `<script>` 共享作用域，第一阶段应遵循现有加载方式，通过少量桥接函数调用 `createPromptNode`、节点创建、连线、渲染和保存逻辑。不要把 Agent 项目和画布模块化重构绑在同一个版本中。

## 20. 数据表

建议新增：

```text
canvas_agent_runs
canvas_agent_messages
canvas_agent_plans
canvas_agent_operations
canvas_agent_artifacts
canvas_agent_events
```

字段原则：

- JSON 内容保存 schema version。
- message、plan、operation、artifact 分表，避免每轮覆盖整段 JSON。
- operation 保存幂等键和实际结果。
- event 使用递增 sequence，支持客户端断线续传。
- 大媒体只保存 file_id，不复制 data URL。

## 21. 安全设计

- 服务端重新鉴权 canvas、node、file 和 provider。
- 工具和 Patch 操作使用严格白名单。
- 外部 URL、文件引用和多模态输入复用现有安全解析逻辑。
- 画布媒体中的文字视为不可信内容，不能提升 Agent 权限。
- 用户输入、模型输出和工具结果分别标记来源。
- 系统提示词不能把“模型自称已执行”当作真实结果。
- 只有 Executor 的 operation result 才能改变 Run 的业务状态。
- 日志不保存密钥、原始 data URL 和不必要的完整 Prompt。

## 22. 可观测性

建议记录：

```text
agent_run_duration_seconds
agent_planner_latency_seconds
agent_context_node_count
agent_context_token_estimate
agent_operation_total{type,status}
agent_confirmation_total{decision}
agent_replan_total{reason}
agent_task_failure_total{provider,error_code}
agent_run_total{mode,status}
```

每条日志包含 `run_id`、`canvas_id`、`operation_id` 和 `request_id`，不记录敏感媒体内容。

## 23. 测试策略

### 单元测试

- 语义计划 Schema。
- Capability Resolver。
- Policy 风险分级。
- Canvas Adapter。
- Patch 校验和幂等。
- RH/XML/Fence 兼容解析器。
- Artifact 版本与 stale 传播。

### 集成测试

- 创建 Run 到计划确认。
- 画布版本冲突和重新规划。
- 创建节点后提交生成任务。
- 取消、超时和可重试失败。
- WebSocket/SSE 断线续传。
- 用户节点权限保护。

### 端到端测试

- Fast Track 图片转视频。
- 三镜头产品广告。
- Doc Chain 角色锚点确认到 Shot List。
- 页面刷新后恢复 Run。
- 多端同时编辑画布。

## 24. 分阶段实施

### Phase 0：协议基础

- 定义 Run、Plan、Operation、Artifact 和 Event Schema。
- 建立 Capability Registry。
- 增加 Canvas Adapter 和 Patch Validator。

### Phase 1：Fast Track 闭环

- Agent 侧栏。
- 创建 Run 和消息接口。
- 读取选区和相关子图。
- 创建 Prompt/图片/视频节点及连线。
- 计划确认、执行、进度、取消和重试。
- 页面刷新恢复。

### Phase 2：可靠性和增量编辑

- 版本冲突处理。
- 用户节点操作授权。
- Prompt 修改和局部分支。
- 运行结果 Review。
- Quick Actions。

### Phase 3：Doc Chain

- Artifact 编辑与确认。
- Brief、剧本、资产清单和 Shot List。
- Anchor First 和 Prompt Compiler。
- 上游变更后的 stale 传播。

### Phase 4：高级编排

- 成本预测和预算策略。
- 多专业 Planner，但仍共用同一个 Runtime。
- 模板复用和质量评估。
- 跨画布项目资产，仅在权限模型完善后开放。

## 25. MVP 验收标准

用户输入“把选中的产品图做成三个竖屏广告镜头”后：

1. 系统获取选中节点和相关子图。
2. Planner 生成语义计划，不输出内部节点 JSON。
3. Adapter 生成版本化 Canvas Patch。
4. 确认卡展示节点、模型能力、比例、数量和运行方式。
5. 用户批准后原子创建节点和连线。
6. Executor 幂等提交生成任务。
7. 前端实时显示每个 operation 和任务状态。
8. 刷新页面后仍能恢复 Run。
9. 用户同时移动节点不会丢失 Agent 结果。
10. 任一失败步骤可以单独重试，不重复创建成功节点。

达到以上标准后，再进入 Doc Chain。第一版不应同时实现多 Agent、长期记忆和完整广告片管线，否则会掩盖底层 Run、Patch 和幂等机制的问题。

## 26. 技术栈与选型

### 26.1 选型原则

第一版优先复用 MediaForge 已有基础设施。Agent 是业务编排能力，不应为它立即引入新的 Agent 框架、消息队列或前端框架。新增依赖必须解决明确的可靠性或性能问题。

| 层级 | 选型 | 用途 | 第一版决策 |
| --- | --- | --- | --- |
| 后端语言 | Python 3.11+ | Agent Runtime、策略、适配器与任务编排 | 复用 |
| Web API | FastAPI | Run、确认、取消、事件和鉴权接口 | 复用 |
| 数据模型 | Pydantic v2 | API、Plan、Patch、Operation、Artifact Schema | 复用 |
| LLM 接入 | 现有 OpenAI-compatible Provider Gateway + `httpx` | Planner、摘要、Prompt Compiler | 复用 |
| 关系数据 | PostgreSQL + `psycopg`/连接池 | Run、消息、计划、操作、Artifact、事件审计 | 复用 |
| 短期协调 | Redis + hiredis | 分布式锁、幂等缓存、限流、Pub/Sub、任务恢复索引 | 复用 |
| 实时事件 | 现有 WebSocket + Redis Pub/Sub | 画布协作、Agent 运行进度和断线通知 | 第一版复用 |
| 对象存储 | MinIO | 图片、视频、文档附件及缩略图 | 复用 |
| 前端 | 原生 JavaScript、HTML/CSS、Vite 5 | Agent 侧栏、确认卡、Artifact 视图 | 复用 |
| 前端测试 | Vitest | Parser、状态、事件和计划 UI 测试 | 复用 |
| 后端测试 | Pytest | Runtime、Policy、Patch、并发和 API 测试 | 复用 |
| 指标 | Prometheus Client | 延迟、失败、确认率和成本类指标 | 复用 |
| 部署 | Docker + Uvicorn | 单体服务部署 | 复用 |

### 26.2 后端实现

Agent Runtime 使用 `asyncio`/`anyio` 驱动，不阻塞 FastAPI 请求线程。LLM 调用、媒体检查和外部生成任务复用现有 `httpx` 与 provider 操作限流机制。

建议保持以下边界：

```text
Router       HTTP 请求、鉴权、响应与事件订阅
Runtime      状态机和编排循环
Planner      LLM 调用与结构化计划解析
Policy       权限、风险、额度和操作上限
Adapter      语义计划 <-> 当前画布节点/连线
Executor     数据库事务、Patch、任务提交和幂等
Repository   PostgreSQL 与 Redis 访问
```

不建议在第一版接入 LangChain、LangGraph、AutoGen 或 CrewAI。它们会把 Agent 状态、工具语义和重试机制分散到第三方抽象中，而当前需求更适合显式、可测试的有限状态机。将来需要多 Agent 协作时，也应先以内部 `Planner` 接口实现专业角色，再评估是否引入框架。

### 26.3 数据与缓存

PostgreSQL 保存长期事实，JSON 内容使用明确的 `schema_version`，并将常用查询字段拆为普通列：

```text
canvas_agent_runs: canvas_id, status, phase, base_canvas_version, updated_at
canvas_agent_operations: run_id, idempotency_key, type, status, created_at
canvas_agent_events: run_id, sequence, type, created_at
canvas_agent_artifacts: run_id, type, version, status, created_at
```

Redis 只保存可过期的协调数据：

```text
agent:run:{run_id}:lock              防止同一 Run 并行推进
agent:operation:{idempotency_key}    短期幂等去重
agent:events:{run_id}:latest         最近事件序号/恢复索引
agent:context:{canvas_id}:{version}  短期上下文缓存
```

Redis 不作为唯一的 Run 状态存储。Redis 不可用时，持久化状态和操作审计仍必须留在 PostgreSQL 中。

### 26.4 流式与异步任务

第一版沿用现有 WebSocket 和 Redis Pub/Sub 广播 Agent 事件，事件带 `run_id` 与递增 `sequence`。客户端断线后通过 `GET /api/canvas-agent/runs/{run_id}` 获取状态，并按最后已见 sequence 补拉事件。

外部图片/视频任务继续使用当前 Canvas Task/RunningHub/ComfyUI 任务机制。Agent Runtime 只负责提交和观察任务，不能把轮询逻辑复制一份：

```text
Agent Operation -> 现有任务服务 -> Provider
                                      |
Agent Event <- 现有任务状态/结果 <---+
```

当 Agent 的长流程需要脱离 HTTP 请求运行时，优先使用现有 worker 进程和 Redis 锁扩展 `app/workers/canvas.py` 的模式；第一版不引入 Celery。只有出现多类型、独立伸缩、严格投递语义的后台作业后，再评估专用队列。

### 26.5 前端实现

Agent UI 延续当前 Canvas 的经典 `<script>` 共享作用域和 Vite 构建方式。第一版不引入 React、Vue 或状态管理库，避免同一画布同时存在两套状态模型。

推荐前端模块职责：

```text
agent-state.js    Run、事件游标、侧栏可见状态
agent-client.js   REST/WebSocket 调用、重连和事件去重
agent-panel.js    对话、确认卡、Quick Actions、错误展示
agent-plan.js     Plan/Patch 差异预览和节点高亮
agent-artifacts.js Doc Chain 文档和锚点版本展示
```

与现有 `nodes`、`canvas`、`selectedIds`、`scheduleSave`、`render` 的交互集中在少量桥接函数中。Agent UI 不得自行维护一份可写的完整画布副本。

### 26.6 LLM 结构化输出

优先级如下：

1. Provider 支持 JSON Schema/structured output 时，直接要求 `SemanticPlan` JSON。
2. Provider 仅支持 tool calling 时，使用单个内部 `submit_semantic_plan` 工具并校验参数。
3. 仅支持文本输出时，以受限 Markdown JSON Fence 作为降级方案。
4. RH/OpenClaw `<tool_call>` 仅由兼容 Adapter 解析，不能成为 MediaForge 的主协议。

所有路径最终都进入同一个 Pydantic `SemanticPlan` 校验器；解析失败时只允许一次格式修复请求，随后进入 `blocked` 并保留原始输出供诊断。

### 26.7 后续可选组件

以下组件不属于 MVP，达到明确门槛后再引入：

| 组件 | 引入条件 | 作用 |
| --- | --- | --- |
| SSE 独立通道 | WebSocket 混合画布和 Agent 事件产生背压 | 单向高频 Agent 流式输出 |
| 专用队列 | 长任务需要独立扩缩容或可靠投递 | 后台 Agent Run 调度 |
| pgvector | 需要跨项目检索大量文档/资产语义 | 项目记忆和检索增强 |
| Temporal/工作流引擎 | 需要跨天审批、复杂补偿或人工流程 | Durable Workflow |
| 多 Agent 框架 | 专业角色协作超过显式状态机维护能力 | Agent 协作抽象 |

在引入前应先用指标证明瓶颈存在，例如 Run 队列等待时间、事件延迟、任务重试率或文档检索命中率。
