# MediaForge

基于 FastAPI 的 AI 创作工作台，集成 AI 图片生成、编辑、视频生成和对话能力。

## 环境要求

| 组件 | 最低版本 | 说明 |
|------|---------|------|
| Python | 3.11 | 版本由 `.python-version` 锁定 |
| uv | 最新版 | Python 依赖管理 |
| Node.js / npm | Node.js 18+ | 前端模块构建 |
| PostgreSQL | 14+ | 用户、会话和元数据存储 |
| Redis | 6.2+ | 会话缓存、画布任务队列和崩溃消息接管 |
| MinIO | 最新稳定版 | 图片、视频和素材存储 |
| FFmpeg | 5.0+ | 视频封面、抽帧和视频理解 |

外部依赖的安装说明见：

- [PostgreSQL 安装流程](docs/PostgreSQL安装流程.md)
- [Redis 安装流程](docs/Redis安装流程.md)
- [MinIO 安装流程](docs/MinIO安装流程.md)
- [FFmpeg 安装流程](docs/FFmpeg安装流程.md)

## 环境搭建

### 一键初始化（推荐）

在 macOS 安装 Homebrew 后，在项目根目录执行：

```bash
./scripts/setup-dev.sh
```

脚本会通过 Homebrew 按需安装 `uv`、Node.js、FFmpeg、PostgreSQL 16、Redis 和
MinIO，创建 `API/.env`，安装 Python/前端依赖，构建前端，并启动本机服务。
已有的 `API/.env` 会被保留；要按模板
重新生成，使用 `./scripts/setup-dev.sh --force-env`。

本地基础设施端口为 PostgreSQL `5432`、Redis `6379`、MinIO API `9000`、
MinIO Console `9001`。初始化后用 `uv run python main.py` 启动应用。可用
`./scripts/setup-dev.sh --help` 查看跳过基础设施或前端构建等选项。
要停止本机开发服务，执行 `./scripts/stop-dev-services.sh`。
仅重新启动或修复本机服务时，执行 `./scripts/setup-dev.sh --only-infra`。

### 安装 uv

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

安装完成后，确认 `uv --version` 可用。

### 安装 Python 依赖

在项目根目录执行：

```bash
uv sync
```

该命令会创建 `.venv`，并根据 `pyproject.toml` 安装后端依赖。

### 安装前端依赖

首次构建前端，或 `package-lock.json` 发生变化后，在 `frontend/` 目录执行：

```bash
npm ci
```

`npm ci` 会删除现有 `node_modules`，严格按照 `package-lock.json` 安装固定版本，适合 CI/CD 和生产构建。它不会自动构建前端。

### 配置基础设施

确保 PostgreSQL 已创建数据库和用户：

```sql
CREATE USER mediaforge WITH PASSWORD 'readygo123';
CREATE DATABASE mediaforge OWNER mediaforge;
```

确保 Redis、MinIO 已启动。服务启动时会自动创建以下 bucket：

- `mediaforge-private`
- `mediaforge-public`
- `mediaforge-temp`

确认 FFmpeg 已安装并在 PATH 中：

```bash
ffmpeg -version
```

### 配置环境变量

基础设施配置可以通过 Shell export 或 systemd 注入：

```bash
export DATABASE_URL=postgresql://mediaforge:readygo123@127.0.0.1:5432/mediaforge
export MINIO_ENDPOINT=127.0.0.1:9000
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=readygo123
export REDIS_URL=redis://mediaforge:readygo123@127.0.0.1:6379/0
```

如果 Redis 使用 ACL 用户而不是默认用户，该用户还需要发布订阅权限（跨进程 WebSocket 和 Provider 配置通知会使用 Pub/Sub）：

```text
ACL SETUSER mediaforge +publish +subscribe +unsubscribe
```

启用画布任务 worker 或恢复扫描时，该用户还必须拥有 Redis Streams 命令权限，
否则应用会在启动时无法创建 `canvas-workers` 消费组。可以按部署所需的最小范围授予：

```text
ACL SETUSER mediaforge +@read +@write +@stream +eval
```

API-only 副本（`CANVAS_TASK_WORKER_ENABLED=false` 且
`CANVAS_TASK_RECOVERY_ENABLED=false`）不会初始化消费组，因此不需要 `@stream` 权限。

应用检测到 `SUBSCRIBE` 被 ACL 拒绝时会自动降级为定时刷新 Provider 配置，但 WebSocket 跨进程事件仍需要 `publish/subscribe` 权限。

在 `API/.env` 中填写 AI 平台密钥：

```dotenv
COMFLY_API_KEY=sk-xxxxx
RUNNINGHUB_API_KEY=your-key-here
COMFYUI_INSTANCES=192.168.80.21:8188
# 云端网关也可使用无端口 HTTPS 域名，或显式完整 URL
# COMFYUI_INSTANCES=c6fc4e1f29a54123912d7bd086de9b77.region1.waas.aigate.cc
```

可选配置包括 `PUBLIC_BASE_URL`、`PUBLIC_MEDIA_BASE_URL`、`CHAT_MODEL`、`IMAGE_MODEL`、`MINIO_SECURE` 等。

## 前端构建

前端采用源码目录加构建产物的方式运行。`static/dist/` 被 `.gitignore` 忽略，页面会直接加载构建后的模块，因此部署前必须完成构建：

```bash
cd frontend
npm ci
npm run build
```

`npm run build` 会一次性构建 `canvas`、`api-settings`、`asset-manager`、`comfyui-settings` 和 `index` 五个页面。

修改 `frontend/src/` 下的模块，或对应的 `static/js/<page>.js` 后，都要重新执行 `npm run build`。否则页面可能继续加载旧的 `static/dist/` 文件。

构建完成后可运行前端测试：

```bash
cd frontend
npm test
```

## 版本更新与发布

当前应用版本记录在根目录 `VERSION` 文件中。发布新版本时，在项目根目录执行：

```bash
# 递增 VERSION 的补丁号并重建前端
./scripts/rebuild-frontend.sh

# 检查改动
git diff --check
git status
```

脚本要求 `VERSION` 使用 `X.Y.Z` 格式，并只递增最后一位，例如 `1.3.7` 变为
`1.3.8`。首次构建或 `package-lock.json` 变更后，仍需先在 `frontend/` 中运行
`npm ci`。

提交发布代码时，`VERSION` 必须和源码一起提交。页面路由会读取该文件并为静态资源注入版本参数，用于浏览器缓存更新；只修改版本号不会重新生成前端代码，修改前端代码也不会自动更新版本号。

生产环境不需要每次重启都执行 npm 命令。推荐在 CI/CD 或 Docker 镜像构建阶段执行 `npm ci && npm run build`，然后将生成的 `static/dist/` 一起打入发布包或镜像。若采用“同步源码到服务器”的发布方式，则每次前端代码发布前都必须在服务器执行上述构建流程。

### 数据备份

使用 `scripts/backup_services.py` 可一次性备份 PostgreSQL、Redis 和 MinIO 三个存储桶。脚本从
`DATABASE_URL`、`REDIS_URL`、`MINIO_*` 环境变量读取连接信息，将每次备份写入带 UTC 时间戳的目录，
并生成 `manifest.txt` 与 `SHA256SUMS`。Redis 统一使用管理员账号生成原子 RDB 快照，需要
`REPLCONF`/`SYNC` 权限。默认保留 14 天，可通过参数调整：

```bash
python scripts/backup_services.py --output-dir /var/backups/mediaforge --retention-days 30
```

Redis 备份必须提供管理员连接串：

```bash
python scripts/backup_services.py --only redis \
  --redis-admin-url 'redis://admin:password@127.0.0.1:6379/0'
```

也可通过 `REDIS_ADMIN_URL` 环境变量传入，避免将密码写入命令历史。未提供管理员连接串时，脚本会直接失败。

也可以只备份单个服务，例如 `--only postgres`。备份主机需安装 `pg_dump`、`redis-cli`；备份目录应使用独立磁盘或远端同步存储，并定期执行恢复演练。

## 启动服务

### 开发模式

```bash
uv run python main.py
```

默认监听 `127.0.0.1:3000`。也可以指定地址和端口：

```bash
uv run python main.py --host 0.0.0.0 --port 3000
```

### 生产模式

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 3000 --workers 1
```

画布生成任务使用 Redis Streams 持久化。单进程部署保持默认即可；多 API
worker 部署时，API 进程必须关闭任务消费和恢复扫描，并单独启动一个或多个
任务 worker：

```bash
# API 副本：只处理 HTTP/WebSocket
CANVAS_TASK_WORKER_ENABLED=false CANVAS_TASK_RECOVERY_ENABLED=false \
  uv run uvicorn main:app --host 0.0.0.0 --port 3000 --workers 2

# 独立任务进程：消费 Redis Streams、接管崩溃 worker 的 pending 消息并恢复排队任务
RUN_BACKGROUND_MAINTENANCE=false uv run python -m app.workers.canvas
```

相关 Redis 参数可通过环境变量调整：`REDIS_CANVAS_TASK_LEASE_SECONDS`、
`REDIS_CANVAS_TASK_PENDING_CLAIM_IDLE_MS`、`REDIS_CANVAS_TASK_DISPATCH_TTL_SECONDS`
和 `REDIS_CANVAS_TASK_STREAM_MAXLEN`。pending 接管阈值应大于正常任务启动前的
最大停顿时间，且不要小于租约刷新间隔。

单个 worker 进程默认同时消费 100 个画布任务。一次生成多张图会创建一个父任务和
多个独立的图片子任务；子任务分别由 worker 调度，父任务聚合整体结果。多 worker 消费可通过
`CANVAS_TASK_WORKER_CONCURRENCY` 显式调整；实际提交到同一 AI Provider 的并发仍受
`AI_PROVIDER_MAX_CONCURRENCY`（默认 100）和相应的分 Provider 配置限制。
当 worker 并发提高时，`REDIS_MAX_CONNECTIONS` 应至少高于 worker 数量，并为
认证、恢复和其它 Redis 操作预留连接。

任务 worker 的租约值是一次执行一换的 fencing token。任务状态和结果仅允许当前 token
通过 Redis 原子脚本写入；已失租的 worker 即使随后返回，也不会覆盖接管者的结果。对于不支持
查询上游任务 ID 的供应商，`running` 任务在 worker 失联后会标记为 `interrupted`，不会自动重投，
以避免重复生成和计费。上游请求同时携带稳定的 `Idempotency-Key`（HTTP 请求 ID 或画布任务 ID）。

AI Provider 默认通过 Redis 进行跨进程限流与熔断。可按 Provider 设置
`AI_PROVIDER_<ID>_REQUESTS_PER_WINDOW`、`AI_PROVIDER_<ID>_USER_REQUESTS_PER_WINDOW`、
`AI_PROVIDER_<ID>_CIRCUIT_FAILURE_THRESHOLD` 和
`AI_PROVIDER_<ID>_CIRCUIT_COOLDOWN_SECONDS`；全局同名变量可作为默认值。

Provider 配置保存后会通过 Redis 立即使各进程缓存失效；
`PROVIDER_CONFIG_CACHE_REFRESH_SECONDS`（默认 30 秒）是 Pub/Sub 短暂断线时的最终一致性兜底。
Provider 设置页会携带配置版本进行条件保存；多位管理员同时修改时，后提交的一方会收到冲突提示，
必须刷新后重新合并，避免静默覆盖。该版本锁当前保护 Provider 元数据；API Key 仍由受权限保护的
环境配置管理，生产部署应把它们进一步迁入 Secret Manager 或加密数据库字段。

Provider Base URL 只能直接指向公网可路由地址。服务会在每次建立 TCP 连接时重新解析并固定
该次连接使用的 IP，以阻断 DNS 重绑定；已废弃的 `AI_PROVIDER_ALLOWED_HOSTS` 不再放行内网地址。
确需访问私有上游时，应配置受控出网代理 `AI_OUTBOUND_PROXY=http://proxy.example:3128`，并由该代理
实施目标地址 allowlist、DNS 解析与重定向校验；不要将它指向未经隔离的通用代理。

推荐使用 systemd 管理服务：

```ini
[Unit]
Description=MediaForge AI Studio
After=network.target postgresql.service redis.service minio.service

[Service]
Type=simple
User=mediaforge
WorkingDirectory=/path/to/MediaForge
Environment=DATABASE_URL=postgresql://mediaforge:readygo123@127.0.0.1:5432/mediaforge
Environment=MINIO_ENDPOINT=127.0.0.1:9000
Environment=MINIO_ACCESS_KEY=minioadmin
Environment=MINIO_SECRET_KEY=readygo123
Environment=REDIS_URL=redis://127.0.0.1:6379/0
ExecStart=/path/to/MediaForge/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 3000 --workers 1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable mediaforge
sudo systemctl start mediaforge
```

## 启动验证

```bash
# 存活检查
curl http://127.0.0.1:3000/health/live

# 就绪检查：PostgreSQL、Redis、MinIO 均应可达
curl http://127.0.0.1:3000/health/ready

# Prometheus 指标
curl http://127.0.0.1:3000/metrics
```

服务就绪后访问 `http://<服务器IP>:3000/`。首次访问可能会跳转到登录页。

## 可选外部服务

使用本地 ComfyUI 工作流时，在 ComfyUI 目录启动：

```bash
python main.py --listen 0.0.0.0 --port 8188
```

并在 `API/.env` 配置：

```dotenv
COMFYUI_INSTANCES=192.168.80.21:8188,192.168.80.22:8188
```

## 常见问题

| 现象 | 排查 |
|------|------|
| `connection refused`（5432/6379/9000） | 检查 PostgreSQL、Redis、MinIO 是否启动 |
| `/health/ready` 返回 503 | 查看返回的 `components` 字段，检查对应连接配置 |
| 页面模块 404 或仍显示旧逻辑 | 确认执行了 `cd frontend && npm run build`，并检查 `static/dist/` |
| `npm ci` 失败 | 检查 `package.json` 与 `package-lock.json` 是否同步 |
| API 调用失败 | 检查 `API/.env` 中对应平台的 API Key |

日志默认位于：`logs/app.log`、`logs/access.log`、`logs/error.log`、`logs/audit.log` 和 `logs/task.log`。

## 项目结构

```text
├── main.py              # 主服务入口
├── app/                 # 后端配置、模型、路由和服务
├── API/.env             # API Key 配置
├── frontend/            # 前端源码、构建脚本和测试
├── static/              # 页面与静态资源
├── static/dist/         # 前端构建产物，不入库
├── workflows/           # ComfyUI 工作流
├── data/                # 本地数据
├── logs/                # 运行日志
├── scripts/             # 运维和迁移脚本
├── tests/               # 后端测试
├── pyproject.toml       # Python 依赖配置
├── frontend/package-lock.json # 前端依赖锁定文件
└── VERSION              # 应用版本
```

更细的基础设施安装说明仍保留在 [`docs/`](docs/) 目录中。
