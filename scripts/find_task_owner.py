#!/usr/bin/env python3
"""
根据 RunningHub（或其他 provider）的 task_id，反查是哪个用户提交的。

原理：
    本项目里生图/生视频结果按用户隔离存放在
        data/users/<user_id>/history.json
    每条记录带有 task_id 字段（RunningHub 任务对应的 taskId 会写在这里）。
    脚本遍历所有用户目录下的 history.json，找出 task_id 匹配的记录，
    从文件路径推断出提交者 user_id。

用法：
    python scripts/find_task_owner.py <task_id> [task_id2 ...]
    python scripts/find_task_owner.py --all          # 列出所有 task_id -> user 的映射
    python scripts/find_task_owner.py <task_id> --data-dir /path/to/data

也支持模糊匹配（子串），方便只记得一部分 ID 的情况：
    python scripts/find_task_owner.py --fuzzy abcd1234
"""
import argparse
import json
import os
import sys
from datetime import datetime
from glob import glob


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[警告] 读取失败 {path}: {e}", file=sys.stderr)
        return None


def iter_history_records(data_dir):
    """遍历 data/users/*/history.json，逐条 yield (user_id, record, file_path)。"""
    users_dir = os.path.join(data_dir, "users")
    if not os.path.isdir(users_dir):
        print(f"[错误] 未找到用户目录：{users_dir}", file=sys.stderr)
        return
    for history_path in glob(os.path.join(users_dir, "*", "history.json")):
        user_id = os.path.basename(os.path.dirname(history_path))
        records = load_json(history_path)
        if not isinstance(records, list):
            continue
        for record in records:
            if isinstance(record, dict):
                yield user_id, record, history_path


def collect_task_id_candidates(record):
    """从一条 history 记录里尽量抠出所有可能是 task_id 的值（含 raw 里嵌套的）。"""
    candidates = set()

    def add(v):
        if v is None:
            return
        s = str(v).strip()
        if s and s.lower() != "none":
            candidates.add(s)

    add(record.get("task_id"))
    add(record.get("request_id"))

    raw = record.get("raw")
    if isinstance(raw, dict):
        for key in ("taskId", "task_id", "id"):
            add(raw.get(key))
        data = raw.get("data")
        if isinstance(data, dict):
            for key in ("taskId", "task_id", "id"):
                add(data.get(key))

    return candidates


def format_timestamp(ts):
    try:
        return datetime.fromtimestamp(float(ts)).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(ts)


def summarize_record(record):
    prompt = (record.get("prompt") or "")[:60]
    ts = format_timestamp(record.get("timestamp")) if record.get("timestamp") else "-"
    provider = record.get("provider_name") or record.get("provider_id") or "-"
    model = record.get("model") or "-"
    return f"time={ts} provider={provider} model={model} prompt={prompt!r}"


def find_by_task_ids(data_dir, task_ids, fuzzy=False):
    task_ids = [str(t).strip() for t in task_ids if str(t).strip()]
    found_any = False
    for user_id, record, path in iter_history_records(data_dir):
        candidates = collect_task_id_candidates(record)
        if not candidates:
            continue
        for wanted in task_ids:
            matched = False
            if fuzzy:
                matched = any(wanted.lower() in c.lower() for c in candidates)
            else:
                matched = wanted in candidates
            if matched:
                found_any = True
                print(f"[命中] task_id={wanted}  用户={user_id}")
                print(f"       文件：{path}")
                print(f"       {summarize_record(record)}")
                print()
    if not found_any:
        print("未在任何用户的 history.json 中找到匹配的 task_id。")
        print("可能原因：")
        print("  1. 该任务是通过 RunningHub 专属接口（/api/runninghub/submit 等）直接提交，")
        print("     项目当前未把这类 taskId 落盘记录到 history.json。")
        print("  2. task_id 拼写有误，可尝试加 --fuzzy 做子串匹配。")


def list_all(data_dir):
    rows = []
    for user_id, record, _path in iter_history_records(data_dir):
        for tid in collect_task_id_candidates(record):
            rows.append((tid, user_id, record))
    if not rows:
        print("未找到任何带 task_id 的记录。")
        return
    rows.sort(key=lambda r: (r[1], r[2].get("timestamp") or 0))
    for tid, user_id, record in rows:
        print(f"{tid}\t{user_id}\t{summarize_record(record)}")


def main():
    parser = argparse.ArgumentParser(description="根据 task_id 反查提交用户")
    parser.add_argument("task_ids", nargs="*", help="要查询的 task_id（可多个）")
    parser.add_argument("--data-dir", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"),
                         help="data 目录路径，默认项目内 data/")
    parser.add_argument("--all", action="store_true", help="列出所有 task_id -> 用户 的映射")
    parser.add_argument("--fuzzy", action="store_true", help="子串模糊匹配 task_id")
    args = parser.parse_args()

    if args.all:
        list_all(args.data_dir)
        return

    if not args.task_ids:
        parser.print_help()
        sys.exit(1)

    find_by_task_ids(args.data_dir, args.task_ids, fuzzy=args.fuzzy)


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        # 输出被 head/less 等提前截断时的无害报错，直接忽略。
        sys.stderr.close()
