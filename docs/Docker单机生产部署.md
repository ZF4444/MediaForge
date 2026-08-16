# MediaForge Docker 单机生产部署

本文适用于一台 Linux 服务器上运行完整的 MediaForge：

- `mediaforge-api`：FastAPI API、WebSocket 和前端静态文件
- `mediaforge-worker`：画布/生成任务 worker
- `postgres`：业务数据和文件元数据
- `redis`：会话、任务队列、Pub/Sub 和限流
- `minio`：图片、视频和素材对象存储

这些是同一个 Docker Compose 项目中的多个容器，共享一个 Docker 网络和持久化卷。不要把多个长期运行的进程塞进一个容器，这样会导致日志、重启、健康检查和故障恢复都难以处理。

## 1. 适用范围和上线前限制

这是“单机生产”的第一阶段方案，适合内部使用、小规模团队和约 5～10 人普通并发。它不提供跨机器高可用：服务器宕机时 API、数据库、Redis、MinIO 会同时不可用，因此必须配置异机备份。

当前代码仍有多用户安全和高并发风险。正式对外开放前，至少完成认证/管理员权限、文件归属、WebSocket 隔离、上传流式处理、用户级并发限制和压测。详见 `docs/50人使用容量评估与优化建议.md`。

## 2. 推荐服务器

CPU 主机（不含本地 GPU）：

| 资源 | 建议起步值 |
| --- | --- |
| 系统 | Ubuntu 22.04/24.04 LTS，x86_64 |
| CPU | 4 核 |
| 内存 | 16 GB |
| 系统盘 | 80 GB SSD |
| 媒体盘 | 按素材量配置，建议单独挂载 |
| Docker | Docker Engine 24+、Compose v2 |

如果要运行本地 ComfyUI/视频模型，另需 NVIDIA GPU、NVIDIA Driver、NVIDIA Container Toolkit；模型和生成缓存应放在 GPU 节点或单独磁盘，不要和数据库卷混用。

## 3. 安装 Docker

以下命令在 Ubuntu 执行：

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

重新登录后确认：

```bash
docker --version
docker compose version
docker run --rm hello-world
```

生产服务器不要把 Docker API 端口（2375/2376）暴露到公网。

## 4. 创建部署目录

建议源码和数据分离：

```bash
sudo mkdir -p /opt/mediaforge
sudo mkdir -p /srv/mediaforge/{postgres,redis,minio,logs,backups}
sudo chown -R "$USER":"$USER" /opt/mediaforge /srv/mediaforge
cd /opt/mediaforge
git clone <你的仓库地址> MediaForge
cd MediaForge
```

如果生产版本来自 CI/CD，应改为解压固定版本包，不要在服务器上直接跟踪 `main` 或 `dev` 分支。

## 5. 创建 Dockerfile 和忽略文件

在 `MediaForge/Dockerfile` 创建以下内容。前端在镜像构建阶段编译，生产容器不需要 Node.js：

```dockerfile
FROM node:20-bookworm-slim AS frontend
WORKDIR /src
COPY . ./
WORKDIR /src/frontend
RUN npm ci
RUN npm run build

FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . ./
COPY --from=frontend /src/static/dist ./static/dist

RUN useradd --create-home --uid 10001 mediaforge \
    && mkdir -p /app/logs /app/data \
    && chown -R mediaforge:mediaforge /app
USER mediaforge

EXPOSE 3000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000", "--workers", "1"]
```

在项目根目录创建 `.dockerignore`：

```text
.git
.venv
__pycache__
*.pyc
API/.env
data
logs
backups
static/dist
frontend/node_modules
frontend/dist
```

## 6. 创建生产环境变量

不要把真实密钥提交到 Git。创建 `/opt/mediaforge/MediaForge/deploy/.env`，并限制权限：

```bash
mkdir -p deploy
chmod 700 deploy
touch deploy/.env
chmod 600 deploy/.env
```

内容示例（密码必须替换为随机长密码）：

```dotenv
TZ=Asia/Shanghai

POSTGRES_USER=mediaforge
POSTGRES_PASSWORD=替换为至少32位随机密码
POSTGRES_DB=mediaforge

REDIS_PASSWORD=替换为至少32位随机密码

MINIO_ROOT_USER=替换为随机管理员名
MINIO_ROOT_PASSWORD=替换为至少32位随机密码

# 容器之间使用服务名，不要写 127.0.0.1
DATABASE_URL=postgresql://mediaforge:替换为至少32位随机密码@postgres:5432/mediaforge
REDIS_URL=redis://:替换为至少32位随机密码@redis:6379/0
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=替换为随机管理员名
MINIO_SECRET_KEY=替换为至少32位随机密码
MINIO_SECURE=false

# 对外访问地址；有公网域名时填写 HTTPS 地址
PUBLIC_BASE_URL=https://media.example.com
PUBLIC_MEDIA_BASE_URL=https://media.example.com

# 外部 AI 平台密钥，按实际使用情况填写
COMFLY_API_KEY=
RUNNINGHUB_API_KEY=
```

生成随机值可以使用：

```bash
openssl rand -base64 36
```

如果使用项目根目录的 `API/.env`，它必须通过 Secret 管理，并且不能进入镜像；生产优先使用 Compose 的 `env_file` 或部署平台的 Secret 注入。

## 7. 创建 Compose 文件

创建 `deploy/compose.prod.yml`：

```yaml
services:
  api:
    build:
      context: ..
      dockerfile: Dockerfile
    image: mediaforge:${MEDIAFORGE_VERSION:-local}
    restart: unless-stopped
    env_file: .env
    environment:
      CANVAS_TASK_WORKER_ENABLED: "false"
      CANVAS_TASK_RECOVERY_ENABLED: "false"
      DATABASE_POOL_MIN_SIZE: "2"
      DATABASE_POOL_MAX_SIZE: "8"
      STORAGE_CACHE_DIR: /app/data/cache
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - ../logs:/app/logs
      - ../data:/app/data
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:3000/health/ready"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 40s
    networks: [mediaforge]

  worker:
    image: mediaforge:${MEDIAFORGE_VERSION:-local}
    restart: unless-stopped
    env_file: .env
    environment:
      CANVAS_TASK_WORKER_ENABLED: "true"
      CANVAS_TASK_RECOVERY_ENABLED: "true"
      DATABASE_POOL_MIN_SIZE: "1"
      DATABASE_POOL_MAX_SIZE: "5"
    volumes:
      - ../logs:/app/logs
      - ../data:/app/data
    command: ["python", "-m", "app.workers.canvas"]
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    networks: [mediaforge]

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      TZ: ${TZ}
    volumes:
      - /srv/mediaforge/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks: [mediaforge]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--appendonly", "yes"]
    volumes:
      - /srv/mediaforge/redis:/data
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a \"$${REDIS_PASSWORD}\" ping | grep PONG"]
      interval: 10s
      timeout: 5s
      retries: 10
    networks: [mediaforge]

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: ["server", "/data", "--console-address", ":9001"]
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
      TZ: ${TZ}
    volumes:
      - /srv/mediaforge/minio:/data
    expose:
      - "9000"
      - "9001"
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9000/minio/health/live"]
      interval: 15s
      timeout: 5s
      retries: 10
    networks: [mediaforge]

networks:
  mediaforge:
    driver: bridge
```

说明：Compose 会读取 `deploy/.env` 中的变量。API 和 worker 使用同一个镜像，但启动命令不同；API 不消费任务，避免多个进程重复执行任务。

## 8. 构建和启动

在 `MediaForge` 根目录执行：

```bash
# 构建镜像并拉取最新基础镜像
docker compose --env-file deploy/.env -f deploy/compose.prod.yml build --pull
# 启动数据库、Redis、MinIO
docker compose --env-file deploy/.env -f deploy/compose.prod.yml up -d postgres redis minio
# 启动 API 和 worker
docker compose --env-file deploy/.env -f deploy/compose.prod.yml up -d api worker
```

检查状态：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml ps
docker compose --env-file deploy/.env -f deploy/compose.prod.yml logs -f api
```

确认服务：

```bash
curl http://127.0.0.1:3000/health/live
curl http://127.0.0.1:3000/health/ready
```

Compose 文件没有直接把 API 端口发布到公网。临时本机验证可以执行：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml port api 3000
```

生产环境通过 Nginx/Caddy 反向代理访问，不要直接开放 PostgreSQL、Redis 或 MinIO 管理端口。

## 9. Nginx 反向代理

安装 Nginx：

```bash
sudo apt-get install -y nginx
```

创建 `/etc/nginx/sites-available/mediaforge`：

```nginx
server {
    listen 80;
    server_name media.example.com;
    client_max_body_size 512m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1800s;
        proxy_send_timeout 1800s;
    }
}
```

启用并申请证书：

```bash
sudo ln -s /etc/nginx/sites-available/mediaforge /etc/nginx/sites-enabled/mediaforge
sudo nginx -t && sudo systemctl reload nginx
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d media.example.com
```

如果外部 AI 供应商要求素材公网可访问，`PUBLIC_BASE_URL`/`PUBLIC_MEDIA_BASE_URL` 必须填写证书生效后的域名。不要把 MinIO 的私有 bucket 直接暴露到公网。

## 10. 数据初始化和验证

MediaForge 启动时会检查 PostgreSQL、Redis、MinIO，并初始化业务元数据和三个 bucket。首次启动后查看：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml logs --tail=200 api
curl -fsS https://media.example.com/health/ready
```

就绪检查失败时，重点看返回的 `components` 字段和日志：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml logs postgres redis minio
```

## 11. 备份

至少执行以下备份策略：

1. PostgreSQL 每日逻辑备份，保存到另一台机器或对象存储。
2. MinIO 数据目录做异机或云对象存储备份；仅备份数据库不能恢复媒体文件。
3. Redis 主要保存会话和任务状态，应保留 AOF，但不能把 Redis 当作唯一业务数据源。
4. 定期做恢复演练。

PostgreSQL 备份示例：

```bash
mkdir -p /srv/mediaforge/backups/postgres
docker exec mediaforge-postgres-1 pg_dump \
  -U mediaforge -d mediaforge -Fc \
  > /srv/mediaforge/backups/postgres/mediaforge-$(date +%F).dump
```

实际容器名以 `docker compose ps` 输出为准，也可以使用服务名执行：

```bash
docker compose --env-file deploy/.env -f deploy/compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > /srv/mediaforge/backups/postgres/mediaforge-$(date +%F).dump
```

备份目录必须位于独立磁盘，并通过 `cron`、systemd timer 或云备份任务定期上传到异机。

## 12. 升级和回滚

发布新版本：

```bash
cd /opt/mediaforge/MediaForge
git fetch --tags
git checkout <固定版本标签>
docker compose --env-file deploy/.env -f deploy/compose.prod.yml build --pull
docker compose --env-file deploy/.env -f deploy/compose.prod.yml up -d api worker
docker compose --env-file deploy/.env -f deploy/compose.prod.yml ps
```

升级前先备份 PostgreSQL 和 MinIO。不要执行 `docker compose down -v`，该命令会删除 Compose 管理的卷；生产数据卷应始终保留。

回滚时切回上一版本标签，重新构建并启动 API/worker。数据库结构如果发生不可逆迁移，必须先确认项目是否提供反向迁移方案。

## 13. GPU/ComfyUI 部署

CPU 单机方案可以先把 `COMFYUI_INSTANCES` 配置成外部 GPU 机器地址，例如：

```dotenv
COMFYUI_INSTANCES=https://gpu.example.com:8188
```

ComfyUI 不建议和 PostgreSQL、Redis、MinIO 放在同一台普通 CPU 机器。如果确实是带 NVIDIA GPU 的单机，可以增加一个带 GPU 的 Compose 服务，但必须安装 NVIDIA Container Toolkit，并为模型目录配置独立卷。GPU 服务只允许内网访问，不能直接暴露到公网。

## 14. 常用运维命令

```bash
# 查看容器状态
docker compose --env-file deploy/.env -f deploy/compose.prod.yml ps

# 查看 API/worker 日志
docker compose --env-file deploy/.env -f deploy/compose.prod.yml logs -f api worker

# 重启单个服务
docker compose --env-file deploy/.env -f deploy/compose.prod.yml restart api

# 查看资源占用
docker stats

# 检查磁盘和 Docker 卷
df -h
docker system df

# 进入 PostgreSQL
docker compose --env-file deploy/.env -f deploy/compose.prod.yml exec postgres psql -U mediaforge -d mediaforge
```

## 15. 上线验收清单

- [ ] 所有默认密码和 API Key 已替换并轮换
- [ ] `deploy/.env` 未提交 Git，权限为 `600`
- [ ] 只有 Nginx 的 80/443 端口对公网开放
- [ ] `/health/ready` 返回成功
- [ ] 登录、上传、图片生成、视频任务和 WebSocket 均验证通过
- [ ] API 和 worker 已分离，API 的任务开关为 `false`
- [ ] PostgreSQL、MinIO 已完成备份和恢复验证
- [ ] 配置了磁盘、内存、CPU、GPU、任务队列和 5xx 告警
- [ ] 通过至少 30 分钟混合压测
- [ ] 已记录当前版本号和回滚版本
