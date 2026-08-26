# Agent 运行事件总线开发计划

> 状态：待实施
>
> 关联设计：[Agent运行事件总线方案.md](Agent运行事件总线方案.md)
>
> 范围：Canvas Agent 的命令受理、LangGraph 运行进度、Patch Executor、画布任务、Artifact 相关事件和浏览器实时消费。

## 1. 目标与边界

本计划实施 **Agent 运行事件总线**（Agent Run Event Bus，AREB）。目标是让 Agent Run 的执行状态具备以下性质：

1. 事件先持久化，再异步分发；WebSocket、Redis 都不是事实来源。
2. 一个 `run_id` 同时作为业务 Run、LangGraph `thread_id`、事件分区键和幂等键前缀。
3. 长耗时命令立即返回 `202 Accepted`，浏览器通过事件流看到模型、工具、确认和执行进度。
4. 所有进程、所有接口走同一事件出口，避免路由直接向本进程 WebSocket 广播。
5. Redis、WebSocket 或页面连接短暂不可用时，可由按 sequence 拉取的 HTTP 接口无丢失恢复。

本期不改变以下边界：

- LangGraph 继续为主编排，`MediaForgeChatModel` 继续通过 LangChain 接入。
- `SemanticPlan` 仍是计划契约；`Patch Executor` 仍是唯一的画布写入边界。
- Provider 参数 Schema resolver、业务 store 和现有画布任务队列继续复用。
- 不重新引入 Deep Agents、filesystem backend 或 subagent 配置。

## 2. 现状基线

| 区域 | 已有能力 | 本期缺口 |
| --- | --- | --- |
| 事件存储 | `canvas_agent_events` 按 Run 有 sequence | 只有 `type/payload_json`，无 operation、phase、severity、outbox |
| 事件写入 | `emit_agent_event()` 写库后本地广播 | 数据提交与广播双写；不能跨 API worker 可靠投递 |
| WebSocket | `/ws/stats` 已按 user 隔离，已有 Redis Pub/Sub bridge | `agent.*` 未接入远程投递；iframe 主动跳过连接 |
| 前端面板 | 能恢复历史 events 并轮询 | `send/answer/confirm` 在长 HTTP 返回后才开始消费；状态文本被 Run 摘要覆盖 |
| 命令执行 | `/messages`、`/answers`、`/confirm` 同步执行 LangGraph/Patch | HTTP 生命周期绑住长操作，刷新或超时无法可靠追踪 |
| 业务副作用 | Patch Executor、task dispatch、Artifact 接口已经产生事件 | 事件命名、operation 关联和失败语义不统一 |

当前初始化使用 `app/services/business_metadata.py` 的幂等 DDL，而非独立 Alembic 迁移。本计划沿用该模式：所有新表使用 `CREATE TABLE IF NOT EXISTS`，增列使用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`，并提供可重复运行的 backfill。

## 3. 固定技术决策

| 决策 | 结论 | 原因 |
| --- | --- | --- |
| 事件事实来源 | PostgreSQL `canvas_agent_events` | 可排序、可恢复、与 Run/Operation 原子提交 |
| 分发 | 专用 Redis Pub/Sub topic `agent.event.v1` | 将可靠事件与一般 WebSocket 通知隔离；消息丢失由数据库补偿 |
| 投递 | 复用 `ConnectionManager` 和 `/ws/stats` | 避免新增第二套认证、重连和浏览器连接 |
| 长命令队列 | PostgreSQL Operation + Redis Streams worker | Operation 是权威状态，Redis 仅负责唤醒和调度 |
| 幂等 | `run_id:type:client_request_id` | 页面重试、网络重放不会触发第二次模型调用或 Patch |
| 事件格式 | versioned envelope，客户端按 `(run_id, sequence)` 去重 | 允许协议演进，确保乱序/重复投递安全 |
| 取消 | Operation cancellation flag + 阶段边界检查 | 不能强杀模型请求；Patch 和任务提交前必须二次检查 |

不采用“在路由内先写业务数据、再直接 `broadcast_to_user()`”的方案；多 worker、Redis 短暂故障和进程崩溃都会造成客户端永久缺事件。

## 4. 交付物清单

| 交付物 | 主要位置 | 完成标准 |
| --- | --- | --- |
| 事件协议与常量 | `app/services/canvas_agent/event_types.py` | 所有合法 event type、phase、severity 可校验 |
| 事件服务 | `app/services/canvas_agent/event_bus.py` | 一次事务内写事件、outbox、可选 Run/Operation 状态 |
| 数据与 store 接口 | `business_metadata.py`、`canvas_agent/store.py` | sequence 唯一、Operation lease、outbox claim/ack/retry |
| Outbox publisher | `app/workers/agent_event_outbox.py` | 至少一次发布、退避、死信和指标 |
| Command worker | `app/workers/agent_commands.py` | 消费 message/answer/confirm，Run 内串行、崩溃可重领 |
| WebSocket bridge | `app/core/ws.py`、新 `app/core/agent_event_pubsub.py` | 任意 API worker 可投递到本地连接 |
| 路由适配 | `app/routers/canvas_agent.py` | 长命令返回 `202` + `operation_id`，无同步模型/Patch |
| LangGraph 适配 | `canvas_agent/runtime.py`、`tools.py` | 真实节点/工具事件带 operation_id 与 tool 元数据 |
| 前端事件客户端 | `frontend/src/canvas/agent/*`、构建产物 | 发送前订阅、按 sequence 合并、断线补偿、iframe 可收事件 |
| 测试与运行手册 | `tests/`、`docs/` | 单元、集成、多 worker、断线、幂等、故障演练齐全 |

## 5. 数据模型与兼容迁移

### 5.1 第一次迁移

向 `canvas_agent_events` 增加：

```text
operation_id   TEXT NULL
phase          TEXT NULL
severity       TEXT NOT NULL DEFAULT 'info'
schema_version INTEGER NOT NULL DEFAULT 1
```

新增 `canvas_agent_event_outbox`：

```text
id, event_id (UNIQUE), run_id, user_id, topic, payload_json,
status, attempts, available_at, delivered_at, last_error,
created_at, updated_at
```

向 `canvas_agent_operations` 增加：

```text
client_request_id TEXT NOT NULL DEFAULT ''
lease_owner       TEXT NULL
lease_until       BIGINT NULL
cancel_requested_at BIGINT NULL
started_at        BIGINT NULL
finished_at       BIGINT NULL
```

索引：

- `canvas_agent_events(run_id, sequence)` 保持唯一约束。
- `canvas_agent_events(operation_id, sequence)` 供 Operation 时间线查询。
- `canvas_agent_event_outbox(status, available_at, created_at)` 供 worker claim。
- `canvas_agent_operations(status, lease_until, created_at)` 供 command worker claim。
- 部分唯一索引保证同一 Run 同一类规划/确认命令只有一个运行中 Operation。

### 5.2 兼容期

1. 保留旧表字段、旧 `/events` 响应和 `agent.progress` WebSocket 消息。
2. `AgentEventService` 同时写结构化事件和兼容旧事件，不改变旧客户端消费行为。
3. 新前端优先处理结构化 envelope，未识别事件回退到 `payload.message`。
4. 观察一个发布周期后，删除路由对旧 `emit_agent_event` 的直接依赖；旧事件别名至少保留一个版本。

### 5.3 数据回填与回滚

- 不回填历史 Operation 关联；旧事件 `operation_id = NULL` 合法。
- 不回填 Outbox；上线前已存在的事件仍可通过 `/events` 获取。
- 回滚应用版本时保留新增列和表，它们均对旧代码无害。
- 禁止删除 `canvas_agent_events` 历史数据作为迁移步骤。

## 6. 分阶段开发计划

### M0：基线与契约冻结

**目标：** 在动业务链路前固定协议、可观测指标与测试夹具。

工作项：

1. 增加 `event_types.py`：事件类型、phase、severity、可公开 payload 字段白名单、最大 payload 尺寸。
2. 为事件 envelope 定义 Pydantic model，字段固定为 `schema_version/id/sequence/run_id/operation_id/type/phase/severity/created_at/payload`。
3. 补齐测试 fixture：可控时钟、假 Redis Pub/Sub、双 `ConnectionManager`、假 LangGraph 模型和 Patch Executor。
4. 明确指标名称、日志字段和告警阈值；先加入空指标，不等待功能全部上线。

验收：协议单测覆盖未知 type、非法 phase、敏感字段、超大 payload；旧 event 仍可被现有 Agent 面板渲染。

### M1：持久事件与 Transactional Outbox

**目标：** 把“事件写库 + 后续投递”收敛为单一、原子服务。

工作项：

1. 在 `business_metadata.py` 增加幂等 DDL、索引及历史环境的增列保护。
2. 实现 `AgentEventService.append()` 和 `append_in_transaction()`：在同一 PostgreSQL transaction 中分配 sequence、插入 event、插入 outbox、更新必要的 Run/Operation 状态。
3. 将脱敏、字段白名单、payload 截断和事件校验放在服务内，调用者不能绕过。
4. 把现有 `emit_agent_event()` 改为兼容包装，只委托 `AgentEventService`，不再直接调用 WebSocket。
5. 扩展 `list_events()` 返回新 envelope，但保持旧字段兼容；增加按 `operation_id` 查询能力。

验收：

- 并发追加同一 Run 的 100 个事件，sequence 无重复、无间隙。
- 注入 outbox 插入失败时，业务状态和 event 都回滚。
- 注入 WebSocket/Redis 故障时，event 与 outbox 仍成功提交。

### M2：Outbox Publisher 与跨进程投递

**目标：** 任意 API worker 写出的事件都能由所有持有用户连接的 worker 投递。

工作项：

1. 新增 `agent_event_outbox` worker：使用 `FOR UPDATE SKIP LOCKED` claim pending/retrying 记录，发布到 `agent.event.v1`，成功 ack，失败指数退避。
2. 设定 lease、最大尝试次数、`dead` 状态和管理查询接口/日志；Publisher 可多实例运行。
3. 新增 `agent_event_pubsub.py`，订阅 `agent.event.v1`，校验 envelope 后调用 `ConnectionManager.deliver_remote_event()`。
4. 在 `ConnectionManager` 中增加 `agent.event.v1` 分支，只向 event 的 `user_id` 广播 `type: "agent.event"`，不二次 publish。
5. 在应用 lifespan 启动/停止 publisher 与 subscriber；Redis 临时不可用时 publisher 继续重试而应用不丢数据库事件。

验收：

- 双进程集成测试：A 写事件，B 维持 WebSocket，B 收到正确 envelope。
- 重复发布同一 outbox event 不导致数据库重复，客户端可按 sequence 去重。
- Redis 关闭后恢复，pending outbox 自动投递；HTTP `/events` 始终能读到事件。

### M3：前端实时消费与 iframe 修复

**目标：** 用户点击发送前开始接收事件；嵌入画布也具备实时通道。

工作项：

1. 移除 `connectAssetLibrarySyncSocket()` 对 iframe 的提前返回，沿用 `/ws/stats` 认证方式；确认嵌入时 session/cookie 可用。
2. 在 `CanvasAgentEvents` 中维护 `lastSequence`、event buffer、active operation 和补偿锁；只接受当前 `run_id` 且 sequence 更大的事件。
3. 发送消息、回答、确认前先保存 `lastSequence` 并启动 WebSocket/1 秒活跃轮询，再发 HTTP command。
4. WebSocket 重连、`visibilitychange`、检测到 sequence 缺口时调用 `/events?after_sequence=` 补偿。
5. 将 Agent 面板状态拆为 `runSummary` 与 `lastEvent`：优先显示结构化 progress 的 message/tool/错误，不允许 `renderRun()` 覆盖活跃状态。
6. 增加 tool started/completed/failed、confirmation、execution 的紧凑 UI 表示；不显示敏感输入和原始模型响应。

验收：iframe 中，从模型准备到工具调用、确认、Patch 完成均在 1 秒内更新；切断网络后重新连接不重放或漏掉已处理事件。

### M4：异步 Message 与 Answer Command

**目标：** `/messages` 和 `/answers` 不再等待 LangGraph 完成。

工作项：

1. 为 `CanvasAgentMessageRequest`、`CanvasAgentAnswerRequest` 增加 `client_request_id`；前端在每次用户动作生成 UUID 并在重试时复用。
2. 路由仅完成鉴权、Run 状态检查、持久化用户消息、创建/获取幂等 Operation、Run 状态置为 queued，以及写 `operation.accepted`；响应 `202`。
3. 新增 command worker：claim Operation 后获取 canvas context、模型、checkpointer，以 `thread_id = run_id` 调用 LangGraph。
4. worker 写 `operation.started`、节点 progress、`message.replied`/`plan.created`、`operation.succeeded` 或结构化失败事件。
5. Run 内规划操作采用 DB 锁/部分唯一索引串行化；新消息在 `completed` Run 合法，重置为 planning 而不换 thread。
6. 对 retryable provider 失败使用明确的 `failed` + retry metadata；禁止 HTTP 503 表示已经受理的异步命令失败。

验收：HTTP 在 500ms 内返回 `202`；浏览器刷新后能看到同一 Operation 继续/完成；相同 idempotency key 只发生一次模型调用。

### M5：异步 Confirm 与执行边界

**目标：** `/confirm` 从同步 LangGraph resume/Patch/任务提交迁出，同时保持现有 Patch Executor 的安全边界。

工作项：

1. `CanvasAgentConfirmRequest` 增加 `client_request_id`，已拒绝确认的低延迟路径也经 `AgentEventService` 写事件。
2. 已批准确认创建 `agent.confirm` Operation 并返回 `202`；worker 使用同一 `run_id/thread_id` resume LangGraph。
3. 在 Patch 前做三项检查：Operation 未取消、计划版本仍为最新、canvas structure version/fingerprint 未冲突。
4. Patch Executor 内的 operation 与 command operation 建立父子关联或复用 `operation_id`，避免无关的幂等 key。
5. 任务提交前后写 `progress.execution`、`patch.applied`、`tasks.queued`；任务 worker 后续的 `task.*` 也携带源 operation。
6. cancel 路由改为请求取消：更新 flag、发 `operation.cancelled_requested`；worker 在模型、工具、Patch、提交任务边界检查并落终态。

验收：确认后刷新页面不重复 Patch；取消在 Patch 前可靠阻止写入；canvas 冲突转为 `run.blocked`，不吞掉事件。

### M6：LangGraph 节点、工具和任务事件规范化

**目标：** 让用户看到真实、可诊断的 Agent 工作阶段，而不是自由文本进度。

工作项：

1. context、agent、tools、validation、confirmation、execution 节点分别发约定的 `progress.*` 事件。
2. Agent 节点在模型调用前发 `progress.model`/`progress.agent`；不得把模型思考伪装成工具执行。
3. `ToolNode` 包装器以真实 `tool_call_id` 发送 `progress.tool_started`，成功/异常分别发送 completed/failed，并附 `tool_name`、capability/provider/model 的安全摘要。
4. `read_capability_parameters`、`propose_canvas_patch` 和 Patch 校验错误均使用统一的 failure category。
5. 画布任务状态投影保持原逻辑，但改由 event service 在事务内记录任务状态、canvas version 和 outbox。
6. 在 LangGraph Checkpointer metadata 中记录 `operation_id`、`request_id`，方便追踪但不保存密钥或完整 prompt。

验收：真实 tool call 的 started/completed 成对出现；模型未产生 tool call 时只显示 agent 阶段；一个 Run 多轮消息始终使用同一 `thread_id`。

### M7：其它 Agent 接口纳入统一出口

**目标：** 移除“只有 `/messages` 才可靠”的特殊路径。

按风险由低到高接入：

1. `cancel`、`retry`、`redo`、`review`。
2. Artifact 创建、推进、状态更新、质量评估。
3. Prompt Pack 编译、生成任务提交。
4. Template 实例化、Project Asset 分享、编排提案。
5. 与 Agent Run 关联的 canvas task retry/terminal event。

每个入口要求：使用 `AgentEventService`，关联现有或新建 Operation，事件类型落在注册表内，失败不向客户端泄露供应商原始响应。

验收：代码搜索中业务路径不再直接调用 `manager.broadcast_to_user()` 发送 `agent.*`；所有 Agent 状态变化至少有一个可回放 event。

### M8：兼容清理、观测与灰度发布

**目标：** 安全地移除旧同步进度路径，具备上线后诊断能力。

工作项：

1. 增加 Prometheus 指标：command queue age、command duration、outbox pending/retry/dead、publish latency、补偿次数、WebSocket 投递失败、按 phase 的失败率与耗时。
2. 结构化日志统一带 `request_id/run_id/operation_id/thread_id/event_id/sequence`。
3. 健康检查加入 outbox oldest pending age 和 dead count；不把 Redis 短暂故障等同于业务失败。
4. 通过 feature flag 分三步灰度：仅双写 -> 新前端消费 -> 异步 command；每步均可回退到上一步。
5. 观测稳定一个发布周期后，删除旧自由文本 `progress` 的生产者与前端特殊分支，保留历史读取兼容。

验收：错误预算、死信告警和回滚开关经过演练；无长同步 `/messages`、`/answers`、`/confirm` 路径残留。

## 7. API 契约

### 7.1 异步 command 响应

适用于 `messages`、`answers`、`confirm` 和后续迁移的批量生成入口：

```json
{
  "run_id": "run_01",
  "operation_id": "op_01",
  "status": "accepted",
  "events_after_sequence": 41
}
```

- 成功受理固定使用 HTTP `202`。
- 同一 `client_request_id` 重试返回同一 `operation_id` 与当前状态，仍使用 `202` 或 `200`，但绝不重复执行。
- 请求校验、鉴权、Run 不可用、计划版本冲突仍为同步 `4xx`。

### 7.2 事件 HTTP 接口

保留并增强：

```text
GET /api/canvas-agent/runs/{run_id}/events?after_sequence=41&limit=500
```

响应包含 `{ events, next_sequence, has_more }`。事件均为 versioned envelope；`after_sequence` 只接受非负整数，最大 `limit` 为 2000。

### 7.3 WebSocket 消息

统一为：

```json
{
  "type": "agent.event",
  "data": {
    "schema_version": 1,
    "id": "evt_01",
    "sequence": 42,
    "run_id": "run_01",
    "operation_id": "op_01",
    "type": "progress.tool_started",
    "phase": "tool",
    "severity": "info",
    "created_at": 1770000000000,
    "payload": {"message": "正在读取参数定义…", "tool_name": "read_capability_parameters"}
  }
}
```

迁移期服务端可额外发送旧 `agent.progress`，但新前端只能将其视为降级兼容，而非权威状态。

## 8. 测试计划

| 层级 | 覆盖内容 |
| --- | --- |
| 单元 | event payload 脱敏/截断、event type 校验、sequence 分配、idempotency、lease、退避、状态机转换 |
| 数据库集成 | event/outbox/operation 同事务原子性、并发 Run、同 Run 互斥、worker 崩溃重领 |
| Redis 集成 | publisher retry、重复消息、subscriber 跨进程投递、Redis 宕机恢复 |
| LangGraph 集成 | 各节点事件、真实工具成对事件、interrupt/resume 使用相同 thread_id、取消边界 |
| API | `202` 契约、重复 client_request_id、`/events` 分页与补偿、权限隔离 |
| 前端单元 | sequence 去重/乱序、缺口补偿、活跃状态优先级、错误渲染 |
| Playwright | iframe 发送后立即出现进度；断网重连；确认、取消、跨页面恢复 |
| 故障演练 | Redis 不可用、publisher kill -9、command worker kill -9、模型超时、Patch 冲突、任务队列失败 |

新增的关键回归用例：

1. 创建节点后同一 Run 再发消息，新的 `agent.message` Operation 进入 planning 且 LangGraph `thread_id == run_id`。
2. `read_capability_parameters` 开始和完成各有一个可关联的工具事件，前端显示真实工具名。
3. 两个 API worker 下，HTTP 请求与 WebSocket 客户端分属不同进程仍实时可见。
4. 重复确认请求、刷新重发和 worker 重领均不重复调用 Patch Executor。
5. Redis 完全不可用时，浏览器仅靠 `/events` 仍可得到完整终态。

## 9. 发布顺序与回退

1. 先发布 M0/M1 数据库与服务，但保留旧同步路由和广播，观察 event/outbox 写入。
2. 发布 M2/M3，前端只读取新事件但命令仍同步；验证跨 worker、iframe、补偿正确性。
3. 先灰度 M4 的 `/messages`，再灰度 `/answers`，最后 M5 的 `/confirm`。每批按管理员或 feature flag 开启。
4. 发布 M6/M7 将全部 Agent 入口收敛到统一出口。
5. M8 观察稳定后清理兼容层。

回退规则：

- 禁用异步 command flag 时，路由可暂回旧同步执行，但仍调用 `AgentEventService` 记录事件。
- 禁用 Redis 分发时，前端提升 `/events` 轮询频率；不可切回无持久化的本地广播。
- 任何 Outbox dead 不自动重跑业务 Operation，只允许重投递已持久化事件。

## 10. 验收门槛

全部满足后才可标记完成：

1. 长命令接口 `P95` 受理时间小于 500ms，HTTP 不等待模型、Patch 或任务提交。
2. iframe 和独立页面均能在 1 秒内显示 context、agent、真实 tool、confirmation、execution 进度。
3. 两个 API worker 和一个 command worker 的部署下，事件无跨进程遗漏。
4. 任意断线恢复以 sequence 补齐，无重复执行、无重复 UI 消息。
5. 一次命令的每个最终业务结果均在数据库有 event，且 event 与 Operation 可关联。
6. 相同 idempotency key 不重复模型调用、Patch 或 task submission。
7. Redis 不可用不会丢失已提交事件；Redis 恢复后 outbox 清空且顺序不影响客户端正确性。
8. 所有 event payload 经过脱敏和大小限制；日志、Redis 和浏览器中不存在 API Key、Cookie、完整供应商响应或未经许可的用户私密上下文。

## 11. 实施依赖与推荐提交切分

按以下提交序列实现，便于逐步部署与回滚：

1. `feat(agent-events): add event protocol and durable outbox schema`
2. `feat(agent-events): add transactional event service and store leases`
3. `feat(agent-events): publish durable events across websocket workers`
4. `fix(canvas-agent-ui): consume sequenced events before command submission`
5. `feat(agent-commands): run messages and answers asynchronously`
6. `feat(agent-commands): run confirmations asynchronously with cancellation`
7. `refactor(agent-events): route artifacts and tasks through event service`
8. `chore(agent-events): remove legacy progress transport and add runbook`

每个提交都必须包含对应测试，且不混合 Provider Schema、节点 UI 或无关画布功能改动。
