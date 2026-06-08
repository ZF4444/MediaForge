"""按功能域拆分的 FastAPI 路由模块。

每个子模块定义一个独立的 `router = APIRouter()`，在 main.py 中通过
`app.include_router(...)` 注册。URL 路径、请求/响应模型、状态码与原
main.py 完全一致（纯结构重构，行为零变更）。
"""
