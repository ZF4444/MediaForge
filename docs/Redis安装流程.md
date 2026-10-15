# Redis 安装流程

> 日期：2026-07-21
> 适用范围：MediaForge 正式单机部署，首先用于认证会话缓存

## 一、部署口径

目录和职责先定成下面这样：

- 程序安装：使用 Redis 官方 APT 仓库
- 配置文件：`/etc/redis/redis.conf`
- ACL 文件：`/etc/redis/users.acl`
- 运行用户：`redis`
- 服务：`systemd`，服务名通常为 `redis-server`
- 日志：优先交给 `systemd/journald`
- 监听地址：仅本机 `127.0.0.1` 和 `::1`
- 默认端口：`6379`

当前 Redis 的职责是缓存认证会话，PostgreSQL 仍是会话的事实来源：

- Redis 命中时直接完成认证
- Redis 未命中时异步查询 PostgreSQL，并回填 Redis
- Redis 是应用强依赖：未配置或启动探测失败时，MediaForge 拒绝启动
- 运行期间 Redis 不可用时认证返回 503，readiness 同时变为失败
- 所有会话缓存键必须设置 TTL
- Redis 重启后允许缓存为空，由 PostgreSQL 自动重建

这份流程只安装一个会话缓存实例。以后用于后台任务队列的 Redis 应使用独立实例，不能只靠不同 database 编号隔离。

## 二、前置要求

开始前确认下面几件事：

1. 操作系统是 Ubuntu 或 Debian
2. 当前账号有 `sudo` 权限
3. MediaForge 和 Redis 部署在同一台机器
4. `6379` 端口没有被其他服务占用
5. PostgreSQL 已可用，Redis 缓存未命中时可以查询完整会话

检查端口：

```bash
ss -ltnp | grep -E ':(6379)\b'
```

如果没有输出，说明端口当前空闲。如果已有 Redis，先确认它的用途和配置，不要直接覆盖。

## 三、安装 Redis

先安装添加软件源所需的工具：

```bash
sudo apt-get update
sudo apt-get install -y lsb-release curl gpg
```

添加 Redis 官方 APT 签名和软件源：

```bash
curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
sudo chmod 644 /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/redis.list
```

安装 Redis：

```bash
sudo apt-get update
sudo apt-get install -y redis
```

确认版本：

```bash
redis-server --version
```

确认服务名和状态：

```bash
systemctl status redis-server
```

如果当前发行版的服务名不是 `redis-server`，使用下面的命令确认：

```bash
systemctl list-unit-files | grep -E '^redis'
```

后续命令默认服务名为 `redis-server`。

## 四、备份默认配置

修改前先备份配置：

```bash
sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.bak
```

确认备份存在：

```bash
sudo ls -l /etc/redis/redis.conf /etc/redis/redis.conf.bak
```

升级软件包前后都应保留一份当前生效配置，避免包管理器更新默认配置时丢失部署口径。

## 五、创建 Redis ACL 用户

不要让 MediaForge 使用 Redis 默认用户，也不要让应用账号拥有管理命令权限。

首次部署时创建 ACL 文件：

```bash
sudo install -o redis -g redis -m 640 /dev/null /etc/redis/users.acl
sudo nano /etc/redis/users.acl
```

写入以下内容，并分别替换两个密码：

```conf
user default off
user mediaforge on >replace-with-a-strong-app-password ~mediaforge:* &mediaforge:* +get +set +del +incr +expire +zadd +zrange +zrangebyscore +zrem +zremrangebyscore  +xadd +xack +xautoclaim +xgroup +xreadgroup +xrevrange +xdel +eval +scard +sadd +srem +multi +exec +publish +subscribe +unsubscribe +ping
user redisadmin on >replace-with-a-different-admin-password ~* &* +@all
```

Redis 7 的 ACL 输出可能会展示成 `+xgroup|help`、`+xinfo|help`、`+psubscribe` 这类形式；它表示允许对应命令及其帮助子命令。项目实际运行依赖这些能力，因此在安装流程中要把它们显式写进 ACL。密码建议使用只包含字母、数字、连字符和下划线的高强度随机字符串，避免放进连接 URL 时产生编码歧义。两个账号不能使用相同密码。

这里的应用账号只允许：

- 访问 `mediaforge:*` 键（会话缓存与画布任务队列）
- 读取、写入、删除会话缓存
- 设置和读取 TTL
- 维护待批量回写的 `last_seen` 与画布任务有序集合
- 使用 Redis Streams 消费组、消息确认、自动 claim、`XINFO`/`XGROUP` 诊断及 Lua 租约刷新
- 在多 API 副本之间发布和订阅用户范围的 WebSocket 事件，包含 `PUBLISH`、`SUBSCRIBE`、`PSUBSCRIBE` 和取消订阅
- 执行 AI Provider 的分布式限流和熔断计数
- 执行健康检查 `PING`
- 执行 `EVAL` 和 `EXISTS` 等会话缓存与限流脚本所需的原子读写命令

这几类权限不是“多余扩展”，而是当前 MediaForge 运行路径所必需的；如果缺少其中任何一项，Redis Pub/Sub、Stream 任务队列或限流脚本可能在正常运行时失败。

如果后续实现改用 Redis Hash 或其他命令，应按实际需要补最小权限，不要直接给应用账号 `+@all`。

如果 `/etc/redis/users.acl` 已存在，不要再次执行会清空文件的 `install ... /dev/null`，应先备份并在原文件上修改。

## 六、修改核心配置

编辑配置：

```bash
sudo nano /etc/redis/redis.conf
```

确认或修改以下配置。同一个配置项只保留一个生效值，避免文件前后出现相互覆盖的重复项。

### 6.1 监听和保护模式

```conf
bind 127.0.0.1 ::1
protected-mode yes
port 6379
supervised systemd
aclfile /etc/redis/users.acl
```

Redis 和 MediaForge 在同一台机器时，只监听回环地址。不要把 `bind` 改成 `0.0.0.0`，也不要把 `6379` 直接暴露到公网。

### 6.2 内存上限和淘汰策略

```conf
maxmemory 256mb
maxmemory-policy volatile-ttl
```

`256mb` 是正式单机部署的初始值，不是固定值。上线后应根据会话数量、单键大小、命中率和 `used_memory` 调整。

`volatile-ttl` 只会淘汰设置了过期时间的键。因此应用写入每个 `mediaforge:session:*` 键时都必须设置 TTL，不能产生永久会话缓存键。

### 6.3 会话缓存不启用持久化

```conf
save ""
appendonly no
```

当前实例只是 PostgreSQL 会话数据的缓存。关闭 RDB 和 AOF 后：

- Redis 重启会清空会话缓存
- 请求会异步回源 PostgreSQL
- 已注销会话不会因为恢复旧快照而重新出现在缓存中
- Redis 数据不需要单独备份

这一口径不适用于任务队列。任务队列实例需要 AOF、`noeviction` 和独立的恢复方案。

## 七、启动并验证 Redis

重启并设置开机启动：

```bash
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

查看服务状态：

```bash
systemctl is-active redis-server
sudo systemctl status redis-server
```

使用应用账号验证认证和连通性：

```bash
redis-cli --user mediaforge --askpass ping
```

输入应用账号密码后，应返回：

```text
PONG
```

使用管理账号检查配置：

```bash
redis-cli --user redisadmin --askpass CONFIG GET bind
redis-cli --user redisadmin --askpass CONFIG GET protected-mode
redis-cli --user redisadmin --askpass CONFIG GET maxmemory
redis-cli --user redisadmin --askpass CONFIG GET maxmemory-policy
redis-cli --user redisadmin --askpass CONFIG GET save
redis-cli --user redisadmin --askpass CONFIG GET appendonly
```

检查端口只监听本机：

```bash
ss -ltnp | grep -E ':(6379)\b'
```

预期只看到 `127.0.0.1:6379` 和可能存在的 `[::1]:6379`，不应看到 `0.0.0.0:6379` 或 `[::]:6379`。

如果启动失败，查看日志：

```bash
sudo journalctl -u redis-server -n 100 --no-pager
```

常见原因包括：

- ACL 文件格式错误
- ACL 文件权限不允许 `redis` 用户读取
- `redis.conf` 中有重复或无效配置
- `6379` 已被占用
- 系统内存不足

## 八、给 MediaForge 预留的环境变量

后续接入 Redis 时，在 `config/.env` 增加：

```env
REDIS_URL=redis://mediaforge:replace-with-a-strong-app-password@127.0.0.1:6379/0
REDIS_MAX_CONNECTIONS=20
REDIS_CONNECT_TIMEOUT_SECONDS=1
REDIS_SOCKET_TIMEOUT_SECONDS=1
REDIS_SESSION_PREFIX=mediaforge:session:
REDIS_LAST_SEEN_WRITE_INTERVAL_SECONDS=60
REDIS_LAST_SEEN_FLUSH_INTERVAL_SECONDS=300
```

其中：

- `REDIS_URL`：会话缓存连接地址
- `REDIS_MAX_CONNECTIONS`：应用级共享连接池上限
- `REDIS_CONNECT_TIMEOUT_SECONDS`：建立连接超时
- `REDIS_SOCKET_TIMEOUT_SECONDS`：单次 Redis 命令超时
- `REDIS_SESSION_PREFIX`：ACL 限制所对应的会话键前缀
- `REDIS_LAST_SEEN_WRITE_INTERVAL_SECONDS`：同一会话写入 Redis 活跃时间的最小间隔
- `REDIS_LAST_SEEN_FLUSH_INTERVAL_SECONDS`：批量回写 PostgreSQL 的间隔

如果密码包含 `@`、`:`、`/`、`#`、`%` 等字符，必须先进行 URL 编码。不要把真实密码提交到 Git。

这些配置项已经由 MediaForge 认证缓存使用。`REDIS_URL` 缺失或连接探测失败时，应用启动会直接抛出异常。

## 九、安装 Python 异步客户端

进入 MediaForge 项目目录：

```bash
cd /path/to/MediaForge
```

项目已经声明支持 asyncio 的官方 Python 客户端，部署时同步依赖：

```bash
uv sync
```

实现时使用：

```python
from redis.asyncio import Redis
```

应用应在 FastAPI lifespan 启动阶段创建一个共享客户端，所有请求复用它内部的连接池；应用关闭时调用 `await client.aclose()`。不要为每个请求创建新的 Redis 客户端。

## 十、应用侧连通性验证

完成 Python 依赖和环境变量配置后，先把 `config/.env` 中的 `REDIS_URL` 导出到当前 shell，或由应用现有的环境加载流程读取。然后执行异步读写验证：

```bash
uv run python - <<'PY'
import asyncio
import os

from redis.asyncio import Redis


async def main():
    redis_url = os.environ["REDIS_URL"]
    client = Redis.from_url(redis_url, decode_responses=True)
    key = "mediaforge:session:install-probe"
    try:
        await client.set(key, "ok", ex=30)
        print("value:", await client.get(key))
        print("ttl:", await client.ttl(key))
        await client.delete(key)
    finally:
        await client.aclose()


asyncio.run(main())
PY
```

预期结果：

- `value` 为 `ok`
- `ttl` 为 `1` 到 `30` 之间的正整数
- 测试键最后被删除
- Redis 日志没有认证或权限错误

## 十一、认证缓存验收

代码接入完成后，不能只验证 `PING`。至少覆盖以下场景：

1. Redis 命中时不查询 PostgreSQL
2. Redis 未命中时异步查询 PostgreSQL，并回填带 TTL 的缓存
3. Redis 未配置或启动前不可达时，MediaForge 启动失败
4. Redis 运行期停止后，认证返回 503 且 readiness 返回 503
5. 注销时同时删除 Redis 和 PostgreSQL 会话
6. 已注销 token 不能因为 Redis 重启而恢复有效
7. Redis 恢复后，缓存未命中能够从 PostgreSQL 自动回填
8. 所有 `mediaforge:session:*` 键都有正数 TTL
9. `last_seen` 不再随每个请求同步写入 PostgreSQL
10. 应用关闭时 Redis 连接池被正常关闭

检查是否存在没有 TTL 的会话键时，不要在生产环境直接执行阻塞式 `KEYS`。应使用 `SCAN` 分批检查，并通过监控或维护脚本持续约束。

## 十二、常用运维命令

启动：

```bash
sudo systemctl start redis-server
```

停止：

```bash
sudo systemctl stop redis-server
```

重启：

```bash
sudo systemctl restart redis-server
```

查看状态：

```bash
sudo systemctl status redis-server
```

查看实时日志：

```bash
sudo journalctl -u redis-server -f
```

查看 Redis 基本信息：

```bash
redis-cli --user redisadmin --askpass INFO server
redis-cli --user redisadmin --askpass INFO memory
redis-cli --user redisadmin --askpass INFO stats
redis-cli --user redisadmin --askpass INFO clients
```

查看慢命令：

```bash
redis-cli --user redisadmin --askpass SLOWLOG LEN
redis-cli --user redisadmin --askpass SLOWLOG GET 20
```

## 十三、监控建议

正式环境至少监控：

- Redis 进程是否存活
- `PING` 延迟
- `used_memory` 和 `maxmemory`
- `evicted_keys`
- `keyspace_hits`、`keyspace_misses` 和命中率
- `connected_clients`、`blocked_clients`
- `rejected_connections`
- `instantaneous_ops_per_sec`
- 慢日志数量
- 应用侧 Redis 超时、认证 503 的次数和持续时间

Redis 探测失败或认证出现 `redis_unavailable` 时必须报警。Redis 是启动和认证强依赖，不能把这类故障当作普通缓存未命中。

## 十四、任务队列必须使用独立实例

会话缓存和任务队列的资源策略不同：

| 用途 | 数据能否丢失 | 持久化 | 淘汰策略 |
| --- | --- | --- | --- |
| 会话缓存 | 可以，由 PostgreSQL 重建 | 关闭 | `volatile-ttl` |
| 任务队列 | 不可以随意丢失 | AOF，至少 `appendfsync everysec` | `noeviction` |

因此，后台任务落地时应另建 Redis 实例，使用独立端口、配置文件、数据目录、systemd 服务和内存上限。不同 Redis database 编号共享同一进程的内存、淘汰策略和故障域，不构成有效隔离。

## 十五、升级和备份口径

会话缓存实例不保存事实数据，所以不做数据备份。需要备份的是：

- `/etc/redis/redis.conf`
- `/etc/redis/users.acl`
- 部署系统中的 Redis 密钥
- 监控和告警配置

升级原则：

1. 升级前记录 `redis-server --version`
2. 备份配置和 ACL 文件
3. 确认 Redis 缓存未命中时 PostgreSQL 查询路径正常
4. 先在测试环境验证客户端兼容性
5. 升级后检查 ACL、内存策略、持久化开关和端口监听
6. 执行认证缓存验收，不只检查服务状态

会话缓存实例可以通过重启完成升级，因为缓存能够重建。任务队列实例不能沿用这个口径。

## 十六、注意点

### 16.1 不要把 Redis 暴露到公网

正式单机部署只监听回环地址。跨机器部署时使用私网、TLS、ACL 和防火墙白名单，不要仅靠密码保护公网端口。

### 16.2 不要把 Redis 当作唯一会话存储

当前方案要求 PostgreSQL 保存完整会话。否则 Redis 清空或淘汰键时，用户会被集体登出，也无法完成可靠的会话审计和撤销。

### 16.3 不要每个请求创建客户端

应用生命周期内共享一个异步 Redis 客户端及其连接池。逐请求创建客户端会反复建立连接，抵消缓存带来的收益。

### 16.4 不要使用同步 Redis 客户端

认证中间件运行在 FastAPI 事件循环中，应使用 `redis.asyncio` 并设置连接与命令超时。

### 16.5 不要让会话键没有 TTL

`volatile-ttl` 不会淘汰永久键。没有 TTL 的缓存键会持续占用内存，最终导致写入失败。

### 16.6 区分缓存未命中和 Redis 故障

只有 Redis 正常返回“键不存在”时才查询 PostgreSQL。连接失败、超时和认证错误必须抛出 `redis_unavailable`，不能伪装成缓存未命中。

## 十七、下一步

Redis 服务安装完成后，按下面的顺序上线 MediaForge：

1. 执行 `uv sync` 安装锁定依赖
2. 在 `config/.env` 配置 Redis 连接和超时参数
3. 启动前用应用 ACL 账号执行 `PING`
4. 启动 MediaForge，确认 startup 日志包含 Redis 连接成功事件
5. 检查 `/health/ready` 中 PostgreSQL、MinIO、Redis 均为 `ok`
6. 执行登录、缓存命中、缓存未命中、注销和 Redis 中断测试
7. 检查连接数、命中率、超时、认证 503 和 `last_seen` 回写指标

认证缓存接入后，每个请求只读取 Redis，不再同步执行 PostgreSQL `UPDATE`。
