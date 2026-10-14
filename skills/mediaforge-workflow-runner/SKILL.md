---
name: mediaforge-workflow-runner
description: 面向 MediaForge 平台工作流的执行技能：发现可用工作流，读取参数契约，准备输入并通过画布正确运行；当前首要支持 X2 场景单体文生图，后续扩展其它工作流。
---

# MediaForge 平台工作流执行

本 skill 用于把用户请求转换为一次可追踪的工作流执行。它负责工作流发现、资源绑定、参数契约读取、画布节点计划、用户确认后的运行以及结果回传。提示词改写只是某些工作流的输入准备步骤，不是本 skill 的固定输出。

## 通用执行契约

1. 判断用户是要查询、配置、只准备输入，还是实际运行；未明确时，涉及生成或处理的请求默认准备运行。
2. 读取画布上下文和 `read_capability_registry`，只选择注册表中真实存在且已启用的能力与 target。将 `capability`、`connection_id`、`resource_id`、`model_id` 原样保存，禁止猜测 ID、URL 或后端接口。
3. 选择 target 后必须调用 `read_capability_parameters`，以返回的 `fields`、`role`、`options`、`params_path`、默认值和范围为唯一参数契约。不要凭经验制造字段名或嵌套结构。
4. 将用户输入映射为字段原始值：提示词字段写入提示词内容，图片/视频/音频字段通过画布连接提供，枚举字段使用 `options[].value`，数值字段遵守范围和步长。不要把资源标识符塞进 `params`。
5. 使用 `propose_canvas_patch` 创建或更新正确的语义节点（`image_generation`、`video_generation` 或 `workflow_generation`），必要时连接输入节点。计划阶段不直接执行；涉及运行的提案必须等待用户确认。
6. 用户确认后运行 `canvas.run_node` 或 `canvas.run_group`，回传工作流名称、状态、任务/操作 ID、输出资产引用和失败阶段。异步任务保留可查询 ID。
7. 目标缺失、资源不唯一、参数契约缺失或工作流未适配时暂停并澄清；不得用相近模型或其它工作流静默替代。

## 适配器路由

工作流专属规则必须放在 `references/` 的独立适配器文档中。读取与当前目标匹配的文档后再执行，不将一个工作流的字段、默认值或错误处理套到另一个工作流。

- 当前 X2 场景单体文生图：读取 [references/x2-scene-asset-workflow.md](references/x2-scene-asset-workflow.md)。
- 新增工作流：新增独立适配器文档，包含资源匹配条件、必需输入、字段映射、节点类型、执行方式、输出解析和失败策略，再加入此路由列表。

## 安全边界

- 只通过平台的能力、参数和画布工具执行；不得直接拼接供应商请求。
- 不改变用户明确内容；缺少必填输入时询问，不擅自填入业务含义。