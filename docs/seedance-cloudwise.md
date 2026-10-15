# 通过 Cloudwise 使用 Seedance

1. 在平台的 AI 连接 / API 设置中添加连接，协议选择 `openai`。
2. Base URL 填写 `https://api.cloudwise.ai` 或 `https://api.cloudwise.ai/api/v1`，保存 Cloudwise API Key。
3. 点击“发现模型”，导入所需的视频模型，例如 `dreamina-seedance-2-5-260628`、`dreamina-seedance-2-0-260128` 或 `doubao-seedance-2-0-fast-260128`。模型需要在 Cloudwise 账户中有可用通道。
4. 在画布选择 API 视频生成、该连接和 Seedance 模型，设置提示词、时长、比例、分辨率及是否生成音频，再运行节点。

支持文字、参考图片、参考视频和参考音频。未指定用途的图片以 `reference_image` 传入；参考视频以 `reference_video` 直接提交，音频以 `reference_audio` 提交。远程素材地址需能够被上游读取，平台本地文件沿用现有的 data URL 转换流程。

Seedance 请求自动使用 `/api/v1/aiproducts/video/seedance` 提交，并通过 `/api/v1/aiproducts/video/seedance/tasks/{task_id}` 查询状态，成功后沿用平台的视频保存流程。其他视频服务仍使用原有接口。

默认关闭水印，显式传递音频开关。不发送该端点文档未列出的 seed 或 return_last_frame 参数。输出使用上游默认 MP4；目前未提供 MOV 输出选项。可选分辨率界面沿用平台的 480p / 720p / 1080p，API 请求亦支持文档列出的 4k。

接口依据：[Cloudwise API 文档](cloudwise-api-docs.md)。自动化测试使用模拟 HTTP 响应，不产生上游生成费用。

## 视频 Token 计费配置

在 Models 中选择视频类型模型，填写 `480P / 720P / 1080P / 4K × 不含输入视频 / 含输入视频` 共 8 档单价，单位为 **USD / 百万 Token**。单价应填写 Cloudwise 账户实际适用的价格；原来的固定输出单价不会自动套用于这 8 档。留空表示未配置，0 表示零价格。

价格保存于模型的 `settings.video_token_prices`，例如：

```json
{
  "720p": {"without_video": 10, "with_video": 20}
}
```

上述数字仅为配置示例。

创建任务时，从保存的 `request.videos` 判断是否含视频，忽略空地址、实际为图片的地址，以及超过当前提交数量限制的素材；同时保存分辨率、档位、单价和币种快照。未指定分辨率的 Cloudwise Seedance 请求明确使用 480p。提交成功后立即将上游任务 ID 写回平台任务，不必等轮询结束。

成功响应返回用量时，费用按 `usage.total_tokens / 1,000,000 × 单价` 计算；缺少 `total_tokens` 时使用 `completion_tokens`。结算写入现有 `ai_usage_records`，保存上下游任务 ID、原始用量与价格快照。相同连接、协议与上游任务 ID 只结算一次。结算在下载视频之前执行，因此下载失败不会抹去已产生的生成费用。缺少用量时不伪造消费；未配置价格时，用量记录标记为未配置价格，金额不代表上游免费。

无需新增数据表或数据库列：模型价格、任务计费上下文和账本快照都复用现有 JSON 字段。任务计费上下文会进入任务归档，但原始 `request` 不会进入数据库归档；运行期请求仍保存在 Redis 中。
