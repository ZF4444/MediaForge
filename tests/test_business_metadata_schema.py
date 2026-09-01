"""业务元数据建表 SQL 的静态契约测试。

`BUSINESS_METADATA_SQL` 在启动时整体执行，其中任何一条语句语法错误都会让
建表全部失败，而错误只会在运行期以「字段不存在」的形式暴露出来。本测试不
连接数据库，只对 SQL 文本做结构校验，因此可以在 CI 中无条件运行。
"""
from __future__ import annotations

import re

from app.services.business_metadata import BUSINESS_METADATA_SQL


def _create_table_blocks() -> dict[str, str]:
    """按表名提取每个 CREATE TABLE 的列定义部分。"""
    blocks: dict[str, str] = {}
    for match in re.finditer(
        r"CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\((.*?)\n\);",
        BUSINESS_METADATA_SQL,
        re.DOTALL,
    ):
        blocks[match.group(1)] = match.group(2)
    return blocks


def _declared_columns(body: str) -> list[str]:
    """取出列定义中的列名，跳过表级约束行。"""
    # 去掉括号内的内容，避免 NUMERIC(14, 4) 或 UNIQUE(a, b) 干扰切分。
    flat = re.sub(r"\([^()]*\)", "", body)
    names = []
    for part in flat.split(","):
        token = part.strip().split()
        if not token:
            continue
        head = token[0].upper()
        if head in {"UNIQUE", "PRIMARY", "FOREIGN", "CHECK", "CONSTRAINT", "EXCLUDE"}:
            continue
        names.append(token[0])
    return names


def test_no_create_table_declares_a_duplicate_column():
    """重复列名会让 PostgreSQL 报 DuplicateColumn 并使整条建表语句失败。

    历史上 omnilojo_usage_records 把 provider_id 改名为 connection_id 时漏看了
    下一行已有同名列，导致生产库缺少 connection_id 字段。
    """
    offenders = {}
    for table, body in _create_table_blocks().items():
        columns = [name.lower() for name in _declared_columns(body)]
        duplicates = {name for name in columns if columns.count(name) > 1}
        if duplicates:
            offenders[table] = sorted(duplicates)

    assert offenders == {}, f"建表语句存在重复列: {offenders}"


def test_create_table_blocks_are_discovered():
    """守护上面的解析逻辑：解析不到表说明正则与 SQL 写法脱节。"""
    blocks = _create_table_blocks()

    assert "omnilojo_usage_records" in blocks
    assert "runninghub_usage_records" in blocks
    assert len(blocks) > 10


def test_usage_tables_migrate_canonical_target_columns():
    """已存在的库只能通过 ADD COLUMN 拿到切换后的新字段。

    缺少任意一条 ALTER，旧部署就会在写用量时报「字段不存在」。
    """
    for table in ("omnilojo_usage_records", "runninghub_usage_records"):
        for column in ("connection_id", "model_id", "resource_id"):
            statement = f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} "
            assert statement in BUSINESS_METADATA_SQL, f"缺少迁移语句: {statement}"
