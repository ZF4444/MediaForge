# MediaForge

基于 FastAPI 的 AI 创作工作台，集成了多种 AI 图片生成、编辑和对话能力。

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
