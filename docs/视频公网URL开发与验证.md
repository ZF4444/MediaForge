# 视频公网 URL：开发与验证

已实现 API/Worker 共用签发、独立下载 gateway、授权数据库、管理页面及本地集成测试。功能默认关闭。开发环境和生产环境是独立机器，本文所有运行与测试均针对开发机，不连接生产服务。

## 代码入口

| 文件/目录 | 用途 |
| --- | --- |
| `app/public_media/config.py`、`contracts.py` | 独立配置、随机凭证、内部引用识别和脱敏 |
| `service.py`、`business.py` | 文件/任务/模型授权、固定对象、签发和短期加密交付 |
| `repository.py`、`app/public_media/schema.sql` | 独立连接池、事务准入、配额和持久撤销屏障 |
| `gateway.py`、`storage_reader.py`、`http_stream.py`、`telemetry.py` | 独立 ASGI 入口、有界 MinIO 读取、HTTP 文件协议与无凭证聚合指标 |
| `lifecycle.py` | 删除/权限变更前阻断、任务终态处理与维护对账 |
| `app/routers/public_video_links.py` | 现有业务 API 上的内网管理接口 |
| `frontend/src/pages/public-video-links/` | “外发链接”页面，入口在现有工作台导航 |
| `config/deploy/public-media/` | 独立锁定依赖、镜像、Compose、Nginx、环境及权限模板 |

原有画布预览与下载继续走原流程。gateway 不导入主应用，不挂载业务数据，不持有业务数据库、Redis、供应商凭据或 `APP_SECRET_KEY`。

生产发布另见[视频公网 URL 生产部署与上线流程](视频公网URL生产部署与上线流程.md)，不要将本文的开发脚本或自签名 HTTPS 入口直接用于生产。

## 全局策略简化与已有环境升级

外发许可只要求全局 `*` 策略开启。用户、供应商不再单独审批或设置预算；拥有者/供应商标识仍用于任务关联、模型权限、归属检查、签发限速及审计。文件和任务的撤销屏障继续生效。

授权库升级为 schema v3，API/Worker/gateway 均拒绝旧版本。已有环境须先等待当前视频任务结束、停止服务并备份授权库，再运行 `./scripts/dev.sh media-init`，随后执行 `./scripts/dev.sh up`、`./scripts/dev.sh media-https`，重新构建并加载对应服务。升级删除旧用户/供应商策略，并撤销所有升级前仍活动的链接、清除交付 token，防止改变检查规则后旧链接重新可用；需要新建任务/链接。全局开关及额度、文件/任务撤销状态保持原样，不自动开启外发。v3 重复初始化不会再次撤销新链接。

## 开发机初始化与启动

下载入口和网关额外连接开发专用 `media_ingress` bridge，用于宿主机端口发布；该网络关闭出站 masquerading，端口仅绑定 `127.0.0.1:13001` 和 `127.0.0.1:18443`。授权库、存储和下载内部网络仍为 `internal`，PostgreSQL/MinIO 不连接接入网络。仅连接 `internal` 网络时，部分 Docker 版本不会建立宿主机端口映射，即使容器健康也无法通过上述端口访问。

开发环境以 [开发环境完整部署流程](开发环境完整部署流程.md) 为准：API、Worker、PostgreSQL、Redis、MinIO 和前端构建均由 Docker Compose 运行，宿主机不要求安装 Python、uv、Node、FFmpeg 或数据库。生产与开发使用独立机器、数据和凭据。

普通开发入口仍为 `./scripts/dev.sh up`。外发功能默认关闭，未准备媒体配置时不启动 gateway，也不要求授权库存在。

### 配置文件与注入范围

开发环境只维护 **`config/dev/.env`**，模板为 `config/dev/.env.example`。所有媒体变量都填写在主文件中；Compose 按服务白名单选择注入，gateway 不加载或挂载整份配置文件。

配置注入边界：

| 服务 | 从单一配置源获得的内容 |
| --- | --- |
| API/Worker | 现有业务运行参数、原业务连接/存储凭据、外发 writer 与只读存储配置；不获得 validator 或授权初始化管理员 DSN |
| gateway | validator、只读存储凭据、外发开关与下载限制；不获得 writer、业务数据库、Redis、应用加密密钥或管理员凭据 |
| media-init | 业务结构初始化所需配置、writer、validator、只读账号，以及 Compose 从 PostgreSQL 初始化配置生成的授权管理员 DSN |
| media-recover | 仅 writer DSN |

API/Worker 的业务参数白名单位于 `config/dev/compose.yml` 的 `x-business-environment`，新增环境参数时显式补充；未设置的参数保留 Python 默认值。开发容器设置 `LOAD_BOOTSTRAP_ENV=false`，阻止旧 `config/.env` 自动加载绕过白名单。原宿主机和生产的默认引导行为保持。


### 首次配置

1. 先按主部署文档完成普通开发环境。已有 `.env` 不覆盖；从 `config/dev/.env.example` 补充 `PUBLIC_VIDEO_*` 配置，暂时保持 `PUBLIC_VIDEO_ENABLED=false`。
2. 开发环境只维护 `config/dev/.env`。为 writer、validator、MinIO 只读账号分别生成凭据（`openssl rand -hex 24`），填写 `PUBLIC_VIDEO_WRITER_DSN`、`PUBLIC_VIDEO_VALIDATOR_DSN` 和 `PUBLIC_VIDEO_MINIO_SECRET_KEY`。不要复用 PostgreSQL 或 MinIO 管理员密码。设置 `chmod 600 config/dev/.env`，不提交此文件。
3. Compose 从这一个文件解析配置，按服务白名单注入，容器不通过 `env_file` 加载整份文件，也不让 gateway 挂载该文件。开关、读取账号、前缀和限额只填写一次。原先拆分文件的用户，先将原 validator DSN 等值合并到主 `.env` 并备份，再停止使用旧文件；不要生成新密码代替旧密码。
4. 核对下表中的媒体配置。容器内部地址固定为 `postgres:5432`、`minio:9000`。授权库使用 `media_auth`，不能填业务库名。内部文件 origin 按浏览器实际访问地址配置，例如 `http://localhost:3000`；自定义端口、域名或局域网地址也要显式列入。
5. 等待生成任务结束并备份数据，再停止开发服务、执行一次性初始化：

   ```bash
   ./scripts/dev.sh stop
   ./scripts/dev.sh media-init
   ```

首次填写时重点核对：

| 变量 | 填写要求 |
| --- | --- |
| `PUBLIC_VIDEO_ENABLED` | 初始化时为 `false`，成功后改为 `true`；整个开发环境只维护一个开关 |
| `PUBLIC_VIDEO_WRITER_DSN` | 使用 `media_writer`，连接 `postgres:5432/media_auth` |
| `PUBLIC_VIDEO_VALIDATOR_DSN` | 使用独立的 `media_validator` 密码，连接同一授权库 |
| `PUBLIC_VIDEO_MINIO_ACCESS_KEY`、`PUBLIC_VIDEO_MINIO_SECRET_KEY` | 专用只读账号及密钥，与业务 MinIO 管理员账号分开 |
| `PUBLIC_VIDEO_PREFIXES` | 允许读取的 `bucket/prefix/`，以 `/` 结束 |
| `PUBLIC_VIDEO_BASE_URL` | 固定 HTTPS 下载 origin；本机联调默认 `https://localhost:18443` |
| `PUBLIC_VIDEO_INTERNAL_ORIGINS` | 浏览器访问应用的准确 origin，例如 `http://localhost:3000`；多个值用逗号分隔 |

授权初始化管理员 DSN 由 Compose 从现有 PostgreSQL 初始化配置生成，只注入 `media-init`，无需在主文件额外填写 `PUBLIC_VIDEO_ADMIN_DSN`。

`project-init` 和 `media-init` 使用非 root 用户运行，源码只读挂载；日志通过 `app-logs` 命名卷写入 `/app/logs/init`，与 API/Worker 日志目录分开，无需修改宿主机源码或日志目录权限。

`media-init` 先启动 PostgreSQL/MinIO，再在一次性容器中运行 `python -m app.initialize --public-media`。沿用原业务库结构初始化；显式创建授权库、专用角色、schema v3 和受限就绪函数，同时准备专用 MinIO 只读账号及策略。管理员凭据仅在这个初始化容器中用于新增授权资源，不下发给 gateway。已有数据卷也可以执行，不依赖 PostgreSQL 空卷首次启动钩子。

初始化可重复执行：不重设已有角色/MinIO 用户密码，不自动启用已禁用账号，不改变已有外发策略或复活旧链接。配置与已有凭据不符、读取策略不一致时失败，需显式核对；不会用覆盖密码来掩盖配置错误。兼容入口 `python -m scripts.public_media.migrate` 保留，只有显式 `--rotate-passwords` 才轮换数据库角色密码，日常不使用它代替统一入口。

PostgreSQL 的开发扩展使用受控 `pg_hba.conf`：writer/validator 只允许连接 `media_auth`，其他库先拒绝，再保留原有业务账号的密码认证。该配置会应用到已有卷，首次接入需要重新创建 PostgreSQL/MinIO 容器，数据卷保留。不要删除卷重新初始化。

MinIO 只读策略限定在配置的 `bucket/prefix/` 下，只允许 `GetObject`、`GetObjectVersion`，不授予 ListBucket、写入、删除或管理权限。初始化不改变现有桶版本策略。默认要求对象具有非空版本；无版本对象会被拒绝。需要在明确选定的开发桶启用版本控制并重新上传测试素材；只有确认所有写入路径均使用不可覆盖的唯一键时，才显式启用 `PUBLIC_VIDEO_IMMUTABLE_OBJECTS=true`。

### 启用与日常开发

初始化成功后，在 `config/dev/.env` 中将唯一的 `PUBLIC_VIDEO_ENABLED` 设为字面量 `true`（支持引号和行尾注释），API/Worker 与 gateway 共用此开关：

```bash
./scripts/dev.sh media-up
# 使用默认 https://localhost:18443 联调下载时，启动开发 HTTPS 入口
./scripts/dev.sh media-https
curl -fsS http://127.0.0.1:13001/health/ready
curl -fsS http://127.0.0.1:3000/health/ready
```

两个就绪接口正常后，管理员还需在“外发链接”页面显式启用全局外发策略，并确认用户有对应模型权限。就绪检查通过只表示依赖可用，不代表已经获得外发许可。

默认开发下载 origin 是 `https://localhost:18443`。开发 edge 仅绑定回环地址，证书在容器临时文件系统生成，不改宿主机 Nginx，不用于真实供应商公网拉取。自签证书可在本地验收中显式接受，生产客户端仍须验证正式证书。

`scripts/dev.sh` 始终合并开发媒体扩展以保留网络/HBA，按主文件中的开关决定普通 `up` 是否启动 gateway；开关关闭后再次执行 `up` 会先停止已有 gateway/edge。脚本只读取布尔开关，不把 `.env` 当 Shell 脚本执行。停止、删除服务时也包含可选 edge；删除服务保留开发数据卷。API 源码继续自动重载；Worker 改动执行 `./scripts/dev.sh worker`；gateway 修改需执行 `./scripts/dev.sh media-up` 重建镜像；前端修改继续执行 `./scripts/dev.sh frontend`。修改 `.env` 后执行 `./scripts/dev.sh up` 更新容器环境；需要重新启动开发 HTTPS 入口时再执行 `./scripts/dev.sh media-https`。仅 `restart` 不会更新环境变量。

| 阶段 | 行为 |
| --- | --- |
| `./scripts/dev.sh init` | 显式沿用原业务库/存储初始化，不要求授权库 |
| `./scripts/dev.sh media-init` | 统一业务与授权资源初始化，临时使用管理员凭据 |
| API/Worker 启动 | 保留原业务初始化；外发启用时检查 writer 配置、授权库版本及运行账号 |
| gateway 启动 | validator 受限账号检查，不建库、不建表、不授权 |
| `/health/ready` | 外发启用时持续检查授权库；不依赖外发全局策略是否已启用 |


gateway 校验账号仅可执行准入、审计、版本检查三个受限函数，不能直接查询授权表。存活检查与就绪检查分开；授权依赖故障返回未就绪，下载仍逐次在线鉴权。外发关闭时 API/Worker 无需连接新库。

生产仍使用 `config/deploy/public-media/compose.override.yml` 与现有生产 Compose 合并、复用宿主机 Nginx；开发 HTTPS edge 不改变生产拓扑。gateway 使用独立锁定依赖与最小构建上下文、非 root、只读文件系统、独立凭据和内部网络，不挂载源码、业务数据或 Docker socket。

## 管理与失败行为

管理 API 继承现有会话，写请求还要求同源及 `X-MediaForge-Request: 1`。页面权限与实际外发许可分开：管理员只需明确启用全局 `*` 策略，无需逐个审批用户和供应商，用户还须有模型权限。页面可见不等于素材可外发。

首版只允许当前用户本人拥有的 MP4/MOV，拒绝共享但无法证明外发权的文件。文件须出现在当前有效任务的 `request.videos` 中，任务拥有者、模型和供应商必须匹配。手动签发也不能绕过此检查；普通用户不能提交 owner、桶、键、版本或自定义 token。火山本地视频素材登记由服务端建立独立操作记录。

链接只在首次签发/轮换响应中出现。列表不返回 token、摘要、对象键或可复用 URL；普通幂等重复返回 409，提示显式轮换。Worker 的短期交付记录用现有 `APP_SECRET_KEY` 加密，到期或撤销后清除，gateway 不持有该密钥。复制弹窗关闭、按 Esc 或页面隐藏时清除 URL；不写入浏览器持久化存储。

每次 HEAD/GET/Range 都在线校验；GET 即使只取一个区间，也预扣整文件大小，断连不退款。每链接 GET/HEAD 分别最多 64 次；全局及已配置文件/任务范围的日请求/流量预算在同一事务扣减，修改策略不会重置已用预算。失败鉴权不触碰 MinIO。

签发期限以授权数据库时钟计算；绑定后若素材保留期限变化，拒绝沿用旧绑定签发，要求使用新任务重新绑定。全局最多 1024 个活动授权，全局每分钟最多 120 次、每用户每分钟最多 30 次签发；轮换和随后被撤销的授权也计入限速，策略修改不能清零。活动素材预算默认每范围 2 GiB，可由管理员收紧或调整。

撤权/删除采用授权库中的**持久屏障先提交、业务操作后提交**。两者之间进程退出，只会留下禁用范围；重试不会恢复旧链接。授权库不可用时，不确认删除或禁用完整成功。自动清理在同一授权事务中检查活动引用并建立屏障，避开签发竞态。

ACL 变更仍关闭全局外发，需管理员复核后重新启用；AI 配置保存、画布删除和账号迁移撤销相关现有链接并设置受影响任务的撤销屏障，不创建用户/供应商策略。后续签发继续校验业务权限、素材归属和任务关联，旧链接不恢复。共享素材外发未开放，因此没有共享下载权自动升级为外发权的路径。

供应商已返回视频或明确失败时，立即撤销输入链接。取消、超时、网络错误或 Worker 失联不能证明供应商结束：已经开始提交的交付记录保留到 TTL，禁止自动重新 POST；仍处于准备阶段的链接可立即撤销。已知上游 ID 保存在授权记录和原任务中，未知提交结果需要查询原任务/人工核实，不能通过轮换重新计费。

火山视频素材登记使用 `asset:` 操作任务；授权库在同一事务检查同用户/文件/供应商的其他登记操作，避免两个请求读到旧业务状态后重复提交。确认上游终态才解除此限制，链接到期不能证明上游任务结束。

仅 `RUN_BACKGROUND_MAINTENANCE=true` 的现有维护进程每 60 秒清理到期交付、对账任务并清理 90 天前访问事件；不依赖存储清理开关，gateway 不运行维护循环。额度按有效期实时计算，维护停止也不会延长授权。

撤销只阻止后续准入，已开始的下载和供应商副本不能立即收回。关闭业务开关只停止新签发，紧急停止所有链接应先关闭授权库全局策略。公网入口不转发管理、健康或业务文件接口。

### 授权库恢复与账号轮换

恢复旧备份可能恢复已撤销的 token 摘要。数据库本身无法分辨自己的状态是正常历史还是恢复出来的历史，**不能只依赖备份中的全局开关**。恢复流程必须保持下载入口/gateway 停止，且停止签发；恢复完成后、重新开放之前，在指向该独立授权库的环境中运行：

```bash
# 只需 PUBLIC_VIDEO_WRITER_DSN；不传命令行密码，不需要主应用或 MinIO 凭据。
./scripts/dev.sh media-recover
```

`media-recover` 先停止 edge/gateway，再在只配置 writer DSN 的一次性容器中执行恢复失效。失败时入口保持停止，不自动重启。该操作在单个事务中关闭全局策略、撤销全部恢复出的活动授权、删除所有加密交付并追加脱敏审计；可重复执行。然后复核素材归属、任务关联和供应商配置，再显式重新启用策略、创建新任务和新链接。重新启用不会恢复旧 URL。若绕过此恢复流程直接开放入口，旧备份中尚未到期的链接可能重新生效，不能宣称系统自动检测了恢复。

账号轮换后须更新对应独立环境并重启持有连接池/存储客户端的进程；已有 PostgreSQL 会话不因改密码自动断开。必要时先关闭全局策略并排空旧连接。私有集成测试已验证旧数据库密码和旧 MinIO 密钥被拒绝、新凭据可恢复读取；没有轮换开发机或生产机的真实账号。

### 本地可观测性

gateway 的 `/health/metrics` 仅从回环/受限内部网络读取，专用 HTTPS 模板拒绝转发。输出下载槽位及峰值、HTTP/中断结果计数、授权库连接与等待、准入/存储/请求耗时、读取和发送字节；没有 URL、token、文件键或授权 ID 标签。进程重启后聚合清零，逐请求审计仍在授权库中保留 90 天。Nginx 限制单 IP 4 路、8 请求/秒；应用限制全局 16 路，不额外预取，单次同步读取最多受 I/O 时限约束。

gateway 忽略外部传来的代理 IP 头，数据库中的 `client_ip` 是直接连接的代理地址。Nginx 记录自己观察到的 `$remote_addr`，通过 gateway 生成的 `X-Request-ID` 与授权审计关联；不把客户端传入的请求 ID 当审计身份。若公司 NAT 已丢失原始 IP，这些日志无法还原供应商真实出口，不能据此声称做了供应商 IP 认证。

下载总时限覆盖准入与传输。取消后仍需等待进行中的同步存储操作结束并归还连接；最坏清理还受存储 I/O 15 秒及授权库池等待/SQL 时限约束，不能承诺第 600 秒瞬间释放一切资源。Compose 延续现有生产方案，不设置容器内存硬上限；CPU、进程数、线程、连接和块大小有界。

## 可重复测试

```bash
# 构建隔离测试镜像并运行全部新功能测试
./scripts/dev.sh media-test
# 定向检查可追加 pytest 参数
./scripts/dev.sh media-test tests/public_media/test_initialization.py -q

# 真实 gateway/HTTPS 镜像验收；先构建 gateway、edge 和测试镜像
./scripts/dev.sh media-smoke

# 有关存量回归，使用现有 API 容器依赖
./scripts/dev.sh test tests/test_seedance2_video_reference.py tests/test_cloudwise_seedance.py \
  tests/test_canvas_worker_authorization.py tests/test_canvas_tasks.py tests/test_storage_lifecycle.py \
  tests/test_storage_io.py tests/test_video_billing.py tests/test_logging.py tests/test_health.py

docker compose -f config/dev/compose.yml run --rm --no-deps frontend npm test -- --run test/public-video-links.test.js
./scripts/dev.sh frontend
```

测试镜像从现有应用开发镜像取得 Python 依赖、从开发 MinIO 镜像取得服务器二进制，使用 PostgreSQL 16 基础镜像补齐 FFmpeg/Nginx/OpenSSL。首次测试前先完成普通开发镜像构建；依赖变化先重建应用镜像。测试容器内启动私有 PG/MinIO/Nginx/gateway 进程，使用随机回环端口、独立库/桶/账号和合成 MP4/MOV。容器无网络、无宿主端口、无共享业务卷或 Docker socket，结束后删除容器。不会修改日常开发服务的 HBA、账号或版本策略。

`PUBLIC_VIDEO_INTEGRATION=1` 在测试镜像中显式启用；缺依赖会失败，未启用时跳过不能算集成通过。可选原生执行仍支持 `PUBLIC_VIDEO_TEST_PG_BIN` / `PUBLIC_VIDEO_TEST_NGINX`，但不是新开发环境的前置条件。浏览器交互沿用已交付的 Playwright 脚本，本轮未修改界面；若执行浏览器检查，需另行准备 Playwright 浏览器运行依赖，不能将容器后端检查称为浏览器测试。

`media-smoke` 使用唯一临时 Compose 项目验证实际最小 gateway 镜像和开发 edge 镜像，依赖与合成视频均为一次性测试资源，不向测试服务注入开发 `.env` 或业务凭据。验证 HEAD、完整 GET、Range、无效 token、健康路径拒绝及在线撤销；结束后仅删除本次项目的容器、网络及测试卷，不操作 `mediaforge-dev` 数据。

供应商请求使用模拟客户端，不产生真实付费调用。公网可达、正式证书、映射及真实供应商兼容性仍未验证。

## 历史验收记录（2026-11-11，原宿主机环境）

| 检查 | 实际结果 |
| --- | --- |
| 新功能与相关后端回归 | 上述 `tests/public_media` 加八组相关存量测试，共 129 项通过；覆盖页面静态别名权限、真实数据库/存储、HTTP、生命周期、模拟供应商与 socket 资源回收 |
| 新增 Python 检查 | Ruff check / format check 通过；主应用与新模块编译检查通过 |
| 前端新增测试/构建 | 新增 Vitest 2 项通过；`npm --prefix frontend run build` 通过，保留原有大 chunk 等构建提示 |
| 浏览器 | 原生 Playwright 通过签发、复制、Esc/关闭清除、轮换、撤销、管理员、移动尺寸与 XSS 检查；管理 API 为模拟响应 |
| 最小运行依赖 | 根据 gateway 自己的 `uv.lock` 建立独立 Python 3.11 环境，以该 Python 启动真实 gateway，HTTPS/socket 3 项通过；这不代表镜像已构建 |
| 代理/Compose | 临时本地 Nginx 的 `nginx -t`、真实 HTTPS/SNI/Host/路径/方法/伪造代理头测试通过；从下载解压的独立 Compose v2 二进制对无密钥模板镜像目录执行合并 `config --quiet` 通过，未执行 `up` |
| 镜像/CI | Docker 不可用；已尝试私有 rootless BuildKit，基础镜像解包时报未映射 GID，构建未通过；CI 曾编写但未触发，2026-11-12 按用户要求恢复原状；保留本地测试及 V14/V15 的镜像待验证状态 |
| 后端全量存量检查 | 一次全量结果为 541 通过、16 跳过、9 失败；这 9 项已在 `git archive HEAD` 的独立基线副本复现，详见下文 |
| 前端全量存量检查 | 722 通过、1 失败；失败在独立 HEAD 基线同样复现 |

主链路结果保存在 `.runtime/public-media-final-tests.log`，最小运行依赖测试在 `.runtime/public-media-minimal-runtime-tests.log`，页面权限单独结果在 `.runtime/public-media-page-guard-tests.log`。构建、全量回归与基线复现日志均放在 `.runtime/public-media-*.log`，不提交临时依赖、凭据或构建缓存。后端全量检查的计数是当时的执行快照；之后新增的定向测试另行执行通过，没有把跳过当成真依赖通过。

16 路慢读使用每文件 **79,693,493 字节（约 76 MiB）** 的合成大视频容器，源文件仅位于私有 MinIO fixture，gateway 不产生视频文件。普通运行环境的一次结果：空闲 RSS 71,241,728 字节、峰值采样 84,348,928 字节，增长约 12.5 MiB；采样线程 14、描述符 50、授权库连接 2、数据库等待 0；最大单请求读取 1.5 MiB 后停读，约 1.094 秒收回全部下载槽位。独立最小环境重复测试也通过。线程/描述符是满并发时采样值，不能把它们宣称为连续采集的绝对峰值；每次运行会覆盖 JSON。应用在 2 路和 16 路场景下均通过，完整小视频与大文件慢读分别验证正确性和反压，不能据此推算公网性能。

9 个后端基线失败来自：6 个旧 Canvas Agent skill 发现/读取断言、Cloudwise 固定模型列表断言、RunningHub 旧 app ID 断言、workflow-config 页面旧脚本引用断言。前端基线失败为 `api-settings` 兼容页旧模块引用断言。本次未修改这些无关业务来强行通过；原有 Seedance 本地视频测试则按新的安全契约更新为“未启用授权服务时拒绝外发，禁止旧 URL 回退”。

原宿主机阶段未完成镜像验收；迁移到 Docker 开发环境后的构建与容器验证另记在下节，不能把历史环境限制当作当前机器状态。

初始化授权 database/角色、配置专用读取账号、显式启用策略后，功能才能在具体环境使用；本次保持默认关闭，没有替用户启用生产或共享开发服务。

## Docker 开发环境适配记录（2026-11-12）

已补充开发 Compose 扩展、统一初始化、受限就绪检查、隔离测试镜像和开发 HTTPS 镜像。以下为 Docker 环境适配阶段的验证记录，后续单一配置源调整另列：

| 检查 | 结果 |
| --- | --- |
| 容器内新功能与相关后端回归 | 137 项通过；包括统一初始化、重复初始化不重设密码/启用账号、schema/角色检查、API/gateway readiness、真实 PG/MinIO、供应商模拟、慢读及断连回收 |
| 镜像构建 | gateway 独立依赖镜像、开发 HTTPS edge 和隔离集成测试镜像均构建成功 |
| 最小 gateway 运行 | UID 10001、只读根目录、无网络及无额外能力下，独立导入及默认关闭启动通过，不加载业务配置 |
| 实际镜像链路 | 临时 Compose 项目中 HTTPS → gateway → PG/MinIO 通过 HEAD、完整 GET、Range、无效 token、健康路径拒绝和在线撤销；完成后清理测试资源 |
| 静态检查 | 新增 Python Ruff check/format、Shell 语法、开发 Compose 合并及 `git diff --check` 通过 |
| 开发数据隔离 | 未在日常开发实例执行授权初始化、账号轮换、桶版本变更或备份恢复；原服务继续运行 |

协议单测补齐固定测试域名的 DNS 替身，HTTP 仍由 MockTransport 模拟，容器继续禁网；生产 DNS/出站地址校验逻辑保持原实现。137 项为该阶段相关回归，未再次运行整个仓库全量测试或浏览器交互检查。CI 继续保持用户要求的原状。

日志见 `.runtime/public-media-docker-regression.log`、`.runtime/public-media-image-smoke.log`、`.runtime/public-media-container-build.log` 和各镜像构建日志。外发仍默认关闭，日常开发环境首次启用需按本文完成配置及初始化；未验证公网或真实供应商。

### 单一配置源调整验证记录

开发环境已移除 gateway/init 的独立 `.env.example`，全部配置集中到 `config/dev/.env.example` 对应的单一 `.env`。生产后续也已统一为 `config/deploy/.env`，各服务仍按白名单保持凭据边界，具体操作见生产专项文档。凭据隔离由各服务的环境白名单实现；备份仅需保存主 `.env`，恢复时仍先失效旧授权。本轮验证结果：

- 单一配置源、凭据边界、布尔开关/引号/注释、环境优先级和禁止 Shell 执行共 **6 项检查通过**，仅使用合成凭据。
- 容器内初始化、旧配置加载隔离、API 健康、Worker 授权及日志相关回归 **19 项通过**。
- 使用同一份临时配置，在独立 Compose 项目中实际运行 API、Worker、gateway、project-init、media-init、media-recover 六个一次性容器，验证白名单、原业务数值参数与默认值；未连接数据库/存储或执行初始化命令。测试后删除该项目容器、网络与测试卷。
- Compose 合并解析、Shell 语法、Ruff 与 diff 检查通过。此轮未重复执行全部 137 项或 HTTPS 下载链路，前一轮证据保留。

日志为 `.runtime/public-media-env-contract.log`、`.runtime/public-media-single-env-tests.log`、`.runtime/public-media-env-runtime.log`。实际开发凭据未改写，当前业务容器未重建；补齐主文件后执行 `./scripts/dev.sh up` 应用新的环境注入方式。

### 全局外发策略简化验证（2026-11-12）

- schema v3 迁移及管理接口回归 12 项通过；覆盖旧策略清理、旧链接撤销、重复初始化保留新链接、旧库版本拒绝及已移除策略返回 422。
- 签发、配额、生命周期撤销及管理接口回归 19 项通过；仅启用全局策略即可签发和下载，文件/任务屏障继续阻止旧任务重新签发。
- 前端请求边界测试 2 项通过，28 个页面构建成功；独立镜像 HTTPS 冒烟通过 HEAD/GET/Range、无效 token 和在线撤销检查。
- 本开发机升级前已备份授权库，确认没有带活动外发授权的任务；完成统一初始化、网关更新、API/Worker 重启及页面构建。API 与 gateway readiness 均正常，全局策略保持原值。未修改生产环境、未验证公网或真实 Cloudwise 下载。

验证日志：`.runtime/public-media-global-policy-recheck.log`、`.runtime/public-media-global-policy-final-tests.log`、`.runtime/public-media-global-frontend-tests.log`、`.runtime/public-media-global-policy-smoke.log`。备份位于 `.runtime/media-auth-before-global-v3-*.dump`，权限为 0600；包含授权数据，应按凭据文件保护。
