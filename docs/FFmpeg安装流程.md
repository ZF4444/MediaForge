# FFmpeg 安装流程

> 日期：2026-07-09
> 适用范围：MediaForge 正式单机部署

## 一、用途说明

当前 MediaForge 里，`ffmpeg` 主要用于下面这类场景：

- 智能画布视频生成默认封面图
- 视频素材派生 poster 缩略图
- 未来可能扩展到视频转码、抽帧、音视频处理

如果机器上没有 `ffmpeg`，视频上传后很可能只会显示播放图标，而没有模糊封面图。

这不是前端问题，而是后端没有成功生成视频 poster。

## 二、部署口径

这里按正式部署来写：

- 安装方式：系统包管理器安装
- 可执行文件：系统默认路径，例如 `/usr/bin/ffmpeg`
- 服务方式：不单独常驻运行，由 MediaForge 后端在需要时调用
- 日志：由调用方进程负责记录

这里的原则很简单：

- 不自己编译
- 不把二进制塞进代码仓库
- 优先走系统稳定包

## 三、前置要求

开始前先确认：

1. 操作系统是 Ubuntu / Debian 或兼容环境
2. 当前账号有 `sudo` 权限
3. 机器可以访问系统软件源

先确认机器上是否已经安装：

```bash
which ffmpeg
```

如果已经输出类似：

```text
/usr/bin/ffmpeg
```

说明机器上已经有 `ffmpeg`，可以直接跳到验证部分。

## 四、安装 FFmpeg

先更新软件索引：

```bash
sudo apt update
```

安装 `ffmpeg`：

```bash
sudo apt install -y ffmpeg
```

安装完成后，检查版本：

```bash
ffmpeg -version
```

正常情况下会输出类似：

```text
ffmpeg version ...
```

只要能正常打印版本，就说明安装成功。

## 五、确认后端进程可见

系统里安装成功，不代表当前已经运行的后端进程立刻可见。

如果 MediaForge 后端已经启动过，安装完 `ffmpeg` 后需要重启后端进程，让它重新读取环境：

```bash
# 按你当前的启动方式重启 MediaForge 后端
```

## 六、安装后验证

### 6.1 基础验证

先确认命令路径：

```bash
which ffmpeg
```

再确认版本：

```bash
ffmpeg -version
```

这两步都正常，说明系统层面已经没问题。

### 6.2 手动抽视频首帧验证

如果你想进一步确认当前机器能否正常为视频生成封面图，可以手动抽一帧：

```bash
ffmpeg -y -i /path/to/demo.mp4 -vf "thumbnail,scale='min(320,iw)':-2" -frames:v 1 /tmp/demo-poster.jpg
```

执行完成后检查输出文件：

```bash
ls -lh /tmp/demo-poster.jpg
```

如果文件生成成功，说明 `ffmpeg` 对这个视频的解码和抽帧是正常的。

## 七、和 MediaForge 的关系

在当前实现里：

- 图片 `/thumb` 返回图片缩略图
- 视频 `/thumb` 返回视频 poster 图

也就是说，智能画布里视频节点默认显示的模糊封面，本质上依赖后端成功生成视频 poster。

如果没有 `ffmpeg`，通常会出现下面这个现象：

- 视频节点只有播放图标
- 没有模糊封面图

原因很直接：

1. 后端尝试生成视频 poster
2. 因为缺少 `ffmpeg` 或抽帧失败，没有生成成功
3. `/api/files/{file_id}/thumb` 回退成占位图

## 八、出现“只有播放图标”的排查方法

如果安装后仍然有问题，按下面顺序查：

### 8.1 先看 thumb 接口返回的是什么

直接访问：

```text
/api/files/<file_id>/thumb?size=320
```

看返回类型：

- `image/jpeg`：poster 正常
- `image/svg+xml`：poster 没生成成功，走了占位图

### 8.2 看系统是否真的有 ffmpeg

```bash
which ffmpeg
ffmpeg -version
```

### 8.3 手工测试目标视频能否抽帧

```bash
ffmpeg -y -i /path/to/your-video.mp4 -vf "thumbnail,scale='min(320,iw)':-2" -frames:v 1 /tmp/check-poster.jpg
```

如果这里失败，后端也不会成功。

### 8.4 重启后端后再重新上传一个新视频验证

旧视频如果当时没有生成过 poster，可能需要重新触发一次 `/thumb` 请求或重新上传一个新视频来验证当前环境是否已经恢复正常。

## 九、常用命令汇总

安装：

```bash
sudo apt update
sudo apt install -y ffmpeg
```

查看路径：

```bash
which ffmpeg
```

查看版本：

```bash
ffmpeg -version
```

手工抽帧：

```bash
ffmpeg -y -i /path/to/demo.mp4 -vf "thumbnail,scale='min(320,iw)':-2" -frames:v 1 /tmp/demo-poster.jpg
```

## 十、结论

对当前 MediaForge 而言，`ffmpeg` 不属于可选增强项，而是视频封面能力的基础依赖之一。

如果部署环境要支持：

- 智能画布视频封面
- 视频缩略图
- 更完整的视频处理链路

那就应该把 `ffmpeg` 作为正式部署依赖，和 MinIO、PostgreSQL 一样明确安装和验证。
