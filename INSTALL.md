# AI Studio

基于 FastAPI 的 AI 创作工作台，集成了多种 AI 图片生成、编辑和对话能力。

## 功能介绍

### 🎨 文生图（Z-Image）

通过 ModelScope 的 Z-Image-Turbo 模型，输入文字描述即可生成高质量图片。支持自定义分辨率，也可连接本地 ComfyUI 使用自定义工作流生成。

### ✨ 细节增强（Enhance）

对已有图片进行细节增强处理，通过本地 ComfyUI 工作流实现图片质量提升、细节补充。

### 🖌️ 图片编辑（Klein）

基于 ModelScope 的 FLUX.2-Klein 模型，支持图生图编辑。可上传参考图片并通过文字描述进行风格转换、内容修改等操作，支持 LoRA 模型。

### 📐 角度控制（Angle）

基于 ModelScope 的 Qwen-Image-Edit-2511 模型，上传图片后通过文字指令控制图片视角、角度变换，实现多角度图片生成。

### 🌐 在线生图（Online）

通过 ComFly API 调用 GPT-Image 等云端模型生成图片。支持参考图片编辑（image edit），支持多种模型和尺寸选择。

### 💬 GPT 对话（Chat）

多轮 AI 对话功能，支持：
- 文字对话模式：接入 ComFly（GPT-5.5 等）和 ModelScope（Qwen3-235B、MiniMax）多个模型
- 图片生成模式：在对话中直接生图，支持附带参考图片
- 流式输出（SSE）实时显示回复
- 对话历史管理：创建、切换、删除对话

### 🧩 无限画布（Canvas）

可视化节点画布，支持：
- 创建自由排列的内容节点
- 节点间连线建立关系
- 画布缩放和平移
- 集成 LLM 对话能力
- 画布保存、回收站和恢复

### 📡 实时状态

通过 WebSocket 实时推送在线人数统计和新图片生成通知，多用户协同感知。

### ⚙️ 其他特性

- **多后端负载均衡**：支持多个 ComfyUI 实例，自动选择负载最低的后端
- **图片自动同步**：跨后端自动同步输入图片
- **历史记录**：所有生成结果自动保存，支持按类型筛选和删除
- **图片格式转换**：支持 PNG 转 JPG 压缩输出
- **暗色/亮色主题**：前端支持主题切换

## 环境要求

- Python >= 3.11
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python 包管理工具)

## 环境搭建

### 1. 安装 uv

```bash
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 2. 创建虚拟环境并安装依赖

```bash
uv sync
```

该命令会自动：
- 根据 `.python-version` 下载并使用 Python 3.11
- 创建 `.venv` 虚拟环境
- 根据 `pyproject.toml` 安装所有依赖

### 3. 配置 API Key

将 `API/.env` 中的 key 替换为你自己的：

```
COMFLY_API_KEY=sk-xxxxx
MODELSCOPE_API_KEY=ms-xxxx
```

- ComFly 注册：https://ai.comfly.chat/register?aff=HAOj137551
- ModelScope Token：https://www.modelscope.cn/my/access/token

### 4. 启动服务

```bash
uv run python main.py
```

## 项目结构

```
├── main.py          # 主服务入口
├── API/.env         # API Key 配置
├── static/          # 前端页面
├── workflows/       # ComfyUI 工作流
├── packages/        # 预打包的 whl 依赖（Windows 离线安装用）
└── pyproject.toml   # 项目配置与依赖声明
```
