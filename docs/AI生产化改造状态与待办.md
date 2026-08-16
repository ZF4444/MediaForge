# MediaForge AI 生产化改造状态与待办

更新日期：2026-08-16

## 1. 当前结论

AI 接入、统一画布、PostgreSQL、Redis 和 MinIO 已具备可运行的生产基础；高风险的 Provider
管理越权、明文 Token 返回、普通画布重复实现、进程内画布任务状态和跨用户 WebSocket 广播已经处理。

当前可以作为受控环境部署，但尚不能称为“生产级完成态”。剩余的主要风险集中在密钥存储、全局
任务治理、Provider Adapter 拆分，以及基于真实负载的容量验证。

## 2. 已完成项

### 访问控制与出站安全

- Provider 的读取、保存、连通性测试和模型拉取均要求管理员权限。
- ModelScope 与即梦已从 Provider 装配、公开路由和设置页移除；历史配置会在加载时过滤。
- Provider 与外部媒体 URL 只允许 HTTP(S) 和公网可路由地址，拒绝回环、私网、链路本地及保留地址。
- 出站 HTTP transport 在每次 TCP 连接时解析并固定目标 IP，避免“先校验域名、后再次解析”的 DNS
  重绑定窗口；新建重试连接同样使用该 transport。
- 内网 Provider 不再通过旧 allowlist 直接放行。确需访问私有上游时，只能通过受控
  `AI_OUTBOUND_PROXY`，由代理实施目标 allowlist、DNS 和重定向校验。

### AI 调用治理

- 图片、视频、画布 LLM、普通聊天与流式聊天进入 AI Gateway，已有 Provider/用户维度的并发、
  Redis 限流、熔断和基础指标。
- 统一 Provider 请求头带有稳定的 `Idempotency-Key`：HTTP 请求使用 request ID，画布后台任务
  使用持久任务 ID，降低传输重试造成重复提交的概率。
- Provider 配置变更通过 Redis Pub/Sub 使各进程缓存失效，并保留轮询兜底。

### 画布与异步任务

- 普通画布已移除，Smart Canvas 已统一为唯一画布实现和前端入口。
- 画布任务记录、状态、结果和归属迁移至 Redis；查询不再依赖任务提交的进程。
- Redis Streams 消费组支持 pending 消息接管，API 服务与任务 worker 可分离部署。
- 任务租约使用 Lua compare-and-expire / compare-and-delete；每次执行有独立 fencing token。
  只有持有当前 token 的 worker 可以原子写入状态或结果，旧 worker 无法覆盖接管者。
- 对没有可恢复上游任务 ID 的 `running` 任务，worker 失联后标记为 `interrupted`，不自动重投，
  以避免二次生成和计费。
- 非租约更新使用 Redis Lua 原子状态迁移；恢复器仅可将仍为 `running` 的任务标记为 `interrupted`。
- 独立 Canvas worker 默认关闭存储清理、会话刷新与 WebSocket Pub/Sub 等维护循环，避免与 API
  副本重复执行。

### 多副本一致性与可观测性

- WebSocket 已认证并按用户范围发送；跨进程分发走 Redis Pub/Sub。
- Provider 元数据存放在 PostgreSQL `app_settings`，保存接口使用 `If-Match` 版本号条件更新。
  并发管理员保存会返回 `409`，未携带版本返回 `428`，避免静默覆盖。
- 共享 HTTP Client、脱敏结构化日志、PostgreSQL 连接池、Redis/MinIO 健康检查和 Prometheus 指标
  已纳入基础设施。
- Gateway 已增加 Redis 集群级 Provider/操作并发槽位；进程内 Semaphore 作为本地快速拒绝层保留。
- 模型发现请求统一进入 Gateway，在线生图单请求数量默认限制为 4，可通过
  `AI_ONLINE_IMAGE_MAX_COUNT` 调整。
- 配置了 `APP_SECRET_KEY` 的部署使用 PostgreSQL `pgcrypto` 加密保存 Provider 密钥；密钥不会再写回
  节点 `.env`。未配置该键的旧部署仍走兼容 `.env` 模式，必须在生产上线前迁移。
- `.env` 兼容模式的配置写入增加跨进程文件锁、临时文件 `fsync` 和原子替换。
- Canvas Redis Stream 执行失败会进入死信 Stream，终态任务归档 PostgreSQL，避免 TTL 和 Stream 裁剪
  删除必要的运维记录。
- 管理员可通过 `/api/admin/canvas-task-dead-letters` 查询死信，并可重试或取消指定死信任务。
- 启用 `APP_SECRET_KEY` 后启动期会将现有 Provider 环境变量导入加密表；之后运行期不会再回退读取
  `.env` 中的 Provider 密钥。

## 3. 仍需完善的内容

| 优先级 | 项目 | 当前风险 | 完成标准 |
| --- | --- | --- | --- |
| P0 | Provider 密钥迁移 | 已支持 PostgreSQL 加密字段；旧部署仍可能使用 `.env`，且密钥轮换审计尚未完成 | 强制 `APP_SECRET_KEY`，迁移存量密钥，支持密钥版本、轮换、最小权限和审计 |
| P1 | 分布式任务治理 | 已有 Redis Provider 并发槽位，但仍缺少按组织的预算、队列长度与任务级背压 | Redis 分布式令牌桶、组织/用户配额、每类任务并发上限、排队拒绝或等待策略 |
| P1 | 上游任务恢复 | 仅能安全恢复 queued；部分 Provider 不支持可靠的上游任务轮询 | Adapter 声明幂等能力和上游任务查询能力；可轮询的任务按上游 ID 恢复 |
| P1 | Adapter 模块化 | Provider 协议分支仍主要位于 `main.py` | 图片、视频、聊天、模型发现各自实现 ProviderAdapter；路由只负责验证和调用 Gateway |
| P1 | 配置事务边界 | Provider 元数据 CAS 与环境文件密钥写入并非同一事务 | 元数据和密钥使用同一个版本化配置仓库；失败可回滚，不出现半更新 |
| P2 | 成本与审计 | 无 Token/图片/视频成本归集和预算告警 | 按组织、用户、Provider、模型记录用量，接入预算阈值与告警 |
| P2 | 熔断与告警 | 有基础熔断指标，但缺少告警规则和运行手册 | Provider 错误率、429、超时、熔断状态、队列滞留进入监控与告警 |
| P2 | 任务生命周期 | 已有死信 Stream 和终态 PostgreSQL 归档；取消、人工重试和死信处理界面仍不完整 | 明确状态机、取消语义、管理员死信重试和审计查询界面 |
| P2 | 负载验证 | 未用模拟上游和真实依赖完成容量压测 | 完成混合负载、故障注入、恢复和安全隔离压测，并以指标确定容量 |

## 4. 推荐目标结构

```text
app/ai/
  domain/       # 请求、媒体引用、用量、任务结果
  providers/    # OpenAI、Gemini、RunningHub、Ark 等 Adapter
  registry.py   # Provider 配置与 Adapter 装配
  gateway.py    # 授权、限流、预算、审计、熔断、统一错误映射
  tasks.py      # 持久任务状态、投递、轮询恢复
  routers.py    # 薄 HTTP 层
```

迁移应保持兼容：先从 `main.py` 抽取纯函数和协议实现，再由 Gateway 调用 Adapter，最后删除旧分支；
每次只迁移一个能力面，并为请求转换、响应解析、重试和错误映射添加契约测试。

## 5. 上线前门槛

以下项目完成前，不应将系统作为面向不受控用户的高成本 AI 平台上线：

1. Provider 密钥迁入受控密钥存储，并完成轮换演练。
2. 在 Redis 层实现组织和用户维度的配额、限流与全局任务并发。
3. 为所有高成本 Provider 调用记录可审计的用量和成本估算。
4. 使用独立 API worker 与任务 worker 部署，避免 API 副本消费任务。
5. 完成权限回归：普通用户无法读取配置、密钥、他人任务、媒体和 WebSocket 消息。
6. 在 Mock 上游和真实依赖下完成容量、故障恢复和重复计费演练。

## 6. 建议实施顺序

1. 建立 Provider 配置仓库：元数据、密钥引用、版本和审计记录进入 PostgreSQL；密钥实际值进入
   Secret Manager 或加密字段。
2. 将 Redis Gateway 限流扩展为组织/用户预算与全局任务背压，并增加队列指标和告警。
3. 拆分 Provider Adapter，优先迁移图片生成，再迁移视频、聊天和模型发现。
4. 为支持上游查询的 Provider 增加任务恢复；不支持者明确标记为人工恢复或失败。
5. 建立成本、用量和操作审计报表。
6. 完成压测和故障注入后，根据数据调整 API worker、任务 worker、Redis、PostgreSQL 和上游配额。

## 7. 验证基线

本轮针对 AI Gateway、Provider 出站安全、Redis 画布任务、Provider 配置版本、HTTP Client、
重试、WebSocket 和路由快照的回归测试均通过。完整测试结果为 `140 passed, 1 failed`；唯一失败是
缺失 `custom/Sam3DBody.json` 工作流文件导致的 Pose Studio 固定资产测试，与本轮 AI 改造无关。
