import re

from app.config import (
    HELP_DEFAULT_PAGE,
    HELP_LOCK,
)
from app.core.utils import now_ms
from app.services.business_metadata import metadata_connection


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


def read_help_markdown(page: str | None = None) -> str:
    page = _normalize_page(page)
    with HELP_LOCK:
        with metadata_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT content FROM help_pages WHERE slug=%s", (page,))
            row = cur.fetchone()
    return row["content"] if row else DEFAULT_HELP_MARKDOWN


def write_help_markdown(content: str, page: str | None = None) -> str:
    page = _normalize_page(page)
    text = str(content or "")
    with HELP_LOCK:
        with metadata_connection() as conn, conn.cursor() as cur:
            cur.execute("INSERT INTO help_pages(slug,content,updated_at) VALUES(%s,%s,%s) ON CONFLICT(slug) DO UPDATE SET content=EXCLUDED.content,updated_at=EXCLUDED.updated_at", (page, text, now_ms()))
    return text


def list_help_pages() -> list[str]:
    with HELP_LOCK:
        with metadata_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT slug FROM help_pages ORDER BY slug")
            return [row["slug"] for row in cur.fetchall()]
