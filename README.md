# MediaForge

基于 FastAPI 的 AI 创作工作台，集成 AI 图片生成、编辑、视频生成和对话能力。

## 环境要求

| 组件 | 最低版本 | 说明 |
|------|---------|------|
| Python | 3.11 | 版本由 `.python-version` 锁定 |
| uv | 最新版 | Python 依赖管理 |
| Node.js / npm | Node.js 18+ | 前端模块构建 |
| PostgreSQL | 14+ | 用户、会话和元数据存储 |
| Redis | 6+ | 会话缓存和实时状态 |
| MinIO | 最新稳定版 | 图片、视频和素材存储 |
| FFmpeg | 5.0+ | 视频封面、抽帧和视频理解 |

外部依赖的安装说明见：

- [PostgreSQL 安装流程](docs/PostgreSQL安装流程.md)
- [Redis 安装流程](docs/Redis安装流程.md)
- [MinIO 安装流程](docs/MinIO安装流程.md)
- [FFmpeg 安装流程](docs/FFmpeg安装流程.md)

## 环境搭建

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

在 `API/.env` 中填写 AI 平台密钥：

```dotenv
COMFLY_API_KEY=sk-xxxxx
MODELSCOPE_API_KEY=ms-xxxx
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
# 1. 修改 VERSION，例如 1.3.7 -> 1.3.8
printf '1.3.8\n' > VERSION

# 2. 安装依赖并重新构建前端
cd frontend
npm ci
npm run build
npm test
cd ..

# 3. 检查改动
git diff --check
git status
```

提交发布代码时，`VERSION` 必须和源码一起提交。页面路由会读取该文件并为静态资源注入版本参数，用于浏览器缓存更新；只修改版本号不会重新生成前端代码，修改前端代码也不会自动更新版本号。

生产环境不需要每次重启都执行 npm 命令。推荐在 CI/CD 或 Docker 镜像构建阶段执行 `npm ci && npm run build`，然后将生成的 `static/dist/` 一起打入发布包或镜像。若采用“同步源码到服务器”的发布方式，则每次前端代码发布前都必须在服务器执行上述构建流程。

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

使用即梦时：

```bash
curl -fsSL https://jimeng.jianying.com/cli | bash
dreamina login
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
