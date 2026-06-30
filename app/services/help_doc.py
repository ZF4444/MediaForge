import os

from app.config import DATA_DIR, HELP_LOCK, HELP_MARKDOWN_FILE


DEFAULT_HELP_MARKDOWN = """# 使用帮助

管理员可以点击右侧「帮助」入口，在编辑模式中维护这份帮助文档。

## 常见说明

- 这里支持 Markdown 文本。
- 普通用户打开后只能查看。
- 管理员可以在编辑和预览之间切换。
"""


def read_help_markdown() -> str:
    with HELP_LOCK:
        if not os.path.exists(HELP_MARKDOWN_FILE):
            return DEFAULT_HELP_MARKDOWN
        try:
            with open(HELP_MARKDOWN_FILE, "r", encoding="utf-8") as f:
                return f.read()
        except Exception:
            return DEFAULT_HELP_MARKDOWN


def write_help_markdown(content: str) -> str:
    text = str(content or "")
    with HELP_LOCK:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = HELP_MARKDOWN_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, HELP_MARKDOWN_FILE)
    return text
