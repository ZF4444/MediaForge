# MediaForge 画布 Agent 最终架构方案

## 1. 结论

MediaForge 的画布 Agent 是一个“服务端编排、客户端呈现、画布协议驱动”的创作运行时。

推荐架构：

```text
用户 -> Agent 面板 -> FastAPI -> Deep Agents Runtime -> Skills / LangChain Tools
                                      |                    |
                                      v                    v
                               LangGraph Checkpoint   Policy/Validator
                                      |                    |
                               Agent Run Store -> Executor -> Canvas Patch
                                                     |
                                                     v
                                               Event Stream -> 客户端
```

核心原则：

1. Agent 的计划、操作和运行状态必须是结构化数据，不依赖自由文本解析。
2. 服务端是 Agent Run、权限、确认、幂等和审计的权威来源。
3. 画布改动通过版本化 Patch 执行，不能让模型直接修改画布 JSON。
4. 客户端工具只负责选区、视口、确认弹窗等浏览器能力。
5. Fast Track 与 Doc Chain 共用同一套 Planner、Patch、Executor 和事件协议。

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

### 4.3 Agent Runtime（Deep Agents）

使用 Deep Agents `create_deep_agent` 作为主 Agent Harness，负责 Skill 发现、上下文管理、工具调用循环和人工介入。Deep Agents 底层使用 LangChain 模型与 LangGraph 运行时；它不拥有画布与业务审计事实，负责：

- 加载 Run 和会话状态。
- 构造画布上下文。
- 按需加载匹配的 Skill，并调用受控工具。
- 校验计划。
- 请求确认。
- 执行 Patch 或生成任务。
- 处理工具结果和失败。
- 决定继续规划、请求输入、请求确认或结束。

每次推进使用 `thread_id = run_id`；Deep Agents 编译图接入 PostgreSQL Checkpointer。Run、Plan、Operation、Artifact 和 Event 仍由 MediaForge PostgreSQL 表保存，不能仅依赖 checkpoint 恢复业务状态。

### 4.4 Planner 与 Skills（Deep Agents + LangChain）

Deep Agents 使用 LangChain 的模型统一接口、结构化输出和 `@tool` 生成语义计划，不直接输出 MediaForge 节点的完整内部对象。Skill 遵循 Agent Skills 的 `SKILL.md` 格式，启动时只加载名称和描述，命中后才读取完整流程、参考资料和模板。Fast Track 的 Planner 以受限 `SemanticPlan` schema 输出。

第一版 Skill 仅覆盖只读知识与创作流程，例如 `product-ad-creative`、`shot-list`、`prompt-pack` 和 `canvas-capabilities`。Skill 不能直接写画布、运行脚本、发起网络请求或加载用户未授权资产；任何画布修改都必须通过下文定义的受控执行工具。

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

### 12.1 Deep Agents 主运行图

```text
START
  -> load_run
  -> gather_context
  -> deep_agent
       -> discover_skill -> read_skill -> read_context / submit_semantic_plan
  -> validate_plan
  -> [awaiting_input | awaiting_confirmation | apply_patch | finish | block]

awaiting_input / awaiting_confirmation -- Command(resume=...) --> validate_resume
  -> [plan_or_answer | apply_patch | finish | block]

apply_patch -> submit_tasks -> observe_results -> review
  -> [deep_agent | finish | block]
```

- `load_run` 从业务库读取权威 Run，并校验当前用户和画布权限；checkpoint 只用于恢复 Deep Agents 的短期 Graph 状态。
- `deep_agent` 是 `create_deep_agent` 生成的主图。它通过 LangChain Chat Model 生成回复与计划；`submit_semantic_plan` 是唯一可提交变更意图的写语义工具，参数必须通过 Pydantic `SemanticPlan` 校验。
- `validate_plan`、`apply_patch`、`submit_tasks` 是确定性 LangGraph 节点，内部调用现有 Policy、Adapter、Executor；模型没有数据库、任意 HTTP、MCP、shell、脚本执行或通用画布 JSON 工具。
- Deep Agents 对 `submit_semantic_plan` 配置 `interrupt_on`，在计划被接受前暂停。API 将问题/确认事件写入业务库后返回，`answers`/`confirm` API 在验证 `plan_version` 后以 `Command(resume=...)` 恢复同一 `thread_id`；批准路径才进入确定性的 `apply_patch`。
- 副作用节点先用 `Agent Operation.idempotency_key` 获取或创建操作记录，再调用下游服务；LangGraph 从 checkpoint 重放时不得重复创建节点或提交任务。
- Graph 状态仅保存 `run_id`、计划版本、上下文引用、待恢复请求和安全的摘要，不写入原始 data URL、密钥或完整媒体内容。

### 12.2 Deep Agents 安全配置

主 Agent 使用只读 Skill Backend：只允许读取服务端投影出的 `/skills` 和当前 Run 的 Context Snapshot。必须显式禁用或不注册 `write_file`、`edit_file`、`delete`、`execute`、解释器、MCP、通用 `task` 子 Agent 和动态子 Agent；Skill 的 `scripts/` 仅作为审核过的参考文件，第一版不执行。

允许暴露给模型的工具只有：

```text
read_canvas_context      读取服务端构造的相关子图
read_capability_registry 读取可用能力与约束
read_artifact            读取当前 Run 有权限的 Artifact
submit_semantic_plan     提交受 Schema 校验的变更意图
request_clarification    请求结构化用户输入
```

计划执行不是模型工具：确认 API 校验 `plan_version` 后由 Runtime 以受控恢复数据驱动 `apply_patch` 和任务提交。这样 Deep Agents 的 Skill 与工具循环不会绕过确认、Policy、Patch Validator 和 Executor。

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
  deep_agent.py
  skill_backend.py
  skills.py
  tool_policy.py
  state.py
  runtime.py
  context.py
  planner.py
  tools.py
  checkpoint.py
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
canvas_agent_skills
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
- Deep Agents Skill 发现、渐进加载与只读权限。
- Deep Agents `interrupt_on`、LangGraph `Command(resume=...)` 和 checkpoint 恢复。
- Skill 与工具白名单：不得暴露文件写入、脚本执行、MCP 或子 Agent。
- 副作用节点的 checkpoint 重放不重复执行。
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
- 接入新版 Deep Agents、LangChain、LangGraph、PostgreSQL Checkpointer，并实现最小主图、Skill Backend 与 Run 恢复测试。

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
- 编写并注册创意、镜头、Prompt Pack 等只读 Skill。
- Anchor First 和 Prompt Compiler。
- 上游变更后的 stale 传播。

### Phase 4：高级编排

- 成本预测和预算策略。
- 多专业 Planner 子图，但仍共用同一个 Runtime、Policy、Patch 和 Executor。
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

达到以上标准后，再进入 Doc Chain。第一版不启用 Deep Agents 的通用子 Agent、长期记忆、文件写入或完整广告片管线，否则会掩盖底层 Run、Patch 和幂等机制的问题。

## 26. 技术栈与选型

### 26.1 选型原则

第一版优先复用 MediaForge 已有基础设施，并以新版 Deep Agents 作为主 Agent 框架：它提供 Agent Skills、上下文管理、工具循环和人工确认；LangChain 提供模型、结构化输出与工具基础，LangGraph 提供持久化运行时、流式和恢复。框架不拥有业务事实、权限和副作用，仍由 MediaForge 服务端控制。

| 层级 | 选型 | 用途 | 第一版决策 |
| --- | --- | --- | --- |
| 后端语言 | Python 3.11+ | Agent Runtime、策略、适配器与任务编排 | 复用 |
| Web API | FastAPI | Run、确认、取消、事件和鉴权接口 | 复用 |
| 数据模型 | Pydantic v2 | API、Plan、Patch、Operation、Artifact Schema | 复用 |
| 主 Agent 框架 | `deepagents>=0.7,<1` | Skill、上下文管理、受控工具循环与人工确认 | 新增 |
| Agent 框架 | `langchain>=1,<2` | Chat Model、结构化输出、工具与中间件 | 新增 |
| Agent 运行时 | `langgraph>=1,<2` | Deep Agents 底层状态图、`interrupt`、流式与恢复 | 新增 |
| Graph 持久化 | `langgraph-checkpoint-postgres` | Graph checkpoint，支持暂停后恢复与故障续跑 | 新增 |
| LLM 接入 | LangChain Chat Model Adapter + 现有 Provider Gateway | Planner、摘要、Prompt Compiler；保留既有 Provider 鉴权与限流 | 改造复用 |
| 关系数据 | PostgreSQL + `psycopg`/连接池 | Run、消息、计划、操作、Artifact、事件审计 | 复用 |
| 短期协调 | Redis + hiredis | 分布式锁、幂等缓存、限流、Pub/Sub、任务恢复索引 | 复用 |
| 实时事件 | 现有 WebSocket + Redis Pub/Sub | 画布协作、Agent 运行进度和断线通知 | 第一版复用 |
| 对象存储 | MinIO | 图片、视频、文档附件及缩略图 | 复用 |
| 前端 | 原生 JavaScript、HTML/CSS、Vite 5 | Agent 侧栏、确认卡、Artifact 视图 | 复用 |
| 前端测试 | Vitest | Parser、状态、事件和计划 UI 测试 | 复用 |
| 后端测试 | Pytest | Runtime、Policy、Patch、并发和 API 测试 | 复用 |
| 指标 | Prometheus Client | 延迟、失败、确认率和成本类指标 | 复用 |
| 部署 | Docker + Uvicorn | 单体服务部署 | 复用 |

依赖版本以锁文件中的当前稳定新版为准；生产环境锁定兼容的 Deep Agents、LangChain、LangGraph 和 checkpoint 包版本，升级四者必须作为同一次兼容性验证。开发环境可使用 `uv add deepagents langchain langgraph langgraph-checkpoint-postgres` 安装。

不引入 AutoGen 或 CrewAI。Deep Agents 的文件系统、脚本执行、MCP 与子 Agent 不是本产品的默认能力，必须按第 12.2 节关闭；专业角色通过 Skill 组织，后续确有必要时才引入受限的 Deep Agents 子 Agent。

### 26.2 后端实现

Agent Runtime 使用 `asyncio`/`anyio` 驱动，不阻塞 FastAPI 请求线程。Deep Agents 主图通过 `ainvoke`/`astream` 执行，底层由 LangGraph 恢复和持久化；LLM 调用、媒体检查和外部生成任务复用现有 `httpx` 与 provider 操作限流机制。

建议保持以下边界：

```text
Router       HTTP 请求、鉴权、响应与事件订阅
Runtime      Graph 入口、Run 推进与事件映射
Deep Agent   Skills、上下文管理、工具循环与 interrupt_on
Skill Backend 只读 Skill/Context 文件投影、Skill 注册与权限过滤
LangGraph    Deep Agents 底层状态图、Checkpoint、恢复与流式
Planner      LangChain 模型调用与 SemanticPlan 结构化输出
Tools        只读上下文工具与 submit_semantic_plan 定义
Policy       权限、风险、额度和操作上限
Adapter      语义计划 <-> 当前画布节点/连线
Executor     数据库事务、Patch、任务提交和幂等
Repository   PostgreSQL 与 Redis 访问
```

图状态使用 TypedDict 或 Pydantic 明确建模，至少包含 `run_id`、`plan_version`、`context_ref`、`semantic_plan`、`pending_interrupt`、`last_operation_id`、`retry_count` 和 `next_action`。消息历史只保留当前 Run 必需的摘要与引用；`canvas_agent_messages` 是完整对话记录的权威来源。

Deep Agents 技能和工具按权限分层：模型可调用的 Skill 只能读取已构造的 Context Snapshot 与审核后的 `/skills`；唯一提交意图的 `submit_semantic_plan` 不产生副作用，之后由 Policy 验证并交给确定性 Graph 节点。这样 Deep Agents 的工具循环不会绕过 Patch Validator、确认和幂等控制。

### 26.3 数据与缓存

PostgreSQL 保存长期事实、Skill 注册元数据和 LangGraph checkpoint，JSON 内容使用明确的 `schema_version`，并将常用查询字段拆为普通列：

```text
canvas_agent_runs: canvas_id, status, phase, base_canvas_version, updated_at
canvas_agent_operations: run_id, idempotency_key, type, status, created_at
canvas_agent_events: run_id, sequence, type, created_at
canvas_agent_artifacts: run_id, type, version, status, created_at
canvas_agent_skills: name, version, status, content_ref, permission_profile, updated_at
```

Redis 只保存可过期的协调数据：

```text
agent:run:{run_id}:lock              防止同一 Run 并行推进
agent:operation:{idempotency_key}    短期幂等去重
agent:events:{run_id}:latest         最近事件序号/恢复索引
agent:context:{canvas_id}:{version}  短期上下文缓存
```

Redis 不作为唯一的 Run 状态存储。Redis 不可用时，持久化状态和操作审计仍必须留在 PostgreSQL 中。

LangGraph Checkpointer 使用 `thread_id = run_id`，只保存 Deep Agents 主图的可恢复执行快照。每次恢复都先读取 `canvas_agent_runs` 与最新计划版本，发现 Run 已取消、权限变化或计划版本不匹配时终止恢复。设置 checkpoint 保留策略和定期清理，避免长对话无限增长；不使用内存 Checkpointer 作为生产存储。

### 26.4 流式与异步任务

第一版沿用现有 WebSocket 和 Redis Pub/Sub 广播 Agent 事件，事件带 `run_id` 与递增 `sequence`。Graph 的 `astream` 输出经 Runtime 映射到既有 `agent.*` 事件，不能将 LangGraph 内部事件直接暴露给客户端。客户端断线后通过 `GET /api/canvas-agent/runs/{run_id}` 获取状态，并按最后已见 sequence 补拉事件。

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

### 26.6 Deep Agents、Skills 与结构化工具

优先级如下：

1. 使用 Deep Agents `create_deep_agent` 创建主 Agent，并通过 LangChain Chat Model Adapter 连接现有 OpenAI-compatible Provider Gateway；Provider、模型、密钥和限流继续由现有 Resolver/Gateway 决定。
2. Skill 使用 Agent Skills 标准的 `SKILL.md`，经 `canvas_agent_skills` 注册、版本化和权限过滤后投影到只读 Backend。启动时仅暴露 `name`、`description`，命中后才读取完整 Skill。
3. Provider 支持 JSON Schema/structured output 时，使用 `with_structured_output(SemanticPlan)`；否则使用唯一的内部 `submit_semantic_plan` tool calling 并校验参数。
4. 不支持 JSON Schema structured output 或标准 tool calling 的 Provider 不接入画布 Agent。
5. 不启用默认文件写入、脚本执行、MCP 或子 Agent；如未来单独开放，必须为每个 Skill、工具和用户授权增加白名单与确认策略。

所有路径最终都进入同一个 Pydantic `SemanticPlan` 校验器；结构化参数校验失败时，随后进入 `blocked` 并保留 Provider 响应用于诊断。Deep Agents 的 Skill 只负责指导和读取，LangChain middleware 可用于观测和模型路由，但 Policy、确认、额度、重试上限和副作用幂等仍在确定性 Graph 节点中执行。

### 26.7 后续可选组件

以下组件不属于 MVP，达到明确门槛后再引入：

| 组件 | 引入条件 | 作用 |
| --- | --- | --- |
| SSE 独立通道 | WebSocket 混合画布和 Agent 事件产生背压 | 单向高频 Agent 流式输出 |
| 专用队列 | 长任务需要独立扩缩容或可靠投递 | 后台 Agent Run 调度 |
| pgvector | 需要跨项目检索大量文档/资产语义 | 项目记忆和检索增强 |
| Temporal/工作流引擎 | 需要跨天审批、复杂补偿或人工流程 | Durable Workflow |
| 受限 Deep Agents 子 Agent | 需隔离长文本研究，且通过成本、权限与质量评估 | 只读、无画布写入的专业研究任务 |
| LangSmith（可选） | 需要跨 Run 可视化追踪、评估与提示词迭代 | 仅上传脱敏 trace，不替代本地审计 |

在引入前应先用指标证明瓶颈存在，例如 Run 队列等待时间、事件延迟、任务重试率或文档检索命中率。
