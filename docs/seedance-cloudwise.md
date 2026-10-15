# 通过 Cloudwise 使用 Seedance

1. 在平台的 AI 连接 / API 设置中添加连接，协议选择 `openai`。
2. Base URL 填写 `https://api.cloudwise.ai` 或 `https://api.cloudwise.ai/api/v1`，保存 Cloudwise API Key。
3. 点击“发现模型”，导入所需的视频模型，例如 `dreamina-seedance-2-5-260628`、`dreamina-seedance-2-0-260128` 或 `doubao-seedance-2-0-fast-260128`。模型需要在 Cloudwise 账户中有可用通道。
4. 在画布选择 API 视频生成、该连接和 Seedance 模型，设置提示词、时长、比例、分辨率及是否生成音频，再运行节点。

支持文字、参考图片、参考视频和参考音频。未指定用途的图片以 `reference_image` 传入；参考视频以 `reference_video` 直接提交，音频以 `reference_audio` 提交。远程素材地址需能够被上游读取，平台本地文件沿用现有的 data URL 转换流程。

Seedance 请求自动使用 `/api/v1/aiproducts/video/seedance` 提交，并通过 `/api/v1/aiproducts/video/seedance/tasks/{task_id}` 查询状态，成功后沿用平台的视频保存流程。其他视频服务仍使用原有接口。

默认关闭水印，显式传递音频开关。不发送该端点文档未列出的 seed 或 return_last_frame 参数。输出使用上游默认 MP4；目前未提供 MOV 输出选项。可选分辨率界面沿用平台的 480p / 720p / 1080p，API 请求亦支持文档列出的 4k。

接口依据：[Cloudwise API 文档](cloudwise-api-docs.md)。自动化测试使用模拟 HTTP 响应，不产生上游生成费用。
