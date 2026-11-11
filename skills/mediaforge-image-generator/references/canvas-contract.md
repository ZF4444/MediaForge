# AI 生图画布参数契约

本参考用于生成 `SemanticPlan`，说明普通 API 图片模型在新建和更新节点时的不同组装方式。实际字段、选项、默认值和范围仍由每次的 `read_capability_parameters` 决定。

## 目标绑定与常见字段

| 项目 | 来源及含义 |
| --- | --- |
| `semantic_type` | `image_generation`，后端映射为画布 `smart-image`、`genKind=image` |
| `capability` | 注册表中的 `image.text_to_image` |
| `connection_id`、`model_id` | 同一已启用 target 的稳定 ID，复制到 `SemanticNode` 专用字段 |
| `resource_id` | 普通模型留空；不使用应用或工作流的资源 ID |
| 引擎和模式 | 新建 `image_generation` 的后端默认值为 `engine=api`、`apiKind=image`，不必伪造参数字段 |
| `params_path` | 普通 API 图片模型当前为 `runSettings`，仍以实际返回为准 |

常见参数如下，不能把此表当作固定枚举或默认值清单：

| 语义 | 常见字段 ID | 填写方式 |
| --- | --- | --- |
| 提示词 | `prompt` | 以 `role=prompt` 识别，原始字符串 |
| 画幅比例 | `ratio` | 枚举原始 value，例如 `16:9` |
| 分辨率档位 | `resolution` | 模型返回的原始 value，不能自行转换大小写 |
| 自定义尺寸或比例 | `customSize`、`customRatio` | 只有实时字段与选项支持时才填写，并满足相关格式要求 |
| 质量 | `quality` | 模型返回的原始 value |
| 数量 | `count` | 数值，遵守契约；数量影响任务消耗，不主动增加 |

`source` 比例需要真实参考图输入，并将首张选中参考图的比例匹配到契约支持的 `ratioMatched` 值；有实际尺寸才能计算，不能仅填 `source` 并假设后端自动识别。缺少尺寸时询问输出比例，不擅自换成正方形。`custom` 需要配套自定义字段，不能只写一个枚举值。

提示词中的“高清”“横版”等描述不能代替实际参数。不要新增 `size`、`n`、`negative_prompt` 等未由参数工具返回的字段；后端会负责把画布参数转换为供应商请求。

## 新建节点：平铺字段值

在 `canvas.create_node.node` 中设置语义类型、能力和稳定 target。`node.params` 按实时字段 ID 平铺；以下仅示意填写形式，数值必须先通过当前模型契约核对：

```json
{
  "prompt": "雨后的海边灯塔，暖色灯光，远景构图",
  "ratio": "16:9",
  "count": 1
}
```

不要在这个平铺对象里加入 `runSettings`、`engine`、稳定 target ID 或 `{ "value": ... }` 包装。新建路径会按字段契约校验、按 `params_path` 归位，并将提示词镜像到 `runSettings.prompt` 和画布文本。

若工具原生 schema 将 `params` 声明为 JSON 字符串，则把上述对象编码一次作为该字段值；否则使用对象。不要把提示词字符串本身编码成 JSON，也不要双重编码。

运行步骤使用 `action="canvas.run_node"`，`target_node_id` 填前面创建步骤的 `id`。这属于计划中的动作，不是独立工具调用；创建步骤 ID 将由执行器解析为真实节点 ID。计划的 `execution.capabilities` 包含实际所用的 `image.text_to_image`。

## 复用节点：保留完整运行设置

当前 `canvas.update_node_params` 与新建路径不同：adapter 直接传递 `node.params`，执行器对节点做浅合并，不会将平铺字段自动归位，也不会自动合并嵌套的 `runSettings`。

复用前核实用户指定节点确实为 `genKind=image`、`runSettings.engine=api`、`apiKind=image`，并已绑定本次选定的 `connection_id/model_id`。只有新建路径会自动绑定 `SemanticNode` 专用 target 字段；更新路径不能靠修改这些字段切换模型。

- 只改提示词：用 `canvas.replace_node_content`，将新文本放入 `node.params.runSettings.prompt`，其余运行设置由执行器保留。
- 调整比例、数量等参数：从最新画布上下文复制该节点完整 `runSettings`，在副本上修改本次字段，用 `canvas.update_node_params` 提交 `node.params={"runSettings": 完整副本}`。保留原有稳定 target、`engine`、`apiKind` 和仍有效的其它参数。若同时修改提示词，写入同一副本的 `prompt`，执行器会同步画布提示词。
- 用户未明确要求复用，或需要改引擎/换模型时，使用新建路径绑定所选 target。用户明确要求在原节点切换模型时，说明当前更新路径的绑定限制，询问是否允许新建；不声称修改 `SemanticNode.model_id` 就已经换模，也不静默改动原节点。

更新步骤的 `target_node_id` 使用读到的真实节点 ID，`node.semantic_type` 为 `image_generation`。运行步骤也指向该真实 ID，并交由平台确认流程处理现有节点授权。不得把普通上传图片节点当作可复用生成节点。

## 执行和状态证据

- `propose_canvas_patch` 返回 `awaiting_confirmation`：只有计划，尚未执行。
- 执行器返回节点映射及提交结果：可以报告已应用的节点和真实任务 ID。
- 任务为 `queued` / `running`：不等于图片已生成。
- 成功事件与输出资产：据此交付图片引用、实际张数；部分结果只报告已得到的数量。
- 失败或超时：报告真实错误及阶段，不自动再发一轮付费生成。

图生图提交时从当前用户画布的 `inputNodeIds` 及 `kind=input` 连线解析参考图片，按顺序填入任务的 `reference_images`，保留文件 ID、原图地址和 `image_N` 角色；任务入队后使用这一份快照。旧输出、`runInputRefs` 和普通 `flow` 连线不自动充当参考图。具体绑定和选图规则见 [image-to-image.md](image-to-image.md)。
