# 视频公网 URL 生产部署与上线流程

在现有 MediaForge 生产环境上增加视频外发功能。原系统安装、目录准备及备份方式沿用[生产环境完整部署方案](生产环境完整部署方案.md)。

**下载链路：供应商 → 宿主机 Nginx（HTTPS）→ media-gateway（鉴权）→ 私有 MinIO（流式读取）。**

生产只维护 `config/deploy/.env`，各服务按白名单读取所需变量。生产复用宿主机 Nginx，不部署开发用 `media-edge`，不使用开发数据、密码或自签名证书。

> 当前部署条件：IT 提供公网 IP＋端口，不依赖域名/DNS。渲染脚本已支持纯 IP 和域名两种入口，自动按 `--host` 选择模板；纯 IP 不要求域名 SNI。HBA 已自动接入，真实部署及 Cloudwise 公网读取仍需验收。

内网可先通过 IP 测试；正式公网仍采用 HTTPS，证书必须覆盖实际公网 IP。无域名不等于可以省略证书或关闭供应商的证书验证。

## 一、上线前准备

| 负责方 | 准备内容 |
| --- | --- |
| 开发人员 | 已验收的业务/gateway 镜像，固定标签或 digest，匹配的代码及回退版本 |
| 部署人员 | 维护窗口、数据备份、生产配置、容器目录权限和数据库连接验证 |
| IT/网络运维 | 固定公网 IP、内外端口映射、IP HTTPS 证书验证配合、防火墙；协商证书续期与 Nginx 分工 |

先确认三个条件：

- **网络**：公网端口映射到 Nginx 的专用 HTTPS 监听端口；Nginx 转发至本机 `127.0.0.1:13001`。不直接映射 gateway、业务 API 或 MinIO。公网 IP 及非 443 端口需验证 Cloudwise 是否支持；记录公网 IP:端口 → 虚机内网 IP:Nginx 端口的完整映射。
- **存储**：明确允许的 MinIO 桶和前缀。默认要求视频具有非空对象版本；桶启用版本控制后，历史视频仍可能需要重新上传。不要为绕过报错直接开启 `PUBLIC_VIDEO_IMMUTABLE_OBJECTS`。
- **数据库**：媒体 Compose 自动加载下述 HBA 规则，无需填写 Docker 网段或手工合并规则；上线后仍需验证业务连接。

### PostgreSQL 的 HBA 已由 Compose 自动接入

HBA 是 PostgreSQL 的客户端连接认证规则，文件为 `pg_hba.conf`。本功能要求：

| 账号 | 允许连接 | 拒绝连接 |
| --- | --- | --- |
| `media_writer` | 授权库 `media_auth` | 业务库及其他库 |
| `media_validator` | 授权库 `media_auth` | 业务库及其他库 |

生产媒体扩展会只读挂载 [项目 HBA 文件](../config/deploy/public-media/pg_hba.conf)，并通过 PostgreSQL 启动参数指定使用它。规则覆盖 IPv4/IPv6，不依赖固定 Docker 网段：专用账号仅允许密码连接 `media_auth`，其他库及 Unix socket 连接均拒绝；原业务网络连接使用 SCRAM 密码认证，容器内管理/备份继续使用原有本地连接方式。PostgreSQL 不发布端口，网络隔离继续生效。

适用于完全按原生产部署方案安装的环境。授权库名固定为 `media_auth`；如修改库名、有自定义 HBA 或旧业务密码使用 MD5 存储，须先调整并验证规则，不要直接套用。不要通过关闭认证解决连接失败。

首次执行媒体部署命令会重建 PostgreSQL 容器，使外部 HBA 对已有数据目录也生效；**不删除数据、不重新建库**，但会短暂中断连接，应在维护窗口执行。原数据目录内的 HBA 保留，但 PostgreSQL 使用挂载文件。未合并媒体扩展的基础 Compose 不会启用此限制；上线后统一使用下文 `dm` 命令，避免恢复默认认证规则。

## 二、首次上线：按顺序执行

以下命令均在生产项目根目录执行，不使用 `scripts/dev.sh`。先定义统一命令：

```bash
dm() {
  docker compose --env-file config/deploy/.env \
    -f config/deploy/compose.yml \
    -f config/deploy/public-media/compose.override.yml "$@"
}
```

### 1. 排空任务，停止服务并备份

暂停新任务，等待已有任务结束；提交状态不明的任务先核对上游，避免重复计费。关闭已有下载入口，然后停止签发及消费：

```bash
dm --profile public-media stop api worker media-gateway
```

按原生产方案备份业务库、已有授权库、MinIO 数据与配置、生产配置/密钥及 Nginx 配置，记录当前镜像并确认备份可恢复。保留原 `APP_SECRET_KEY`，不要导入开发授权库或 token。

### 2. 合并生产配置

以 [唯一生产环境模板](../config/deploy/.env.example) 为准，将新增项合并到 `config/deploy/.env`；已有文件先备份，**不要直接覆盖原配置或重置现有账号密码**。文件权限设为 `0600`。

| 重点配置 | 填写要求 |
| --- | --- |
| `APP_IMAGE`、`MEDIA_GATEWAY_IMAGE` | 本次已验证的固定镜像版本，提前构建或拉取 |
| `PUBLIC_VIDEO_ENABLED` | 初始化时保持 `false` |
| `PUBLIC_VIDEO_BASE_URL` | 公网下载 HTTPS 地址，包含实际端口，例如 `https://<实际公网IP>:18443`；尖括号是占位说明，不可原样填写 |
| `PUBLIC_VIDEO_INTERNAL_ORIGINS` | 用户访问生产业务站点的准确 origin，不是公网下载地址 |
| `PUBLIC_VIDEO_WRITER_DSN`、`PUBLIC_VIDEO_VALIDATOR_DSN` | 生产授权库的独立账号及密码，连接串特殊字符需正确编码 |
| `PUBLIC_VIDEO_MINIO_*` | 容器内 MinIO 地址及专用只读账号；权限限于所选前缀的读取和版本读取 |
| `PUBLIC_VIDEO_PREFIXES` | 实际允许的 `桶/前缀/`，保留末尾 `/` |
| TTL、文件大小、并发及超时 | 从模板默认值起步，按资源与供应商限制调整 |

管理员 DSN 不用手填：Compose 仅为 `media-init` 从现有 `POSTGRES_*` 生成。gateway 只获得 validator、只读存储及下载参数；API/Worker 不获得 validator 或授权管理员 DSN。

若以前有媒体独立 `.env`，将其原值合并后停止使用旧文件。API/Worker 已禁用旧 `config/.env` 自动加载；仍需使用的业务变量必须迁入主文件，并确认已列入 Compose 白名单。

检查配置，避免输出展开后的密码：

```bash
dm --profile public-media --profile media-tools --profile init config --quiet
```

### 3. 初始化授权资源

确认数据盘已挂载、`DATA_ROOT` 正确，并按原生产方案准备目录；UID/GID 10001 必须能写 `${DATA_ROOT}/logs/init`。随后执行（自动应用 HBA）：

```bash
dm up -d --wait postgres minio
dm --profile media-tools run --rm --no-deps media-init
```

成功标志：输出 `Project initialization complete`，没有初始化或日志权限错误。

该步骤沿用业务初始化，并准备授权库、专用角色、schema v3 和 MinIO 只读账号。管理员凭据仅用于一次性容器。重复执行不轮换密码、不重新启用禁用账号或策略，也不更改桶版本控制；凭据不匹配应核对原因。

### 4. 开启功能并检查服务

将主 `.env` 中 `PUBLIC_VIDEO_ENABLED` 改为 `true`，重新创建服务：

```bash
dm --profile public-media up -d --no-build --wait api media-gateway
dm up -d --no-build worker
curl --max-time 10 -fsS http://127.0.0.1:13001/health/ready
curl --max-time 10 -fsS http://127.0.0.1:3000/health/ready
```

执行 `dm exec postgres psql -U <POSTGRES_USER实际值> -d postgres -c "SHOW hba_file;"`，应显示 `/etc/postgresql/media-pg_hba.conf`。确认 writer/validator 正确密码能连授权库、错误密码不能连接，并且连接业务库、本地 socket 均被拒绝；原业务连接和容器内备份应正常。测试时通过受限环境文件或交互输入密码，不将真实密码写进命令。

网关应返回 `ready=true`、`enabled=true`，API 各组件均正常。再确认原登录、画布、生成和下载正常，只有预期 Worker 消费队列，以及数据库账号限制生效。

此时保持授权库全局策略关闭、下载入口不开放。健康检查通过只说明依赖可用。修改环境变量后要重新创建容器，仅 `restart` 不会加载新值。

### 5. 接入 Nginx，限制视频总上传带宽，再开放入口

当前按“公网 IP＋端口”部署，分两阶段处理：

| 阶段 | 地址与用途 | 证书要求 |
| --- | --- | --- |
| 内网完整链路测试 | `http://10.7.89.41:18443` 或自签名 HTTPS；只使用非敏感测试视频，验证网关鉴权、路径/方法及限流 | HTTP 无加密；自签名 HTTPS 需测试客户端显式接受，证书 SAN 应包含访问的内网 IP |
| 正式公网使用 | `https://<实际公网IP>:<公网端口>`；用于真实 Cloudwise 拉取 | 受客户端信任、SAN 覆盖实际公网 IP 的证书，并配置自动续期 |

临时 HTTP/自签名入口仅限受控测试，不把包含真实授权 token 的 HTTP 链接发到公网。现有签发配置要求 HTTPS，不能仅把 `PUBLIC_VIDEO_BASE_URL` 改成 HTTP 来测试完整链路；可使用自签名 HTTPS 和显式接受测试证书的测试客户端。自签名内网测试不能代替正式公网验收。

**渲染纯 IP Nginx 配置：**

- `nginx-ip.conf.template` 用于 IP 模式：专用端口默认站点接受无 SNI 的 HTTPS 客户端，通过 HTTP Host 限制为指定 IP（允许附加端口）。错误 IP/域名返回 444。Host 不是身份认证，授权仍由 gateway 校验。
- 原 `nginx.conf.template` 保留域名模式及 SNI 检查，开发 localhost 入口不变。脚本默认自动识别，也可用 `--mode ip` / `--mode domain` 明确选择。

在生产项目根目录生成待审阅文件。下面的 `203.0.113.10` 是文档示例 IP，执行前换成真实公网 IP，证书和日志路径也按实际填写：

```bash
python3 scripts/public_media/render_nginx.py \
  --mode ip \
  --host 203.0.113.10 \
  --listen 18443 \
  --cert /etc/nginx/certs/media-ip/fullchain.pem \
  --key /etc/nginx/certs/media-ip/privkey.pem \
  --upstream 127.0.0.1:13001 \
  --access-log /var/log/nginx/media-download.log \
  > /tmp/media-download.conf
```

`--host` 只填 IP，不带协议、端口或 IPv6 方括号；`--listen` 是本机实际监听端口。脚本仅生成文件，不安装、不重载 Nginx。检查输出后，由部署人员合并到 Nginx 的 `http {}` 上下文；证书私钥不会写入生成配置，只有路径。

- 保留下载路径白名单、GET/HEAD、频率/并发限制、请求体/超时、代理头清理、关闭缓存及临时文件、日志脱敏等措施；token、有效期、撤销和额度仍由 gateway 校验。IP/Host 检查不代替 token 鉴权。
- 证书匹配公网 IP，不是虚机内网 IP；公网 IP 变化需重新处理证书。私钥只保存在受限文件中。
- 上游仍为 `127.0.0.1:13001`。Nginx 监听宿主机实际映射目标端口，不把公网 IP 误当成本机已有网卡地址来绑定。

公网 IP 可信证书已可申请；例如 [Let’s Encrypt 的 IP 证书](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)有效期约 6 天，必须安排可靠的自动续期及 Nginx 证书重载。提前与 IT 确认证书机构的 IP 控制权验证方式、所需验证端口及映射；只有一个 18443 映射并不保证能完成证书申请。

安装前检查专用端口默认站点是否冲突、配置是否处于正确的 `http {}` 上下文，并保留原业务站点。内网测试通过后移除临时入口、换成正式 IP 证书，再进行以下公网验收。

执行 `nginx -t`，通过后重载。**开放公网映射前，先完成下面的总带宽限制。**

#### 视频外发总上传带宽（在生产宿主机配置）

所有视频下载共享一个总上传带宽上限；不设置单请求 `limit_rate`，原有 Nginx 请求频率、并发及 gateway 并发限制继续保留。此处是**生产机器操作流程**，不是开发机配置，也不会随 Compose 自动执行。

使用 Linux `tc` 将专用 Nginx TCP 源端口的 IPv4/IPv6 流量放入同一个 HTB 限速类别；其他端口走不设置带宽上限的直通队列。该操作会改变出口网卡的根调度器，仍需检查原业务延迟，不能承诺网络调度完全不变。

**① 确认网卡、端口和上限**

由部署人员/网络运维在生产机器执行 `ip route get <供应商实际下载客户端IP>`，有 IPv6 时也执行 `ip -6 route get <IPv6客户端IP>`，确认视频流量的真实出口。以下数值仅为示例，按实际情况修改：

```bash
VIDEO_IF=ens18       # 实际出口网卡，不凭服务器 IP 猜测
VIDEO_PORT=18443     # 宿主机 Nginx 专用下载监听端口，不是 gateway 13001
VIDEO_RATE=50mbit   # 所有视频合计 50 Mbps，约 6.25 MB/s
```

端口必须专用于视频下载，匹配的是宿主机实际端口，不一定是 IT 映射后的公网端口。所有视频需从同一网卡发出；多出口、隧道、IPv4/IPv6 不同出口或宿主机额外端口改写，交由网络运维针对实际路径设计，不能直接套用。当前方案只匹配 TCP HTTPS，不自动覆盖 HTTP/3/UDP。

**② 检查现有规则，再应用（生产 root 执行）**

先保持视频公网入口关闭，安装 `iproute2` 并查看：

```bash
apt-get install -y iproute2
tc -s qdisc show dev "$VIDEO_IF"
tc -s class show dev "$VIDEO_IF"
tc -s filter show dev "$VIDEO_IF"
```

只有确认网卡使用未自定义的默认根队列时，才执行下面的初始化。**如已有自定义 QoS/限速规则，停止此流程，由网络运维合并，不能覆盖。** `7f10:` 专供本功能使用，不混入其他业务规则。

```bash
# 再次检查默认根队列，发现非默认配置则拒绝继续。
tc -j qdisc show dev "$VIDEO_IF" | python3 -c '
import json, sys
roots = [r for r in json.load(sys.stdin) if r.get("root")]
assert all(r.get("handle") == "0:" and r.get("kind") in
           ("noqueue", "mq", "fq_codel", "pfifo_fast") for r in roots), "已有规则，请交由网络运维处理"
' && (
  set -e
  tc qdisc replace dev "$VIDEO_IF" root handle 7f10: htb default 0
  tc class add dev "$VIDEO_IF" parent 7f10: classid 7f10:1 htb \
    rate "$VIDEO_RATE" ceil "$VIDEO_RATE" burst 128k cburst 128k
  tc filter add dev "$VIDEO_IF" parent 7f10: protocol ip pref 101 \
    flower skip_hw ip_proto tcp src_port "$VIDEO_PORT" classid 7f10:1
  tc filter add dev "$VIDEO_IF" parent 7f10: protocol ipv6 pref 102 \
    flower skip_hw ip_proto tcp src_port "$VIDEO_PORT" classid 7f10:1
)
```

两条过滤规则共用 `7f10:1`，因此 IPv4、IPv6 和所有视频请求共享上限，未分类流量使用 `default 0` 直通。令牌桶允许短时突发，总上限并非每个请求各自享有的速度。任一步失败，保持入口关闭，检查权限、内核模块、规则及实际出口；核实为本次创建的根队列后，按下文回退，不在残缺配置下开放入口。

**③ 验证限速和原业务**

```bash
tc -s class show dev "$VIDEO_IF"
tc -s filter show dev "$VIDEO_IF" parent 7f10:
```

同时下载两段较大的测试视频，确认合计速率接近且不持续超过设定值，`7f10:1` 及对应过滤器计数增长。再访问原业务端口，确认其不进入该限速类别、响应正常。过低的上限会延长下载，需结合视频大小、600 秒下载总时限和 Cloudwise 超时验收。

**④ 持久化、更新与回退**

`tc` 命令默认不跨重启保存。生产运维应把已验收的网卡、端口和规则纳入宿主机现有网络启动管理或独立 systemd oneshot 服务：网络就绪后应用、保留已安装状态，启动遇到已有自定义规则应失败，停止时只移除本功能规则。避免网络管理服务后续重置队列。重启演练后必须再次确认规则及实际下载速率，才开放视频入口。Compose 重启不负责应用这些宿主机规则。

调整端口/网卡/上限前先关闭视频入口，停止持久化服务并清理**旧网卡**上的旧规则，再修改部署参数、重新应用并验收。回退时先停用持久化服务，检查以下命令显示的根队列确为本功能独占的 `htb 7f10:`，再删除：

```bash
tc qdisc show dev "$VIDEO_IF"
# 确认属于本功能后执行；不删除其他根队列。
tc qdisc del dev "$VIDEO_IF" root handle 7f10:
```

删除后恢复系统默认根队列，不撤销授权或关闭公网入口。只有确认入口受控后才能移除限速，不能把移除限速当作紧急停外发。

#### 外网入口检查

带宽规则验证通过、持久化完成且 Nginx 正常后，再开放公网映射，由外网机器验证：

| 检查 | 预期结果 |
| --- | --- |
| 公网 IP、端口和证书链 | 正常访问；证书覆盖该公网 IP，无 SNI 的 IP 客户端可用，不跳过 TLS 校验 |
| 直接访问服务器 IP 的 `13001` | 不可达；该端口仅供宿主机 Nginx 使用 |
| 下载入口上的健康、管理及业务接口 | 不放行；不符合已选定 IP/Host 规则的请求被拒绝，不再要求域名 SNI |
| 无有效 token 的视频下载 | 拒绝 |

网关通过专用接入 bridge 发布回环端口，该网络关闭出站 masquerading；它不代替防火墙规则。数据库和 MinIO 不接入该 bridge。

### 6. 开启全局策略，验收 Cloudwise

管理员在“外发链接”页面启用全局 `*` 策略，设置每日流量和活动授权额度。无需单独审批用户、供应商；模型权限、素材归属、任务关联继续校验。

使用本人拥有、满足前缀与对象版本要求的非敏感视频，提交 Cloudwise Seedance 视频生视频任务：

| 检查 | 通过标准 |
| --- | --- |
| 自动签发 | 授权记录中的文件、任务、拥有者和供应商正确，下载地址使用实际公网 IP 和端口 |
| 实际生成 | Cloudwise 成功拉取视频，统计出现读取及流量，任务成功且未重复提交 |
| 成功后的撤销 | 任务确认成功后，旧链接不能再次下载 |
| 权限与链接限制 | 他人/仅可预览素材、无有效任务、无模型权限，以及无效/过期/撤销 token 均被拒绝 |
| 额度及全局停用 | 超额被拒绝；关闭全局策略后撤销旧授权并阻止新签发，重新启用不恢复旧链接 |

并发、极限额度和故障注入优先在隔离环境测试。撤销不能收回供应商已有副本，也不保证中止已开始的下载。测试链接按凭据保护，不粘贴到共享记录。

**真实 Cloudwise 完成读取与生成后，才算端到端验收通过。** 少量放量，观察下载失败率、流量、连接数、CPU/内存及磁盘，再扩大使用范围。

## 三、以后更新：按变更类型操作

每次更新前仍需排空任务、备份并核对镜像与授权库兼容性。

| 变更 | 操作 |
| --- | --- |
| 仅改容器运行参数或镜像版本 | 按首次上线第 4 步重新创建相关服务，再检查健康与业务 |
| 授权库结构升级 | 关闭入口、停止 API/Worker/gateway，执行第 3 步初始化/升级，再执行第 4～6 步 |
| 公网 IP、证书或映射端口 | 同步检查 `.env`、Nginx 和映射，重新进行外网与 Cloudwise 验收 |
| 修改总带宽、出口网卡或专用端口 | 关闭视频入口，停止宿主机持久化规则、清理旧规则，再更新部署参数及 Nginx，重新应用并验收 |
| 停用外发 | 先关闭全局策略和下载入口，再停止 gateway、更新业务开关；不能只改 `.env` 代替撤销 |

v1/v2 升级到 v3 会删除用户/供应商策略，撤销升级前活动链接并清除交付 token；全局开关、额度和文件/任务屏障保留，升级后创建新任务/链接。v3 重复初始化不会撤销新链接。

## 四、故障回退与备份恢复

1. 关闭全局策略和公网入口，必要时停止 gateway；暂停任务并核对上游状态，避免重复计费。
2. 保存脱敏日志和数据快照，按发布记录回退镜像、配置及 Nginx。旧 API/gateway 不得连接不兼容的授权库；可保持外发关闭恢复原业务。
3. **如恢复了授权库备份**，保持入口关闭、签发停止，恢复后执行：

```bash
dm --profile public-media stop api worker media-gateway
dm --profile media-tools run --rm --no-deps media-recover
```

恢复工具仅持有 writer DSN，会关闭全局策略、作废恢复出的旧授权并删除交付 token。成功后复核配置、素材及权限，再启动服务、显式开启策略并创建新任务/链接。失败则保持入口关闭。

数据库不能自行识别备份恢复，**不得跳过恢复失效步骤直接开放入口**，否则旧备份中的链接可能重新有效。

## 五、保留哪些上线记录

记录执行时间/人员、镜像及 schema 版本、备份位置、公网 IP 及内外端口映射、证书续期安排、健康与 Cloudwise 验收结果、监控和回退版本。备份和配置限制访问，不记录密码、完整 DSN、供应商密钥或有效 token。

已有验证记录（2026-11-12）：生产/开发配置契约 9 项通过；六个隔离一次性容器验证环境注入及非 root 日志写入，未执行生产初始化或恢复。日志见开发机 `.runtime/public-media-production-single-env-runtime.log`。功能测试详情见[开发与验证文档](视频公网URL开发与验证.md)。


HBA 自动接入验证：使用独立 PostgreSQL 16 容器和临时数据卷，验证新库及容器重启后的已有库、IPv4/IPv6、专用账号正确/错误密码、跨库拒绝、Unix socket 拒绝和业务账号连接。命令为 `MEDIAFORGE_TEST_DOCKER_HBA=1 .venv/bin/python -m pytest tests/test_production_hba.py -q`；需本机 Docker 及已缓存的 PostgreSQL 16 镜像，不连接日常数据库。日志见 `.runtime/public-media-production-hba-test.log`。


视频总带宽实现采用 [tc flower](https://man7.org/linux/man-pages/man8/tc-flower.8.html) 按源端口分类，未分类流量使用 HTB direct queue（[HTB 说明](https://tldp.org/HOWTO/Traffic-Control-HOWTO/classful-qdiscs.html)）。规则/配置测试不操作真实出口；隔离网络吞吐验收日志见开发机 `.runtime/public-media-bandwidth-network-test.log`。真实生产出口、NAT 路径及供应商下载仍需按上文验收。


IP 入口实现：新增独立 IP 模板，原域名模式保持兼容。测试覆盖 IP/域名选择、参数拒绝及保留安全指令，并在隔离真实 Nginx/gateway/MinIO/授权库中验证无域名 SNI 的 IP HTTPS 下载、HEAD/GET/Range、错误 Host/token、方法和路径拒绝及撤销。内网测试使用 IP SAN 自签证书并显式信任；正式生产仍需公网 IP 可信证书和 Cloudwise 实测。日志见 `.runtime/public-media-ip-nginx-tests.log`。

本轮配置渲染及真实网络回归共 11 项通过；实际下载验证使用 IPv4 IP SAN 证书，IPv6 地址模式已做渲染测试，生产 IPv6 连通性仍需在实际网络验证。
