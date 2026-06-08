"""模型 schema 快照测试。

路由快照只覆盖 path/method，本测试补充覆盖**请求体模型字段契约**：
对 OpenAPI components.schemas 中每个模型的字段名/类型/默认值/required
做规范化比对，确保 Pydantic 模型迁移到 app/models 后字段完全不变。
"""
import json
import os

BASELINE_FILE = os.path.join(os.path.dirname(__file__), "schema_baseline.json")


def _normalize(app):
    schema = app.openapi()
    comps = schema.get("components", {}).get("schemas", {})
    norm = {}
    for name, body in comps.items():
        props = {}
        for pn, pv in body.get("properties", {}).items():
            props[pn] = {
                k: pv[k]
                for k in ("type", "items", "anyOf", "allOf", "$ref", "default", "maxLength", "minLength")
                if k in pv
            }
        norm[name] = {"properties": props, "required": sorted(body.get("required", []))}
    return norm


def test_model_schema_matches_baseline(app):
    with open(BASELINE_FILE, encoding="utf-8") as f:
        baseline = json.load(f)
    current = _normalize(app)

    base_names = set(baseline)
    cur_names = set(current)
    assert base_names == cur_names, (
        f"模型集合变化:\n  丢失: {sorted(base_names - cur_names)}\n  新增: {sorted(cur_names - base_names)}"
    )

    diffs = []
    for name in sorted(base_names):
        if baseline[name] != current[name]:
            diffs.append(name)
    assert not diffs, f"以下模型的字段契约发生变化: {diffs}"
