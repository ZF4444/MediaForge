# MinIO 安装流程

> 日期：2026-07-08
> 适用范围：MediaForge 正式单机部署

## 一、部署口径

这份流程按正式部署来写，不再按本机联调目录布局处理。

目录和职责直接定成下面这样：

- 二进制：`/usr/local/bin/minio`
- 配置：`/etc/minio/minio.env`
- 数据目录：`/data/mediaforge/minio`
- 服务：`/etc/systemd/system/minio.service`
- 日志：优先交给 `systemd/journald`

这里的原则很简单：

- 二进制放系统可执行目录
- 配置放 `/etc`
- 数据和代码分离
- 服务通过 `systemd` 托管

如果机器上还没有独立数据盘，这份流程也可以先跑，但正式环境最好还是让 `/data` 指到单独的数据盘或挂载点。

## 二、前置要求

开始前先确认下面几件事：

1. 操作系统是 Linux
2. 当前账号有 `sudo` 权限
3. 机器上 `9000` 和 `9001` 端口未被占用
4. 已规划好 MinIO 数据目录

可以先检查端口：

```bash
ss -ltnp | grep -E ':(9000|9001)\b'
```

如果没有输出，说明端口当前空闲。

## 三、下载并安装二进制

先下载官方二进制到临时目录：

```bash
curl -L https://dl.min.io/server/minio/release/linux-amd64/minio -o /tmp/minio
```

增加执行权限：

```bash
chmod +x /tmp/minio
```

移动到正式位置：

```bash
sudo mv /tmp/minio /usr/local/bin/minio
```

检查版本：

```bash
/usr/local/bin/minio --version
```

如果版本信息能正常输出，说明二进制安装没有问题。

## 四、创建专用运行用户

正式环境不建议直接用普通登录用户或 root 长期跑 MinIO。

创建系统用户：

```bash
sudo useradd --system --home /var/lib/minio --shell /usr/sbin/nologin minio
```

如果系统里已经有这个用户，这一步会提示已存在，可以跳过。

## 五、准备数据目录

创建数据目录：

```bash
sudo mkdir -p /data/mediaforge/minio
```

设置属主：

```bash
sudo chown -R minio:minio /data/mediaforge/minio
```

这里的数据目录是正式目录，不要放到代码仓库或用户下载目录里。

## 六、准备配置目录

创建配置目录：

```bash
sudo mkdir -p /etc/minio
```

写配置文件：

```bash
sudo tee /etc/minio/minio.env > /dev/null <<'EOF'
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=replace-with-a-strong-password
MINIO_VOLUMES=/data/mediaforge/minio
MINIO_OPTS=--console-address :9001
EOF
```

说明：

- `MINIO_ROOT_USER` 和 `MINIO_ROOT_PASSWORD` 是初始管理员账号
- `MINIO_VOLUMES` 指向数据目录
- `MINIO_OPTS` 这里指定控制台端口

正式环境必须把密码改成强密码，不要保留示例值。

配置文件权限收紧一点：

```bash
sudo chown root:minio /etc/minio/minio.env
sudo chmod 640 /etc/minio/minio.env
```

## 七、创建 systemd 服务

写服务文件：

```bash
sudo tee /etc/systemd/system/minio.service > /dev/null <<'EOF'
[Unit]
Description=MinIO Object Storage
Documentation=https://docs.min.io
Wants=network-online.target
After=network-online.target

[Service]
User=minio
Group=minio
EnvironmentFile=/etc/minio/minio.env
ExecStart=/usr/local/bin/minio server $MINIO_VOLUMES $MINIO_OPTS
WorkingDirectory=/data/mediaforge/minio
Restart=always
RestartSec=5
LimitNOFILE=65536
TasksMax=infinity
TimeoutStopSec=infinity
SendSIGKILL=no

[Install]
WantedBy=multi-user.target
EOF
```

重新加载 `systemd`：

```bash
sudo systemctl daemon-reload
```

设置开机自启：

```bash
sudo systemctl enable minio
```

启动服务：

```bash
sudo systemctl start minio
```

## 八、检查服务状态

先看服务状态：

```bash
sudo systemctl status minio
```

再看端口：

```bash
ss -ltnp | grep -E ':(9000|9001)\b'
```

正常情况下会看到：

- API：`9000`
- Console：`9001`

还可以直接看日志：

```bash
journalctl -u minio -n 100 --no-pager
```

如果启动正常，日志里会打印类似：

- `API: http://127.0.0.1:9000`
- `WebUI: http://127.0.0.1:9001`

## 九、访问控制台

浏览器打开：

```text
http://127.0.0.1:9001
```

登录账号使用 `/etc/minio/minio.env` 里配置的：

- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`

如果这台机器不是本机访问，而是内网服务器访问，就把 `127.0.0.1` 换成对应内网 IP 或域名。

## 十、创建 Bucket

服务起来后，先创建下面几个 bucket：

- `mediaforge-private`
- `mediaforge-public`
- `mediaforge-temp`

## 十一、给 MediaForge 预留的环境变量

后续 MediaForge 接对象存储时，环境变量可以按下面这组：

```env
MINIO_ENDPOINT=127.0.0.1:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=replace-with-a-strong-password
MINIO_SECURE=false
MINIO_BUCKET_PRIVATE=mediaforge-private
MINIO_BUCKET_PUBLIC=mediaforge-public
MINIO_BUCKET_TEMP=mediaforge-temp
```

说明：

- `MINIO_ENDPOINT` 不带 `http://`
- 如果后面通过域名和 HTTPS 暴露，再把 `MINIO_SECURE` 改成 `true`
- 如果 MediaForge 和 MinIO 不在同一台机器上，`MINIO_ENDPOINT` 改成 MinIO 的内网地址或域名

### 11.1 配额和清理参数

当前 MediaForge 已经支持基于 `files` 表的配额检查和后台定时清理，建议和 MinIO 一起配置：

```env
STORAGE_QUOTA_ENABLED=true
STORAGE_USER_QUOTA_BYTES=21474836480
STORAGE_CLEANUP_ENABLED=true
STORAGE_CLEANUP_INTERVAL_SECONDS=1800
STORAGE_CLEANUP_BATCH_SIZE=1000
STORAGE_INPUT_RETENTION_DAYS=30
STORAGE_UPLOAD_RETENTION_DAYS=30
STORAGE_OUTPUT_RETENTION_DAYS=60
STORAGE_TEMP_RETENTION_DAYS=3
STORAGE_CACHE_DIR=/var/cache/mediaforge/storage
STORAGE_CACHE_CLEANUP_ENABLED=true
STORAGE_CACHE_MAX_BYTES=10737418240
STORAGE_CACHE_TARGET_BYTES=8589934592
STORAGE_CACHE_IDLE_TTL_SECONDS=604800
STORAGE_CACHE_CLEANUP_INTERVAL_SECONDS=600
STORAGE_CACHE_TMP_TTL_SECONDS=3600
STORAGE_CACHE_ACCESS_GRACE_SECONDS=900
STORAGE_CACHE_MIN_FREE_BYTES=10737418240
STORAGE_CACHE_ACCESS_TOUCH_INTERVAL_SECONDS=300
STORAGE_CACHE_ORPHAN_SCAN_ENABLED=true
STORAGE_CACHE_ORPHAN_SCAN_INTERVAL_SECONDS=86400
STORAGE_CACHE_CLEANUP_BATCH_SIZE=1000
STORAGE_CACHE_DRY_RUN=false
```

如果使用 `/var/cache/mediaforge/storage`，部署时需要提前创建目录，并将属主设置为运行 MediaForge 的系统用户：

```bash
sudo mkdir -p /var/cache/mediaforge/storage
sudo chown -R <mediaforge-user>:<mediaforge-group> /var/cache/mediaforge
sudo chmod 750 /var/cache/mediaforge /var/cache/mediaforge/storage
```

如果没有显式设置 `STORAGE_CACHE_DIR`，系统继续使用 `/tmp/mediaforge-storage-cache`。

建议按下面的口径理解：

- `STORAGE_USER_QUOTA_BYTES`：单用户总存储配额，示例值是 `20GB`
- `STORAGE_CLEANUP_INTERVAL_SECONDS`：后台清理间隔，示例值是 `30` 分钟
- `STORAGE_CLEANUP_BATCH_SIZE`：单次清理处理上限，示例值是 `1000`
- `STORAGE_INPUT_RETENTION_DAYS`：输入参考文件保留 `30` 天
- `STORAGE_UPLOAD_RETENTION_DAYS`：本地素材上传保留 `30` 天
- `STORAGE_OUTPUT_RETENTION_DAYS`：普通输出建议保留 `60` 天
- `STORAGE_TEMP_RETENTION_DAYS`：临时对象建议保留 `3` 天
- `STORAGE_CACHE_MAX_BYTES / STORAGE_CACHE_TARGET_BYTES`：缓存容量高、低水位
- `STORAGE_CACHE_IDLE_TTL_SECONDS`：本地缓存连续未访问多久后允许回收，不会删除 MinIO 正式对象
- `STORAGE_CACHE_MIN_FREE_BYTES`：缓存所在分区必须保留的最小空闲空间

当前实现里：

- `input / uploads / output / temp` 会参与自动清理
- `library` 不参与自动过期
- `mediaforge-temp` 仍然建议在 MinIO 侧再配生命周期规则，不要只依赖应用层清理

### 11.2 生产环境推荐值

如果是正式环境，我建议直接从下面这组起步：

```env
MINIO_ENDPOINT=minio.internal.example.com:9000
MINIO_ACCESS_KEY=mediaforge-app
MINIO_SECRET_KEY=replace-with-a-strong-password
MINIO_SECURE=true
MINIO_BUCKET_PRIVATE=mediaforge-private
MINIO_BUCKET_PUBLIC=mediaforge-public
MINIO_BUCKET_TEMP=mediaforge-temp
STORAGE_QUOTA_ENABLED=true
STORAGE_USER_QUOTA_BYTES=21474836480
STORAGE_CLEANUP_ENABLED=true
STORAGE_CLEANUP_INTERVAL_SECONDS=1800
STORAGE_CLEANUP_BATCH_SIZE=1000
STORAGE_INPUT_RETENTION_DAYS=30
STORAGE_UPLOAD_RETENTION_DAYS=30
STORAGE_OUTPUT_RETENTION_DAYS=60
STORAGE_TEMP_RETENTION_DAYS=3
STORAGE_CACHE_DIR=/var/cache/mediaforge/storage
STORAGE_CACHE_CLEANUP_ENABLED=true
STORAGE_CACHE_MAX_BYTES=10737418240
STORAGE_CACHE_TARGET_BYTES=8589934592
STORAGE_CACHE_IDLE_TTL_SECONDS=604800
STORAGE_CACHE_CLEANUP_INTERVAL_SECONDS=600
STORAGE_CACHE_TMP_TTL_SECONDS=3600
STORAGE_CACHE_ACCESS_GRACE_SECONDS=900
STORAGE_CACHE_MIN_FREE_BYTES=10737418240
STORAGE_CACHE_ACCESS_TOUCH_INTERVAL_SECONDS=300
STORAGE_CACHE_ORPHAN_SCAN_ENABLED=true
STORAGE_CACHE_ORPHAN_SCAN_INTERVAL_SECONDS=86400
STORAGE_CACHE_CLEANUP_BATCH_SIZE=1000
STORAGE_CACHE_DRY_RUN=false
```

如果当前还是单机内网部署，也可以先保留：

- `MINIO_ENDPOINT=127.0.0.1:9000`
- `MINIO_SECURE=false`

但只要开始走正式域名或反向代理 HTTPS，就应该切到：

- `MINIO_ENDPOINT=<内网域名或服务域名>:9000`
- `MINIO_SECURE=true`

## 十二、常用运维命令

启动：

```bash
sudo systemctl start minio
```

停止：

```bash
sudo systemctl stop minio
```

重启：

```bash
sudo systemctl restart minio
```

查看状态：

```bash
sudo systemctl status minio
```

查看日志：

```bash
journalctl -u minio -f
```

## 十三、升级流程

正式环境升级不要直接覆盖运行中的二进制，按下面顺序走：

1. 下载新版本到临时目录
2. 校验二进制可执行
3. 停服务
4. 替换 `/usr/local/bin/minio`
5. 启服务
6. 检查状态和日志

示例：

```bash
curl -L https://dl.min.io/server/minio/release/linux-amd64/minio -o /tmp/minio
chmod +x /tmp/minio
/tmp/minio --version
sudo systemctl stop minio
sudo mv /tmp/minio /usr/local/bin/minio
sudo systemctl start minio
sudo systemctl status minio
```

## 十四、注意点

### 14.1 不要把数据目录放在代码目录里

正式环境里，代码目录和数据目录一定要分开。MinIO 数据应放到单独的数据目录或数据盘。

### 14.2 不要长期使用默认管理员密码

`replace-with-a-strong-password` 只是示例值，部署时必须改掉。

### 14.3 不要让 MinIO 直接承担业务权限控制

MinIO 负责对象存储，不负责 MediaForge 的用户权限判断。后面业务仍然要围绕：

- `file_id`
- `bucket`
- `object_key`

来做权限控制和引用管理。

### 14.4 日志优先交给 systemd

单机正式部署下，MinIO 本身不需要额外再手工重定向一份日志文件，先用 `journald` 托管就够了。后面如果有日志平台，再从系统日志侧接。

### 14.5 正式环境尽量配独立数据盘

对象存储的数据增长速度通常会快于应用日志和代码目录。把 MinIO 数据单独放，可以避免和数据库、应用日志抢 IO。

## 十五、下一步

这份安装流程做完以后，后面就可以进入 MediaForge 接入阶段：

1. 在项目里补 MinIO 配置项
2. 增加统一存储服务层
3. 让新上传文件先写 MinIO
4. 再推进历史文件和元数据迁移

如果后面还要补正式部署文档，下一步最值得补的是：

- MinIO 备份与恢复流程
- MinIO + Nginx/HTTPS 反代流程
- MediaForge 对象存储接入改造方案
