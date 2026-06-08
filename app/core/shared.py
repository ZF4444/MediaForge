"""跨功能域共享的辅助函数。

这些工具被多个 router 复用，单独成模块以避免 router 之间或 router 与 main 的循环导入。
从 main.py 原样迁移，行为完全一致。
"""
import re


def sanitize_asset_name(name, fallback="asset"):
    name = re.sub(r'[\\/:*?"<>|]+', "_", str(name or fallback)).strip()
    return name[:120] or fallback
