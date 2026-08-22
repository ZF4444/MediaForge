# Agent 运行事件总线方案

> 状态：设计定稿，待实施
>
> 适用范围：画布 Agent 的 Run、LangGraph 编排、Patch Executor、画布任务和 Artifact 工作流。

## 1. 目标与结论

建立 **Agent 运行事件总线**（Agent Run Event Bus，简称 AREB）。它不是仅供前端显示的通知组件，而是 Agent Run 的可恢复执行记录与实时状态分发机制。

最终结构：

```text
浏览器命令                 Agent Command Worker
POST /runs/{id}/...  ->     执行 LangGraph / Patch / 任务提交
        |                                 |
        | 202 + operation_id              | append AgentEvent
        v                                 v
前端订阅器 <--- WS/SSE <--- Redis <--- Transactional Outbox <--- PostgreSQL
    |                                                                 |
    +---------------- GET /events?after_sequence= -------------------+
                              断线恢复 / 顺序补偿
```

核心结论：

1. `canvas_agent_events` 是事件事实来源，按 Run 内单调递增 `sequence` 排序。
2. Redis Pub/Sub 仅用于低延迟跨进程投递，不承担可靠存储；丢失时由 `/events` 补齐。
3. 所有会产生 Agent 状态变化或副作用的入口，都必须使用同一事件出口，不能自行 WebSocket 广播。
4. 长耗时动作采用异步命令，HTTP 只受理命令并返回 `202`；短操作保持同步，但仍写事件。
5. `run_id` 同时是业务 Run ID、事件分区键、LangGraph `thread_id` 和幂等键前缀。

## 2. 现状问题

当前 `emit_agent_event` 会把事件写入 `canvas_agent_events`，再向当前进程内的 WebSocket 连接广播。它存在以下缺口：

- `POST /runs/{run_id}/messages` 同步等待整个 LangGraph 结束，前端在 HTTP 返回后才启动轮询，因此执行中的 `progress/tool` 不会显示。
- 主页面通过 iframe 加载画布时，画布脚本主动不建立 WebSocket；iframe 内没有实时事件通道。
- `agent.*` 未进入既有 Redis WebSocket Pub/Sub 分发，多个 API worker 时，请求和浏览器连接落在不同进程会丢实时通知。
- 进度事件缺少规范字段，无法可靠表达 operation、图节点、工具名、尝试次数和可重试性。
- `/messages`、`/answers`、`/confirm` 都可能长时间运行，但调度边界不一致；其它 Artifact、任务、审阅接口虽会发事件，语义也不统一。

## 3. 名词与权威边界

| 名词 | 定义 | 权威来源 |
| --- | --- | --- |
| Run | 一个持续对话和执行上下文，可多轮规划 | `canvas_agent_runs` |
| Command | 用户或系统要求 Agent 做一件事的异步请求 | `canvas_agent_operations` |
| Operation | 可追踪、可幂等、可完成或失败的执行单元 | `canvas_agent_operations` |
| Event | Operation 推进过程中的不可变事实 | `canvas_agent_events` |
| Outbox | 已提交但尚未或正在投递到 Redis 的事件记录 | `canvas_agent_event_outbox` |
| Transport | WebSocket、SSE、HTTP 补偿轮询 | 非权威 |

Run 的 `completed` 表示上一轮动作完成，不表示会话关闭。新消息应在相同 `run_id/thread_id` 上创建新的 planning Operation，并把 Run 回到 `planning`。只有 `cancelled`、`failed`、`blocked` 需要显式恢复/重试策略。

## 4. 数据模型

### 4.1 扩展事件记录

保留现有 `canvas_agent_events`，增加以下字段：

```sql
ALTER TABLE canvas_agent_events
  ADD COLUMN operation_id TEXT NULL,
  ADD COLUMN phase TEXT NULL,
  ADD COLUMN severity TEXT NOT NULL DEFAULT 'info',
  ADD COLUMN schema_version INT NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX canvas_agent_events_run_sequence_uq
  ON canvas_agent_events(run_id, sequence);
CREATE INDEX canvas_agent_events_operation_idx
  ON canvas_agent_events(operation_id, sequence);
```

`payload_json` 继续保留，避免频繁修改固定表结构；新增列用于检索、过滤和前端稳定处理。

### 4.2 Transactional Outbox

```sql
CREATE TABLE canvas_agent_event_outbox (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES canvas_agent_events(id),
  run_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, publishing, delivered, retrying, dead
  attempts INT NOT NULL DEFAULT 0,
  available_at BIGINT NOT NULL,
  delivered_at BIGINT NULL,
  last_error TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX canvas_agent_event_outbox_pending_idx
  ON canvas_agent_event_outbox(status, available_at, created_at);
```

在同一个 PostgreSQL 事务内完成：追加事件、追加 outbox、更新 Operation 或 Run。禁止先提交数据库状态、再尝试即时广播的双写方式。

### 4.3 Operation

复用 `canvas_agent_operations`，补充：

```text
id                 Operation 主键
idempotency_key    <run_id>:<command_type>:<client_request_id>
type               agent.message / agent.answer / agent.confirm / artifact.* / task.*
status             accepted / queued / running / succeeded / failed / cancelled / blocked
input_json         经校验后的命令内容
result_json        完成摘要，不存大对象
```

同一个 `idempotency_key` 返回原 Operation；客户端重试不得启动第二次模型调用、Patch 或任务提交。

## 5. 统一事件协议

### 5.1 信封

所有 Event 使用同一信封：

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
  "created_at": 1770000000000,
  "payload": {
    "message": "正在读取 image.text_to_image 的参数定义…",
    "tool_name": "read_capability_parameters",
    "tool_call_id": "call_01",
    "capability": "image.text_to_image",
    "provider_id": "custom-api-2",
    "model": "gemini-3-pro-image-preview"
  }
}
```

不得在事件中放 API Key、Cookie、完整外部供应商响应、提示词中的用户私密内容或大型媒体内容。事件中的模型输出仅保存摘要、ID 或经脱敏的错误信息。

### 5.2 事件类型

| 分类 | 事件 |
| --- | --- |
| 命令 | `operation.accepted`、`operation.queued`、`operation.started`、`operation.succeeded`、`operation.failed`、`operation.cancelled` |
| 编排 | `progress.context`、`progress.model`、`progress.agent`、`progress.tool_started`、`progress.tool_completed`、`progress.tool_failed`、`progress.validation`、`progress.confirmation`、`progress.execution` |
| 业务结果 | `message.replied`、`plan.created`、`patch.applied`、`tasks.queued`、`task.progress`、`task.succeeded`、`task.failed`、`run.completed`、`run.blocked`、`run.failed` |
| Artifact | `artifact.created`、`artifact.advanced`、`artifact.status_changed`、`artifact.quality_evaluated`、`prompt_pack.compiled`、`prompt_pack.tasks_queued` |
| 协作 | `orchestration.proposed`、`template.instantiated`、`project_asset.shared` |

`progress` 不能再是一个只有自由文本的事件。为兼容已有客户端，可在迁移期同时写旧 `progress`，但前端优先使用上述类型与 `payload.message`。

### 5.3 LangGraph 节点映射

| LangGraph 节点 | 必发事件 | 额外事件 |
| --- | --- | --- |
| context | `progress.context` | `operation.started` |
| agent | `progress.agent` | `progress.model`（发起模型请求前） |
| tools | `progress.tool_started` | 每个 tool 结束发 `progress.tool_completed` 或 `progress.tool_failed` |
| validation | `progress.validation` | 失败时 `run.blocked` |
| confirmation | `progress.confirmation` | `plan.created` |
| execution | `progress.execution` | `patch.applied`、`tasks.queued` |

`progress.tool_started` 仅在模型已经产生真实 `tool_calls` 且准备执行时发送。模型首轮仍在推理时显示 `progress.agent`，不得伪造“正在执行工具”。

## 6. 命令接口分级

### 6.1 改为异步命令（返回 202）

| 入口 | Operation type | Worker 执行内容 |
| --- | --- | --- |
| `POST /runs/{run_id}/messages` | `agent.message` | 加载上下文、运行 LangGraph、生成计划或回复 |
| `POST /runs/{run_id}/answers` | `agent.answer` | 恢复/继续 LangGraph 规划 |
| `POST /runs/{run_id}/confirm` | `agent.confirm` | 恢复确认节点、Patch Executor、提交画布任务 |
| `POST /runs/{run_id}/prompt-pack/{id}/generate` | `prompt_pack.generate` | 校验产物、批量创建运行任务 |

响应统一：

```json
{
  "run_id": "run_01",
  "operation_id": "op_01",
  "status": "accepted",
  "events_after_sequence": 41
}
```

HTTP 入口只做鉴权、请求校验、幂等去重、Operation 入库、Run 状态更新和 `operation.accepted`。禁止同步等待模型、Patch 或任务队列。

### 6.2 保持同步，但统一发事件

以下动作在低延迟且无长链路时保持同步；每个成功、拒绝和失败结果均经 AREB 写事件：

- `POST /runs`、`/cancel`、`/retry`、`/redo`、`/review`
- Artifact 创建、推进、状态更新、质量评估
- Prompt Pack 编译
- Template 实例化、Project Asset 分享、编排方案生成

若这些接口将来引入外部 HTTP、批量数据库处理或生成任务，也必须迁入异步命令平面。

## 7. Worker 与并发控制

新增 `app.workers.agent_commands`，消费持久化命令队列。队列可复用 Redis Streams，但 PostgreSQL Operation 仍是命令事实来源。

处理规则：

1. 原子 claim `accepted/queued` Operation，转为 `running`。
2. 同一 `run_id` 同时最多一个 `running` 的规划或确认 Operation；不同 Run 可并发。
3. 使用 `thread_id = run_id` 调用 LangGraph Checkpointer。
4. 每个可观察阶段通过 `AgentEventService.append()` 写 Event 与 Outbox。
5. 成功后写 `operation.succeeded`；异常写结构化 `operation.failed` 与 `run.failed/blocked`。
6. Worker 崩溃后，基于 lease 和 Operation 状态重领；外部副作用依赖原有 idempotency key。
7. `cancel` 设置 Operation cancellation flag；模型/工具边界检查该 flag，Patch 前必须再次检查。

Run 状态只反映当前活跃阶段。执行结束且无画布任务时可以为 `completed`，但下一条 `agent.message` 合法并在同一 Run 创建新 Operation。

## 8. 分发与客户端消费

### 8.1 Redis Topic

Outbox Publisher 发布：

```text
topic: agent.event.v1
payload: { user_id, run_id, event }
```

每个 API/WS worker 的 Subscriber 将事件交给本地连接管理器，仅投递给对应 `user_id` 的连接。扩展 `ConnectionManager.deliver_remote_event()` 支持 `agent.event.v1`；不能只在事件产生进程调用 `broadcast_to_user()`。

发布顺序：先提交 PostgreSQL，再异步发布 Redis。重复发布是允许的，客户端按 `(run_id, sequence)` 去重。

### 8.2 WebSocket 与 iframe

画布 iframe 必须拥有自己的 Agent 订阅通道。推荐复用 `/ws/stats` 的认证连接并移除 iframe 的提前返回；该连接已经按用户隔离，`agent.*` 只在 `run_id` 匹配时由 Agent 面板消费。

如果不希望 iframe 直接建立 WebSocket，则由父页面接收事件并以 `postMessage` 转发给 iframe。两种方案只能选一种，推荐前者，避免父子窗口协议、生命周期和重连逻辑重复。

### 8.3 HTTP 补偿

浏览器始终保留：

```text
GET /api/canvas-agent/runs/{run_id}/events?after_sequence=<last>
```

规则：

- 打开 Run、WebSocket 重连、页面恢复可见、收到 sequence 间隙时立即补偿。
- 活跃 Operation 每 1 秒轮询；空闲 Run 每 10 秒或仅依赖 WebSocket。
- 事件按 sequence 应用；小于等于本地 `last_sequence` 的事件丢弃。
- Event 无法被 WebSocket 投递不影响正确性，只增加 UI 延迟。

### 8.4 前端状态模型

前端状态拆为 `runSummary` 与 `lastEvent`，禁止 `renderRun()` 用 `planning · planning` 覆盖最新进度文案。

```text
statusText = activeOperation
  ? lastEvent.payload.message || phaseLabel(lastEvent.phase)
  : runSummary.status + ' · ' + runSummary.phase
```

发送消息、回答和确认时的顺序必须是：

1. 确保 Run 存在。
2. 记录当前 `last_sequence`，立即启动 WebSocket/轮询。
3. 发起命令并得到 `202` / `operation_id`。
4. 将 UI 设为 `operation.accepted`，等待事件流；不得等待长请求结束。

## 9. 统一服务接口

新增 `app/services/canvas_agent/event_bus.py`，对路由、LangGraph 节点、Patch Executor 和任务 Worker 提供唯一入口：

```python
class AgentEventService:
    async def append(
        self,
        *,
        user_id: str,
        run_id: str,
        operation_id: str | None,
        event_type: str,
        phase: str = "",
        payload: dict[str, Any] | None = None,
        severity: str = "info",
    ) -> AgentEvent: ...

    async def append_in_transaction(...): ...
```

它负责：校验事件类型、脱敏、写入 Event、创建 Outbox、记录指标。现有 `emit_agent_event` 改为此服务的兼容包装，最终删除直接调用点。

## 10. 权限、安全与观测

- `/events`、WebSocket 投递和 Outbox payload 都以 `user_id + run_id` 校验，不允许仅凭 run_id 订阅。
- Event payload 采用字段白名单和最大尺寸限制；模型原始输出及 tool 原始返回只保存摘要。
- 记录 `request_id`、`operation_id`、`run_id`、`thread_id`、`tool_call_id`、`provider_id`、`model`、耗时和失败类别。
- 指标至少包括：命令受理/完成/失败数、Event Outbox 延迟、事件投递延迟、事件补偿次数、WebSocket 投递失败数、Run 排队时间、每阶段耗时。
- Outbox 失败采用指数退避；超过阈值进入 `dead` 并告警，但不得改变已提交的业务结果。

## 11. 实施顺序

1. **事件协议与数据迁移**：增加 Event 元数据和 Outbox；实现 `AgentEventService` 与 Publisher/Subscriber。
2. **实时传输修复**：将 `agent.event.v1` 纳入 Redis 分发；允许 iframe 接收 Agent WebSocket；前端按 sequence 去重和补偿。
3. **前端时序修复**：发送前启动消费；分离 `runSummary` 与 `lastEvent`；显示工具名、错误和确认状态。
4. **异步消息与回答**：`/messages`、`/answers` 迁为 202 Command，由 Agent Worker 执行。
5. **异步确认**：`/confirm` 迁为 202 Command，覆盖 LangGraph resume、Patch、任务提交。
6. **其余接口接入**：Artifact、Prompt Pack、任务重试、审阅、模板等统一事件类型与 Operation 记录。
7. **清理兼容逻辑**：删除旧 `progress` 自由文本消费、路由中的直连广播和同步长请求路径。

迁移期间后端同时发布旧 `progress` 和新 `progress.*`；前端优先新协议。完成全量发布并观察稳定后删除旧协议。

## 12. 验收标准

1. 画布作为 iframe 时，模型调用、工具调用、确认和 Patch 执行过程均在 1 秒内显示最新阶段。
2. 2 个 API worker 时，HTTP 命令和浏览器 WebSocket 落在不同 worker，仍可收到所有 `agent.event.v1`。
3. 断开网络后恢复，前端通过 `after_sequence` 获得完整且无重复的事件序列。
4. 连续两轮消息使用同一 `run_id/thread_id`；第一轮 `completed` 后第二轮可以继续规划。
5. HTTP 客户端超时或刷新页面不取消已受理的 Operation；重新进入 Run 能恢复其状态与事件。
6. 重复提交相同 `client_request_id` 不触发第二次模型调用、Patch 或任务提交。
7. Redis 不可用时，事件仍写入 PostgreSQL，前端轮询仍能看到最终结果；Redis 恢复后 Outbox 自动补投。
8. 所有事件 payload 经脱敏和大小限制，日志与 Redis 中不存在密钥或完整敏感上下文。
