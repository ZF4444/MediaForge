"""跨模块共享的运行期状态与单例。

集中存放原本散落在 main.py 模块级的运行期可变状态，使拆分出去的 router
能够访问，同时保持「单一来源、单例语义」与原行为完全一致。

注意：这些是可变运行期状态，必须由所有使用方共享同一份对象/引用。
凡是会被 `global xxx` 重新赋值的标量（如 GLOBAL_LOOP / NEXT_TASK_ID），
统一通过本模块的函数访问，避免「import 时拷贝出一份独立副本」的陷阱。
"""
from typing import Any, Dict, Optional

# 事件循环（启动时由 startup 事件设置）。
GLOBAL_LOOP: Optional[Any] = None

# 画布图像任务自增 ID。
NEXT_TASK_ID: int = 1

# 即梦 CLI 登录会话（子进程 + 输出缓冲）。
JIMENG_LOGIN_SESSION: Dict[str, Any] = {
    "proc": None,
    "stdout": "",
    "stderr": "",
    "started_at": 0.0,
}


def set_global_loop(loop: Any) -> None:
    global GLOBAL_LOOP
    GLOBAL_LOOP = loop


def get_global_loop() -> Optional[Any]:
    return GLOBAL_LOOP


def next_task_id() -> int:
    """返回当前 NEXT_TASK_ID 并自增（与原 main.py 行为一致）。"""
    global NEXT_TASK_ID
    tid = NEXT_TASK_ID
    NEXT_TASK_ID += 1
    return tid
