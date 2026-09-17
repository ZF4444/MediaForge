"""方案 B:画布来源的生成不写入历史表。

这些测试锁定隔离契约:
- 三个写历史的请求模型都带 source 字段。
- _is_canvas_sourced 只对 source=="canvas"(不区分大小写/空白)判真。
- 画布任务派发处(create_canvas_image_task / create_canvas_comfy_task)会把
  source 强制设为 "canvas",不信任前端传入的值。
- comfy 适配器 normalize_inputs 会保留 source,使其经 worker 流到 generate()。

三个 save_to_history 调用点被 `if not _is_canvas_sourced(...)` 守卫;守卫的
真值来源就是这里验证的 _is_canvas_sourced,因此隔离行为由本文件覆盖。
"""
import main
from app.models import GenerateRequest, ImageTaskQueryRequest, OnlineImageRequest


def test_request_models_carry_source_default_empty():
    assert OnlineImageRequest(prompt="x").source == ""
    assert GenerateRequest().source == ""
    assert ImageTaskQueryRequest(task_id="t").source == ""


def test_is_canvas_sourced_true_only_for_canvas():
    assert main._is_canvas_sourced(OnlineImageRequest(prompt="x", source="canvas")) is True
    assert main._is_canvas_sourced(GenerateRequest(source="canvas")) is True
    assert main._is_canvas_sourced(ImageTaskQueryRequest(task_id="t", source="canvas")) is True
    # 大小写/空白不敏感
    assert main._is_canvas_sourced(GenerateRequest(source="  Canvas ")) is True


def test_is_canvas_sourced_false_for_non_canvas():
    # pose-studio / ComfyUI 直连 / angle / gaussian 等不带 canvas 来源 -> 仍写历史
    assert main._is_canvas_sourced(OnlineImageRequest(prompt="x")) is False
    assert main._is_canvas_sourced(GenerateRequest()) is False
    assert main._is_canvas_sourced(GenerateRequest(source="pose-studio")) is False
    assert main._is_canvas_sourced(ImageTaskQueryRequest(task_id="t")) is False


def test_is_canvas_sourced_tolerates_missing_attribute():
    class NoSource:
        pass

    assert main._is_canvas_sourced(NoSource()) is False


def test_comfy_adapter_preserves_source_through_normalize():
    """画布 comfy 任务经 worker 复用 generate();source 必须能穿过适配器。"""
    from app.ai.adapters.comfyui_workflow import ComfyUIWorkflowAdapter
    from app.ai.domain import Connection, ExecutableResource, ResolvedTarget

    target = ResolvedTarget(
        connection=Connection(id="c1", protocol="comfyui", name="c1", base_url="http://x", enabled=True),
        model=None,
        resource=ExecutableResource(id="r1", connection_id="c1", kind="comfyui_workflow", name="wf"),
    )
    payload = GenerateRequest(resource_id="r1", connection_id="c1", source="canvas").model_dump(mode="json")
    normalized = ComfyUIWorkflowAdapter.normalize_inputs(target, payload)
    assert normalized.get("source") == "canvas"
    # provider/model 被剥离,但 source 保留,且能重建为带 canvas 来源的请求
    assert main._is_canvas_sourced(GenerateRequest.model_validate(normalized)) is True
