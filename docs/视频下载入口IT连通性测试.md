# 视频下载入口：IT 连通性测试

在生产虚机临时启动独立 Nginx，供 IT 测试内网访问及端口映射。不依赖 MediaForge、数据库或 MinIO，不提供真实视频，也不需要域名或证书。

示例地址：`http://10.7.89.41:18443/`。请确认 `10.7.89.41` 是虚机实际内网 IP。

## 1. 检查端口

在生产虚机使用 root 执行，确认 Docker 已安装：

```bash
docker version
ss -lntp 'sport = :18443'
docker ps -a --filter name=mediaforge-it-test
```

如果端口已有监听，或同名容器已存在，先核对用途，不覆盖现有服务。

## 2. 创建并启动独立测试服务

以下命令中的 IP 应与虚机实际内网 IP 一致。首次运行需要能拉取 Docker 镜像；无法访问镜像仓库时，由 IT 提供镜像或协助导入。

```bash
install -d -m 0755 /data/mediaforge-it-test

cat > /data/mediaforge-it-test/default.conf <<'NGINX'
server {
    listen 8080;
    server_name _;
    server_tokens off;
    access_log off;
    error_log /dev/stderr warn;
    location = / {
        default_type text/plain;
        return 200 "MediaForge connectivity test OK\n";
    }
    location = /test.txt {
        default_type text/plain;
        return 200 "Public test content only. No business data.\n";
    }
    location / { return 404; }
}
NGINX

chmod 0644 /data/mediaforge-it-test/default.conf

docker run -d \
  --name mediaforge-it-test \
  --restart=no \
  --user 101:101 \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges:true \
  --pids-limit=32 \
  --memory=64m \
  --cpus=0.25 \
  --tmpfs /var/cache/nginx:uid=101,gid=101,mode=0700 \
  --tmpfs /var/run:uid=101,gid=101,mode=0700 \
  --log-opt max-size=5m \
  --log-opt max-file=2 \
  -p 10.7.89.41:18443:8080 \
  -v /data/mediaforge-it-test/default.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:stable-alpine
```

这是临时测试服务，镜像使用 stable 标签便于拉取；不作为正式生产服务部署模板。容器仅挂载上面的测试配置，不挂载生产数据、密钥或 Docker socket。

## 3. 本机验证并交给 IT

```bash
docker ps --filter name=mediaforge-it-test
curl --max-time 10 -fsS http://10.7.89.41:18443/
curl --max-time 10 -fsS http://10.7.89.41:18443/test.txt
```

根路径预期返回：

```text
MediaForge connectivity test OK
```

如果失败，先查看容器日志：

```bash
docker logs --tail 50 mediaforge-it-test
```

本机成功后，将以下内容发给 IT：

> 内网独立测试服务已启动：`http://10.7.89.41:18443/`。协议是 HTTP，返回 `MediaForge connectivity test OK` 即表示可达。也可以访问 `/test.txt`。请先从其他内网机器测试，再按需测试公网映射。当前不是正式 HTTPS 下载服务。

从其他机器不能连接时，请 IT 核对虚机网络、防火墙和 Docker 端口转发规则；不要为了排查直接关闭整机防火墙。若临时开放公网，仅保留上述无敏感测试内容，完成后及时撤除映射或关闭入口。

## 4. 测试结束后清理

```bash
docker rm -f mediaforge-it-test
rm /data/mediaforge-it-test/default.conf
rmdir /data/mediaforge-it-test
ss -lntp 'sport = :18443'
```

清理释放端口后，才能让宿主机正式 Nginx 使用 `18443`。通知 IT 测试入口已撤除。

本次只验证网络和端口，不验证 HTTPS、证书、链接鉴权、MinIO 或视频生成。正式上线仍按[生产部署与上线流程](视频公网URL生产部署与上线流程.md)配置；HTTP 测试通过不代表供应商已能使用正式视频下载功能。
