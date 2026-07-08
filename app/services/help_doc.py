import os
import re

from app.config import (
    DATA_DIR,
    HELP_DEFAULT_PAGE,
    HELP_LOCK,
    HELP_MARKDOWN_DIR,
    HELP_MARKDOWN_FILE,
)


DEFAULT_HELP_MARKDOWN = """# 使用帮助

管理员可以点击右侧「帮助」入口，在编辑模式中维护这份帮助文档。

## 常见说明

- 这里支持 Markdown 文本。
- 普通用户打开后只能查看。
- 管理员可以在编辑和预览之间切换。
- 每个页面的帮助内容互相独立，可分别编辑。
"""

_PAGE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def _normalize_page(page: str | None) -> str:
    """校验并归一化页面标识，防止路径穿越；非法或空值回退到默认页。"""
    if not page:
        return HELP_DEFAULT_PAGE
    page = str(page).strip()
    if not page or not _PAGE_ID_RE.match(page):
        return HELP_DEFAULT_PAGE
    return page


def _page_file(page: str) -> str:
    return os.path.join(HELP_MARKDOWN_DIR, f"{page}.md")


def read_help_markdown(page: str | None = None) -> str:
    page = _normalize_page(page)
    with HELP_LOCK:
        path = _page_file(page)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception:
                return DEFAULT_HELP_MARKDOWN
        # 兼容旧版本：默认页优先回退读取旧的单文件 help.md
        if page == HELP_DEFAULT_PAGE and os.path.exists(HELP_MARKDOWN_FILE):
            try:
                with open(HELP_MARKDOWN_FILE, "r", encoding="utf-8") as f:
                    return f.read()
            except Exception:
                return DEFAULT_HELP_MARKDOWN
        return DEFAULT_HELP_MARKDOWN


def write_help_markdown(content: str, page: str | None = None) -> str:
    page = _normalize_page(page)
    text = str(content or "")
    with HELP_LOCK:
        os.makedirs(HELP_MARKDOWN_DIR, exist_ok=True)
        path = _page_file(page)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    return text


def list_help_pages() -> list[str]:
    with HELP_LOCK:
        if not os.path.isdir(HELP_MARKDOWN_DIR):
            return []
        return sorted(
            name[:-3] for name in os.listdir(HELP_MARKDOWN_DIR) if name.endswith(".md")
        )
