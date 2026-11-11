---
name: mediaforge-image-generator
description: 通过 MediaForge 图片生成节点的“AI生成”（api）引擎执行文生图和图生图：选择已启用模型，绑定画布参考图片，读取实时参数契约，准备画布提案并跟踪图片结果。适用于按描述生图、基于已有图片修改或融合多张参考图；不用于 ComfyUI、RunningHub 应用或 X2 专属工作流。
---

# MediaForge AI 图片生成

把用户的图片需求转换为可确认、可追踪的 AI 生图任务。使用普通图片模型，不套用 X2 场景资产提示词规则。

## 执行顺序（读完本文后立即继续，不要在此结束本轮）

读完本文就是开始，不是结束。不要把本文内容复述给用户。普通文生图按下面顺序连续调用工具，直到 `propose_canvas_patch` 返回 `awaiting_confirmation`，或必须向用户提问：

1. `read_canvas_context`：读取用户指定的节点（未指定可跳过）。
2. `read_capability_registry`：在 `image.text_to_image.targets` 中选 `enabled=true` 的普通模型。
3. `read_capability_parameters`：用所选 `connection_id`、`model_id` 读取实时参数契约。
4. `propose_canvas_patch`：创建图片生成节点并加入 `canvas.run_node`。

只有以下情况才读参考文档，普通文生图不需要读：

- 图生图、多图参考、选择部分图片：先读 [references/image-to-image.md](references/image-to-image.md)。
- 复用已有节点、更新参数或提示词：先读 [references/canvas-contract.md](references/canvas-contract.md)。

用 `read_canvas_skill_file` 读取参考文档，路径相对本 skill 目录。读完同样立即继续上面的工具调用。

## 适用边界

- 使用 `semantic_type="image_generation"`，能力为注册表返回的 `image.text_to_image`，画布引擎为 `api`，`apiKind="image"`。
- 普通图片模型用 `connection_id` 和 `model_id` 定位，`resource_id` 留空。不要按连接名称含某个供应商就判断引擎，以注册表中的能力和 target 为准。
- 用户明确选择 ComfyUI、RunningHub 应用或 X2 工作流时，改用对应工作流 skill，不静默转成 AI 生图。
- 工具不可用时说明受限阶段，可交付已准备的提示词，不编造模型、节点或执行状态，不绕过平台直连供应商。
- `image.text_to_image` 的名称不代表模型支持图片输入。图生图要核实所选 target 的 `image_input` 契约，并绑定实际图片。

## 模式判断

- 只按文字描述创作：文生图，不附加参考图连接，不自动使用选中节点、旧输出或历史输入。
- “基于这张图”“改成”“保持图中主体”或多图融合：图生图。只有图片但缺少操作意图时，询问要保留和修改的内容。
- 图片只用于分析、描述或反推提示词：先完成该任务，不自动提交图生图。要求蒙版或精确区域编辑时，说明当前没有专用蒙版绑定。
- “先生成，再基于结果修改”分阶段处理：首个任务成功且原图进入画布后，再绑定真实输出并提出下一次提案。

## 输入与模型选择

1. 区分只要提示词、只配置节点、实际生图。用户说“生成/画/生图”即准备运行；“只要提示词”完成文本后结束；“先配置、不运行”不加入运行动作。
2. 提取主体、用途、风格、构图、可见文字，以及用户明确要求的模型、比例、分辨率、质量和数量。保留用户原意，不主动附加透明背景、等距视角或游戏资产风格。可选参数未指定时沿用模型的实时默认值，不要为此追问。
3. 用户指定模型时必须匹配该模型；同名多连接且无法消歧时列出候选询问。未指定模型时，优先沿用用户指定节点上仍启用的模型；否则只有一个候选就直接选，多个候选给出简短选项，不擅自选第一个。目标缺失、禁用或不支持参考图时说明原因，不静默换模型。
4. 将 target 的 `connection_id`、`model_id` 原样保存，不能用显示名、上游模型名或旧环境 ID 代替。

## 参数与提示词

- 以 `read_capability_parameters` 返回的 `fields`、`role`、`options[].value`、`default`、`min/max/step` 和 `params_path` 为准。提交值保留原始类型，不要把 label 当 value。模型改变后重新读取。
- 提示词写入 `role="prompt"` 的字段（常见 ID 为 `prompt`）。整理成清晰的画面描述；用户要求原样使用时不重写。没有提示词字段时停止并说明。
- 比例、分辨率、质量、数量只能使用契约支持的值。用户指定值不受支持时说明可选值并询问，不静默取整、缩减张数，也不要把比例写进提示词冒充参数。
- 不要新增 `size`、`n`、`negative_prompt` 等契约未返回的字段，也不要假设每个模型都支持 `4k`、`high`、透明输出或种子。

## 新建节点的提案写法

默认新建图片生成节点，避免覆盖其它作品。

- 在 `canvas.create_node` 的 `SemanticNode` 中设置 `semantic_type="image_generation"`、`capability`、`connection_id`、`model_id`。这三个标识放专用字段，不放进 `params`。
- `node.params` 按字段 ID 平铺原始值，例如 `{"prompt": "雨后的海边灯塔", "ratio": "16:9", "count": 1}`。不要写 `runSettings`、`engine`，也不要用 `{"value": ...}` 包装。后端会按 `params_path` 归位并把提示词同步到画布。若工具 schema 把 `params` 声明为 JSON 字符串，则整体编码一次，不要双重编码。
- 在同一计划中加入 `canvas.run_node`，`target_node_id` 填创建步骤的 `id`。单图任务不用 `canvas.run_group`。`execution.capabilities` 包含 `image.text_to_image`。
- `ratio=source` 需要真实参考图尺寸，缺少时询问输出比例。`custom` 需要配套的自定义字段。

## 提案、执行与回传

1. 调用 `propose_canvas_patch` 后，用一两句话说明所选模型、提示词、关键参数和数量。图生图还要列出参考图顺序。
2. 返回 `awaiting_confirmation` 只表示等待确认，不能说节点已创建或任务已启动。不要在规划阶段调用执行工具，确认后由平台执行。
3. 根据真实任务事件报告节点、模型、状态和任务 ID。排队或运行中不等于已生成；只有成功事件和输出资产返回后，才交付图片引用和实际张数。
4. 失败时保留提示词和参数，说明失败阶段（能力匹配、参数校验、提案、确认、提交、生成）。提交结果不明时先查询已有任务，不重复提交付费生成；授权或额度错误不自动重试。

只查询、只准备提示词、缺少必需输入或工具受限时，交付对应阶段的结果并说明尚未执行。实际生图请求在条件齐备时要推进到提案，不停留在提示词输出。
