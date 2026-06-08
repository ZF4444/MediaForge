"""无业务依赖的纯工具函数。"""
import time


def now_ms() -> int:
    return int(time.time() * 1000)
