# PostgreSQL 安装流程

> 日期：2026-07-08
> 适用范围：MediaForge 正式单机部署

## 一、部署口径

目录和职责先定成下面这样：

- 程序安装：使用系统包管理器
- 配置目录：`/etc/postgresql/<version>/main/`
- 数据目录：`/data/mediaforge/postgres`
- 服务：`systemd`
- 日志：优先交给 `systemd/journald`

部署原则：

- 程序走系统安装
- 配置放系统目录
- 数据和代码分离
- 服务通过 `systemd` 托管

如果机器上还没有独立数据盘，这份流程也能先跑，但正式环境最好让 `/data` 落到单独的数据盘或挂载点。

## 二、前置要求

开始前先确认下面几件事：

1. 操作系统是 Linux
2. 当前账号有 `sudo` 权限
3. 已规划好 PostgreSQL 数据目录
4. `5432` 端口没有被别的数据库占用

先检查端口：

```bash
ss -ltnp | grep -E ':(5432)\b'
```

如果没有输出，说明端口当前空闲。

## 三、安装 PostgreSQL

这里按 Ubuntu / Debian 系来写，直接用系统包安装。

先更新索引：

```bash
sudo apt update
```

安装 PostgreSQL：

```bash
sudo apt install -y postgresql postgresql-contrib
```

安装完成后，先确认版本：

```bash
psql --version
```

再看一下集群状态：

```bash
pg_lsclusters
```

默认情况下，系统会先创建一个使用系统默认数据目录的集群。正式部署里不建议直接用默认数据目录，后面会把它迁到 `/data/mediaforge/postgres`。

## 四、准备正式数据目录

创建数据目录：

```bash
sudo mkdir -p /data/mediaforge/postgres
```

设置属主：

```bash
sudo chown -R postgres:postgres /data/mediaforge/postgres
sudo chmod 700 /data/mediaforge/postgres
```

这里的数据目录是正式目录，不要放到代码仓库、用户主目录或下载目录下。

## 五、确认 PostgreSQL 主版本

后续配置路径会带版本号，先查清当前安装的是哪个主版本。

```bash
psql --version
```

或者：

```bash
pg_lsclusters
```

下面的流程里我用 `<version>` 代指主版本号，例如 `16`、`17`。

## 六、迁移或重建数据库集群到正式目录

这里有两种做法：

- 新机器、没有数据：直接重建集群
- 已有测试数据：先导出，再重建

正式部署最干净的做法是直接重建到正式目录。

先停止默认集群：

```bash
sudo systemctl stop postgresql
```

删除默认集群：

```bash
sudo pg_dropcluster --stop <version> main
```

在正式目录重建集群：

```bash
sudo pg_createcluster <version> main --datadir=/data/mediaforge/postgres
```

启动 PostgreSQL：

```bash
sudo systemctl start postgresql
```

检查状态：

```bash
pg_lsclusters
sudo systemctl status postgresql
```

如果集群已经在 `/data/mediaforge/postgres` 下创建成功，这一步就算完成。

## 七、修改核心配置

配置文件通常在：

```text
/etc/postgresql/<version>/main/postgresql.conf
/etc/postgresql/<version>/main/pg_hba.conf
```

### 7.1 监听地址

如果 PostgreSQL 只给本机上的 MediaForge 使用，建议先只监听本地回环：

编辑：

```bash
sudo nano /etc/postgresql/<version>/main/postgresql.conf
```

确认或修改：

```conf
listen_addresses = '127.0.0.1'
port = 5432
```

如果后面数据库要让其他机器访问，再改成内网 IP 或 `'*'`，但那时要同时收紧防火墙和 `pg_hba.conf`。

### 7.2 认证方式

编辑：

```bash
sudo nano /etc/postgresql/<version>/main/pg_hba.conf
```

至少保留本机访问规则，例如：

```conf
local   all             postgres                                peer
local   all             all                                     scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
```

这里不建议继续用 `trust`。

### 7.3 重启服务

配置改完后重启：

```bash
sudo systemctl restart postgresql
```

看状态：

```bash
sudo systemctl status postgresql
```

## 八、创建 MediaForge 专用数据库和账号

不要让应用直接用 `postgres` 超级用户连接。

先切到 postgres 用户：

```bash
sudo -u postgres psql
```

在 `psql` 里执行：

```sql
CREATE ROLE mediaforge WITH LOGIN PASSWORD 'replace-with-a-strong-password';
CREATE DATABASE mediaforge OWNER mediaforge;
\q
```

如果后面要更细一点的权限控制，也可以改成：

- 单独建业务库
- 单独建应用账号
- 再按 schema 和权限做收口

但对当前项目，先做到“应用不用超级用户”就够了。

## 九、验证连接

先验证本机连接：

```bash
psql -h 127.0.0.1 -U mediaforge -d mediaforge
```

如果能连上，说明：

- 服务正常
- 端口正常
- 用户和数据库创建正常
- `pg_hba.conf` 规则生效

还可以看端口监听：

```bash
ss -ltnp | grep -E ':(5432)\b'
```

## 十、给 MediaForge 预留的环境变量

后面 MediaForge 接 PostgreSQL 时，环境变量可以先按这组：

```env
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=mediaforge
POSTGRES_USER=mediaforge
POSTGRES_PASSWORD=replace-with-a-strong-password
```

如果项目后面用统一数据库 URL，也可以收口成：

```env
DATABASE_URL=postgresql://mediaforge:replace-with-a-strong-password@127.0.0.1:5432/mediaforge
```

### 10.1 当前 MediaForge 建议的应用侧环境变量

如果这台 PostgreSQL 就是给当前 MediaForge 用，建议把数据库连接和存储治理参数一起放进应用环境变量里：

```env
DATABASE_URL=postgresql://mediaforge:replace-with-a-strong-password@127.0.0.1:5432/mediaforge
STORAGE_QUOTA_ENABLED=true
STORAGE_USER_QUOTA_BYTES=21474836480
STORAGE_CLEANUP_ENABLED=true
STORAGE_CLEANUP_INTERVAL_SECONDS=1800
STORAGE_CLEANUP_BATCH_SIZE=1000
STORAGE_INPUT_RETENTION_DAYS=30
STORAGE_UPLOAD_RETENTION_DAYS=30
STORAGE_OUTPUT_RETENTION_DAYS=60
STORAGE_TEMP_RETENTION_DAYS=3
```

其中：

- `DATABASE_URL`：启用 PostgreSQL 元数据表和 `files` 表
- `STORAGE_USER_QUOTA_BYTES`：单用户总配额，建议先按 `20GB`
- `STORAGE_CLEANUP_INTERVAL_SECONDS`：后台清理执行间隔，建议 `30` 分钟
- `STORAGE_OUTPUT_RETENTION_DAYS`：输出保留时间建议略长于输入

### 10.2 生产环境推荐值

正式环境建议从下面这组起步：

```env
DATABASE_URL=postgresql://mediaforge:replace-with-a-strong-password@127.0.0.1:5432/mediaforge
STORAGE_QUOTA_ENABLED=true
STORAGE_USER_QUOTA_BYTES=21474836480
STORAGE_CLEANUP_ENABLED=true
STORAGE_CLEANUP_INTERVAL_SECONDS=1800
STORAGE_CLEANUP_BATCH_SIZE=1000
STORAGE_INPUT_RETENTION_DAYS=30
STORAGE_UPLOAD_RETENTION_DAYS=30
STORAGE_OUTPUT_RETENTION_DAYS=60
STORAGE_TEMP_RETENTION_DAYS=3
```

如果还只是测试环境，建议先用默认值：

```env
DATABASE_URL=postgresql://mediaforge:replace-with-a-strong-password@127.0.0.1:5432/mediaforge
STORAGE_QUOTA_ENABLED=true
STORAGE_USER_QUOTA_BYTES=10737418240
STORAGE_CLEANUP_ENABLED=true
STORAGE_CLEANUP_INTERVAL_SECONDS=3600
STORAGE_CLEANUP_BATCH_SIZE=500
STORAGE_INPUT_RETENTION_DAYS=30
STORAGE_UPLOAD_RETENTION_DAYS=30
STORAGE_OUTPUT_RETENTION_DAYS=30
STORAGE_TEMP_RETENTION_DAYS=3
```

当前实现口径也要明确：

- 配额统计来自 `files` 表中未删除对象的 `size_bytes`
- 自动清理只覆盖 `input / uploads / output / temp`
- `library` 不参与自动过期
- 清理依据优先是 `expires_at`，其次是 `last_accessed_at / created_at`

## 十一、常用运维命令

启动：

```bash
sudo systemctl start postgresql
```

停止：

```bash
sudo systemctl stop postgresql
```

重启：

```bash
sudo systemctl restart postgresql
```

查看状态：

```bash
sudo systemctl status postgresql
```

查看日志：

```bash
journalctl -u postgresql -f
```

看集群状态：

```bash
pg_lsclusters
```

## 十二、备份建议

正式环境里，数据库备份要单独考虑，不能只依赖磁盘快照。

最基础的一层是逻辑备份：

```bash
pg_dump -h 127.0.0.1 -U mediaforge -d mediaforge -Fc -f /data/mediaforge/backups/mediaforge.dump
```

建议至少准备一个备份目录：

```bash
sudo mkdir -p /data/mediaforge/backups
sudo chown postgres:postgres /data/mediaforge/backups
```

后面再补：

- 定时备份
- 保留周期
- 恢复演练

## 十三、升级口径

PostgreSQL 升级和 MinIO 不一样，不是替换一个二进制就结束。正式升级时要明确版本迁移策略。

这里先定原则：

1. 升级前先做备份
2. 记录当前版本和集群状态
3. 小版本升级走系统包更新
4. 大版本升级走标准 PostgreSQL 集群迁移流程

不要在没有备份的情况下直接动正式库。

## 十四、注意点

### 14.1 不要把数据目录放在代码目录里

正式环境里，数据库数据目录和项目代码目录一定要分开。

### 14.2 不要让应用使用 `postgres` 超级用户

应用应该使用自己的业务账号连接，避免后面权限边界全丢。

### 14.3 默认只监听本机

如果数据库和 MediaForge 在同一台机器上，先只监听 `127.0.0.1` 就够了。没必要一开始就对全网开放。

### 14.4 不要使用 `trust`

认证方式至少用 `scram-sha-256`，不要为了图省事把本机连接改成 `trust`。

### 14.5 数据库和对象存储最好分开考虑 IO

后面如果 MinIO 和 PostgreSQL 都在同一台机器上，正式环境最好至少做到：

- MinIO 数据目录独立
- PostgreSQL 数据目录独立

不要让数据库和大文件对象长期共用同一块高压力目录。

## 十五、下一步

这份安装流程做完以后，后面就可以进入 MediaForge 的数据库接入阶段：

1. 在项目里补 PostgreSQL 配置项
2. 引入数据库访问层
3. 先把文件元数据表建起来
4. 再逐步迁移历史记录、资产库、共享目录等 JSON 元数据

如果后面还要补正式部署文档，下一步最值得补的是：

- PostgreSQL 备份与恢复流程
- PostgreSQL 初始化建表流程
- MediaForge 元数据迁移方案
