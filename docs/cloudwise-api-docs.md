# Cloudwise AI API Reference

---

> Exported on 2026-10-15 · 113 endpoints

---

## AliCloud / wan2.5-preview / Text-to-Video `POST`

_Official Format_

### Text-to-Video

AliCloud AI platform providing access to Wan video generation models.

`POST https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis`

### Overview

This endpoint provides text-to-video generation functionality. Generate high-quality video content from text prompts with support for various resolutions, durations, and advanced features like prompt enhancement, multi-shot narratives, and audio synchronization. The API supports asynchronous processing and returns a task ID that can be used to query the generation status and retrieve the final video.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Content-Type | string | - | required<br>Request content type. This parameter must be set to `application/json`. |
| Authorization | string | - | required<br>Request authentication. The API uses cloudwise-maas API-Key for authentication. Example: `Bearer ak-xxxx`. |
| X-DashScope-Async | string | - | required<br>Asynchronous processing configuration parameter. HTTP requests only support asynchronous mode, must be set to `enable`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Model name. Example: `wan2.5-t2v-preview` |
| input | object | - | required<br>Basic input information, such as prompts. |
| input.prompt | string | - | Text prompt. Used to describe the elements and visual characteristics expected in the generated video.<br>Each character counts as one character, excess parts will be automatically truncated. Maximum length: 1500 characters.<br>When using video effect parameters (i.e., template is not empty), the prompt parameter is invalid and does not need to be filled.<br>Example: A little cat running on the grass. |
| input.negative_prompt | string | - | Negative prompt, used to describe content that should not appear in the video, which can restrict the video content.<br>Maximum length: 500 characters, excess parts will be automatically truncated.<br>Example: Low resolution, errors, worst quality, low quality, incomplete, extra fingers, bad proportions, etc. |
| input.audio_url | string | - | Supported models: wan2.6-i2v, wan2.5-i2v-preview.<br>URL of the audio file. The model will use this audio to generate the video.<br>Supports HTTP or HTTPS protocols. Local files can obtain temporary URLs by uploading files.<br>Audio restrictions:<br>- Format: wav, mp3.<br>- Duration: 3-30s.<br>- File size: not exceeding 15MB.<br>- Over-limit handling: If the audio length exceeds the duration value (5 seconds or 10 seconds), automatically take the first 5 seconds or 10 seconds, and discard the rest. If the audio length is less than the video duration, the part beyond the audio length will be silent video. For example, if the audio is 3 seconds and the video duration is 5 seconds, the output video will have sound for the first 3 seconds and be silent for the last 2 seconds.<br>Example: `https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3`. |
| parameters | object | - | Video processing parameters, such as setting video resolution, duration, enabling prompt intelligent rewriting, adding watermarks, etc. |
| parameters.size | string | 1920*1080 (1080P) | Specify the generated video resolution, formatted as width*height. The default value and available enum values of this parameter depend on the model parameter, with the following rules:<br>- wan2.6-t2v: Default value is 1920*1080 (1080P). Optional resolutions: All resolutions corresponding to 720P and 1080P.<br>- wan2.5-t2v-preview: Default value is 1920*1080 (1080P). Optional resolutions: All resolutions corresponding to 480P, 720P, and 1080P.<br>480P tier: Optional video resolutions and their corresponding video aspect ratios:<br>- 832*480: 16:9<br>- 480*832: 9:16<br>- 624*624: 1:1<br>720P tier: Optional video resolutions and their corresponding video aspect ratios:<br>- 1280*720: 16:9<br>- 720*1280: 9:16<br>- 960*960: 1:1<br>- 1088*832: 4:3<br>- 832*1088: 3:4<br>1080P tier: Optional video resolutions and their corresponding video aspect ratios:<br>- 1920*1080: 16:9<br>- 1080*1920: 9:16<br>- 1440*1440: 1:1<br>- 1632*1248: 4:3<br>- 1248*1632: 3:4 |
| parameters.duration | integer | 5 | Duration of the generated video, in seconds. The value of this parameter depends on the model parameter:<br>- wan2.6-t2v: Optional values are 5, 10, 15. Default value is 5.<br>- wan2.5-t2v-preview: Optional values are 5, 10. Default value is 5.<br>Example: 5 |
| parameters.prompt_extend | boolean | true | Whether to enable prompt intelligent rewriting. When enabled, use a large model to intelligently rewrite the input prompt. This significantly improves the generation effect for shorter prompts, but will increase processing time.<br>- true: Default value, enable intelligent rewriting.<br>- false: Do not enable intelligent rewriting.<br>Example: true |
| parameters.shot_type | string | single | Supported models: wan2.6-t2v.<br>Specify the shot type of the generated video, i.e., whether the video consists of one continuous shot or multiple switching shots.<br>Effective condition: Only takes effect when "prompt_extend": true.<br>Parameter priority: shot_type > prompt. For example, if shot_type is set to "single", even if the prompt contains "generate multi-shot video", the model will still output a single-shot video.<br>Optional values:<br>- single: Default value, output single-shot video<br>- multi: Output multi-shot video.<br>Example: single |
| parameters.watermark | boolean | false | Whether to add a watermark identifier. The watermark is located in the lower right corner of the video, and the text is fixed as "AI生成".<br>- false: Default value, do not add watermark.<br>- true: Add watermark.<br>Example: false |
| parameters.seed | integer | - | Random seed, value range is [0, 2147483647].<br>When not specified, the system automatically generates a random seed. If you need to improve the reproducibility of generation results, it is recommended to fix the seed value.<br>Please note that due to the probabilistic nature of model generation, even using the same seed cannot guarantee completely consistent generation results each time.<br>Example: 12345 |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
--header 'X-DashScope-Async: enable' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "wan2.5-t2v-preview",
    "input": {
        "prompt": "Shot from a low angle, in a medium close-up, with warm tones, mixed lighting (the practical light from the desk lamp blends with the overcast light from the window), side lighting, and a central composition. In a classic detective office, wooden bookshelves are filled with old case files and ashtrays. A green desk lamp illuminates a case file spread out in the center of the desk. A fox, wearing a dark brown trench coat and a light gray fedora, sits in a leather chair, its fur crimson, its tail resting lightly on the edge, its fingers slowly turning yellowed pages.",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250929/stjqnq/%E7%8B%90%E7%8B%B8.mp3"
    },
    "parameters": {
        "size": "1280*720",
        "prompt_extend": true,
        "duration": 10
    }
}'
```

### Response

The response contains the generated video task information.

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| output | object | Task output information |
| output.task_id | string | Task ID. Query validity period is 24 hours. |
| output.task_status | string | Task status.<br>Enum values:<br>- `PENDING`: Task queued<br>- `RUNNING`: Task processing<br>- `SUCCEEDED`: Task execution successful<br>- `FAILED`: Task execution failed<br>- `CANCELED`: Task canceled<br>- `UNKNOWN`: Task does not exist or status unknown |
| request_id | string | Request ID for tracking |

### Response Example

```json
{
  "output": {
    "task_id": "M************************************==",
    "task_status": "PENDING"
  },
  "request_id": "2d081967-5e3b-9d92-80da-dbd0f0488b87"
}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
--header 'X-DashScope-Async: enable' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "wan2.5-t2v-preview",
    "input": {
        "prompt": "Shot from a low angle, in a medium close-up, with warm tones, mixed lighting (the practical light from the desk lamp blends with the overcast light from the window), side lighting, and a central composition. In a classic detective office, wooden bookshelves are filled with old case files and ashtrays. A green desk lamp illuminates a case file spread out in the center of the desk. A fox, wearing a dark brown trench coat and a light gray fedora, sits in a leather chair, its fur crimson, its tail resting lightly on the edge, its fingers slowly turning yellowed pages.",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250929/stjqnq/%E7%8B%90%E7%8B%B8.mp3"
    },
    "parameters": {
        "size": "1280*720",
        "prompt_extend": true,
        "duration": 10
    }
}'
```

**Response Example**

```json
{
  "output": {
    "task_id": "M************************************==",
    "task_status": "PENDING"
  },
  "request_id": "2d081967-5e3b-9d92-80da-dbd0f0488b87"
}
```

---

## AliCloud / wan2.5-preview / Image-to-Video `POST`

_Official Format_

### Image-to-Video

AliCloud AI platform providing access to Wan video generation models.

`POST https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis`

### Overview

This endpoint provides image-to-video generation functionality. Generate high-quality video content from image input with text prompts, supporting various resolutions, durations, and advanced features like prompt enhancement, multi-shot narratives, and audio synchronization. The API supports asynchronous processing and returns a task ID that can be used to query the generation status and retrieve the final video.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Content-Type | string | - | required<br>Request content type. This parameter must be set to `application/json`. |
| Authorization | string | - | required<br>Request authentication. The API uses cloudwise-maas API-Key for authentication. Example: `Bearer ak-xxxx`. |
| X-DashScope-Async | string | - | required<br>Asynchronous processing configuration parameter. HTTP requests only support asynchronous mode, must be set to `enable`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Model name.<br>Example: `wan2.5-t2v-preview` \| `wan2.5-i2v-preview` |
| input | object | - | required<br>Basic input information, such as prompts. |
| input.prompt | string | - | Text prompt. Used to describe the elements and visual characteristics expected in the generated video.<br>Each character counts as one character, excess parts will be automatically truncated. Maximum length: 1500 characters.<br>When using video effect parameters (i.e., template is not empty), the prompt parameter is invalid and does not need to be filled.<br>Example: A little cat running on the grass. |
| input.negative_prompt | string | - | Negative prompt, used to describe content that should not appear in the video, which can restrict the video content.<br>Maximum length: 500 characters, excess parts will be automatically truncated.<br>Example: Low resolution, errors, worst quality, low quality, incomplete, extra fingers, bad proportions, etc. |
| input.img_url | string | - | required<br>URL or Base64 encoded data of the first frame image.<br>Image restrictions:<br>- Image formats: JPEG, JPG, PNG (transparency channel not supported), BMP, WEBP.<br>- Image resolution: Image width and height range [360, 2000], unit: pixels.<br>- File size: Not exceeding 10MB.<br>Input image instructions:<br>1. Use publicly accessible URL<br>- Supports HTTP or HTTPS protocols. Local files can obtain temporary URLs by uploading files.<br>- Example: `https://cdn.translate.alibaba.com/r/wanx-demo-1.png`.<br>2. Pass Base64 encoded image string<br>- Data format: `data:{MIME_type};base64,{base64_data}`.<br>- Example: `data:image/png;base64,GDU7MtCZzEbTbmRZ......` (encoding string is too long, only showing a fragment). |
| input.audio_url | string | - | Supported models: wan2.6-i2v, wan2.5-i2v-preview.<br>URL of the audio file. The model will use this audio to generate the video.<br>Supports HTTP or HTTPS protocols. Local files can obtain temporary URLs by uploading files.<br>Audio restrictions:<br>- Format: wav, mp3.<br>- Duration: 3-30s.<br>- File size: not exceeding 15MB.<br>- Over-limit handling: If the audio length exceeds the duration value (5 seconds or 10 seconds), automatically take the first 5 seconds or 10 seconds, and discard the rest. If the audio length is less than the video duration, the part beyond the audio length will be silent video. For example, if the audio is 3 seconds and the video duration is 5 seconds, the output video will have sound for the first 3 seconds and be silent for the last 2 seconds.<br>Example: `https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3`. |
| parameters | object | - | Video processing parameters, such as setting video resolution, duration, enabling prompt intelligent rewriting, adding watermarks, etc. |
| parameters.resolution | string | 1080P | Specify the generated video resolution tier, used to adjust the clarity of the video (total pixels). The model automatically scales to similar total pixels based on the selected resolution tier, and the video aspect ratio will try to match the aspect ratio of the input image img_url. The default value and available enum values of this parameter depend on the model parameter, with the following rules:<br>- wan2.6-i2v: Optional values: 720P, 1080P. Default value is 1080P.<br>- wan2.5-i2v-preview: Optional values: 480P, 720P, 1080P. Default value is 1080P.<br>Example: 1080P |
| parameters.duration | integer | 5 | Duration of the generated video, in seconds. The value of this parameter depends on the model parameter:<br>- wan2.6-i2v: Optional values are 5, 10, 15. Default value is 5.<br>- wan2.5-i2v-preview: Optional values are 5, 10. Default value is 5.<br>Example: 5 |
| parameters.prompt_extend | boolean | true | Whether to enable prompt intelligent rewriting. When enabled, use a large model to intelligently rewrite the input prompt. This significantly improves the generation effect for shorter prompts, but will increase processing time.<br>- true: Default value, enable intelligent rewriting.<br>- false: Do not enable intelligent rewriting.<br>Example: true |
| parameters.shot_type | string | single | Supported models: wan2.6-i2v.<br>Specify the shot type of the generated video, i.e., whether the video consists of one continuous shot or multiple switching shots.<br>Effective condition: Only takes effect when "prompt_extend": true.<br>Parameter priority: shot_type > prompt. For example, if shot_type is set to "single", even if the prompt contains "generate multi-shot video", the model will still output a single-shot video.<br>Optional values:<br>- single: Default value, output single-shot video<br>- multi: Output multi-shot video.<br>Example: single |
| parameters.watermark | boolean | false | Whether to add a watermark identifier. The watermark is located in the lower right corner of the video, and the text is fixed as "AI生成".<br>- false: Default value, do not add watermark.<br>- true: Add watermark.<br>Example: false |
| parameters.seed | integer | - | Random seed, value range is [0, 2147483647].<br>When not specified, the system automatically generates a random seed. If you need to improve the reproducibility of generation results, it is recommended to fix the seed value.<br>Please note that due to the probabilistic nature of model generation, even using the same seed cannot guarantee completely consistent generation results each time.<br>Example: 12345 |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
--header 'X-DashScope-Async: enable' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "wan2.5-i2v-preview",
    "input": {
        "prompt": "Shot from a low angle, in a medium close-up, with warm tones, mixed lighting (the practical light from the desk lamp blends with the overcast light from the window), side lighting, and a central composition. In a classic detective office, wooden bookshelves are filled with old case files and ashtrays.",
        "img_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/wpimhv/rap.png",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250929/stjqnq/%E7%8B%90%E7%8B%B8.mp3"
    },
    "parameters": {
        "resolution": "720P",
        "prompt_extend": true,
        "duration": 10
    }
}'
```

### Response

The response contains the generated video task information.

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| output | object | Task output information |
| output.task_id | string | Task ID. Query validity period is 24 hours. |
| output.task_status | string | Task status.<br>Enum values:<br>- `PENDING`: Task queued<br>- `RUNNING`: Task processing<br>- `SUCCEEDED`: Task execution successful<br>- `FAILED`: Task execution failed<br>- `CANCELED`: Task canceled<br>- `UNKNOWN`: Task does not exist or status unknown |
| request_id | string | Request ID for tracking |

### Response Example

```json
{
  "output": {
    "task_id": "M************************************==",
    "task_status": "PENDING"
  },
  "request_id": "2d081967-5e3b-9d92-80da-dbd0f0488b87"
}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
--header 'X-DashScope-Async: enable' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "wan2.5-i2v-preview",
    "input": {
        "prompt": "Shot from a low angle, in a medium close-up, with warm tones, mixed lighting (the practical light from the desk lamp blends with the overcast light from the window), side lighting, and a central composition. In a classic detective office, wooden bookshelves are filled with old case files and ashtrays.",
        "img_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/wpimhv/rap.png",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250929/stjqnq/%E7%8B%90%E7%8B%B8.mp3"
    },
    "parameters": {
        "resolution": "720P",
        "prompt_extend": true,
        "duration": 10
    }
}'
```

**Response Example**

```json
{
  "output": {
    "task_id": "M************************************==",
    "task_status": "PENDING"
  },
  "request_id": "2d081967-5e3b-9d92-80da-dbd0f0488b87"
}
```

---

## AliCloud / wan2.5-preview / Retrieve video `GET`

_Official Format_

### Retrieve video

AliCloud AI platform providing access to Wan video generation models.

`GET https://api.cloudwise.ai/api/v1/tasks/{task_id}`

### Overview

Query task status and retrieve results.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string | - | required<br>The task ID to query (for Query a Task) |
| page | integer | 1 | Page number for pagination (for Query a list of Tasks) |
| page_size | integer | 10 | Number of items per page (for Query a list of Tasks) |

### Request Example

```bash
curl -X GET 'https://api.cloudwise.ai/api/v1/tasks/{task_id}' \
--header 'X-DashScope-Async: enable' \
--header 'Authorization: Bearer $YOUR_API_KEY'
```

### Response

The response contains task status and results.

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| task_id | string | Unique identifier for the task |
| status | string | Task status: pending, processing, completed, failed |
| video_url | string | URL of the generated video (when status is completed) |

### Response Example

```json
{
  "code": "10000",
  "data": {
    "output": {
      "task_status": "SUCCEEDED",
      "orig_prompt": "Shot from a low angle, in a medium close-up, with warm tones...",
      "video_url": "https://download.cloudwise.ai/arts/1459964678842089472",
      "submit_time": "2026-01-11 17:38:24.400",
      "end_time": "2026-01-11 17:41:01.748",
      "task_id": "MT**************************==",
      "scheduled_time": "2026-01-11 17:38:24.420"
    },
    "usage": {
      "duration": 10,
      "size": "1280*720",
      "input_video_duration": 0,
      "output_video_duration": 10,
      "video_count": 1,
      "SR": 720
    },
    "request_id": "edce6264-f92e-90e8-9230-ee116f847041"
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

**Request Example**

```bash
curl -X GET 'https://api.cloudwise.ai/api/v1/tasks/{task_id}' \
--header 'X-DashScope-Async: enable' \
--header 'Authorization: Bearer $YOUR_API_KEY'
```

**Response Example**

```json
{
  "code": "10000",
  "data": {
    "output": {
      "task_status": "SUCCEEDED",
      "orig_prompt": "Shot from a low angle, in a medium close-up, with warm tones...",
      "video_url": "https://download.cloudwise.ai/arts/1459964678842089472",
      "submit_time": "2026-01-11 17:38:24.400",
      "end_time": "2026-01-11 17:41:01.748",
      "task_id": "MT**************************==",
      "scheduled_time": "2026-01-11 17:38:24.420"
    },
    "usage": {
      "duration": 10,
      "size": "1280*720",
      "input_video_duration": 0,
      "output_video_duration": 10,
      "video_count": 1,
      "SR": 720
    },
    "request_id": "edce6264-f92e-90e8-9230-ee116f847041"
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

---

## AliCloud / wan2.6 / Text-to-Video `POST`

_Official Format_

### Text-to-Video

AliCloud AI platform providing access to Wan video generation models.

`POST https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis`

### Overview

This endpoint provides text-to-video generation functionality. Generate high-quality video content from text prompts with support for various resolutions, durations, and advanced features like prompt enhancement, multi-shot narratives, and audio synchronization. The API supports asynchronous processing and returns a task ID that can be used to query the generation status and retrieve the final video.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Content-Type | string | - | required<br>Request content type. This parameter must be set to `application/json`. |
| Authorization | string | - | required<br>Request authentication. The API uses cloudwise-maas API-Key for authentication. Example: `Bearer ak-xxxx`. |
| X-DashScope-Async | string | - | required<br>Asynchronous processing configuration parameter. HTTP requests only support asynchronous mode, must be set to `enable`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Model name.<br>Example: `wan2.6-t2v` |
| input | object | - | required<br>Basic input information, such as prompts. |
| input.prompt | string | - | Text prompt. Used to describe the elements and visual characteristics expected in the generated video.<br>Each character counts as one character, excess parts will be automatically truncated. Maximum length: 1500 characters.<br>When using video effect parameters (i.e., template is not empty), the prompt parameter is invalid and does not need to be filled.<br>Example: A little cat running on the grass. |
| input.negative_prompt | string | - | Negative prompt, used to describe content that should not appear in the video, which can restrict the video content.<br>Maximum length: 500 characters, excess parts will be automatically truncated.<br>Example: Low resolution, errors, worst quality, low quality, incomplete, extra fingers, bad proportions, etc. |
| input.audio_url | string | - | Supported models: wan2.6-i2v, wan2.5-i2v-preview.<br>URL of the audio file. The model will use this audio to generate the video.<br>Supports HTTP or HTTPS protocols. Local files can obtain temporary URLs by uploading files.<br>Audio restrictions:<br>- Format: wav, mp3.<br>- Duration: 3-30s.<br>- File size: not exceeding 15MB.<br>- Over-limit handling: If the audio length exceeds the duration value (5 seconds or 10 seconds), automatically take the first 5 seconds or 10 seconds, and discard the rest. If the audio length is less than the video duration, the part beyond the audio length will be silent video. For example, if the audio is 3 seconds and the video duration is 5 seconds, the output video will have sound for the first 3 seconds and be silent for the last 2 seconds.<br>Example: `https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3`. |
| parameters | object | - | Video processing parameters, such as setting video resolution, setting video duration, enabling prompt intelligent rewriting, adding watermarks, etc. |
| parameters.size | string | 1920*1080 (1080P) | Specify the generated video resolution, formatted as width*height. The default value and available enum values of this parameter depend on the model parameter, with the following rules:<br>- wan2.6-t2v: Default value is 1920*1080 (1080P). Optional resolutions: All resolutions corresponding to 720P and 1080P.<br>- wan2.5-t2v-preview: Default value is 1920*1080 (1080P). Optional resolutions: All resolutions corresponding to 480P, 720P, and 1080P.<br>480P tier: Optional video resolutions and their corresponding video aspect ratios:<br>- 832*480: 16:9<br>- 480*832: 9:16<br>- 624*624: 1:1<br>720P tier: Optional video resolutions and their corresponding video aspect ratios:<br>- 1280*720: 16:9<br>- 720*1280: 9:16<br>- 960*960: 1:1<br>- 1088*832: 4:3<br>- 832*1088: 3:4<br>1080P tier: Optional video resolutions and their corresponding video aspect ratios:<br>- 1920*1080: 16:9<br>- 1080*1920: 9:16<br>- 1440*1440: 1:1<br>- 1632*1248: 4:3<br>- 1248*1632: 3:4 |
| parameters.duration | integer | 5 | Duration of the generated video, in seconds. The value of this parameter depends on the model parameter:<br>- wan2.6-t2v: Optional values are 5, 10, 15. Default value is 5.<br>- wan2.5-t2v-preview: Optional values are 5, 10. Default value is 5.<br>Example: 5 |
| parameters.prompt_extend | boolean | true | Whether to enable prompt intelligent rewriting. When enabled, use a large model to intelligently rewrite the input prompt. This significantly improves the generation effect for shorter prompts, but will increase processing time.<br>- true: Default value, enable intelligent rewriting.<br>- false: Do not enable intelligent rewriting.<br>Example: true |
| parameters.shot_type | string | single | Supported models: wan2.6-t2v.<br>Specify the shot type of the generated video, i.e., whether the video consists of one continuous shot or multiple switching shots.<br>Effective condition: Only takes effect when "prompt_extend": true.<br>Parameter priority: shot_type > prompt. For example, if shot_type is set to "single", even if the prompt contains "generate multi-shot video", the model will still output a single-shot video.<br>Optional values:<br>- single: Default value, output single-shot video<br>- multi: Output multi-shot video.<br>Example: single |
| parameters.watermark | boolean | false | Whether to add a watermark identifier. The watermark is located in the lower right corner of the video, and the text is fixed as "AI生成".<br>- false: Default value, do not add watermark.<br>- true: Add watermark.<br>Example: false |
| parameters.seed | integer | - | Random seed, value range is [0, 2147483647].<br>When not specified, the system automatically generates a random seed. If you need to improve the reproducibility of generation results, it is recommended to fix the seed value.<br>Please note that due to the probabilistic nature of model generation, even using the same seed cannot guarantee completely consistent generation results each time.<br>Example: 12345 |

### Request Example

Multi-Shot Narrative

Audio File Input

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $YOUR_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.6-t2v",
    "input": {
        "prompt": "A scene of urban fantasy art. A dynamic graffiti art character. A teenager, painted with spray paint, comes to life from a concrete wall. He raps at breakneck speed in an English rap while striking a classic, energetic rapper pose. The scene is set at night under a quaint urban railway bridge. Light comes from a lone streetlamp, creating a cinematic atmosphere, full of high energy and stunning detail. The audio of the video consists entirely of his rap, with no other dialogue or background noise."
    },
    "parameters": {
        "size": "1280*720",
        "prompt_extend": true,
        "duration": 10,
        "shot_type":"multi"
    }
}'
```

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $YOUR_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.6-t2v",
    "input": {
        "prompt": "A scene of urban fantasy art. A dynamic graffiti art character. A teenager, painted with spray paint, comes to life from a concrete wall. He raps at breakneck speed in an English rap while striking a classic, energetic rapper pose. The scene is set at night under a quaint urban railway bridge. Light comes from a lone streetlamp, creating a cinematic atmosphere, full of high energy and stunning detail. The audio of the video consists entirely of his rap, with no other dialogue or background noise.",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3"
    },
    "parameters": {
        "size": "1280*720",
        "prompt_extend": true,
        "duration": 10
    }
}'
```

### Response

The response contains the generated video task information.

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| output | object | Task output information |
| output.task_id | string | Task ID. Query validity period is 24 hours. |
| output.task_status | string | Task status.<br>Enum values:<br>- `PENDING`: Task queued<br>- `RUNNING`: Task processing<br>- `SUCCEEDED`: Task execution successful<br>- `FAILED`: Task execution failed<br>- `CANCELED`: Task canceled<br>- `UNKNOWN`: Task does not exist or status unknown |
| request_id | string | Request ID for tracking |

### Response Example

```json
{
  "output": {
    "task_id": "M************************************==",
    "task_status": "PENDING"
  },
  "request_id": "2d081967-5e3b-9d92-80da-dbd0f0488b87"
}
```

**Request Example (Multi-Shot Narrative)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $YOUR_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.6-t2v",
    "input": {
        "prompt": "A scene of urban fantasy art. A dynamic graffiti art character. A teenager, painted with spray paint, comes to life from a concrete wall. He raps at breakneck speed in an English rap while striking a classic, energetic rapper pose. The scene is set at night under a quaint urban railway bridge. Light comes from a lone streetlamp, creating a cinematic atmosphere, full of high energy and stunning detail. The audio of the video consists entirely of his rap, with no other dialogue or background noise."
    },
    "parameters": {
        "size": "1280*720",
        "prompt_extend": true,
        "duration": 10,
        "shot_type":"multi"
    }
}'
```

**Request Example (Audio File Input)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $YOUR_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.6-t2v",
    "input": {
        "prompt": "A scene of urban fantasy art. A dynamic graffiti art character. A teenager, painted with spray paint, comes to life from a concrete wall. He raps at breakneck speed in an English rap while striking a classic, energetic rapper pose. The scene is set at night under a quaint urban railway bridge. Light comes from a lone streetlamp, creating a cinematic atmosphere, full of high energy and stunning detail. The audio of the video consists entirely of his rap, with no other dialogue or background noise.",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3"
    },
    "parameters": {
        "size": "1280*720",
        "prompt_extend": true,
        "duration": 10
    }
}'
```

**Response Example**

```json
{
  "output": {
    "task_id": "M************************************==",
    "task_status": "PENDING"
  },
  "request_id": "2d081967-5e3b-9d92-80da-dbd0f0488b87"
}
```

---

## AliCloud / wan2.6 / Image-to-Video `POST`

_Official Format_

### Image-to-Video

AliCloud AI platform providing access to Wan video generation models.

`POST https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis`

### Overview

This endpoint provides image-to-video generation functionality. Generate high-quality video content from image input with text prompts, supporting various resolutions, durations, and advanced features like prompt enhancement, multi-shot narratives, and audio synchronization. The API supports asynchronous processing and returns a task ID that can be used to query the generation status and retrieve the final video.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Content-Type | string | - | required<br>Request content type. This parameter must be set to `application/json`. |
| Authorization | string | - | required<br>Request authentication. The API uses cloudwise-maas API-Key for authentication. Example: `Bearer ak-xxxx`. |
| X-DashScope-Async | string | - | required<br>Asynchronous processing configuration parameter. HTTP requests only support asynchronous mode, must be set to `enable`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Model name.<br>Example: `wan2.5-t2v-preview` \| `wan2.5-i2v-preview` |
| input | object | - | required<br>Basic input information, such as prompts. |
| input.prompt | string | - | Text prompt. Used to describe the elements and visual characteristics expected in the generated video.<br>Each character counts as one character, excess parts will be automatically truncated. Maximum length: 1500 characters.<br>When using video effect parameters (i.e., template is not empty), the prompt parameter is invalid and does not need to be filled.<br>Example: A little cat running on the grass. |
| input.negative_prompt | string | - | Negative prompt, used to describe content that should not appear in the video, which can restrict the video content.<br>Maximum length: 500 characters, excess parts will be automatically truncated.<br>Example: Low resolution, errors, worst quality, low quality, incomplete, extra fingers, bad proportions, etc. |
| input.img_url | string | - | required<br>URL or Base64 encoded data of the first frame image.<br>Image restrictions:<br>- Image formats: JPEG, JPG, PNG (transparency channel not supported), BMP, WEBP.<br>- Image resolution: Image width and height range [360, 2000], unit: pixels.<br>- File size: Not exceeding 10MB.<br>Input image instructions:<br>1. Use publicly accessible URL<br>- Supports HTTP or HTTPS protocols. Local files can obtain temporary URLs by uploading files.<br>- Example: `https://cdn.translate.alibaba.com/r/wanx-demo-1.png`.<br>2. Pass Base64 encoded image string<br>- Data format: `data:{MIME_type};base64,{base64_data}`.<br>- Example: `data:image/png;base64,GDU7MtCZzEbTbmRZ......` (encoding string is too long, only showing a fragment). |
| input.audio_url | string | - | Supported models: wan2.6-i2v, wan2.5-i2v-preview.<br>URL of the audio file. The model will use this audio to generate the video.<br>Supports HTTP or HTTPS protocols. Local files can obtain temporary URLs by uploading files.<br>Audio restrictions:<br>- Format: wav, mp3.<br>- Duration: 3-30s.<br>- File size: not exceeding 15MB.<br>- Over-limit handling: If the audio length exceeds the duration value (5 seconds or 10 seconds), automatically take the first 5 seconds or 10 seconds, and discard the rest. If the audio length is less than the video duration, the part beyond the audio length will be silent video. For example, if the audio is 3 seconds and the video duration is 5 seconds, the output video will have sound for the first 3 seconds and be silent for the last 2 seconds.<br>Example: `https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3`. |
| parameters | object | - | Video processing parameters, such as setting video resolution, duration, enabling prompt intelligent rewriting, adding watermarks, etc. |
| parameters.resolution | string | 1080P | Specify the generated video resolution tier, used to adjust the clarity of the video (total pixels). The model automatically scales to similar total pixels based on the selected resolution tier, and the video aspect ratio will try to match the aspect ratio of the input image img_url. The default value and available enum values of this parameter depend on the model parameter, with the following rules:<br>- wan2.6-i2v: Optional values: 720P, 1080P. Default value is 1080P.<br>- wan2.5-i2v-preview: Optional values: 480P, 720P, 1080P. Default value is 1080P.<br>Example: 1080P |
| parameters.duration | integer | 5 | Duration of the generated video, in seconds. The value of this parameter depends on the model parameter:<br>- wan2.6-i2v: Optional values are 5, 10, 15. Default value is 5.<br>- wan2.5-i2v-preview: Optional values are 5, 10. Default value is 5.<br>Example: 5 |
| parameters.prompt_extend | boolean | true | Whether to enable prompt intelligent rewriting. When enabled, use a large model to intelligently rewrite the input prompt. This significantly improves the generation effect for shorter prompts, but will increase processing time.<br>- true: Default value, enable intelligent rewriting.<br>- false: Do not enable intelligent rewriting.<br>Example: true |
| parameters.shot_type | string | single | Supported models: wan2.6-i2v.<br>Specify the shot type of the generated video, i.e., whether the video consists of one continuous shot or multiple switching shots.<br>Effective condition: Only takes effect when "prompt_extend": true.<br>Parameter priority: shot_type > prompt. For example, if shot_type is set to "single", even if the prompt contains "generate multi-shot video", the model will still output a single-shot video.<br>Optional values:<br>- single: Default value, output single-shot video<br>- multi: Output multi-shot video.<br>Example: single |
| parameters.watermark | boolean | false | Whether to add a watermark identifier. The watermark is located in the lower right corner of the video, and the text is fixed as "AI生成".<br>- false: Default value, do not add watermark.<br>- true: Add watermark.<br>Example: false |
| parameters.seed | integer | - | Random seed, value range is [0, 2147483647].<br>When not specified, the system automatically generates a random seed. If you need to improve the reproducibility of generation results, it is recommended to fix the seed value.<br>Please note that due to the probabilistic nature of model generation, even using the same seed cannot guarantee completely consistent generation results each time.<br>Example: 12345 |

### Request Example

Multi-Shot Narrative

Audio File Input

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $YOUR_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.6-i2v",
    "input": {
        "prompt": "A scene of urban fantasy art. A dynamic graffiti art character. A teenager, painted with spray paint, comes to life from a concrete wall. He raps at breakneck speed in an English rap while striking a classic, energetic rapper pose. The scene is set at night under a quaint urban railway bridge. Light comes from a lone streetlamp, creating a cinematic atmosphere, full of high energy and stunning detail. The audio of the video consists entirely of his rap, with no other dialogue or background noise.",
        "img_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/wpimhv/rap.png"
    },
    "parameters": {
        "resolution": "720P",
        "prompt_extend": true,
        "duration": 10,
        "shot_type":"multi"
    }
}'
```

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $YOUR_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.6-i2v",
    "input": {
        "prompt": "A scene of urban fantasy art. A dynamic graffiti art character. A teenager, painted with spray paint, comes to life from a concrete wall. He raps at breakneck speed in an English rap while striking a classic, energetic rapper pose. The scene is set at night under a quaint urban railway bridge. Light comes from a lone streetlamp, creating a cinematic atmosphere, full of high energy and stunning detail. The audio of the video consists entirely of his rap, with no other dialogue or background noise.",
        "img_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/wpimhv/rap.png",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3"
    },
    "parameters": {
        "resolution": "720P",
        "prompt_extend": true,
        "duration": 10
    }
}'
```

### Response

The response contains the generated video task information.

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| output | object | Task output information |
| output.task_id | string | Task ID. Query validity period is 24 hours. |
| output.task_status | string | Task status.<br>Enum values:<br>- `PENDING`: Task queued<br>- `RUNNING`: Task processing<br>- `SUCCEEDED`: Task execution successful<br>- `FAILED`: Task execution failed<br>- `CANCELED`: Task canceled<br>- `UNKNOWN`: Task does not exist or status unknown |
| request_id | string | Request ID for tracking |

### Response Example

```json
{
  "output": {
    "task_id": "M************************************==",
    "task_status": "PENDING"
  },
  "request_id": "2d081967-5e3b-9d92-80da-dbd0f0488b87"
}
```

**Request Example (Multi-Shot Narrative)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $YOUR_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.6-i2v",
    "input": {
        "prompt": "A scene of urban fantasy art. A dynamic graffiti art character. A teenager, painted with spray paint, comes to life from a concrete wall. He raps at breakneck speed in an English rap while striking a classic, energetic rapper pose. The scene is set at night under a quaint urban railway bridge. Light comes from a lone streetlamp, creating a cinematic atmosphere, full of high energy and stunning detail. The audio of the video consists entirely of his rap, with no other dialogue or background noise.",
        "img_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/wpimhv/rap.png"
    },
    "parameters": {
        "resolution": "720P",
        "prompt_extend": true,
        "duration": 10,
        "shot_type":"multi"
    }
}'
```

**Request Example (Audio File Input)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $YOUR_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.6-i2v",
    "input": {
        "prompt": "A scene of urban fantasy art. A dynamic graffiti art character. A teenager, painted with spray paint, comes to life from a concrete wall. He raps at breakneck speed in an English rap while striking a classic, energetic rapper pose. The scene is set at night under a quaint urban railway bridge. Light comes from a lone streetlamp, creating a cinematic atmosphere, full of high energy and stunning detail. The audio of the video consists entirely of his rap, with no other dialogue or background noise.",
        "img_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/wpimhv/rap.png",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3"
    },
    "parameters": {
        "resolution": "720P",
        "prompt_extend": true,
        "duration": 10
    }
}'
```

**Response Example**

```json
{
  "output": {
    "task_id": "M************************************==",
    "task_status": "PENDING"
  },
  "request_id": "2d081967-5e3b-9d92-80da-dbd0f0488b87"
}
```

---

## AliCloud / wan2.6 / Retrieve video `GET`

_Official Format_

### Retrieve video

AliCloud AI platform providing access to Wan video generation models.

`GET https://api.cloudwise.ai/api/v1/tasks/{task_id}`

### Overview

Query task status and retrieve results.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string | - | required<br>The task ID to query (for Query a Task) |
| page | integer | 1 | Page number for pagination (for Query a list of Tasks) |
| page_size | integer | 10 | Number of items per page (for Query a list of Tasks) |

### Request Example

```bash
curl -X GET 'https://api.cloudwise.ai/api/v1/tasks/{task_id}' \
--header 'X-DashScope-Async: enable' \
--header 'Authorization: Bearer $YOUR_API_KEY'
```

### Response

The response contains task status and results.

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| task_id | string | Unique identifier for the task |
| status | string | Task status: pending, processing, completed, failed |
| video_url | string | URL of the generated video (when status is completed) |

### Response Example

```json
{
  "code": "10000",
  "data": {
    "output": {
      "task_status": "SUCCEEDED",
      "orig_prompt": "A scene of urban fantasy art. A dynamic graffiti art character...",
      "video_url": "https://download.cloudwise.ai/arts/1459964678842089472",
      "submit_time": "2026-01-11 17:38:24.400",
      "end_time": "2026-01-11 17:41:01.748",
      "task_id": "MT**************************==",
      "scheduled_time": "2026-01-11 17:38:24.420"
    },
    "usage": {
      "duration": 10,
      "size": "1280*720",
      "input_video_duration": 0,
      "output_video_duration": 10,
      "video_count": 1,
      "SR": 720
    },
    "request_id": "edce6264-f92e-90e8-9230-ee116f847041"
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

**Request Example**

```bash
curl -X GET 'https://api.cloudwise.ai/api/v1/tasks/{task_id}' \
--header 'X-DashScope-Async: enable' \
--header 'Authorization: Bearer $YOUR_API_KEY'
```

**Response Example**

```json
{
  "code": "10000",
  "data": {
    "output": {
      "task_status": "SUCCEEDED",
      "orig_prompt": "A scene of urban fantasy art. A dynamic graffiti art character...",
      "video_url": "https://download.cloudwise.ai/arts/1459964678842089472",
      "submit_time": "2026-01-11 17:38:24.400",
      "end_time": "2026-01-11 17:41:01.748",
      "task_id": "MT**************************==",
      "scheduled_time": "2026-01-11 17:38:24.420"
    },
    "usage": {
      "duration": 10,
      "size": "1280*720",
      "input_video_duration": 0,
      "output_video_duration": 10,
      "video_count": 1,
      "SR": 720
    },
    "request_id": "edce6264-f92e-90e8-9230-ee116f847041"
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

---

## AliCloud / wan3.0 / Generate video `POST`

_Official Format_

### Generate video

Generate or edit video with the Wan3.0 all-in-one multimodal API.

`POST https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis`

### Supported Models

| Model | Released | Positioning |
| --- | --- | --- |
| `wan3.0-video` | 2026-08-06 | Standard model. |
| `wan3.0-video-prime` | 2026-08-20 | Faster model with capabilities aligned with the standard model. |

### Overview

Both Wan3.0 model IDs use this API. They support text, image, video, audio, file, and public webpage inputs through one request contract. The task type is inferred from `input.media[].type` and the prompt, covering text-to-video, first-frame and first-and-last-frame generation, multimodal reference generation, video editing, and video extension.

Requests are asynchronous. Save the returned `task_id` and query it with the Retrieve video endpoint. The task ID remains queryable for 24 hours.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Content-Type | string | application/json | required<br>Must be `application/json`. |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer $YOUR_API_KEY`. |
| X-DashScope-Async | string | - | required<br>Must be set to `enable`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Model ID. Use `wan3.0-video` for the standard model or `wan3.0-video-prime` for the faster model. Both models use the same request schema and support the same task types. |
| input | object | - | required<br>Input definition. At least one of `input.prompt` or `input.media` must be provided. |
| input.prompt | string | - | Conditional. Text describing the desired video or edit. Supports Chinese and English, up to 20,000 characters. Reference media can be addressed by order, such as image 1, video 1, and audio 1. |
| input.media | array | - | Conditional. Media inputs. Each item contains `type` and `url`. The model routes the request according to the media types and prompt intent. |
| input.media[].type | string | - | Media type: `first_frame`, `last_frame`, `reference_image`, `reference_video`, `reference_audio`, `file`, or `link`. |
| input.media[].url | string | - | Public HTTP/HTTPS URL, supported OSS URL, or Base64 data for image inputs. Availability and size limits depend on the selected media type. |
| parameters | object | - | Optional video generation settings. |
| parameters.resolution | string | 1080P | Output resolution tier: `480P`, `720P`, or `1080P`. |
| parameters.ratio | string | adaptive | Output aspect ratio: `adaptive`, `16:9`, `4:3`, `1:1`, `3:4`, or `9:16`. Video extension requires `adaptive`. |
| parameters.duration | integer | 5 | Output duration in seconds. Without video input, use an integer from 2 through 30. With video input, input and output duration combined must not exceed 30 seconds. Use `-1` for automatic duration selection. |
| parameters.audio | boolean | true | Whether the generated video contains an audio track. |
| parameters.seed | integer | -1 | Random seed. Use `-1` or omit the field for a random value; otherwise use a value from 0 through 2147483647. |
| parameters.prompt_extend | boolean | true | Enables intelligent prompt rewriting. This can improve short prompts but adds latency. |
| parameters.watermark | boolean | false | Whether to add a watermark to the generated video. |

### Media Combination Rules

- `first_frame` and `last_frame` cannot be mixed with reference media, files, or links.
- `file` and `link` are mutually exclusive. Either can be combined with reference images, videos, and audio.
- `reference_image`, `reference_video`, and `reference_audio` can be combined freely.
- Limits: one first frame, one last frame, up to 10 reference images, up to five reference videos totaling 15 seconds, and up to five reference audio files totaling 15 seconds.

### Request Examples

Text-to-Video

Prime

First Frame

First + Last Frame

Reference Media

Video Editing

Video Extension

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "input": {
    "prompt": "A small cat runs across a moonlit rooftop while city neon lights glow in the distance. Cinematic lighting and smooth camera movement."
  },
  "parameters": {
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 5,
    "audio": true,
    "prompt_extend": true
  }
}'
```

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video-prime",
  "input": {
    "prompt": "A product commercial for a futuristic silver smartwatch, with precise lighting, controlled camera movement, and synchronized electronic music."
  },
  "parameters": {
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 10,
    "audio": true,
    "prompt_extend": true
  }
}'
```

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "input": {
    "prompt": "The cat runs forward through the grass as the camera follows at ground level.",
    "media": [
      {
        "type": "first_frame",
        "url": "https://example.com/images/cat-first-frame.png"
      }
    ]
  },
  "parameters": {
    "resolution": "720P",
    "ratio": "adaptive",
    "duration": 5,
    "prompt_extend": true
  }
}'
```

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "input": {
    "prompt": "A pumpkin slowly cracks open in the morning light and reveals a small white rabbit.",
    "media": [
      {
        "type": "first_frame",
        "url": "https://example.com/images/pumpkin-first-frame.png"
      },
      {
        "type": "last_frame",
        "url": "https://example.com/images/rabbit-last-frame.png"
      }
    ]
  },
  "parameters": {
    "resolution": "720P",
    "ratio": "adaptive",
    "duration": 5,
    "prompt_extend": true
  }
}'
```

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "input": {
    "prompt": "Use image 1 as the character, video 1 as the movement reference, and audio 1 as the soundtrack.",
    "media": [
      {
        "type": "reference_image",
        "url": "https://example.com/images/character.png"
      },
      {
        "type": "reference_video",
        "url": "https://example.com/videos/motion.mp4"
      },
      {
        "type": "reference_audio",
        "url": "https://example.com/audio/soundtrack.mp3"
      }
    ]
  },
  "parameters": {
    "resolution": "720P",
    "ratio": "adaptive",
    "duration": 10,
    "prompt_extend": true
  }
}'
```

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "input": {
    "prompt": "Convert the entire scene into a detailed clay animation style.",
    "media": [
      {
        "type": "reference_video",
        "url": "https://example.com/videos/source.mp4"
      }
    ]
  },
  "parameters": {
    "resolution": "720P",
    "prompt_extend": true
  }
}'
```

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "input": {
    "prompt": "Extend video 1 forward. The baker places the prepared bread in the oven while the camera follows.",
    "media": [
      {
        "type": "reference_video",
        "url": "https://example.com/videos/source.mp4"
      }
    ]
  },
  "parameters": {
    "resolution": "720P",
    "ratio": "adaptive",
    "prompt_extend": true
  }
}'
```

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| output.task_id | string | Task ID used to retrieve the result. |
| output.task_status | string | Initial task status. A successfully submitted task normally returns PENDING. |
| request_id | string | Unique request identifier for troubleshooting. |
| code | string | Error code returned only when the request fails. |
| message | string | Detailed error message returned only when the request fails. |

**Request Example (Text-to-Video)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "input": {
    "prompt": "A small cat runs across a moonlit rooftop while city neon lights glow in the distance. Cinematic lighting and smooth camera movement."
  },
  "parameters": {
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 5,
    "audio": true,
    "prompt_extend": true
  }
}'
```

**Request Example (Prime)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video-prime",
  "input": {
    "prompt": "A product commercial for a futuristic silver smartwatch, with precise lighting, controlled camera movement, and synchronized electronic music."
  },
  "parameters": {
    "resolution": "1080P",
    "ratio": "16:9",
    "duration": 10,
    "audio": true,
    "prompt_extend": true
  }
}'
```

**Request Example (First Frame)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "input": {
    "prompt": "The cat runs forward through the grass as the camera follows at ground level.",
    "media": [
      {
        "type": "first_frame",
        "url": "https://example.com/images/cat-first-frame.png"
      }
    ]
  },
  "parameters": {
    "resolution": "720P",
    "ratio": "adaptive",
    "duration": 5,
    "prompt_extend": true
  }
}'
```

**Request Example (First + Last Frame)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "input": {
    "prompt": "A pumpkin slowly cracks open in the morning light and reveals a small white rabbit.",
    "media": [
      {
        "type": "first_frame",
        "url": "https://example.com/images/pumpkin-first-frame.png"
      },
      {
        "type": "last_frame",
        "url": "https://example.com/images/rabbit-last-frame.png"
      }
    ]
  },
  "parameters": {
    "resolution": "720P",
    "ratio": "adaptive",
    "duration": 5,
    "prompt_extend": true
  }
}'
```

**Request Example (Reference Media)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "input": {
    "prompt": "Use image 1 as the character, video 1 as the movement reference, and audio 1 as the soundtrack.",
    "media": [
      {
        "type": "reference_image",
        "url": "https://example.com/images/character.png"
      },
      {
        "type": "reference_video",
        "url": "https://example.com/videos/motion.mp4"
      },
      {
        "type": "reference_audio",
        "url": "https://example.com/audio/soundtrack.mp3"
      }
    ]
  },
  "parameters": {
    "resolution": "720P",
    "ratio": "adaptive",
    "duration": 10,
    "prompt_extend": true
  }
}'
```

**Request Example (Video Editing)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "input": {
    "prompt": "Convert the entire scene into a detailed clay animation style.",
    "media": [
      {
        "type": "reference_video",
        "url": "https://example.com/videos/source.mp4"
      }
    ]
  },
  "parameters": {
    "resolution": "720P",
    "prompt_extend": true
  }
}'
```

**Request Example (Video Extension)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/services/aigc/video-generation/video-synthesis' \
  -H 'X-DashScope-Async: enable' \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
  "model": "wan3.0-video",
  "input": {
    "prompt": "Extend video 1 forward. The baker places the prepared bread in the oven while the camera follows.",
    "media": [
      {
        "type": "reference_video",
        "url": "https://example.com/videos/source.mp4"
      }
    ]
  },
  "parameters": {
    "resolution": "720P",
    "ratio": "adaptive",
    "prompt_extend": true
  }
}'
```

**Response Example**

```json
{
  "output": {
    "task_status": "PENDING",
    "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxxxxxxxx"
  },
  "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxxxxxxxx"
}
```

---

## AliCloud / wan3.0 / Retrieve video `GET`

_Official Format_

### Retrieve video

Query a Wan3.0 asynchronous task and retrieve the generated video.

`GET https://api.cloudwise.ai/api/v1/tasks/{task_id}`

### Overview

Use the task ID returned by the Generate video endpoint. Polling at an interval such as 15 seconds is recommended. Task IDs and successful result URLs remain available for 24 hours, so retrieve and persist outputs promptly.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer $YOUR_API_KEY`. |

### Path Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string | - | required<br>Task ID returned when the generation request was submitted. |

### Request Example

```bash
curl -X GET 'https://api.cloudwise.ai/api/v1/tasks/{task_id}' \
  -H "Authorization: Bearer $YOUR_API_KEY"
```

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| data.output.task_id | string | Unique task identifier. |
| data.output.task_status | string | PENDING, RUNNING, SUCCEEDED, FAILED, CANCELED, or UNKNOWN. |
| data.output.video_url | string | Generated video URL when the task succeeds. |
| data.output.code | string | Provider error code when the task fails. |
| data.output.message | string | Provider error message when the task fails. |
| data.usage | object | Output duration, input duration, frame rate, resolution, ratio, and video count. |
| data.request_id | string | Unique request identifier for troubleshooting. |

### Response Example

```json
{
  "code": "10000",
  "data": {
    "output": {
      "task_id": "17ed7e50-00cf-4509-aea1-xxxxxxxxxxxx",
      "task_status": "SUCCEEDED",
      "submit_time": "2026-08-06 10:01:35.452",
      "scheduled_time": "2026-08-06 10:01:35.507",
      "end_time": "2026-08-06 10:13:33.838",
      "orig_prompt": "A golden retriever running on a sunny beach.",
      "video_url": "https://download.cloudwise.ai/arts/1459964678842089472"
    },
    "usage": {
      "video_count": 1,
      "duration": 5.0,
      "input_video_duration": 0.0,
      "output_video_duration": 5.0,
      "fps": 30,
      "SR": 720,
      "ratio": "16:9"
    },
    "request_id": "78c9b768-0285-996c-b682-xxxxxxxxxxxx"
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

**Request Example**

```bash
curl -X GET 'https://api.cloudwise.ai/api/v1/tasks/{task_id}' \
  -H "Authorization: Bearer $YOUR_API_KEY"
```

**Response Example**

```json
{
  "code": "10000",
  "data": {
    "output": {
      "task_id": "17ed7e50-00cf-4509-aea1-xxxxxxxxxxxx",
      "task_status": "SUCCEEDED",
      "submit_time": "2026-08-06 10:01:35.452",
      "scheduled_time": "2026-08-06 10:01:35.507",
      "end_time": "2026-08-06 10:13:33.838",
      "orig_prompt": "A golden retriever running on a sunny beach.",
      "video_url": "https://download.cloudwise.ai/arts/1459964678842089472"
    },
    "usage": {
      "video_count": 1,
      "duration": 5.0,
      "input_video_duration": 0.0,
      "output_video_duration": 5.0,
      "fps": 30,
      "SR": 720,
      "ratio": "16:9"
    },
    "request_id": "78c9b768-0285-996c-b682-xxxxxxxxxxxx"
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

---

## AliCloud / qwen-image / text-to-image `POST`

_Official Format_

### text-to-image

Qwen text-to-image supports high-quality generation from natural language prompts with strong text rendering, realism, and prompt adherence.

`POST https://api.cloudwise.ai/api/v1/services/aigc/multimodal-generation/generation`

### Supported Models

| Model Name |
| --- |
| `qwen-image-3.0-pro` |
| `qwen-image-3.0` |
| `qwen-image-2.0-pro` |
| `qwen-image-2.0` |

### Model Overview

`qwen-image-3.0-pro` and `qwen-image-3.0` are the latest unified generation and editing models supporting both text-to-image (T2I) and image-to-image (I2I). `qwen-image-3.0-pro` is the flagship variant for the strongest text rendering, realism, and prompt adherence, while `qwen-image-3.0` balances quality and speed. `qwen-image-2.0-pro` and `qwen-image-2.0` remain available as the previous generation.

### Key Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Supported values: `qwen-image-3.0-pro`, `qwen-image-3.0`, `qwen-image-2.0-pro` and `qwen-image-2.0`. |
| input.messages | array | - | required<br>Single-turn input array with exactly one `role=user` object and text prompt content. |
| parameters.n | integer | 1 | Number of output images. Supported range: `1-6`. |
| parameters.size | string | auto | Output resolution in `width*height`. Total pixels must stay between `512*512` and `2048*2048`. For the `3.0` series, when omitted the model automatically recommends a resolution based on the prompt. |
| parameters.prompt_extend | boolean | true | Enables prompt rewriting and enhancement. |
| parameters.prompt_extend_mode | string | direct | qwen-image-3.0 series only. Rewriting strategy when `prompt_extend` is enabled. `direct` applies direct prompt enhancement (DPE) suited to most scenarios, while `agent` uses agent-based rewriting for richer detail expansion. |
| parameters.negative_prompt | string | - | Defines unwanted content such as blur, distortion, and malformed details. |
| parameters.watermark | boolean | false | Controls whether to add the `Qwen-Image` watermark. |
| parameters.seed | integer | - | Random seed in range `[0, 2147483647]` for reproducibility. Only supported by the `2.0` series. |

### Output Rules

Generated images are returned as PNG links under `output.choices[0].message.content`. URLs are retained for 24 hours and should be archived immediately in production systems.

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "qwen-image-3.0-pro",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "text": "An elegant and solemn Chinese couplet hangs in a classical Chinese hall. The room is quiet and traditionally styled, with blue-and-white porcelain on a table. The left line reads Yi Ben Sheng Zhi Ren Ji Tong Dao Shan Si Xin, the right line reads Tong Yun Fu Zhi Qian Kun Qi Shu Gao Zhi Yuan, and the horizontal plaque reads Zhi Qi Qian Wen. The calligraphy is flowing, and a Chinese-style painting of Yueyang Tower is displayed in the center."
                    }
                ]
            }
        ]
    },
    "parameters": {
        "negative_prompt": "low resolution, poor image quality, deformed limbs, malformed fingers, oversaturated colors, waxy texture, missing facial details, over-smoothing, obvious AI artifacts, chaotic composition, blurry or distorted text",
        "prompt_extend": true,
        "watermark": false,
        "size": "1024*1024"
    }
}'
```

### Response Example

```json
{
    "output": {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": [
                        {
                            "image": "https://dashscope-463f.oss-ap-southeast-1.aliyuncs.com/7d/b1/20260311/a32fe4a6/2a5307bf-c91c-40d6-a758-650d22a76333.png?Expires=1773798838&OSSAccessKeyId=LTAI5tRcsWJEymQaTsKbKqGf&Signature=e5Jsh8ngLbuC9Qk7t57imRDsRmI%3D"
                        }
                    ],
                    "role": "assistant"
                }
            }
        ]
    },
    "usage": {
        "height": 1024,
        "image_count": 1,
        "width": 1024
    },
    "request_id": "0752b5d7-56ec-9793-9e21-0a18f8fd2a51"
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "qwen-image-3.0-pro",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "text": "An elegant and solemn Chinese couplet hangs in a classical Chinese hall. The room is quiet and traditionally styled, with blue-and-white porcelain on a table. The left line reads Yi Ben Sheng Zhi Ren Ji Tong Dao Shan Si Xin, the right line reads Tong Yun Fu Zhi Qian Kun Qi Shu Gao Zhi Yuan, and the horizontal plaque reads Zhi Qi Qian Wen. The calligraphy is flowing, and a Chinese-style painting of Yueyang Tower is displayed in the center."
                    }
                ]
            }
        ]
    },
    "parameters": {
        "negative_prompt": "low resolution, poor image quality, deformed limbs, malformed fingers, oversaturated colors, waxy texture, missing facial details, over-smoothing, obvious AI artifacts, chaotic composition, blurry or distorted text",
        "prompt_extend": true,
        "watermark": false,
        "size": "1024*1024"
    }
}'
```

**Response Example**

```json
{
    "output": {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": [
                        {
                            "image": "https://dashscope-463f.oss-ap-southeast-1.aliyuncs.com/7d/b1/20260311/a32fe4a6/2a5307bf-c91c-40d6-a758-650d22a76333.png?Expires=1773798838&OSSAccessKeyId=LTAI5tRcsWJEymQaTsKbKqGf&Signature=e5Jsh8ngLbuC9Qk7t57imRDsRmI%3D"
                        }
                    ],
                    "role": "assistant"
                }
            }
        ]
    },
    "usage": {
        "height": 1024,
        "image_count": 1,
        "width": 1024
    },
    "request_id": "0752b5d7-56ec-9793-9e21-0a18f8fd2a51"
}
```

---

## AliCloud / qwen-image / image-to-image `POST`

_Official Format_

### image-to-image

Qwen image editing supports multi-image input and text-guided editing for visual replacement, attribute transfer, pose reference, style transfer, and scene enhancement.

`POST https://api.cloudwise.ai/api/v1/services/aigc/multimodal-generation/generation`

### Supported Models

| Model Name |
| --- |
| `qwen-image-3.0-pro` |
| `qwen-image-3.0` |
| `qwen-image-2.0-pro` |
| `qwen-image-2.0` |

### Model Overview

The `3.0` and `2.0` series are unified image generation and image editing models. `qwen-image-3.0-pro` and `qwen-image-3.0` are the latest generation, supporting both text-to-image (T2I) and image-to-image (I2I) with stronger instruction following. They support 1 to 3 input images and 1 to 6 output images, making them suitable for clothing replacement, subject editing, pose reference, style transfer, and text modification.

### Input Requirements

| Parameter | Type | Description |
| --- | --- | --- |
| input.messages | array | Must contain exactly one `role=user` object. The `content` array should include 1 to 3 images and one text instruction. |
| image formats | string | Supported formats: `JPG`, `JPEG`, `PNG`, `BMP`, `TIFF`, `WEBP`, and `GIF`. GIF input uses the first frame only. |
| image size | string | Recommended width and height are between `384px` and `3072px`. Each image must be no larger than `10MB`. |
| image input method | string | Supports public `HTTP`/`HTTPS` URLs or Base64 data in the format `data:{mime_type};base64,{base64_data}`. |

### Key Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Supported values: `qwen-image-3.0-pro`, `qwen-image-3.0`, `qwen-image-2.0-pro` and `qwen-image-2.0`. |
| parameters.n | integer | 1 | Number of output images. Supported range: `1-6`. |
| parameters.size | string | follow input | Output resolution in the format `width*height`. Total pixels must remain between `512*512` and `2048*2048`. For the `3.0` series, when omitted the model automatically recommends a resolution based on the prompt. |
| parameters.prompt_extend | boolean | true | Enables prompt rewriting and enhancement. |
| parameters.prompt_extend_mode | string | direct | qwen-image-3.0 series only. Rewriting strategy when `prompt_extend` is enabled. `direct` applies direct prompt enhancement (DPE) suited to most scenarios, while `agent` uses agent-based rewriting for richer detail expansion. |
| parameters.negative_prompt | string | - | Describes unwanted content, such as blur, distortion, or extra fingers. |
| parameters.watermark | boolean | false | Controls whether the generated image includes the `Qwen-Image` watermark. |

### Output Rules

Output images are returned in `PNG` format. Returned URLs remain valid for 24 hours and should be archived promptly in production environments.

### Request Example

```bash
curl --location 'https://api.cloudwise.ai/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Content-Type: application/json' \
--header "Authorization: Bearer $YOUR_API_KEY" \
--data '{
    "model": "qwen-image-3.0-pro",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/thtclx/input1.png"
                    },
                    {
                        "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/iclsnx/input2.png"
                    },
                    {
                        "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/gborgw/input3.png"
                    },
                    {
                        "text": "The girl in image 1 wears the black dress from image 2 and sits in the pose shown in image 3"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "n": 2,
        "negative_prompt": " ",
        "prompt_extend": true,
        "watermark": false,
        "size": "1024*1536"
    }
}'
```

### Response Example

```json
{
    "output": {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "image": "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/xxx.png?Expires=xxx"
                        },
                        {
                            "image": "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/xxx.png?Expires=xxx"
                        }
                    ]
                }
            }
        ]
    },
    "usage": {
        "width": 1536,
        "image_count": 2,
        "height": 1024
    },
    "request_id": "bf37ca26-0abe-98e4-8065-xxxxxx"
}
```

**Request Example**

```bash
curl --location 'https://api.cloudwise.ai/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Content-Type: application/json' \
--header "Authorization: Bearer $YOUR_API_KEY" \
--data '{
    "model": "qwen-image-3.0-pro",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/thtclx/input1.png"
                    },
                    {
                        "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/iclsnx/input2.png"
                    },
                    {
                        "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/gborgw/input3.png"
                    },
                    {
                        "text": "The girl in image 1 wears the black dress from image 2 and sits in the pose shown in image 3"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "n": 2,
        "negative_prompt": " ",
        "prompt_extend": true,
        "watermark": false,
        "size": "1024*1536"
    }
}'
```

**Response Example**

```json
{
    "output": {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "image": "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/xxx.png?Expires=xxx"
                        },
                        {
                            "image": "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/xxx.png?Expires=xxx"
                        }
                    ]
                }
            }
        ]
    },
    "usage": {
        "width": 1536,
        "image_count": 2,
        "height": 1024
    },
    "request_id": "bf37ca26-0abe-98e4-8065-xxxxxx"
}
```

---

## AliCloud / qwen-text `POST`

_Official Format_

### qwen3.7-plus

Alibaba Cloud qwen3.7-plus is the cost-effective Qwen3.7 model served through an OpenAI-compatible chat completions interface, with a 1M context window and hybrid thinking that emits the chain-of-thought via the reasoning_content field. It accepts image, text and video input with vision-language understanding and full-stack agent intelligence for coding, tool use and multimodal interaction.

`POST https://api.cloudwise.ai/api/v1/chat/completions`

### Supported Models

| Model Name | Input Modality | Positioning |
| --- | --- | --- |
| `qwen3.8-max` | Text | Latest flagship text model |
| `qwen3.7-max` | Text | Flagship text model |
| `qwen3.7-plus` | Image, Text, Video | Cost-effective multimodal model |
| `qwen3.7-flash` | Text | Lightweight low-latency model |
| `qwen3.6-plus` | Text | Previous-generation cost-effective model |

### Overview

This endpoint provides chat completion functionality for the Alibaba Cloud `qwen3.7-plus` model through an OpenAI-compatible interface. It supports a 1M context window and hybrid thinking, emitting the chain-of-thought via `reasoning_content` alongside the final `content`. It accepts image, text and video input.

### Headers

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Model ID. Use `qwen3.7-plus`. |
| messages | array | - | required<br>Conversation array. Each element contains `role` (`system`, `user`, `assistant`, or `tool`) and `content`. `content` may be a string or an array of parts for image, text and video input. |
| enable_thinking | boolean | false | Toggles hybrid thinking mode. When `true`, the model reasons before replying and returns the chain-of-thought via `reasoning_content`. |
| thinking_budget | integer | - | Maximum number of tokens for the thinking process. Defaults to the model maximum chain-of-thought length when omitted. |
| max_completion_tokens | integer | - | Maximum tokens for the response, including the chain-of-thought. Recommended over max_tokens for thinking models. |
| stream | boolean | false | Set `true` to enable SSE streaming output ending with `data: [DONE]`. |
| temperature | number | - | Sampling temperature, range `[0, 2)`. Higher values make output more diverse; lower values make it more deterministic. |
| top_p | number | - | Nucleus sampling parameter, range `(0, 1.0]`. Use with care alongside `temperature`. |
| tools | array | - | Optional tool/function definitions for function calling. |
| tool_choice | string\\|object | auto | Tool selection strategy: `none`, `auto`, or a specific tool object. |
| enable_search | boolean | false | Set true to enable built-in web search. |
| response_format | object | {"type":"text"} | Output format constraint. Use `{"type": "json_object"}` for JSON output. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "qwen3.7-plus",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant."
        },
        {
            "role": "user",
            "content": "Briefly explain what reinforcement learning is."
        }
    ],
    "enable_thinking": true,
    "stream": true,
    "max_completion_tokens": 4096
}'
```

### Response

The response contains the generated chat completion.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier for the completion. |
| object | string | Object type, always `chat.completion`. |
| created | integer | Unix timestamp of when the completion was created. |
| model | string | The model used for the completion. |
| choices | array | List of completion choices. Each contains `message.content`, `message.reasoning_content` (chain-of-thought), and `finish_reason`. |
| usage | object | Token usage stats: `prompt_tokens`, `completion_tokens`, `total_tokens`. |

#### Example Response

```json
{
    "id": "chatcmpl-a1b2c3d4e5",
    "object": "chat.completion",
    "created": 1779321600,
    "model": "qwen3.7-plus",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "reasoning_content": "The user wants a concise definition of reinforcement learning. Cover agent, environment, actions, rewards, and policy optimization.",
                "content": "Reinforcement learning is a machine learning paradigm where an agent learns to make decisions by interacting with an environment, receiving rewards or penalties, and adjusting its policy to maximize cumulative reward over time."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 28,
        "completion_tokens": 42,
        "total_tokens": 70
    }
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "qwen3.7-plus",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant."
        },
        {
            "role": "user",
            "content": "Briefly explain what reinforcement learning is."
        }
    ],
    "enable_thinking": true,
    "stream": true,
    "max_completion_tokens": 4096
}'
```

**Response Example**

```json
{
    "id": "chatcmpl-a1b2c3d4e5",
    "object": "chat.completion",
    "created": 1779321600,
    "model": "qwen3.7-plus",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "reasoning_content": "The user wants a concise definition of reinforcement learning. Cover agent, environment, actions, rewards, and policy optimization.",
                "content": "Reinforcement learning is a machine learning paradigm where an agent learns to make decisions by interacting with an environment, receiving rewards or penalties, and adjusting its policy to maximize cumulative reward over time."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 28,
        "completion_tokens": 42,
        "total_tokens": 70
    }
}
```

---

## Anthropic / claude-sonnet-5.5 `POST`

_Official Format(Chat)_

### claude-sonnet-5.5

Claude Sonnet 5.5 is Anthropic's flagship model for high-performance coding, agentic workflows, and long-context knowledge work. It uses the Anthropic Messages API and supports multimodal input, tool use, and extended thinking.

`POST https://api.cloudwise.ai/api/v1/messages`

### Supported Models

| Model Name |
| --- |
| `claude-sonnet-5-5` |
| `claude-sonnet-5` |
| `claude-sonnet-4-20250514` |
| `claude-sonnet-4-5-20250929` |
| `claude-sonnet-4-6` |
| `claude-sonnet-4-6-thinking` |

### Overview

This endpoint provides text generation functionality using the claude-sonnet-5.5 model. Upload images or provide image URLs to analyze and understand image content with vision-enabled models.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The model that will complete your prompt.<br>Valid values: `"claude-sonnet-5-5"`, `"claude-sonnet-5"`, `"claude-haiku-4-5-20251001"`, `"claude-opus-4-6"`, or `"claude-opus-4-7"` |
| messages | array of MessageParam | - | required<br>Input messages.<br><br>**Example with a single user message:**<br>`[{"role": "user", "content": "Hello, Claude"}]`<br><br>**Example with multiple conversational turns:**<br>`[{"role": "user", "content": "Hello there."}, {"role": "assistant", "content": "Hi, I'm Claude. How can I help you?"}, {"role": "user", "content": "Can you explain LLMs in plain English?"}]`<br><br>**Example with a partially-filled response from Claude:**<br>`[{"role": "user", "content": "What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun"}, {"role": "assistant", "content": "The best answer is ("}]`<br><br>Each input message content may be either a single string or an array of content blocks, where each block has a specific type. Using a string for content is shorthand for an array of one content block of type `"text"`.<br><br>There is a limit of 100,000 messages in a single request.<br><br>**MessageParam attributes:**<br>- `content` (string or array of ContentBlockParam): Message content<br>- `role`("user" or "assistant"): Message role |
| max_tokens | number | - | The maximum number of tokens to generate before stopping.<br><br>Minimum: 1 |
| metadata | object | - | Optional. An object describing metadata about the request.<br><br>**metadata.user_id** (optional string, maxLength: 256): User identifier |
| service_tier | string | - | Optional. Determines whether to use priority capacity (if available) or standard capacity for this request.<br><br>Valid values: `"auto"` or `"standard_only"` |
| stop_sequences | array of string | - | Optional. Custom text sequences that will cause the model to stop generating. |
| stream | boolean | false | Optional. Whether to incrementally stream the response using server-sent events. |
| system | string | - | Optional. System prompt. |
| temperature | number | - | Optional. Amount of randomness injected into the response.<br><br>Minimum: 0<br>Maximum: 1 |
| thinking | object | - | Optional. Configuration for enabling Claude's extended thinking. |
| tool_choice | object | - | Optional. How the model should use the provided tools. The model can use a specific tool, any available tool, decide by itself, or not use tools at all. |
| tools | array | - | Optional. Definitions of tools that the model may use. |
| top_k | number | - | Optional.<br><br>Minimum: 0 |
| top_p | number | - | Optional. Use nucleus sampling.<br><br>Minimum: 0<br>Maximum: 1 |

### Request Example

```bash
curl https://api.cloudwise.ai/api/v1/messages \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "claude-sonnet-5-5",
  "max_tokens": 32768,
  "messages": [
    {
      "content": "Given me a brief introduction of MoE",
      "role": "user"
    }
  ]
}'
```

### Response

The response contains the generated text and usage statistics.

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique object identifier. |
| content | array of ContentBlock | Content generated by the model.<br><br>This is an array of content blocks, each of which has a type that determines its shape.<br><br>**Example:**<br>`[{"type": "text", "text": "Hi, I'm Claude."}]`<br><br>If the request input messages ended with an assistant turn, then the response content will continue directly from that last turn. You can use this to constrain the model's output.<br><br>**Example:** If the input messages were:<br>`[{"role": "user", "content": "What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun"}, {"role": "assistant", "content": "The best answer is ("}]`<br><br>Then the response content might be:<br>`[{"type": "text", "text": "B)"}]` |
| model | string | The model that will complete your prompt. |
| stop_reason | string StopReason | The reason that we stopped. |
| stop_sequence | string | Which custom stop sequence was generated, if any. |
| type | string | Object type. |
| usage | object | Billing and rate-limit usage. |

**Request Example**

```bash
curl https://api.cloudwise.ai/api/v1/messages \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "claude-sonnet-5-5",
  "max_tokens": 32768,
  "messages": [
    {
      "content": "Given me a brief introduction of MoE",
      "role": "user"
    }
  ]
}'
```

**Response Example**

```json
{
    "id": "msg_01XfCVjsyVCN8CAXtSsAzKae",
    "content": [
        {
            "text": "# Mixture of Experts (MoE) - Brief Introduction\n\n…",
            "type": "text"
        }
    ],
    "model": "claude-sonnet-5-5",
    "role": "assistant",
    "stop_reason": "end_turn",
    "stop_sequence": null,
    "type": "message",
    "usage": {
        "cache_creation": {
            "ephemeral_1h_input_tokens": 0,
            "ephemeral_5m_input_tokens": 0
        },
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
        "input_tokens": 16,
        "output_tokens": 362,
        "service_tier": "standard"
    }
}
```

---

## Anthropic / claude-haiku-5.5 `POST`

_Official Format(Chat)_

### claude-haiku-5.5

Claude Haiku 5.5 is built for high-volume, latency-sensitive classification, extraction, routing, and subagent tasks. It supports text and image input, a 1M-token context window, up to 128K output tokens, and adaptive thinking with configurable effort.

`POST https://api.cloudwise.ai/api/v1/messages`

### Supported Models

| Model Name |
| --- |
| `claude-haiku-5-5` |
| `claude-haiku-4-5-20251001` |
| `claude-3-5-haiku-20241022` |

The Haiku 3.5 entry is retained for legacy integrations. It is retired on the Claude API and Amazon Bedrock; Google Cloud restricts it to existing customers. Its availability depends on the upstream channel. Use Haiku 5.5 for new integrations.

### Overview

Haiku 5.5 and Haiku 4.5 share the Messages API request, response, and streaming structure. Cloudwise exposes it at `/api/v1/messages` with Bearer authentication. Both models accept text and image input and return text or tool-use content blocks.

Haiku 5.5 supports a 1M-token context window and up to 128K output tokens, compared with 200K context and 64K output on Haiku 4.5. Recount prompts when migrating: the newer tokenizer produces approximately 30% more tokens for the same text. Haiku 5.5 pricing changes when the prompt exceeds 100,000 tokens, including the output and cache rates.

Adaptive thinking is enabled by default on Haiku 5.5. Omit sampling parameters, end messages with a user turn, and select response content blocks by type. Model-specific differences are listed below.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The model that will complete your prompt.<br>Use a model ID from Supported Models above.`claude-haiku-5-5` is a fixed snapshot with no date suffix. Legacy model availability depends on the upstream channel. |
| messages | array of MessageParam | - | required<br>Input messages.<br><br>**Example with a single user message:**<br>`[{"role": "user", "content": "Hello, Claude"}]`<br><br>**Example with multiple conversational turns:**<br>`[{"role": "user", "content": "Hello there."}, {"role": "assistant", "content": "Hi, I'm Claude. How can I help you?"}, {"role": "user", "content": "Can you explain LLMs in plain English?"}]`<br><br>**Haiku 5.5:** End with a `user` turn. A final assistant prefill returns HTTP 400, even when thinking is disabled. Use a system instruction or structured outputs to constrain the reply.<br><br>**Haiku 4.5:** Assistant prefilling is supported only when thinking is disabled. Haiku 3.5 also supports assistant prefilling.<br><br>Each input message content may be either a single string or an array of content blocks, where each block has a specific type. Using a string for content is shorthand for an array of one content block of type `"text"`.<br><br>There is a limit of 100,000 messages in a single request.<br><br>**MessageParam attributes:**<br>- `content` (string or array of ContentBlockParam): Message content<br>- `role`("user" or "assistant"): Message role<br><br>For Haiku 5.5 tool loops, return thinking blocks unmodified and keep the conversation append-only. Changing `system`, `tools`, or earlier messages can invalidate thinking blocks and return HTTP 400. Accounts created before August 31, 2026, 00:00 UTC only enforce this check when `thinking.block_binding.prefix_mismatch_behavior` is set. Replay thinking blocks through the producing account or a linked account; unrelated accounts discard them. |
| max_tokens | integer | - | required<br>Maximum output tokens, including thinking. Use a positive integer for generation; `0` pre-warms the prompt cache without generating output.<br><br>Haiku 5.5 supports up to 128K output tokens; Haiku 4.5 supports up to 64K. Leave room for both thinking and text: a small budget can stop after thinking with no text response. |
| metadata | object | - | Optional. An object describing metadata about the request.<br><br>**metadata.user_id** (optional string, maxLength: 512): An opaque user identifier. Do not include names, email addresses, or other identifying information. |
| service_tier | string | - | Optional. Determines whether to use priority capacity (if available) or standard capacity for this request.<br><br>Valid values: `"auto"` or `"standard_only"`<br><br>Haiku 5.5 does not support Priority Tier. Haiku 4.5 supports Priority Tier when capacity is available for the account. |
| stop_sequences | array of string | - | Optional. Custom text sequences that will cause the model to stop generating. |
| stream | boolean | false | Optional. Whether to incrementally stream the response using server-sent events. |
| system | string or array of TextBlockParam | - | Optional. System instructions, supplied as a string or text content blocks. On Haiku 5.5, keep this unchanged when replaying bound thinking blocks. |
| cache_control | object | - | Optional. Use `{"type": "ephemeral", "ttl": "5m"}` for automatic prompt caching. The TTL can be `"5m"` (default) or `"1h"`. Alternatively, set cache breakpoints on individual cacheable content blocks. |
| temperature | number | - | Haiku 5.5: omit this parameter. Only `1` is accepted for compatibility; any other value returns HTTP 400. Do not send it together with `top_p`.<br><br>Haiku 4.5 and 3.5: optional randomness control, from 0 to 1 (default 1). Haiku 4.5 extended thinking does not support changing temperature. |
| thinking | object | - | Haiku 5.5: defaults to `{"type": "adaptive"}`. Control depth with `output_config.effort`.`type: "enabled"` with `budget_tokens` returns HTTP 400.<br><br>`{"type": "disabled"}` is accepted at low, medium, or high effort, but returns HTTP 400 at xhigh or max. Thinking text is omitted by default: blocks have an empty `thinking` field and an opaque signature. Add `display: "summarized"` to receive a summary.<br><br>Haiku 4.5: thinking is off by default. Enable it with `{"type": "enabled", "budget_tokens": 8000}`. The budget must be at least 1,024 and less than `max_tokens`; adaptive thinking is not supported. Haiku 3.5 does not support thinking. |
| output_config | object | - | Optional. `effort` is supported by Haiku 5.5, not Haiku 4.5 or 3.5. Values: `"low"`, `"medium"` (default), `"high"`, `"xhigh"`, or `"max"`. Effort guides reasoning and token use; it is not a hard token budget.<br><br>`format` configures structured JSON output with `{"type": "json_schema", "schema": {...}}`. Structured outputs are supported by Haiku 5.5 and 4.5 on the Claude API, but not Haiku 3.5; upstream platform support may differ. |
| tool_choice | object | - | Optional. How the model should use the provided tools. The model can use a specific tool, any available tool, decide by itself, or not use tools at all.<br><br>Haiku 5.5 accepts `auto`, `none`, `any`, or `tool` (with `name`). Forced `any` or `tool` starts with a tool call and omits thinking blocks. Use `{"type": "auto"}` to allow thinking before tool use. Haiku 4.5 with extended thinking only supports `auto` or `none`. |
| tools | array | - | Optional. Client tools define a `name`, `description`, and JSON `input_schema`. Return tool results in a user message.<br><br>On the Claude API and Google Cloud, Haiku 5.5 computer use requires `computer_toolset_20260801`, replacing Haiku 4.5's `computer_20250124`. Remove the old computer-use and fine-grained tool-streaming beta headers when using the toolset. Dispatch tool calls by `name` and `toolset_name`, and echo `toolset_name` in results. Haiku 5.5 also supports `browser_toolset_20260801`on those platforms; Haiku 4.5 does not. Server-tool availability depends on the upstream platform. |
| top_k | number | - | Haiku 5.5: unsupported; any value returns HTTP 400. Omit it.<br><br>Haiku 4.5 and 3.5: optional sampling limit, minimum 0. Do not use with Haiku 4.5 extended thinking. |
| top_p | number | - | Haiku 5.5: omit this parameter. Only `0.99` is accepted; any other value, including `1`, returns HTTP 400. Sending both `top_p` and `temperature` also returns HTTP 400.<br><br>Haiku 4.5 and 3.5: optional nucleus sampling, from 0 to 1. With Haiku 4.5 extended thinking, the supported range is 0.95 to 1. |

### Request Example

```bash
curl https://api.cloudwise.ai/api/v1/messages \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "claude-haiku-5-5",
  "max_tokens": 16000,
  "messages": [
    {
      "content": "Give me a brief introduction to MoE",
      "role": "user"
    }
  ],
  "thinking": {
    "type": "adaptive"
  },
  "output_config": {
    "effort": "medium"
  }
}'
```

### Response

The response contains content blocks and usage statistics. With `stream: true`, the same content arrives incrementally as server-sent events. The example response is illustrative; signatures and token counts vary.

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique object identifier. |
| content | array of ContentBlock | Content generated by the model.<br><br>This is an array of content blocks, each of which has a type that determines its shape.<br><br>**Example:**<br>`[{"type": "text", "text": "Hi, I'm Claude."}]`<br><br>Haiku 5.5 may begin with `thinking` blocks, including when the request omits `thinking`. Read `text` blocks by type, not by array position. Thinking text is empty by default, but signatures must be preserved unmodified in tool-use conversations. Tool calls use `tool_use` blocks.<br><br>Assistant-prefill continuations are only available on earlier Haiku models without thinking, not Haiku 5.5. |
| model | string | The model that generated this response. |
| stop_reason | string or null | Common values: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, and `pause_turn`. Handle `refusal` and `model_context_window_exceeded` when migrating from Haiku 3.5. Haiku 5.5 safety refusals have no server-side fallback. During streaming this field may be `null` until completion. |
| stop_sequence | string or null | The matched custom stop sequence, or null. |
| type | string | Object type. |
| usage | object | Token usage: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`. Thinking counts toward output usage even when its text is omitted. Haiku 5.5 token counts differ from Haiku 4.5 because of the newer tokenizer. |

**Request Example**

```bash
curl https://api.cloudwise.ai/api/v1/messages \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "claude-haiku-5-5",
  "max_tokens": 16000,
  "messages": [
    {
      "content": "Give me a brief introduction to MoE",
      "role": "user"
    }
  ],
  "thinking": {
    "type": "adaptive"
  },
  "output_config": {
    "effort": "medium"
  }
}'
```

**Response Example**

```json
{
    "id": "msg_01XfCVjsyVCN8CAXtSsAzKae",
    "content": [
        {
            "type": "thinking",
            "thinking": "",
            "signature": "<opaque-signature>"
        },
        {
            "text": "# Mixture of Experts (MoE) - Brief Introduction\n\n…",
            "type": "text"
        }
    ],
    "model": "claude-haiku-5-5",
    "role": "assistant",
    "stop_reason": "end_turn",
    "stop_sequence": null,
    "type": "message",
    "usage": {
        "cache_creation": {
            "ephemeral_1h_input_tokens": 0,
            "ephemeral_5m_input_tokens": 0
        },
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
        "input_tokens": 16,
        "output_tokens": 362,
        "service_tier": "standard"
    }
}
```

---

## Anthropic / claude-opus-5.5 `POST`

_Official Format(Chat)_

### claude-opus-5.5

Claude Opus 5.5 is built for long-running agentic coding and knowledge work. It supports a 1M-token context window, up to 128K output tokens, and always-on adaptive thinking with configurable effort levels.

`POST https://api.cloudwise.ai/api/v1/messages`

### Supported Models

| Model Name |
| --- |
| `claude-opus-5-5` |
| `claude-opus-5` |
| `claude-opus-4-8` |
| `claude-opus-4-7` |
| `claude-opus-4-6` |
| `claude-opus-4-6-thinking` |
| `claude-opus-4-5-20251101` |
| `claude-opus-4-1-20250805` |
| `claude-opus-4-1-20250805-thinking` |
| `claude-opus-4-20250514` |
| `claude-opus-4-20250514-thinking` |

### Overview

This endpoint provides text generation functionality using the claude-opus-5.5 model. Upload images or provide image URLs to analyze and understand image content with vision-enabled models.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Anthropic-Beta | string | task-budgets-2026-03-13 | Optional. Required only when using `output_config.task_budget` with `claude-opus-4-8` or `claude-opus-5`. This beta header does not apply to `claude-opus-5-5`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The model that will complete your prompt.<br>Valid values: `"claude-sonnet-4-6"`, `"claude-haiku-4-5-20251001"`, `"claude-opus-4-6"`, `"claude-opus-4-7"`, `"claude-opus-4-8"`, `"claude-opus-5"`, or `"claude-opus-5-5"` |
| messages | array of MessageParam | - | required<br>Input messages.<br><br>**Example with a single user message:**<br>`[{"role": "user", "content": "Hello, Claude"}]`<br><br>**Example with multiple conversational turns:**<br>`[{"role": "user", "content": "Hello there."}, {"role": "assistant", "content": "Hi, I'm Claude. How can I help you?"}, {"role": "user", "content": "Can you explain LLMs in plain English?"}]`<br><br>**Example with a partially-filled response from Claude:**<br>`[{"role": "user", "content": "What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun"}, {"role": "assistant", "content": "The best answer is ("}]`<br><br>Each input message content may be either a single string or an array of content blocks, where each block has a specific type. Using a string for content is shorthand for an array of one content block of type `"text"`.<br><br>There is a limit of 100,000 messages in a single request.<br><br>**MessageParam attributes:**<br>- `content` (string or array of ContentBlockParam): Message content<br>- `role`("user" or "assistant"): Message role |
| max_tokens | number | - | The maximum number of tokens to generate before stopping.<br><br>Minimum: 1<br>Maximum for `claude-opus-5-5`: 128,000 |
| metadata | object | - | Optional. An object describing metadata about the request.<br><br>**metadata.user_id** (optional string, maxLength: 256): User identifier |
| service_tier | string | - | Optional. Determines whether to use priority capacity (if available) or standard capacity for this request.<br><br>Valid values: `"auto"` or `"standard_only"` |
| stop_sequences | array of string | - | Optional. Custom text sequences that will cause the model to stop generating. |
| stream | boolean | false | Optional. Whether to incrementally stream the response using server-sent events. |
| system | string | - | Optional. System prompt. |
| temperature | number | - | Optional. Amount of randomness injected into the response.<br><br>Minimum: 0<br>Maximum: 1<br><br>Models released after Claude Opus 4.6, including `claude-opus-5-5`, accept only `1.0` for backward compatibility. Other values return an error. |
| thinking | object | - | Optional. Configuration for Claude's extended thinking. `claude-opus-5-5` uses always-on adaptive thinking and rejects both `{"type": "disabled"}` and manual budgets using `{"type": "enabled", "budget_tokens": N}`. Use `{"type": "adaptive"}` or omit this parameter. |
| output_config | object | - | Optional. Output configuration. For `claude-opus-5-5`, this supports reasoning effort and structured output format. Legacy task budgets apply only to the older models listed below. |
| output_config.effort | enum<string> | medium (Opus 5.5) | Optional. Controls reasoning effort level.<br>Available options: `low`, `medium`, `high`, `xhigh`, and `max`. The default for `claude-opus-5-5` is `medium`. Supported values and defaults may differ for earlier models. |
| output_config.format | object | - | Optional. A JSON schema that specifies the structured output format for the response. |
| output_config.task_budget | object | - | Optional. Suggestive token budget for full agentic loops. Supported only by `claude-opus-4-8` and `claude-opus-5`. Requires header `Anthropic-Beta: task-budgets-2026-03-13`. Not supported by `claude-opus-5-5`. |
| output_config.task_budget.type | enum<string> | tokens | required when `task_budget` is set.<br>Available options: `tokens`. |
| output_config.task_budget.total | integer | - | required when `task_budget` is set.<br>Minimum: `20000`. |
| output_config.task_budget.remaining | integer | same as total | Optional. Remaining token budget for ongoing loops. |
| tool_choice | object | - | Optional. How the model should use the provided tools. The model can use a specific tool, any available tool, decide by itself, or not use tools at all.<br><br>`claude-opus-5-5` does not support forced tool use. Setting `type` to `"any"` or `"tool"` returns an error. |
| tools | array | - | Optional. Definitions of tools that the model may use. `claude-opus-5-5` does not accept the legacy `computer_20251124` computer-use tool version. |
| top_k | number | - | Optional. Models released after Claude Opus 4.6, including `claude-opus-5-5`, reject this parameter.<br><br>Minimum: 0 |
| top_p | number | - | Optional. Use nucleus sampling.<br><br>Minimum: 0<br>Maximum: 1<br><br>Models released after Claude Opus 4.6, including `claude-opus-5-5`, accept only values greater than or equal to `0.99` for backward compatibility. |

### Request Example

```bash
curl https://api.cloudwise.ai/api/v1/messages \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "claude-opus-5-5",
  "max_tokens": 32768,
  "messages": [
    {
      "content": "Given me a brief introduction of MoE",
      "role": "user"
    }
  ],
  "thinking": {
    "type": "adaptive"
  },
  "output_config": {
    "effort": "medium"
  }
}'
```

### Response

The response contains the generated text and usage statistics.

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique object identifier. |
| content | array of ContentBlock | Content generated by the model.<br><br>This is an array of content blocks, each of which has a type that determines its shape.<br><br>Responses from `claude-opus-5-5` may begin with thinking blocks. Select blocks by their `type` instead of relying on array position, and pass thinking blocks back unchanged in tool-use conversations.<br><br>**Example:**<br>`[{"type": "text", "text": "Hi, I'm Claude."}]`<br><br>If the request input messages ended with an assistant turn, then the response content will continue directly from that last turn. You can use this to constrain the model's output.<br><br>**Example:** If the input messages were:<br>`[{"role": "user", "content": "What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun"}, {"role": "assistant", "content": "The best answer is ("}]`<br><br>Then the response content might be:<br>`[{"type": "text", "text": "B)"}]` |
| model | string | The model that will complete your prompt. |
| stop_reason | string StopReason | The reason that we stopped. |
| stop_sequence | string | Which custom stop sequence was generated, if any. |
| type | string | Object type. |
| usage | object | Billing and rate-limit usage. |

**Request Example**

```bash
curl https://api.cloudwise.ai/api/v1/messages \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "claude-opus-5-5",
  "max_tokens": 32768,
  "messages": [
    {
      "content": "Given me a brief introduction of MoE",
      "role": "user"
    }
  ],
  "thinking": {
    "type": "adaptive"
  },
  "output_config": {
    "effort": "medium"
  }
}'
```

**Response Example**

```json
{
    "id": "msg_01XfCVjsyVCN8CAXtSsAzKae",
    "content": [
        {
            "text": "# Mixture of Experts (MoE) - Brief Introduction\n\n…",
            "type": "text"
        }
    ],
    "model": "claude-opus-5-5",
    "role": "assistant",
    "stop_reason": "end_turn",
    "stop_sequence": null,
    "type": "message",
    "usage": {
        "cache_creation": {
            "ephemeral_1h_input_tokens": 0,
            "ephemeral_5m_input_tokens": 0
        },
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
        "input_tokens": 16,
        "output_tokens": 362,
        "service_tier": "standard"
    }
}
```

---

## Anthropic / claude-fable-5.1 `POST`

_Official Format(Chat)_

### claude-fable-5.1

Claude Fable 5.1 is Anthropic's most capable model for demanding reasoning and long-horizon agentic work. It improves long-running agentic coding, multistep research, and document, spreadsheet, and slide workflows while retaining a 1M-token context window and up to 128K output tokens. Released September 1, 2026.

`POST https://api.cloudwise.ai/api/v1/messages`

### Supported Models

| Model Name |
| --- |
| `claude-fable-5-1` |
| `claude-fable-5` |

### Overview

This endpoint provides text generation functionality using the claude-fable-5-1 and claude-fable-5 models. Upload images or provide image URLs to analyze and understand image content with vision-enabled models.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The model that will complete your prompt.<br>Valid values: `"claude-fable-5-1"` or `"claude-fable-5"` |
| messages | array of MessageParam | - | required<br>Input messages.<br><br>**Example with a single user message:**<br>`[{"role": "user", "content": "Hello, Claude"}]`<br><br>**Example with multiple conversational turns:**<br>`[{"role": "user", "content": "Hello there."}, {"role": "assistant", "content": "Hi, I'm Claude. How can I help you?"}, {"role": "user", "content": "Can you explain LLMs in plain English?"}]`<br><br>**Example with a partially-filled response from Claude:**<br>`[{"role": "user", "content": "What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun"}, {"role": "assistant", "content": "The best answer is ("}]`<br><br>Each input message content may be either a single string or an array of content blocks, where each block has a specific type. Using a string for content is shorthand for an array of one content block of type `"text"`.<br><br>There is a limit of 100,000 messages in a single request.<br><br>**MessageParam attributes:**<br>- `content` (string or array of ContentBlockParam): Message content<br>- `role`("user" or "assistant"): Message role<br><br>**Claude Fable 5.1 only:** Thinking blocks are bound to the model and conversation prefix. Claude Fable 5.1 can read thinking blocks from Claude Fable 5, but Claude Fable 5 cannot read Claude Fable 5.1 thinking blocks; the API drops incompatible blocks. Editing, reordering, or removing content before a Claude Fable 5.1 thinking block can invalidate it and return a 400 error. Keep conversation history append-only and pass thinking blocks back unchanged.<br><br>Claude Fable 5.1 also supports turn-scoped system messages in beta. Set `clear_at: "next_user_message"` and send the `mid-conversation-system-clear-at-2026-08-21` beta header.<br><br>**Both models:** Assistant response prefilling returns a 400 error. |
| max_tokens | number | - | required<br>The maximum number of tokens to generate before stopping.<br><br>Minimum: 1<br>Maximum: 128000 (both supported models allow up to 128K output tokens) |
| metadata | object | - | Optional. An object describing metadata about the request.<br><br>**metadata.user_id** (optional string, maxLength: 256): User identifier |
| service_tier | string | - | Optional. Determines whether to use priority capacity (if available) or standard capacity for this request.<br><br>Valid values: `"auto"` or `"standard_only"` |
| stop_sequences | array of string | - | Optional. Custom text sequences that will cause the model to stop generating. |
| stream | boolean | false | Optional. Whether to incrementally stream the response using server-sent events. |
| system | string or array of TextBlockParam | - | Optional. System prompt. |
| temperature | number | - | Optional. Amount of randomness injected into the response.<br><br>**Both models:** Non-default values return a 400 error. Omit this parameter to use the model default. |
| thinking | object | - | Optional. Configuration for Claude's extended thinking.<br><br>**Both models:** Adaptive thinking is always on. Omit this parameter or pass `{"type": "adaptive"}`. Passing `{"type": "enabled", "budget_tokens": ...}` or `{"type": "disabled"}` returns a 400 error. |
| thinking.display | string | omitted | Optional. Controls how thinking content is returned. Both models support `omitted` and `summarized`; raw chain-of-thought is never returned.<br><br>**Claude Fable 5.1 only:** `updates` returns readable progress updates between tool calls in beta. Send the `thinking-display-updates-2026-08-18` beta header. |
| output_config.effort | string | high | Optional. Controls how many tokens Claude uses when responding, including its thinking and visible answer. Both models default to `high` effort.<br><br>Valid values: `low`, `medium`, `high`, or `max`.<br><br>**Claude Fable 5.1 only:** Effort can be changed mid-conversation without invalidating the prompt cache. This is a beta feature and requires the `mid-conversation-output-config-2026-07-01` beta header. |
| tool_choice | object | - | Optional. How the model should use the provided tools.<br><br>**Claude Fable 5.1 only:** Forced tool use is not supported. `{"type": "any"}` and `{"type": "tool", "name": "..."}` return a 400 error. Use `{"type": "auto"}` (the default) or `{"type": "none"}`.<br><br>**Claude Fable 5:** Supports `auto`, `none`, `any`, and a named `tool` choice. |
| tools | array | - | Optional. Definitions of tools that the model may use. |
| top_k | number | - | Optional. Only sample from the top K options for each subsequent token.<br><br>**Both models:** Non-default values return a 400 error. Omit this parameter to use the model default. |
| top_p | number | - | Optional. Use nucleus sampling.<br><br>**Both models:** Non-default values return a 400 error. Omit this parameter to use the model default. |

### Request Example

```bash
curl https://api.cloudwise.ai/api/v1/messages \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "claude-fable-5-1",
  "max_tokens": 32768,
  "messages": [
    {
      "content": "Give me a brief introduction to mixture-of-experts models.",
      "role": "user"
    }
  ],
  "thinking": {
    "type": "adaptive"
  },
  "output_config": {
    "effort": "high"
  }
}'
```

### Response

The response contains the generated text and usage statistics.

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique object identifier. |
| content | array of ContentBlock | Content generated by the model.<br><br>This is an array of content blocks, each of which has a type that determines its shape.<br><br>**Example:**<br>`[{"type": "text", "text": "Hi, I'm Claude."}]`<br><br>If the request input messages ended with an assistant turn, then the response content will continue directly from that last turn. You can use this to constrain the model's output.<br><br>**Example:** If the input messages were:<br>`[{"role": "user", "content": "What's the Greek name for Sun? (A) Sol (B) Helios (C) Sun"}, {"role": "assistant", "content": "The best answer is ("}]`<br><br>Then the response content might be:<br>`[{"type": "text", "text": "B)"}]` |
| model | string | The model that will complete your prompt. |
| role | string | Conversational role. Always `"assistant"` for responses. |
| stop_reason | string StopReason | The reason that we stopped. One of `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal`. |
| stop_sequence | string | Which custom stop sequence was generated, if any. |
| type | string | Object type. |
| usage | object | Billing and rate-limit usage. |

**Request Example**

```bash
curl https://api.cloudwise.ai/api/v1/messages \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "claude-fable-5-1",
  "max_tokens": 32768,
  "messages": [
    {
      "content": "Give me a brief introduction to mixture-of-experts models.",
      "role": "user"
    }
  ],
  "thinking": {
    "type": "adaptive"
  },
  "output_config": {
    "effort": "high"
  }
}'
```

**Response Example**

```json
{
    "id": "msg_01XfCVjsyVCN8CAXtSsAzKae",
    "content": [
        {
            "text": "# Mixture of Experts (MoE) - Brief Introduction\n\n…",
            "type": "text"
        }
    ],
    "model": "claude-fable-5-1",
    "role": "assistant",
    "stop_reason": "end_turn",
    "stop_sequence": null,
    "type": "message",
    "usage": {
        "cache_creation": {
            "ephemeral_1h_input_tokens": 0,
            "ephemeral_5m_input_tokens": 0
        },
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
        "input_tokens": 16,
        "output_tokens": 362,
        "service_tier": "standard"
    }
}
```

---

## BytePlus / SeedAudio-1.0 / Create Audio `POST`

_Official Format_

### Create Audio

Generate up to 120 seconds of audio from text, reference audio, or a reference image with SeedAudio 1.0.

`POST https://api.cloudwise.ai/api/v3/tts/create`

### Overview

This non-streaming API generates audio from a natural-language prompt. It supports text-only generation, up to three reference audio clips, or one reference image. Typical uses include audiobooks, voiceovers, and game audio. See the [BytePlus SeedAudio 1.0 API reference](https://docs.byteplus.com/en/docs/byteplusvoice/seedaudio-01) for the upstream specification.

### Supported Model

| Model Name | Languages | Maximum Duration |
| --- | --- | --- |
| `seed-audio-1.0` | English, Chinese, Japanese, Korean, Mexican Spanish, Indonesian, German, Brazilian Portuguese, French, Thai, Vietnamese, Malay, Filipino, Italian, Russian, Dutch, Polish, Turkish, Swedish, and Castilian Spanish | 120 seconds |

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Cloudwise API key in the format `Bearer $MAAS_API_KEY`. |
| Content-Type | string | application/json | required<br>Must be `application/json`. |
| X-Api-Request-Id | string | - | Optional client-generated request ID. Use a random UUID string. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | seed-audio-1.0 | required<br>Model version identifier. Use `seed-audio-1.0`. |
| text_prompt | string | - | required<br>The prompt used to generate audio, or the text to synthesize. Maximum 3,000 characters. For reference audio, use `@AudioN` to reference each audio item in upload order, starting with `@Audio1`. When using an image reference, this field can contain only the text to synthesize. |
| references | object[] | - | Optional reference resources. Omit for text-only generation. Supply audio references for reference-audio generation or one image reference for reference-image generation. Audio and image references cannot be mixed. |
| audio_config | object | - | Output audio format, sample rate, speed, volume, pitch, and subtitle settings. |
| watermark | object | - | Optional explicit and implicit watermark configuration. |

### Reference Object

Audio references support `wav`, `mp3`, `pcm`, and `ogg_opus`. You can pass up to three clips; each can be up to 30 seconds and 10 MB. Image references support `jpeg`, `png`, and `webp`, with one image up to 10 MB.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| speaker | string | - | Speaker ID for a TTS 2.0 voice or cloned voice. Provide exactly one of speaker, audio_data, or audio_url. |
| audio_data | string | - | Base64-encoded reference audio. Provide exactly one of audio_data, speaker, or audio_url. |
| audio_url | string | - | Publicly accessible reference audio URL. Provide exactly one of audio_url, speaker, or audio_data. |
| image_data | string | - | Base64-encoded reference image. Provide either image_data or image_url, but not both. |
| image_url | string | - | Publicly accessible reference image URL. Provide either image_url or image_data, but not both. |

### Audio Configuration

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| format | string | wav | Output format: `wav`, `mp3`, `pcm`, or `ogg_opus`. |
| sample_rate | integer | format dependent | Output sample rate. Supported values: `8000`, `16000`, `24000`, `32000`, `44100`, and `48000`. The default is 40000 for WAV/PCM and 44100 for MP3. |
| speech_rate | integer | 0 | Speech rate from -50 to 100. -50 is 0.5x speed and 100 is 2.0x speed. |
| loudness_rate | integer | 0 | Volume adjustment from -50 to 100. -50 is 0.5x volume and 100 is 2.0x volume. |
| pitch_rate | integer | 0 | Pitch adjustment from -12 to 12. |
| enable_subtitle | boolean | false | When true, the response includes utterance-level and word-level timestamps. |

### Watermark Configuration

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| aigc_watermark | boolean | false | Adds an explicit audio rhythm marker at the end of the generated audio. |
| aigc_metadata.enable | boolean | false | Adds implicit watermark metadata to the generated audio header. |
| aigc_metadata.content_producer | string | - | Name or code of the synthesis service provider. |
| aigc_metadata.produce_id | string | - | Content production ID. |
| aigc_metadata.content_propagator | string | - | Name or code of the content distribution service provider. |
| aigc_metadata.propagate_id | string | - | Content distribution ID. |

### Pricing

Billing is based on `original_duration` with one-second precision. The pay-as-you-go rate is USD 0.15 per minute, equivalent to USD 0.0025 per second. A 60-minute free trial is available when the service is activated. See the [official BytePlus pricing page](https://docs.byteplus.com/en/docs/byteplusvoice/audiopricing).

| Payment | Package | Fee (USD) | Unit | Valid Period |
| --- | --- | --- | --- | --- |
| Pay-as-you-go | - | 0.15 | minute | - |
| Pre-paid | 200 min | 28.5 | - | 1 year |
| Pre-paid | 200k min | 27,000 | - | 1 year |
| Pre-paid | 500k min | 64,000 | - | 1 year |
| Pre-paid | 2m min | 240,000 | - | 1 year |

### Request Example

Text only

Reference audio

Reference image

```bash
curl --request POST \
  --url 'https://api.cloudwise.ai/api/v3/tts/create' \
  --header 'Authorization: Bearer $MAAS_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "seed-audio-1.0",
  "text_prompt": "Inside a football stadium, the crowd erupts as the commentator shouts: \"What a goal!\""
}'
```

```bash
curl --request POST \
  --url 'https://api.cloudwise.ai/api/v3/tts/create' \
  --header 'Authorization: Bearer $MAAS_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "seed-audio-1.0",
  "text_prompt": "Use @Audio1 as the narrator voice and create a tense game trailer voiceover.",
  "references": [
    {
      "audio_url": "https://example.com/reference-voice.mp3"
    }
  ]
}'
```

```bash
curl --request POST \
  --url 'https://api.cloudwise.ai/api/v3/tts/create' \
  --header 'Authorization: Bearer $MAAS_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "seed-audio-1.0",
  "text_prompt": "Welcome to the championship final.",
  "references": [
    {
      "image_url": "https://example.com/commentator.png"
    }
  ]
}'
```

### Response

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| code | integer | - | Request status code. |
| message | string | - | Request status message. |
| audio | string | - | Generated audio data encoded as Base64. |
| duration | number | - | Post-processed audio duration in seconds. This can differ from original_duration after speed adjustment or other post-processing. |
| original_duration | number | - | Original model output duration in seconds. Billing uses this value. Maximum: 120 seconds. |
| url | string | - | Generated audio URL. The URL is valid for two hours. |
| subtitle | object | - | Subtitle information. Returned only when audio_config.enable_subtitle is true. |
| subtitle.text | string | - | Complete subtitle text for the generated audio. |
| subtitle.sentences | object[] | - | Utterance-level subtitle entries. |
| subtitle.sentences[].start_time | integer | - | Utterance start time in milliseconds. |
| subtitle.sentences[].end_time | integer | - | Utterance end time in milliseconds. |
| subtitle.sentences[].text | string | - | Complete text of the utterance. |
| subtitle.sentences[].words | object[] | - | Word-level subtitle entries with start_time, end_time, and text. |

#### Example Response

```json
{
  "code": 0,
  "message": "success",
  "audio": "<base64 encoded audio bytes>",
  "duration": 12.34,
  "original_duration": 12.34,
  "url": "https://example.com/generated-audio.wav",
  "subtitle": {
    "text": "Hello. Stay close. Don't look back.",
    "sentences": [
      {
        "start_time": 0,
        "end_time": 1800,
        "text": "Hello.",
        "words": [
          { "start_time": 0, "end_time": 600, "text": "Hello" },
          { "start_time": 600, "end_time": 1800, "text": "." }
        ]
      }
    ]
  }
}
```

**Request Example (Text only)**

```bash
curl --request POST \
  --url 'https://api.cloudwise.ai/api/v3/tts/create' \
  --header 'Authorization: Bearer $MAAS_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "seed-audio-1.0",
  "text_prompt": "Inside a football stadium, the crowd erupts as the commentator shouts: \"What a goal!\""
}'
```

**Request Example (Reference audio)**

```bash
curl --request POST \
  --url 'https://api.cloudwise.ai/api/v3/tts/create' \
  --header 'Authorization: Bearer $MAAS_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "seed-audio-1.0",
  "text_prompt": "Use @Audio1 as the narrator voice and create a tense game trailer voiceover.",
  "references": [
    {
      "audio_url": "https://example.com/reference-voice.mp3"
    }
  ]
}'
```

**Request Example (Reference image)**

```bash
curl --request POST \
  --url 'https://api.cloudwise.ai/api/v3/tts/create' \
  --header 'Authorization: Bearer $MAAS_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "seed-audio-1.0",
  "text_prompt": "Welcome to the championship final.",
  "references": [
    {
      "image_url": "https://example.com/commentator.png"
    }
  ]
}'
```

**Response Example**

```json
{
  "code": 0,
  "message": "success",
  "audio": "<base64 encoded audio bytes>",
  "duration": 12.34,
  "original_duration": 12.34,
  "url": "https://example.com/generated-audio.wav",
  "subtitle": {
    "text": "Hello. Stay close. Don't look back.",
    "sentences": [
      {
        "start_time": 0,
        "end_time": 1800,
        "text": "Hello.",
        "words": [
          { "start_time": 0, "end_time": 600, "text": "Hello" },
          { "start_time": 600, "end_time": 1800, "text": "." }
        ]
      }
    ]
  }
}
```

---

## BytePlus / Seedance-2.0/2.5 / Generate Video `POST`

_Official Format_

### Generate Video

Seedance 2.0 is BytePlus new-generation video model featuring superior visual fidelity, longer duration support, and advanced scene understanding for professional-grade content creation.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`

### Overview

Submit an asynchronous video generation task. The API returns a task ID immediately; use the **Query task** endpoint to poll for results. When `status` is `succeeded`, the `content.video_url` field contains the download URL.

### Supported Models

| Model Name |
| --- |
| `dreamina-seedance-2-5-260628` |
| `doubao-seedance-2-5-260628` |
| `dreamina-seedance-2-5-260628-enhance` |
| `dreamina-seedance-2-0-260128` |
| `doubao-seedance-2-0-260128` |
| `dreamina-seedance-2-0-260128-normal` |
| `dreamina-seedance-2-0-fast-260128` |
| `doubao-seedance-2-0-fast-260128` |
| `dreamina-seedance-2-0-fast-260128-normal` |
| `dreamina-seedance-2-0-mini-260615` |
| `doubao-seedance-2-0-mini-260615` |
| `dreamina-seedance-2-0-mini-260615-enhance` |
| `dreamina-seedance-2-0-260128-enhance` |
| `dreamina-seedance-2-0-fast-260128-enhance` |

### Headers

This endpoint requires the following headers for authentication and content type.

| Header | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***" | required<br>Your API key in the format: `Bearer ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| model | string | dreamina-seedance-2-0-260128 | required<br>The ID of the model that you want to call. e.g., "dreamina-seedance-2-0-260128" |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| content | object[] | - | required<br>The input references for the model, supporting text, image, audio, video.<br><br>**Information type:**<br><br>**Text object** (`content.type` = "text"):<br>`content.text` (string, required): The input text prompt describing the video.<br><br>**Image object** (`content.type` = "image_url"):<br>`content.image_url.url` (string, required): The image URL or Asset ID (`asset://<id>`).<br>`content.role` (string): Location or purpose. The PDF examples use `reference_image`.<br><br>**Video object** (`content.type` = "video_url"):<br>`content.video_url.url` (string, required): The video URL or Asset ID (`asset://<id>`).<br>`content.role` (string): The PDF examples use `reference_video`.<br><br>**Audio object** (`content.type` = "audio_url"):<br>`content.audio_url.url` (string, required): The audio URL, Asset ID, or Base64 encoded string.<br>`content.role` (string): The PDF examples use `reference_audio`. |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| ratio | string | - | The aspect ratio of the output video. The PDF sample uses `16:9`. |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| resolution | string | - | The resolution of the output video. Valid values: `480p`, `720p`, `1080p`, `4k`. |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| duration | integer | - | Generated video duration in seconds. The PDF sample uses `11`. |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| generate_audio | boolean | - | Controls whether the generated video includes sound synchronized with the footage. The PDF sample sets this field to `true`. |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| watermark | boolean | - | Whether to add the AI watermark. The PDF sample sets this field to `false`. |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| output_format | string | mp4 | Only `dreamina-seedance-2-5-260628` supports this parameter. Output video format.<br><br>- `mp4`: A general-purpose format with broad compatibility and standard color precision. It can be played directly in browsers, on mobile devices, in media players, and on distribution platforms.<br><br>- `mov`: A high-color-precision format for professional workflows. It better preserves color and brightness consistency and is suitable for color grading, keying, compositing, and other professional post-production tasks. For video editing and extension, using MOV for both input and output is recommended.<br><br>**MOV playback compatibility**<br>MOV output uses H.264 video encoding, YUV 4:4:4 chroma sampling, and PCM audio encoding. Some players may not support this combination.PlayermacOSWindowsIINA✓✗VLC✓✓mpv✓✓ffplay✓✓ | Player | macOS | Windows | IINA | ✓ | ✗ | VLC | ✓ | ✓ | mpv | ✓ | ✓ | ffplay | ✓ | ✓ |
| Player | macOS | Windows |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| IINA | ✓ | ✗ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| VLC | ✓ | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| mpv | ✓ | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| ffplay | ✓ | ✓ |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/aiproducts/video/seedance'   --header 'Content-Type: application/json'   --header 'Authorization: Bearer $MAAS_API_KEY'   -d '{
    "model": "dreamina-seedance-2-0-260128",
    "content": [
        {
            "type": "text",
            "text": "Use the first-person POV framing from [Video 1] throughout, and use [Audio 1] as the background music throughout. First-person POV fruit tea promotional ad, seedance limited-edition apple fruit tea; opening frame is [Image 1], your hand picks a dew-covered Aksu red apple, a light, crisp apple tapping sound; 2–4 seconds: fast cuts, your hand drops apple chunks into a shaker, adds ice and tea base, shakes forcefully, ice clinking and shaking sounds sync with upbeat rhythmic beats, background audio: {Fresh-cut, shaken fresh}; 4–6 seconds: first-person close-up of the finished drink, layered fruit tea is poured into a clear cup, your hand gently squeezes milk foam to spread across the top, a pink brand sticker is applied to the cup, the camera moves closer to show the layered textures of the foam and fruit tea; 6–8 seconds: first-person hand-held toast shot, you raise the fruit tea from [Image 2] toward the camera (simulating handing it to the viewer), the cup label is clearly visible, background audio {Take a sip of fresh refreshment}, the final frame freezes on Image 2. All background voice audio uses a female voice."
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic1.jpg"
            },
            "role": "reference_image"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic2.jpg"
            },
            "role": "reference_image"
        },
        {
            "type": "video_url",
            "video_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_video/r2v_tea_video1.mp4"
            },
            "role": "reference_video"
        },
        {
            "type": "audio_url",
            "audio_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_audio/r2v_tea_audio1.mp3"
            },
            "role": "reference_audio"
        }
    ],
    "generate_audio": true,
    "ratio": "16:9",
    "duration": 11,
    "watermark": false
}'
```

### Response

The response contains the generated video task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | The ID of the video generation task. Creating a video generation task is an asynchronous interface. After obtaining the ID, you need to query the status of the video generation task through Querying the information about a video generation task. When the task is successful, the video_url of the generated video will be output. |

#### Example Response

```json
{"id":"MTUwNDkzMTgyMTU4NzY2ODk5Mjo6MjAyNi0wNS0xNSAxOTo0MTo0Ng=="}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/aiproducts/video/seedance'   --header 'Content-Type: application/json'   --header 'Authorization: Bearer $MAAS_API_KEY'   -d '{
    "model": "dreamina-seedance-2-0-260128",
    "content": [
        {
            "type": "text",
            "text": "Use the first-person POV framing from [Video 1] throughout, and use [Audio 1] as the background music throughout. First-person POV fruit tea promotional ad, seedance limited-edition apple fruit tea; opening frame is [Image 1], your hand picks a dew-covered Aksu red apple, a light, crisp apple tapping sound; 2–4 seconds: fast cuts, your hand drops apple chunks into a shaker, adds ice and tea base, shakes forcefully, ice clinking and shaking sounds sync with upbeat rhythmic beats, background audio: {Fresh-cut, shaken fresh}; 4–6 seconds: first-person close-up of the finished drink, layered fruit tea is poured into a clear cup, your hand gently squeezes milk foam to spread across the top, a pink brand sticker is applied to the cup, the camera moves closer to show the layered textures of the foam and fruit tea; 6–8 seconds: first-person hand-held toast shot, you raise the fruit tea from [Image 2] toward the camera (simulating handing it to the viewer), the cup label is clearly visible, background audio {Take a sip of fresh refreshment}, the final frame freezes on Image 2. All background voice audio uses a female voice."
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic1.jpg"
            },
            "role": "reference_image"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic2.jpg"
            },
            "role": "reference_image"
        },
        {
            "type": "video_url",
            "video_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_video/r2v_tea_video1.mp4"
            },
            "role": "reference_video"
        },
        {
            "type": "audio_url",
            "audio_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_audio/r2v_tea_audio1.mp3"
            },
            "role": "reference_audio"
        }
    ],
    "generate_audio": true,
    "ratio": "16:9",
    "duration": 11,
    "watermark": false
}'
```

**Response Example**

```json
{"id":"MTUwNDkzMTgyMTU4NzY2ODk5Mjo6MjAyNi0wNS0xNSAxOTo0MTo0Ng=="}
```

---

## BytePlus / Seedance-2.0/2.5 / Query generation task result `GET`

_Official Format_

### Query generation task result

Seedance 2.0 is BytePlus new-generation video model featuring superior visual fidelity, longer duration support, and advanced scene understanding for professional-grade content creation.

`GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/{task_id}`

### Overview

Query task status and retrieve results.

### Supported Models

| Model Name |
| --- |
| `dreamina-seedance-2-5-260628` |
| `doubao-seedance-2-5-260628` |
| `dreamina-seedance-2-5-260628-enhance` |
| `dreamina-seedance-2-0-260128` |
| `doubao-seedance-2-0-260128` |
| `dreamina-seedance-2-0-260128-normal` |
| `dreamina-seedance-2-0-fast-260128` |
| `doubao-seedance-2-0-fast-260128` |
| `dreamina-seedance-2-0-fast-260128-normal` |
| `dreamina-seedance-2-0-mini-260615` |
| `doubao-seedance-2-0-mini-260615` |
| `dreamina-seedance-2-0-mini-260615-enhance` |
| `dreamina-seedance-2-0-260128-enhance` |
| `dreamina-seedance-2-0-fast-260128-enhance` |

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string (path) | - | required<br>Append the task ID to the endpoint path. |

### Request Example

```bash
curl 'https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/MTUwNDkzMTgyMTU4NzY2ODk5Mjo6MjAyNi0wNS0xNSAxOTo0MTo0Ng==' \
  --header 'Authorization: Bearer $MAAS_API_KEY'
```

### Response

The response contains task status and results.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Task ID (for example: `cgt-2025**********-*****`) |
| model | string | The model used to generate the video. |
| status | string | Task status (for example: `succeeded`). |
| content.video_url | string | URL of the generated video. |
| usage | object | Token usage details, including `completion_tokens` and `total_tokens`. |
| created_at / updated_at | integer | Unix timestamps for task creation and completion. |
| seed | integer | Generation seed value. |
| resolution / ratio / duration / framespersecond | various | Video output configuration returned with the task. |

#### Example Response

```json
{
  "id": "1504931821587668992",
  "model": "dreamina-seedance-2-0-260128",
  "status": "succeeded",
  "content": {
    "video_url": "https://download.cloudwise.ai/arts/1504931821587668992",
    "expireAt": 1778932174
  },
  "usage": {
    "completion_tokens": 411300,
    "total_tokens": 411300
  },
  "created_at": 1778845306,
  "updated_at": 1778845650,
  "seed": 96802,
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 11,
  "framespersecond": 24,
  "service_tier": "default",
  "execution_expires_after": 172800,
  "generate_audio": true,
  "draft": false
}
```

**Request Example**

```bash
curl 'https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/MTUwNDkzMTgyMTU4NzY2ODk5Mjo6MjAyNi0wNS0xNSAxOTo0MTo0Ng==' \
  --header 'Authorization: Bearer $MAAS_API_KEY'
```

**Response Example**

```json
{
  "id": "1504931821587668992",
  "model": "dreamina-seedance-2-0-260128",
  "status": "succeeded",
  "content": {
    "video_url": "https://download.cloudwise.ai/arts/1504931821587668992",
    "expireAt": 1778932174
  },
  "usage": {
    "completion_tokens": 411300,
    "total_tokens": 411300
  },
  "created_at": 1778845306,
  "updated_at": 1778845650,
  "seed": 96802,
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 11,
  "framespersecond": 24,
  "service_tier": "default",
  "execution_expires_after": 172800,
  "generate_audio": true,
  "draft": false
}
```

---

## BytePlus / Seedance-2.0/2.5 / Query generation task list `GET`

_Official Format_

### Query generation task list

List Seedance 2.0 video generation tasks with pagination and optional filters.

`GET https://api.cloudwise.ai/api/v3/contents/generations/tasks`

### Overview

Retrieve a paginated list of video generation tasks. Use the query parameters below to paginate and filter the results.

### Headers

This endpoint requires specific headers for authentication.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| page_num | integer | - | Page number for pagination. |
| page_size | integer | - | Number of items per page. |
| filter.status | string | - | Filter tasks by status (for example: `succeeded`). |
| filter.task_ids | string | - | Filter tasks by one or more task IDs. |
| filter.model | string | - | Filter tasks by model name. |

### Request Example

```bash
curl --location --request GET 'https://api.cloudwise.ai/api/v3/contents/generations/tasks?filter.model=doubao-seedance-2-0-260128' \
  --header 'Authorization: Bearer $MAAS_API_KEY'
```

### Response

The response contains the total count and the list of matching tasks.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| total | integer | Total number of matching tasks. |
| items | array | List of task objects. Each item follows the same schema as the Query generation task result response. |

#### Example Response

```json
{
  "total": 1,
  "items": [
    {
      "model": "doubao-seedance-2-0-260128",
      "status": "succeeded",
      "content": {
        "video_url": "",
        "expireAt": 1786526890
      },
      "usage": {
        "completion_tokens": 87300,
        "total_tokens": 87300
      },
      "created_at": 1786440325,
      "updated_at": 1786440490,
      "seed": 29674,
      "resolution": "720p",
      "ratio": "16:9",
      "duration": 4,
      "framespersecond": 24,
      "service_tier": "default",
      "execution_expires_after": 172800,
      "generate_audio": true,
      "draft": false,
      "priority": 0,
      "id": "",
      "origin_task": "task_*********",
      "output_format": "mp4"
    }
  ]
}
```

**Request Example**

```bash
curl --location --request GET 'https://api.cloudwise.ai/api/v3/contents/generations/tasks?filter.model=doubao-seedance-2-0-260128' \
  --header 'Authorization: Bearer $MAAS_API_KEY'
```

**Response Example**

```json
{
  "total": 1,
  "items": [
    {
      "model": "doubao-seedance-2-0-260128",
      "status": "succeeded",
      "content": {
        "video_url": "",
        "expireAt": 1786526890
      },
      "usage": {
        "completion_tokens": 87300,
        "total_tokens": 87300
      },
      "created_at": 1786440325,
      "updated_at": 1786440490,
      "seed": 29674,
      "resolution": "720p",
      "ratio": "16:9",
      "duration": 4,
      "framespersecond": 24,
      "service_tier": "default",
      "execution_expires_after": 172800,
      "generate_audio": true,
      "draft": false,
      "priority": 0,
      "id": "",
      "origin_task": "task_*********",
      "output_format": "mp4"
    }
  ]
}
```

---

## BytePlus / Seedance-2.0/2.5 / Delete / cancel task `DELETE`

_Official Format_

### Delete / cancel task

Delete a completed video generation task or cancel a task that is still in progress.

`DELETE https://api.cloudwise.ai/api/v3/contents/generations/tasks/{task_id}`

### Overview

Delete or cancel a Seedance 2.0 generation task by its task ID.

### Headers

This endpoint requires specific headers for authentication.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Path Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string (path) | - | required<br>Append the task ID to the endpoint path. |

### Request Example

```bash
curl --location --request DELETE 'https://api.cloudwise.ai/api/v3/contents/generations/tasks/{task_id}' \
  --header 'Authorization: Bearer $MAAS_API_KEY'
```

**Request Example**

```bash
curl --location --request DELETE 'https://api.cloudwise.ai/api/v3/contents/generations/tasks/{task_id}' \
  --header 'Authorization: Bearer $MAAS_API_KEY'
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / Create asset group `POST`

_Official Format_

### Create asset group

Create an asset group for organizing reference images, videos, or other files used by Seedance 2.0.

`POST https://api.cloudwise.ai/api/v1/assets/groups/create`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| name | string | - | The name of the asset group. Optional. |
| description | string | - | Description of the asset group. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/groups/create' \
--header "Content-Type: application/json" \
--header 'Authorization: Bearer $MAAS_API_KEY' \
--data-raw '{
  "name": "",
  "description": "reference image group"
}'
```

### Response Example

```json
{
    "ResponseMetadata": {
        "RequestId": "202607090805599DDC09FFB363D529238B",
        "Action": "CreateAssetGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "group-**********-qpkq6"
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/groups/create' \
--header "Content-Type: application/json" \
--header 'Authorization: Bearer $MAAS_API_KEY' \
--data-raw '{
  "name": "",
  "description": "reference image group"
}'
```

**Response Example**

```json
{
    "ResponseMetadata": {
        "RequestId": "202607090805599DDC09FFB363D529238B",
        "Action": "CreateAssetGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "group-**********-qpkq6"
    }
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / Update asset group `POST`

_Official Format_

### Update asset group

Update the name or description of an existing asset group.

`POST https://api.cloudwise.ai/api/v1/assets/groups/update`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Id | string | - | required<br>The asset group ID to update. |
| Name | string | - | New group name. |
| Description | string | - | New group description. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/groups/update' \
--header "Content-Type: application/json" \
--header 'Authorization: Bearer $MAAS_API_KEY' \
--data-raw '{
    "Id": "group-*******-s9ftr",
    "Name": "demo-group-updated-default",
    "Description": "updated desc"
}'
```

### Response Example

```json
{
    "ResponseMetadata": {
        "RequestId": "202607090746571CFCE01814B458E6277F",
        "Action": "UpdateAssetGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "group-*********-s9ftr"
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/groups/update' \
--header "Content-Type: application/json" \
--header 'Authorization: Bearer $MAAS_API_KEY' \
--data-raw '{
    "Id": "group-*******-s9ftr",
    "Name": "demo-group-updated-default",
    "Description": "updated desc"
}'
```

**Response Example**

```json
{
    "ResponseMetadata": {
        "RequestId": "202607090746571CFCE01814B458E6277F",
        "Action": "UpdateAssetGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "group-*********-s9ftr"
    }
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / Get asset group detail `POST`

_Official Format_

### Get asset group detail

Query detail information of a specific asset group.

`POST https://api.cloudwise.ai/api/v1/assets/groups/get`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Id | string | - | required<br>The asset group ID to retrieve. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/groups/get' \
--header "Content-Type: application/json" \
--header 'Authorization: Bearer $MAAS_API_KEY' \
--data-raw '{
    "Id": "group-*********-s9ftr"
}'
```

### Response Example

```json
{
    "ResponseMetadata": {
        "RequestId": "20260709074945DC4976C56CC9E5E2A5AD",
        "Action": "GetAssetGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "group-*********-s9ftr",
        "Name": "demo-group-updated-default",
        "Description": "updated desc",
        "GroupType": "AIGC",
        "ProjectName": "default",
        "CreateTime": "2026-07-09T07:46:25Z",
        "UpdateTime": "2026-07-09T07:46:58Z"
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/groups/get' \
--header "Content-Type: application/json" \
--header 'Authorization: Bearer $MAAS_API_KEY' \
--data-raw '{
    "Id": "group-*********-s9ftr"
}'
```

**Response Example**

```json
{
    "ResponseMetadata": {
        "RequestId": "20260709074945DC4976C56CC9E5E2A5AD",
        "Action": "GetAssetGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "group-*********-s9ftr",
        "Name": "demo-group-updated-default",
        "Description": "updated desc",
        "GroupType": "AIGC",
        "ProjectName": "default",
        "CreateTime": "2026-07-09T07:46:25Z",
        "UpdateTime": "2026-07-09T07:46:58Z"
    }
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / Delete asset group `POST`

_Official Format_

### Delete asset group

Delete an existing asset group. Assets inside the group are also removed.

`POST https://api.cloudwise.ai/api/v1/assets/groups/delete`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Id | string | - | required<br>The asset group ID to delete. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/groups/delete' \
--header "Content-Type: application/json" \
--header 'Authorization: Bearer $MAAS_API_KEY' \
--data-raw '{
    "Id": "group-*********-4jtgc"
}'
```

### Response Example

```json
{
    "ResponseMetadata": {
        "RequestId": "20260709074843C07A41E6A5DBA200A531",
        "Action": "DeleteAssetGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "group-*********-4jtgc"
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/groups/delete' \
--header "Content-Type: application/json" \
--header 'Authorization: Bearer $MAAS_API_KEY' \
--data-raw '{
    "Id": "group-*********-4jtgc"
}'
```

**Response Example**

```json
{
    "ResponseMetadata": {
        "RequestId": "20260709074843C07A41E6A5DBA200A531",
        "Action": "DeleteAssetGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "group-*********-4jtgc"
    }
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / List asset groups `POST`

_Official Format_

### List asset groups

List asset groups with optional filters and pagination.

`POST https://api.cloudwise.ai/api/v1/assets/groups/list`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| pageNumber | integer | 1 | Page number, starting from 1. |
| pageSize | integer | 10 | Page size for pagination. |
| Filter.GroupIds | string[] | - | The Id list of the asset groups to which the asset belongs. |
| Filter.GroupType | string | - | required<br>Asset group type. Valid values: `AIGC` (digital characters), `LivenessFace` (real-person portrait). |
| Filter.Name | string | - | Asset group name, up to 64 characters. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/groups/list' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
    "pageNumber": 1,
    "pageSize": 10,
    "Filter": {}
}'
```

### Response Example

```json
{
    "PageNumber": 1,
    "PageSize": 10,
    "Items": [
        {
            "Id": "group-20260709154625-s9ftr",
            "Name": "demo-group-updated-default",
            "Description": "updated desc",
            "GroupType": "AIGC",
            "ProjectName": "default",
            "CreateTime": "2026-07-09T07:46:25Z",
            "UpdateTime": "2026-07-09T07:46:58Z"
        }
    ],
    "TotalCount": 1
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/groups/list' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
    "pageNumber": 1,
    "pageSize": 10,
    "Filter": {}
}'
```

**Response Example**

```json
{
    "PageNumber": 1,
    "PageSize": 10,
    "Items": [
        {
            "Id": "group-20260709154625-s9ftr",
            "Name": "demo-group-updated-default",
            "Description": "updated desc",
            "GroupType": "AIGC",
            "ProjectName": "default",
            "CreateTime": "2026-07-09T07:46:25Z",
            "UpdateTime": "2026-07-09T07:46:58Z"
        }
    ],
    "TotalCount": 1
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / List assets in group `POST`

_Official Format_

### List assets in group

List all assets that belong to a given asset group.

`POST https://api.cloudwise.ai/api/v1/assets/groups/assets`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| groupId | string | - | required<br>The Id of the asset group. |
| pageNumber | integer | 1 | Page number, starting from 1. |
| pageSize | integer | 10 | Page size for pagination. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/groups/assets' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
    "groupId": "group-*********-s9ftr",
    "pageNumber": 1,
    "pageSize": 10
}'
```

### Response Example

```json
{
    "PageNumber": 1,
    "PageSize": 10,
    "Items": [
        {
            "Id": "asset-*********-6bvt8",
            "Name": "test",
            "URL": "",
            "AssetType": "Image",
            "GroupId": "group-*********-s9ftr",
            "Status": "Active",
            "Moderation": {
                "Strategy": "Skip"
            },
            "CreateTime": "2026-07-09T07:55:38Z",
            "UpdateTime": "2026-07-09T07:55:41Z",
            "ProjectName": "default"
        }
    ],
    "TotalCount": 1
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/groups/assets' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
    "groupId": "group-*********-s9ftr",
    "pageNumber": 1,
    "pageSize": 10
}'
```

**Response Example**

```json
{
    "PageNumber": 1,
    "PageSize": 10,
    "Items": [
        {
            "Id": "asset-*********-6bvt8",
            "Name": "test",
            "URL": "",
            "AssetType": "Image",
            "GroupId": "group-*********-s9ftr",
            "Status": "Active",
            "Moderation": {
                "Strategy": "Skip"
            },
            "CreateTime": "2026-07-09T07:55:38Z",
            "UpdateTime": "2026-07-09T07:55:41Z",
            "ProjectName": "default"
        }
    ],
    "TotalCount": 1
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / Upload asset to group `POST`

_Official Format_

### Upload asset to group

Upload a file (image or video) into an asset group. The asset library supports NSFW moderation.

`POST https://api.cloudwise.ai/api/v1/assets/create`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| name | string | - | The name of the asset. |
| description | string | - | Asset description. |
| assetType | string | - | Asset type. Valid values: `Image`, `Video`. |
| groupId | string | - | required<br>The asset group Id that the asset belongs to. |
| url | string | - | required<br>Publicly accessible URL of the file to upload. |
| Moderation.Strategy | string | - | Moderation strategy. Set to `Skip` to skip moderation. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/create' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
  "name": "",
  "description": "reference image",
  "assetType": "Image",
  "groupId": "group-*******-8bfhv",
  "url": "https://tos-prmanent-hk.tos-cn-hongkong.bytepluses.com/20260203-162835.jpeg",
  "Moderation": {
      "Strategy": "Skip"
  }
}'
```

### Response Example

```json
{
    "ResponseMetadata": {
        "RequestId": "20260328000000000000000000000000",
        "Action": "CreateAsset",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "Asset-2026**********-*****"
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/create' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
  "name": "",
  "description": "reference image",
  "assetType": "Image",
  "groupId": "group-*******-8bfhv",
  "url": "https://tos-prmanent-hk.tos-cn-hongkong.bytepluses.com/20260203-162835.jpeg",
  "Moderation": {
      "Strategy": "Skip"
  }
}'
```

**Response Example**

```json
{
    "ResponseMetadata": {
        "RequestId": "20260328000000000000000000000000",
        "Action": "CreateAsset",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "Asset-2026**********-*****"
    }
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / Update asset `POST`

_Official Format_

### Update asset

Update the name of an existing asset.

`POST https://api.cloudwise.ai/api/v1/assets/update`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Id | string | - | required<br>The asset Id to update. |
| Name | string | - | New asset name. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/update' \
--header "Content-Type: application/json" \
--header 'Authorization: Bearer $MAAS_API_KEY' \
--data-raw '{
    "Id": "asset-20260709155538-6bvt8",
    "Name": "demo-asset-updated-byteplus"
}'
```

### Response Example

```json
{
    "ResponseMetadata": {
        "RequestId": "2026070907592287D91A6DF54C16F5CFC8",
        "Action": "UpdateAsset",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "asset-**********-6bvt8"
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/update' \
--header "Content-Type: application/json" \
--header 'Authorization: Bearer $MAAS_API_KEY' \
--data-raw '{
    "Id": "asset-20260709155538-6bvt8",
    "Name": "demo-asset-updated-byteplus"
}'
```

**Response Example**

```json
{
    "ResponseMetadata": {
        "RequestId": "2026070907592287D91A6DF54C16F5CFC8",
        "Action": "UpdateAsset",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "asset-**********-6bvt8"
    }
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / Get asset detail `POST`

_Official Format_

### Get asset detail

Query detail information of a specific asset.

`POST https://api.cloudwise.ai/api/v1/assets/get`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Id | string | - | required<br>The asset Id to retrieve. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/get' \
--header "Content-Type: application/json" \
--header 'Authorization: Bearer $MAAS_API_KEY' \
--data-raw '{
    "Id": "asset-*********-6bvt8"
}'
```

### Response Example

```json
{
    "ResponseMetadata": {
        "RequestId": "202607090758005704119D66FA434A6A50",
        "Action": "GetAsset",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "asset-**********-6bvt8",
        "Name": "test",
        "URL": "",
        "AssetType": "Image",
        "GroupId": "group-***********-s9ftr",
        "Status": "Active",
        "Moderation": {
            "Strategy": "Skip"
        },
        "CreateTime": "2026-07-09T07:55:38Z",
        "UpdateTime": "2026-07-09T07:55:41Z",
        "ProjectName": "default"
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/get' \
--header "Content-Type: application/json" \
--header 'Authorization: Bearer $MAAS_API_KEY' \
--data-raw '{
    "Id": "asset-*********-6bvt8"
}'
```

**Response Example**

```json
{
    "ResponseMetadata": {
        "RequestId": "202607090758005704119D66FA434A6A50",
        "Action": "GetAsset",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "Id": "asset-**********-6bvt8",
        "Name": "test",
        "URL": "",
        "AssetType": "Image",
        "GroupId": "group-***********-s9ftr",
        "Status": "Active",
        "Moderation": {
            "Strategy": "Skip"
        },
        "CreateTime": "2026-07-09T07:55:38Z",
        "UpdateTime": "2026-07-09T07:55:41Z",
        "ProjectName": "default"
    }
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / Delete asset `POST`

_Official Format_

### Delete asset

Delete an existing asset.

`POST https://api.cloudwise.ai/api/v1/assets/delete`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| id | string | - | required<br>The asset Id to delete. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/delete' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
  "id": "asset-********-bz6zp"
}'
```

### Response Example

```json
{
    "ResponseMetadata": {
        "Action": "DeleteAsset",
        "Region": "cn-beijing",
        "RequestId": "2026071417839953791521378976345147",
        "Service": "ark",
        "Version": "2024-01-01"
    },
    "Result": {
        "Id": "asset-20260714101449-mswts"
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/delete' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
  "id": "asset-********-bz6zp"
}'
```

**Response Example**

```json
{
    "ResponseMetadata": {
        "Action": "DeleteAsset",
        "Region": "cn-beijing",
        "RequestId": "2026071417839953791521378976345147",
        "Service": "ark",
        "Version": "2024-01-01"
    },
    "Result": {
        "Id": "asset-20260714101449-mswts"
    }
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / List assets `POST`

_Official Format_

### List assets

List assets with optional filters and pagination.

`POST https://api.cloudwise.ai/api/v1/assets/list`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| PageNumber | integer | 1 | Page number, starting from 1. |
| PageSize | integer | 10 | Page size for pagination. |
| Filter | object | - | Filter conditions. See the **Filter** section below. |

### Filter

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Filter.GroupIds | string[] | - | A list of Asset Group IDs that the Assets belong to. |
| Filter.GroupType | string | - | required<br>The Asset Group type. Valid values:<br>• `AIGC`: Digital characters<br>• `LivenessFace`: Real-person portrait |
| Filter.Statuses | string[] | - | Asset status. Valid values:<br>• `Active`: Pre-processing completed and can be used<br>• `Processing`: Pre-processing in progress and cannot be used<br>• `Failed`: Pre-processing failed |
| Filter.Name | string | - | The Asset name, up to 64 characters. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/list' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
    "Filter": {},
    "PageNumber": 1,
    "PageSize": 10
}'
```

### Response Example

```json
{
    "PageNumber": 1,
    "PageSize": 10,
    "Items": [
        {
            "AssetType": "Image",
            "CreateTime": "2026-07-14T02:14:50Z",
            "GroupId": "group-20260713173752-xwrs9",
            "Id": "asset-20260714101449-mswts",
            "Moderation": {
                "Strategy": "Default"
            },
            "Name": "test2",
            "ProjectName": "default",
            "Status": "Active",
            "URL": "https://tos-prmanent-hk.tos-cn-hongkong.bytepluses.com/20260203-162835.jpeg",
            "UpdateTime": "2026-07-14T10:15:02Z"
        }
    ],
    "TotalCount": 1
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/list' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
    "Filter": {},
    "PageNumber": 1,
    "PageSize": 10
}'
```

**Response Example**

```json
{
    "PageNumber": 1,
    "PageSize": 10,
    "Items": [
        {
            "AssetType": "Image",
            "CreateTime": "2026-07-14T02:14:50Z",
            "GroupId": "group-20260713173752-xwrs9",
            "Id": "asset-20260714101449-mswts",
            "Moderation": {
                "Strategy": "Default"
            },
            "Name": "test2",
            "ProjectName": "default",
            "Status": "Active",
            "URL": "https://tos-prmanent-hk.tos-cn-hongkong.bytepluses.com/20260203-162835.jpeg",
            "UpdateTime": "2026-07-14T10:15:02Z"
        }
    ],
    "TotalCount": 1
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / Liveness face - create H5 session `POST`

_Official Format_

### Liveness face - create H5 session

Create an H5 session for real-person portrait (liveness face) authentication. The returned H5 link is used to launch the authentication flow.

`POST https://api.cloudwise.ai/api/v1/assets/visual-validate/session`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| callbackURL | string | - | required<br>Callback URL invoked when authentication completes. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/visual-validate/session' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
  "callbackURL": "https://www.example.com/callback"
}'
```

### Response Example

```json
{
    "ResponseMetadata": {
        "RequestId": "20260709080854942C2D15956E06C52E28",
        "Action": "CreateVisualValidateSession",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "BytedToken": "202607091608554DA6603817FA56D2F68D",
        "H5Link": "",
        "CallbackURL": "https://www.example.com/callback"
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/visual-validate/session' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
  "callbackURL": "https://www.example.com/callback"
}'
```

**Response Example**

```json
{
    "ResponseMetadata": {
        "RequestId": "20260709080854942C2D15956E06C52E28",
        "Action": "CreateVisualValidateSession",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "BytedToken": "202607091608554DA6603817FA56D2F68D",
        "H5Link": "",
        "CallbackURL": "https://www.example.com/callback"
    }
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / Liveness face - get result `POST`

_Official Format_

### Liveness face - get result

Retrieve the authentication result of a liveness face session. Returns the asset group Id that stores the authenticated real-person portrait.

`POST https://api.cloudwise.ai/api/v1/assets/visual-validate/result`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| BytedToken | string | - | required<br>The token returned by the Create H5 Session endpoint. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/visual-validate/result' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
  "BytedToken": "202607091608554DA6603817FA56D2F68D"
}'
```

### Response Example

```json
{
    "ResponseMetadata": {
        "RequestId": "20260709084132F5EB8CE0E8096A49B6D2",
        "Action": "GetVisualValidateResult",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "GroupId": "group-************-9tk8l"
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/assets/visual-validate/result' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
  "BytedToken": "202607091608554DA6603817FA56D2F68D"
}'
```

**Response Example**

```json
{
    "ResponseMetadata": {
        "RequestId": "20260709084132F5EB8CE0E8096A49B6D2",
        "Action": "GetVisualValidateResult",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "ap-southeast-1"
    },
    "Result": {
        "GroupId": "group-************-9tk8l"
    }
}
```

---

## BytePlus / Seedance-2.0/2.5 / Asset Operations / Generate video with uploaded asset `POST`

_Official Format_

### Generate video with uploaded asset

Generate a video from an uploaded reference asset. Pass the asset in the content array using the asset:// URL scheme.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required<br>Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | dreamina-seedance-2-0-260128 | required<br>The ID of the model to call. |
| content | object[] | - | required<br>Input references supporting text, image, video. Pass an uploaded asset as `{ "type": "image_url", "image_url": { "url": "asset://asset-****" }, "role": "reference_image" }`. |
| ratio | string | - | Aspect ratio of the output video, e.g. `16:9`. |
| duration | integer | - | Generated video duration in seconds. |
| generate_audio | boolean | - | Whether the generated video includes synchronized sound. |
| watermark | boolean | - | Whether to add the AI watermark. |

### Request Example

```bash
curl https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MAAS_API_KEY" \
  -d '{
    "model": "dreamina-seedance-2-0-260128",
    "content": [
        { "type": "text", "text": "cyberpunk" },
        {
            "type": "image_url",
            "image_url": { "url": "asset://asset-******-xgmnd" },
            "role": "reference_image"
        }
    ],
    "generate_audio": true,
    "ratio": "16:9",
    "duration": 11,
    "watermark": false
}'
```

### Response Example

```json
{"id":"MTUwNDkzMTgyMTU4NzY2ODk5Mjo6MjAyNi0wNS0xNSAxOTo0MTo0Ng=="}
```

**Request Example**

```bash
curl https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MAAS_API_KEY" \
  -d '{
    "model": "dreamina-seedance-2-0-260128",
    "content": [
        { "type": "text", "text": "cyberpunk" },
        {
            "type": "image_url",
            "image_url": { "url": "asset://asset-******-xgmnd" },
            "role": "reference_image"
        }
    ],
    "generate_audio": true,
    "ratio": "16:9",
    "duration": 11,
    "watermark": false
}'
```

**Response Example**

```json
{"id":"MTUwNDkzMTgyMTU4NzY2ODk5Mjo6MjAyNi0wNS0xNSAxOTo0MTo0Ng=="}
```

---

## BytePlus / Seedance-2.0/2.5 / Video enhance `POST`

_Official Format_

### Video enhance

For Video Enhance, replace only the model value; all other request parameters are the same as Seedance 2.0 Generate Video.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`

### Overview

Enhance an existing video using Seedance 2.0. Replace the model value with an enhance model ID while keeping the same request schema as Generate Video.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | dreamina-seedance-2-0-260128-enhance | required<br>For Video Enhance, replace only the `model` value; all other request parameters are the same as Seedance 2.0 Generate Video. Use `dreamina-seedance-2-0-260128-enhance` for 720p and 1080p output, or `dreamina-seedance-2-0-260128-fast-enhance` for 720p output. |
| content | object[] | - | required<br>Uses the same `content` array structure as Generate Video. The PDF only states that video enhance replaces the model name, so text, image, video, and audio references follow the same schema as Seedance 2.0. |
| ratio | string | - | Uses the same field as Generate Video. The PDF sample uses `16:9`. |
| duration | integer | - | Uses the same field as Generate Video. The PDF sample uses `11`. |
| generate_audio | boolean | - | Uses the same field as Generate Video. The PDF sample sets this field to `true`. |
| watermark | boolean | - | Uses the same field as Generate Video. The PDF sample sets this field to `false`. |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/aiproducts/video/seedance' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer $MAAS_API_KEY' \
  -d '{
    "model": "dreamina-seedance-2-0-260128-enhance",
    "content": [
    {
      "type": "text",
      "text": "Use the first-person POV framing from [Video 1] throughout, and use [Audio 1] as the background music throughout. First-person POV fruit tea promotional ad, seedance limited-edition apple fruit tea; opening frame is [Image 1], your hand picks a dew-covered Aksu red apple, a light, crisp apple tapping sound; 2–4 seconds: fast cuts, your hand drops apple chunks into a shaker, adds ice and tea base, shakes forcefully, ice clinking and shaking sounds sync with upbeat rhythmic beats, background audio: {Fresh-cut, shaken fresh}; 4–6 seconds: first-person close-up of the finished drink, layered fruit tea is poured into a clear cup, your hand gently squeezes milk foam to spread across the top, a pink brand sticker is applied to the cup, the camera moves closer to show the layered textures of the foam and fruit tea; 6–8 seconds: first-person hand-held toast shot, you raise the fruit tea from [Image 2] toward the camera (simulating handing it to the viewer), the cup label is clearly visible, background audio {Take a sip of fresh refreshment}, the final frame freezes on Image 2. All background voice audio uses a female voice."
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic1.jpg"
      },
      "role": "reference_image"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic2.jpg"
      },
      "role": "reference_image"
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_video/r2v_tea_video1.mp4"
      },
      "role": "reference_video"
    },
    {
      "type": "audio_url",
      "audio_url": {
        "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_audio/r2v_tea_audio1.mp3"
      },
      "role": "reference_audio"
    }
  ],
  "generate_audio": true,
  "ratio": "16:9",
  "duration": 11,
  "watermark": false
}'
```

### Response

The response contains the generated video task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | The ID of the video generation task. Creating a video generation task is an asynchronous interface. After obtaining the ID, you need to query the status of the video generation task through Querying the information about a video generation task. When the task is successful, the video_url of the generated video will be output. |

#### Example Response

```json
{"id":"MTUwNDkzMTgyMTU4NzY2ODk5Mjo6MjAyNi0wNS0xNSAxOTo0MTo0Ng=="}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/aiproducts/video/seedance' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer $MAAS_API_KEY' \
  -d '{
    "model": "dreamina-seedance-2-0-260128-enhance",
    "content": [
    {
      "type": "text",
      "text": "Use the first-person POV framing from [Video 1] throughout, and use [Audio 1] as the background music throughout. First-person POV fruit tea promotional ad, seedance limited-edition apple fruit tea; opening frame is [Image 1], your hand picks a dew-covered Aksu red apple, a light, crisp apple tapping sound; 2–4 seconds: fast cuts, your hand drops apple chunks into a shaker, adds ice and tea base, shakes forcefully, ice clinking and shaking sounds sync with upbeat rhythmic beats, background audio: {Fresh-cut, shaken fresh}; 4–6 seconds: first-person close-up of the finished drink, layered fruit tea is poured into a clear cup, your hand gently squeezes milk foam to spread across the top, a pink brand sticker is applied to the cup, the camera moves closer to show the layered textures of the foam and fruit tea; 6–8 seconds: first-person hand-held toast shot, you raise the fruit tea from [Image 2] toward the camera (simulating handing it to the viewer), the cup label is clearly visible, background audio {Take a sip of fresh refreshment}, the final frame freezes on Image 2. All background voice audio uses a female voice."
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic1.jpg"
      },
      "role": "reference_image"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/r2v_tea_pic2.jpg"
      },
      "role": "reference_image"
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_video/r2v_tea_video1.mp4"
      },
      "role": "reference_video"
    },
    {
      "type": "audio_url",
      "audio_url": {
        "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_audio/r2v_tea_audio1.mp3"
      },
      "role": "reference_audio"
    }
  ],
  "generate_audio": true,
  "ratio": "16:9",
  "duration": 11,
  "watermark": false
}'
```

**Response Example**

```json
{"id":"MTUwNDkzMTgyMTU4NzY2ODk5Mjo6MjAyNi0wNS0xNSAxOTo0MTo0Ng=="}
```

---

## BytePlus / Seedance-2.0/2.5 / Callback Support `POST`

_Official Format_

### Callback Support

Provide a callback_url in the Generate Video request body, and the server will asynchronously POST the task result to your callback endpoint once generation completes.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`

### Overview

Callback Support is not a separate endpoint. It is an optional field on the Generate Video request. When `callback_url` is provided, the server will invoke that URL with the task result payload once the task reaches a terminal state (`succeeded` or `failed`). You do not need to poll the task result endpoint when a callback URL is set.

### Additional Request Parameter

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| callback_url | string | - | Publicly accessible URL to receive the task callback. The server sends a POST request with the task payload once the task reaches a terminal state. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/aiproducts/video/seedance' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
    "model": "dreamina-seedance-2-0-fast-260128",
    "content": [
        {
            "type": "text",
            "text": "A man slowly aging"
        }
    ],
    "generate_audio": true,
    "ratio": "16:9",
    "duration": 4,
    "watermark": false,
    "resolution": "480p",
    "callback_url": "https://wedding-dom-barnes-dense.trycloudflare.com"
}'
```

### Callback Payload — Success

When the task succeeds, the callback body carries the full task result:

```json
{
    "model": "dreamina-seedance-2-0-fast-260128",
    "status": "succeeded",
    "content": {
        "video_url": "",
        "expireAt": 1781688064
    },
    "usage": {
        "completion_tokens": 40594,
        "total_tokens": 40594
    },
    "created_at": 1781601534,
    "updated_at": 1781601664,
    "seed": 28080,
    "resolution": "480p",
    "ratio": "16:9",
    "duration": 4,
    "framespersecond": 24,
    "service_tier": "default",
    "execution_expires_after": 172800,
    "generate_audio": true,
    "draft": false,
    "priority": 0,
    "id": "MTUxNjQ5MjI4MDAyNzIyNjExMjo6MjAyNi0wNi0xNiAxNzoxODo1NA==",
    "origin_task": "cgt-20260616171854-chp54"
}
```

### Callback Payload — Failure

When the task fails, the callback body carries the failure reason under `error.message`:

```json
{
    "model": "dreamina-seedance-2-0-fast-260128",
    "status": "failed",
    "created_at": 1781601518,
    "updated_at": 1781601706,
    "service_tier": "default",
    "execution_expires_after": 172800,
    "generate_audio": true,
    "draft": false,
    "priority": 0,
    "error": {
        "message": "The request failed because the output video may be related to copyright restrictions. Request id: 021781601518353000000000000000000000ffffc0a855f9782c88"
    },
    "id": "MTUxNjQ5MjIxMDQ5MzEwODIyNDo6MjAyNi0wNi0xNiAxNzoxODozOA==",
    "origin_task": "cgt-20260616171838-ntzcl"
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/aiproducts/video/seedance' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer $MAAS_API_KEY" \
--data-raw '{
    "model": "dreamina-seedance-2-0-fast-260128",
    "content": [
        {
            "type": "text",
            "text": "A man slowly aging"
        }
    ],
    "generate_audio": true,
    "ratio": "16:9",
    "duration": 4,
    "watermark": false,
    "resolution": "480p",
    "callback_url": "https://wedding-dom-barnes-dense.trycloudflare.com"
}'
```

**Response Example**

```json
{
    "model": "dreamina-seedance-2-0-fast-260128",
    "status": "succeeded",
    "content": {
        "video_url": "",
        "expireAt": 1781688064
    },
    "usage": {
        "completion_tokens": 40594,
        "total_tokens": 40594
    },
    "created_at": 1781601534,
    "updated_at": 1781601664,
    "seed": 28080,
    "resolution": "480p",
    "ratio": "16:9",
    "duration": 4,
    "framespersecond": 24,
    "service_tier": "default",
    "execution_expires_after": 172800,
    "generate_audio": true,
    "draft": false,
    "priority": 0,
    "id": "MTUxNjQ5MjI4MDAyNzIyNjExMjo6MjAyNi0wNi0xNiAxNzoxODo1NA==",
    "origin_task": "cgt-20260616171854-chp54"
}
```

---

## BytePlus / Seedance-1.5-pro / Image-to-Video-First Frame `POST`

_Official Format_

### Image-to-Video-First Frame

Seedance 1.5 is the latest video generation model launched by ByteDance. Based on the functionalities Seedance 1.0 Pro functionalities, Seedance Pro 1.5 can automatically generate matching voices, sound effects, and background music based on text prompts and visual content.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`

### Overview

This endpoint provides image-to-video-first frame functionality using the Seedance-1.5-pro model. Generate video content based on image input.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The ID of the model that you want to call. e.g., "seedance-1-5-pro-251215" |
| content | object[] | - | required<br>The input text and image information for the model to generate a video.<br><br>**Information type:**<br><br>**Text information object:** The input text information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "text".<br>- `content.text` (string, required): The input text information for the model, which describes the video to be generated. The content includes:<br>* Text prompt (required): You can use Chinese and English characters.<br>* Parameters (optional): You can add --[parameters] after the text prompt to control the specifications of the output video. For more information, refer to Text commands for models (optional).<br><br>**Image information object:** The input image information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "image_url". Supports image URL or image Base64 encoding.<br>- `content.image_url` (object, required): The input image object for the model.<br>* `content.image_url.url` (string, required): The image information, which can be an image URL or the Base64-encoded content of an image.<br><br>**Image Format Requirements:**<br>- It must be in one of the following formats: jpeg, png, webp, bmp, tiff, gif.<br>- Its aspect ratio must be in the range of 0.4 to 2.5.<br>- Its shorter side must be greater than 300 pixels, and its longer side must be less than 6,000 pixels.<br>- It must be smaller than 30 MB in size. |
| return_last_frame | Boolean | false | - **true:** Returns the last frame image of the generated video. After setting this parameter to true, you can obtain the last frame image by calling the Querying the information about a video generation task. The last frame image is in PNG format, with its pixel width and height consistent with those of the generated video, and it contains no watermarks. Using this parameter allows the generation of multiple consecutive videos: the last frame of the previously generated video is used as the first frame of the next video task, enabling quick generation of multiple consecutive videos.<br>- **false:** Does not return the last frame image of the generated video. |
| resolution<br>Abbreviation: rs | string | 720p<br>(for seedance-1-5-pro-251215) | The resolution of the output video. Valid values: 480p, 720p.<br><br>This parameter can be specified in the text prompt using `--rs 480p`, `--rs 720p`, or `--rs 1080p`. |
| ratio<br>Abbreviation: rt | string | 16:9<br>(for text-to-video)<br>adaptive<br>(for image-to-video) | The aspect ratio of the output video. Valid values: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive (The optimal aspect ratio is automatically selected based on the uploaded image).<br><br>This parameter can be specified in the text prompt using `--rt 16:9`, `--rt 4:3`, etc. |
| duration<br>Abbreviation: dur | integer | 5 | Choose either duration or frames; frames takes priority over duration. If you want to generate a video of an integer number of seconds, it is recommended to specify duration.<br><br>The duration of the output video. Unit: seconds. Value range: 4~12 seconds.<br><br>This parameter can be specified in the text prompt using `--dur 5`. |
| frames<br>Abbreviation: frames | Integer | - | Choose either duration or frames; frames takes priority over duration. If you want to generate a video with a fractional second duration, it is recommended to specify frames.<br><br>Number of frames for the output video. By specifying the number of frames, you can flexibly control the length of the generated video, including videos with fractional second durations.<br><br>Calculation formula: Number of Frames = Duration x Frame Rate (24).<br>Value range: Supports all integer values within the range [29, 289] that conform to the format 25 + 4n, where n is a positive integer.<br><br>This parameter can be specified in the text prompt using `--frames 57`. |
| framepersecond<br>Abbreviation: fps | integer | 24 | The frame rate of the output video, which specifies the number of images displayed in the video per second. Valid values: 24.<br><br>This parameter can be specified in the text prompt using `--fps 24`. |
| seed<br>Abbreviation: seed | integer | -1 | The seed, which is an integer that controls the randomness of the output content. Valid values: integers within the range of [-1, 2^32-1].<br><br>**Note:** If the seed parameter is not specified or is set to -1, a random number is used. Changing the seed value is a way to obtain different outputs for the same request. Using the same seed value for the same request generates similar but not necessarily identical outputs.<br><br>This parameter can be specified in the text prompt using `--seed 12345`. |
| camerafixed<br>Abbreviation: cf<br>The reference-image-to-video is not supported | boolean | false | Specifies whether to fix the camera. Valid values:<br>- **true:** fixes the camera. The platform appends an instruction to fix the camera to your prompt, but does not guarantee the actual effect.<br>- **false:** does not fix the camera.<br><br>This parameter can be specified in the text prompt using `--cf true` or `--cf false`. |
| watermark<br>Abbreviation: wm | boolean | false | Specifies whether to add watermarks to the output video. Valid values:<br>- **false:** does not add watermarks.<br>- **true:** adds watermarks.<br><br>This parameter can be specified in the text prompt using `--wm true` or `--wm false`. |
| generate_audio | boolean | true | Only supported by Seedance 1.5 pro. Controls whether the generated video includes audio synchronized with the visuals.<br>- **true:** Outputs a video with synchronized audio, including voice, sound effects, and background music auto-generated from the prompt and visual content.<br>- **false:** Outputs a silent video. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedance-1-5-pro-251215",
    "generate_audio": true,
    "content": [
        {
            "type": "text",
        "text": "Create a tense movie clip of this boxing match. Use quick cuts, dramatic lighting, and a suspenseful score. Highlight the fighters' intensity and the arena's pressure.  --resolution 720p --duration 5 --ratio 16:9  --camerafixed false"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://tos-0901-beijing.tos-cn-beijing.bytepluses.com.cn/image-generator/674fdd9a-bf03-460e-a689-62cccbb505f9.png"
            }
        }
    ]
}'
```

### Response

The response contains the generated video task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | The ID of the video generation task. Creating a video generation task is an asynchronous interface. After obtaining the ID, you need to query the status of the video generation task through Querying the information about a video generation task. When the task is successful, the video_url of the generated video will be output. |

#### Example Response

```json
{
  "id": "MTQ1************jowNQ=="
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedance-1-5-pro-251215",
    "generate_audio": true,
    "content": [
        {
            "type": "text",
        "text": "Create a tense movie clip of this boxing match. Use quick cuts, dramatic lighting, and a suspenseful score. Highlight the fighters' intensity and the arena's pressure.  --resolution 720p --duration 5 --ratio 16:9  --camerafixed false"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://tos-0901-beijing.tos-cn-beijing.bytepluses.com.cn/image-generator/674fdd9a-bf03-460e-a689-62cccbb505f9.png"
            }
        }
    ]
}'
```

**Response Example**

```json
{
  "id": "MTQ1************jowNQ=="
}
```

---

## BytePlus / Seedance-1.5-pro / Image-to-Video-First Frame and Last Frame `POST`

_Official Format_

### Image-to-Video-First Frame and Last Frame

Seedance 1.5 is the latest video generation model launched by ByteDance. Based on the functionalities Seedance 1.0 Pro functionalities, Seedance Pro 1.5 can automatically generate matching voices, sound effects, and background music based on text prompts and visual content.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`

### Overview

Generate the target video based on your first-frame image + text prompt (optional) + parameters (optional).

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The ID of the model that you want to call. e.g., "seedance-1-5-pro-251215" |
| content | object[] | - | required<br>The input text and image information for the model to generate a video.<br><br>**Information type:**<br><br>**Text information object:** The input text information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "text".<br>- `content.text` (string, required): The input text information for the model, which describes the video to be generated. The content includes:<br>* Text prompt (required): You can use Chinese and English characters.<br>* Parameters (optional): You can add --[parameters] after the text prompt to control the specifications of the output video. For more information, refer to Text commands for models (optional).<br><br>**Image information object:** The input image information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "image_url". Supports image URL or image Base64 encoding.<br>- `content.image_url` (object, required): The input image object for the model.<br>* `content.image_url.url` (string, required): The image information, which can be an image URL or the Base64-encoded content of an image.<br><br>**Image Format Requirements:**<br>- It must be in one of the following formats: jpeg, png, webp, bmp, tiff, gif.<br>- Its aspect ratio must be in the range of 0.4 to 2.5.<br>- Its shorter side must be greater than 300 pixels, and its longer side must be less than 6,000 pixels.<br>- It must be smaller than 30 MB in size. |
| return_last_frame | Boolean | false | - **true:** Returns the last frame image of the generated video. After setting this parameter to true, you can obtain the last frame image by calling the Querying the information about a video generation task. The last frame image is in PNG format, with its pixel width and height consistent with those of the generated video, and it contains no watermarks. Using this parameter allows the generation of multiple consecutive videos: the last frame of the previously generated video is used as the first frame of the next video task, enabling quick generation of multiple consecutive videos.<br>- **false:** Does not return the last frame image of the generated video. |
| resolution<br>Abbreviation: rs | string | 720p<br>(for seedance-1-5-pro-251215) | The resolution of the output video. Valid values: 480p, 720p.<br><br>This parameter can be specified in the text prompt using `--rs 480p`, `--rs 720p`, or `--rs 1080p`. |
| ratio<br>Abbreviation: rt | string | 16:9<br>(for text-to-video)<br>adaptive<br>(for image-to-video) | The aspect ratio of the output video. Valid values: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive (The optimal aspect ratio is automatically selected based on the uploaded image).<br><br>This parameter can be specified in the text prompt using `--rt 16:9`, `--rt 4:3`, etc. |
| duration<br>Abbreviation: dur | integer | 5 | Choose either duration or frames; frames takes priority over duration. If you want to generate a video of an integer number of seconds, it is recommended to specify duration.<br><br>The duration of the output video. Unit: seconds. Value range: 4~12 seconds.<br><br>This parameter can be specified in the text prompt using `--dur 5`. |
| frames<br>Abbreviation: frames | Integer | - | Choose either duration or frames; frames takes priority over duration. If you want to generate a video with a fractional second duration, it is recommended to specify frames.<br><br>Number of frames for the output video. By specifying the number of frames, you can flexibly control the length of the generated video, including videos with fractional second durations.<br><br>Calculation formula: Number of Frames = Duration x Frame Rate (24).<br>Value range: Supports all integer values within the range [29, 289] that conform to the format 25 + 4n, where n is a positive integer.<br><br>This parameter can be specified in the text prompt using `--frames 57`. |
| framepersecond<br>Abbreviation: fps | integer | 24 | The frame rate of the output video, which specifies the number of images displayed in the video per second. Valid values: 24.<br><br>This parameter can be specified in the text prompt using `--fps 24`. |
| seed<br>Abbreviation: seed | integer | -1 | The seed, which is an integer that controls the randomness of the output content. Valid values: integers within the range of [-1, 2^32-1].<br><br>**Note:** If the seed parameter is not specified or is set to -1, a random number is used. Changing the seed value is a way to obtain different outputs for the same request. Using the same seed value for the same request generates similar but not necessarily identical outputs.<br><br>This parameter can be specified in the text prompt using `--seed 12345`. |
| camerafixed<br>Abbreviation: cf<br>The reference-image-to-video is not supported | boolean | false | Specifies whether to fix the camera. Valid values:<br>- **true:** fixes the camera. The platform appends an instruction to fix the camera to your prompt, but does not guarantee the actual effect.<br>- **false:** does not fix the camera.<br><br>This parameter can be specified in the text prompt using `--cf true` or `--cf false`. |
| watermark<br>Abbreviation: wm | boolean | false | Specifies whether to add watermarks to the output video. Valid values:<br>- **false:** does not add watermarks.<br>- **true:** adds watermarks.<br><br>This parameter can be specified in the text prompt using `--wm true` or `--wm false`. |
| generate_audio | boolean | true | Only supported by Seedance 1.5 pro. Controls whether the generated video includes audio synchronized with the visuals.<br>- **true:** Outputs a video with synchronized audio, including voice, sound effects, and background music auto-generated from the prompt and visual content.<br>- **false:** Outputs a silent video. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedance-1-5-pro-251215",
    "generate_audio": true,
    "content": [
         {
            "type": "text",
            "text": "Create a 360-degree orbiting camera shot based on this photo."
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_first_frame.jpeg"
            },
            "role": "first_frame"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_last_frame.jpeg"
            },
            "role": "last_frame"
        }
    ]
}'
```

### Response

The response contains the generated video task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | The ID of the video generation task. Creating a video generation task is an asynchronous interface. After obtaining the ID, you need to query the status of the video generation task through Querying the information about a video generation task. When the task is successful, the video_url of the generated video will be output. |

#### Example Response

```json
{
  "id": "MTQ1************jowNQ=="
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedance-1-5-pro-251215",
    "generate_audio": true,
    "content": [
         {
            "type": "text",
            "text": "Create a 360-degree orbiting camera shot based on this photo."
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_first_frame.jpeg"
            },
            "role": "first_frame"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_last_frame.jpeg"
            },
            "role": "last_frame"
        }
    ]
}'
```

**Response Example**

```json
{
  "id": "MTQ1************jowNQ=="
}
```

---

## BytePlus / Seedance-1.5-pro / Text to Video `POST`

_Official Format_

### Text to Video

Seedance 1.5 is the latest video generation model launched by ByteDance. Based on the functionalities Seedance 1.0 Pro functionalities, Seedance Pro 1.5 can automatically generate matching voices, sound effects, and background music based on text prompts and visual content.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`

### Overview

This endpoint provides text to video functionality using the Seedance-1.5-pro model. Generate video content based on text prompt.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The ID of the model that you want to call. e.g., "seedance-1-5-pro-251215" |
| content | object[] | - | required<br>The input text and image information for the model to generate a video.<br><br>**Information type:**<br><br>**Text information object:** The input text information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "text".<br>- `content.text` (string, required): The input text information for the model, which describes the video to be generated. The content includes:<br>* Text prompt (required): You can use Chinese and English characters.<br>* Parameters (optional): You can add --[parameters] after the text prompt to control the specifications of the output video. For more information, refer to Text commands for models (optional).<br><br>**Image information object:** The input image information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "image_url". Supports image URL or image Base64 encoding.<br>- `content.image_url` (object, required): The input image object for the model.<br>* `content.image_url.url` (string, required): The image information, which can be an image URL or the Base64-encoded content of an image.<br><br>**Image Format Requirements:**<br>- It must be in one of the following formats: jpeg, png, webp, bmp, tiff, gif.<br>- Its aspect ratio must be in the range of 0.4 to 2.5.<br>- Its shorter side must be greater than 300 pixels, and its longer side must be less than 6,000 pixels.<br>- It must be smaller than 30 MB in size. |
| return_last_frame | Boolean | false | - **true:** Returns the last frame image of the generated video. After setting this parameter to true, you can obtain the last frame image by calling the Querying the information about a video generation task. The last frame image is in PNG format, with its pixel width and height consistent with those of the generated video, and it contains no watermarks. Using this parameter allows the generation of multiple consecutive videos: the last frame of the previously generated video is used as the first frame of the next video task, enabling quick generation of multiple consecutive videos.<br>- **false:** Does not return the last frame image of the generated video. |
| resolution<br>Abbreviation: rs | string | 720p<br>(for seedance-1-5-pro-251215) | The resolution of the output video. Valid values: 480p, 720p.<br><br>This parameter can be specified in the text prompt using `--rs 480p`, `--rs 720p`, or `--rs 1080p`. |
| ratio<br>Abbreviation: rt | string | 16:9<br>(for text-to-video)<br>adaptive<br>(for image-to-video) | The aspect ratio of the output video. Valid values: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive (The optimal aspect ratio is automatically selected based on the uploaded image).<br><br>This parameter can be specified in the text prompt using `--rt 16:9`, `--rt 4:3`, etc. |
| duration<br>Abbreviation: dur | integer | 5 | Choose either duration or frames; frames takes priority over duration. If you want to generate a video of an integer number of seconds, it is recommended to specify duration.<br><br>The duration of the output video. Unit: seconds. Value range: 4~12 seconds.<br><br>This parameter can be specified in the text prompt using `--dur 5`. |
| frames<br>Abbreviation: frames | Integer | - | Choose either duration or frames; frames takes priority over duration. If you want to generate a video with a fractional second duration, it is recommended to specify frames.<br><br>Number of frames for the output video. By specifying the number of frames, you can flexibly control the length of the generated video, including videos with fractional second durations.<br><br>Calculation formula: Number of Frames = Duration x Frame Rate (24).<br>Value range: Supports all integer values within the range [29, 289] that conform to the format 25 + 4n, where n is a positive integer.<br><br>This parameter can be specified in the text prompt using `--frames 57`. |
| framepersecond<br>Abbreviation: fps | integer | 24 | The frame rate of the output video, which specifies the number of images displayed in the video per second. Valid values: 24.<br><br>This parameter can be specified in the text prompt using `--fps 24`. |
| seed<br>Abbreviation: seed | integer | -1 | The seed, which is an integer that controls the randomness of the output content. Valid values: integers within the range of [-1, 2^32-1].<br><br>**Note:** If the seed parameter is not specified or is set to -1, a random number is used. Changing the seed value is a way to obtain different outputs for the same request. Using the same seed value for the same request generates similar but not necessarily identical outputs.<br><br>This parameter can be specified in the text prompt using `--seed 12345`. |
| camerafixed<br>Abbreviation: cf<br>The reference-image-to-video is not supported | boolean | false | Specifies whether to fix the camera. Valid values:<br>- **true:** fixes the camera. The platform appends an instruction to fix the camera to your prompt, but does not guarantee the actual effect.<br>- **false:** does not fix the camera.<br><br>This parameter can be specified in the text prompt using `--cf true` or `--cf false`. |
| watermark<br>Abbreviation: wm | boolean | false | Specifies whether to add watermarks to the output video. Valid values:<br>- **false:** does not add watermarks.<br>- **true:** adds watermarks.<br><br>This parameter can be specified in the text prompt using `--wm true` or `--wm false`. |
| generate_audio | boolean | true | Only supported by Seedance 1.5 pro. Controls whether the generated video includes audio synchronized with the visuals.<br>- **true:** Outputs a video with synchronized audio, including voice, sound effects, and background music auto-generated from the prompt and visual content.<br>- **false:** Outputs a silent video. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
  "prompt": "A cat walking through a busy city street",
  "duration": 10
}'
```

### Response

The response contains the generated video task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | The ID of the video generation task. Creating a video generation task is an asynchronous interface. After obtaining the ID, you need to query the status of the video generation task through Querying the information about a video generation task. When the task is successful, the video_url of the generated video will be output. |

#### Example Response

```json
{
  "id": "MTQ1************jowNQ=="
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
  "prompt": "A cat walking through a busy city street",
  "duration": 10
}'
```

**Response Example**

```json
{
  "id": "MTQ1************jowNQ=="
}
```

---

## BytePlus / Seedance-1.5-pro / Query a Task `GET`

_Official Format_

### Query a Task

Seedance 1.5 is the latest video generation model launched by ByteDance. Based on the functionalities Seedance 1.0 Pro functionalities, Seedance Pro 1.5 can automatically generate matching voices, sound effects, and background music based on text prompts and visual content.

`GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/{task_id}`

### Overview

Query task status and retrieve results.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string (path) | - | required<br>Append the task ID to the endpoint path. |

### Request Example

```bash
curl -X GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/{task_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

### Response

The response contains task status and results.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Task ID (for example: `cgt-2025**********-*****`) |
| model | string | The model used to generate the video. |
| status | string | Task status (for example: `succeeded`). |
| content.video_url | string | URL of the generated video. |
| usage | object | Token usage details, including `completion_tokens` and `total_tokens`. |
| created_at / updated_at | integer | Unix timestamps for task creation and completion. |
| seed | integer | Generation seed value. |
| resolution / ratio / duration / framespersecond | various | Video output configuration returned with the task. |

#### Example Response

```json
{
  "id":"***************",
  "model":"seedance-1-5-pro-251215",
  "status":"succeeded",
  "content":{
    "video_url":"https://download.cloudwise.ai/arts/{task_id}"
  },
  "usage":{
    "completion_tokens":491640,
    "total_tokens":491640
  },
  "created_at":1763090796,
  "updated_at":1763090925,
  "seed":74893,
  "resolution":"1080p",
  "ratio":"16:9",
  "duration":10,
  "framespersecond":24
}
```

**Request Example**

```bash
curl -X GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/{task_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

**Response Example**

```json
{
  "id":"***************",
  "model":"seedance-1-5-pro-251215",
  "status":"succeeded",
  "content":{
    "video_url":"https://download.cloudwise.ai/arts/{task_id}"
  },
  "usage":{
    "completion_tokens":491640,
    "total_tokens":491640
  },
  "created_at":1763090796,
  "updated_at":1763090925,
  "seed":74893,
  "resolution":"1080p",
  "ratio":"16:9",
  "duration":10,
  "framespersecond":24
}
```

---

## BytePlus / Seedance-1.5-pro / Query a list of Tasks `GET`

_Official Format_

### Query a list of Tasks

Seedance 1.5 is the latest video generation model launched by ByteDance. Based on the functionalities Seedance 1.0 Pro functionalities, Seedance Pro 1.5 can automatically generate matching voices, sound effects, and background music based on text prompts and visual content.

`GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks`

### Overview

Query task status and retrieve results.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| filter.status | string / null | - | The status of the task. Valid values:<br>`queued`<br>`running`<br>`cancelled` (Only tasks in the queued state can be canceled)<br>`succeeded`<br>`failed` |
| filter.task_ids | string[] / null | - | Search for specific video generation tasks using the task ID. Multiple IDs can be passed, separated with &. |
| filter.model | string / null | - | The ID of the used inference endpoint for the exact search, which differs from the model parameter in the response. |

### Request Example

```bash
curl -X GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

### Response

The response contains task status and results.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| items | object[] | The retrieved video generation tasks. |
| items.id | string | The ID of the video generation task. |
| items.model | string | The name and version of the model used by the task (Model name-Version). |
| items.status | string | The state of the task. Valid values:<br>`queued`<br>`running`<br>`cancelled` (The task has been canceled. Only tasks in the queued state can be canceled.)<br>`succeeded`<br>`failed` |
| items.error | object / null | The error information. If the task succeeds, null is returned. If the task fails, the error information is returned. |
| items.error.code | string | The error code. |
| items.error.message | string | The error message. |
| items.created_at | integer | The time when the task was created. The value is a UNIX timestamp in seconds. |
| items.updated_at | integer | The time when the task was last updated. The value is a UNIX timestamp in seconds. |
| items.content | object | The output of the video generation task. It contains the download URL of the output video. |
| items.content.video_url | string | The URL of the output video. For security purposes, the output video is cleared after 24 hours. Save it in time. |
| items.content.last_frame_url | string | URL of the Video's last frame. Valid for 24 hours. Be sure to save it in time. |
| items.seed | integer | The integer value used for this generation task. |
| items.resolution | string | The resolution of the generated video. |
| items.ratio | string | The width-to-height ratio of the generated video. |
| items.duration | integer | The length of the generated video in seconds. |
| items.framesnew | integer | The number of frames of the generated video. |
| items.framespersecond | integer | The frame rate of the generated video. |
| items.usage | object | The token usage for the request. |
| items.usage.completion_tokens | integer | The number of tokens consumed for the video output by the model. |
| items.usage.total_tokens | integer | Total tokens for this request. For video models, input tokens are always 0, therefore total_tokens = completion_tokens. |
| total | integer | The number of tasks that match the filter conditions. |

#### Example Response

```json
{
  "total": 2,
  "items": [
    {
      "id": "**********",
      "model": "seedance-1-5-pro-251215",
      "status": "succeeded",
      "content": {
        "video_url": "https://download.cloudwise.ai/arts/{task_id}"
      },
      "usage": {
        "completion_tokens": 246840,
        "total_tokens": 246840
      },
      "created_at": 1763438188,
      "updated_at": 1763438220,
      "seed": 48588,
      "resolution": "1080p",
      "ratio": "16:9",
      "duration": 5,
      "framespersecond": 24
    },
    {
      "id": "**********",
      "model": "seedance-1-5-pro-251215",
      "status": "succeeded",
      "content": {
        "video_url": "https://download.cloudwise.ai/arts/{task_id}"
      },
      "usage": {
        "completion_tokens": 112710,
        "total_tokens": 112710
      },
      "created_at": 1763407199,
      "updated_at": 1763407248,
      "seed": 63654,
      "resolution": "480p",
      "ratio": "21:9",
      "duration": 12,
      "framespersecond": 24
    }
  ]
}
```

**Request Example**

```bash
curl -X GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

**Response Example**

```json
{
  "total": 2,
  "items": [
    {
      "id": "**********",
      "model": "seedance-1-5-pro-251215",
      "status": "succeeded",
      "content": {
        "video_url": "https://download.cloudwise.ai/arts/{task_id}"
      },
      "usage": {
        "completion_tokens": 246840,
        "total_tokens": 246840
      },
      "created_at": 1763438188,
      "updated_at": 1763438220,
      "seed": 48588,
      "resolution": "1080p",
      "ratio": "16:9",
      "duration": 5,
      "framespersecond": 24
    },
    {
      "id": "**********",
      "model": "seedance-1-5-pro-251215",
      "status": "succeeded",
      "content": {
        "video_url": "https://download.cloudwise.ai/arts/{task_id}"
      },
      "usage": {
        "completion_tokens": 112710,
        "total_tokens": 112710
      },
      "created_at": 1763407199,
      "updated_at": 1763407248,
      "seed": 63654,
      "resolution": "480p",
      "ratio": "21:9",
      "duration": 12,
      "framespersecond": 24
    }
  ]
}
```

---

## BytePlus / Seedance-1.0-pro / Image-to-Video-First Frame `POST`

_Official Format_

### Image-to-Video-First Frame

Seedance 1.0 Pro, the large-parameter version of the model suite, features a unique multi-shot storytelling capability and demonstrates outstanding performance across multiple dimensions. It achieves breakthroughs in semantic understanding and instruction-following, enabling the generation of 1080P high-definition videos with smooth motion, rich details, diverse styles, and cinematic visual quality.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`

### Overview

This endpoint provides image-to-video-first frame functionality using the Seedance-1.0-pro model. Generate video content based on image input.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The ID of the model that you want to call. e.g., "seedance-1-0-pro-250528" |
| content | object[] | - | required<br>The input text and image information for the model to generate a video.<br><br>**Information type:**<br><br>**Text information object:** The input text information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "text".<br>- `content.text` (string, required): The input text information for the model, which describes the video to be generated. The content includes:<br>* Text prompt (required): You can use Chinese and English characters.<br>* Parameters (optional): You can add --[parameters] after the text prompt to control the specifications of the output video. For more information, refer to Text commands for models (optional).<br><br>**Image information object:** The input image information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "image_url". Supports image URL or image Base64 encoding.<br>- `content.image_url` (object, required): The input image object for the model.<br>* `content.image_url.url` (string, required): The image information, which can be an image URL or the Base64-encoded content of an image.<br><br>**Image Format Requirements:**<br>- It must be in one of the following formats: jpeg, png, webp, bmp, tiff, gif.<br>- Its aspect ratio must be in the range of 0.4 to 2.5.<br>- Its shorter side must be greater than 300 pixels, and its longer side must be less than 6,000 pixels.<br>- It must be smaller than 30 MB in size. |
| return_last_frame | Boolean | false | - **true:** Returns the last frame image of the generated video. After setting this parameter to true, you can obtain the last frame image by calling the Querying the information about a video generation task. The last frame image is in PNG format, with its pixel width and height consistent with those of the generated video, and it contains no watermarks. Using this parameter allows the generation of multiple consecutive videos: the last frame of the previously generated video is used as the first frame of the next video task, enabling quick generation of multiple consecutive videos.<br>- **false:** Does not return the last frame image of the generated video. |
| resolution<br>Abbreviation: rs | string | 1080p<br>(for seedance-1-0-pro-250528) | The resolution of the output video. Valid values: 480p, 720p, 1080p (Reference image feature is not supported for 1080p).<br><br>This parameter can be specified in the text prompt using `--rs 480p`, `--rs 720p`, or `--rs 1080p`. |
| ratio<br>Abbreviation: rt | string | 16:9<br>(for text-to-video)<br>adaptive<br>(for image-to-video) | The aspect ratio of the output video. Valid values: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive (The optimal aspect ratio is automatically selected based on the uploaded image).<br><br>This parameter can be specified in the text prompt using `--rt 16:9`, `--rt 4:3`, etc. |
| duration<br>Abbreviation: dur | integer | 5 | Choose either duration or frames; frames takes priority over duration. If you want to generate a video of an integer number of seconds, it is recommended to specify duration.<br><br>The duration of the output video. Unit: seconds. Value range: 2~12 seconds.<br><br>This parameter can be specified in the text prompt using `--dur 5`. |
| frames<br>Abbreviation: frames | Integer | - | Choose either duration or frames; frames takes priority over duration. If you want to generate a video with a fractional second duration, it is recommended to specify frames.<br><br>Number of frames for the output video. By specifying the number of frames, you can flexibly control the length of the generated video, including videos with fractional second durations.<br><br>Calculation formula: Number of Frames = Duration x Frame Rate (24).<br>Value range: Supports all integer values within the range [29, 289] that conform to the format 25 + 4n, where n is a positive integer.<br><br>This parameter can be specified in the text prompt using `--frames 57`. |
| framepersecond<br>Abbreviation: fps | integer | 24 | The frame rate of the output video, which specifies the number of images displayed in the video per second. Valid values: 24.<br><br>This parameter can be specified in the text prompt using `--fps 24`. |
| seed<br>Abbreviation: seed | integer | -1 | The seed, which is an integer that controls the randomness of the output content. Valid values: integers within the range of [-1, 2^32-1].<br><br>**Note:** If the seed parameter is not specified or is set to -1, a random number is used. Changing the seed value is a way to obtain different outputs for the same request. Using the same seed value for the same request generates similar but not necessarily identical outputs.<br><br>This parameter can be specified in the text prompt using `--seed 12345`. |
| camerafixed<br>Abbreviation: cf<br>The reference-image-to-video is not supported | boolean | false | Specifies whether to fix the camera. Valid values:<br>- **true:** fixes the camera. The platform appends an instruction to fix the camera to your prompt, but does not guarantee the actual effect.<br>- **false:** does not fix the camera.<br><br>This parameter can be specified in the text prompt using `--cf true` or `--cf false`. |
| watermark<br>Abbreviation: wm | boolean | false | Specifies whether to add watermarks to the output video. Valid values:<br>- **false:** does not add watermarks.<br>- **true:** adds watermarks.<br><br>This parameter can be specified in the text prompt using `--wm true` or `--wm false`. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedance-1-0-pro-250528",
    "content": [
        {
            "type": "text",
        "text": "Create a tense movie clip of this boxing match. Use quick cuts, dramatic lighting, and a suspenseful score. Highlight the fighters' intensity and the arena's pressure.  --resolution 1080p --duration 5 --ratio 16:9  --camerafixed false"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://tos-0901-beijing.tos-cn-beijing.bytepluses.com.cn/image-generator/674fdd9a-bf03-460e-a689-62cccbb505f9.png"
            }
        }
    ]
}'
```

### Response

The response contains the generated video task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | The ID of the video generation task. Creating a video generation task is an asynchronous interface. After obtaining the ID, you need to query the status of the video generation task through Querying the information about a video generation task. When the task is successful, the video_url of the generated video will be output. |

#### Example Response

```json
{
  "id": "MTQ1************jowNQ=="
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedance-1-0-pro-250528",
    "content": [
        {
            "type": "text",
        "text": "Create a tense movie clip of this boxing match. Use quick cuts, dramatic lighting, and a suspenseful score. Highlight the fighters' intensity and the arena's pressure.  --resolution 1080p --duration 5 --ratio 16:9  --camerafixed false"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://tos-0901-beijing.tos-cn-beijing.bytepluses.com.cn/image-generator/674fdd9a-bf03-460e-a689-62cccbb505f9.png"
            }
        }
    ]
}'
```

**Response Example**

```json
{
  "id": "MTQ1************jowNQ=="
}
```

---

## BytePlus / Seedance-1.0-pro / Image-to-Video-First Frame and Last Frame `POST`

_Official Format_

### Image-to-Video-First Frame and Last Frame

Seedance 1.0 Pro, the large-parameter version of the model suite, features a unique multi-shot storytelling capability and demonstrates outstanding performance across multiple dimensions. It achieves breakthroughs in semantic understanding and instruction-following, enabling the generation of 1080P high-definition videos with smooth motion, rich details, diverse styles, and cinematic visual quality.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`

### Overview

Generate the target video based on your first-frame image + text prompt (optional) + parameters (optional).

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The ID of the model that you want to call. e.g., "seedance-1-0-pro-250528" |
| content | object[] | - | required<br>The input text and image information for the model to generate a video.<br><br>**Information type:**<br><br>**Text information object:** The input text information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "text".<br>- `content.text` (string, required): The input text information for the model, which describes the video to be generated. The content includes:<br>* Text prompt (required): You can use Chinese and English characters.<br>* Parameters (optional): You can add --[parameters] after the text prompt to control the specifications of the output video. For more information, refer to Text commands for models (optional).<br><br>**Image information object:** The input image information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "image_url". Supports image URL or image Base64 encoding.<br>- `content.image_url` (object, required): The input image object for the model.<br>* `content.image_url.url` (string, required): The image information, which can be an image URL or the Base64-encoded content of an image.<br><br>**Image Format Requirements:**<br>- It must be in one of the following formats: jpeg, png, webp, bmp, tiff, gif.<br>- Its aspect ratio must be in the range of 0.4 to 2.5.<br>- Its shorter side must be greater than 300 pixels, and its longer side must be less than 6,000 pixels.<br>- It must be smaller than 30 MB in size. |
| return_last_frame | Boolean | false | - **true:** Returns the last frame image of the generated video. After setting this parameter to true, you can obtain the last frame image by calling the Querying the information about a video generation task. The last frame image is in PNG format, with its pixel width and height consistent with those of the generated video, and it contains no watermarks. Using this parameter allows the generation of multiple consecutive videos: the last frame of the previously generated video is used as the first frame of the next video task, enabling quick generation of multiple consecutive videos.<br>- **false:** Does not return the last frame image of the generated video. |
| resolution<br>Abbreviation: rs | string | 1080p<br>(for seedance-1-0-pro-250528) | The resolution of the output video. Valid values: 480p, 720p, 1080p (Reference image feature is not supported for 1080p).<br><br>This parameter can be specified in the text prompt using `--rs 480p`, `--rs 720p`, or `--rs 1080p`. |
| ratio<br>Abbreviation: rt | string | 16:9<br>(for text-to-video)<br>adaptive<br>(for image-to-video) | The aspect ratio of the output video. Valid values: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive (The optimal aspect ratio is automatically selected based on the uploaded image).<br><br>This parameter can be specified in the text prompt using `--rt 16:9`, `--rt 4:3`, etc. |
| duration<br>Abbreviation: dur | integer | 5 | Choose either duration or frames; frames takes priority over duration. If you want to generate a video of an integer number of seconds, it is recommended to specify duration.<br><br>The duration of the output video. Unit: seconds. Value range: 2~12 seconds.<br><br>This parameter can be specified in the text prompt using `--dur 5`. |
| frames<br>Abbreviation: frames | Integer | - | Choose either duration or frames; frames takes priority over duration. If you want to generate a video with a fractional second duration, it is recommended to specify frames.<br><br>Number of frames for the output video. By specifying the number of frames, you can flexibly control the length of the generated video, including videos with fractional second durations.<br><br>Calculation formula: Number of Frames = Duration x Frame Rate (24).<br>Value range: Supports all integer values within the range [29, 289] that conform to the format 25 + 4n, where n is a positive integer.<br><br>This parameter can be specified in the text prompt using `--frames 57`. |
| framepersecond<br>Abbreviation: fps | integer | 24 | The frame rate of the output video, which specifies the number of images displayed in the video per second. Valid values: 24.<br><br>This parameter can be specified in the text prompt using `--fps 24`. |
| seed<br>Abbreviation: seed | integer | -1 | The seed, which is an integer that controls the randomness of the output content. Valid values: integers within the range of [-1, 2^32-1].<br><br>**Note:** If the seed parameter is not specified or is set to -1, a random number is used. Changing the seed value is a way to obtain different outputs for the same request. Using the same seed value for the same request generates similar but not necessarily identical outputs.<br><br>This parameter can be specified in the text prompt using `--seed 12345`. |
| camerafixed<br>Abbreviation: cf<br>The reference-image-to-video is not supported | boolean | false | Specifies whether to fix the camera. Valid values:<br>- **true:** fixes the camera. The platform appends an instruction to fix the camera to your prompt, but does not guarantee the actual effect.<br>- **false:** does not fix the camera.<br><br>This parameter can be specified in the text prompt using `--cf true` or `--cf false`. |
| watermark<br>Abbreviation: wm | boolean | false | Specifies whether to add watermarks to the output video. Valid values:<br>- **false:** does not add watermarks.<br>- **true:** adds watermarks.<br><br>This parameter can be specified in the text prompt using `--wm true` or `--wm false`. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedance-1-0-pro-250528",
    "content": [
         {
            "type": "text",
            "text": "Create a 360-degree orbiting camera shot based on this photo."
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_first_frame.jpeg"
            },
            "role": "first_frame"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_last_frame.jpeg"
            },
            "role": "last_frame"
        }
    ]
}'
```

### Response

The response contains the generated video task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | The ID of the video generation task. Creating a video generation task is an asynchronous interface. After obtaining the ID, you need to query the status of the video generation task through Querying the information about a video generation task. When the task is successful, the video_url of the generated video will be output. |

#### Example Response

```json
{
  "id": "MTQ1************jowNQ=="
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedance-1-0-pro-250528",
    "content": [
         {
            "type": "text",
            "text": "Create a 360-degree orbiting camera shot based on this photo."
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_first_frame.jpeg"
            },
            "role": "first_frame"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_last_frame.jpeg"
            },
            "role": "last_frame"
        }
    ]
}'
```

**Response Example**

```json
{
  "id": "MTQ1************jowNQ=="
}
```

---

## BytePlus / Seedance-1.0-pro / Text to Video `POST`

_Official Format_

### Text to Video

Seedance 1.0 Pro, the large-parameter version of the model suite, features a unique multi-shot storytelling capability and demonstrates outstanding performance across multiple dimensions. It achieves breakthroughs in semantic understanding and instruction-following, enabling the generation of 1080P high-definition videos with smooth motion, rich details, diverse styles, and cinematic visual quality.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`

### Overview

This endpoint provides text to video functionality using the Seedance-1.0-pro model. Generate video content based on text prompt.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The ID of the model that you want to call. e.g., "seedance-1-0-pro-250528" |
| content | object[] | - | required<br>The input text and image information for the model to generate a video.<br><br>**Information type:**<br><br>**Text information object:** The input text information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "text".<br>- `content.text` (string, required): The input text information for the model, which describes the video to be generated. The content includes:<br>* Text prompt (required): You can use Chinese and English characters.<br>* Parameters (optional): You can add --[parameters] after the text prompt to control the specifications of the output video. For more information, refer to Text commands for models (optional).<br><br>**Image information object:** The input image information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "image_url". Supports image URL or image Base64 encoding.<br>- `content.image_url` (object, required): The input image object for the model.<br>* `content.image_url.url` (string, required): The image information, which can be an image URL or the Base64-encoded content of an image.<br><br>**Image Format Requirements:**<br>- It must be in one of the following formats: jpeg, png, webp, bmp, tiff, gif.<br>- Its aspect ratio must be in the range of 0.4 to 2.5.<br>- Its shorter side must be greater than 300 pixels, and its longer side must be less than 6,000 pixels.<br>- It must be smaller than 30 MB in size. |
| return_last_frame | Boolean | false | - **true:** Returns the last frame image of the generated video. After setting this parameter to true, you can obtain the last frame image by calling the Querying the information about a video generation task. The last frame image is in PNG format, with its pixel width and height consistent with those of the generated video, and it contains no watermarks. Using this parameter allows the generation of multiple consecutive videos: the last frame of the previously generated video is used as the first frame of the next video task, enabling quick generation of multiple consecutive videos.<br>- **false:** Does not return the last frame image of the generated video. |
| resolution<br>Abbreviation: rs | string | 1080p<br>(for seedance-1-0-pro-250528) | The resolution of the output video. Valid values: 480p, 720p, 1080p (Reference image feature is not supported for 1080p).<br><br>This parameter can be specified in the text prompt using `--rs 480p`, `--rs 720p`, or `--rs 1080p`. |
| ratio<br>Abbreviation: rt | string | 16:9<br>(for text-to-video)<br>adaptive<br>(for image-to-video) | The aspect ratio of the output video. Valid values: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive (The optimal aspect ratio is automatically selected based on the uploaded image).<br><br>This parameter can be specified in the text prompt using `--rt 16:9`, `--rt 4:3`, etc. |
| duration<br>Abbreviation: dur | integer | 5 | Choose either duration or frames; frames takes priority over duration. If you want to generate a video of an integer number of seconds, it is recommended to specify duration.<br><br>The duration of the output video. Unit: seconds. Value range: 2~12 seconds.<br><br>This parameter can be specified in the text prompt using `--dur 5`. |
| frames<br>Abbreviation: frames | Integer | - | Choose either duration or frames; frames takes priority over duration. If you want to generate a video with a fractional second duration, it is recommended to specify frames.<br><br>Number of frames for the output video. By specifying the number of frames, you can flexibly control the length of the generated video, including videos with fractional second durations.<br><br>Calculation formula: Number of Frames = Duration x Frame Rate (24).<br>Value range: Supports all integer values within the range [29, 289] that conform to the format 25 + 4n, where n is a positive integer.<br><br>This parameter can be specified in the text prompt using `--frames 57`. |
| framepersecond<br>Abbreviation: fps | integer | 24 | The frame rate of the output video, which specifies the number of images displayed in the video per second. Valid values: 24.<br><br>This parameter can be specified in the text prompt using `--fps 24`. |
| seed<br>Abbreviation: seed | integer | -1 | The seed, which is an integer that controls the randomness of the output content. Valid values: integers within the range of [-1, 2^32-1].<br><br>**Note:** If the seed parameter is not specified or is set to -1, a random number is used. Changing the seed value is a way to obtain different outputs for the same request. Using the same seed value for the same request generates similar but not necessarily identical outputs.<br><br>This parameter can be specified in the text prompt using `--seed 12345`. |
| camerafixed<br>Abbreviation: cf<br>The reference-image-to-video is not supported | boolean | false | Specifies whether to fix the camera. Valid values:<br>- **true:** fixes the camera. The platform appends an instruction to fix the camera to your prompt, but does not guarantee the actual effect.<br>- **false:** does not fix the camera.<br><br>This parameter can be specified in the text prompt using `--cf true` or `--cf false`. |
| watermark<br>Abbreviation: wm | boolean | false | Specifies whether to add watermarks to the output video. Valid values:<br>- **false:** does not add watermarks.<br>- **true:** adds watermarks.<br><br>This parameter can be specified in the text prompt using `--wm true` or `--wm false`. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
  "prompt": "A cat walking through a busy city street",
  "duration": 10
}'
```

### Response

The response contains the generated video task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | The ID of the video generation task. Creating a video generation task is an asynchronous interface. After obtaining the ID, you need to query the status of the video generation task through Querying the information about a video generation task. When the task is successful, the video_url of the generated video will be output. |

#### Example Response

```json
{
  "id": "MTQ1************jowNQ=="
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
  "prompt": "A cat walking through a busy city street",
  "duration": 10
}'
```

**Response Example**

```json
{
  "id": "MTQ1************jowNQ=="
}
```

---

## BytePlus / Seedance-1.0-pro / Query a Task `GET`

_Official Format_

### Query a Task

Seedance 1.0 Pro, the large-parameter version of the model suite, features a unique multi-shot storytelling capability and demonstrates outstanding performance across multiple dimensions. It achieves breakthroughs in semantic understanding and instruction-following, enabling the generation of 1080P high-definition videos with smooth motion, rich details, diverse styles, and cinematic visual quality.

`GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/{task_id}`

### Overview

Query task status and retrieve results.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string (path) | - | required<br>Append the task ID to the endpoint path. |

### Request Example

```bash
curl -X GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/{task_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

### Response

The response contains task status and results.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Task ID (for example: `cgt-2025**********-*****`) |
| model | string | The model used to generate the video. |
| status | string | Task status (for example: `succeeded`). |
| content.video_url | string | URL of the generated video. |
| usage | object | Token usage details, including `completion_tokens` and `total_tokens`. |
| created_at / updated_at | integer | Unix timestamps for task creation and completion. |
| seed | integer | Generation seed value. |
| resolution / ratio / duration / framespersecond | various | Video output configuration returned with the task. |

#### Example Response

```json
{
  "id":"***************",
  "model":"seedance-1-0-pro-250528",
  "status":"succeeded",
  "content":{
    "video_url":"https://download.cloudwise.ai/arts/{task_id}"
  },
  "usage":{
    "completion_tokens":491640,
    "total_tokens":491640
  },
  "created_at":1763090796,
  "updated_at":1763090925,
  "seed":74893,
  "resolution":"1080p",
  "ratio":"16:9",
  "duration":10,
  "framespersecond":24
}
```

**Request Example**

```bash
curl -X GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/{task_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

**Response Example**

```json
{
  "id":"***************",
  "model":"seedance-1-0-pro-250528",
  "status":"succeeded",
  "content":{
    "video_url":"https://download.cloudwise.ai/arts/{task_id}"
  },
  "usage":{
    "completion_tokens":491640,
    "total_tokens":491640
  },
  "created_at":1763090796,
  "updated_at":1763090925,
  "seed":74893,
  "resolution":"1080p",
  "ratio":"16:9",
  "duration":10,
  "framespersecond":24
}
```

---

## BytePlus / Seedance-1.0-pro / Query a list of Tasks `GET`

_Official Format_

### Query a list of Tasks

Seedance 1.0 Pro, the large-parameter version of the model suite, features a unique multi-shot storytelling capability and demonstrates outstanding performance across multiple dimensions. It achieves breakthroughs in semantic understanding and instruction-following, enabling the generation of 1080P high-definition videos with smooth motion, rich details, diverse styles, and cinematic visual quality.

`GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks`

### Overview

Query task status and retrieve results.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| filter.status | string / null | - | The status of the task. Valid values:<br>`queued`<br>`running`<br>`cancelled` (Only tasks in the queued state can be canceled)<br>`succeeded`<br>`failed` |
| filter.task_ids | string[] / null | - | Search for specific video generation tasks using the task ID. Multiple IDs can be passed, separated with &. |
| filter.model | string / null | - | The ID of the used inference endpoint for the exact search, which differs from the model parameter in the response. |

### Request Example

```bash
curl -X GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

### Response

The response contains task status and results.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| items | object[] | The retrieved video generation tasks. |
| items.id | string | The ID of the video generation task. |
| items.model | string | The name and version of the model used by the task (Model name-Version). |
| items.status | string | The state of the task. Valid values:<br>`queued`<br>`running`<br>`cancelled` (The task has been canceled. Only tasks in the queued state can be canceled.)<br>`succeeded`<br>`failed` |
| items.error | object / null | The error information. If the task succeeds, null is returned. If the task fails, the error information is returned. |
| items.error.code | string | The error code. |
| items.error.message | string | The error message. |
| items.created_at | integer | The time when the task was created. The value is a UNIX timestamp in seconds. |
| items.updated_at | integer | The time when the task was last updated. The value is a UNIX timestamp in seconds. |
| items.content | object | The output of the video generation task. It contains the download URL of the output video. |
| items.content.video_url | string | The URL of the output video. For security purposes, the output video is cleared after 24 hours. Save it in time. |
| items.content.last_frame_url | string | URL of the Video's last frame. Valid for 24 hours. Be sure to save it in time. |
| items.seed | integer | The integer value used for this generation task. |
| items.resolution | string | The resolution of the generated video. |
| items.ratio | string | The width-to-height ratio of the generated video. |
| items.duration | integer | The length of the generated video in seconds. |
| items.framesnew | integer | The number of frames of the generated video. |
| items.framespersecond | integer | The frame rate of the generated video. |
| items.usage | object | The token usage for the request. |
| items.usage.completion_tokens | integer | The number of tokens consumed for the video output by the model. |
| items.usage.total_tokens | integer | Total tokens for this request. For video models, input tokens are always 0, therefore total_tokens = completion_tokens. |
| total | integer | The number of tasks that match the filter conditions. |

#### Example Response

```json
{
  "total": 2,
  "items": [
    {
      "id": "**********",
      "model": "seedance-1-0-pro-250528",
      "status": "succeeded",
      "content": {
        "video_url": "https://download.cloudwise.ai/arts/{task_id}"
      },
      "usage": {
        "completion_tokens": 246840,
        "total_tokens": 246840
      },
      "created_at": 1763438188,
      "updated_at": 1763438220,
      "seed": 48588,
      "resolution": "1080p",
      "ratio": "16:9",
      "duration": 5,
      "framespersecond": 24
    },
    {
      "id": "**********",
      "model": "seedance-1-0-pro-250528",
      "status": "succeeded",
      "content": {
        "video_url": "https://download.cloudwise.ai/arts/{task_id}"
      },
      "usage": {
        "completion_tokens": 112710,
        "total_tokens": 112710
      },
      "created_at": 1763407199,
      "updated_at": 1763407248,
      "seed": 63654,
      "resolution": "480p",
      "ratio": "21:9",
      "duration": 12,
      "framespersecond": 24
    }
  ]
}
```

**Request Example**

```bash
curl -X GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

**Response Example**

```json
{
  "total": 2,
  "items": [
    {
      "id": "**********",
      "model": "seedance-1-0-pro-250528",
      "status": "succeeded",
      "content": {
        "video_url": "https://download.cloudwise.ai/arts/{task_id}"
      },
      "usage": {
        "completion_tokens": 246840,
        "total_tokens": 246840
      },
      "created_at": 1763438188,
      "updated_at": 1763438220,
      "seed": 48588,
      "resolution": "1080p",
      "ratio": "16:9",
      "duration": 5,
      "framespersecond": 24
    },
    {
      "id": "**********",
      "model": "seedance-1-0-pro-250528",
      "status": "succeeded",
      "content": {
        "video_url": "https://download.cloudwise.ai/arts/{task_id}"
      },
      "usage": {
        "completion_tokens": 112710,
        "total_tokens": 112710
      },
      "created_at": 1763407199,
      "updated_at": 1763407248,
      "seed": 63654,
      "resolution": "480p",
      "ratio": "21:9",
      "duration": 12,
      "framespersecond": 24
    }
  ]
}
```

---

## BytePlus / Seedance-1.0-pro-fast / Image to Video `POST`

_Official Format_

### Image to Video

Byteplus Seedance 1.0 Professional version, optimized for text-to-video conversion with high-quality video generation capabilities. Supports multiple style transformations, ideal for rapid prototyping and creative exploration. Lightweight design ensures fast response and efficient processing.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`

### Overview

This endpoint provides image to video functionality using the Seedance-1.0-pro-fast model. Generate video content based on image input.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The ID of the model that you want to call. e.g., "seedance-1-0-pro-fast-251015" |
| content | object[] | - | required<br>The input text and image information for the model to generate a video.<br><br>**Information type:**<br><br>**Text information object:** The input text information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "text".<br>- `content.text` (string, required): The input text information for the model, which describes the video to be generated. The content includes:<br>* Text prompt (required): You can use Chinese and English characters.<br>* Parameters (optional): You can add --[parameters] after the text prompt to control the specifications of the output video. For more information, refer to Text commands for models (optional).<br><br>**Image information object:** The input image information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "image_url". Supports image URL or image Base64 encoding.<br>- `content.image_url` (object, required): The input image object for the model.<br>* `content.image_url.url` (string, required): The image information, which can be an image URL or the Base64-encoded content of an image.<br><br>**Image Format Requirements:**<br>- It must be in one of the following formats: jpeg, png, webp, bmp, tiff, gif.<br>- Its aspect ratio must be in the range of 0.4 to 2.5.<br>- Its shorter side must be greater than 300 pixels, and its longer side must be less than 6,000 pixels.<br>- It must be smaller than 30 MB in size. |
| return_last_frame | Boolean | false | - **true:** Returns the last frame image of the generated video. After setting this parameter to true, you can obtain the last frame image by calling the Querying the information about a video generation task. The last frame image is in PNG format, with its pixel width and height consistent with those of the generated video, and it contains no watermarks. Using this parameter allows the generation of multiple consecutive videos: the last frame of the previously generated video is used as the first frame of the next video task, enabling quick generation of multiple consecutive videos.<br>- **false:** Does not return the last frame image of the generated video. |
| resolution<br>Abbreviation: rs | string | 1080p<br>(for seedance-1-0-pro-fast-251015) | The resolution of the output video. Valid values: 480p, 720p, 1080p (Reference image feature is not supported for 1080p).<br><br>This parameter can be specified in the text prompt using `--rs 480p`, `--rs 720p`, or `--rs 1080p`. |
| ratio<br>Abbreviation: rt | string | 16:9<br>(for text-to-video)<br>adaptive<br>(for image-to-video) | The aspect ratio of the output video. Valid values: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive (The optimal aspect ratio is automatically selected based on the uploaded image).<br><br>This parameter can be specified in the text prompt using `--rt 16:9`, `--rt 4:3`, etc. |
| duration<br>Abbreviation: dur | integer | 5 | Choose either duration or frames; frames takes priority over duration. If you want to generate a video of an integer number of seconds, it is recommended to specify duration.<br><br>The duration of the output video. Unit: seconds. Value range: 2~12 seconds.<br><br>This parameter can be specified in the text prompt using `--dur 5`. |
| frames<br>Abbreviation: frames | Integer | - | Choose either duration or frames; frames takes priority over duration. If you want to generate a video with a fractional second duration, it is recommended to specify frames.<br><br>Number of frames for the output video. By specifying the number of frames, you can flexibly control the length of the generated video, including videos with fractional second durations.<br><br>Calculation formula: Number of Frames = Duration x Frame Rate (24).<br>Value range: Supports all integer values within the range [29, 289] that conform to the format 25 + 4n, where n is a positive integer.<br><br>This parameter can be specified in the text prompt using `--frames 57`. |
| framepersecond<br>Abbreviation: fps | integer | 24 | The frame rate of the output video, which specifies the number of images displayed in the video per second. Valid values: 24.<br><br>This parameter can be specified in the text prompt using `--fps 24`. |
| seed<br>Abbreviation: seed | integer | -1 | The seed, which is an integer that controls the randomness of the output content. Valid values: integers within the range of [-1, 2^32-1].<br><br>**Note:** If the seed parameter is not specified or is set to -1, a random number is used. Changing the seed value is a way to obtain different outputs for the same request. Using the same seed value for the same request generates similar but not necessarily identical outputs.<br><br>This parameter can be specified in the text prompt using `--seed 12345`. |
| camerafixed<br>Abbreviation: cf<br>The reference-image-to-video is not supported | boolean | false | Specifies whether to fix the camera. Valid values:<br>- **true:** fixes the camera. The platform appends an instruction to fix the camera to your prompt, but does not guarantee the actual effect.<br>- **false:** does not fix the camera.<br><br>This parameter can be specified in the text prompt using `--cf true` or `--cf false`. |
| watermark<br>Abbreviation: wm | boolean | false | Specifies whether to add watermarks to the output video. Valid values:<br>- **false:** does not add watermarks.<br>- **true:** adds watermarks.<br><br>This parameter can be specified in the text prompt using `--wm true` or `--wm false`. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
  "image_url": "https://example.com/image.jpg",
  "prompt": "A serene landscape animation",
  "duration": 10
}'
```

### Response

The response contains the generated video task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | The ID of the video generation task. Creating a video generation task is an asynchronous interface. After obtaining the ID, you need to query the status of the video generation task through Querying the information about a video generation task. When the task is successful, the video_url of the generated video will be output. |

#### Example Response

```json
{
  "id": "MTQ1************jowNQ=="
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
  "image_url": "https://example.com/image.jpg",
  "prompt": "A serene landscape animation",
  "duration": 10
}'
```

**Response Example**

```json
{
  "id": "MTQ1************jowNQ=="
}
```

---

## BytePlus / Seedance-1.0-pro-fast / Text to Video `POST`

_Official Format_

### Text to Video

Byteplus Seedance 1.0 Professional version, optimized for text-to-video conversion with high-quality video generation capabilities. Supports multiple style transformations, ideal for rapid prototyping and creative exploration. Lightweight design ensures fast response and efficient processing.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance`

### Overview

This endpoint provides text to video functionality using the Seedance-1.0-pro-fast model. Generate video content based on text prompt.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The ID of the model that you want to call. e.g., "seedance-1-0-pro-fast-251015" |
| content | object[] | - | required<br>The input text and image information for the model to generate a video.<br><br>**Information type:**<br><br>**Text information object:** The input text information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "text".<br>- `content.text` (string, required): The input text information for the model, which describes the video to be generated. The content includes:<br>* Text prompt (required): You can use Chinese and English characters.<br>* Parameters (optional): You can add --[parameters] after the text prompt to control the specifications of the output video. For more information, refer to Text commands for models (optional).<br><br>**Image information object:** The input image information for the model to generate a video.<br>- `content.type`(string, required): Set the value to "image_url". Supports image URL or image Base64 encoding.<br>- `content.image_url` (object, required): The input image object for the model.<br>* `content.image_url.url` (string, required): The image information, which can be an image URL or the Base64-encoded content of an image.<br><br>**Image Format Requirements:**<br>- It must be in one of the following formats: jpeg, png, webp, bmp, tiff, gif.<br>- Its aspect ratio must be in the range of 0.4 to 2.5.<br>- Its shorter side must be greater than 300 pixels, and its longer side must be less than 6,000 pixels.<br>- It must be smaller than 30 MB in size. |
| return_last_frame | Boolean | false | - **true:** Returns the last frame image of the generated video. After setting this parameter to true, you can obtain the last frame image by calling the Querying the information about a video generation task. The last frame image is in PNG format, with its pixel width and height consistent with those of the generated video, and it contains no watermarks. Using this parameter allows the generation of multiple consecutive videos: the last frame of the previously generated video is used as the first frame of the next video task, enabling quick generation of multiple consecutive videos.<br>- **false:** Does not return the last frame image of the generated video. |
| resolution<br>Abbreviation: rs | string | 1080p<br>(for seedance-1-0-pro-fast-251015) | The resolution of the output video. Valid values: 480p, 720p, 1080p (Reference image feature is not supported for 1080p).<br><br>This parameter can be specified in the text prompt using `--rs 480p`, `--rs 720p`, or `--rs 1080p`. |
| ratio<br>Abbreviation: rt | string | 16:9<br>(for text-to-video)<br>adaptive<br>(for image-to-video) | The aspect ratio of the output video. Valid values: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive (The optimal aspect ratio is automatically selected based on the uploaded image).<br><br>This parameter can be specified in the text prompt using `--rt 16:9`, `--rt 4:3`, etc. |
| duration<br>Abbreviation: dur | integer | 5 | Choose either duration or frames; frames takes priority over duration. If you want to generate a video of an integer number of seconds, it is recommended to specify duration.<br><br>The duration of the output video. Unit: seconds. Value range: 2~12 seconds.<br><br>This parameter can be specified in the text prompt using `--dur 5`. |
| frames<br>Abbreviation: frames | Integer | - | Choose either duration or frames; frames takes priority over duration. If you want to generate a video with a fractional second duration, it is recommended to specify frames.<br><br>Number of frames for the output video. By specifying the number of frames, you can flexibly control the length of the generated video, including videos with fractional second durations.<br><br>Calculation formula: Number of Frames = Duration x Frame Rate (24).<br>Value range: Supports all integer values within the range [29, 289] that conform to the format 25 + 4n, where n is a positive integer.<br><br>This parameter can be specified in the text prompt using `--frames 57`. |
| framepersecond<br>Abbreviation: fps | integer | 24 | The frame rate of the output video, which specifies the number of images displayed in the video per second. Valid values: 24.<br><br>This parameter can be specified in the text prompt using `--fps 24`. |
| seed<br>Abbreviation: seed | integer | -1 | The seed, which is an integer that controls the randomness of the output content. Valid values: integers within the range of [-1, 2^32-1].<br><br>**Note:** If the seed parameter is not specified or is set to -1, a random number is used. Changing the seed value is a way to obtain different outputs for the same request. Using the same seed value for the same request generates similar but not necessarily identical outputs.<br><br>This parameter can be specified in the text prompt using `--seed 12345`. |
| camerafixed<br>Abbreviation: cf<br>The reference-image-to-video is not supported | boolean | false | Specifies whether to fix the camera. Valid values:<br>- **true:** fixes the camera. The platform appends an instruction to fix the camera to your prompt, but does not guarantee the actual effect.<br>- **false:** does not fix the camera.<br><br>This parameter can be specified in the text prompt using `--cf true` or `--cf false`. |
| watermark<br>Abbreviation: wm | boolean | false | Specifies whether to add watermarks to the output video. Valid values:<br>- **false:** does not add watermarks.<br>- **true:** adds watermarks.<br><br>This parameter can be specified in the text prompt using `--wm true` or `--wm false`. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
  "prompt": "A cat walking through a busy city street",
  "duration": 10
}'
```

### Response

The response contains the generated video task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | The ID of the video generation task. Creating a video generation task is an asynchronous interface. After obtaining the ID, you need to query the status of the video generation task through Querying the information about a video generation task. When the task is successful, the video_url of the generated video will be output. |

#### Example Response

```json
{
  "id": "MTQ1************jowNQ=="
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/video/seedance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
  "prompt": "A cat walking through a busy city street",
  "duration": 10
}'
```

**Response Example**

```json
{
  "id": "MTQ1************jowNQ=="
}
```

---

## BytePlus / Seedance-1.0-pro-fast / Query a Task `GET`

_Official Format_

### Query a Task

Byteplus Seedance 1.0 Professional version, optimized for text-to-video conversion with high-quality video generation capabilities. Supports multiple style transformations, ideal for rapid prototyping and creative exploration. Lightweight design ensures fast response and efficient processing.

`GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/{task_id}`

### Overview

Query task status and retrieve results.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string (path) | - | required<br>Append the task ID to the endpoint path. |

### Request Example

```bash
curl -X GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/{task_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

### Response

The response contains task status and results.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Task ID (for example: `cgt-2025**********-*****`) |
| model | string | The model used to generate the video. |
| status | string | Task status (for example: `succeeded`). |
| content.video_url | string | URL of the generated video. |
| usage | object | Token usage details, including `completion_tokens` and `total_tokens`. |
| created_at / updated_at | integer | Unix timestamps for task creation and completion. |
| seed | integer | Generation seed value. |
| resolution / ratio / duration / framespersecond | various | Video output configuration returned with the task. |

#### Example Response

```json
{
  "id":"***************",
  "model":"seedance-1-0-pro-fast-251015",
  "status":"succeeded",
  "content":{
    "video_url":"https://download.cloudwise.ai/arts/{task_id}"
  },
  "usage":{
    "completion_tokens":491640,
    "total_tokens":491640
  },
  "created_at":1763090796,
  "updated_at":1763090925,
  "seed":74893,
  "resolution":"1080p",
  "ratio":"16:9",
  "duration":10,
  "framespersecond":24
}
```

**Request Example**

```bash
curl -X GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks/{task_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

**Response Example**

```json
{
  "id":"***************",
  "model":"seedance-1-0-pro-fast-251015",
  "status":"succeeded",
  "content":{
    "video_url":"https://download.cloudwise.ai/arts/{task_id}"
  },
  "usage":{
    "completion_tokens":491640,
    "total_tokens":491640
  },
  "created_at":1763090796,
  "updated_at":1763090925,
  "seed":74893,
  "resolution":"1080p",
  "ratio":"16:9",
  "duration":10,
  "framespersecond":24
}
```

---

## BytePlus / Seedance-1.0-pro-fast / Query a list of Tasks `GET`

_Official Format_

### Query a list of Tasks

Byteplus Seedance 1.0 Professional version, optimized for text-to-video conversion with high-quality video generation capabilities. Supports multiple style transformations, ideal for rapid prototyping and creative exploration. Lightweight design ensures fast response and efficient processing.

`GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks`

### Overview

Query task status and retrieve results.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| filter.status | string / null | - | The status of the task. Valid values:<br>`queued`<br>`running`<br>`cancelled` (Only tasks in the queued state can be canceled)<br>`succeeded`<br>`failed` |
| filter.task_ids | string[] / null | - | Search for specific video generation tasks using the task ID. Multiple IDs can be passed, separated with &. |
| filter.model | string / null | - | The ID of the used inference endpoint for the exact search, which differs from the model parameter in the response. |

### Request Example

```bash
curl -X GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

### Response

The response contains task status and results.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| items | object[] | The retrieved video generation tasks. |
| items.id | string | The ID of the video generation task. |
| items.model | string | The name and version of the model used by the task (Model name-Version). |
| items.status | string | The state of the task. Valid values:<br>`queued`<br>`running`<br>`cancelled` (The task has been canceled. Only tasks in the queued state can be canceled.)<br>`succeeded`<br>`failed` |
| items.error | object / null | The error information. If the task succeeds, null is returned. If the task fails, the error information is returned. |
| items.error.code | string | The error code. |
| items.error.message | string | The error message. |
| items.created_at | integer | The time when the task was created. The value is a UNIX timestamp in seconds. |
| items.updated_at | integer | The time when the task was last updated. The value is a UNIX timestamp in seconds. |
| items.content | object | The output of the video generation task. It contains the download URL of the output video. |
| items.content.video_url | string | The URL of the output video. For security purposes, the output video is cleared after 24 hours. Save it in time. |
| items.content.last_frame_url | string | URL of the Video's last frame. Valid for 24 hours. Be sure to save it in time. |
| items.seed | integer | The integer value used for this generation task. |
| items.resolution | string | The resolution of the generated video. |
| items.ratio | string | The width-to-height ratio of the generated video. |
| items.duration | integer | The length of the generated video in seconds. |
| items.framesnew | integer | The number of frames of the generated video. |
| items.framespersecond | integer | The frame rate of the generated video. |
| items.usage | object | The token usage for the request. |
| items.usage.completion_tokens | integer | The number of tokens consumed for the video output by the model. |
| items.usage.total_tokens | integer | Total tokens for this request. For video models, input tokens are always 0, therefore total_tokens = completion_tokens. |
| total | integer | The number of tasks that match the filter conditions. |

#### Example Response

```json
{
  "total": 2,
  "items": [
    {
      "id": "**********",
      "model": "seedance-1-0-pro-fast-251015",
      "status": "succeeded",
      "content": {
        "video_url": "https://download.cloudwise.ai/arts/{task_id}"
      },
      "usage": {
        "completion_tokens": 246840,
        "total_tokens": 246840
      },
      "created_at": 1763438188,
      "updated_at": 1763438220,
      "seed": 48588,
      "resolution": "1080p",
      "ratio": "16:9",
      "duration": 5,
      "framespersecond": 24
    },
    {
      "id": "**********",
      "model": "seedance-1-0-pro-fast-251015",
      "status": "succeeded",
      "content": {
        "video_url": "https://download.cloudwise.ai/arts/{task_id}"
      },
      "usage": {
        "completion_tokens": 112710,
        "total_tokens": 112710
      },
      "created_at": 1763407199,
      "updated_at": 1763407248,
      "seed": 63654,
      "resolution": "480p",
      "ratio": "21:9",
      "duration": 12,
      "framespersecond": 24
    }
  ]
}
```

**Request Example**

```bash
curl -X GET https://api.cloudwise.ai/api/v1/aiproducts/video/seedance/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY"
```

**Response Example**

```json
{
  "total": 2,
  "items": [
    {
      "id": "**********",
      "model": "seedance-1-0-pro-fast-251015",
      "status": "succeeded",
      "content": {
        "video_url": "https://download.cloudwise.ai/arts/{task_id}"
      },
      "usage": {
        "completion_tokens": 246840,
        "total_tokens": 246840
      },
      "created_at": 1763438188,
      "updated_at": 1763438220,
      "seed": 48588,
      "resolution": "1080p",
      "ratio": "16:9",
      "duration": 5,
      "framespersecond": 24
    },
    {
      "id": "**********",
      "model": "seedance-1-0-pro-fast-251015",
      "status": "succeeded",
      "content": {
        "video_url": "https://download.cloudwise.ai/arts/{task_id}"
      },
      "usage": {
        "completion_tokens": 112710,
        "total_tokens": 112710
      },
      "created_at": 1763407199,
      "updated_at": 1763407248,
      "seed": 63654,
      "resolution": "480p",
      "ratio": "21:9",
      "duration": 12,
      "framespersecond": 24
    }
  ]
}
```

---

## BytePlus / Seedream-5.0-pro `POST`

_Official Format_

### Seedream-5.0-pro

BytePlus Seedream 5.0 Pro is the flagship image generation model featuring superior detail rendering, stronger aesthetics, and improved prompt adherence for professional-grade visual creations.

`POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream`

### Supported Models

| Provider | Model Name |
| --- | --- |
| byteplus | `dola-seedream-5-0-pro-260628` |
| byteplus | `doubao-seedream-5-0-pro-260628` |

### Overview

This document describes the input and output parameters for the image generation API, including: Use it to check parameter definitions when calling the API. **Generate a single image:** - Generate a single image from multiple reference images (2-10) + text prompt. - Generate a single image from a single reference image + text prompt. - Generate a single image from text prompt. **Note:** Seedream-5.0-pro does not support batch (sequential) image generation, web search, or streaming output. Passing `sequential_image_generation`, `sequential_image_generation_options`, `stream`, or `tools` will result in an error.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | String | doubao-seedream-5-0-pro-260628 | required<br>The model for this request: Model ID or inference endpoint (Endpoint ID). |
| prompt | string | - | required<br>The prompt for image generation.<br><br>The recommended length is no more than 600 English words. If the prompt is too long, the information may become scattered. The model might ignore details and only concentrate on the main points, resulting in a image with missing elements. |
| image | string/array | - | Enter the Base64 encoding or an accessible URL of the image to edit. Seedream-5.0-pro supports inputting a single image or multiple images (see the multi-image blending example).<br><br>- Image URL: Make sure that the image URL is accessible.<br>- Base64 encoding: The format must be `data:image/<image format>;base64,<Base64 encoding>`. Note: `<image format>` must be in lowercase, e.g., `data:image/png;base64,<base64_image>`.<br><br>**Description:**<br>- An input image must meet the following requirements:<br>• Image format: jpeg, png, webp, bmp, tiff, gif, heic, heif<br>• Aspect ratio (width/height): In the range [1/16, 16]<br>• Width and height (px): > 14<br>• Size: No more than 30 MB<br>• The value of total pixels: No more than 6000×6000<br>- Seedream-5.0-pro supports uploading a maximum of 10 reference images. |
| size | String | 1024x1024 | Specify the output image dimensions. Two methods are available, but they cannot be used at the same time.<br><br>**Method 1:** Specify the width and height of the generated image in pixels:<br>- Default value: 1024x1024<br>- Total pixels range: [1280x720=921,600, 2048x2048=4,194,304]<br>- Aspect ratio range: [1/16, 16]<br><br>**Method 2:** Specify the resolution of the generated image, and describe its aspect ratio, shape, or purpose in the prompt using natural language. You let the model determine the width and height.<br>- Optional values: 1K, 2K<br><br>**Resolution \\| Aspect ratio \\| Width and Height Pixel Values**<br><br>**1K**<br>• 1:1 - 1024x1024<br>• 4:3 - 1152x864<br>• 3:4 - 864x1152<br>• 16:9 - 1312x736<br>• 9:16 - 736x1312<br>• 3:2 - 1248x832<br>• 2:3 - 832x1248<br>• 21:9 - 1568x672<br><br>**2K**<br>• 1:1 - 2048x2048<br>• 4:3 - 2304x1728<br>• 3:4 - 1728x2304<br>• 16:9 - 2848x1600<br>• 9:16 - 1600x2848<br>• 3:2 - 2496x1664<br>• 2:3 - 1664x2496<br>• 21:9 - 3136x1344 |
| response_format | String | url | Specifies the return format for the generated image.<br><br>- `url`: returns a download link for the image. The link is valid for 24 hours after the image is generated. Download the image promptly.<br>- `b64_json`: Returns image data in JSON format as a Base64-encoded string. |
| watermark | Boolean | true | Adds a watermark to the generated image.<br><br>- `false`: Does not add a watermark.<br>- `true`: Adds a watermark with the text "AI generated" in the bottom-right corner of the image. |
| output_format | string | jpeg | Only seedream-5.0-pro and seedream-5.0-lite support this parameter. Specifies the format of the output image.<br><br>- `png`<br>- `jpeg` |
| optimize_prompt_options | object | - | Configuration for prompt optimization feature.<br><br>**optimize_prompt_options.mode** (string, default: standard)<br>Set the mode for the prompt optimization feature.<br><br>- `standard`: Standard mode. It generates content with higher quality but takes longer time.<br>- `fast`: Fast mode. It generates content in shorter time but with average quality. Not supported by seedream-5.0-pro yet. |

### Request Example

Text-to-Image

Image-to-Image

Multi-Image Blending

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "doubao-seedream-5-0-pro-260628",
    "prompt": "Vibrant close-up editorial portrait, a model with piercing eyes wearing a sculptural hat, rich color blocking, sharp focus on the eyes, shallow depth of field, Vogue magazine cover aesthetic, shot on medium format, strong studio lighting.",
    "response_format": "url",
    "size": "2K",
    "watermark": true,
    "output_format": "png"
}'
```

### Response

Non-streaming response parameters

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| model | String | The model ID used for this request (model name-version). |
| created | integer | The Unix timestamp in seconds of the creation time of the request. |
| data | array | Information about the output images.<br><br>**Possible type:**<br><br>***Image information object** - Successfully generated image information.<br>**Attributes:**<br>- `data.url` (string): The URL of the image, returned when response_format is specified as url. This link will expire within 24 hours of generation. Be sure to save the image promptly.<br>- `data.b64_json` (String): The Base64 information of the image, returned when response_format is specified as b64_json.<br>- `data.output_format` (String): Only seedream-5.0-pro returns this field. The file format of the output image.<br>- `data.size`(String): The width and height of the image in pixels, in the format <width>x<height>, such as 2048×2048.<br><br>***Error message object** - Error message for a failed image generation.<br>**Attributes:**<br>- `data.error` (Object): Error message structure.<br>• `data.error.code`: The error code for a failed image generation.<br>• `data.error.message`: Error message for a failed image generation. |
| usage | Object | Usage information for the current request.<br><br>**Attributes:**<br>- `usage.generated_images` (integer): The number of images successfully generated by the model, excluding failed generations. Billing is based on the number of successfully generated images.<br>- `usage.input_images` (integer): Only seedream-5.0-pro returns this field. The number of images input to the model.<br>- `usage.output_tokens` (integer): The number of tokens consumed for the images generated by the model. The calculation logic is to calculate sum(image width*image height)/256 and then round the result to an integer.<br>- `usage.total_tokens` (integer): The total number of tokens consumed by this request. Currently, input tokens are not calculated, so this value is the same as output_tokens. |
| error | object | The error message for this request, if any.<br><br>**Attributes:**<br>- `error.code` (String): Error code<br>- `error.message` (String): Error message |

#### Example Response

Text-to-Image

Image-to-Image

Multi-Image Blending

```json
{
    "model": "doubao-seedream-5-0-pro-260628",
    "created": 1757321139,
    "data": [
        {
            "url": "https://...",
            "size": "3104x1312",
            "output_format": "png"
        }
    ],
    "usage": {
        "generated_images": 1,
        "input_images": 0,
        "output_tokens": 15912,
        "total_tokens": 15912
    }
}
```

**Request Example (Text-to-Image)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "doubao-seedream-5-0-pro-260628",
    "prompt": "Vibrant close-up editorial portrait, a model with piercing eyes wearing a sculptural hat, rich color blocking, sharp focus on the eyes, shallow depth of field, Vogue magazine cover aesthetic, shot on medium format, strong studio lighting.",
    "response_format": "url",
    "size": "2K",
    "watermark": true,
    "output_format": "png"
}'
```

**Request Example (Image-to-Image)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "doubao-seedream-5-0-pro-260628",
    "prompt": "Generate a close-up image of a dog lying on lush grass.",
    "image": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imageToimage.png",
    "response_format": "url",
    "size": "2K",
    "watermark": true,
    "output_format": "jpeg"
}'
```

**Request Example (Multi-Image Blending)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "doubao-seedream-5-0-pro-260628",
    "prompt": "Replace the clothing in image 1 with the outfit from image 2.",
    "image": ["https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimage_1.png", "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimage_2.png"],
    "response_format": "url",
    "size": "2K",
    "output_format": "jpeg"
}'
```

**Response Example (Text-to-Image)**

```json
{
    "model": "doubao-seedream-5-0-pro-260628",
    "created": 1757321139,
    "data": [
        {
            "url": "https://...",
            "size": "3104x1312",
            "output_format": "png"
        }
    ],
    "usage": {
        "generated_images": 1,
        "input_images": 0,
        "output_tokens": 15912,
        "total_tokens": 15912
    }
}
```

**Response Example (Image-to-Image)**

```json
{
    "model": "doubao-seedream-5-0-pro-260628",
    "created": 1757321139,
    "data": [
        {
            "url": "https://...",
            "size": "3104x1312",
            "output_format": "jpeg"
        }
    ],
    "usage": {
        "generated_images": 1,
        "input_images": 1,
        "output_tokens": 15912,
        "total_tokens": 15912
    }
}
```

**Response Example (Multi-Image Blending)**

```json
{
    "model": "doubao-seedream-5-0-pro-260628",
    "created": 1757321139,
    "data": [
        {
            "url": "https://...",
            "size": "3104x1312",
            "output_format": "jpeg"
        }
    ],
    "usage": {
        "generated_images": 1,
        "input_images": 2,
        "output_tokens": 15912,
        "total_tokens": 15912
    }
}
```

---

## BytePlus / Seedream-5.0 `POST`

_Official Format_

### Seedream-5.0

BytePlus Seedream 5.0 is the latest image generation model featuring enhanced detail rendering, up to 3K/4K resolution output, and improved prompt adherence for stunning visual creations.

`POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream`

### Supported Models

| Provider | Model Name |
| --- | --- |
| byteplus | `seedream-5-0-260128` |
| byteplus | `seedream-5-0-260128-normal` |

### Overview

This document describes the input and output parameters for the image generation API, including: Use it to check parameter definitions when calling the API. **Generate multiple images in sequence** (a batch of related images generated based on your input; set sequential_image_generation to auto): - Generate a batch of related images based on your input of multiple reference images (2-10) + text prompt (the number of input reference images + the number of final output images ≤ 15). - Generate a batch of related images (up to 14) from a single reference image + text prompt. - Generate a batch of related images (up to 15) from text prompt. **Generate a single image** (set sequential_image_generation to disabled): - Generate a single image from multiple reference images (2-10) + text prompt. - Generate a single image from a single reference image + text prompt. - Generate a single image from text prompt.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | String | seedream-5-0-260128 | required<br>The model for this request: Model ID or inference endpoint (Endpoint ID). |
| prompt | string | - | required<br>The prompt for image generation.<br><br>The recommended length is no more than 600 English words. If the prompt is too long, the information may become scattered. The model might ignore details and only concentrate on the main points, resulting in a image with missing elements. |
| image | string/array | - | Only seedream-4.0, seedream-4.5 and seedream-5.0-lite support this parameter.<br><br>Enter the Base64 encoding or an accessible URL of the image to edit. Bytedance-seedream-4.0, seedream-4.5 and seedream-5.0-lite support inputting a single image or multiple images (see the multi-image blending example).<br><br>- Image URL: Make sure that the image URL is accessible.<br>- Base64 encoding: The format must be `data:image/<image format>;base64,<Base64 encoding>`. Note: `<image format>` must be in lowercase, e.g., `data:image/png;base64,<base64_image>`.<br><br>**Description:**<br>- An input image must meet the following requirements:<br>• Image format: jpeg, png<br>• Aspect ratio (width/height): In the range [1/3, 3]<br>• Width and height (px): > 14<br>• Size: No more than 10 MB<br>• The value of total pixels: No more than 6000×6000<br>- Seedream-4.0, seedream-4.5 and seedream-5.0-lite support uploading a maximum of 10 reference images. |
| size | String | 2048x2048 | Specify the output image dimensions. Two methods are available, but they cannot be used at the same time.<br><br>**Method 1:** Specify the resolution of the generated image, and describe its aspect ratio, shape, or purpose in the prompt using natural language. You let the model determine the width and height.<br>- Optional values: 2K, 3K<br><br>**Method 2:** Specify the width and height of the generated image in pixels:<br>- Default value: 2048x2048<br>- Total pixels range: [2560x1440=3,686,400, 3072x3072x1.1025=10,404,496]<br>- Aspect ratio range: [1/16, 16]<br><br>**Resolution \\| Aspect ratio \\| Width and Height Pixel Values**<br><br>**2K**<br>• 1:1 - 2048x2048<br>• 4:3 - 2304x1728<br>• 3:4 - 1728x2304<br>• 16:9 - 2848x1600<br>• 9:16 - 1600x2848<br>• 3:2 - 2496x1664<br>• 2:3 - 1664x2496<br>• 21:9 - 3136x1344<br><br>**3K**<br>• 1:1 - 3072x3072<br>• 4:3 - 3456x2592<br>• 3:4 - 2592x3456<br>• 16:9 - 4096x2304<br>• 9:16 - 2304x4096<br>• 2:3 - 2496x3744<br>• 3:2 - 3744x2496<br>• 21:9 - 4704x2016 |
| sequential_image_generation | String | disabled | Controls whether to disable the batch generation feature.<br><br>**Description:**<br>Batch image generation: a batch of thematically related images generated based on your input content.<br><br>**Valid values:**<br>- `auto`: In automatic mode, the model automatically determines whether to return multiple images and how many images it will contain based on the user's prompt.<br>- `disabled`: Disables batch generation feature. The model will only generate one image. |
| sequential_image_generation_options | object | - | Configuration for the batch image generation feature. This parameter is only effective when sequential_image_generation is set to auto.<br><br>**sequential_image_generation_options.max_images** (integer, default: 15)<br>Specifies the maximum number of images to generate in this request.<br>- Value range: [1, 15]<br><br>**Description:**<br>The actual number of generated images is affected by max_images and the number of input reference images. Number of input reference images + Number of generated images ≤ 15. |
| stream | boolean | false | Controls whether to enable streaming output mode.<br><br>- `false`: non-streaming output mode. All output images are returned one-shot after all images have been generated.<br>- `true`: streaming output mode. Each output image is returned immediately after it is generated. Streaming output mode is effective for both single and batch generation. |
| response_format | String | url | Specifies the return format for the generated image.<br><br>The generated image is in JPEG format and can be returned in the following two ways:<br>- `url`: returns a download link for the image. The link is valid for 24 hours after the image is generated. Download the image promptly.<br>- `b64_json`: Returns image data in JSON format as a Base64-encoded string. |
| watermark | Boolean | true | Adds a watermark to the generated image.<br><br>- `false`: Does not add a watermark.<br>- `true`: Adds a watermark with the text "AI generated" in the bottom-right corner of the image. |
| output_format | string | jpeg | Only seedream-5.0-lite supports this parameter. Specifies the format of the output image.<br><br>- `png`<br>- `jpeg` |
| optimize_prompt_options | object | - | Configuration for prompt optimization feature.<br><br>**optimize_prompt_options.mode** (string, default: standard)<br>Set the mode for the prompt optimization feature. By default, seedream-4.0, seedream-4.5 and seedream-5.0-lite use the standard mode to optimize the prompts entered by users.<br><br>- `standard`: Standard mode. It generates content with higher quality but takes longer time.<br>- `fast`: Fast mode. It generates content in shorter time but with average quality. |

### Request Example

Text-to-Image

Image-to-Image

Multi-Image Blending

Multi-Image-to-Batch-Image

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-5-0-260128",
    "prompt": "Interstellar travel, a black hole, from which a nearly shattered vintage train bursts forth, visually striking, cinematic blockbuster, apocalyptic vibe, dynamic, contrasting colors, OC render, ray tracing, motion blur, depth of field, surrealism, deep blue. The image uses delicate and rich color layers to shape the subject and scene, with realistic textures. The dark style backgrounds light and shadow effects create an atmospheric mood, blending artistic fantasy with an exaggerated wide-angle perspective, lens flare, reflections, extreme light and shadow, intense gravitational pull, devouring.",
    "sequential_image_generation": "disabled",
    "response_format": "url",
    "size": "2K",
    "stream": false,
    "watermark": true,
    "output_format": "jpeg"
}'
```

### Response

Non-streaming response parameters

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| model | String | The model ID used for this request (model name-version). |
| created | integer | The Unix timestamp in seconds of the creation time of the request. |
| data | array | Information about the output images.<br><br>**Description:**<br>When generating a batch of images with the seedream-5.0-lite model, if an image fails to generate:<br>- If the failure is due to the rejection by content filter: The next picture generation task will still be requested, not affecting the generation of other pictures in the same request.<br>- If the failure is due to an internal service error (500): The next picture generation task will not be requested.<br><br>**Possible type:**<br><br>***Image information object** - Successfully generated image information.<br>**Attributes:**<br>- `data.url` (string): The URL of the image, returned when response_format is specified as url. This link will expire within 24 hours of generation. Be sure to save the image promptly.<br>- `data.b64_json` (String): The Base64 information of the image, returned when response_format is specified as b64_json.<br>- `data.size`(String): The width and height of the image in pixels, in the format <width>x<height>, such as 2048×2048.<br><br>***Error message object** - Error message for a failed image generation.<br>**Attributes:**<br>- `data.error` (Object): Error message structure.<br>• `data.error.code`: The error code for a failed image generation.<br>• `data.error.message`: Error message for a failed image generation. |
| usage | Object | Usage information for the current request.<br><br>**Attributes:**<br>- `usage.generated_images` (integer): The number of images successfully generated by the model, excluding failed generations. Billing is based on the number of successfully generated images.<br>- `usage.output_tokens` (integer): The number of tokens consumed for the images generated by the model. The calculation logic is to calculate sum(image width*image height)/256 and then round the result to an integer.<br>- `usage.total_tokens` (integer): The total number of tokens consumed by this request. Currently, input tokens are not calculated, so this value is the same as output_tokens. |
| error | object | The error message for this request, if any.<br><br>**Attributes:**<br>- `error.code` (String): Error code<br>- `error.message` (String): Error message |

#### Example Response

Text-to-Image

Image-to-Image

Multi-Image Blending

Multi-Image-to-Batch-Image

```json
{
    "model": "seedream-5-0-260128",
    "created": 1757323224,
    "data": [
        {
            "url": "https://...",
            "size": "1760x2368"
        }
    ],
    "usage": {
        "generated_images": 1,
        "output_tokens": 16280,
        "total_tokens": 16280
    }
}
```

**Request Example (Text-to-Image)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-5-0-260128",
    "prompt": "Interstellar travel, a black hole, from which a nearly shattered vintage train bursts forth, visually striking, cinematic blockbuster, apocalyptic vibe, dynamic, contrasting colors, OC render, ray tracing, motion blur, depth of field, surrealism, deep blue. The image uses delicate and rich color layers to shape the subject and scene, with realistic textures. The dark style backgrounds light and shadow effects create an atmospheric mood, blending artistic fantasy with an exaggerated wide-angle perspective, lens flare, reflections, extreme light and shadow, intense gravitational pull, devouring.",
    "sequential_image_generation": "disabled",
    "response_format": "url",
    "size": "2K",
    "stream": false,
    "watermark": true,
    "output_format": "jpeg"
}'
```

**Request Example (Image-to-Image)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-5-0-260128",
    "prompt": "Generate a close-up image of a dog lying on lush grass.",
    "image": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imageToimage.png",
    "sequential_image_generation": "disabled",
    "response_format": "url",
    "size": "2K",
    "stream": false,
    "watermark": true,
    "output_format": "jpeg"
}'
```

**Request Example (Multi-Image Blending)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-5-0-260128",
    "prompt": "Replace the clothing in image 1 with the outfit from image 2.",
    "image": ["https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimage_1.png", "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimage_2.png"],
    "sequential_image_generation": "disabled",
    "size": "2K",
    "output_format": "jpeg"
}'
```

**Request Example (Multi-Image-to-Batch-Image)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-5-0-260128",
    "prompt": "Generate 3 images of a girl and a cow plushie happily riding a roller coaster in an amusement park, depicting morning, noon, and night.",
    "image": ["https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimages_1.png", "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimages_2.png"],
    "sequential_image_generation": "auto",
    "sequential_image_generation_options": {
        "max_images": 3
    },
    "size": "2K",
    "output_format": "jpeg"
}'
```

**Response Example (Text-to-Image)**

```json
{
    "model": "seedream-5-0-260128",
    "created": 1757323224,
    "data": [
        {
            "url": "https://...",
            "size": "1760x2368"
        }
    ],
    "usage": {
        "generated_images": 1,
        "output_tokens": 16280,
        "total_tokens": 16280
    }
}
```

**Response Example (Image-to-Image)**

```json
{
    "model": "seedream-5-0-260128",
    "created": 1757323224,
    "data": [
        {
            "url": "https://...",
            "size": "1760x2368"
        }
    ],
    "usage": {
        "generated_images": 1,
        "output_tokens": 16280,
        "total_tokens": 16280
    }
}
```

**Response Example (Multi-Image Blending)**

```json
{
    "model": "seedream-5-0-260128",
    "created": 1757323224,
    "data": [
        {
            "url": "https://...",
            "size": "1760x2368"
        }
    ],
    "usage": {
        "generated_images": 1,
        "output_tokens": 16280,
        "total_tokens": 16280
    }
}
```

**Response Example (Multi-Image-to-Batch-Image)**

```json
{
  "model": "seedream-5-0-260128",
  "created": 1757388756,
  "data": [
    {
      "url": "https://...",
      "size": "2720x1536"
    },
    {
      "url": "https://...",
      "size": "2720x1536"
    },
    {
      "url": "https://...",
      "size": "2720x1536"
    }
  ],
  "usage": {
    "generated_images": 3,
    "output_tokens": 48960,
    "total_tokens": 48960
  }
}
```

---

## BytePlus / Seedream-4.5 `POST`

_Official Format_

### Seedream-4.5

BytePlus Seedream 4.5 is a New High-Aesthetic Image Generation Model with stronger spatial understanding, richer world knowledge, superior aesthetics, higher consistency, and smarter instruction following for precise visual creation.

`POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream`

### Overview

This document describes the input and output parameters for the image generation API, including: Use it to check parameter definitions when calling the API. **Generate multiple images in sequence** (a batch of related images generated based on your input; set sequential_image_generation to auto): - Generate a batch of related images based on your input of multiple reference images (2-10) + text prompt (the number of input reference images + the number of final output images ≤ 15). - Generate a batch of related images (up to 14) from a single reference image + text prompt. - Generate a batch of related images (up to 15) from text prompt. **Generate a single image** (set sequential_image_generation to disabled): - Generate a single image from multiple reference images (2-10) + text prompt. - Generate a single image from a single reference image + text prompt. - Generate a single image from text prompt.

### HeaAuthenticationders

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | String | seedream-4-5-251128 | required<br>The model for this request: Model ID or inference endpoint (Endpoint ID). |
| prompt | string | - | required<br>The prompt for image generation.<br><br>The recommended length is no more than 600 English words. If the prompt is too long, the information may become scattered. The model might ignore details and only concentrate on the main points, resulting in a image with missing elements. |
| image | string/array | - | Only seedream-4.0, seedream-4.5 and seedream-5.0-lite support this parameter.<br><br>Enter the Base64 encoding or an accessible URL of the image to edit. These models support a single image or multiple images (see the multi-image blending example).<br><br><br>- Image URL: Make sure that the image URL is accessible.<br>- Base64 encoding: The format must be `data:image/<image format>;base64,<Base64 encoding>`. The image format must be lowercase, for example `data:image/png;base64,<base64_image>`.<br><br>**Description:**<br>- Image format: jpeg, png.<br>- Aspect ratio (width/height): in the range [1/3, 3].<br>- Width and height (px): > 14.<br>- Size: no more than 10 MB.<br>- Total pixels: no more than 6000x6000.<br>- A maximum of 10 reference images is supported. |
| size | String | 2048x2048 | Set the specification for the generated image. Two methods are available but cannot be used together.<br><br>**Method 1:** Specify the resolution of the generated image, and describe its aspect ratio, shape, or purpose in the prompt using natural language. Let the model determine the final image width and height.<br>- Optional values: `2K, 4K`<br><br>**Method 2:** Specify the width and height of the generated image in pixels.<br>- Default value: 2048x2048<br>- Total pixels range: `[2560x1440=3,686,400, 4096x4096=16,777,216]`<br>- Aspect ratio range: `[1/16, 16]`<br><br>**Recommended width and height:**<br>- 1:1 - 2048x2048<br>- 4:3 - 2304x1728<br>- 3:4 - 1728x2304<br>- 16:9 - 2560x1440<br>- 9:16 - 1440x2560<br>- 3:2 - 2496x1664<br>- 2:3 - 1664x2496<br>- 21:9 - 3024x1296 |
| sequential_image_generation | String | disabled | Controls whether to disable the batch generation feature.<br><br>**Description:**<br>Batch image generation: a batch of thematically related images generated based on your input content.<br><br>**Valid values:**<br>- `auto`: In automatic mode, the model automatically determines whether to return multiple images and how many images it will contain based on the user's prompt.<br>- `disabled`: Disables batch generation feature. The model will only generate one image. |
| sequential_image_generation_options | object | - | Configuration for the batch image generation feature. This parameter is only effective when `sequential_image_generation` is set to `auto`.<br><br>**sequential_image_generation_options.max_images** (integer, default: 15)<br>Specifies the maximum number of images to generate in this request.<br>- Value range: [1, 15]<br><br>**Description:**<br>The actual number of generated images is affected by max_images and the number of input reference images. Number of input reference images + number of generated images must be less than or equal to 15. |
| stream | boolean | false | Controls whether to enable streaming output mode.<br><br>- `false`: non-streaming output mode. All output images are returned one-shot after all images have been generated.<br>- `true`: streaming output mode. Each output image is returned immediately after it is generated. Streaming output mode is effective for both single and batch generation. |
| response_format | String | url | Specifies the return format for the generated image.<br><br>The generated image is in JPEG format and can be returned in the following two ways:<br>- `url`: returns a download link for the image. The link is valid for 24 hours after generation. Download the image promptly.<br>- `b64_json`: returns image data as a Base64-encoded string. |
| watermark | Boolean | true | Adds a watermark to the generated image.<br><br>- `false`: Does not add a watermark.<br>- `true`: Adds a watermark with the text "AI generated" in the bottom-right corner of the image. |
| optimize_prompt_options | object | - | Configuration for prompt optimization feature.<br><br>**optimize_prompt_options.mode** (string, default: standard)<br>By default, seedream-4.0, seedream-4.5 and seedream-5.0-lite use the standard mode to optimize prompts entered by users.<br><br>- `standard`: Standard mode. It generates content with higher quality but takes longer time.<br>- `fast`: Fast mode. It generates content in shorter time but with average quality. |

### Request Example

Text-to-Image

Image-to-Image

Multi-Image Blending

Multi-Image-to-Batch-Image

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-4-5-251128",
    "prompt": "Interstellar travel, a black hole, from which a nearly shattered vintage train bursts forth, visually striking, cinematic blockbuster, apocalyptic vibe, dynamic, contrasting colors, OC render, ray tracing, motion blur, depth of field, surrealism, deep blue. The image uses delicate and rich color layers to shape the subject and scene, with realistic textures. The dark style backgrounds light and shadow effects create an atmospheric mood, blending artistic fantasy with an exaggerated wide-angle perspective, lens flare, reflections, extreme light and shadow, intense gravitational pull, devouring.",
    "sequential_image_generation": "disabled",
    "response_format": "url",
    "size": "2K",
    "stream": false,
    "watermark": true
}'
```

### Response

Non-streaming response parameters

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| model | String | The model ID used for this request (model name-version). |
| created | integer | The Unix timestamp in seconds of the creation time of the request. |
| data | array | Information about the output images.<br><br>**Description:**<br>When generating a batch of images with the seedream-5.0-lite model, if an image fails to generate:<br>- If the failure is due to the rejection by content filter: The next picture generation task will still be requested, not affecting the generation of other pictures in the same request.<br>- If the failure is due to an internal service error (500): The next picture generation task will not be requested.<br><br>**Possible type:**<br><br>***Image information object** - Successfully generated image information.<br>**Attributes:**<br>- `data.url` (string): The URL of the image, returned when response_format is specified as url. This link will expire within 24 hours of generation. Be sure to save the image promptly.<br>- `data.b64_json` (String): The Base64 information of the image, returned when response_format is specified as b64_json.<br>- `data.size`(String): The width and height of the image in pixels, in the format <width>x<height>, such as 2048×2048.<br><br>***Error message object** - Error message for a failed image generation.<br>**Attributes:**<br>- `data.error` (Object): Error message structure.<br>• `data.error.code`: The error code for a failed image generation.<br>• `data.error.message`: Error message for a failed image generation. |
| usage | Object | Usage information for the current request.<br><br>**Attributes:**<br>- `usage.generated_images` (integer): number of images successfully generated by the model, excluding failed generations. Billing is based on the number of successfully generated images.<br>- `usage.output_tokens`: sum(width × height) / 256, rounded.<br>- `usage.total_tokens`: same as `output_tokens` (inputs are not counted). |
| error | object | The error message for this request, if any. Contains `error.code` (String) and `error.message` (String). |

#### Example Response

Text-to-Image

Image-to-Image

Multi-Image Blending

Multi-Image-to-Batch-Image

```json
{
    "model": "seedream-4-5-251128",
    "created": 1757323224,
    "data": [
        {
            "url": "https://...",
            "size": "1760x2368"
        }
    ],
    "usage": {
        "generated_images": 1,
        "output_tokens": 16280,
        "total_tokens": 16280
    }
}
```

**Request Example (Text-to-Image)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-4-5-251128",
    "prompt": "Interstellar travel, a black hole, from which a nearly shattered vintage train bursts forth, visually striking, cinematic blockbuster, apocalyptic vibe, dynamic, contrasting colors, OC render, ray tracing, motion blur, depth of field, surrealism, deep blue. The image uses delicate and rich color layers to shape the subject and scene, with realistic textures. The dark style backgrounds light and shadow effects create an atmospheric mood, blending artistic fantasy with an exaggerated wide-angle perspective, lens flare, reflections, extreme light and shadow, intense gravitational pull, devouring.",
    "sequential_image_generation": "disabled",
    "response_format": "url",
    "size": "2K",
    "stream": false,
    "watermark": true
}'
```

**Request Example (Image-to-Image)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-4-5-251128",
    "prompt": "Generate a close-up image of a dog lying on lush grass.",
    "image": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imageToimage.png",
    "sequential_image_generation": "disabled",
    "response_format": "url",
    "size": "2K",
    "stream": false,
    "watermark": true
}'
```

**Request Example (Multi-Image Blending)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-4-5-251128",
    "prompt": "Replace the clothing in image 1 with the outfit from image 2.",
    "image": ["https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimage_1.png", "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimage_2.png"],
    "sequential_image_generation": "disabled",
    "size": "2K"
}'
```

**Request Example (Multi-Image-to-Batch-Image)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-4-5-251128",
    "prompt": "Generate 3 images of a girl and a cow plushie happily riding a roller coaster in an amusement park, depicting morning, noon, and night.",
    "image": ["https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimages_1.png", "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimages_2.png"],
    "sequential_image_generation": "auto",
    "sequential_image_generation_options": {
        "max_images": 3
    },
    "size": "2K"
}'
```

**Response Example (Text-to-Image)**

```json
{
    "model": "seedream-4-5-251128",
    "created": 1757323224,
    "data": [
        {
            "url": "https://...",
            "size": "1760x2368"
        }
    ],
    "usage": {
        "generated_images": 1,
        "output_tokens": 16280,
        "total_tokens": 16280
    }
}
```

**Response Example (Image-to-Image)**

```json
{
    "model": "seedream-4-5-251128",
    "created": 1757323224,
    "data": [
        {
            "url": "https://...",
            "size": "1760x2368"
        }
    ],
    "usage": {
        "generated_images": 1,
        "output_tokens": 16280,
        "total_tokens": 16280
    }
}
```

**Response Example (Multi-Image Blending)**

```json
{
    "model": "seedream-4-5-251128",
    "created": 1757323224,
    "data": [
        {
            "url": "https://...",
            "size": "1760x2368"
        }
    ],
    "usage": {
        "generated_images": 1,
        "output_tokens": 16280,
        "total_tokens": 16280
    }
}
```

**Response Example (Multi-Image-to-Batch-Image)**

```json
{
  "model": "seedream-4-5-251128",
  "created": 1757388756,
  "data": [
    {
      "url": "https://...",
      "size": "2720x1536"
    },
    {
      "url": "https://...",
      "size": "2720x1536"
    },
    {
      "url": "https://...",
      "size": "2720x1536"
    }
  ],
  "usage": {
    "generated_images": 3,
    "output_tokens": 48960,
    "total_tokens": 48960
  }
}
```

---

## BytePlus / Seedream-4.0 `POST`

_Official Format_

### Seedream-4.0

Byteplus Seedream 4.0 is a SOTA multimodal image generation model, enabling text-to-image creation, image editing and multi-image generation within a single model, supports a wide range of creative scenarios.

`POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream`

### Overview

This document describes the input and output parameters for the image generation API, including: Use it to check parameter definitions when calling the API. **Generate multiple images in sequence** (a batch of related images generated based on your input; set sequential_image_generation to auto): - Generate a batch of related images based on your input of multiple reference images (2-10) + text prompt (the number of input reference images + the number of final output images ≤ 15). - Generate a batch of related images (up to 14) from a single reference image + text prompt. - Generate a batch of related images (up to 15) from text prompt. **Generate a single image** (set sequential_image_generation to disabled): - Generate a single image from multiple reference images (2-10) + text prompt. - Generate a single image from a single reference image + text prompt. - Generate a single image from text prompt.

### HeaAuthenticationders

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | String | seedream-4-0-250828 | required<br>The model for this request: Model ID or inference endpoint (Endpoint ID). |
| prompt | string | - | required<br>The prompt for image generation.<br><br>The recommended length is no more than 600 English words. If the prompt is too long, the information may become scattered. The model might ignore details and only concentrate on the main points, resulting in a image with missing elements. |
| image | string/array | - | Only seedream-4.0, seedream-4.5 and seedream-5.0-lite support this parameter.<br><br>Enter the Base64 encoding or an accessible URL of the image to edit. These models support a single image or multiple images (see the multi-image blending example).<br><br><br>- Image URL: Make sure that the image URL is accessible.<br>- Base64 encoding: The format must be `data:image/<image format>;base64,<Base64 encoding>`. The image format must be lowercase, for example `data:image/png;base64,<base64_image>`.<br><br>**Description:**<br>- Image format: jpeg, png.<br>- Aspect ratio (width/height): in the range [1/3, 3].<br>- Width and height (px): > 14.<br>- Size: no more than 10 MB.<br>- Total pixels: no more than 6000x6000.<br>- A maximum of 10 reference images is supported. |
| size | String | 2048x2048 | Set the specification for the generated image. Two methods are available but cannot be used together.<br><br>**Method 1:** Specify the resolution of the generated image, and describe its aspect ratio, shape, or purpose in the prompt using natural language. Let the model determine the final image width and height.<br>- Optional values: `1K, 2K, 4K`<br><br>**Method 2:** Specify the width and height of the generated image in pixels.<br>- Default value: 2048x2048<br>- Total pixels range: `[1280x720, 4096x4096]`<br>- Aspect ratio range: `[1/16, 16]`<br><br>**Recommended width and height:**<br>- 1:1 - 2048x2048<br>- 4:3 - 2304x1728<br>- 3:4 - 1728x2304<br>- 16:9 - 2560x1440<br>- 9:16 - 1440x2560<br>- 3:2 - 2496x1664<br>- 2:3 - 1664x2496<br>- 21:9 - 3024x1296 |
| sequential_image_generation | String | disabled | Controls whether to disable the batch generation feature.<br><br>**Description:**<br>Batch image generation: a batch of thematically related images generated based on your input content.<br><br>**Valid values:**<br>- `auto`: In automatic mode, the model automatically determines whether to return multiple images and how many images it will contain based on the user's prompt.<br>- `disabled`: Disables batch generation feature. The model will only generate one image. |
| sequential_image_generation_options | object | - | Configuration for the batch image generation feature. This parameter is only effective when `sequential_image_generation` is set to `auto`.<br><br>**sequential_image_generation_options.max_images** (integer, default: 15)<br>Specifies the maximum number of images to generate in this request.<br>- Value range: [1, 15]<br><br>**Description:**<br>The actual number of generated images is affected by max_images and the number of input reference images. Number of input reference images + number of generated images must be less than or equal to 15. |
| stream | boolean | false | Controls whether to enable streaming output mode.<br><br>- `false`: non-streaming output mode. All output images are returned one-shot after all images have been generated.<br>- `true`: streaming output mode. Each output image is returned immediately after it is generated. Streaming output mode is effective for both single and batch generation. |
| response_format | String | url | Specifies the return format for the generated image.<br><br>The generated image is in JPEG format and can be returned in the following two ways:<br>- `url`: returns a download link for the image. The link is valid for 24 hours after generation. Download the image promptly.<br>- `b64_json`: returns image data as a Base64-encoded string. |
| watermark | Boolean | true | Adds a watermark to the generated image.<br><br>- `false`: Does not add a watermark.<br>- `true`: Adds a watermark with the text "AI generated" in the bottom-right corner of the image. |
| optimize_prompt_options | object | - | Configuration for prompt optimization feature.<br><br>**optimize_prompt_options.mode** (string, default: standard)<br>By default, seedream-4.0, seedream-4.5 and seedream-5.0-lite use the standard mode to optimize prompts entered by users.<br><br>- `standard`: Standard mode. It generates content with higher quality but takes longer time.<br>- `fast`: Fast mode. It generates content in shorter time but with average quality. |

### Request Example

Text-to-Image

Image-to-Image

Multi-Image Blending

Multi-Image-to-Batch-Image

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-4-0-250828",
    "prompt": "Interstellar travel, a black hole, from which a nearly shattered vintage train bursts forth, visually striking, cinematic blockbuster, apocalyptic vibe, dynamic, contrasting colors, OC render, ray tracing, motion blur, depth of field, surrealism, deep blue. The image uses delicate and rich color layers to shape the subject and scene, with realistic textures. The dark style backgrounds light and shadow effects create an atmospheric mood, blending artistic fantasy with an exaggerated wide-angle perspective, lens flare, reflections, extreme light and shadow, intense gravitational pull, devouring.",
    "sequential_image_generation": "disabled",
    "response_format": "url",
    "size": "2K",
    "stream": false,
    "watermark": true
}'
```

### Response

Non-streaming response parameters

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| model | String | The model ID used for this request (model name-version). |
| created | integer | The Unix timestamp in seconds of the creation time of the request. |
| data | array | Information about the output images.<br><br>**Description:**<br>When generating a batch of images with the seedream-5.0-lite model, if an image fails to generate:<br>- If the failure is due to the rejection by content filter: The next picture generation task will still be requested, not affecting the generation of other pictures in the same request.<br>- If the failure is due to an internal service error (500): The next picture generation task will not be requested.<br><br>**Possible type:**<br><br>***Image information object** - Successfully generated image information.<br>**Attributes:**<br>- `data.url` (string): The URL of the image, returned when response_format is specified as url. This link will expire within 24 hours of generation. Be sure to save the image promptly.<br>- `data.b64_json` (String): The Base64 information of the image, returned when response_format is specified as b64_json.<br>- `data.size`(String): The width and height of the image in pixels, in the format <width>x<height>, such as 2048×2048.<br><br>***Error message object** - Error message for a failed image generation.<br>**Attributes:**<br>- `data.error` (Object): Error message structure.<br>• `data.error.code`: The error code for a failed image generation.<br>• `data.error.message`: Error message for a failed image generation. |
| usage | Object | Usage information for the current request.<br><br>**Attributes:**<br>- `usage.generated_images` (integer): number of images successfully generated by the model, excluding failed generations. Billing is based on the number of successfully generated images.<br>- `usage.output_tokens`: sum(width × height) / 256, rounded.<br>- `usage.total_tokens`: same as `output_tokens` (inputs are not counted). |
| error | object | The error message for this request, if any. Contains `error.code` (String) and `error.message` (String). |

#### Example Response

Text-to-Image

Image-to-Image

Multi-Image Blending

Multi-Image-to-Batch-Image

```json
{
    "model": "seedream-4-0-250828",
    "created": 1757323224,
    "data": [
        {
            "url": "https://...",
            "size": "1760x2368"
        }
    ],
    "usage": {
        "generated_images": 1,
        "output_tokens": 16280,
        "total_tokens": 16280
    }
}
```

**Request Example (Text-to-Image)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-4-0-250828",
    "prompt": "Interstellar travel, a black hole, from which a nearly shattered vintage train bursts forth, visually striking, cinematic blockbuster, apocalyptic vibe, dynamic, contrasting colors, OC render, ray tracing, motion blur, depth of field, surrealism, deep blue. The image uses delicate and rich color layers to shape the subject and scene, with realistic textures. The dark style backgrounds light and shadow effects create an atmospheric mood, blending artistic fantasy with an exaggerated wide-angle perspective, lens flare, reflections, extreme light and shadow, intense gravitational pull, devouring.",
    "sequential_image_generation": "disabled",
    "response_format": "url",
    "size": "2K",
    "stream": false,
    "watermark": true
}'
```

**Request Example (Image-to-Image)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-4-0-250828",
    "prompt": "Generate a close-up image of a dog lying on lush grass.",
    "image": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imageToimage.png",
    "sequential_image_generation": "disabled",
    "response_format": "url",
    "size": "2K",
    "stream": false,
    "watermark": true
}'
```

**Request Example (Multi-Image Blending)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-4-0-250828",
    "prompt": "Replace the clothing in image 1 with the outfit from image 2.",
    "image": ["https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimage_1.png", "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimage_2.png"],
    "sequential_image_generation": "disabled",
    "size": "2K"
}'
```

**Request Example (Multi-Image-to-Batch-Image)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/aiproducts/image/seedream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "seedream-4-0-250828",
    "prompt": "Generate 3 images of a girl and a cow plushie happily riding a roller coaster in an amusement park, depicting morning, noon, and night.",
    "image": ["https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimages_1.png", "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seedream4_imagesToimages_2.png"],
    "sequential_image_generation": "auto",
    "sequential_image_generation_options": {
        "max_images": 3
    },
    "size": "2K"
}'
```

**Response Example (Text-to-Image)**

```json
{
    "model": "seedream-4-0-250828",
    "created": 1757323224,
    "data": [
        {
            "url": "https://...",
            "size": "1760x2368"
        }
    ],
    "usage": {
        "generated_images": 1,
        "output_tokens": 16280,
        "total_tokens": 16280
    }
}
```

**Response Example (Image-to-Image)**

```json
{
    "model": "seedream-4-0-250828",
    "created": 1757323224,
    "data": [
        {
            "url": "https://...",
            "size": "1760x2368"
        }
    ],
    "usage": {
        "generated_images": 1,
        "output_tokens": 16280,
        "total_tokens": 16280
    }
}
```

**Response Example (Multi-Image Blending)**

```json
{
    "model": "seedream-4-0-250828",
    "created": 1757323224,
    "data": [
        {
            "url": "https://...",
            "size": "1760x2368"
        }
    ],
    "usage": {
        "generated_images": 1,
        "output_tokens": 16280,
        "total_tokens": 16280
    }
}
```

**Response Example (Multi-Image-to-Batch-Image)**

```json
{
  "model": "seedream-4-0-250828",
  "created": 1757388756,
  "data": [
    {
      "url": "https://...",
      "size": "2720x1536"
    },
    {
      "url": "https://...",
      "size": "2720x1536"
    },
    {
      "url": "https://...",
      "size": "2720x1536"
    }
  ],
  "usage": {
    "generated_images": 3,
    "output_tokens": 48960,
    "total_tokens": 48960
  }
}
```

---

## BytePlus / Seed-1.8 `POST`

_Official Format(Chat)_

### Seed-1.8

Seed 1.8 general-purpose version by ByteDance Seed team, a balanced language model. Performs well across dialogue, writing, translation, and summarization tasks. Deeply optimized for Chinese scenarios, understanding Chinese context and cultural background, suitable for daily use.

`POST https://api.cloudwise.ai/api/v3/chat/completions`

### Overview

This endpoint provides text generation functionality using the Seed-1.8 model. Upload images or provide image URLs to analyze and understand image content with vision-enabled models.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | "doubao-seed-1-8-251228" | required<br>The model to use for the request. Must be a text-enabled model. |
| messages | array | - | required<br>Array of message objects for the conversation. Each message contains role and content. |
| stream | boolean | false | Whether to stream the response. |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v3/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY ' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "doubao-seed-1-8-251228",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Hello, please introduce yourself"
          }
        ]
      }
    ]
}'
```

### Response

The response contains the generated text and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier for the chat completion. |
| object | string | The object type, which is always chat.completion. |
| created | integer | Unix timestamp in seconds. |
| model | string | Model name used for the request. |

#### Example Response

```json
{
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "logprobs": null,
      "message": {
        "content": "Hello there! I'm Doubao, an AI developed by ByteDance. I'm here to help with all kinds of things—whether you want to ask questions on a wide range of topics, have a casual chat about your interests, brainstorm creative ideas, get study or work tips, or even just need someone to bounce thoughts off of. Feel free to tell me what you need, and I'll do my best to assist you! 😊",
        "reasoning_content": "Got it, the user said \"Hello, please introduce yourself\" in English, so I need to respond in English as well. Let me start with a friendly greeting back. Then introduce myself clearly: my name is Doubao, developed by ByteDance. Mention that I can help with various things like answering questions, chatting, brainstorming, learning support, etc. Keep the tone warm and approachable. Let me put that together.",
        "role": "assistant"
      }
    }
  ],
  "created": 1768121903,
  "id": "0217681218987384d6fef69588cf5fe521a1e6494fd0573c862cf",
  "model": "doubao-seed-1-8-251228",
  "service_tier": "default",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 178,
    "prompt_tokens": 53,
    "total_tokens": 231,
    "prompt_tokens_details": {
      "cached_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 89
    }
  }
}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v3/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY ' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "doubao-seed-1-8-251228",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Hello, please introduce yourself"
          }
        ]
      }
    ]
}'
```

**Response Example**

```json
{
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "logprobs": null,
      "message": {
        "content": "Hello there! I'm Doubao, an AI developed by ByteDance. I'm here to help with all kinds of things—whether you want to ask questions on a wide range of topics, have a casual chat about your interests, brainstorm creative ideas, get study or work tips, or even just need someone to bounce thoughts off of. Feel free to tell me what you need, and I'll do my best to assist you! 😊",
        "reasoning_content": "Got it, the user said \"Hello, please introduce yourself\" in English, so I need to respond in English as well. Let me start with a friendly greeting back. Then introduce myself clearly: my name is Doubao, developed by ByteDance. Mention that I can help with various things like answering questions, chatting, brainstorming, learning support, etc. Keep the tone warm and approachable. Let me put that together.",
        "role": "assistant"
      }
    }
  ],
  "created": 1768121903,
  "id": "0217681218987384d6fef69588cf5fe521a1e6494fd0573c862cf",
  "model": "doubao-seed-1-8-251228",
  "service_tier": "default",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 178,
    "prompt_tokens": 53,
    "total_tokens": 231,
    "prompt_tokens_details": {
      "cached_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 89
    }
  }
}
```

---

## BytePlus / Seed-2.0 `POST`

_Official Format(Chat)_

### Seed-2.0

Seed 2.0 series by the ByteDance Seed team, served via BytePlus. A family of language models spanning flagship (pro), code, lite, and mini tiers. All models share the same OpenAI-compatible Chat Completions interface and support context lengths up to 256K tokens; lite and mini additionally accept audio input.

`POST https://api.cloudwise.ai/api/v3/chat/completions`

### Overview

This endpoint provides text generation using the Seed 2.0 series models via an OpenAI-compatible Chat Completions API. All models in the series share the same request and response parameters — only the `model` field changes between them. Choose a model from the Supported Models table below based on the capability tier you need.

### Supported Models

All models below are called through the same endpoint and accept the same parameters. Select the tier that fits your use case.

| Model |
| --- |
| seed-2-0-pro-260328 |
| seed-2-0-code-preview-260328 |
| seed-2-0-lite-260228 |
| seed-2-0-lite-260428 |
| seed-2-0-mini-260428 |
| doubao-seed-2-0-lite-260215 |

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | "seed-2-0-pro-260328" | required<br>The model to use for the request. Must be one of the Seed 2.0 models listed under Supported Models. |
| messages | array | - | required<br>Array of message objects for the conversation. Each message contains role and content. |
| stream | boolean | false | Whether to stream the response. |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v3/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY ' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "seed-2-0-pro-260328",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Hello, please introduce yourself"
          }
        ]
      }
    ]
}'
```

### Response

The response contains the generated text and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier for the chat completion. |
| object | string | The object type, which is always chat.completion. |
| created | integer | Unix timestamp in seconds. |
| model | string | Model name used for the request. |

#### Example Response

```json
{
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "logprobs": null,
      "message": {
        "content": "Hello! I'm Seed 2.0, a large language model developed by the ByteDance Seed team and served via BytePlus. I can help with reasoning, writing, translation, coding, and long-context understanding (up to 256K tokens). Tell me what you'd like to work on and I'll do my best to help! 😊",
        "reasoning_content": "The user greeted me and asked for a self-introduction. I should reply in English, state my model family (Seed 2.0), note the provider (ByteDance Seed / BytePlus), highlight core capabilities and long-context support, and invite the user to continue. Keep it concise and friendly.",
        "role": "assistant"
      }
    }
  ],
  "created": 1770000000,
  "id": "021770000000000seed20abcdef0123456789abcdef0123456789",
  "model": "seed-2-0-pro-260328",
  "service_tier": "default",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 78,
    "prompt_tokens": 53,
    "total_tokens": 131,
    "prompt_tokens_details": {
      "cached_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 60
    }
  }
}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v3/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY ' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "seed-2-0-pro-260328",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Hello, please introduce yourself"
          }
        ]
      }
    ]
}'
```

**Response Example**

```json
{
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "logprobs": null,
      "message": {
        "content": "Hello! I'm Seed 2.0, a large language model developed by the ByteDance Seed team and served via BytePlus. I can help with reasoning, writing, translation, coding, and long-context understanding (up to 256K tokens). Tell me what you'd like to work on and I'll do my best to help! 😊",
        "reasoning_content": "The user greeted me and asked for a self-introduction. I should reply in English, state my model family (Seed 2.0), note the provider (ByteDance Seed / BytePlus), highlight core capabilities and long-context support, and invite the user to continue. Keep it concise and friendly.",
        "role": "assistant"
      }
    }
  ],
  "created": 1770000000,
  "id": "021770000000000seed20abcdef0123456789abcdef0123456789",
  "model": "seed-2-0-pro-260328",
  "service_tier": "default",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 78,
    "prompt_tokens": 53,
    "total_tokens": 131,
    "prompt_tokens_details": {
      "cached_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 60
    }
  }
}
```

---

## DeepSeek / DeepSeek-V4.1-Flash `POST`

_Official Format_

### DeepSeek-V4.1-Flash

DeepSeek-V4.1-Flash is DeepSeek's latest fast model with a 1M context window and up to 384K output. It accepts text and image input and supports both non-thinking and thinking modes. DeepSeek exposes this version as `deepseek-flash`; use `deepseek-v4.1-flash` on Cloudwise.

`POST https://api.cloudwise.ai/api/v1/chat/completions`

### Supported Models

| Cloudwise Model ID | DeepSeek Official Model ID |
| --- | --- |
| `deepseek-v4.1-flash` | `deepseek-flash` |

### Capabilities

| Capability | Details |
| --- | --- |
| `Multimodal input` | Accepts text and images through URL, Base64 data URL, or Files API ID. |
| `Non-thinking` (thinking disabled) | Fast responses for daily conversation and standard tasks. |
| `Thinking` (thinking enabled, default) | Deep reasoning for coding, agent tasks, and multi-step workflows. |

### Vision Limits

| Limit | Value |
| --- | --- |
| Supported image formats | JPEG, PNG, GIF, WebP |
| Request body size | 48 MiB |
| Single inline or URL image | 32 MiB |
| Single Files API image | 64 MiB |
| Images per request | 600 |
| Total image size | 64 MiB inline; 200 MiB with file_id images |
| Image dimensions | 8192 px per side; 4096 px with 15+ images |

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Use the Cloudwise model ID `deepseek-v4.1-flash`. DeepSeek's official API model ID for this version is `deepseek-flash`. |
| messages | array | - | required<br>At least one message. Supported roles are `system`, `user`, `assistant`, and `tool`. |
| messages[].role | string | - | required<br>Message author role: `system`, `user`, `assistant`, or `tool`. |
| messages[].content | string\\|array | - | required<br>Text content, or an array of multimodal content blocks for user and tool messages. |
| messages[].content[].type | string | - | required<br>Content block type: `text`, `image_url`, or `file`. |
| messages[].content[].text | string | - | Required when the content block `type` is `text`. |
| messages[].content[].image_url.url | string | - | Required for an `image_url` block. Accepts a public HTTP(S) URL up to 8192 characters or a Base64 data URL. Supported formats: JPEG, PNG, GIF, and WebP. |
| messages[].content[].image_url.detail | string | auto | Image processing level: `low`, `high`, `original`, or `auto`. `low` downsamples the image to 512x512; the other modes keep the original image. |
| messages[].content[].file_id | string | - | Files API ID used by a `file` block. Mutually exclusive with `file_data`. |
| messages[].content[].file_data | string | - | Base64 image data URL used by a `file` block. Mutually exclusive with `file_id`. |
| messages[].content[].filename | string | - | Optional filename. Valid only when the same `file` block contains `file_data`. |
| thinking.type | string | enabled | Controls thinking mode. Values: `enabled` or `disabled`. |
| reasoning_effort | string | high | Values: `none`, `low`, `high`, or `max`. `none` disables thinking; all other values enable it. |
| max_tokens | integer | - | Range: 1 to 393216 (384K). Defaults to 8K in non-thinking mode, 64K in thinking mode, or 128K when `reasoning_effort=max`. |
| response_format.type | string | text | Output format: `text` or `json_object`. When using JSON mode, also instruct the model to produce JSON in a message. |
| stream | boolean | false | Set `true` to receive Server-Sent Events ending with `data: [DONE]`. |
| stream_options.include_usage | boolean | false | Streaming-only option. When enabled, the final chunk includes token usage. |
| temperature | number | 1.0 | Range: `[0, 2]`. It has no effect in thinking mode. |
| top_p | number | 1.0 | Range: `(0, 1]`. Values below 0.95 are raised to 0.95 in thinking mode; non-thinking mode always uses 1.0. |
| tools | array | - | Optional tool/function definitions for agent workflows. |
| tool_choice | string\\|object | - | Values: `none`, `auto`, `required`, or a specific function object. |
| stop | string\\|array | - | A string or an array of up to 16 sequences where generation should stop. |
| logprobs | boolean | false | Whether to return log probabilities for output tokens. |
| top_logprobs | integer | - | Range: 0 to 20. Requires `logprobs=true`. |
| user_id | string | - | Optional caller-defined ID using `[a-zA-Z0-9_-]`, up to 512 characters. Do not include private user information. |
| frequency_penalty | deprecated | - | No longer supported and has no effect. |
| presence_penalty | deprecated | - | No longer supported and has no effect. |

### Request Example

Text Input

Image Input

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "deepseek-v4.1-flash",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant"
        },
        {
            "role": "user",
            "content": "Briefly explain MOE"
        }
    ],
    "reasoning_effort": "high",
    "stream": true,
    "max_tokens": 4096
}'
```

### Response Example

```json
{
    "id": "chatcmpl-a1b2c3d4e5",
    "object": "chat.completion",
    "created": 1789632000,
    "model": "deepseek-v4.1-flash",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "MOE (Mixture of Experts) uses specialized expert networks and a routing mechanism so that only the most relevant experts process each input.",
                "reasoning_content": "We need to give a concise explanation of the MoE architecture."
            },
            "finish_reason": "stop",
            "logprobs": null
        }
    ],
    "usage": {
        "prompt_tokens": 24,
        "completion_tokens": 32,
        "total_tokens": 56,
        "prompt_tokens_details": {
            "cached_tokens": 0
        },
        "completion_tokens_details": {
            "reasoning_tokens": 12
        }
    }
}
```

**Request Example (Text Input)**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "deepseek-v4.1-flash",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant"
        },
        {
            "role": "user",
            "content": "Briefly explain MOE"
        }
    ],
    "reasoning_effort": "high",
    "stream": true,
    "max_tokens": 4096
}'
```

**Request Example (Image Input)**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "deepseek-v4.1-flash",
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "What is in this image?"
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://example.com/image.jpg",
                        "detail": "auto"
                    }
                }
            ]
        }
    ],
    "reasoning_effort": "high",
    "max_tokens": 4096
}'
```

**Response Example**

```json
{
    "id": "chatcmpl-a1b2c3d4e5",
    "object": "chat.completion",
    "created": 1789632000,
    "model": "deepseek-v4.1-flash",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "MOE (Mixture of Experts) uses specialized expert networks and a routing mechanism so that only the most relevant experts process each input.",
                "reasoning_content": "We need to give a concise explanation of the MoE architecture."
            },
            "finish_reason": "stop",
            "logprobs": null
        }
    ],
    "usage": {
        "prompt_tokens": 24,
        "completion_tokens": 32,
        "total_tokens": 56,
        "prompt_tokens_details": {
            "cached_tokens": 0
        },
        "completion_tokens_details": {
            "reasoning_tokens": 12
        }
    }
}
```

---

## DeepSeek / DeepSeek-V4-Flash `POST`

_Official Format_

### DeepSeek-V4-Flash

DeepSeek-V4-Flashis DeepSeek's latest generation model with 1M context window and up to 384K output. It supports both non-thinking and thinking modes through the `thinking` parameter in Chat Completions API.

`POST https://api.cloudwise.ai/api/v1/chat/completions`

### Supported Models

| Model Name |
| --- |
| `deepseek-v4-flash-0731` |
| `deepseek-v4-flash` |

### Model Modes

| Mode | Description |
| --- | --- |
| `Non-thinking` (thinking disabled) | Fast responses for daily conversation and standard tasks. |
| `Thinking` (thinking enabled, default) | Deep reasoning mode for complex problems, agent tasks, and multi-step workflows. |

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Use `deepseek-v4-flash`. |
| messages | array | - | required<br>Conversation array containing `role` and `content`. |
| thinking | object | {"type":"enabled"} | Controls thinking mode. Set `{"type": "enabled"}` for thinking mode (default), or `{"type": "disabled"}` for non-thinking mode. |
| reasoning_effort | string | high | Controls reasoning intensity when thinking is enabled. Values: `high` (default), `max` (for complex agent tasks like Claude Code, OpenCode). |
| stream | boolean | false | Set `true` to enable SSE streaming output ending with `data: [DONE]`. |
| max_tokens | integer | - | Maximum output tokens. Supports up to 384K output within 1M context window. |
| temperature | number | 1.0 | Sampling temperature range: `[0, 2]`. |
| top_p | number | 1.0 | Nucleus sampling parameter, range `[0, 1]`. Use with care alongside `temperature`. |
| tools | array | - | Optional tool/function definitions for agent workflows. |
| tool_choice | string\\|object | - | Controls tool calling behavior. Values: `none`, `auto`, or specific tool object. |
| response_format | object | - | Output format constraint. Use `{"type": "json_object"}` for JSON output. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "deepseek-v4-flash",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant"
        },
        {
            "role": "user",
            "content": "Briefly explain MOE"
        }
    ],
    "thinking": {
        "type": "enabled"
    },
    "reasoning_effort": "high",
    "stream": true,
    "max_tokens": 4096
}'
```

### Response Example

```json
{
    "id": "chatcmpl-a1b2c3d4e5",
    "object": "chat.completion",
    "created": 1779321600,
    "model": "deepseek-v4-flash",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "MOE (Mixture of Experts) is a neural network architecture that uses multiple specialized sub-networks (experts) with a gating mechanism to route inputs to the most relevant experts. This allows scaling model capacity without proportionally increasing computation, as only a subset of experts are activated for each input."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 24,
        "completion_tokens": 58,
        "total_tokens": 82
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "deepseek-v4-flash",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant"
        },
        {
            "role": "user",
            "content": "Briefly explain MOE"
        }
    ],
    "thinking": {
        "type": "enabled"
    },
    "reasoning_effort": "high",
    "stream": true,
    "max_tokens": 4096
}'
```

**Response Example**

```json
{
    "id": "chatcmpl-a1b2c3d4e5",
    "object": "chat.completion",
    "created": 1779321600,
    "model": "deepseek-v4-flash",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "MOE (Mixture of Experts) is a neural network architecture that uses multiple specialized sub-networks (experts) with a gating mechanism to route inputs to the most relevant experts. This allows scaling model capacity without proportionally increasing computation, as only a subset of experts are activated for each input."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 24,
        "completion_tokens": 58,
        "total_tokens": 82
    }
}
```

---

## DeepSeek / DeepSeek-V4-Pro `POST`

_Official Format_

### DeepSeek-V4-Pro

DeepSeek-V4-Prois DeepSeek's latest generation model with 1M context window and up to 384K output. It supports both non-thinking and thinking modes through the `thinking` parameter in Chat Completions API.

`POST https://api.cloudwise.ai/api/v1/chat/completions`

### Supported Models

| Model Name |
| --- |
| `deepseek-v4-pro-0813` |
| `deepseek-v4-pro` |

### Model Modes

| Mode | Description |
| --- | --- |
| `Non-thinking` (thinking disabled) | Fast responses for daily conversation and standard tasks. |
| `Thinking` (thinking enabled, default) | Deep reasoning mode for complex problems, agent tasks, and multi-step workflows. |

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Use `deepseek-v4-pro`. |
| messages | array | - | required<br>Conversation array containing `role` and `content`. |
| thinking | object | {"type":"enabled"} | Controls thinking mode. Set `{"type": "enabled"}` for thinking mode (default), or `{"type": "disabled"}` for non-thinking mode. |
| reasoning_effort | string | high | Controls reasoning intensity when thinking is enabled. Values: `high` (default), `max` (for complex agent tasks like Claude Code, OpenCode). |
| stream | boolean | false | Set `true` to enable SSE streaming output ending with `data: [DONE]`. |
| max_tokens | integer | - | Maximum output tokens. Supports up to 384K output within 1M context window. |
| temperature | number | 1.0 | Sampling temperature range: `[0, 2]`. |
| top_p | number | 1.0 | Nucleus sampling parameter, range `[0, 1]`. Use with care alongside `temperature`. |
| tools | array | - | Optional tool/function definitions for agent workflows. |
| tool_choice | string\\|object | - | Controls tool calling behavior. Values: `none`, `auto`, or specific tool object. |
| response_format | object | - | Output format constraint. Use `{"type": "json_object"}` for JSON output. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "deepseek-v4-pro",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant"
        },
        {
            "role": "user",
            "content": "Briefly explain MOE"
        }
    ],
    "thinking": {
        "type": "enabled"
    },
    "reasoning_effort": "high",
    "stream": true,
    "max_tokens": 4096
}'
```

### Response Example

```json
{
    "id": "chatcmpl-a1b2c3d4e5",
    "object": "chat.completion",
    "created": 1779321600,
    "model": "deepseek-v4-pro",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "MOE (Mixture of Experts) is a neural network architecture that uses multiple specialized sub-networks (experts) with a gating mechanism to route inputs to the most relevant experts. This allows scaling model capacity without proportionally increasing computation, as only a subset of experts are activated for each input."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 24,
        "completion_tokens": 58,
        "total_tokens": 82
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "deepseek-v4-pro",
    "messages": [
        {
            "role": "system",
            "content": "You are a helpful assistant"
        },
        {
            "role": "user",
            "content": "Briefly explain MOE"
        }
    ],
    "thinking": {
        "type": "enabled"
    },
    "reasoning_effort": "high",
    "stream": true,
    "max_tokens": 4096
}'
```

**Response Example**

```json
{
    "id": "chatcmpl-a1b2c3d4e5",
    "object": "chat.completion",
    "created": 1779321600,
    "model": "deepseek-v4-pro",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "MOE (Mixture of Experts) is a neural network architecture that uses multiple specialized sub-networks (experts) with a gating mechanism to route inputs to the most relevant experts. This allows scaling model capacity without proportionally increasing computation, as only a subset of experts are activated for each input."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 24,
        "completion_tokens": 58,
        "total_tokens": 82
    }
}
```

---

## DeepSeek / Deepseek-v3.2 `POST`

_Official Format_

### Deepseek-v3.2

DeepSeek-V3.2 is a reasoning-first model for agent workflows. It supports both non-thinking and thinking modes through different model IDs in Chat Completions API.

`POST https://api.cloudwise.ai/api/v1/chat/completions`

### Supported Modes

| Model ID | Description |
| --- | --- |
| `deepseek-chat` | Non-thinking mode for daily conversation and fast response. |
| `deepseek-reasoner` | Thinking mode with stronger multi-step reasoning and agent task performance. |

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Use `deepseek-chat` or `deepseek-reasoner`. |
| messages | array | - | required<br>Conversation array containing `role` and `content`. |
| stream | boolean | false | Set `true` to enable SSE streaming output ending with `data: [DONE]`. |
| max_tokens | integer | - | Maximum output tokens. DeepSeek-V3.2 supports up to 128K context window. |
| temperature | number | 1.0 | Sampling temperature range: `[0, 2]`. |
| top_p | number | 1.0 | Nucleus sampling parameter. Use with care alongside `temperature`. |
| tools | array | - | Optional tool/function definitions for agent workflows. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "deepseek-v3.2",
    "messages": [
        {
            "role": "user",
            "content": "Briefly explain MOE"
        }
    ],
    "stream": true
}'
```

### Response Example

```json
{
    "id": "as-au3310mgz1",
    "object": "chat.completion.chunk",
    "created": 1775121223,
    "model": "deepseek-v3.2",
    "choices": [
        {
            "index": 0,
            "delta": {
                "content": "Sure",
                "role": "assistant"
            },
            "flag": 0
        }
    ]
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "deepseek-v3.2",
    "messages": [
        {
            "role": "user",
            "content": "Briefly explain MOE"
        }
    ],
    "stream": true
}'
```

**Response Example**

```json
{
    "id": "as-au3310mgz1",
    "object": "chat.completion.chunk",
    "created": 1775121223,
    "model": "deepseek-v3.2",
    "choices": [
        {
            "index": 0,
            "delta": {
                "content": "Sure",
                "role": "assistant"
            },
            "flag": 0
        }
    ]
}
```

---

## FlashVSR / FlashVSR / Create a Task `POST`

_Official Format_

### Create a Task

FlashVSR is a fast, high-quality video upscaler that boosts resolution and restores clarity for low-resolution or blurry footage. Ready-to-use REST inference API, best performance, no coldstarts, affordable pricing.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video-edit/generation`

### Overview

This endpoint provides create a task functionality using the FlashVSR model. Generate video content based on text prompt.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The model to use, e.g., `flashvsr`. |
| video | string | - | required<br>The video to upscale. |
| target_resolution | string | 1080p | Target resolution to upscale to. Valid values: `720p`, `1080p`, `2k`, `4k`. |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/aiproducts/video-edit/generation' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer ak_********' \
--data '{
  "model": "flashvsr",
  "target_resolution": "1080p",
  "video": "{video_url}"
}'
```

### Response

The response contains the generated video task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| code | integer | HTTP status code (e.g., 200 for success). |
| message | string | Status message (e.g., "success"). |
| data | object | The prediction data object containing all details. |
| data.taskId | string | Unique identifier for the prediction (Task ID). |
| data.taskStatus | string | Status of the task: PROCESSING. |
| success | boolean | Whether the request was successful. |

#### Example Response

```json
{
  "code": "10000",
  "data": {
    "taskId": "{TASK_ID}",
    "taskStatus": "PROCESSING"
  },
  "success": true,
  "message": "Task created successfully, please wait a while for processing"
}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/aiproducts/video-edit/generation' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer ak_********' \
--data '{
  "model": "flashvsr",
  "target_resolution": "1080p",
  "video": "{video_url}"
}'
```

**Response Example**

```json
{
  "code": "10000",
  "data": {
    "taskId": "{TASK_ID}",
    "taskStatus": "PROCESSING"
  },
  "success": true,
  "message": "Task created successfully, please wait a while for processing"
}
```

---

## FlashVSR / FlashVSR / Query a Task `POST`

_Official Format_

### Query a Task

FlashVSR is a fast, high-quality video upscaler that boosts resolution and restores clarity for low-resolution or blurry footage. Ready-to-use REST inference API, best performance, no coldstarts, affordable pricing.

`POST https://api.cloudwise.ai/api/v1/aiproducts/video-edit/result`

### Overview

This endpoint provides query a task functionality using the FlashVSR model. Generate video content based on text prompt.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The model to use, e.g., `flashvsr`. |
| taskId | string | - | required<br>Task ID returned by the create task request. |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/aiproducts/video-edit/result' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer ak_********' \
--data '{
  "model": "flashvsr",
  "taskId": "{TASK_ID}"
}'
```

### Response

The response contains task status and results.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| code | integer | HTTP status code (e.g., 200 for success). |
| message | string | Status message (e.g., "success"). |
| data | object | The prediction data object containing all details. |
| data.costs | number | The cost of the task in USD. |
| data.unit | string | The currency unit (e.g., "USD"). |
| data.videoUrl | string | The URL of the output video. |
| success | boolean | Whether the request was successful. |
| taskStatus | string | Status of the task: COMPLETED. |

#### Example Response

```json
{
  "code": "10000",
  "data": {
    "costs": 0.2179,
    "unit": "USD",
    "videoUrl": "{video_url}"
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/aiproducts/video-edit/result' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer ak_********' \
--data '{
  "model": "flashvsr",
  "taskId": "{TASK_ID}"
}'
```

**Response Example**

```json
{
  "code": "10000",
  "data": {
    "costs": 0.2179,
    "unit": "USD",
    "videoUrl": "{video_url}"
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

---

## Google / Gemini / Gemini 4 Argon `POST`

_Official Format_

### Gemini 4 Argon

Google flagship multimodal reasoning model for software engineering, mathematics, science and autonomous agents.

`POST https://api.cloudwise.ai/api/v1beta/models/gemini-4-argon:generateContent`

### Overview

Use the native Gemini generateContent format for synchronous text output. Argon accepts text, images, video, audio and PDF; it does not generate images or audio.

Input, thinking, function calls and final output share a unified 1,048,576-token context window. This is not a separate 1M-token input allowance plus a 1M-token output allowance.

### Supported Models

| Model | Status | Input | Output |
| --- | --- | --- | --- |
| `gemini-4-argon` | Stable | Text, images, video, audio, PDF | Text |

### Authentication

Send your MaaS API key in `Authorization: Bearer $YOUR_API_KEY` and set `Content-Type: application/json`.

### Request Body

The fields below use the Gemini native format. OpenAI-compatible requests use `/api/v1/chat/completions` with `model` and `messages` instead of `contents`.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| contents | Array<Object> | Required | Conversation history and the current prompt. Input supports text, images, video, audio and PDF; output is text only. |
| contents[].role | String | "user" | Use user for prompts and model for previous model responses. End the history with a user turn; prefilled model turns are not supported. |
| contents[].parts | Array<Object> | Required | Message parts containing text, inline media, file references or function calls and responses. |
| contents[].parts[].text | String | Unset | Prompt text or text from a previous conversation turn. |
| contents[].parts[].inlineData | Object | Unset | Inline media input. Set mimeType to the media MIME type and data to Base64-encoded bytes without a data URL prefix. |
| contents[].parts[].fileData | Object | Unset | Media reference with fileUri and mimeType. The referenced file must be accessible to the upstream provider. |
| contents[].parts[].thoughtSignature | String | Unset | Opaque signature from a previous response. Preserve signature-bearing parts unchanged when continuing a conversation or tool loop. |
| systemInstruction | Object | Unset | System instructions as a Content object containing text parts. |
| safetySettings | Array<Object> | Provider defaults | Safety settings with category and threshold. Specify no more than one setting per category. |
| tools | Array<Object> | [] | Google supports function calling, code execution, Search, Maps, URL context, file search and Computer Use (preview). Tool availability through MaaS depends on the upstream channel; grounding can incur additional charges. |
| toolConfig | Object | Unset | Configuration for declared tools, including function-calling behavior. Function responses must match the preceding function calls by id, name and order. |
| generationConfig | Object | {} | Optional output and reasoning configuration. Do not copy unsupported Gemini 2.5 or 3.x controls into Argon requests. |
| generationConfig.maxOutputTokens | Integer | Provider default | Combined budget for thinking and generated output. Google documents a 32,768-token cap per non-streaming generateContent REST request and 65,536 per stream. A 1M-token output requires long decode, not just a larger value here; MaaS long-decode support is unverified. |
| generationConfig.stopSequences | Array<String> | [] | Sequences that stop generation when encountered. |
| generationConfig.responseMimeType | String | "text/plain" | Output MIME type. Use application/json for structured JSON output. |
| generationConfig.responseSchema | Object | Unset | Supported subset of an OpenAPI schema for structured output. Requires responseMimeType: application/json. Do not set together with responseJsonSchema. |
| generationConfig.responseJsonSchema | Object | Unset | Supported subset of JSON Schema, as an alternative to responseSchema. Requires responseMimeType: application/json. |
| generationConfig.thinkingConfig.thinkingLevel | String | "MEDIUM" | Supported: LOW, MEDIUM, HIGH. Unlike Gemini 2.5, use a level rather than thinkingBudget. MINIMAL is not supported and returns HTTP 400. |
| generationConfig.thinkingConfig.includeThoughts | Boolean | false | Return available thought summaries, not raw reasoning. Thinking tokens are charged even when summaries are omitted. |
| continuationToken | String | Unset | Google long-decode continuation token, supplied at the top level with the original request. Omit for standard requests. MaaS continuation support has not been verified; see Long Decode below. |

### Unsupported and Ignored Parameters

| Parameter | Behavior | Description |
| --- | --- | --- |
| generationConfig.thinkingConfig.thinkingBudget | HTTP 400 | Legacy token-based thinking budgets are not supported. Use thinkingLevel instead. |
| generationConfig.temperature / topP / topK | Ignored | Custom sampling values have no effect on Argon. Omit them; control reasoning with thinkingLevel. |
| generationConfig.candidateCount / frequencyPenalty / presencePenalty | Not supported | Google documents HTTP 400 for these controls. Remove them from migrated requests. |
| cachedContent | Not supported | Explicit context caching is unavailable. Implicit caching is applied automatically to eligible shared prompt prefixes. |

### Request Example

Gemini

OpenAI

```bash
curl --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-4-argon:generateContent' \
--header "Authorization: Bearer $YOUR_API_KEY" \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "What is 2 + 2?"
        }
      ]
    }
  ]
}'
```

### Long Decode

Google supports output beyond a single request up to the remaining unified context budget. GenerateContent uses client-side continuation: `candidates[].finishReason` can be `CONTINUATION`, with `candidates[].continuationToken`. Resume using the original request plus the latest top-level `continuationToken`, without appending partial output to the prompt.

The Google Interactions API offers a separate background workflow using `background: true` and `generation_config.max_output_tokens` greater than 65,536. These snake_case fields do not belong in a generateContent request.

Neither long-decode workflow has been verified through the MaaS gateway. The request example above covers standard synchronous generation only. Do not assume raising `maxOutputTokens` enables 1M-token output, or that a Google SDK follows continuation automatically through MaaS.

### Response Fields

The fields below describe Gemini native responses. OpenAI-compatible responses return the answer in `choices[].message.content` and token counts in `usage`.

| Field | Type | Description |
| --- | --- | --- |
| candidates[].content.parts | Array<Object> | Generated text, optional thought summaries and tool-call parts. A part with thought: true is a thought summary rather than the final answer. |
| candidates[].content.parts[].thoughtSignature | String | Opaque signature to preserve with the original part in subsequent turns. |
| candidates[].finishReason | String | STOP for a completed answer, MAX_TOKENS when the output budget is exhausted, or a safety-related stop reason. Google long decode also uses CONTINUATION; this workflow is unverified through MaaS. |
| candidates[].continuationToken | String | Google long-decode token for resuming the original request. A thinking-only hop may have no answer text. MaaS support is unverified. |
| candidates[].groundingMetadata | Object | Grounding sources and attribution when a supported grounding tool is used. |
| promptFeedback | Object | Prompt safety feedback. A blocked prompt can return no candidates. |
| usageMetadata | Object | Token usage: promptTokenCount, cachedContentTokenCount when applicable, candidatesTokenCount, thoughtsTokenCount and totalTokenCount. Thinking is billed at the output rate. |
| modelVersion / responseId | String | Model version and response identifier. |

### Response Example

Illustrative response; token counts and generated content vary by request.

Gemini

OpenAI

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "text": "4."
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 10,
    "candidatesTokenCount": 2,
    "thoughtsTokenCount": 20,
    "totalTokenCount": 32
  },
  "modelVersion": "gemini-4-argon",
  "responseId": "RESPONSE_ID"
}
```

### References

- [Google model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon)
- [GenerateContent API reference](https://ai.google.dev/api/generate-content)
- [GenerateContent long decode](https://ai.google.dev/gemini-api/docs/generate-content/long-decode)
- [Interactions long decode](https://ai.google.dev/gemini-api/docs/long-decode)
- [Google Cloud parameter and migration guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-4-argon)
- [Official USD pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-4-argon)

**Request Example (Gemini)**

```bash
curl --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-4-argon:generateContent' \
--header "Authorization: Bearer $YOUR_API_KEY" \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "What is 2 + 2?"
        }
      ]
    }
  ]
}'
```

**Request Example (OpenAI)**

```bash
curl --request POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
--header "Authorization: Bearer $YOUR_API_KEY" \
--header 'Content-Type: application/json' \
--data-raw '{
  "model": "gemini-4-argon",
  "messages": [
    {
      "role": "user",
      "content": "What is 2 + 2?"
    }
  ]
}'
```

**Response Example (Gemini)**

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "text": "4."
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 10,
    "candidatesTokenCount": 2,
    "thoughtsTokenCount": 20,
    "totalTokenCount": 32
  },
  "modelVersion": "gemini-4-argon",
  "responseId": "RESPONSE_ID"
}
```

**Response Example (OpenAI)**

```json
{
  "id": "CHAT_COMPLETION_ID",
  "object": "chat.completion",
  "model": "gemini-4-argon",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "4."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 22,
    "total_tokens": 32
  }
}
```

---

## Google / Gemini / Gemini 3.8 Flash `POST`

_Official Format_

### Gemini 3.8 Flash

Use one Gemini-compatible API structure across the supported Gemini text models. Select the model by replacing the {model} path parameter.

`POST https://api.cloudwise.ai/api/v1beta/models/{model}:generateContent`

### Overview

This endpoint follows Google's native `generateContent` request and response structure. The MaaS endpoint changes the host while preserving the Gemini request schema. Model-specific differences are documented below.

### Supported Models

All models below support the native Gemini curl shown on this page. They also support the MaaS OpenAI-compatible Chat Completions format; use the same model ID in the `model` field.

| Model | Status | OpenAI curl | Model-specific notes |
| --- | --- | --- | --- |
| `gemini-3.8-flash` | Stable | Supported | Latest Flash model with agentic video processing. Supports low, medium, and high thinking levels; minimal and legacy sampling controls are not supported. |
| `gemini-3.7-flash` | Stable | Supported | Multimodal reasoning model with agentic video processing. Supports low, medium, and high thinking levels; minimal is not supported. |
| `gemini-3.6-flash` | Stable | Supported | Fast agentic multimodal model. Supports minimal, low, medium, and high thinking levels and agentic video processing. |
| `gemini-3.5-flash-lite` | Stable | Supported | Low-cost, high-throughput model. Supports minimal, low, medium, and high thinking levels and agentic video processing. |
| `gemini-3.1-flash-lite` | Stable | Supported | Low-latency multimodal model. Supports minimal, low, medium, and high thinking levels; Computer Use is not supported. |
| `gemini-2.5-flash` | Stable | Supported | Balanced speed and quality. Uses thinkingBudget; thinking can be disabled with 0. |
| `gemini-2.5-flash-lite` | Stable | Supported | Low-latency, high-throughput model. Uses thinkingBudget; thinking can be disabled with 0. |
| `gemini-2.5-pro` | Stable | Supported | Advanced reasoning model. Uses thinkingBudget; thinking cannot be disabled. |
| `gemini-3-flash-preview` | Preview | Supported | Gemini 3 Flash preview. Uses thinkingLevel; keep temperature at the recommended default of 1.0. |
| `gemini-3.1-pro-preview` | Preview | Supported | Advanced Gemini 3.1 reasoning model. Supports low, medium, and high thinking levels; minimal is not supported. |
| `gemini-3.5-flash` | Stable | Supported | Fast multimodal reasoning model. Supports minimal, low, medium, and high thinking levels. |

### Authentication

This endpoint supports three compatible authentication header formats for Gemini requests.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer $YOUR_API_KEY" | compatible<br>**OAuth2 standard format**: `Authorization: Bearer YOUR_API_KEY` |
| x-goog-api-key | string | "YOUR_API_KEY" | compatible<br>**Google official format**: `x-goog-api-key: YOUR_API_KEY` |
| x-api-key | string | "YOUR_API_KEY" | compatible<br>**Generic API format**: `x-api-key: YOUR_API_KEY` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| contents | array | - | required<br>An array of Content objects. Each Content object contains:<br><br>- `parts` (array): An array of Part objects. Each Part object contains:<br>- `text` (string): The text content of the part. |
| systemInstruction | object | - | Optional<br>System-level instructions applied to the request. Available to all supported models. |
| safetySettings | array | - | Optional<br>An array of SafetySetting objects. Each SafetySetting object contains:<br><br>- `category` (string): The category of the safety setting.<br>- `threshold` (string): The threshold for the safety setting. |
| generationConfig | object | - | Optional<br>Generation configuration. Individual fields have model-specific support:<br><br>- `temperature` (number): Controls randomness in the output. For Gemini 3.x models other than `gemini-3.8-flash`, Google recommends keeping the default value of `1.0`. Do not send `temperature`, `topK`, or `topP` to `gemini-3.8-flash`; these sampling controls are deprecated for that model.<br>- `topK` (integer) and `topP` (number): Sampling controls supported by the listed models except `gemini-3.8-flash`.<br>- `maxOutputTokens` (integer): Maximum number of tokens to generate. Available to all supported models.<br>- `stopSequences` (array): Sequences that stop generation. Available to all supported models.<br>- `candidateCount` (integer): Gemini 2.5 models only. Remove it for every Gemini 3.x model because Gemini 3 and later do not support it.<br>- `responseMimeType`, `responseSchema`, and `responseJsonSchema`: Structured-output controls available to all supported models. |
| generationConfig.thinkingConfig | object | - | Optional<br>Model-specific thinking control:<br><br>- `thinkingBudget` (integer): Use with `gemini-2.5-flash`, `gemini-2.5-flash-lite`, and `gemini-2.5-pro`. A value of `0` disables thinking on the Flash variants, but not on Pro.<br>- `thinkingLevel` (string): Use with Gemini 3.x models. `gemini-3-flash-preview`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, and `gemini-3.6-flash` support `minimal`, `low`, `medium`, and `high`. `gemini-3.1-pro-preview`, `gemini-3.7-flash`, and `gemini-3.8-flash` support `low`, `medium`, and `high`; sending `minimal` returns an error.<br>- `includeThoughts` (boolean): Requests thought summaries when available. Supported by the thinking-capable models in this table. |
| tools | array | - | Optional<br>Optional tools such as function calling, Google Search, Google Maps, URL context, file search, or code execution. All models in the Supported Models table support these tools, although Google lists file search for `gemini-3.1-pro-preview` as AI Studio only. Computer Use (Preview) is supported by `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.7-flash`, and `gemini-3.8-flash`; it is not supported by `gemini-3.1-flash-lite`. Combining Google Search and Google Maps in one request requires Gemini 3.5 Flash or a later model. |
| contents[].parts[].mediaResolution | object | - | Optional<br>Gemini 3.x models in this table only. Controls tokenization for image, PDF, and video inputs using the `level` field. Supported levels are `MEDIA_RESOLUTION_UNSPECIFIED`, `MEDIA_RESOLUTION_LOW`, `MEDIA_RESOLUTION_MEDIUM`, `MEDIA_RESOLUTION_HIGH`, and `MEDIA_RESOLUTION_ULTRA_HIGH`. `ULTRA_HIGH` is available only for per-item image input, not video or PDF. |
| contents[].parts[].mediaProcessing | string | - | Optional<br>Video input only. `STATIC` is the default and works with every supported model. `AGENTIC` enables model-driven video navigation and is supported only by `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.7-flash`, and `gemini-3.8-flash`. |
| cachedContent | string | - | Optional<br>Name of cached content to use as request context, in the form `cachedContents/{cachedContent}`. Context caching is supported by all models in the Supported Models table. |
| serviceTier | string | - | Optional<br>Request execution tier: `standard`, `flex`, or `priority`. All models in the Supported Models table support Flex and Priority inference; omitting this field uses the standard tier. |

### Request Example

#### Gemini native format

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3.8-flash:generateContent' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "contents": [{
      "parts":[{"text": "Write a story about a magic backpack."}]
      }]
     }'
```

#### OpenAI-compatible format

All models in the Supported Models table can also use this compatibility format. Replace the `model` value as needed. OpenAI parameter names are translated to their Gemini equivalents by the MaaS compatibility layer.

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "model": "gemini-3.8-flash",
  "messages": [{"role": "user", "content": "Write a story about a magic backpack."}],
  "stream": false
}'
```

### Response

The response contains the generated text and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| candidates | array | An array of Candidate objects. Each Candidate object contains:<br><br>- `content` (object): The content generated by the model. Contains:<br>- `role`(string): The role of the message author (e.g., "model").<br>- `parts` (array): An array of Part objects. Each Part object contains:<br>- `text` (string): The text content generated by the model.<br>- `finishReason`(string): The reason the model stopped generating tokens (e.g., "STOP").<br>- `avgLogprobs` (number): Average log probabilities for the candidate. |
| usageMetadata | object | Usage statistics for the request. Contains:<br><br>- `promptTokenCount` (integer): Number of tokens in the prompt.<br>- `candidatesTokenCount` (integer): Number of tokens in the generated response.<br>- `totalTokenCount` (integer): Total number of tokens used.<br>- `trafficType`(string): The type of traffic (e.g., "ON_DEMAND").<br>- `promptTokensDetails` (array): Details about prompt tokens by modality.<br>- `candidatesTokensDetails` (array): Details about candidate tokens by modality.<br>- `thoughtsTokenCount` (integer): Number of tokens used for reasoning/thinking. |
| modelVersion | string | The version of the model used to generate the response. |
| createTime | string | The timestamp when the response was created (ISO 8601 format). |
| responseId | string | Unique identifier for this response. |

#### Example Response

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "text": "Leo wasn't inherently disorganized, but his brain was like a bustling marketplace: always full of exciting ideas, loud chatter, and often, a forgotten grocery list. His mornings were a whirlwind of misplaced socks, half-eaten toast, and a frantic search for the history textbook he *swore* he'd left on his desk.\n\nOne drizzly Saturday, Leo found himself sheltering from a sudden downpour in front of a dusty antique shop he'd never noticed before. A whimsical sign, \"Curio & Conundrum,\" swung gently above the door. Intrigued, he stepped inside.\n\nThe shop was a labyrinth of forgotten treasures: grandfather clocks that ticked with a weary sigh, porcelain dolls with unsettlingly bright eyes, and shelves crammed with books that smelled of forgotten histories. In a dimly lit corner, nestled between an ancient globe and a stack of yellowed maps, sat a backpack.\n\nIt wasn't flashy. Made of worn, supple leather, it had a reassuringly solid feel and a deep, forest-green color. A single, intricately carved silver clasp held the main flap shut. There was something about it – a faint, almost imperceptible hum, like a distant memory.\n\n\"That one's got a story to tell,\" a raspy voice startled Leo. An old man with a long, white beard and spectacles perched on his nose emerged from behind a towering cabinet. \"Belonged to a great wanderer, they say. Seen a thing or two, that bag.\"\n\nLeo shrugged. \"It looks... sturdy.\" He picked it up. It felt surprisingly light. \"How much?\"\n\n\"For a young man with stars in his eyes and a head full of clouds,\" the old man chuckled, \"a few crumpled dollars will do. But know this, lad: it gives you what you *truly* need, not always what you think you want. Be mindful of what you ask for.\"\n\nBack home, Leo admired his new-old backpack. He tried to organize his chaotic school supplies into it. Pens, notebooks, his tattered copy of \"The Hobbit.\" The backpack swallowed them all with ease, still feeling impossibly light.\n\nThe next morning, the usual chaos ensued. \"My science project!\" Leo wailed, realizing he'd left his carefully constructed miniature volcano at home. He was already halfway to school. A wave of despair washed over him. \"Oh, if only I had it now!\" he mumbled, clutching the green backpack strap.\n\nHe arrived at school, defeated. As he rummaged for his lunch money, his fingers brushed against something stiff. He pulled it out. It was his miniature volcano, perfectly intact, sitting comfortably at the bottom of the backpack. His jaw dropped. He must have packed it without remembering! But no, he distinctly remembered leaving it on the kitchen counter.\n\nThat afternoon, during art class, Leo realized he'd forgotten his favorite shade of cerulean blue watercolor. \"I really need that blue,\" he thought, exasperated. He dipped his hand into the backpack's main compartment. His fingers closed around a familiar tube. Cerulean blue.\n\nOver the next few weeks, the magic backpack became his silent, dependable companion. Forgot his homework? A neatly stapled copy would be waiting. Needed a specific wrench for his bike? One would appear, sometimes a brand-new shiny one, sometimes an old, oil-stained antique. Once, when he wished for a snack, a freshly baked apple pie – still warm! – appeared, leading to a very popular lunch break.\n\nHe tried to test its limits. \"I wish I had a million dollars!\" he thought, plunging his hand in. He pulled out a small, leather-bound book titled \"The History of Global Economics.\" Disappointed, he tried again, \"I wish for a new video game console!\" This time, a worn copy of \"Basic Coding for Beginners\" materialized. The old man's words echoed in his mind: \"what you *truly* need, not always what you think you want.\" The backpack wasn't a wish-granting machine; it was a guide, a silent mentor, pushing him towards self-sufficiency and knowledge.\n\nOne Saturday, Leo was on a camping trip with his scout troop. A sudden, fierce thunderstorm rolled in, tearing through their flimsy tents. Rain lashed down, and the temperature plummeted. Everyone was soaked and shivering. Their carefully packed emergency kit was, of course, soaking wet.\n\n\"We need warmth, something dry,\" the scout leader stammered, pulling out his damp phone, which had no signal. \"And some light!\"\n\nLeo looked at his magic backpack, now sitting innocently by his feet. He closed his eyes. \"We need warmth, light, and something to fix this mess,\" he thought, a desperate plea.\n\nHe opened the main flap. Inside, nestled amongst his usual items, were:\n*   A thick, wool blanket, impossibly soft and dry.\n*   A sturdy, oil-burning lantern, complete with a small bottle of fuel.\n*   A waterproof tarp, neatly folded, large enough to cover all the ruined tents.\n*   And, most surprisingly, a small, laminated card with instructions on how to build a quick, wind-resistant shelter using natural materials.\n\nWorking together, guided by the card and aided by the backpack's provisions, the troop quickly rigged a sturdy, dry shelter. The lantern cast a warm glow, and the blanket was passed around. Leo watched his friends, no longer shivering, their spirits lifted.\n\nAs the storm raged outside their makeshift haven, Leo understood. The backpack hadn't given him a magical escape from the problem. It had given him the *tools* and the *knowledge* to overcome it himself. It helped him be resourceful, brave, and ultimately, a better leader.\n\nFrom that day on, Leo's mornings were still full of ideas, but less chaos. He still used the magic backpack, but with a new respect. He no longer just wished for things; he thoughtfully considered what he genuinely needed, and often, what others around him needed too. The forest-green backpack remained a silent, loyal companion, a subtle hum of magic in his everyday life, reminding him that the greatest treasures are often found not in what you get, but in what you discover within yourself."
          }
        ]
      },
      "finishReason": "STOP",
      "avgLogprobs": -1.2276564842857483
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 8,
    "candidatesTokenCount": 1313,
    "totalTokenCount": 2945,
    "trafficType": "ON_DEMAND",
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 8
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 1313
      }
    ],
    "thoughtsTokenCount": 1624
  },
  "modelVersion": "gemini-3.8-flash",
  "createTime": "2025-11-28T09:21:04.743684Z",
  "responseId": "gGkpaYSyLcqE998P26jViQY"
}
```

**Request Example (Gemini)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3.8-flash:generateContent' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "contents": [{
      "parts":[{"text": "Write a story about a magic backpack."}]
      }]
     }'
```

**Request Example (OpenAI)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "model": "gemini-3.8-flash",
  "messages": [{"role": "user", "content": "Write a story about a magic backpack."}],
  "stream": false
}'
```

**Response Example**

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "text": "Leo wasn't inherently disorganized, but his brain was like a bustling marketplace: always full of exciting ideas, loud chatter, and often, a forgotten grocery list. His mornings were a whirlwind of misplaced socks, half-eaten toast, and a frantic search for the history textbook he *swore* he'd left on his desk.\n\nOne drizzly Saturday, Leo found himself sheltering from a sudden downpour in front of a dusty antique shop he'd never noticed before. A whimsical sign, \"Curio & Conundrum,\" swung gently above the door. Intrigued, he stepped inside.\n\nThe shop was a labyrinth of forgotten treasures: grandfather clocks that ticked with a weary sigh, porcelain dolls with unsettlingly bright eyes, and shelves crammed with books that smelled of forgotten histories. In a dimly lit corner, nestled between an ancient globe and a stack of yellowed maps, sat a backpack.\n\nIt wasn't flashy. Made of worn, supple leather, it had a reassuringly solid feel and a deep, forest-green color. A single, intricately carved silver clasp held the main flap shut. There was something about it – a faint, almost imperceptible hum, like a distant memory.\n\n\"That one's got a story to tell,\" a raspy voice startled Leo. An old man with a long, white beard and spectacles perched on his nose emerged from behind a towering cabinet. \"Belonged to a great wanderer, they say. Seen a thing or two, that bag.\"\n\nLeo shrugged. \"It looks... sturdy.\" He picked it up. It felt surprisingly light. \"How much?\"\n\n\"For a young man with stars in his eyes and a head full of clouds,\" the old man chuckled, \"a few crumpled dollars will do. But know this, lad: it gives you what you *truly* need, not always what you think you want. Be mindful of what you ask for.\"\n\nBack home, Leo admired his new-old backpack. He tried to organize his chaotic school supplies into it. Pens, notebooks, his tattered copy of \"The Hobbit.\" The backpack swallowed them all with ease, still feeling impossibly light.\n\nThe next morning, the usual chaos ensued. \"My science project!\" Leo wailed, realizing he'd left his carefully constructed miniature volcano at home. He was already halfway to school. A wave of despair washed over him. \"Oh, if only I had it now!\" he mumbled, clutching the green backpack strap.\n\nHe arrived at school, defeated. As he rummaged for his lunch money, his fingers brushed against something stiff. He pulled it out. It was his miniature volcano, perfectly intact, sitting comfortably at the bottom of the backpack. His jaw dropped. He must have packed it without remembering! But no, he distinctly remembered leaving it on the kitchen counter.\n\nThat afternoon, during art class, Leo realized he'd forgotten his favorite shade of cerulean blue watercolor. \"I really need that blue,\" he thought, exasperated. He dipped his hand into the backpack's main compartment. His fingers closed around a familiar tube. Cerulean blue.\n\nOver the next few weeks, the magic backpack became his silent, dependable companion. Forgot his homework? A neatly stapled copy would be waiting. Needed a specific wrench for his bike? One would appear, sometimes a brand-new shiny one, sometimes an old, oil-stained antique. Once, when he wished for a snack, a freshly baked apple pie – still warm! – appeared, leading to a very popular lunch break.\n\nHe tried to test its limits. \"I wish I had a million dollars!\" he thought, plunging his hand in. He pulled out a small, leather-bound book titled \"The History of Global Economics.\" Disappointed, he tried again, \"I wish for a new video game console!\" This time, a worn copy of \"Basic Coding for Beginners\" materialized. The old man's words echoed in his mind: \"what you *truly* need, not always what you think you want.\" The backpack wasn't a wish-granting machine; it was a guide, a silent mentor, pushing him towards self-sufficiency and knowledge.\n\nOne Saturday, Leo was on a camping trip with his scout troop. A sudden, fierce thunderstorm rolled in, tearing through their flimsy tents. Rain lashed down, and the temperature plummeted. Everyone was soaked and shivering. Their carefully packed emergency kit was, of course, soaking wet.\n\n\"We need warmth, something dry,\" the scout leader stammered, pulling out his damp phone, which had no signal. \"And some light!\"\n\nLeo looked at his magic backpack, now sitting innocently by his feet. He closed his eyes. \"We need warmth, light, and something to fix this mess,\" he thought, a desperate plea.\n\nHe opened the main flap. Inside, nestled amongst his usual items, were:\n*   A thick, wool blanket, impossibly soft and dry.\n*   A sturdy, oil-burning lantern, complete with a small bottle of fuel.\n*   A waterproof tarp, neatly folded, large enough to cover all the ruined tents.\n*   And, most surprisingly, a small, laminated card with instructions on how to build a quick, wind-resistant shelter using natural materials.\n\nWorking together, guided by the card and aided by the backpack's provisions, the troop quickly rigged a sturdy, dry shelter. The lantern cast a warm glow, and the blanket was passed around. Leo watched his friends, no longer shivering, their spirits lifted.\n\nAs the storm raged outside their makeshift haven, Leo understood. The backpack hadn't given him a magical escape from the problem. It had given him the *tools* and the *knowledge* to overcome it himself. It helped him be resourceful, brave, and ultimately, a better leader.\n\nFrom that day on, Leo's mornings were still full of ideas, but less chaos. He still used the magic backpack, but with a new respect. He no longer just wished for things; he thoughtfully considered what he genuinely needed, and often, what others around him needed too. The forest-green backpack remained a silent, loyal companion, a subtle hum of magic in his everyday life, reminding him that the greatest treasures are often found not in what you get, but in what you discover within yourself."
          }
        ]
      },
      "finishReason": "STOP",
      "avgLogprobs": -1.2276564842857483
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 8,
    "candidatesTokenCount": 1313,
    "totalTokenCount": 2945,
    "trafficType": "ON_DEMAND",
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 8
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 1313
      }
    ],
    "thoughtsTokenCount": 1624
  },
  "modelVersion": "gemini-3.8-flash",
  "createTime": "2025-11-28T09:21:04.743684Z",
  "responseId": "gGkpaYSyLcqE998P26jViQY"
}
```

---

## Google / Nano Banana / Gemini Nano Banana 2.1 `POST`

_Official Format_

### Gemini Nano Banana 2.1

Google native image generation and editing model with 1K/2K/4K output, configurable thinking, search grounding and video-to-image generation.

`POST https://api.cloudwise.ai/api/v1beta/models/gemini-nano-banana-2.1:generateContent`

### Overview

Generate or edit images with the native Gemini generateContent format. This synchronous endpoint returns generated content and token usage directly.

Up to 14 reference images are supported, including up to 10 object images and 4 character images. Context caching is not supported.

### Supported Models

| Model | Status | Input | Output |
| --- | --- | --- | --- |
| `gemini-nano-banana-2.1` | GA | Text, images, video, PDF | Text and images |

### Authentication

Provide a MaaS API key using one of these compatible headers.

| Header | Value | Description |
| --- | --- | --- |
| `Authorization` | `Bearer $YOUR_API_KEY` | Used in the examples below. |
| `x-goog-api-key` | `$YOUR_API_KEY` | Google-compatible header. |
| `x-api-key` | `$YOUR_API_KEY` | Alternative gateway header. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| contents | Array<Object> | Required | Input messages containing text, images, video or PDF context. |
| contents[].role | String | "user" | Use user for prompts and model for previous model responses in multi-turn conversations. |
| contents[].parts | Array<Object> | Required | Message parts containing text, inline media or file references. |
| contents[].parts[].text | String | null | Prompt or editing instructions. |
| contents[].parts[].inlineData | Object | null | Inline media input. Use this Base64 option when the image cannot be fetched from a URL. |
| contents[].parts[].inlineData.mimeType | String | Required with inlineData | Media MIME type, for example image/jpeg or image/png. |
| contents[].parts[].inlineData.data | String | Required with inlineData | Base64-encoded media bytes, without a data URL prefix. This field is not an image URL. |
| contents[].parts[].fileData | Object | null | Reference an uploaded file or external media URL. Public HTTPS and pre-signed URLs are fetched during processing; each external file must be no larger than 15 MB. |
| contents[].parts[].fileData.mimeType | String | null | MIME type of the referenced media, such as image/jpeg, image/png, image/webp or video/mp4. Required for external URL input. |
| contents[].parts[].fileData.fileUri | String | Required with fileData | Files API URI or a publicly accessible HTTPS/pre-signed URL. The URL must not require login; use a valid signed URL for private files. External image URLs support BMP, JPEG, PNG and WebP. |
| contents[].parts[].thoughtSignature | String | null | Opaque signature from a previous model response. Preserve it with its original part when continuing a conversation. |
| tools | Array<Object> | [] | Optional Google Search grounding tools. |
| tools[].google_search | Object | null | Enable search-grounded generation. Search grounding can incur additional charges. |
| tools[].google_search.searchTypes | Object | null | Select webSearch, imageSearch, or both for grounding. |
| tools[].google_search.searchTypes.webSearch | Object | null | Set to {} to enable web search for factual context. |
| tools[].google_search.searchTypes.imageSearch | Object | null | Set to {} to enable image search for visual references. |
| generationConfig | Object | {} | Output and thinking configuration. |
| generationConfig.responseModalities | Array<String> | ["TEXT", "IMAGE"] | Use ["IMAGE"] for image-only output or ["TEXT", "IMAGE"] for text and images. |
| generationConfig.responseFormat | Object | null | Output format configuration used by the current generateContent image examples. |
| generationConfig.responseFormat.image | Object | null | Image output settings. Configure aspectRatio and imageSize inside this object. |
| generationConfig.responseFormat.image.aspectRatio | String | Auto | Supported: 1:1, 1:4, 4:1, 1:8, 8:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9. When omitted, the model chooses a suitable ratio. |
| generationConfig.responseFormat.image.imageSize | String | "1K" | Supported: 1K, 2K, 4K. Unlike gemini-3.1-flash-image, this model does not support 512 output. |
| generationConfig.thinkingConfig | Object | null | Configure reasoning before image generation. |
| generationConfig.thinkingConfig.thinkingLevel | String | "medium" | Supported: minimal, medium, high. The default is medium, rather than the minimal default documented for gemini-3.1-flash-image. |
| generationConfig.thinkingConfig.includeThoughts | Boolean | false | Include available thought summaries in the response. Thinking tokens are billed even when summaries are not returned. |
| return_base64 | Boolean | true | Cloudwise extension, not a Google API parameter. true returns Base64 image data; false requests image URLs from the gateway. |

### Request Example

Text-to-Image

Image-to-Image

Search-Grounded

```bash
curl --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-nano-banana-2.1:generateContent' \
--header "Authorization: Bearer $YOUR_API_KEY" \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Create a photorealistic product image of a blue ceramic mug on a white table, with Cloudwise printed clearly on the mug."
        }
      ]
    }
  ]
}'
```

### Response

Read image data and its MIME type from `inlineData`. For multi-turn editing, send the previous model content back unchanged, including all `thoughtSignature` values.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| `candidates` | Array<Object> | Generated content candidates, including content, finishReason and index. |
| `candidates[].content.parts[].inlineData` | Object | Generated image bytes in data, with their MIME type in mimeType. Text output is returned in a text part. |
| `candidates[].content.parts[].thoughtSignature` | String | Opaque reasoning signature. Keep the original signature-bearing parts in subsequent multi-turn requests. |
| `candidates[].groundingMetadata` | Object | Search grounding sources and attribution, when a search tool is used. |
| `usageMetadata` | Object | Token usage, including promptTokenCount, candidatesTokenCount, thoughtsTokenCount, totalTokenCount and per-modality token details. |
| `modelVersion` | String | Model version used to generate the response. |
| `responseId` | String | Identifier for this response. |

#### Example Response

Illustrative response; image data, signatures and token usage vary by request.

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/jpeg",
              "data": "BASE64_IMAGE_DATA"
            },
            "thoughtSignature": "BASE64_THOUGHT_SIGNATURE"
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 20,
    "candidatesTokenCount": 1120,
    "thoughtsTokenCount": 80,
    "totalTokenCount": 1220,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 20
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1120
      }
    ]
  },
  "modelVersion": "gemini-nano-banana-2.1",
  "responseId": "RESPONSE_ID"
}
```

**Request Example (Text-to-Image)**

```bash
curl --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-nano-banana-2.1:generateContent' \
--header "Authorization: Bearer $YOUR_API_KEY" \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Create a photorealistic product image of a blue ceramic mug on a white table, with Cloudwise printed clearly on the mug."
        }
      ]
    }
  ]
}'
```

**Request Example (Image-to-Image)**

```bash
curl --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-nano-banana-2.1:generateContent' \
--header "Authorization: Bearer $YOUR_API_KEY" \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Replace the background with a bright modern kitchen. Keep the product shape, color and printed text unchanged."
        },
        {
          "fileData": {
            "mimeType": "image/jpeg",
            "fileUri": "https://storage.googleapis.com/github-repo/img/gemini/multimodality_usecases_overview/glasses1.jpg"
          }
        }
      ]
    }
  ]
}'
```

**Request Example (Search-Grounded)**

```bash
curl --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-nano-banana-2.1:generateContent' \
--header "Authorization: Bearer $YOUR_API_KEY" \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Create a clean infographic comparing the latest Google Pixel phones. Use web search for specifications and image search for visual references."
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {
        "searchTypes": {
          "webSearch": {},
          "imageSearch": {}
        }
      }
    }
  ]
}'
```

**Response Example**

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/jpeg",
              "data": "BASE64_IMAGE_DATA"
            },
            "thoughtSignature": "BASE64_THOUGHT_SIGNATURE"
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 20,
    "candidatesTokenCount": 1120,
    "thoughtsTokenCount": 80,
    "totalTokenCount": 1220,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 20
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1120
      }
    ]
  },
  "modelVersion": "gemini-nano-banana-2.1",
  "responseId": "RESPONSE_ID"
}
```

---

## Google / Nano Banana / Gemini-2.5-flash-image `POST`

_Official Format_

### Gemini-2.5-flash-image

(Nano Banana🍌) Google Gemini 2.5 Flash image model supporting multimodal text and image input/output. Can be used via OpenAI-compatible interface by adding modalities parameter. Lightweight and fast, ideal for real-time application scenarios requiring image understanding and generation.

`POST https://api.cloudwise.ai/api/v1beta/models/gemini-2.5-flash-image:generateContent`

### Overview

This endpoint provides image generation functionality using the Gemini-2.5-flash-image model.

### Authentication

This endpoint supports three compatible authentication header formats for Gemini requests.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer $YOUR_API_KEY" | compatible<br>**OAuth2 standard format**: `Authorization: Bearer YOUR_API_KEY` |
| x-goog-api-key | string | "YOUR_API_KEY" | compatible<br>**Google official format**: `x-goog-api-key: YOUR_API_KEY` |
| x-api-key | string | "YOUR_API_KEY" | compatible<br>**Generic API format**: `x-api-key: YOUR_API_KEY` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| contents | Array<Object> | Required | Array of input messages. Supports multimodal input such as text and images. |
| contents[].parts | Array<Object> | Required | Components of a single message. Each part can be text or image data. |
| contents[].parts[].text | String | null | Text prompt describing what you want the model to generate. |
| contents[].parts[].inline_data | Object | null | Inline image data object for image input. |
| contents[].parts[].inline_data.mime_type | String | Required if image provided | MIME type of the image, e.g., `image/jpeg`, `image/png`. |
| contents[].parts[].inline_data.data | String | Required if image provided | Image content. Can be a Base64 string or a publicly accessible image URL (depending on implementation). |
| tools | Array<Object> | [] | Optional tool configuration (e.g., search capabilities). |
| tools[].google_search | Object | null | Enables Google search functionality. |
| tools[].google_search.searchTypes | Object | {} | Specifies search types to enable. |
| tools[].google_search.searchTypes.webSearch | Object | {} | Enables web search capability. |
| generationConfig | Object | {} | Configuration for generation behavior. |
| generationConfig.responseModalities | Array<String> | ["TEXT"] | Output types to return, e.g., `TEXT`, `IMAGE`, or both. |
| generationConfig.imageConfig | Object | null | Image generation configuration. |
| generationConfig.imageConfig.aspectRatio | String | "1:1" | Aspect ratio of generated images, e.g., `1:1`, `16:9`, `9:16`. |
| generationConfig.imageConfig.imageSize | String | "512" | Output image size preset, e.g., `512`, `1K`, `2K`, `4K`. |
| return_base64 | Boolean | true | Whether to return generated images in Base64 format. If `false`, the API returns image URLs. |

### Request Example

Text-to-Image

Image-to-Image

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-2.5-flash-image:generateContent' --header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {
        "searchTypes": {
          "webSearch": {}
        }
      }
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "1K"
    }
  },
  "return_base64": true
}'
```

### Response

The response contains the generated image(s) and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| candidates | array | An array of candidate objects containing the generated content. Each candidate contains:<br><br>- `content` (object): Contains the generated content with role and parts array.<br>- `finishReason` (string): The reason the model stopped generating.<br>- `index` (integer): The index of the candidate.<br>- `safetyRatings` (array, nullable): Safety ratings for the content. |
| promptFeedback | object | Feedback information about the prompt. Contains:<br><br>- `safetyRatings` (array, nullable): Safety ratings for the prompt. |
| usageMetadata | object | Token usage information. Contains:<br><br>- `promptTokenCount` (integer): Number of tokens in the prompt.<br>- `candidatesTokenCount` (integer): Number of tokens in the generated content.<br>- `totalTokenCount` (integer): Total number of tokens used.<br>- `promptTokensDetails` (array): Details about prompt tokens by modality.<br>- `candidatesTokensDetails` (array): Details about candidate tokens by modality. |
| modelVersion | string | The version of the model used for generation. |
| responseId | string | Unique identifier for the response. |

#### Example Response

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "BASE64_FILE"
            }
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": null
    }
  ],
  "promptFeedback": {
    "safetyRatings": null
  },
  "usageMetadata": {
    "promptTokenCount": 15,
    "candidatesTokenCount": 1290,
    "totalTokenCount": 1305,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 15
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1290
      }
    ]
  },
  "modelVersion": "gemini-2.5-flash-image",
  "responseId": "ZD*******-*******-***Ak"
}
```

**Request Example (Text-to-Image)**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-2.5-flash-image:generateContent' --header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {
        "searchTypes": {
          "webSearch": {}
        }
      }
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "1K"
    }
  },
  "return_base64": true
}'
```

**Request Example (Image-to-Image)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-2.5-flash-image:generateContent' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
      "contents": [
        {
          "role": "user",
          "parts": [
            {
              "text": "Hi, This is a picture of me. Can you add a llama next to me"
            },
            {
              "inline_data": {
                "mime_type": "image/jpeg",
                "data": "YOUR_BASE64_HERE"
              }
            }
          ]
        }
      ],
      "generationConfig": {
        "responseModalities": [
          "TEXT",
          "IMAGE"
        ]
      }
    }'
```

**Response Example**

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "BASE64_FILE"
            }
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": null
    }
  ],
  "promptFeedback": {
    "safetyRatings": null
  },
  "usageMetadata": {
    "promptTokenCount": 15,
    "candidatesTokenCount": 1290,
    "totalTokenCount": 1305,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 15
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1290
      }
    ]
  },
  "modelVersion": "gemini-2.5-flash-image",
  "responseId": "ZD*******-*******-***Ak"
}
```

---

## Google / Nano Banana / Gemini-3-pro-image-preview `POST`

_Official Format_

### Gemini-3-pro-image-preview

(Nano Banana Pro🍌) Google Gemini 3 Pro image generation model with advanced multimodal capabilities. Features state-of-the-art image synthesis, enhanced prompt understanding, and superior visual quality. Supports creative image generation, editing, and style transfer with exceptional detail and accuracy.

`POST https://api.cloudwise.ai/api/v1beta/models/gemini-3-pro-image-preview:generateContent`

### Overview

This endpoint provides image generation functionality using the Gemini-3-pro-image-preview model.

### Authentication

This endpoint supports three compatible authentication header formats for Gemini requests.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer $YOUR_API_KEY" | compatible<br>**OAuth2 standard format**: `Authorization: Bearer YOUR_API_KEY` |
| x-goog-api-key | string | "YOUR_API_KEY" | compatible<br>**Google official format**: `x-goog-api-key: YOUR_API_KEY` |
| x-api-key | string | "YOUR_API_KEY" | compatible<br>**Generic API format**: `x-api-key: YOUR_API_KEY` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| contents | Array<Object> | Required | Array of input messages. Supports multimodal input such as text and images. |
| contents[].parts | Array<Object> | Required | Components of a single message. Each part can be text or image data. |
| contents[].parts[].text | String | null | Text prompt describing what you want the model to generate. |
| contents[].parts[].inline_data | Object | null | Inline image data object for image input. |
| contents[].parts[].inline_data.mime_type | String | Required if image provided | MIME type of the image, e.g., `image/jpeg`, `image/png`. |
| contents[].parts[].inline_data.data | String | Required if image provided | Image content. Can be a Base64 string or a publicly accessible image URL (depending on implementation). |
| tools | Array<Object> | [] | Optional tool configuration (e.g., search capabilities). |
| tools[].google_search | Object | null | Enables Google search functionality. |
| tools[].google_search.searchTypes | Object | {} | Specifies search types to enable. |
| tools[].google_search.searchTypes.webSearch | Object | {} | Enables web search capability. |
| generationConfig | Object | {} | Configuration for generation behavior. |
| generationConfig.responseModalities | Array<String> | ["TEXT"] | Output types to return, e.g., `TEXT`, `IMAGE`, or both. |
| generationConfig.imageConfig | Object | null | Image generation configuration. |
| generationConfig.imageConfig.aspectRatio | String | "1:1" | Aspect ratio of generated images, e.g., `1:1`, `16:9`, `9:16`. |
| generationConfig.imageConfig.imageSize | String | "512" | Output image size preset, e.g., `512`, `1K`, `2K`, `4K`. |
| return_base64 | Boolean | true | Whether to return generated images in Base64 format. If `false`, the API returns image URLs. |

### Request Example

Text-to-Image

Image-to-Image

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3-pro-image-preview:generateContent' --header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {
        "searchTypes": {
          "webSearch": {}
        }
      }
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "1K"
    }
  },
  "return_base64": true
}'
```

### Response

The response contains the generated image(s) and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| candidates | array | An array of candidate objects containing the generated content. Each candidate contains:<br><br>- `content` (object): Contains the generated content with role and parts array.<br>- `finishReason` (string): The reason the model stopped generating.<br>- `index` (integer): The index of the candidate.<br>- `safetyRatings` (array, nullable): Safety ratings for the content. |
| promptFeedback | object | Feedback information about the prompt. Contains:<br><br>- `safetyRatings` (array, nullable): Safety ratings for the prompt. |
| usageMetadata | object | Token usage information. Contains:<br><br>- `promptTokenCount` (integer): Number of tokens in the prompt.<br>- `candidatesTokenCount` (integer): Number of tokens in the generated content.<br>- `totalTokenCount` (integer): Total number of tokens used.<br>- `promptTokensDetails` (array): Details about prompt tokens by modality.<br>- `candidatesTokensDetails` (array): Details about candidate tokens by modality. |
| modelVersion | string | The version of the model used for generation. |
| responseId | string | Unique identifier for the response. |

#### Example Response

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "BASE64_FILE"
            }
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": null
    }
  ],
  "promptFeedback": {
    "safetyRatings": null
  },
  "usageMetadata": {
    "promptTokenCount": 15,
    "candidatesTokenCount": 1290,
    "totalTokenCount": 1305,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 15
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1290
      }
    ]
  },
  "modelVersion": "gemini-3-pro-image-preview",
  "responseId": "ZD*******-*******-***Ak"
}
```

**Request Example (Text-to-Image)**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3-pro-image-preview:generateContent' --header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {
        "searchTypes": {
          "webSearch": {}
        }
      }
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "1K"
    }
  },
  "return_base64": true
}'
```

**Request Example (Image-to-Image)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3-pro-image-preview:generateContent' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
      "contents": [
        {
          "role": "user",
          "parts": [
            {
              "text": "Hi, This is a picture of me. Can you add a llama next to me"
            },
            {
              "inline_data": {
                "mime_type": "image/jpeg",
                "data": "YOUR_BASE64_HERE"
              }
            }
          ]
        }
      ],
      "generationConfig": {
        "responseModalities": [
          "TEXT",
          "IMAGE"
        ]
      }
    }'
```

**Response Example**

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "BASE64_FILE"
            }
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": null
    }
  ],
  "promptFeedback": {
    "safetyRatings": null
  },
  "usageMetadata": {
    "promptTokenCount": 15,
    "candidatesTokenCount": 1290,
    "totalTokenCount": 1305,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 15
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1290
      }
    ]
  },
  "modelVersion": "gemini-3-pro-image-preview",
  "responseId": "ZD*******-*******-***Ak"
}
```

---

## Google / Nano Banana / Gemini-3.1-flash-image-preview `POST`

_Official Format_

### Gemini-3.1-flash-image-preview

(Nano Banana 2🍌) is the latest state-of-the-art image model. Dramatically closes the gap between speed and visual fidelity, delivering high-quality, photorealistic imagery.

`POST https://api.cloudwise.ai/api/v1beta/models/gemini-3.1-flash-image-preview:generateContent`

### Overview

This endpoint provides image generation functionality using the Gemini-3.1-flash-image-preview model.

### Authentication

This endpoint supports three compatible authentication header formats for Gemini requests.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer $YOUR_API_KEY" | compatible<br>**OAuth2 standard format**: `Authorization: Bearer YOUR_API_KEY` |
| x-goog-api-key | string | "YOUR_API_KEY" | compatible<br>**Google official format**: `x-goog-api-key: YOUR_API_KEY` |
| x-api-key | string | "YOUR_API_KEY" | compatible<br>**Generic API format**: `x-api-key: YOUR_API_KEY` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| contents | Array<Object> | Required | Array of input messages. Supports multimodal input such as text and images. |
| contents[].parts | Array<Object> | Required | Components of a single message. Each part can be text or image data. |
| contents[].parts[].text | String | null | Text prompt describing what you want the model to generate. |
| contents[].parts[].inline_data | Object | null | Inline image data object for image input. |
| contents[].parts[].inline_data.mime_type | String | Required if image provided | MIME type of the image, e.g., `image/jpeg`, `image/png`. |
| contents[].parts[].inline_data.data | String | Required if image provided | Image content. Can be a Base64 string or a publicly accessible image URL (depending on implementation). |
| tools | Array<Object> | [] | Optional tool configuration (e.g., search capabilities). |
| tools[].google_search | Object | null | Enables Google search functionality. |
| tools[].google_search.searchTypes | Object | {} | Specifies search types to enable. |
| tools[].google_search.searchTypes.webSearch | Object | {} | Enables web search capability. |
| generationConfig | Object | {} | Configuration for generation behavior. |
| generationConfig.responseModalities | Array<String> | ["TEXT"] | Output types to return, e.g., `TEXT`, `IMAGE`, or both. |
| generationConfig.imageConfig | Object | null | Image generation configuration. |
| generationConfig.imageConfig.aspectRatio | String | "1:1" | Aspect ratio of generated images, e.g., `1:1`, `16:9`, `9:16`. |
| generationConfig.imageConfig.imageSize | String | "512" | Output image size preset, e.g., `512`, `1K`, `2K`, `4K`. |
| return_base64 | Boolean | true | Whether to return generated images in Base64 format. If `false`, the API returns image URLs. |

### Request Example

Text-to-Image

Image-to-Image

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3.1-flash-image-preview:generateContent' --header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {
        "searchTypes": {
          "webSearch": {}
        }
      }
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "1K"
    }
  },
  "return_base64": true
}'
```

### Response

The response contains the generated image(s) and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| candidates | array | An array of candidate objects containing the generated content. Each candidate contains:<br><br>- `content` (object): Contains the generated content with role and parts array.<br>- `finishReason` (string): The reason the model stopped generating.<br>- `index` (integer): The index of the candidate.<br>- `safetyRatings` (array, nullable): Safety ratings for the content. |
| promptFeedback | object | Feedback information about the prompt. Contains:<br><br>- `safetyRatings` (array, nullable): Safety ratings for the prompt. |
| usageMetadata | object | Token usage information. Contains:<br><br>- `promptTokenCount` (integer): Number of tokens in the prompt.<br>- `candidatesTokenCount` (integer): Number of tokens in the generated content.<br>- `totalTokenCount` (integer): Total number of tokens used.<br>- `promptTokensDetails` (array): Details about prompt tokens by modality.<br>- `candidatesTokensDetails` (array): Details about candidate tokens by modality. |
| modelVersion | string | The version of the model used for generation. |
| responseId | string | Unique identifier for the response. |

#### Example Response

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "BASE64_FILE"
            }
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": null
    }
  ],
  "promptFeedback": {
    "safetyRatings": null
  },
  "usageMetadata": {
    "promptTokenCount": 15,
    "candidatesTokenCount": 1290,
    "totalTokenCount": 1305,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 15
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1290
      }
    ]
  },
  "modelVersion": "gemini-3.1-flash-image-preview",
  "responseId": "ZD*******-*******-***Ak"
}
```

**Request Example (Text-to-Image)**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3.1-flash-image-preview:generateContent' --header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {
        "searchTypes": {
          "webSearch": {}
        }
      }
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "1K"
    }
  },
  "return_base64": true
}'
```

**Request Example (Image-to-Image)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3.1-flash-image-preview:generateContent' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
      "contents": [
        {
          "role": "user",
          "parts": [
            {
              "text": "Hi, This is a picture of me. Can you add a llama next to me"
            },
            {
              "inline_data": {
                "mime_type": "image/jpeg",
                "data": "YOUR_BASE64_HERE"
              }
            }
          ]
        }
      ],
      "generationConfig": {
        "responseModalities": [
          "TEXT",
          "IMAGE"
        ]
      }
    }'
```

**Response Example**

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "BASE64_FILE"
            }
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": null
    }
  ],
  "promptFeedback": {
    "safetyRatings": null
  },
  "usageMetadata": {
    "promptTokenCount": 15,
    "candidatesTokenCount": 1290,
    "totalTokenCount": 1305,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 15
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1290
      }
    ]
  },
  "modelVersion": "gemini-3.1-flash-image-preview",
  "responseId": "ZD*******-*******-***Ak"
}
```

---

## Google / Nano Banana / Gemini-3-pro-image `POST`

_Official Format_

### Gemini-3-pro-image

(Nano Banana Pro🍌) Gemini 3 Pro Image model for professional asset creation. It uses advanced reasoning by default, follows complex instructions, renders high-fidelity text, supports Google Search grounding, up to 14 reference images, and 1K/2K/4K image output.

`POST https://api.cloudwise.ai/api/v1beta/models/gemini-3-pro-image:generateContent`

### Overview

This endpoint provides image generation functionality using the Gemini-3-pro-image model.

### Authentication

This endpoint supports three compatible authentication header formats for Gemini requests.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer $YOUR_API_KEY" | compatible<br>**OAuth2 standard format**: `Authorization: Bearer YOUR_API_KEY` |
| x-goog-api-key | string | "YOUR_API_KEY" | compatible<br>**Google official format**: `x-goog-api-key: YOUR_API_KEY` |
| x-api-key | string | "YOUR_API_KEY" | compatible<br>**Generic API format**: `x-api-key: YOUR_API_KEY` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| contents | Array<Object> | Required | Array of input messages. Supports multimodal input such as text and images. |
| contents[].parts | Array<Object> | Required | Components of a single message. Each part can be text or image data. |
| contents[].parts[].text | String | null | Text prompt describing what you want the model to generate. |
| contents[].parts[].inline_data | Object | null | Inline image data object for image input. |
| contents[].parts[].inline_data.mime_type | String | Required if image provided | MIME type of the image, e.g., `image/jpeg`, `image/png`. |
| contents[].parts[].inline_data.data | String | Required if image provided | Image content. Can be a Base64 string or a publicly accessible image URL (depending on implementation). |
| tools | Array<Object> | [] | Optional tool configuration (e.g., search capabilities). |
| tools[].google_search | Object | null | Enables Google search functionality. |
| tools[].google_search.searchTypes | Object | {} | Specifies search types to enable. |
| tools[].google_search.searchTypes.webSearch | Object | {} | Enables web search capability. |
| generationConfig | Object | {} | Configuration for generation behavior. |
| generationConfig.responseModalities | Array<String> | ["TEXT"] | Output types to return, e.g., `TEXT`, `IMAGE`, or both. |
| generationConfig.imageConfig | Object | null | Image generation configuration. |
| generationConfig.imageConfig.aspectRatio | String | "1:1" | Supported values: `1:1`,`2:3`,`3:2`,`3:4`,`4:3`,`4:5`,`5:4`,`9:16`,`16:9`,`21:9`. |
| generationConfig.imageConfig.imageSize | String | "1K" | Supported values: `1K`,`2K`,`4K`. |
| reference image limit | Constraint | Max 14 images | Supports up to 14 reference images total, including up to 5 character images for consistency and up to 10 high-fidelity object images. |
| thinking | Behavior | Always on | Thinking is enabled by default for Gemini 3 image models and cannot be disabled through API parameters for gemini-3-pro-image. |
| return_base64 | Boolean | true | Whether to return generated images in Base64 format. If `false`, the API returns image URLs. |

### Request Example

Text-to-Image

Image-to-Image

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3-pro-image:generateContent' --header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {
        "searchTypes": {
          "webSearch": {}
        }
      }
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "1K"
    }
  },
  "return_base64": true
}'
```

### Response

The response contains the generated image(s) and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| candidates | array | An array of candidate objects containing the generated content. Each candidate contains:<br><br>- `content` (object): Contains the generated content with role and parts array.<br>- `finishReason` (string): The reason the model stopped generating.<br>- `index` (integer): The index of the candidate.<br>- `safetyRatings` (array, nullable): Safety ratings for the content. |
| promptFeedback | object | Feedback information about the prompt. Contains:<br><br>- `safetyRatings` (array, nullable): Safety ratings for the prompt. |
| usageMetadata | object | Token usage information. Contains:<br><br>- `promptTokenCount` (integer): Number of tokens in the prompt.<br>- `candidatesTokenCount` (integer): Number of tokens in the generated content.<br>- `totalTokenCount` (integer): Total number of tokens used.<br>- `promptTokensDetails` (array): Details about prompt tokens by modality.<br>- `candidatesTokensDetails` (array): Details about candidate tokens by modality. |
| modelVersion | string | The version of the model used for generation. |
| responseId | string | Unique identifier for the response. |

#### Example Response

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "BASE64_FILE"
            }
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": null
    }
  ],
  "promptFeedback": {
    "safetyRatings": null
  },
  "usageMetadata": {
    "promptTokenCount": 15,
    "candidatesTokenCount": 1290,
    "totalTokenCount": 1305,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 15
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1290
      }
    ]
  },
  "modelVersion": "gemini-3-pro-image",
  "responseId": "ZD*******-*******-***Ak"
}
```

**Request Example (Text-to-Image)**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3-pro-image:generateContent' --header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {
        "searchTypes": {
          "webSearch": {}
        }
      }
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "1K"
    }
  },
  "return_base64": true
}'
```

**Request Example (Image-to-Image)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3-pro-image:generateContent' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
      "contents": [
        {
          "role": "user",
          "parts": [
            {
              "text": "Hi, This is a picture of me. Can you add a llama next to me"
            },
            {
              "inline_data": {
                "mime_type": "image/jpeg",
                "data": "YOUR_BASE64_HERE"
              }
            }
          ]
        }
      ],
      "generationConfig": {
        "responseModalities": [
          "TEXT",
          "IMAGE"
        ]
      }
    }'
```

**Response Example**

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "BASE64_FILE"
            }
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": null
    }
  ],
  "promptFeedback": {
    "safetyRatings": null
  },
  "usageMetadata": {
    "promptTokenCount": 15,
    "candidatesTokenCount": 1290,
    "totalTokenCount": 1305,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 15
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1290
      }
    ]
  },
  "modelVersion": "gemini-3-pro-image",
  "responseId": "ZD*******-*******-***Ak"
}
```

---

## Google / Nano Banana / Gemini-3.1-flash-image `POST`

_Official Format_

### Gemini-3.1-flash-image

(Nano Banana 2🍌) Gemini 3.1 Flash Image model optimized for speed, efficiency, and high-throughput image generation. It supports 512/1K/2K/4K output, additional aspect ratios, controllable thinking level, Google image search grounding, and video-to-image generation.

`POST https://api.cloudwise.ai/api/v1beta/models/gemini-3.1-flash-image:generateContent`

### Overview

This endpoint provides image generation functionality using the Gemini-3.1-flash-image model.

### Authentication

This endpoint supports three compatible authentication header formats for Gemini requests.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer $YOUR_API_KEY" | compatible<br>**OAuth2 standard format**: `Authorization: Bearer YOUR_API_KEY` |
| x-goog-api-key | string | "YOUR_API_KEY" | compatible<br>**Google official format**: `x-goog-api-key: YOUR_API_KEY` |
| x-api-key | string | "YOUR_API_KEY" | compatible<br>**Generic API format**: `x-api-key: YOUR_API_KEY` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| contents | Array<Object> | Required | Array of input messages. Supports multimodal input such as text and images. |
| contents[].parts | Array<Object> | Required | Components of a single message. Each part can be text or image data. |
| contents[].parts[].text | String | null | Text prompt describing what you want the model to generate. |
| contents[].parts[].inline_data | Object | null | Inline image data object for image input. |
| contents[].parts[].inline_data.mime_type | String | Required if image provided | MIME type of the image, e.g., `image/jpeg`, `image/png`. |
| contents[].parts[].inline_data.data | String | Required if image provided | Image content. Can be a Base64 string or a publicly accessible image URL (depending on implementation). |
| tools | Array<Object> | [] | Optional tool configuration (e.g., search capabilities). |
| tools[].google_search | Object | null | Enables Google search functionality. |
| tools[].google_search.searchTypes | Object | {} | Specifies search types to enable. |
| tools[].google_search.searchTypes.webSearch | Object | {} | Enables web search capability. |
| generationConfig | Object | {} | Configuration for generation behavior. |
| generationConfig.responseModalities | Array<String> | ["TEXT"] | Output types to return, e.g., `TEXT`, `IMAGE`, or both. |
| generationConfig.imageConfig | Object | null | Image generation configuration. |
| contents[].parts[].file_data | Object | null | File data object for referenced media input such as public YouTube URLs or uploaded video files. Used for gemini-3.1-flash-image video-to-image generation. |
| contents[].parts[].file_data.file_uri | String | Required if file_data provided | Public file URL or Files API URI used as input media. For video-to-image, pass a public YouTube URL or an uploaded video file URI. |
| contents[].parts[].video_metadata | Object | null | Video metadata for video inputs, such as frame sampling options used when generating images from video context. |
| tools[].google_search.searchTypes.imageSearch | Object | {} | Enables Google image search grounding. Officially available for gemini-3.1-flash-image and can be used alone or with webSearch. |
| generationConfig.imageConfig.aspectRatio | String | "1:1" | Supported values: `1:1`,`1:4`,`4:1`,`1:8`,`8:1`,`2:3`,`3:2`,`3:4`,`4:3`,`4:5`,`5:4`,`9:16`,`16:9`,`21:9`. |
| generationConfig.imageConfig.imageSize | String | "1K" | Supported values: `512`,`1K`,`2K`,`4K`. |
| generationConfig.thinkingConfig | Object | null | Optional thinking configuration. Officially supported by gemini-3.1-flash-image. |
| generationConfig.thinkingConfig.thinkingLevel | String | "minimal" | Supported values: `minimal`,`high`. |
| generationConfig.thinkingConfig.includeThoughts | Boolean | false | Whether to include the model thoughts in the response when available. Thinking tokens are billed whether thoughts are returned or hidden. |
| reference image limit | Constraint | Max 14 images | Supports up to 14 reference images total, with up to 4 character images for consistency and up to 10 object images for detail fidelity. |
| return_base64 | Boolean | true | Whether to return generated images in Base64 format. If `false`, the API returns image URLs. |

### Request Example

Text-to-Image

Image-to-Image

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3.1-flash-image:generateContent' --header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {
        "searchTypes": {
          "webSearch": {},
          "imageSearch": {}
        }
      }
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "1K"
    },
    "thinkingConfig": {
      "thinkingLevel": "minimal",
      "includeThoughts": false
    }
  },
  "return_base64": true
}'
```

### Response

The response contains the generated image(s) and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| candidates | array | An array of candidate objects containing the generated content. Each candidate contains:<br><br>- `content` (object): Contains the generated content with role and parts array.<br>- `finishReason` (string): The reason the model stopped generating.<br>- `index` (integer): The index of the candidate.<br>- `safetyRatings` (array, nullable): Safety ratings for the content. |
| promptFeedback | object | Feedback information about the prompt. Contains:<br><br>- `safetyRatings` (array, nullable): Safety ratings for the prompt. |
| usageMetadata | object | Token usage information. Contains:<br><br>- `promptTokenCount` (integer): Number of tokens in the prompt.<br>- `candidatesTokenCount` (integer): Number of tokens in the generated content.<br>- `totalTokenCount` (integer): Total number of tokens used.<br>- `promptTokensDetails` (array): Details about prompt tokens by modality.<br>- `candidatesTokensDetails` (array): Details about candidate tokens by modality. |
| modelVersion | string | The version of the model used for generation. |
| responseId | string | Unique identifier for the response. |

#### Example Response

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "BASE64_FILE"
            }
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": null
    }
  ],
  "promptFeedback": {
    "safetyRatings": null
  },
  "usageMetadata": {
    "promptTokenCount": 15,
    "candidatesTokenCount": 1290,
    "totalTokenCount": 1305,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 15
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1290
      }
    ]
  },
  "modelVersion": "gemini-3.1-flash-image",
  "responseId": "ZD*******-*******-***Ak"
}
```

**Request Example (Text-to-Image)**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3.1-flash-image:generateContent' --header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {
        "searchTypes": {
          "webSearch": {},
          "imageSearch": {}
        }
      }
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "1K"
    },
    "thinkingConfig": {
      "thinkingLevel": "minimal",
      "includeThoughts": false
    }
  },
  "return_base64": true
}'
```

**Request Example (Image-to-Image)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3.1-flash-image:generateContent' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
      "contents": [
        {
          "role": "user",
          "parts": [
            {
              "text": "Hi, This is a picture of me. Can you add a llama next to me"
            },
            {
              "inline_data": {
                "mime_type": "image/jpeg",
                "data": "YOUR_BASE64_HERE"
              }
            }
          ]
        }
      ],
      "generationConfig": {
        "responseModalities": [
          "TEXT",
          "IMAGE"
        ]
      }
    }'
```

**Response Example**

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "BASE64_FILE"
            }
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "safetyRatings": null
    }
  ],
  "promptFeedback": {
    "safetyRatings": null
  },
  "usageMetadata": {
    "promptTokenCount": 15,
    "candidatesTokenCount": 1290,
    "totalTokenCount": 1305,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 15
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1290
      }
    ]
  },
  "modelVersion": "gemini-3.1-flash-image",
  "responseId": "ZD*******-*******-***Ak"
}
```

---

## Google / Nano Banana / Gemini-3.1-flash-lite-image `POST`

_Official Format_

### Gemini-3.1-flash-lite-image

(Nano Banana 2🍌) Gemini 3.1 Flash Lite Image model built for maximum speed and cost efficiency in high-throughput scenarios while delivering high-quality, photorealistic imagery. Supports text-to-image and image-to-image generation with configurable aspect ratio and image size.

`POST https://api.cloudwise.ai/api/v1beta/models/gemini-3.1-flash-lite-image:generateContent`

### Overview

This endpoint provides image generation functionality using the Gemini-3.1-flash-lite-image model.

### Authentication

This endpoint supports three compatible authentication header formats for Gemini requests.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer $YOUR_API_KEY" | compatible<br>**OAuth2 standard format**: `Authorization: Bearer YOUR_API_KEY` |
| x-goog-api-key | string | "YOUR_API_KEY" | compatible<br>**Google official format**: `x-goog-api-key: YOUR_API_KEY` |
| x-api-key | string | "YOUR_API_KEY" | compatible<br>**Generic API format**: `x-api-key: YOUR_API_KEY` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| contents | Array<Object> | Required | Array of input messages. Supports multimodal input such as text and images. |
| contents[].parts | Array<Object> | Required | Components of a single message. Each part can be text or image data. |
| contents[].parts[].text | String | null | Text prompt describing what you want the model to generate. |
| contents[].parts[].inline_data | Object | null | Inline image data object for image input. |
| contents[].parts[].inline_data.mime_type | String | Required if image provided | MIME type of the image, e.g., `image/jpeg`, `image/png`. |
| contents[].parts[].inline_data.data | String | Required if image provided | Image content. Can be a Base64 string or a publicly accessible image URL (depending on implementation). |
| tools | Array<Object> | [] | Optional tool configuration (e.g., search capabilities). |
| tools[].google_search | Object | null | Enables Google search functionality. |
| tools[].google_search.searchTypes | Object | {} | Specifies search types to enable. |
| tools[].google_search.searchTypes.webSearch | Object | {} | Enables web search capability. |
| generationConfig | Object | {} | Configuration for generation behavior. |
| generationConfig.responseModalities | Array<String> | ["TEXT"] | Output types to return, e.g., `TEXT`, `IMAGE`, or both. |
| generationConfig.imageConfig | Object | null | Image generation configuration. |
| generationConfig.imageConfig.aspectRatio | String | "1:1" | Aspect ratio of generated images, e.g., `1:1`, `16:9`, `9:16`. |
| generationConfig.imageConfig.imageSize | String | "512" | Output image size preset, e.g., `512`, `1K`, `2K`, `4K`. |
| return_base64 | Boolean | true | Whether to return generated images in Base64 format. If `false`, the API returns image URLs. |

### Request Example

Text-to-Image

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3.1-flash-lite-image:generateContent' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Generate two images in different styles: a futuristic banana with neon lights in a cyberpunk city"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "9:16",
      "imageSize": "1K"
    }
  },
  "return_base64": true
}'
```

### Response

The response contains the generated image(s) and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| candidates | array | An array of candidate objects containing the generated content. Each candidate contains:<br><br>- `content` (object): Contains the generated content with role and parts array.<br>- `finishReason` (string): The reason the model stopped generating.<br>- `index` (integer): The index of the candidate.<br>- `safetyRatings` (array, nullable): Safety ratings for the content. |
| promptFeedback | object | Feedback information about the prompt. Contains:<br><br>- `safetyRatings` (array, nullable): Safety ratings for the prompt. |
| usageMetadata | object | Token usage information. Contains:<br><br>- `promptTokenCount` (integer): Number of tokens in the prompt.<br>- `candidatesTokenCount` (integer): Number of tokens in the generated content.<br>- `totalTokenCount` (integer): Total number of tokens used.<br>- `promptTokensDetails` (array): Details about prompt tokens by modality.<br>- `candidatesTokensDetails` (array): Details about candidate tokens by modality. |
| modelVersion | string | The version of the model used for generation. |
| responseId | string | Unique identifier for the response. |

#### Example Response

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/jpeg",
              "data": "BASE64_FILE"
            }
          }
        ],
        "role": "model"
      },
      "finishReason": "STOP",
      "index": 0
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 19,
    "candidatesTokenCount": 1557,
    "totalTokenCount": 1576,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 19
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1120
      }
    ],
    "serviceTier": "standard"
  },
  "modelVersion": "gemini-3.1-flash-lite-image",
  "responseId": "WP1EaqzFNrnVjMcPxdaK0A4"
}
```

**Request Example (Text-to-Image)**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1beta/models/gemini-3.1-flash-lite-image:generateContent' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "contents": [
    {
      "parts": [
        {
          "text": "Generate two images in different styles: a futuristic banana with neon lights in a cyberpunk city"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": [
      "TEXT",
      "IMAGE"
    ],
    "imageConfig": {
      "aspectRatio": "9:16",
      "imageSize": "1K"
    }
  },
  "return_base64": true
}'
```

**Response Example**

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/jpeg",
              "data": "BASE64_FILE"
            }
          }
        ],
        "role": "model"
      },
      "finishReason": "STOP",
      "index": 0
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 19,
    "candidatesTokenCount": 1557,
    "totalTokenCount": 1576,
    "promptTokensDetails": [
      {
        "modality": "TEXT",
        "tokenCount": 19
      }
    ],
    "candidatesTokensDetails": [
      {
        "modality": "IMAGE",
        "tokenCount": 1120
      }
    ],
    "serviceTier": "standard"
  },
  "modelVersion": "gemini-3.1-flash-lite-image",
  "responseId": "WP1EaqzFNrnVjMcPxdaK0A4"
}
```

---

## Google / Veo / Veo-3.1-generate-preview `POST`

_Official Format_

### Veo-3.1-generate-preview

Google's latest Veo 3.1 video generation model. Generate high-quality videos with synchronized speech/sound effects from a text prompt or reference image

`POST https://api.cloudwise.ai/api/v1beta/models/veo-3.1-generate-preview:predictLongRunning`

### Overview

This endpoint provides video generation functionality using the Veo-3.1-generate-preview model.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| instances | array | - | required<br>An array of instance objects. Each instance contains:<br><br>- `prompt` (string): Text prompt describing the video to generate.<br>- `image` (object, optional): For image-to-video, contains:<br>- `bytesBase64Encoded` (string): Base64-encoded image data, OR<br>- `gcsUri` (string): Google Cloud Storage URI, OR<br>- `mimeType` (string): MIME type of the image.<br>- `video` (object, optional): For video extension, contains:<br>- `bytesBase64Encoded` (string): Base64-encoded video data, OR<br>- `gcsUri` (string): Google Cloud Storage URI, OR<br>- `mimeType` (string): MIME type of the video.<br>- `lastFrame` (object, optional): Last frame of the video.<br>- `mask` (object, optional): Mask for video editing.<br>- `referenceImages` (array, optional): Up to three reference images for style guidance. |
| parameters | object | - | Optional<br>Configuration parameters for video generation. Contains:<br><br>- `durationSeconds` (integer): Duration of the generated video in seconds.<br>- `aspectRatio` (string): Aspect ratio of the video.<br>- `resolution` (string): Resolution of the video (Veo 3 models only).<br>- `generateAudio` (boolean): Whether to generate audio.<br>- `negativePrompt` (string): Negative prompt to avoid certain elements.<br>- `sampleCount` (integer): Number of samples to generate.<br>- `seed` (uint32): Random seed for reproducibility.<br>- `storageUri` (string): Storage URI for output. |

### Request Example

Text-to-Video

Image-to-Video

Video-Extension

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/veo-3.1-generate-preview:predictLongRunning' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
   "instances": [
      {
         "prompt": "A cat playing piano"
      }
   ],
   "parameters": {
      "durationSeconds": 8
   }
}'
```

### Response

The response contains the task descriptor that you can poll for completion.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier for the task. |
| object | string | Object type, always "task". |
| status | string | Current status of the task (e.g., "submitted", "processing", "completed"). |
| task_type | string | Type of the task, typically "video_generation". |
| model | string | The model used for the task. |
| created | integer | Unix timestamp of when the task was created. |
| expires_at | integer | Unix timestamp of when the task expires. |

#### Example Response

```json
{
  "expires_at": 1767173320,
  "created": 1767086920,
  "model": "veo-3.1-generate-preview",
  "id": "MT***********************==",
  "task_type": "video_generation",
  "object": "task",
  "status": "submitted"
}
```

**Request Example (Text-to-Video)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/veo-3.1-generate-preview:predictLongRunning' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
   "instances": [
      {
         "prompt": "A cat playing piano"
      }
   ],
   "parameters": {
      "durationSeconds": 8
   }
}'
```

**Request Example (Image-to-Video)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/veo-3.1-generate-preview:predictLongRunning' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
   "instances": [
      {
         "prompt": "A cat playing piano",
         "image": {        
           // Union field can be only one of the following:        
           "bytesBase64Encoded": string,                    
           "gcsUri": string,        
           // End of list of possible types for union field.        
         "mimeType": string      
         }
      }
   ],
   "parameters": {
      "durationSeconds": 8
   }
   
}'
```

**Request Example (Video-Extension)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/veo-3.1-generate-preview:predictLongRunning' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
   "instances": [
      {
         "prompt": "extend this video",
         "video": {        
           // Union field can be only one of the following:        
           "bytesBase64Encoded": string,                    
           "gcsUri": string,        
           // End of list of possible types for union field.        
         "mimeType": string      
         }
      }
   ],
   "parameters": {
      "durationSeconds": 8
   }
}'
```

**Response Example**

```json
{
  "expires_at": 1767173320,
  "created": 1767086920,
  "model": "veo-3.1-generate-preview",
  "id": "MT***********************==",
  "task_type": "video_generation",
  "object": "task",
  "status": "submitted"
}
```

---

## Google / Veo / Veo-3.1-fast-generate-preview `POST`

_Official Format_

### Veo-3.1-fast-generate-preview

Google's latest Veo 3.1 video generation model. Generate videos with synchronized speech/sound effects from a text prompt or reference image faster

`POST https://api.cloudwise.ai/api/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning`

### Overview

This endpoint provides video generation functionality using the Veo-3.1-fast-generate-preview model.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| instances | array | - | required<br>An array of instance objects. Each instance contains:<br><br>- `prompt` (string): Text prompt describing the video to generate.<br>- `image` (object, optional): For image-to-video, contains:<br>- `bytesBase64Encoded` (string): Base64-encoded image data, OR<br>- `gcsUri` (string): Google Cloud Storage URI, OR<br>- `mimeType` (string): MIME type of the image.<br>- `video` (object, optional): For video extension, contains:<br>- `bytesBase64Encoded` (string): Base64-encoded video data, OR<br>- `gcsUri` (string): Google Cloud Storage URI, OR<br>- `mimeType` (string): MIME type of the video.<br>- `lastFrame` (object, optional): Last frame of the video.<br>- `mask` (object, optional): Mask for video editing.<br>- `referenceImages` (array, optional): Up to three reference images for style guidance. |
| parameters | object | - | Optional<br>Configuration parameters for video generation. Contains:<br><br>- `durationSeconds` (integer): Duration of the generated video in seconds.<br>- `aspectRatio` (string): Aspect ratio of the video.<br>- `resolution` (string): Resolution of the video (Veo 3 models only).<br>- `generateAudio` (boolean): Whether to generate audio.<br>- `negativePrompt` (string): Negative prompt to avoid certain elements.<br>- `sampleCount` (integer): Number of samples to generate.<br>- `seed` (uint32): Random seed for reproducibility.<br>- `storageUri` (string): Storage URI for output. |

### Request Example

Text-to-Video

Image-to-Video

Video-Extension

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
   "instances": [
      {
         "prompt": "A cat playing piano"
      }
   ],
   "parameters": {
      "durationSeconds": 8
   }
}'
```

### Response

The response contains the task descriptor that you can poll for completion.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier for the task. |
| object | string | Object type, always "task". |
| status | string | Current status of the task (e.g., "submitted", "processing", "completed"). |
| task_type | string | Type of the task, typically "video_generation". |
| model | string | The model used for the task. |
| created | integer | Unix timestamp of when the task was created. |
| expires_at | integer | Unix timestamp of when the task expires. |

#### Example Response

```json
{
  "expires_at": 1767173320,
  "created": 1767086920,
  "model": "veo-3.1-fast-generate-preview",
  "id": "MT***********************==",
  "task_type": "video_generation",
  "object": "task",
  "status": "submitted"
}
```

**Request Example (Text-to-Video)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
   "instances": [
      {
         "prompt": "A cat playing piano"
      }
   ],
   "parameters": {
      "durationSeconds": 8
   }
}'
```

**Request Example (Image-to-Video)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
   "instances": [
      {
         "prompt": "A cat playing piano",
         "image": {        
           // Union field can be only one of the following:        
           "bytesBase64Encoded": string,                    
           "gcsUri": string,        
           // End of list of possible types for union field.        
         "mimeType": string      
         }
      }
   ],
   "parameters": {
      "durationSeconds": 8
   }
   
}'
```

**Request Example (Video-Extension)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
   "instances": [
      {
         "prompt": "extend this video",
         "video": {        
           // Union field can be only one of the following:        
           "bytesBase64Encoded": string,                    
           "gcsUri": string,        
           // End of list of possible types for union field.        
         "mimeType": string      
         }
      }
   ],
   "parameters": {
      "durationSeconds": 8
   }
}'
```

**Response Example**

```json
{
  "expires_at": 1767173320,
  "created": 1767086920,
  "model": "veo-3.1-fast-generate-preview",
  "id": "MT***********************==",
  "task_type": "video_generation",
  "object": "task",
  "status": "submitted"
}
```

---

## Google / Veo / Retrieve video `GET`

_Official Format_

### Retrieve video

Google AI platform providing access to Gemini models and Google AI services.

`GET https://api.cloudwise.ai/api/v1beta/tasks/{task_id}`

### Overview

Query task status and retrieve results.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer YOUR_API_KEY" | required<br>Your API key in the format: `Bearer YOUR_API_KEY` |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string (path) | - | required<br>Append the task ID to the endpoint path. |

### Request Example

```bash
curl -X GET 'https://api.cloudwise.ai/api/v1beta/tasks/MT*********==' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

### Response

The response contains task status and results.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| code | string | Response code |
| success | boolean | Whether the request was successful |
| taskStatus | string | Status of the task (e.g., "COMPLETED") |
| data | object | Response data object |
| data.result_url | string | URL of the generated video result |
| data.id | string | Task ID |
| data.status | string | Status of the task (e.g., "completed") |
| data.progress | string | Progress of the task (e.g., "100%") |
| data.properties.model | string | The model used for generating the video |

#### Example Response

```json
{
  "code": "10000",
  "data": {
    "result_url": "https://download.cloudwise.ai/arts/14*****40",
    "submit_time": 1767086920,
    "created": 1767086920,
    "finish_time": 1767086983,
    "start_time": 1767086950,
    "action": "video_generation",
    "progress": "100%",
    "id": "MT*********==",
    "task_type": "video_generation",
    "channel_id": 2853,
    "properties": {
      "input": "{\"instances\":[{\"prompt\":\"A cat playing piano\"}],\"parameters\":{\"durationSeconds\":8}}",
      "model": "veo-3.1-fast-generate-preview",
      "ratios": {
        "billing_type": 2,
        "group_ratio": 1,
        "token_group": "",
        "topup_convert_ratio": 1,
        "user_discount": 1,
        "user_group": "vip"
      }
    },
    "object": "task",
    "status": "completed"
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

**Request Example**

```bash
curl -X GET 'https://api.cloudwise.ai/api/v1beta/tasks/MT*********==' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

**Response Example**

```json
{
  "code": "10000",
  "data": {
    "result_url": "https://download.cloudwise.ai/arts/14*****40",
    "submit_time": 1767086920,
    "created": 1767086920,
    "finish_time": 1767086983,
    "start_time": 1767086950,
    "action": "video_generation",
    "progress": "100%",
    "id": "MT*********==",
    "task_type": "video_generation",
    "channel_id": 2853,
    "properties": {
      "input": "{\"instances\":[{\"prompt\":\"A cat playing piano\"}],\"parameters\":{\"durationSeconds\":8}}",
      "model": "veo-3.1-fast-generate-preview",
      "ratios": {
        "billing_type": 2,
        "group_ratio": 1,
        "token_group": "",
        "topup_convert_ratio": 1,
        "user_discount": 1,
        "user_group": "vip"
      }
    },
    "object": "task",
    "status": "completed"
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

---

## Google / Gemini Omni / gemini-omni-flash-preview `POST`

_Official Format_

### gemini-omni-flash-preview

Generate and edit 720p video with native audio through the Interactions API.

`POST https://api.cloudwise.ai/api/v1beta/interactions`

### Overview

`gemini-omni-flash-preview` supports text-to-video generation, prompt-based video editing, and multi-turn video editing through the Interactions API. Requests can run synchronously or in the background. Audio is generated with the output video.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer $YOUR_API_KEY" | required<br>Your Cloudwise API key in Bearer-token format. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Model ID. Use `gemini-omni-flash-preview`. |
| input | array | - | required<br>Ordered input content. This Cloudwise endpoint requires an array. For a first turn, pass content blocks; for multi-turn editing, pass the previous `steps` followed by a new `user_input` step. |
| input[].type | string | - | required<br>For direct content, use `text`, `image`, or `video`. A new multi-turn step uses `user_input`; previous response steps are sent unchanged. |
| input[].text | string | - | Optional<br>Prompt text. Required for a direct `text` content block. |
| input[].data | string | - | Optional<br>Base64-encoded image or video content. Use either data or uri for media. |
| input[].uri | string | - | Optional<br>URI of image or video content. Use either uri or data for media. |
| input[].mime_type | string | - | Optional<br>Media MIME type, such as `image/png`, `image/jpeg`, or `video/mp4`. |
| input[].content | array | - | Optional<br>Content blocks inside an interaction step. Use this structure when sending previous `steps` plus a new `user_input` step for multi-turn editing. |
| generation_config | object | - | Optional<br>Optional generation settings. |
| generation_config.video_config | object | - | Optional<br>Optional video-generation settings. |
| generation_config.video_config.task | string | Auto-detected | Optional<br>Optional task override. This model supports `text_to_video` and `edit`. The Interactions API defines additional task values, but they are not supported by this model. When omitted, the model determines the task from the input. |
| response_format | object | - | Optional<br>Optional video output settings. |
| response_format.type | string | - | Optional<br>Must be `video` when `response_format` is supplied. |
| response_format.aspect_ratio | string | - | Optional<br>Output aspect ratio: `16:9` or `9:16`. |
| response_format.duration | string | - | Optional<br>Output duration from `3s` through `10s`. |
| response_format.resolution | string | 720p | Optional<br>Output resolution. `gemini-omni-flash-preview` supports `720p`. |
| response_format.delivery | string | - | Optional<br>Output delivery mode: `inline` or `uri`. Inline delivery returns base64 video data in the model output step. URI delivery returns a video URI. |
| response_format.gcs_uri | string | - | Optional<br>Google Cloud Storage destination. Required by Google Vertex when `delivery` is `uri`. |
| background | boolean | false | Optional<br>Set to `true` to run generation asynchronously, then retrieve the interaction by its `id`. |

### Media and Model Limits

This preview model outputs `720p` video with native audio. Supported aspect ratios are `16:9` and `9:16`, and supported durations are `3s` through `10s`.

Text-to-video accepts text input. Video editing accepts a source video and can include image references; media can use base64 `data` or a supported `uri`. Source videos used for editing must be under 10 seconds.

Starting-image generation, reference-guided generation without a source video, first-and-last-frame generation, scene extension, and resolutions above `720p` are not supported by `gemini-omni-flash-preview`. Do not use `image_to_video`, `reference_to_video`, or `extend` with this model.

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/interactions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "model": "gemini-omni-flash-preview",
  "input": [
    {
      "type": "text",
      "text": "A cinematic drone shot over misty mountains at sunrise."
    }
  ]
}'
```

### Response

Locate the generated video in the `content` array of the `model_output` step. The video contains `data` for inline delivery or `uri` for URI delivery. For multi-turn editing, append a new `user_input` step to the previous response's `steps` and send the resulting array as `input`.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique interaction ID. |
| status | string | Interaction status, including `queued`, `in_progress`, `requires_action`, `completed`, `failed`, `cancelled`, `incomplete`, or `budget_exceeded`. |
| model | string | Model that processed the request. |
| created | string | Creation time in ISO 8601 format. |
| updated | string | Last update time in ISO 8601 format. |
| steps | array | Ordered interaction history, including user_input and model_output steps. |
| steps[].content | array | Content emitted by a step. Generated video is in a model_output step. |
| steps[].content[].type | string | Content type. Generated video content uses video. |
| steps[].content[].data | string | Base64-encoded video when inline delivery is used. |
| steps[].content[].uri | string | Generated video URI when URI delivery is used. |
| steps[].content[].mime_type | string | MIME type of the generated media, typically video/mp4. |
| errors | array | Diagnostic errors recorded when the interaction does not complete successfully. |

#### Example Response

```json
{
  "id": "interaction_example_id",
  "model": "gemini-omni-flash-preview",
  "status": "completed",
  "steps": [
    {
      "type": "user_input",
      "content": [
        {
          "type": "text",
          "text": "A cinematic drone shot over misty mountains at sunrise."
        }
      ]
    },
    {
      "type": "model_output",
      "content": [
        {
          "type": "video",
          "mime_type": "video/mp4",
          "data": "BASE64_GENERATED_VIDEO"
        }
      ]
    }
  ]
}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1beta/interactions' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
  "model": "gemini-omni-flash-preview",
  "input": [
    {
      "type": "text",
      "text": "A cinematic drone shot over misty mountains at sunrise."
    }
  ]
}'
```

**Response Example**

```json
{
  "id": "interaction_example_id",
  "model": "gemini-omni-flash-preview",
  "status": "completed",
  "steps": [
    {
      "type": "user_input",
      "content": [
        {
          "type": "text",
          "text": "A cinematic drone shot over misty mountains at sunrise."
        }
      ]
    },
    {
      "type": "model_output",
      "content": [
        {
          "type": "video",
          "mime_type": "video/mp4",
          "data": "BASE64_GENERATED_VIDEO"
        }
      ]
    }
  ]
}
```

---

## Kling / kling-image / kling-image `POST`

_Official Format_

### kling-image

The Kling Omni-Image API supports multi-subject composition, reference image fusion, and high-resolution image creation. It provides two core models, `kling-image-o1` and `kling-v3-omni`, for advanced image generation workflows.

`POST https://api.cloudwise.ai/api/v1/images/omni-image`

### Supported Models

| Model Name |
| --- |
| `kling-image-o1` |
| `kling-v3-omni` |

### Overview

The Omni-Image API is Kling's comprehensive image generation endpoint. `kling-image-o1` provides stronger logical understanding for complex prompts and spatial relationships, while `kling-v3-omni` focuses on visual aesthetics and flexible multi-subject fusion. You can reference uploaded images or subject library IDs directly in the prompt using formats such as `<<<image_n>>>` and `<<<object_n>>>`.

### Headers

This endpoint requires standard JSON content type and Bearer token authentication.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Content-Type | string | - | required<br>Must be set to `application/json`. |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model_name | string | kling-image-o1 | Model option: `kling-image-o1` or `kling-v3-omni`. |
| prompt | string | - | required<br>Text prompt. Maximum length: 2500 characters. |
| resolution | string | 1k | Output resolution. Valid values: `1k`, `2k`, `4k`. |
| aspect_ratio | string | auto | Aspect ratio. Supports `16:9`, `9:16`, `1:1`, `4:3`, and more. |
| image_list | array | - | Reference image list. Supports URL or Base64. Each file must be smaller than 10MB. |
| element_list | array | - | Subject ID list used to lock specific characters from the element library. |
| result_type | string | - | `single` for single-image mode or `series` for related image series mode. |
| n | integer | - | Effective only in `single` mode. Generates 1-9 images. |
| series_amount | integer | - | Effective only in `series` mode. Generates 2-9 related images. |

### Request Example

kling-image-o1

kling-v3-omni

```bash
curl --request POST     --url https://api.cloudwise.ai/api/v1/images/omni-image     --header 'Authorization: Bearer $YOUR_API_KEY' \
    --header 'Content-Type: application/json' \
    --data '{
        "model_name": "kling-image-o1",
        "prompt": "Merge all people from the input images into <<<object_1>>>",
        "element_list": [
                { "element_id": 829836802793406551 }
        ],
        "image_list": [
                { "image": "https://example.com/ref_1.png" },
                { "image": "https://example.com/ref_2.png" }
        ],
        "resolution": "2k",
        "aspect_ratio": "3:2"
    }'
```

### Response

This endpoint returns asynchronous task information, including the task ID and task status.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| request_id | string | Unique tracking ID for this request. |
| data.task_id | string | Task ID used to query progress and final results asynchronously. |
| data.task_status | string | Task status. Possible values: `submitted`, `processing`, `succeed`, `failed`. |

#### Example Response

```json
{
    "code": 0,
    "message": "success",
    "request_id": "req_20260316_omni",
    "data": {
        "task_id": "kl_img_123456789",
        "task_status": "submitted",
        "created_at": 1722769557708
    }
}
```

**Request Example**

```bash
curl --request POST     --url https://api.cloudwise.ai/api/v1/images/omni-image     --header 'Authorization: Bearer $YOUR_API_KEY' \
    --header 'Content-Type: application/json' \
    --data '{
        "model_name": "kling-image-o1",
        "prompt": "Merge all people from the input images into <<<object_1>>>",
        "element_list": [
                { "element_id": 829836802793406551 }
        ],
        "image_list": [
                { "image": "https://example.com/ref_1.png" },
                { "image": "https://example.com/ref_2.png" }
        ],
        "resolution": "2k",
        "aspect_ratio": "3:2"
    }'
```

**Response Example**

```json
{
    "code": 0,
    "message": "success",
    "request_id": "req_20260316_omni",
    "data": {
        "task_id": "kl_img_123456789",
        "task_status": "submitted",
        "created_at": 1722769557708
    }
}
```

---

## Kling / kling-image / query a task `GET`

_Official Format_

### query a task

Use this endpoint to query asynchronous Omni-image generation results by `task_id` (path) or `external_task_id` (query).

`GET https://api.cloudwise.ai/api/v1/images/omni-image/{id}`

### Supported Models

| Model Name |
| --- |
| `kling-image-o1` |
| `kling-v3-omni` |

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Use JSON content type for consistency. |

### Path Parameter

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string | - | required<br>System task ID from create request. Fill in the path, for example: `/omni-image/kl_12345`. |

### Query Parameter (Alternative)

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| external_task_id | string | - | Custom task ID provided at creation time. Use as an alternative to `task_id`. |

### Request Example

```bash
curl --request GET \
    --url https://api.cloudwise.ai/api/v1/images/omni-image/{id} \
    --header 'Authorization: Bearer $YOUR_API_KEY' \
    --header 'Content-Type: application/json'
```

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| data.task_status | string | Status enum: `submitted`, `processing`, `succeed`, `failed`. |
| data.task_result.images[] | array | Generated image list for `single` mode. |
| data.task_result.series_images[] | array | Generated image list for `series` mode. |
| data.task_status_msg | string | Failure reason when task status is `failed`. |
| data.final_unit_deduction | string | Final unit deduction for this task. |

#### Example Response

```json
{
    "code": 0,
    "message": "string",
    "request_id": "string",
    "data": {
        "task_id": "string",
        "task_status": "succeed",
        "task_status_msg": "",
        "task_info": {
            "external_task_id": "string"
        },
        "task_result": {
            "result_type": "single",
            "images": [
                {
                    "index": 0,
                    "url": "https://download.example.com/image.png",
                    "watermark_url": "https://download.example.com/image-watermark.png"
                }
            ],
            "series_images": []
        },
        "watermark_info": {
            "enabled": true
        },
        "final_unit_deduction": "1",
        "created_at": 1722769557708,
        "updated_at": 1722769557708
    }
}
```

**Request Example**

```bash
curl --request GET \
    --url https://api.cloudwise.ai/api/v1/images/omni-image/{id} \
    --header 'Authorization: Bearer $YOUR_API_KEY' \
    --header 'Content-Type: application/json'
```

**Response Example**

```json
{
    "code": 0,
    "message": "string",
    "request_id": "string",
    "data": {
        "task_id": "string",
        "task_status": "succeed",
        "task_status_msg": "",
        "task_info": {
            "external_task_id": "string"
        },
        "task_result": {
            "result_type": "single",
            "images": [
                {
                    "index": 0,
                    "url": "https://download.example.com/image.png",
                    "watermark_url": "https://download.example.com/image-watermark.png"
                }
            ],
            "series_images": []
        },
        "watermark_info": {
            "enabled": true
        },
        "final_unit_deduction": "1",
        "created_at": 1722769557708,
        "updated_at": 1722769557708
    }
}
```

---

## Kling / kling-video / kling-video `POST`

_Official Format_

### kling-vedio

The Kling Omni-Video API supports text, image, video, and subject-ID driven workflows for video generation, editing, continuation, and multi-shot storytelling.

`POST https://api.cloudwise.ai/api/v1/videos/omni-video`

### Supported Models

| Model Name |
| --- |
| `kling-video-o1` |
| `kling-v3-omni` |

### Overview

The Omni-Video endpoint provides a unified interface for single-shot generation, image-to-video, instruction-based editing, video continuation, and multi-shot composition. `kling-video-o1` focuses on precise logical control, while `kling-v3-omni` emphasizes aesthetics and multi-shot narrative consistency.

### Core Model Differences

| Feature | kling-video-o1 | kling-v3-omni |
| --- | --- | --- |
| Core strength | Extreme logical precision for spatial transforms, object edits, and motion instructions. | Strong visual aesthetics and multi-shot storytelling with better narrative consistency. |
| Multi-shot mode | Not supported | Supported, up to 6 shots |
| First/last frame with subject references | Not supported | Supported |
| Subject introduction | Limited | Supported, up to 3 subjects |

### Key Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| model_name | string | Supported values: `kling-video-o1` and `kling-v3-omni`. |
| multi_shot | boolean | Enables multi-shot mode. When `true`, `prompt` is ignored and `multi_prompt` must be provided. |
| shot_type | string | Supported values: `customize` and `intelligence`. |
| image_list | array | Supports reference images and first/last frame inputs. |
| element_list | array | Subject ID list. `kling-v3-omni` supports up to 3 subjects. |
| video_list | array | `refer_type: base` for editing and `refer_type: feature` for style or camera-motion reference. |
| sound | string | Supported values: `on` and `off`. With a reference video, only `off` is allowed. |

### Request Example

O1 Text-to-Video

O1 Image-to-Video

O1 Editing

O1 Image/Subject Ref

O1 Video Ref

O1 Continuation

O1 First/Last

V3 Multi-Shot I2V

V3 Multi-Shot T2V

```bash
curl --location 'https://api.cloudwise.ai/api/v1/videos/omni-video' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-video-o1",
    "prompt": "A person dancing.",
    "aspect_ratio": "1:1"
}'
```

### Response

This endpoint returns asynchronous task information including the task ID and task status.

```json
{
    "code": 0,
    "message": "success",
    "data": {
        "task_id": "kl_vid_123456789",
        "task_status": "submitted",
        "created_at": 1722769557708
    }
}
```

**Request Example (O1 Text-to-Video)**

```bash
curl --location 'https://api.cloudwise.ai/api/v1/videos/omni-video' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-video-o1",
    "prompt": "A person dancing.",
    "aspect_ratio": "1:1"
}'
```

**Request Example (O1 Image-to-Video)**

```bash
curl --request POST \
    --url https://api.cloudwise.ai/api/v1/videos/omni-video \
    --header 'Authorization: Bearer $YOUR_API_KEY' \
    --header 'Content-Type: application/json' \
    --data '{
        "model_name": "kling-video-o1",
        "prompt": "Make the person in <<<image_1>>> wave at the camera.",
        "image_list": [
            {
                "image_url": "https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-qa-test/multi-1.png"
            }
        ],
        "duration": "5",
        "mode": "pro",
        "aspect_ratio": "16:9",
        "callback_url": "",
        "external_task_id": "custom_task_001"
    }'
```

**Request Example (O1 Editing)**

```bash
curl --location 'https://api.cloudwise.ai/api/v1/videos/omni-video' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-video-o1",
    "prompt": "Put the crown from <<<image_1>>> onto the girl in blue clothes inside <<<video_1>>>.",
    "image_list": [
        { "image_url": "xxx" }
    ],
    "video_list": [
        {
            "video_url": "xxxxxxxx",
            "refer_type": "base",
            "keep_original_sound": "yes"
        }
    ],
    "mode": "pro"
}'
```

**Request Example (O1 Image/Subject Ref)**

```bash
curl --location 'https://api.cloudwise.ai/api/v1/videos/omni-video' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-video-o1",
    "prompt": "<<<image_1>>> walks through the streets of Tokyo, meets <<<element_1>>> and <<<element_2>>>, then jumps into <<<element_2>>>'s arms. The video style should match <<<image_2>>>.",
    "image_list": [
        { "image_url": "xxxxx" },
        { "image_url": "xxxxx" }
    ],
    "element_list": [
        { "element_id": 829836802793406551 },
        { "element_id": 829836802793406552 }
    ],
    "mode": "pro",
    "aspect_ratio": "1:1",
    "duration": "7"
}'
```

**Request Example (O1 Video Ref)**

```bash
curl --location 'https://api.cloudwise.ai/api/v1/videos/omni-video' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-video-o1",
    "prompt": "Follow the camera movement style of <<<video_1>>> and generate a scene where <<<element_1>>> and <<<element_2>>> walk through Tokyo and encounter <<<image_1>>>.",
    "image_list": [{ "image_url": "xxx" }],
    "element_list": [
        { "element_id": 829836802793406551 },
        { "element_id": 829836802793406552 }
    ],
    "video_list": [
        {
            "video_url": "xxxxxxxx",
            "refer_type": "feature",
            "keep_original_sound": "yes"
        }
    ],
    "mode": "pro",
    "aspect_ratio": "1:1",
    "duration": "7"
}'
```

**Request Example (O1 Continuation)**

```bash
curl --location 'https://api.cloudwise.ai/api/v1/videos/omni-video' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-video-o1",
    "prompt": "Generate the next shot based on <<<video_1>>>.",
    "video_list": [
        {
            "video_url": "xxxxxxxx",
            "refer_type": "feature",
            "keep_original_sound": "yes"
        }
    ],
    "mode": "pro"
}'
```

**Request Example (O1 First/Last)**

```bash
curl --location 'https://api.cloudwise.ai/api/v1/videos/omni-video' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-video-o1",
    "prompt": "A person in the video is dancing.",
    "image_list": [
        { "image_url": "xxx", "type": "first_frame" },
        { "image_url": "xxx", "type": "end_frame" }
    ],
    "mode": "pro"
}'
```

**Request Example (V3 Multi-Shot I2V)**

```bash
curl --location 'https://api.cloudwise.ai/api/v1/videos/omni-video' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data '{
    "model_name": "kling-v3-omni",
    "prompt": "A cinematic multi-shot video including a park scene and a rainy street.",
    "multi_shot": true,
    "shot_type": "customize",
    "multi_prompt": [
        {
            "index": 1,
            "prompt": "<<<image_1>>> A person sitting on a park bench, with sunlight filtering through the trees.",
            "duration": "2"
        },
        {
            "index": 2,
            "prompt": "A car speeding down a rainy street with glowing headlights.",
            "duration": "3"
        }
    ],
    "image_list": [
        { "image_url": "xx" },
        { "image_url": "xxx" }
    ],
    "mode": "pro",
    "sound": "on",
    "aspect_ratio": "16:9",
    "duration": "5"
}'
```

**Request Example (V3 Multi-Shot T2V)**

```bash
curl --location 'https://api.cloudwise.ai/api/v1/videos/omni-video' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json; charset=utf-8' \
--data '{
    "model_name": "kling-v3-omni",
	"prompt": "A cinematic multi-scene video.",
    "multi_shot": true,
    "shot_type": "customize",
    "multi_prompt": [
        { "index": 1, "prompt": "Two friends talking under a streetlight.", "duration": "2" },
        { "index": 2, "prompt": "A runner sprinting through a forest.", "duration": "3" },
        { "index": 3, "prompt": "A woman hugging a cat and smiling.", "duration": "3" },
        { "index": 4, "prompt": "A door creaking open into a shadowy hallway.", "duration": "3" },
        { "index": 5, "prompt": "A man slipping on a banana peel.", "duration": "3" },
        { "index": 6, "prompt": "A sunset over the mountains.", "duration": "1" }
    ],
    "sound": "on",
    "mode": "pro",
    "aspect_ratio": "16:9",
    "duration": "15"
}'
```

**Response Example**

```json
{
    "code": 0,
    "message": "success",
    "data": {
        "task_id": "kl_vid_123456789",
        "task_status": "submitted",
        "created_at": 1722769557708
    }
}
```

---

## Kling / kling-video / query a task `GET`

_Official Format_

### query a task

Retrieve the latest status and output of a single Omni-vedio task by `task_id` in the path, or by `external_task_id` as an alternative query key.

`GET https://api.cloudwise.ai/api/v1/videos/omni-video/{id}`

### Supported Models

| Model Name |
| --- |
| `kling-video-o1` |
| `kling-v3-omni` |

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Use JSON content type for consistency. |

### Path / Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string | - | required<br>Unique system task ID returned by the create request. |
| external_task_id | string | - | Client-defined custom task ID set during creation. Can be used as an alternative query key. |

### Request Example

```bash
curl --request GET \
  --url https://api.cloudwise.ai/api/v1/videos/omni-video/{task_id} \
    --header 'Authorization: Bearer $YOUR_API_KEY' \
    --header 'Content-Type: application/json'
```

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| data.task_status | string | Status enum: `submitted`, `processing`, `succeed`, `failed`. |
| data.task_result.videos[] | array | Generated video result list. |
| data.task_result.videos[].url | string | Generated video URL (signed anti-leech link, valid for 30 days). |
| data.task_result.videos[].duration | string | Final video duration in seconds. |
| data.task_status_msg | string | Failure reason when task status is `failed`. |
| data.final_unit_deduction | string | Final credits deducted for this task. |

#### Example Response

```json
{
    "code": 0,
    "message": "string",
    "request_id": "string",
    "data": {
        "task_id": "string",
        "task_status": "succeed",
        "task_status_msg": "",
        "task_info": {
            "external_task_id": "string"
        },
        "task_result": {
            "videos": [
                {
                    "id": "string",
                    "url": "https://download.example.com/video.mp4",
                    "duration": "5"
                }
            ]
        },
        "final_unit_deduction": "1",
        "created_at": 1722769557708,
        "updated_at": 1722769557708
    }
}
```

**Request Example**

```bash
curl --request GET \
  --url https://api.cloudwise.ai/api/v1/videos/omni-video/{task_id} \
    --header 'Authorization: Bearer $YOUR_API_KEY' \
    --header 'Content-Type: application/json'
```

**Response Example**

```json
{
    "code": 0,
    "message": "string",
    "request_id": "string",
    "data": {
        "task_id": "string",
        "task_status": "succeed",
        "task_status_msg": "",
        "task_info": {
            "external_task_id": "string"
        },
        "task_result": {
            "videos": [
                {
                    "id": "string",
                    "url": "https://download.example.com/video.mp4",
                    "duration": "5"
                }
            ]
        },
        "final_unit_deduction": "1",
        "created_at": 1722769557708,
        "updated_at": 1722769557708
    }
}
```

---

## Moonshot / Kimi-k3 `POST`

_Official Format_

### Kimi-k3

Kimi K3 is Moonshot AI's flagship model for long-horizon coding and end-to-end knowledge work, with a 1M-token (1,048,576) context window and industry-leading intelligence. It always reasons and emits its chain-of-thought via the reasoning_content field, and supports configuring the reasoning level with the top-level reasoning_effort request field. This endpoint also supports kimi-k2.7-code (Moonshot's most capable coding model) and kimi-k2.5 (a multimodal model offering both thinking and non-thinking modes).

`POST https://api.cloudwise.ai/api/v1/chat/completions`

### Supported Models

| Model Name |
| --- |
| `kimi-k3` |
| `kimi-k2.7-code` |
| `kimi-k2.5` |

### Overview

This endpoint provides chat completion functionality for the Moonshot Kimi models. It supports `kimi-k3` (the default flagship model with a 1M-token context window; thinking is always enabled and its intensity can be tuned via `reasoning_effort`), `kimi-k2.7-code` (a coding-focused model with thinking always enabled, controlled via the `thinking` field), and `kimi-k2.5` (a multimodal model supporting both thinking and non-thinking modes). All models can emit their chain-of-thought via the `reasoning_content` field alongside the final `content`, making the reasoning process transparent.

### Headers

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | kimi-k3 | required<br>Model ID. Supported values: `kimi-k3` (flagship, thinking always on with configurable `reasoning_effort`), `kimi-k2.7-code` (coding-focused, thinking always on; also available as `kimi-k2.7-code-highspeed`, the same model with ~180 tokens/s output), and `kimi-k2.5` (multimodal, supports both thinking and non-thinking modes). |
| messages | array | - | required<br>Conversation array. Each element contains `role` (`system`, `user`, `assistant`, or `tool`) and `content` (string or array for multimodal input). **kimi-k3 only:** a dynamic tool message `{"role": "system", "tools": [...]}` (without `content`) may be inserted at any position to load tools that only affect subsequent turns. |
| max_completion_tokens | integer | - | Maximum number of tokens to generate. Defaults vary by model — for `kimi-k3` the default is `131072` and the maximum is `1048576`. If the limit is reached before completion, `finish_reason` is `length`; otherwise `stop`. |
| max_tokens | integer | - | **Deprecated.** Use `max_completion_tokens` instead. |
| reasoning_effort | string | max | **kimi-k3 only.** Reasoning level: `low`, `high`, or `max` (default). Kimi K3 always thinks with Preserved Thinking enabled; this field only tunes the thinking intensity and cannot disable it. |
| thinking | object | {"type": "enabled", "keep": "all"} | **kimi-k2.7-code / kimi-k2.5 only** (not accepted by `kimi-k3`, which uses `reasoning_effort`). For `kimi-k2.7-code`, `type` only accepts `"enabled"` and `keep` only accepts `"all"` (thinking and Preserved Thinking always on). For `kimi-k2.5`, `type` may be `"enabled"` or `"disabled"` to switch between thinking and non-thinking modes. |
| response_format | object | {"type": "text"} | Output format constraint. `{"type": "json_object"}` enables JSON mode; `{"type": "json_schema"}` enables Structured Output constrained by a JSON Schema (recommended, used together with the `json_schema` field). |
| stop | string \\| array | - | Stop sequences. Output halts on an exact match (the matched text is not emitted). Up to 5 strings, each no longer than 32 bytes. |
| stream | boolean | false | Set `true` to enable SSE streaming output ending with `data: [DONE]`. |
| stream_options | object | - | Options for streaming responses. |
| tools | array | - | Optional tool/function definitions the model may call. |
| tool_choice | string \\| object | auto | Controls tool invocation: `auto` (model decides), `none` (never call tools), `required` (must call a tool), or a specific function object to force a particular tool. |
| prompt_cache_key | string | - | Caches responses for similar requests to improve cache hit rates. For coding agents this is typically a session/task ID that stays stable across resume. Recommended for multi-turn agents. |
| safety_identifier | string | - | A stable identifier used to detect users who may violate usage policies. Should uniquely identify each user; hashing the username or email is recommended. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "kimi-k3",
    "messages": [
        {
            "role": "user",
            "content": "Briefly explain what reinforcement learning is."
        }
    ]
}'
```

### Response

The response contains the generated chat completion.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier for the completion. |
| object | string | Object type, always `chat.completion`. |
| created | integer | Unix timestamp of when the completion was created. |
| model | string | The model used for the completion. |
| choices | array | List of completion choices. Each contains `message.content`, `message.reasoning_content` (chain-of-thought), and `finish_reason`. |
| usage | object | Token usage stats: `prompt_tokens`, `completion_tokens`, `total_tokens`, `cached_tokens`. |

#### Example Response

```json
{
    "id": "chatcmpl-a1b2c3d4e5",
    "object": "chat.completion",
    "created": 1779321600,
    "model": "kimi-k3",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "reasoning_content": "Reinforcement learning involves an agent, an environment, actions, and a reward signal. Let me summarize it concisely.",
                "content": "Reinforcement learning is a machine learning paradigm where an agent learns to make decisions by interacting with an environment, receiving rewards or penalties, and adjusting its policy to maximize cumulative reward over time."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 28,
        "completion_tokens": 42,
        "total_tokens": 70,
        "cached_tokens": 0
    }
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "kimi-k3",
    "messages": [
        {
            "role": "user",
            "content": "Briefly explain what reinforcement learning is."
        }
    ]
}'
```

**Response Example**

```json
{
    "id": "chatcmpl-a1b2c3d4e5",
    "object": "chat.completion",
    "created": 1779321600,
    "model": "kimi-k3",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "reasoning_content": "Reinforcement learning involves an agent, an environment, actions, and a reward signal. Let me summarize it concisely.",
                "content": "Reinforcement learning is a machine learning paradigm where an agent learns to make decisions by interacting with an environment, receiving rewards or penalties, and adjusting its policy to maximize cumulative reward over time."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 28,
        "completion_tokens": 42,
        "total_tokens": 70,
        "cached_tokens": 0
    }
}
```

---

## MiniMax / MiniMax-M3 `POST`

_OpenAI-Compatible Format_

### MiniMax-M3

MiniMax-M3 is the latest frontier model from MiniMax, built for agent workflows, coding, reasoning, and complex long-context tasks with up to 1M-token context.

`POST https://api.cloudwise.ai/api/v1/chat/completions`

### Supported Models

| Model Name |
| --- |
| `MiniMax-M3` |
| `MiniMax-M2.5` |

### Overview

This endpoint provides text generation through MiniMax-M3 using the OpenAI-compatible Chat Completions format. It supports multi-turn chat, configurable sampling, streaming responses, and tool calling.

### Headers

This endpoint requires Bearer token authentication and a JSON request body.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Your Cloudwise API key in the format `Bearer $YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | MiniMax-M3 | required<br>The MiniMax model ID. Use `MiniMax-M3`. |
| messages | array | - | required<br>Conversation messages. Each item contains a `role` and `content`. |
| temperature | number | 0.7 | Controls output randomness. Lower values produce more deterministic responses. |
| max_tokens | integer | 1024 | Maximum number of tokens to generate in the completion. |
| top_p | number | 1.0 | Nucleus sampling threshold. Adjust this or temperature, but typically not both. |
| stream | boolean | false | Set to `true` to receive the response as server-sent events. |
| tools | array | - | Optional tool definitions available to the model for function calling. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "MiniMax-M3",
  "messages": [
    { "role": "user", "content": "Hi, how are you?" }
  ]
}'
```

### Response

The response contains the generated message and token usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier for the completion. |
| object | string | Object type, always `chat.completion` for non-streaming calls. |
| created | integer | Unix timestamp when the completion was created. |
| model | string | The MiniMax model used for generation. |
| choices | array | Generated choices containing `message` and `finish_reason`. |
| usage | object | Prompt, completion, and total token usage for the request. |

#### Example Response

```json
{
  "id": "chatcmpl-minimax-example",
  "object": "chat.completion",
  "created": 1784563200,
  "model": "MiniMax-M3",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Recursive self-improvement is a process where an AI system helps improve its own capabilities, then uses those improved capabilities to make further improvements."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 31,
    "completion_tokens": 36,
    "total_tokens": 67
  }
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "MiniMax-M3",
  "messages": [
    { "role": "user", "content": "Hi, how are you?" }
  ]
}'
```

**Response Example**

```json
{
  "id": "chatcmpl-minimax-example",
  "object": "chat.completion",
  "created": 1784563200,
  "model": "MiniMax-M3",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Recursive self-improvement is a process where an AI system helps improve its own capabilities, then uses those improved capabilities to make further improvements."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 31,
    "completion_tokens": 36,
    "total_tokens": 67
  }
}
```

---

## MiniMax / MiniMax-H3-Max / Video Generation `POST`

_Official Format_

### Video Generation

Create an asynchronous MiniMax-H3 or MiniMax-H3-Max video generation task. MiniMax-H3-Max supports text-to-video and first/last-frame image-to-video; MiniMax-H3 additionally supports reference-to-video.

`POST https://api.cloudwise.ai/api/v2/video_generation`

### Supported Models

| Model Name |
| --- |
| `MiniMax-H3` |
| `MiniMax-H3-Max` |

### Overview

This endpoint submits an asynchronous video generation task and returns a `task_id`. Use the Query Task endpoint with the returned `task_id` to poll for status and retrieve the generated video URL.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Your Cloudwise API key in the format `Bearer $YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Supported values: `MiniMax-H3` and `MiniMax-H3-Max`. **MiniMax-H3-Max:** supports text-to-video and first/last-frame image-to-video only; reference image, video, and audio inputs are not supported. |
| content | object[] | - | required<br>Multimodal inputs. Every request must contain one non-empty `text` item. Text-to-video uses text only; image-to-video adds first/last-frame images; reference-to-video adds reference image, video, or audio inputs. Image-to-video and reference-to-video inputs cannot be mixed. Total request body size must not exceed 64 MB. **MiniMax-H3-Max:** only text-to-video and first/last-frame image-to-video combinations are supported. |
| content[].type | string | - | required<br>Content item type: `text`, `image_url`, `video_url`, or `audio_url`. **MiniMax-H3-Max:** `video_url` and `audio_url` reference inputs are not supported. |
| content[].text | string | - | Required for the `text` item. Every request must include one non-empty text prompt. Maximum 7,000 characters. |
| content[].image_url | object | - | Required when `type=image_url`. Supported formats: JPG, JPEG, PNG, WEBP, HEIC, and HEIF; maximum 30 MB; width and height 256-5,760 px; aspect ratio 0.4-2.5. First frame and last frame allow one image each; MiniMax-H3 reference-to-video allows up to nine reference images. |
| content[].image_url.url | string | - | Required when `type=image_url`. Public URL, `mm_file://{file_id}`, or lowercase-format base64 data URI. |
| content[].video_url | object | - | Required when `type=video_url`. MiniMax-H3 only. Supports MP4 or MOV, up to 50 MB and three clips; each clip must be 2-15 seconds with at most 15 seconds total. |
| content[].video_url.url | string | - | Required when `type=video_url`. Public URL, `mm_file://{file_id}`, or `data:video/mp4;base64,...`. |
| content[].audio_url | object | - | Required when `type=audio_url`. MiniMax-H3 only. Supports WAV or MP3, up to 15 MB and three clips; each clip must be 2-15 seconds with at most 15 seconds total. |
| content[].audio_url.url | string | - | Required when `type=audio_url`. Public URL, `mm_file://{file_id}`, or lowercase-format base64 data URI. |
| content[].role | string | - | Conditionally required content purpose: `first_frame`, `last_frame`, `reference_image`, `reference_video`, or `reference_audio`. A single image without a role defaults to `first_frame`. **MiniMax-H3-Max:** only `first_frame` and `last_frame` are supported. |
| resolution | string | - | required<br>Output resolution. MiniMax-H3 supports `768P` and `2K`. **MiniMax-H3-Max:** supports `480P` and `768P` (default); `2K` is not supported. |
| duration | integer | - | required<br>Output duration in seconds. MiniMax-H3 supports integers from 4 to 15. **MiniMax-H3-Max:** supports integers from 5 to 15; 4 seconds is not supported. |
| ratio | string | adaptive | Available values: `adaptive`, `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, and `9:16`. Text-to-video requires a concrete ratio and cannot use `adaptive`. Image-to-video always follows the input image and treats the value as `adaptive`. Reference-to-video defaults to `adaptive`. |
| callback_url | string | - | Optional task status callback URL. The verification request contains a `challenge` that must be returned unchanged within three seconds. Status updates use `queued`, `running`, `succeeded`, `failed`, or `cancelled`. |

### Request Example

Text-to-Video

Image-to-Video

Video-to-Video

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/video_generation \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3-Max",
  "content": [
    {
      "type": "text",
      "text": "A cat is purring."
    }
  ],
  "resolution": "768P",
  "duration": 5,
  "ratio": "16:9"
}'
```

### Response

This endpoint returns the asynchronous task ID. Poll the Query Task endpoint to retrieve the final status and generated video.

```json
{
  "task_id": "425688921633008"
}
```

**Request Example (Text-to-Video)**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/video_generation \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3-Max",
  "content": [
    {
      "type": "text",
      "text": "A cat is purring."
    }
  ],
  "resolution": "768P",
  "duration": 5,
  "ratio": "16:9"
}'
```

**Request Example (Image-to-Video)**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/video_generation \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3-Max",
  "content": [
    {
      "type": "text",
      "text": "Add more steam to the ramen bowl."
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/H3_AA_I2VA/gallery/sr_v17_variants_seed42_43_20260724/inputs/4a3a90bf9100_KDmcbkhzYo5sjjxr9FqcVmWVnzb.png"
      }
    }
  ],
  "resolution": "768P",
  "duration": 5
}'
```

**Request Example (Video-to-Video)**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/video_generation \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "Character speaks: Follow the wind, live free. Voice timbre follows reference audio 1."
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/297573323635_00_%E8%A7%86%E9%A2%911_YnyRbxEwio_video_20260525_163755_1927e9d3.mp4"
      },
      "role": "reference_video"
    },
    {
      "type": "audio_url",
      "audio_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/f463d523c5ce_01_%E9%9F%B3%E9%A2%911_RSLcbpzJPo_6%E6%9C%885%E6%97%A5(1).mp3"
      },
      "role": "reference_audio"
    }
  ],
  "resolution": "2K",
  "duration": 5
}'
```

**Response Example**

```json
{
  "task_id": "425688921633008"
}
```

---

## MiniMax / MiniMax-H3-Max / Query Task `GET`

_Official Format_

### Query Task

Retrieve the latest status and output of a MiniMax-H3 or MiniMax-H3-Max task by `task_id` in the path.

`GET https://api.cloudwise.ai/api/v2/query/video_generation/{task_id}`

### Supported Models

| Model Name |
| --- |
| `MiniMax-H3` |
| `MiniMax-H3-Max` |

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Your Cloudwise API key in the format `Bearer $YOUR_API_KEY`. |

### Path Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string | - | required<br>The task ID returned by the Video Generation create request. |

### Request Example

```bash
curl --request GET \
  --url https://api.cloudwise.ai/api/v2/query/video_generation/425688921633008 \
  --header 'Authorization: Bearer $YOUR_API_KEY'
```

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| task.id | string | Unique task ID returned by the create request. |
| task.model | string | The MiniMax model used for generation. |
| task.status | string | Task status. One of `processing`, `succeeded`, or `failed`. |
| task.content.url | string | Generated video URL. Present when the task has succeeded. |
| task.error | object | Error `code` and `message`. Present when the task has `failed`. |
| task.resolution | string | Output video resolution. |
| task.duration | integer | Output video duration in seconds. |
| task.ratio | string | Output aspect ratio. |
| task.usage | object | Billing usage details including total, input, and output seconds and input image count. |

#### Example Response (Succeeded)

```json
{
  "task": {
    "id": "425688921633008",
    "model": "MiniMax-H3",
    "status": "succeeded",
    "created_at": 1785481382,
    "updated_at": 1785481565,
    "content": {
      "url": "https://video-product.cdn.minimax.io/inference_output/rollout/output.mp4"
    },
    "resolution": "2K",
    "duration": 5,
    "usage": {
      "total_seconds": 5,
      "input_seconds": 0,
      "output_seconds": 5,
      "input_image_count": 0
    },
    "ratio": "16:9",
    "task_type": "generation"
  }
}
```

#### Example Response (Failed)

```json
{
  "task": {
    "id": "425688279806205",
    "model": "MiniMax-H3",
    "status": "failed",
    "error": {
      "code": "1026",
      "message": "content blocked by moderation"
    },
    "created_at": 1785481039,
    "updated_at": 1785481078,
    "resolution": "2K",
    "duration": 5,
    "usage": {
      "total_seconds": 0,
      "input_seconds": 0,
      "output_seconds": 0,
      "input_image_count": 0
    },
    "ratio": "16:9",
    "task_type": "generation"
  }
}
```

**Request Example**

```bash
curl --request GET \
  --url https://api.cloudwise.ai/api/v2/query/video_generation/425688921633008 \
  --header 'Authorization: Bearer $YOUR_API_KEY'
```

**Response Example**

```json
{
  "task": {
    "id": "425688921633008",
    "model": "MiniMax-H3",
    "status": "succeeded",
    "created_at": 1785481382,
    "updated_at": 1785481565,
    "content": {
      "url": "https://video-product.cdn.minimax.io/inference_output/rollout/output.mp4"
    },
    "resolution": "2K",
    "duration": 5,
    "usage": {
      "total_seconds": 5,
      "input_seconds": 0,
      "output_seconds": 5,
      "input_image_count": 0
    },
    "ratio": "16:9",
    "task_type": "generation"
  }
}
```

---

## MiniMax / MiniMax-H3-Max / Cancel or Delete Task `DELETE`

_Official Format_

### Cancel or Delete Task

Cancel or delete a MiniMax-H3 or MiniMax-H3-Max task by `task_id` in the path.

`DELETE https://api.cloudwise.ai/api/v2/video_generation/{task_id}`

### Supported Models

| Model Name |
| --- |
| `MiniMax-H3` |
| `MiniMax-H3-Max` |

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Your Cloudwise API key in the format `Bearer $YOUR_API_KEY`. |

### Path Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string | - | required<br>The task ID returned by the Video Generation create request. |

### Request Example

```bash
curl --request DELETE \
  --url https://api.cloudwise.ai/api/v2/video_generation/424010735738552 \
  --header 'Authorization: Bearer $YOUR_API_KEY'
```

### Response

| Field | Type | Description |
| --- | --- | --- |
| task_id | string | The task ID that was cancelled or deleted. |
| action | string | The action performed on the task, such as `cancelled`. |
| status | string | The resulting task status, such as `cancelled`. |

#### Example Response

```json
{
  "task_id": "424010735738552",
  "action": "cancelled",
  "status": "cancelled"
}
```

**Request Example**

```bash
curl --request DELETE \
  --url https://api.cloudwise.ai/api/v2/video_generation/424010735738552 \
  --header 'Authorization: Bearer $YOUR_API_KEY'
```

**Response Example**

```json
{
  "task_id": "424010735738552",
  "action": "cancelled",
  "status": "cancelled"
}
```

---

## MiniMax / MiniMax-H3-Max / Create H3-Context-IR Task `POST`

_Official Format_

### Create H3-Context-IR Task

Create an asynchronous MiniMax-H3 Context-IR task. A single content array supports text-to-video, image-to-video, and reference-to-video (with reference audio) workflows.

`POST https://api.cloudwise.ai/api/v2/h3_context_ir`

### Supported Models

| Model Name |
| --- |
| `MiniMax-H3` |

### Overview

This endpoint submits an asynchronous H3-Context-IR task and returns a `task_id`. Use the Query Task endpoint with the returned `task_id` to poll for status and retrieve the generated video URL.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Your Cloudwise API key in the format `Bearer $YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The MiniMax model ID. Use `MiniMax-H3`. |
| content | object[] | - | required<br>Multimodal context. Every request must contain one non-empty `text` item. Text-to-video uses text only; image-to-video adds first/last-frame images; reference-to-video adds reference image, video, or audio inputs. Image-to-video and reference-to-video inputs cannot be mixed. Total request body size must not exceed 64 MB. |
| content[].type | string | - | required<br>Content item type: `text`, `image_url`, `video_url`, or `audio_url`. |
| content[].text | string | - | Required for the `text` item. Every request must include one non-empty text prompt. Maximum 7,000 characters. |
| content[].image_url | object | - | Required when `type=image_url`. Supported formats: JPG, JPEG, PNG, WEBP, HEIC, and HEIF; maximum 30 MB; width and height 256-5,760 px; aspect ratio 0.4-2.5. First frame and last frame allow one image each; reference-to-video allows up to nine reference images. |
| content[].image_url.url | string | - | Required when `type=image_url`. Public URL, `mm_file://{file_id}`, or lowercase-format base64 data URI. |
| content[].video_url | object | - | Required when `type=video_url`. Supports MP4 or MOV, up to 50 MB and three clips; each clip must be 2-15 seconds with at most 15 seconds total. |
| content[].video_url.url | string | - | Required when `type=video_url`. Public URL, `mm_file://{file_id}`, or `data:video/mp4;base64,...`. |
| content[].audio_url | object | - | Required when `type=audio_url`. Supports WAV or MP3, up to 15 MB and three clips; each clip must be 2-15 seconds with at most 15 seconds total. |
| content[].audio_url.url | string | - | Required when `type=audio_url`. Public URL, `mm_file://{file_id}`, or lowercase-format base64 data URI. |
| content[].role | string | - | Conditionally required content purpose: `first_frame`, `last_frame`, `reference_image`, `reference_video`, or `reference_audio`. A single image without a role defaults to `first_frame`. |
| duration | integer | - | required<br>Target video duration in seconds. Supports integer values from 4 to 15. |
| ratio | string | adaptive | Available values: `adaptive`, `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, and `9:16`. Text-to-video requires a concrete ratio and cannot use `adaptive`. Image-to-video always follows the input image and treats the value as `adaptive`. Reference-to-video defaults to `adaptive`. |
| callback_url | string | - | Optional task status callback URL. The verification request contains a `challenge` that must be returned unchanged within three seconds. Status updates use `queued`, `running`, `succeeded`, `failed`, or `cancelled`. |

### Request Example

Text-to-Video

Image-to-Video

Reference-to-Video

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/h3_context_ir \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "A cat is purring."
    }
  ],
  "duration": 5,
  "ratio": "16:9"
}'
```

### Response

This endpoint returns the asynchronous task ID. Poll the Query Task endpoint to retrieve the final status and generated video.

```json
{
  "task_id": "424010985738629"
}
```

**Request Example (Text-to-Video)**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/h3_context_ir \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "A cat is purring."
    }
  ],
  "duration": 5,
  "ratio": "16:9"
}'
```

**Request Example (Image-to-Video)**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/h3_context_ir \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "Add more steam to the ramen bowl."
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/H3_AA_I2VA/gallery/sr_v17_variants_seed42_43_20260724/inputs/4a3a90bf9100_KDmcbkhzYo5sjjxr9FqcVmWVnzb.png"
      }
    }
  ],
  "duration": 5
}'
```

**Request Example (Reference-to-Video)**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/h3_context_ir \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "Character speaks: Follow the wind, live free. Voice timbre follows reference audio 1."
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/297573323635_00_%E8%A7%86%E9%A2%911_YnyRbxEwio_video_20260525_163755_1927e9d3.mp4"
      },
      "role": "reference_video"
    },
    {
      "type": "audio_url",
      "audio_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/f463d523c5ce_01_%E9%9F%B3%E9%A2%911_RSLcbpzJPo_6%E6%9C%885%E6%97%A5(1).mp3"
      },
      "role": "reference_audio"
    }
  ],
  "duration": 5
}'
```

**Response Example**

```json
{
  "task_id": "424010985738629"
}
```

---

## MiniMax / MiniMax-H3-Max / Create Video Regeneration Task `POST`

_Official Format_

### Create Video Regeneration Task

Create an asynchronous MiniMax-H3 video regeneration task, either from a previous task ID or from a base video for the t2va, i2va, and r2va workflows.

`POST https://api.cloudwise.ai/api/v2/video_regeneration`

### Supported Models

| Model Name |
| --- |
| `MiniMax-H3` |

### Overview

This endpoint submits an asynchronous video regeneration task and returns a `task_id`. Regenerate by `source_task_id`, or provide a `base_video` in the `content` array. Use the Query Task endpoint with the returned `task_id` to poll for status and retrieve the generated video URL.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Your Cloudwise API key in the format `Bearer $YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The MiniMax model ID. Use `MiniMax-H3`. |
| source_task_id | string | - | Required for the task-ID workflow and mutually exclusive with `content`. The source must be a succeeded task owned by the current account, created within the seven-day query window. This workflow requires whitelist access. |
| content | object[] | - | Required for base-video regeneration. Submit the same model inputs used to create the 768P source video, including the final prompt sent after any Context-IR processing, plus exactly one `video_url` item with `role=base_video`. The base video must be a MiniMax-H3 768P output with audio, 24 fps, dimensions divisible by 32, and 107-362 frames in increments of 17. Total request body size must not exceed 64 MB. |
| content[].type | string | - | required<br>Content item type: `text`, `image_url`, `video_url`, or `audio_url`. |
| content[].text | string | - | The final prompt actually sent when generating the 768P source video, not the original prompt before Context-IR processing. Maximum 40,000 characters. |
| content[].image_url | object | - | Required when `type=image_url`. Media limits match the Create Video Generation Task endpoint. |
| content[].image_url.url | string | - | Required when `type=image_url`. Public URL, `mm_file://{file_id}`, or lowercase-format base64 data URI. |
| content[].video_url | object | - | Required when `type=video_url`. Used for a reference video or the required base video. Media limits match the Create Video Generation Task endpoint. |
| content[].video_url.url | string | - | Required when `type=video_url`. Public URL, `mm_file://{file_id}`, or `data:video/mp4;base64,...`. |
| content[].audio_url | object | - | Required when `type=audio_url`. Media limits match the Create Video Generation Task endpoint. |
| content[].audio_url.url | string | - | Required when `type=audio_url`. Public URL, `mm_file://{file_id}`, or lowercase-format base64 data URI. |
| content[].role | string | - | Conditionally required content purpose: `base_video`, `first_frame`, `last_frame`, `reference_image`, `reference_video`, or `reference_audio`. The source video item must explicitly use `base_video`, and exactly one such item is required. |
| resolution | string | - | required<br>Target output resolution. Currently only `2K` is supported. |
| callback_url | string | - | Optional task status callback URL. Behavior matches the video generation endpoint. |
| aigc_watermark | boolean | false | Whether to add an AIGC label watermark to the generated video. |

### Request Example

By source_task_id

base_video (t2va)

base_video (i2va)

base_video (r2va)

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/video_regeneration \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3",
  "source_task_id": "424010985738629",
  "resolution": "2K"
}'
```

### Response

This endpoint returns the asynchronous task ID. Poll the Query Task endpoint to retrieve the final status and generated video.

```json
{
  "task_id": "424010985738629"
}
```

**Request Example (By source_task_id)**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/video_regeneration \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3",
  "source_task_id": "424010985738629",
  "resolution": "2K"
}'
```

**Request Example (base_video (t2va))**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/video_regeneration \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "A cat is purring."
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://your-cdn.example.com/h3-t2va-768p.mp4"
      },
      "role": "base_video"
    }
  ],
  "resolution": "2K"
}'
```

**Request Example (base_video (i2va))**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/video_regeneration \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "Add more steam to the ramen bowl."
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/H3_AA_I2VA/gallery/sr_v17_variants_seed42_43_20260724/inputs/4a3a90bf9100_KDmcbkhzYo5sjjxr9FqcVmWVnzb.png"
      }
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://your-cdn.example.com/h3-i2va-768p.mp4"
      },
      "role": "base_video"
    }
  ],
  "resolution": "2K"
}'
```

**Request Example (base_video (r2va))**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v2/video_regeneration \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "Character speaks: Follow the wind, live free. Voice timbre follows reference audio 1."
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/297573323635_00_%E8%A7%86%E9%A2%911_YnyRbxEwio_video_20260525_163755_1927e9d3.mp4"
      },
      "role": "reference_video"
    },
    {
      "type": "audio_url",
      "audio_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/f463d523c5ce_01_%E9%9F%B3%E9%A2%911_RSLcbpzJPo_6%E6%9C%885%E6%97%A5(1).mp3"
      },
      "role": "reference_audio"
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://your-cdn.example.com/h3-r2va-768p.mp4"
      },
      "role": "base_video"
    }
  ],
  "resolution": "2K"
}'
```

**Response Example**

```json
{
  "task_id": "424010985738629"
}
```

---

## Sonilo / Text to SFX `POST`

_multipart/form-data_

### Text to SFX

Generate a sound effect from a text prompt with a caller-specified duration. Returns 202 Accepted with a task_id; poll GET /api/v1/tasks/:task_id until the task reaches a terminal state.

`POST https://api.cloudwise.ai/api/v1/text-to-sfx`

### Supported Models

| Model Name |
| --- |
| `sonilo` |

### Overview

This endpoint generates a sound effect asynchronously from a text prompt using the Sonilo model. Requests are submitted as `multipart/form-data`. The response returns immediately with a `task_id`; retrieve the final audio by polling the Get Task endpoint.

### Headers

This endpoint requires Bearer token authentication and a multipart form-data request body.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Your Cloudwise API key, prefixed with `ak_`. |
| Content-Type | string | multipart/form-data | Must be `multipart/form-data`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | sonilo | required<br>The Sonilo model ID. Use `sonilo`. |
| prompt | string | - | required<br>Text description of the sound effect to generate. 1–2000 characters. |
| duration | integer | - | required<br>Desired duration of the output audio in seconds. Minimum 1, maximum 180. |
| audio_format | string | aac | Output audio format. One of `wav`, `mp3`, `aac`, or `flac`. Defaults to `aac`. |

### Request Example

Text → Music

Video → Music

Video → SFX

Text → SFX

Audio Ducking

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v1/text-to-music \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'content-type: multipart/form-data' \
  --form model=sonilo \
  --form 'prompt=the sound of a person speaking' \
  --form duration=10 \
  --form mode=async
```

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v1/video-to-music \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'content-type: multipart/form-data' \
  --form model=sonilo \
  --form video_url=https://atlas-img.oss-accelerate-overseas.aliyuncs.com/videos/395d3d56-fa19-4329-941b-242ebeee9566.mp4 \
  --form mode=async
```

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v1/video-to-sfx \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'content-type: multipart/form-data' \
  --form model=sonilo \
  --form video_url=https://atlas-img.oss-accelerate-overseas.aliyuncs.com/videos/395d3d56-fa19-4329-941b-242ebeee9566.mp4 \
  --form 'prompt=match the on-screen action'
```

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v1/text-to-sfx \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'content-type: multipart/form-data' \
  --form model=sonilo \
  --form 'prompt=heavy rain on a tin roof with distant thunder' \
  --form duration=10
```

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v1/audio-ducking \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'content-type: multipart/form-data' \
  --form model=sonilo \
  --form voice_file=@/path/to/voice.mp4 \
  --form 'music_file=@/path/to/music.mp4'
```

### Response

On success the endpoint returns `202 Accepted` with a task identifier and initial status.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| task_id | string | Task identifier. Poll the Get Task endpoint (`GET /api/v1/tasks/:task_id`) until the task reaches a terminal state. |
| status | string | Always `processing` when submitted — generation runs asynchronously. |

#### Example Response

```json
{
  "task_id": "9f5f2f7e-6b2d-4a5e-a5c8-1e2d3f4a5b6c",
  "status": "processing"
}
```

**Request Example (Text → Music)**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v1/text-to-music \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'content-type: multipart/form-data' \
  --form model=sonilo \
  --form 'prompt=the sound of a person speaking' \
  --form duration=10 \
  --form mode=async
```

**Request Example (Video → Music)**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v1/video-to-music \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'content-type: multipart/form-data' \
  --form model=sonilo \
  --form video_url=https://atlas-img.oss-accelerate-overseas.aliyuncs.com/videos/395d3d56-fa19-4329-941b-242ebeee9566.mp4 \
  --form mode=async
```

**Request Example (Video → SFX)**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v1/video-to-sfx \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'content-type: multipart/form-data' \
  --form model=sonilo \
  --form video_url=https://atlas-img.oss-accelerate-overseas.aliyuncs.com/videos/395d3d56-fa19-4329-941b-242ebeee9566.mp4 \
  --form 'prompt=match the on-screen action'
```

**Request Example (Text → SFX)**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v1/text-to-sfx \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'content-type: multipart/form-data' \
  --form model=sonilo \
  --form 'prompt=heavy rain on a tin roof with distant thunder' \
  --form duration=10
```

**Request Example (Audio Ducking)**

```bash
curl --request POST \
  --url https://api.cloudwise.ai/api/v1/audio-ducking \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'content-type: multipart/form-data' \
  --form model=sonilo \
  --form voice_file=@/path/to/voice.mp4 \
  --form 'music_file=@/path/to/music.mp4'
```

**Response Example**

```json
{
  "task_id": "9f5f2f7e-6b2d-4a5e-a5c8-1e2d3f4a5b6c",
  "status": "processing"
}
```

---

## Sonilo / Get Task `GET`

_Async Task Polling_

### Get Task

Retrieve an asynchronous generation task. Endpoints such as text-to-sfx return a task_id; poll this endpoint every 2–5 seconds until status becomes succeeded or failed. Only asynchronous tasks are supported here — any other task ID returns 404.

`GET https://api.cloudwise.ai/api/v1/tasks/{task_id}`

### Overview

Use this endpoint to poll the status of an async task previously submitted via `POST /api/v1/text-to-sfx` (or other async endpoints). When the task reaches a terminal state, the response includes the generated media asset and its temporary download URL.

### Headers

This endpoint requires Bearer token authentication.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Your Cloudwise API key in the format `Bearer ak_xxx`. |

### Path Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| task_id | string | required<br>The `task_id` returned by an asynchronous generation endpoint, such as `POST /api/v1/text-to-sfx`. Any other task ID returns `404`. |

### Request Example

```bash
curl --request GET \
  --url https://api.cloudwise.ai/api/v1/tasks/262ee369-c204-4935-966a-6c2b3c8bfc1e \
  --header 'Authorization: Bearer $YOUR_API_KEY'
```

### Response

Returns `200 OK` with the current task state. Poll every 2–5 seconds until `status` is `succeeded` or `failed`.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| task_id | string | Task identifier. |
| type | string | Task type. One of `video_to_sfx`, `text_to_sfx`, `audio_ducking`, `video_to_music`, or `text_to_music`. |
| status | string | One of `processing`, `succeeded`, or `failed`. |
| duration_seconds | number | Duration of the generated audio (in seconds). Present when the task succeeds. |
| audio | object | Present when an SFX task succeeds — the generated audio hosted on Cloudwise storage. |
| audio.url | string | Temporary download URL for the audio file. Valid for 7 days. |
| audio.content_type | string | MIME type of the audio — `audio/mp4` (m4a, default) or `audio/wav` when the request set `output_format=wav` (music endpoints only). |
| audio.file_size | integer | Audio file size in bytes. |
| error | object | Present when `status` is `failed`. Contains `code` and `message` describing the failure. |

#### Example Response — processing

```json
{
  "task_id": "9f5f2f7e-6b2d-4a5e-a5c8-1e2d3f4a5b6c",
  "type": "text_to_sfx",
  "status": "processing"
}
```

#### Example Response — succeeded

```json
{
  "task_id": "9f5f2f7e-6b2d-4a5e-a5c8-1e2d3f4a5b6c",
  "type": "text_to_sfx",
  "status": "succeeded",
  "duration_seconds": 10,
  "audio": {
    "url": "https://storage.cloudwise.ai/tasks/9f5f2f7e-.../output.m4a",
    "content_type": "audio/mp4",
    "file_size": 165342
  }
}
```

#### Example Response — failed

```json
{
  "task_id": "9f5f2f7e-6b2d-4a5e-a5c8-1e2d3f4a5b6c",
  "type": "text_to_sfx",
  "status": "failed",
  "error": {
    "code": "generation_failed",
    "message": "Sound effect generation failed. Please retry."
  }
}
```

**Request Example**

```bash
curl --request GET \
  --url https://api.cloudwise.ai/api/v1/tasks/262ee369-c204-4935-966a-6c2b3c8bfc1e \
  --header 'Authorization: Bearer $YOUR_API_KEY'
```

**Response Example**

```json
{
  "task_id": "9f5f2f7e-6b2d-4a5e-a5c8-1e2d3f4a5b6c",
  "type": "text_to_sfx",
  "status": "succeeded",
  "duration_seconds": 10,
  "audio": {
    "url": "https://storage.cloudwise.ai/tasks/9f5f2f7e-.../output.m4a",
    "content_type": "audio/mp4",
    "file_size": 165342
  }
}
```

---

## OpenAI / Chat / Chat Completions - Format `POST`

_Official Format(Chat)_

### Chat Completions - Format

Chat Completions API format for GPT models. Use the model parameter to specify which model to use.

`POST https://api.cloudwise.ai/api/v1/chat/completions`

### Supported Models

| Model Name |
| --- |
| `gpt-6.1-sol` |
| `gpt-6-sol` |
| `gpt-6-luna` |
| `gpt-6-astra` |
| `gpt-4o` |
| `gpt-4.1` |
| `gpt-5` |
| `gpt-5-mini` |
| `gpt-5.1` |
| `gpt-5.2` |
| `gpt-5.3-chat` |
| `gpt-5.3-codex` |
| `gpt-5.4` |
| `gpt-5.4-mini` |
| `gpt-5.4-nano` |
| `gpt-5.5` |
| `gpt-5.6-sol` |
| `gpt-5.6-terra` |
| `gpt-5.6-luna` |

### Overview

This endpoint provides text and vision generation with gpt-6.1-sol as the default example model. Use `gpt-6-luna` for lower-cost, high-throughput workloads, or select another supported model with the `model` parameter. Use the Responses API when GPT-6 needs to call tools.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The ID of the model to use. GPT-6 Sol and Luna support text and image input on Chat Completions. Use the Responses API for GPT-6 tool calling and agentic workflows. |
| messages | array of message objects | - | required<br>A list of messages comprising the conversation so far. Message object contains the following fields:<br><br>- `role` (string): The role of the messages author. One of `system`, `user`, `assistant`, or `tool`.<br>- `content` (string or array): The contents of the message. This is an array of content parts with a defined type, each can be of type `text` or `image_url` when passing in images. You can pass multiple images by adding multiple `image_url` content parts.<br>- `name` (string, optional): The name of the author of this message. `name` is required if role is `function`, and it should be the name of the function whose response is in the `content`. May contain a-z, A-Z, 0-9, and underscores, with a maximum length of 64 characters. |
| temperature | number | 1 | Optional<br>What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.<br><br>We generally recommend altering this or `top_p` but not both.<br><br>**GPT-6 models:** Not supported. Omit this parameter. |
| top_p | number | 1 | Optional<br>An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with `top_p` probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered.<br><br>We generally recommend altering this or `temperature` but not both.<br><br>**GPT-6 models:** Not supported. Omit this parameter. |
| n | integer | 1 | Optional<br>How many chat completion choices to generate for each input message. Note that you will be charged based on the number of output tokens generated across all of the choices. |
| stream | boolean | false | Optional<br>If set, partial message deltas will be sent, like in ChatGPT. Tokens will be sent as data-only server-sent events as they become available, with the stream terminated by a `data: [DONE]` message. |
| stop | string or array | - | Optional<br>Up to 4 sequences where the API will stop generating further tokens. The returned text will not contain the stop sequence. |
| max_tokens | integer | - | Optional<br>**[Deprecated]** The maximum number of tokens that can be generated in the chat completion. This value is not compatible with reasoning models such as GPT-5.x and GPT-6 — use `max_completion_tokens` instead. |
| max_completion_tokens | integer | - | Optional<br>An upper bound on the total number of tokens that can be generated for a completion, including visible output tokens and reasoning tokens. Recommended for reasoning models, including GPT-5.x and GPT-6, in place of `max_tokens`. |
| presence_penalty | number | 0 | Optional<br>Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model’s likelihood to talk about new topics. |
| frequency_penalty | number | 0 | Optional<br>Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model’s likelihood to repeat the same line verbatim. |
| logit_bias | map | - | Optional<br>Modify the likelihood of specified tokens appearing in the completion. Accepts a JSON object that maps tokens (specified by their token ID in the tokenizer) to an associated bias value from -100 to 100. Mathematically, the bias is added to the logits generated by the model before sampling. The exact effect will vary per model, but values between -1 and 1 should decrease or increase likelihood of selection; values like -100 or 100 should result in a ban or exclusive selection of the relevant token. |
| user | string | - | Optional<br>**[Deprecated]** A unique identifier representing your end-user. Use`safety_identifier` for safety detection and `prompt_cache_key` for cache bucketing instead. |
| response_format | object | - | Optional<br>An object specifying the format that the model must output. Compatible with GPT-4 Turbo and all GPT-3.5 Turbo models newer than `gpt-3.5-turbo-1106`.<br><br>Setting to `{"type": "json_object"}` enables JSON mode, which guarantees the message the model generates is valid JSON.<br><br>**Important:** when using JSON mode, you **must**also instruct the model to produce JSON yourself via a system or user message. Without this, the model may generate an unending stream of whitespace until the generation reaches the token limit, resulting in a long-running and seemingly "stuck" request. Also note that the message content may be partially cut off if `finish_reason="length"`, which indicates the generation exceeded `max_tokens`or the conversation exceeded the model's context length. |
| seed | integer | - | Optional<br>**[Deprecated]** If specified, the system makes a best effort to sample deterministically. Not guaranteed and no longer recommended on gpt-5.x reasoning models. |
| tools | array | - | Optional<br>A list of tools the model may call. Each tool is either a function tool (with a JSON-schema `parameters` definition) or a custom tool (free-form text input). The model returns `tool_call` items describing how to invoke them.<br><br>**GPT-6 models:** Tool calling is not supported through Chat Completions; use the Responses API instead. |
| tool_choice | string or object | auto | Optional<br>Controls which (if any) function is called by the model. `none` means the model will not call a function and instead generates a message. `auto` means the model can pick between generating a message or calling a function. Specifying a particular function via `{"type": "function", "function": {"name": "my_function"}}` forces the model to call that function.<br><br>`none` is the default when no functions are present. `auto` is the default if functions are present.<br><br>**GPT-6 models:** Tool calling is not supported through Chat Completions; use the Responses API instead. |
| logprobs | boolean | false | Optional<br>Whether to return log probabilities of the output tokens or not. If true, returns the log probabilities of each output token returned in the `content` of `message`.<br><br>**GPT-6 models:** Not supported. Omit this parameter. |
| top_logprobs | integer | - | Optional<br>An integer between 0 and 20 specifying the number of most likely tokens to return at each token position, each with an associated log probability. `logprobs` must be set to `true` if this parameter is used.<br><br>**GPT-6 models:** Not supported. Omit this parameter. |
| reasoning_effort | string | medium | Optional<br>Constrains effort on reasoning for reasoning models. The full value set across supported models is `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`.<br><br>**Per-model support:**<br>- `gpt-6-sol` / `gpt-6-luna`: accept `none`, `low`, `medium` (default), `high`, `xhigh`, and `max`. They do not accept `minimal`.<br>- `gpt-6-astra`: accepts `low`, `medium`, `high`, `xhigh`, and `max`. It does not accept `none` or `minimal`.<br>- `gpt-5.5`: accepts `none`, `low`, `medium`, `high`, `xhigh` (does not accept `minimal` or `max`).<br>- `gpt-5.6-sol` / `gpt-5.6-terra` / `gpt-5.6-luna`: add support for the new `max` value for the hardest quality-first workloads.<br>- `minimal` is only accepted by select earlier reasoning models (e.g. o-series); it is not available on gpt-5.5, gpt-5.6, or GPT-6.<br><br>**Note:** The Chat Completions API only accepts this flat `reasoning_effort` string. To configure the nested `reasoning.mode` (`standard` / `pro`) or `reasoning.context` (`auto` / `all_turns` / `current_turn`) added in gpt-5.6, use the Responses API instead. |
| verbosity | string | medium | Optional<br>Constrains the verbosity of the model's response. Supported values are `low`, `medium`, and `high`. Lower values produce more concise responses.<br><br>**Model note:** GPT-5.6 and GPT-6 support explicit verbosity control. Prefer setting a default with `verbosity` and reserve prompt instructions for task-specific length requirements. |
| prompt_cache_options | object | - | Optional<br>**New in gpt-5.6.** Options for prompt caching. Supported for `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, and later models. Contains:<br><br>- `mode` (string): `implicit` (default) picks one implicit cache breakpoint automatically; `explicit` disables the implicit breakpoint so only `prompt_cache_breakpoint` markers you add to content blocks participate. Each request may write up to 4 breakpoints; matching considers the latest 80 breakpoints in the conversation.<br>- `ttl` (string): Minimum cache lifetime. Defaults to `30m` (currently the only supported value).<br><br>Cache writes are billed at 1.25× the uncached input rate for gpt-5.6 and GPT-6. This parameter replaces the deprecated `prompt_cache_retention`. |
| prompt_cache_key | string | - | Optional<br>Stable key used to bucket similar requests and boost cache hit rates. Replaces the deprecated `user` field. Works with both implicit caching (gpt-5.5) and the explicit `prompt_cache_options` (gpt-5.6 and GPT-6). |
| safety_identifier | string | - | Optional<br>Stable, privacy-preserving identifier of the end user, maximum 64 characters. Replaces the deprecated `user` field for safety detection.<br><br>**Model note:** Send a `safety_identifier` with GPT-5.6 and GPT-6 requests to improve safety detection without transmitting direct user identifiers. |
| service_tier | string | auto | Optional<br>Selects the processing tier: `auto`, `default`, `flex`,`priority`, or `fast` where supported.<br><br>**Per-model support:**<br>- `gpt-5.5`: Standard, Batch, and Priority (Flex is not available).<br>- `gpt-5.6-sol` ($5 / $30 per 1M tokens), `gpt-5.6-terra` ($2.5 / $15), and `gpt-5.6-luna` ($1 / $6): Standard, Batch, Flex, and Priority are all enabled.<br>- `gpt-6-sol`: For inputs up to 272K tokens, Standard pricing per 1M tokens is $2 input, $0.20 cached input, $10 output, and $2.50 cache writes. Above 272K, it is $4 input, $0.40 cached input, $15 output, and $5 cache writes.<br>- `gpt-6-luna`: For inputs up to 272K tokens, Standard pricing per 1M tokens is $0.10 input, $0.01 cached input, $0.50 output, and $0.125 cache writes. Above 272K, it is $0.20 input, $0.02 cached input, $0.75 output, and $0.25 cache writes.<br>- `gpt-6-astra`: For inputs up to 272K tokens, pricing per 1M tokens is $10 input, $1 cached input, $50 output, and $12.50 cache writes. Above 272K, it is $20 input, $2 cached input, $75 output, and $25 cache writes. Batch and Flex are 50% of Standard; Fast is 2×. With EU data residency, `fast` and `priority` are not supported. |

### Request Example

Text Input

Image Input

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "gpt-6.1-sol",
    "messages": [
      {
        "role": "user",
        "content": "Hello!"
      }
    ]
  }'
```

### Response

The response contains the generated text and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | A unique identifier for the chat completion. |
| object | string | The object type, which is always `chat.completion`. |
| created | integer | The Unix timestamp (in seconds) of when the chat completion was created. |
| model | string | The model used for the chat completion. |
| choices | array | A list of chat completion choices. Can be more than one if `n` is greater than 1. Each choice object contains:<br><br>- `index` (integer): The index of the choice in the list of choices.<br>- `message` (object): A chat completion message generated by the model. Contains `role` and `content` fields.<br>- `finish_reason` (string): The reason the model stopped generating tokens. This will be `stop` if the model hit a natural stop point or a provided stop sequence, `length` if the maximum number of tokens specified in the request was reached, `content_filter` if content was omitted due to a flag from our content filters, `tool_calls` if the model called a tool, or `function_call` (deprecated) if the model called a function.<br>- `logprobs` (object, optional): Log probability information for the choice. Only present if `logprobs` is set to `true` in the request. |
| usage | object | Usage statistics for the completion request. Contains:<br><br>- `prompt_tokens` (integer): Number of tokens in the prompt.<br>- `completion_tokens` (integer): Number of tokens in the generated completion.<br>- `total_tokens` (integer): Total number of tokens used in the request (prompt + completion).<br>- `prompt_tokens_details.cached_tokens` (integer): Tokens served from an existing cache entry.<br>- `prompt_tokens_details.cache_write_tokens` (integer): **Introduced in gpt-5.6 and supported by GPT-6.**Tokens written to the prompt cache in this request. Cache-write tokens are billed at 1.25× the uncached input rate.<br>- `completion_tokens_details.reasoning_tokens` (integer): Reasoning tokens consumed. GPT-5.6 and GPT-6 support the higher `reasoning_effort="max"` setting. |
| service_tier | string | The processing tier the request was served on. Echoes the effective tier resolved from the request's `service_tier`: one of `default`, `flex`, `priority`, or `fast`.<br><br>This field lets you confirm which pricing tier billed the request. GPT-6 Astra can also return `fast` where supported; `fast` and `priority` are unavailable with EU data residency. |
| system_fingerprint | string | This fingerprint represents the backend configuration that the model runs with.<br><br>Can be used in conjunction with the `seed` request parameter to understand when backend changes have been made that might impact determinism. |

#### Example Response

Text Input Response

Image Input Response

```json
{
  "id": "chatcmpl-CidHh3CYJseg7azH5rXAR4X1mZoyK",
  "model": "gpt-6.1-sol",
  "object": "chat.completion",
  "created": 1764753478,
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 21,
    "completion_tokens": 11,
    "total_tokens": 32,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "cache_write_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "audio_tokens": 0,
      "reasoning_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "service_tier": "default",
  "system_fingerprint": "fp_f99638a8d7"
}
```

**Request Example (Text Input)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "gpt-6.1-sol",
    "messages": [
      {
        "role": "user",
        "content": "Hello!"
      }
    ]
  }'
```

**Request Example (Image Input)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "gpt-6.1-sol",
    "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "what is in this image?"
        },
        {
          "type": "image_url",
          "image_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
        }
      ]
    }
  ]
  }'
```

**Response Example (Text Input Response)**

```json
{
  "id": "chatcmpl-CidHh3CYJseg7azH5rXAR4X1mZoyK",
  "model": "gpt-6.1-sol",
  "object": "chat.completion",
  "created": 1764753478,
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 21,
    "completion_tokens": 11,
    "total_tokens": 32,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "cache_write_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "audio_tokens": 0,
      "reasoning_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "service_tier": "default",
  "system_fingerprint": "fp_f99638a8d7"
}
```

**Response Example (Image Input Response)**

```json
{
  "id": "chatcmpl-CiyLFAT9j7qxvrh2FHy4LPhWOkwSB",
  "model": "gpt-6.1-sol",
  "object": "chat.completion",
  "created": 1764834423,
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "This image shows a wooden boardwalk path running through a grassy field or meadow. The path leads toward the horizon, where there are trees and shrubbery. The sky above is mostly clear with some scattered clouds, and the scene is brightly lit, suggesting it was taken during the daytime. The overall atmosphere is calm and natural, typical of a nature reserve, park, or countryside landscape."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 921,
    "completion_tokens": 78,
    "total_tokens": 999,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "cache_write_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "audio_tokens": 0,
      "reasoning_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "service_tier": "default",
  "system_fingerprint": "fp_f99638a8d7"
}
```

---

## OpenAI / Chat / Responses - Format `POST`

_Official Format(Chat)_

### Responses - Format

Responses API format for GPT models. Use the model parameter to specify which model to use.

`POST https://api.cloudwise.ai/api/v1/responses`

### Supported Models

| Model Name |
| --- |
| `gpt-6.1-sol` |
| `gpt-6-sol` |
| `gpt-6-luna` |
| `gpt-6-astra` |
| `gpt-4o` |
| `gpt-4.1` |
| `gpt-5` |
| `gpt-5-mini` |
| `gpt-5.1` |
| `gpt-5.2` |
| `gpt-5.3-chat` |
| `gpt-5.3-codex` |
| `gpt-5.4` |
| `gpt-5.4-mini` |
| `gpt-5.4-nano` |
| `gpt-5.5` |
| `gpt-5.6-sol` |
| `gpt-5.6-terra` |
| `gpt-5.6-luna` |

### Overview

This endpoint provides text generation functionality using the gpt-6.1-sol model. Upload images or provide image URLs to analyze and understand image content with vision-enabled models.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The ID of the model to use. GPT-6 Sol and Luna support built-in tools and function calling through the Responses API. GPT-6 Astra additionally supports async tool calling and mid-conversation reasoning updates. |
| input | string or array | - | required<br>Text, image, or file inputs to the model, used to generate a response. May be a plain string or an array of input items (`message`, `function_call_output`, etc.). GPT-6 Astra also accepts `configuration_update` input items; see the dedicated row below. |
| input[].configuration_update | object | - | Optional<br>**GPT-6 Astra only.** Add an input item shaped as `{ "type": "configuration_update", "reasoning": { "effort": "high" } }` before the next user message to change reasoning effort for subsequent responses while preserving the cached prompt prefix. Supported only in standard, single-agent mode. Adjacent updates are rejected, and this item cannot be combined with automatic compaction or automatic truncation. |
| instructions | string | - | Optional<br>A system (or developer) message inserted at the top of the model context. |
| max_output_tokens | integer | - | Optional<br>An upper bound for the number of tokens that can be generated for the response, including visible output and reasoning tokens. |
| temperature | number | 1 | Optional<br>Sampling temperature between 0 and 2. Higher values make the output more random. We recommend altering this or `top_p`, not both.<br><br>**GPT-6 Astra:** Not supported. Omit this parameter. |
| top_p | number | 1 | Optional<br>Nucleus sampling. 0.1 means only tokens comprising the top 10% probability mass are considered.<br><br>**GPT-6 Astra:** Not supported. Omit this parameter. |
| stream | boolean | false | Optional<br>If true, streams the response as server-sent events. |
| tools | array | - | Optional<br>An array of tools the model may call. Includes built-in hosted tools (`web_search`, `file_search`, `code_interpreter`,`image_generation`, `computer_use_preview`, `mcp`,`shell`, `apply_patch`) and user-defined `function` /`custom` tools.<br><br>**New in GPT-6 Astra:** Function and custom tool definitions accept `async: true`. The model can continue working while your application runs the tool, and the later output must use the original `call_id`. Async mode does not apply to hosted tools or programmatic tool calling, and must not be combined with parallel tool calls in Multi-agent mode.<br><br>**New in gpt-5.6:** Adds a hosted `programmatic_tool_calling` tool that lets the model author short TypeScript-like programs to orchestrate other tools. Also introduces new tool sub-fields:<br>- `allowed_callers`: one of `["direct"]`, `["programmatic"]`, or `["direct", "programmatic"]` to control whether a tool can be called directly, by the programmatic tool caller, or both. Supported on `function`, `custom`, `mcp`, `apply_patch`, local/hosted `shell`, and `code_interpreter`.<br>- `output_schema`: A JSON schema describing the tool's return value for the programmatic caller.<br>- `defer_loading`(boolean): Defer loading a tool's implementation until it is first referenced. |
| tool_choice | string or object | auto | Optional<br>Controls which (if any) tool is called. Values: none, auto, required, or an object like { "type": "function", "name": "..." }. |
| parallel_tool_calls | boolean | true | Optional<br>Whether to allow the model to call multiple tools in parallel within a single response. |
| reasoning | object | - | Optional<br>Configuration options for reasoning models. Contains:<br><br>- `effort` (string): One of `none`, `minimal`,`low`, `medium`, `high`, `xhigh`, or `max`. Constrains how much reasoning work the model performs before answering. `gpt-6-astra` accepts `low`, `medium`, `high`, `xhigh`, and `max`; it returns HTTP 400 for `none` and does not support `minimal`. `gpt-6-sol` and `gpt-6-luna` accept `none`, `low`, `medium` (default), `high`, `xhigh`, and `max`.<br>- `summary` (string, optional): Return a summary of the reasoning chain (`auto`, `concise`, `detailed`).<br><br>**New in gpt-5.6 (fields added):**<br>- `reasoning.mode` (string): `standard` (default) or `pro`. Setting `pro` applies significantly more model work before returning a single final answer. Supported by `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-6-astra`.<br>- `reasoning.context` (string): `auto` (default), `all_turns`, or `current_turn`. Controls whether prior turns' reasoning items are reused across a conversation on gpt-5.6 and GPT-6 Astra.<br><br>**New in gpt-5.6 (value added):** `effort="max"` is accepted by the gpt-5.6 and GPT-6 families, and is reserved for the hardest quality-first workloads. gpt-5.5 still accepts `none`, `low`, `medium`, `high`, and `xhigh`.<br><br>Beta limitation: When Multi-agent orchestration is enabled, `reasoning.summary` is ignored. |
| text | object | - | Optional<br>Options controlling the text output. Contains:<br><br>- `format` (object): One of `{ "type": "text" }`, `{ "type": "json_object" }`, or a Structured Outputs schema.<br>- `verbosity` (string): `low`, `medium`, or `high`. **gpt-5.6 note:**The gpt-5.6 family is more concise by default than gpt-5.5, so avoid broad "be concise" instructions and set the default here. |
| include | array | - | Optional<br>Specify additional output data to include. Common values: `reasoning.encrypted_content`, `message.output_text.logprobs`, `code_interpreter_call.outputs`, `file_search_call.results`, `web_search_call.action.sources`.<br><br>**GPT-6 Astra:** Do not request `message.output_text.logprobs`; output log probabilities are not supported. |
| previous_response_id | string | - | Optional<br>The unique ID of the previous response to the model. Use this to create multi-turn conversations. |
| store | boolean | true | Optional<br>Whether to store the generated response for later retrieval via the Responses API. |
| background | boolean | false | Optional<br>Whether to run the model response in the background. |
| max_tool_calls | integer | - | Optional<br>The maximum number of total calls to built-in tools that can be processed in a response.<br><br>Multi-agent limitation: Ignored when Multi-agent orchestration is enabled (`OpenAI-Beta: responses_multi_agent=v1`). |
| prompt_cache_options | object | - | Optional<br>**New in gpt-5.6.** Options for prompt caching. Supported for `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, and later models. Contains:<br><br>- `mode` (string): `implicit` (default) picks one implicit cache breakpoint automatically; `explicit` disables the implicit breakpoint so only `prompt_cache_breakpoint` markers you add to input items participate. Up to 4 breakpoints per request, matching against the latest 80 breakpoints.<br>- `ttl` (string): Minimum cache lifetime. Defaults to `30m` (currently the only supported value).<br><br>Cache-write tokens are billed at 1.25× the uncached input rate on gpt-5.6 and GPT-6. Replaces the deprecated `prompt_cache_retention`. |
| prompt_cache_key | string | - | Optional<br>Stable key used to bucket similar requests and boost cache hit rates. Replaces the deprecated user field. |
| safety_identifier | string | - | Optional<br>Stable, privacy-preserving identifier of the end user (max 64 chars). Replaces the deprecated `user` field for safety detection.<br><br>**Model note:** Send a `safety_identifier` with GPT-5.6 and GPT-6 requests to improve safety detection without transmitting direct user identifiers. |
| service_tier | string | auto | Optional<br>Selects the processing tier: `auto`, `default`, `flex`,`priority`, or `fast` where supported.<br><br>**gpt-5.6 note:** Batch, Flex, and Priority are all available for `gpt-5.6-sol` ($5 / $30 per 1M tokens), `gpt-5.6-terra` ($2.5 / $15), and `gpt-5.6-luna` ($1 / $6).<br>- `gpt-6-sol`: For inputs up to 272K tokens, Standard pricing per 1M tokens is $2 input, $0.20 cached input, $10 output, and $2.50 cache writes. Above 272K, it is $4 input, $0.40 cached input, $15 output, and $5 cache writes.<br>- `gpt-6-luna`: For inputs up to 272K tokens, Standard pricing per 1M tokens is $0.10 input, $0.01 cached input, $0.50 output, and $0.125 cache writes. Above 272K, it is $0.20 input, $0.02 cached input, $0.75 output, and $0.25 cache writes.<br>- `gpt-6-astra`: For inputs up to 272K tokens, pricing per 1M tokens is $10 input, $1 cached input, $50 output, and $12.50 cache writes. Above 272K, it is $20 input, $2 cached input, $75 output, and $25 cache writes. Batch and Flex are 50% of Standard; Fast is 2×. With EU data residency, `fast` and `priority` are not supported. |
| metadata | map | - | Optional<br>A set of up to 16 key-value pairs attached to the response for filtering and dashboard grouping. |
| top_logprobs | integer | 0 | Optional<br>An integer between 0 and 20 specifying the number of most likely tokens to return log probabilities for at each output position.<br><br>**GPT-6 Astra:** Not supported. Omit this parameter. |
| truncation | string | disabled | Optional<br>**[Deprecated]** How to truncate the model context when it exceeds the window. One of `auto` or `disabled`. Use `context_management` on newer models instead. |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/responses' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "gpt-6.1-sol",
    "input": "Given me a brief introduction of MoE"
  }'
```

### Response

The response contains the generated text and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier for this Response. |
| object | string | The object type of this resource - always set to response. |
| model | string | Model ID used to generate the response, like gpt-6.1-sol, gpt-6-sol, or gpt-6-astra. OpenAI offers a wide range of models with different capabilities, performance characteristics, and price points. |
| usage | object | Usage statistics for the completion request. Contains:<br><br>- `total_tokens` (integer): Total number of tokens used.<br>- `input_tokens` (integer): Number of tokens in the input.<br>- `output_tokens` (integer): Number of tokens in the generated completion.<br>- `input_tokens_details.cached_tokens` (integer): Cached input tokens billed at a discount.<br>- `input_tokens_details.cache_write_tokens` (integer): **Introduced in gpt-5.6 and supported by GPT-6.**Tokens written to the prompt cache in this request. Cache-write tokens are billed at 1.25× the uncached input rate.<br>- `output_tokens_details.reasoning_tokens` (integer): Reasoning tokens consumed. The upper bound is higher on gpt-5.6 and GPT-6 Astra when `reasoning.effort="max"` or `reasoning.mode="pro"` is used. |
| created_at | number | Unix timestamp (in seconds) of when this Response was created. |
| status | string | The status of the response: in_progress, completed, incomplete, or failed. |
| output | array | An array of content items generated by the model. Items include the usual `message`, `reasoning`, `function_call`, `file_search_call`, `web_search_call`, `code_interpreter_call`, `image_generation_call`, and `mcp_call`.<br><br>**Output item types introduced in gpt-5.6 and supported by GPT-6 Astra:**<br>- `program`: The TypeScript-like program emitted by the hosted `programmatic_tool_calling` tool.<br>- `program_output`: The runtime result of executing that program.<br>- `function_call.caller`: When a function call is triggered by the programmatic caller, the item carries `caller: { "type": "program", "caller_id": ... }`.<br>- `multi_agent_call` / `multi_agent_call_output` / `agent_message`: Emitted when Multi-agent orchestration is enabled via the `OpenAI-Beta: responses_multi_agent=v1`header. Each subordinate agent's output items include an `agent` field identifying which agent produced them.<br><br>**New in GPT-6 Astra:** Asynchronous `function_call` and `custom_tool_call` items include `async: true`. |
| reasoning | object | Echoes the effective reasoning configuration used for this response.<br><br>- `effort`: The resolved reasoning effort.<br>- `summary`: The reasoning summary (if requested).<br><br>**Introduced in gpt-5.6 and supported by GPT-6 Astra:**<br>- `reasoning.mode`: `standard` or `pro`. Present on gpt-5.6-sol / terra / luna and GPT-6 Astra.<br>- `reasoning.context`: `auto`, `all_turns`, or `current_turn`. Present on gpt-5.6 and GPT-6 Astra responses.<br>- On GPT-6 Astra, a `configuration_update` input item can change the effective effort mid-conversation. This response field still reports the request-level `reasoning.effort`, not the value selected by that update. |
| service_tier | string | The processing tier this request was served on: `default`, `flex`, `priority`, or `fast`.<br><br>This field lets you confirm which pricing tier billed the request. GPT-6 Astra can also return `fast` where supported; `fast` and `priority` are unavailable with EU data residency. |
| prompt_cache_options | object | **Introduced in gpt-5.6 and supported by GPT-6.** Echoes the caching options (`mode`, `ttl`) used to produce this response. |

#### Example Response

```json
{
  "id": "resp_0b76b1ba8760fd12006930084b029c8194ac342172eebe0886",
  "object": "response",
  "model": "gpt-6.1-sol",
  "usage": {
    "total_tokens": 190,
    "input_tokens": 15,
    "input_tokens_details": {
      "cached_tokens": 0,
      "cache_write_tokens": 0
    },
    "output_tokens": 175,
    "output_tokens_details": {
      "reasoning_tokens": 0
    }
  },
  "created_at": 1764755531,
  "status": "completed",
  "background": false,
  "error": null,
  "incomplete_details": null,
  "instructions": null,
  "max_output_tokens": null,
  "max_tool_calls": null,
  "output": [
    {
      "id": "msg_0b76b1ba8760fd12006930084b26ac81949851547e292bebd0",
      "type": "message",
      "status": "completed",
      "content": [
        {
          "type": "output_text",
          "annotations": [],
          "logprobs": [],
          "text": "Certainly! Here's a brief introduction to **MoE (Mixture of Experts)**:\n\n---\n\n**Mixture of Experts (MoE)** is an advanced neural network architecture that divides complex tasks among several specialized \"expert\" subnetworks. Each expert handles different parts of the input, and a gating network dynamically routes data to the most relevant experts. This allows the model to scale efficiently, making it possible to train large models with high capacity while keeping computation costs manageable, since only a subset of experts is activated for each input.\n\nMoE has been widely used in natural language processing and large-scale machine learning tasks, notably powering models like Google's Switch Transformer and sparsely activated transformer architectures. The main benefits of MoE include improved performance, better model scalability, and efficient computation by leveraging conditional computation.\n\n---\n\nLet me know if you'd like a deeper explanation or specific applications of MoE!"
        }
      ],
      "role": "assistant"
    }
  ],
  "parallel_tool_calls": true,
  "previous_response_id": null,
  "prompt_cache_key": null,
  "prompt_cache_options": {
    "mode": "implicit",
    "ttl": "30m"
  },
  "reasoning": {
    "effort": "medium",
    "mode": "standard",
    "context": "auto",
    "summary": null
  },
  "safety_identifier": "user_9f4c2a",
  "service_tier": "default",
  "store": true,
  "text": {
    "format": {
      "type": "text"
    },
    "verbosity": "medium"
  },
  "tool_choice": "auto",
  "tools": [],
  "truncation": "disabled",
  "user": null,
  "metadata": {}
}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/responses' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "gpt-6.1-sol",
    "input": "Given me a brief introduction of MoE"
  }'
```

**Response Example**

```json
{
  "id": "resp_0b76b1ba8760fd12006930084b029c8194ac342172eebe0886",
  "object": "response",
  "model": "gpt-6.1-sol",
  "usage": {
    "total_tokens": 190,
    "input_tokens": 15,
    "input_tokens_details": {
      "cached_tokens": 0,
      "cache_write_tokens": 0
    },
    "output_tokens": 175,
    "output_tokens_details": {
      "reasoning_tokens": 0
    }
  },
  "created_at": 1764755531,
  "status": "completed",
  "background": false,
  "error": null,
  "incomplete_details": null,
  "instructions": null,
  "max_output_tokens": null,
  "max_tool_calls": null,
  "output": [
    {
      "id": "msg_0b76b1ba8760fd12006930084b26ac81949851547e292bebd0",
      "type": "message",
      "status": "completed",
      "content": [
        {
          "type": "output_text",
          "annotations": [],
          "logprobs": [],
          "text": "Certainly! Here's a brief introduction to **MoE (Mixture of Experts)**:\n\n---\n\n**Mixture of Experts (MoE)** is an advanced neural network architecture that divides complex tasks among several specialized \"expert\" subnetworks. Each expert handles different parts of the input, and a gating network dynamically routes data to the most relevant experts. This allows the model to scale efficiently, making it possible to train large models with high capacity while keeping computation costs manageable, since only a subset of experts is activated for each input.\n\nMoE has been widely used in natural language processing and large-scale machine learning tasks, notably powering models like Google's Switch Transformer and sparsely activated transformer architectures. The main benefits of MoE include improved performance, better model scalability, and efficient computation by leveraging conditional computation.\n\n---\n\nLet me know if you'd like a deeper explanation or specific applications of MoE!"
        }
      ],
      "role": "assistant"
    }
  ],
  "parallel_tool_calls": true,
  "previous_response_id": null,
  "prompt_cache_key": null,
  "prompt_cache_options": {
    "mode": "implicit",
    "ttl": "30m"
  },
  "reasoning": {
    "effort": "medium",
    "mode": "standard",
    "context": "auto",
    "summary": null
  },
  "safety_identifier": "user_9f4c2a",
  "service_tier": "default",
  "store": true,
  "text": {
    "format": {
      "type": "text"
    },
    "verbosity": "medium"
  },
  "tool_choice": "auto",
  "tools": [],
  "truncation": "disabled",
  "user": null,
  "metadata": {}
}
```

---

## OpenAI / Video / Sora 2 `POST`

_Official Format_

### Sora 2

OpenAI's latest Sora 2 video generation model with significantly improved video quality and duration. Standard version offers an affordable entry point for developers and small businesses. Supports more complex scene understanding, more natural physics simulation, and more precise text-to-video conversion. Can generate up to 60 seconds of HD video, perfect for professional content creation.

`POST https://api.cloudwise.ai/api/v1/videos`

### Overview

This endpoint provides video generation functionality using the Sora 2 model.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| prompt | string | - | required<br>Text prompt that describes the video to generate. |
| input_reference | file | - | Optional<br>Optional image reference that guides generation. |
| model | string | sora-2 | Optional<br>The video generation model to use (allowed values: sora-2, sora-2-pro). Defaults to sora-2. |
| seconds | string | 4 | Optional<br>Clip duration in seconds (allowed values: 4, 8, 12). Defaults to 4 seconds. |
| size | string | 720x1280 | Optional<br>Output resolution formatted as width x height (allowed values: 720x1280, 1280x720, 1024x1792, 1792x1024). Defaults to 720x1280. |

### Request Example

Text-to-Video

Image-to-Video

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/videos' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--form 'prompt="Wide tracking shot of a teal coupe driving through a desert highway, heat ripples visible, hard sun overhead."' \
--form 'model="sora-2"' \
--form 'size="1280x720"' \
--form 'seconds="8"'
```

### Response

The response contains the generated video and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier for the completion |
| model | string | The model used for generating the completion |
| seconds | string | Duration of the generated video |
| size | string | Resolution of the generated video in width x height format |
| status | string | Current processing status of the task |
| created_at | integer | Unix timestamp of when the task was created |
| expires_at | integer | Unix timestamp of when the task expires |
| prompt | string | Text prompt used for the task |
| progress | integer | Current processing progress of the task |
| error | string | Error message if the task failed |
| remixed_from_video_id | string | Whether the video is remixed from another video |
| object | string | Type of the task output object |

#### Example Response

```json
{
  "remixed_from_video_id": null,
  "seconds": "8",
  "expires_at": null,
  "size": "1280x720",
  "created_at": 1767059472,
  "progress": 0,
  "model": "sora-2",
  "id": "**********",
  "error": null,
  "prompt": null,
  "status": "processing",
  "object": "video"
}
```

**Request Example (Text-to-Video)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/videos' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--form 'prompt="Wide tracking shot of a teal coupe driving through a desert highway, heat ripples visible, hard sun overhead."' \
--form 'model="sora-2"' \
--form 'size="1280x720"' \
--form 'seconds="8"'
```

**Request Example (Image-to-Video)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/videos' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--form 'prompt="Replace the characters in the image with female characters. A girl is transported to another world, and upon waking up on the ground, she notices a blue gem in front of her. The girl makes a wish for a bucket of instant noodles, and the gem transforms into instant noodles."' \
--form 'model="sora-2"' \
--form 'size="1280x720"' \
--form 'seconds="8"' \
--form 'input_reference="https://tos-0901-beijing.tos-cn-beijing.bytepluses.com.cn/image-generator/20251224104503_e107e231.jpg"'
```

**Response Example**

```json
{
  "remixed_from_video_id": null,
  "seconds": "8",
  "expires_at": null,
  "size": "1280x720",
  "created_at": 1767059472,
  "progress": 0,
  "model": "sora-2",
  "id": "**********",
  "error": null,
  "prompt": null,
  "status": "processing",
  "object": "video"
}
```

---

## OpenAI / Video / Sora 2 Pro `POST`

_Official Format_

### Sora 2 Pro

OpenAI's advanced Sora 2 Pro is a high-fidelity AI video generation model designed for professional content creators and commercial applications. Features significantly improved video quality, extended duration support, and enhanced scene understanding. Supports multiple aspect ratios (portrait and landscape) with customizable resolution and duration settings. Delivers superior video quality with more natural physics simulation and precise text-to-video conversion. Ideal for brand advertising, product showcases, educational content, and creative productions requiring professional-grade video output.

`POST https://api.cloudwise.ai/api/v1/videos`

### Overview

This endpoint provides video generation functionality using the Sora 2 Pro model.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| prompt | string | - | required<br>Text prompt that describes the video to generate. |
| input_reference | file | - | Optional<br>Optional image reference that guides generation. |
| model | string | sora-2 | Optional<br>The video generation model to use (allowed values: sora-2, sora-2-pro). Defaults to sora-2. |
| seconds | string | 4 | Optional<br>Clip duration in seconds (allowed values: 4, 8, 12). Defaults to 4 seconds. |
| size | string | 720x1280 | Optional<br>Output resolution formatted as width x height (allowed values: 720x1280, 1280x720, 1024x1792, 1792x1024). Defaults to 720x1280. |

### Request Example

Text-to-Video

Image-to-Video

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/videos' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--form 'prompt="Wide tracking shot of a teal coupe driving through a desert highway, heat ripples visible, hard sun overhead."' \
--form 'model="sora-2-pro"' \
--form 'size="1280x720"' \
--form 'seconds="8"'
```

### Response

The response contains the generated video and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier for the completion |
| model | string | The model used for generating the completion |
| seconds | string | Duration of the generated video |
| size | string | Resolution of the generated video in width x height format |
| status | string | Current processing status of the task |
| created_at | integer | Unix timestamp of when the task was created |
| expires_at | integer | Unix timestamp of when the task expires |
| prompt | string | Text prompt used for the task |
| progress | integer | Current processing progress of the task |
| error | string | Error message if the task failed |
| remixed_from_video_id | string | Whether the video is remixed from another video |
| object | string | Type of the task output object |

#### Example Response

```json
{
  "remixed_from_video_id": null,
  "seconds": "8",
  "expires_at": null,
  "size": "1280x720",
  "created_at": 1767059472,
  "progress": 0,
  "model": "sora-2-pro",
  "id": "**********",
  "error": null,
  "prompt": null,
  "status": "processing",
  "object": "video"
}
```

**Request Example (Text-to-Video)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/videos' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--form 'prompt="Wide tracking shot of a teal coupe driving through a desert highway, heat ripples visible, hard sun overhead."' \
--form 'model="sora-2-pro"' \
--form 'size="1280x720"' \
--form 'seconds="8"'
```

**Request Example (Image-to-Video)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/videos' \
--header 'Authorization: Bearer YOUR_API_KEY' \
--form 'prompt="Replace the characters in the image with female characters. A girl is transported to another world, and upon waking up on the ground, she notices a blue gem in front of her. The girl makes a wish for a bucket of instant noodles, and the gem transforms into instant noodles."' \
--form 'model="sora-2-pro"' \
--form 'size="1280x720"' \
--form 'seconds="8"' \
--form 'input_reference="https://tos-0901-beijing.tos-cn-beijing.bytepluses.com.cn/image-generator/20251224104503_e107e231.jpg"'
```

**Response Example**

```json
{
  "remixed_from_video_id": null,
  "seconds": "8",
  "expires_at": null,
  "size": "1280x720",
  "created_at": 1767059472,
  "progress": 0,
  "model": "sora-2-pro",
  "id": "**********",
  "error": null,
  "prompt": null,
  "status": "processing",
  "object": "video"
}
```

---

## OpenAI / Video / Retrieve video `GET`

_Official Format_

### Retrieve video

OpenAI API platform providing access to GPT models and Sora video generation.

`GET https://api.cloudwise.ai/api/v1/videos/{task_id}/content`

### Overview

Query task status and retrieve results.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer YOUR_API_KEY" | required<br>Your API key in the format: `Bearer YOUR_API_KEY` |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string (path) | - | required<br>Append the task ID to the endpoint path. |

### Request Example

```bash
curl -X GET 'https://api.cloudwise.ai/api/v1/videos/{task_id}/content' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

### Response

The response contains task status and results.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| code | string | Response code |
| success | boolean | Whether the request was successful |
| taskStatus | string | Task status |
| data | object | Response data object |
| data.expires_at | integer | Video expiration timestamp |
| data.video | string | Video download URL |

#### Example Response

```json
{
  "code": "10000",
  "data": {
    "expires_at": 1767146160,
    "video": "https://download.cloudwise.ai/arts/{video_id}"
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

**Request Example**

```bash
curl -X GET 'https://api.cloudwise.ai/api/v1/videos/{task_id}/content' \
--header 'Authorization: Bearer YOUR_API_KEY'
```

**Response Example**

```json
{
  "code": "10000",
  "data": {
    "expires_at": 1767146160,
    "video": "https://download.cloudwise.ai/arts/{video_id}"
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

---

## OpenAI / GPT Image / Generate an Image `POST`

_Official Format(Image)_

### Generate an Image

Creates an image given a text prompt. Use the `model` parameter to specify which image generation model to use.

`POST https://api.cloudwise.ai/api/v1/images/generations`

### Supported Models

| Model Name |
| --- |
| `gpt-image-2.5-sunburst` |
| `gpt-image-2.5-flare` |
| `gpt-image-2` |

### Overview

This endpoint generates one or more images from a text prompt using a supported GPT Image model. Use `gpt-image-2.5-sunburst` when output quality and precise instruction following matter most, or `gpt-image-2.5-flare` for faster, high-quality everyday generation. The response returns image data as Base64-encoded strings (`b64_json`), along with token usage details.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `Bearer ak_*****` |
| Content-Type | string | application/json | required<br>Must be set to `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The image generation model to use. **Supported Models:** `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare`, and `gpt-image-2`. |
| prompt | string | - | required<br>A text description of the desired image(s). Maximum length is 32000 characters. |
| n | integer | 1 | The number of images to generate. **It is recommended that users do not pass the `n` parameter. Currently, only `n=1` is supported.** |
| size | string | "auto" | **Supported Models:** All listed models support `auto`, recommended sizes (`1024x1024`, `1536x1024`, and `1024x1536`), and custom `WIDTHxHEIGHT` resolutions. For custom sizes, both edges must be multiples of 16, neither edge may exceed 3840 pixels, the aspect ratio must be between 1:3 and 3:1, and the total pixel count must be between 655,360 and 8,294,400. Outputs above 3,686,400 total pixels (`2560x1440`) are experimental. |
| quality | string | "auto" | **Supported Models:** `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare` support `auto`, `low`, `medium`, `high`, `xhigh`, and `max`. `gpt-image-2` supports up to `high`. |
| output_format | string | "png" | The format of the returned image. Valid values: `png`, `jpeg`, `webp`. |
| output_compression | integer | 100 | Compression level (0-100) for `jpeg` or `webp` output formats. |
| background | string | "auto" | **Supported Models:** All listed models accept `auto`, `transparent`, and `opaque`. Transparent backgrounds are fully supported by both GPT Image 2.5 models and are in preview for `gpt-image-2`. When set to `transparent`, `output_format` must be `png` or `webp`. |
| moderation | string | "auto" | Controls the content moderation level. Valid values: `auto`, `low`. |
| user | string | - | A unique identifier representing your end-user, which can help with monitoring and abuse detection. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/images/generations' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "gpt-image-2.5-sunburst",
    "prompt": "An aerial view of the Shanghai Bund, divided into four scenes representing the years 1860, 1940, 1976, and 2010, with natural transitions between them.",
    "size": "1024x1024",
    "quality": "xhigh",
    "output_format": "jpeg"
}'
```

### Response

Returns an object containing the generated image data and usage information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| created | integer | Unix timestamp (in seconds) of when the image was generated. |
| data | array | The list of generated images. Each item contains:<br>- `b64_json` (string): The Base64-encoded image data.<br>- `revised_prompt` (string): The prompt that was actually used to generate the image, if the model performed prompt revision. |
| model | string | The model used to generate the image. |
| size | string | The resolved size of the generated image. |
| quality | string | The resolved quality used for the generation. |
| background | string | The resolved background setting used for the generation. |
| output_format | string | The resolved output format of the generated image. |
| usage | object | Token usage information for the request. Contains:<br>- `input_tokens` (integer): Total input tokens consumed.<br>- `input_tokens_details` (object): Breakdown of input tokens by `text_tokens` and `image_tokens`.<br>- `output_tokens` (integer): Total output tokens consumed.<br>- `output_tokens_details` (object): Breakdown of output tokens by `text_tokens` and `image_tokens`.<br>- `total_tokens` (integer): Total tokens consumed by this request. |

#### Example Response

```json
{
    "created": 1779700301,
    "data": [
        {
            "b64_json": "/9j/4AAQSkZJRgABAQAAAQABAA....+KqwIZOrSwuocLxnJ7Y5q4rCREl2MmRnDcEVmzMsmYd5DFgKtK7KoVnLD1PWpsVzFtmXb94/nVUqFiaNXOCMc0jyBSAW4PSo2Y9ulCigcyQy7UAIOQPWmFww5H/1qqyTSywypCAkiMozn73rUpb5ssg29cBqqxLkMkv4Ba3Ai8yOZhsPdXGe/oR60iy/aFDEAOBzjv71VtplhuZHuIiYmfJVecjJ4qcRlY0njIU45Q/xD296mL5Wxz96K1P/2Q==",
            "revised_prompt": "A high-quality aerial panoramic view of the Shanghai Bund, naturally divided into four time periods with smooth transitions..."
        }
    ],
    "background": "auto",
    "output_format": "jpeg",
    "quality": "xhigh",
    "size": "1024x1024",
    "model": "gpt-image-2.5-sunburst",
    "usage": {
        "input_tokens": 255,
        "input_tokens_details": {
            "image_tokens": 0,
            "text_tokens": 255
        },
        "output_tokens": 7024,
        "output_tokens_details": {
            "image_tokens": 7024,
            "text_tokens": 0
        },
        "total_tokens": 7279
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/images/generations' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "gpt-image-2.5-sunburst",
    "prompt": "An aerial view of the Shanghai Bund, divided into four scenes representing the years 1860, 1940, 1976, and 2010, with natural transitions between them.",
    "size": "1024x1024",
    "quality": "xhigh",
    "output_format": "jpeg"
}'
```

**Response Example**

```json
{
    "created": 1779700301,
    "data": [
        {
            "b64_json": "/9j/4AAQSkZJRgABAQAAAQABAA....+KqwIZOrSwuocLxnJ7Y5q4rCREl2MmRnDcEVmzMsmYd5DFgKtK7KoVnLD1PWpsVzFtmXb94/nVUqFiaNXOCMc0jyBSAW4PSo2Y9ulCigcyQy7UAIOQPWmFww5H/1qqyTSywypCAkiMozn73rUpb5ssg29cBqqxLkMkv4Ba3Ai8yOZhsPdXGe/oR60iy/aFDEAOBzjv71VtplhuZHuIiYmfJVecjJ4qcRlY0njIU45Q/xD296mL5Wxz96K1P/2Q==",
            "revised_prompt": "A high-quality aerial panoramic view of the Shanghai Bund, naturally divided into four time periods with smooth transitions..."
        }
    ],
    "background": "auto",
    "output_format": "jpeg",
    "quality": "xhigh",
    "size": "1024x1024",
    "model": "gpt-image-2.5-sunburst",
    "usage": {
        "input_tokens": 255,
        "input_tokens_details": {
            "image_tokens": 0,
            "text_tokens": 255
        },
        "output_tokens": 7024,
        "output_tokens_details": {
            "image_tokens": 7024,
            "text_tokens": 0
        },
        "total_tokens": 7279
    }
}
```

---

## OpenAI / GPT Image / Edit an Image `POST`

_Official Format(Image)_

### Edit an Image

Creates an edited or extended image given one or more source images and a prompt. Use the `model` parameter to specify which image generation model to use.

`POST https://api.cloudwise.ai/api/v1/images/edits`

### Supported Models

| Model Name |
| --- |
| `gpt-image-2.5-sunburst` |
| `gpt-image-2.5-flare` |
| `gpt-image-2` |

### Overview

This endpoint edits one or more input images according to a text prompt using a supported GPT Image model. Use `gpt-image-2.5-sunburst` when editing precision matters most, or `gpt-image-2.5-flare` for faster, high-quality everyday edits. The request must be sent as `multipart/form-data`. The response returns the edited image as a Base64-encoded string (`b64_json`), along with token usage details.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `Bearer ak_*****` |
| Content-Type | string | multipart/form-data | required<br>Must be set to `multipart/form-data`. |

### Request Body

The request body must be encoded as `multipart/form-data`.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The image editing model to use. **Supported Models:** `gpt-image-2.5-sunburst`, `gpt-image-2.5-flare`, and `gpt-image-2`. |
| image[] | file \\| array | - | required<br>The image(s) to edit. Must be supported image file(s) such as `png`, `jpeg`, or `webp`. Use repeated `image[]` form fields to provide multiple images. |
| prompt | string | - | required<br>A text description of the desired edits. Maximum length is 32000 characters. |
| mask | file | - | An additional image whose fully transparent areas indicate where the input image should be edited. Must be a valid `png` file and have the same dimensions as the input image. |
| n | integer | 1 | The number of images to generate. **It is recommended that users do not pass the `n` parameter. Currently, only `n=1` is supported.** |
| size | string | "auto" | **Supported Models:** All listed models support `auto`, recommended sizes (`1024x1024`, `1536x1024`, and `1024x1536`), and custom `WIDTHxHEIGHT` resolutions. For custom sizes, both edges must be multiples of 16, neither edge may exceed 3840 pixels, the aspect ratio must be between 1:3 and 3:1, and the total pixel count must be between 655,360 and 8,294,400. Outputs above 3,686,400 total pixels (`2560x1440`) are experimental. |
| quality | string | "auto" | **Supported Models:** `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare` support `auto`, `low`, `medium`, `high`, `xhigh`, and `max`. `gpt-image-2` supports up to `high`. |
| output_format | string | "png" | The format of the returned image. Valid values: `png`, `jpeg`, `webp`. |
| output_compression | integer | 100 | Compression level (0-100) for `jpeg` or `webp` output formats. |
| background | string | "auto" | **Supported Models:** All listed models accept `auto`, `transparent`, and `opaque`. Transparent backgrounds are fully supported by both GPT Image 2.5 models and are in preview for `gpt-image-2`. When set to `transparent`, `output_format` must be `png` or `webp`. |
| input_fidelity | string | "low" | **Supported Models:** `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare` accept `low` or `high`. For `gpt-image-2`, omit this parameter because image inputs are always processed at high fidelity. |
| user | string | - | A unique identifier representing your end-user, which can help with monitoring and abuse detection. |

### Request Example

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/images/edits' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--form 'model="gpt-image-2.5-sunburst"' \
--form 'image[]=@"/path/to/your/image.png"' \
--form 'prompt="Replace the background with a 1945 Pudong scene"' \
--form 'size="1536x1024"' \
--form 'quality="xhigh"' \
--form 'output_format="png"'
```

### Response

Returns an object containing the edited image data and usage information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| created | integer | Unix timestamp (in seconds) of when the image was generated. |
| data | array | The list of edited images. Each item contains:<br>- `b64_json` (string): The Base64-encoded image data.<br>- `revised_prompt` (string): The prompt that was actually used to generate the image, if the model performed prompt revision. |
| model | string | The model used to edit the image. |
| size | string | The resolved size of the generated image. |
| quality | string | The resolved quality used for the generation. |
| background | string | The resolved background setting used for the generation. |
| output_format | string | The resolved output format of the generated image. |
| usage | object | Token usage information for the request. Contains:<br>- `input_tokens` (integer): Total input tokens consumed.<br>- `input_tokens_details` (object): Breakdown of input tokens by `text_tokens` and `image_tokens`.<br>- `output_tokens` (integer): Total output tokens consumed.<br>- `output_tokens_details` (object): Breakdown of output tokens by `text_tokens` and `image_tokens`.<br>- `total_tokens` (integer): Total tokens consumed by this request. |

#### Example Response

```json
{
    "created": 1779716717,
    "data": [
        {
            "b64_json": "iVBORw0KGgoAAAANSUhEUgAA....II=",
            "revised_prompt": "Edit the provided photo by replacing the background with a realistic 1945 Pudong scene. Keep the foreground subjects, composition, and perspective as close as possible to the original."
        }
    ],
    "background": "auto",
    "output_format": "png",
    "quality": "xhigh",
    "size": "1536x1024",
    "model": "gpt-image-2.5-sunburst",
    "usage": {
        "input_tokens": 1160,
        "input_tokens_details": {
            "image_tokens": 1024,
            "text_tokens": 136
        },
        "output_tokens": 5488,
        "output_tokens_details": {
            "image_tokens": 5488,
            "text_tokens": 0
        },
        "total_tokens": 6648
    }
}
```

**Request Example**

```bash
curl --location --request POST 'https://api.cloudwise.ai/api/v1/images/edits' \
--header 'Authorization: Bearer $YOUR_API_KEY' \
--form 'model="gpt-image-2.5-sunburst"' \
--form 'image[]=@"/path/to/your/image.png"' \
--form 'prompt="Replace the background with a 1945 Pudong scene"' \
--form 'size="1536x1024"' \
--form 'quality="xhigh"' \
--form 'output_format="png"'
```

**Response Example**

```json
{
    "created": 1779716717,
    "data": [
        {
            "b64_json": "iVBORw0KGgoAAAANSUhEUgAA....II=",
            "revised_prompt": "Edit the provided photo by replacing the background with a realistic 1945 Pudong scene. Keep the foreground subjects, composition, and perspective as close as possible to the original."
        }
    ],
    "background": "auto",
    "output_format": "png",
    "quality": "xhigh",
    "size": "1536x1024",
    "model": "gpt-image-2.5-sunburst",
    "usage": {
        "input_tokens": 1160,
        "input_tokens_details": {
            "image_tokens": 1024,
            "text_tokens": 136
        },
        "output_tokens": 5488,
        "output_tokens_details": {
            "image_tokens": 5488,
            "text_tokens": 0
        },
        "total_tokens": 6648
    }
}
```

---

## Tencent / Hy4 preview `POST`

_Official Format_

### Hy4 preview

Hy4 preview is Tencent Hy's 770B-parameter MoE flagship model, with 49B parameters activated per token and a 1M-token context window. It is exposed through an OpenAI-compatible Chat Completions interface and targets long-horizon software engineering, document-heavy office work, game development, and scientific research.

`POST https://api.cloudwise.ai/api/v1/chat/completions`

### Supported Models

| Model Name |
| --- |
| `hy4-preview` |
| `hy3` |
| `hy3-preview` |

### Overview

This endpoint provides OpenAI-compatible chat completions for Tencent Hy models. `hy4-preview` is the current flagship, with a 1M-token context window, up to 960K input tokens, and up to 64K output tokens. Tencent officially lists Deep Reasoning (Preserved Thinking), Structured Output, Function Calling, and Caching for `hy4-preview` and `hy3`.

Parameter support labels below follow Tencent Cloud's official [Hy API Guide](https://www.tencentcloud.com/document/product/1300/80695), [OpenAI Chat Completions protocol fields](https://www.tencentcloud.com/document/product/1300/82345), and [model capability list](https://www.tencentcloud.com/document/product/1300/78934). Fields without an explicit Hy model guarantee are marked as model-dependent.

### Headers

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |
| Content-Type | string | application/json | Must be `application/json`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Model identifier. Use hy4-preview, hy3, or hy3-preview.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| messages | array | - | required<br>Array of chat context messages. Supported roles are system, user, assistant, and tool.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| messages[].role | string | - | required<br>Message role: system, user, assistant, or tool.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| messages[].content | string or array | - | Required for system, user, and tool messages. Assistant content may be omitted when tool_calls is present.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: text content is supported; Tencent does not advertise multimodal input for these models. |
| messages[].content[].type | string | - | Content-part type: text, image_url, video_url, or file_url.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: text content is supported; Tencent does not advertise multimodal input for these models. |
| messages[].content[].text | string | - | Text content when the content-part type is text.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: text content is supported; Tencent does not advertise multimodal input for these models. |
| messages[].content[].image_url | object | - | Image information when the content-part type is image_url.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: text content is supported; Tencent does not advertise multimodal input for these models. |
| messages[].content[].image_url.url | string | - | Image HTTP(S) URL or data:image/...;base64,... Data URL.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: text content is supported; Tencent does not advertise multimodal input for these models. |
| messages[].content[].image_url.detail | string | auto | Image resolution policy: auto, low, or high.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: text content is supported; Tencent does not advertise multimodal input for these models. |
| messages[].content[].video_url | object | - | Video information when the content-part type is video_url.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: text content is supported; Tencent does not advertise multimodal input for these models. |
| messages[].content[].video_url.url | string | - | Video HTTP(S) URL.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: text content is supported; Tencent does not advertise multimodal input for these models. |
| messages[].content[].file_url | object | - | File information when the content-part type is file_url.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: text content is supported; Tencent does not advertise multimodal input for these models. |
| messages[].content[].file_url.url | string | - | Direct HTTP file URL; Base64 is not supported for files.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: text content is supported; Tencent does not advertise multimodal input for these models. |
| messages[].reasoning_content | string | - | Reasoning content returned by the model. Pass it back unchanged in multi-turn conversations.<br>**Supported Models:** hy4-preview and hy3: officially support preserved thinking; hy3-preview: reasoning is documented in its official model card, but current TokenHub field compatibility is not explicitly listed. |
| messages[].reasoning_details | array | - | Signed reasoning blocks. Pass the complete array back unchanged in multi-turn conversations.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: accepted by the shared protocol, but Tencent does not explicitly confirm model-level behavior; verify before production use. |
| messages[].tool_calls | array | - | Tool calls from a previous assistant response, passed back when continuing the conversation.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| messages[].tool_calls[].id | string | - | Unique tool-call ID, passed back with the corresponding tool result.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| messages[].tool_calls[].type | string | - | Tool-call type; fixed as function.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| messages[].tool_calls[].function.name | string | - | Name of the function selected by the model.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| messages[].tool_calls[].function.arguments | string | - | Function arguments encoded as a JSON string.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| messages[].tool_call_id | string | - | For a tool-role message, the matching assistant tool_calls[].id value.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| messages[].name | string | - | Optional tool function name on a tool-role message.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| messages[].prefix | boolean | - | DeepSeek continuation-writing extension. It is ignored on the standard endpoint.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: not documented as supported for the Hy family; use the recommended Hy-specific field instead. |
| stream | boolean | false | Whether to return Server-Sent Events (SSE) streaming output.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| stream_options | object | - | Streaming options. Takes effect only when stream is true.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| stream_options.include_usage | boolean | false | Whether the final streaming chunk contains usage statistics.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| temperature | float | 1.0 | Sampling temperature in [0.0, 2.0]. Tencent recommends temperature=0.9 for all three Hy model cards.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| top_p | float | 1.0 | Nucleus sampling threshold in (0.0, 1.0]. A value of 0 is normalized to null.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| max_tokens | integer | model maximum | Maximum generated tokens. Hy4 preview allows up to 64K output; Hy3 allows up to 128K.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| max_completion_tokens | integer | model maximum | OpenAI-compatible alias for max_tokens. Supply only one; this field takes precedence.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| n | integer | 1 | Number of candidate responses. It must be 1 when reasoning is enabled.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: accepted by the shared protocol, but Tencent does not explicitly confirm model-level behavior; verify before production use. |
| stop | string or array | - | Up to four stop sequences.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| seed | integer | - | Random seed; the service makes a best effort to produce consistent output.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: accepted by the shared protocol, but Tencent does not explicitly confirm model-level behavior; verify before production use. |
| frequency_penalty | float | 0 | Frequency penalty in [-2.0, 2.0]. Zero is normalized to null.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: accepted by the shared protocol, but Tencent does not explicitly confirm model-level behavior; verify before production use. |
| presence_penalty | float | 0 | Presence penalty in [-2.0, 2.0]. Zero is normalized to null.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: accepted by the shared protocol, but Tencent does not explicitly confirm model-level behavior; verify before production use. |
| logprobs | boolean | false | Whether to return output-token log probabilities.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: accepted by the shared protocol, but Tencent does not explicitly confirm model-level behavior; verify before production use. |
| top_logprobs | integer | 0 | Returns the top N token probabilities at each position, in [0, 20]. Requires logprobs=true.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: accepted by the shared protocol, but Tencent does not explicitly confirm model-level behavior; verify before production use. |
| reasoning_effort | string | - | Reasoning depth: low, medium, or high. Hy4 preview and Hy3 default to high; Hy3 tool calls map low to high.<br>**Supported Models:** hy4-preview and hy3: officially support preserved thinking; hy3-preview: reasoning is documented in its official model card, but current TokenHub field compatibility is not explicitly listed. |
| response_format | object | {"type":"text"} | Controls text, JSON object, or JSON Schema output.<br>**Supported Models:** hy4-preview and hy3: officially support Structured Output; hy3-preview: not listed in the current TokenHub capability table. |
| response_format.type | string | text | required<br>Format type: text, json_object, or json_schema. Required when response_format is supplied.<br>**Supported Models:** hy4-preview and hy3: officially support Structured Output; hy3-preview: not listed in the current TokenHub capability table. |
| response_format.json_schema | object | - | JSON Schema output configuration. Required when response_format.type is json_schema.<br>**Supported Models:** hy4-preview and hy3: officially support Structured Output; hy3-preview: not listed in the current TokenHub capability table. |
| response_format.json_schema.name | string | - | required<br>Schema name. Required when response_format.type is json_schema.<br>**Supported Models:** hy4-preview and hy3: officially support Structured Output; hy3-preview: not listed in the current TokenHub capability table. |
| response_format.json_schema.schema | object | - | required<br>JSON Schema definition. Required when response_format.type is json_schema.<br>**Supported Models:** hy4-preview and hy3: officially support Structured Output; hy3-preview: not listed in the current TokenHub capability table. |
| response_format.json_schema.strict | boolean | false | Whether to enforce strict JSON Schema matching.<br>**Supported Models:** hy4-preview and hy3: officially support Structured Output; hy3-preview: not listed in the current TokenHub capability table. |
| tools | array | - | List of callable function definitions.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| tools[].type | string | - | required<br>Tool type; fixed as function. Required for each tools item.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| tools[].function | object | - | required<br>Function definition. Required for each tools item.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| tools[].function.name | string | - | required<br>Function name containing letters, numbers, underscores, or hyphens. Required for each tools item.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| tools[].function.description | string | - | Function description used by the model to decide when to call it.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| tools[].function.parameters | object | {} | Function input definition as a JSON Schema object.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| tool_choice | string or object | auto | Tool policy: none, auto, required, or a named function object.<br>**Supported Models:** hy4-preview and hy3: officially support Function Calling; hy3-preview: its official model card includes tool-call parsers, but current TokenHub support is not explicitly listed. |
| parallel_tool_calls | boolean | true | Whether the model may request multiple tool calls in parallel.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: accepted by the shared protocol, but Tencent does not explicitly confirm model-level behavior; verify before production use. |
| thinking | object | - | Standard reasoning-mode configuration.<br>**Supported Models:** hy4-preview and hy3: officially support preserved thinking; hy3-preview: reasoning is documented in its official model card, but current TokenHub field compatibility is not explicitly listed. |
| thinking.type | string | - | required<br>enabled, disabled, or adaptive. Required when thinking is supplied; available values vary by model.<br>**Supported Models:** hy4-preview and hy3: officially support preserved thinking; hy3-preview: reasoning is documented in its official model card, but current TokenHub field compatibility is not explicitly listed. |
| thinking.budget_tokens | integer | 8192 | Expected reasoning-token budget, not a strict cutoff. Auto-filled when thinking.type is enabled.<br>**Supported Models:** hy4-preview and hy3: officially support preserved thinking; hy3-preview: reasoning is documented in its official model card, but current TokenHub field compatibility is not explicitly listed. |
| enable_thinking | boolean | - | Simplified reasoning switch intended for DeepSeek and some other models. Prefer thinking.type.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: not documented as supported for the Hy family; use the recommended Hy-specific field instead. |
| thinking_budget | integer | - | Simplified reasoning budget used with enable_thinking. Prefer thinking.budget_tokens.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: not documented as supported for the Hy family; use the recommended Hy-specific field instead. |
| interleaved_thinking | boolean | - | Extended interleaved reasoning mode. Unsupported models ignore this field.<br>**Supported Models:** hy4-preview: Tencent documents an interleaved reasoning and tool-calling workflow; hy3 and hy3-preview: boolean-field support is not explicitly documented. |
| reasoning_split | boolean | - | Extended mode that separates reasoning and final answer segments. Unsupported models ignore it.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: accepted by the shared protocol, but Tencent does not explicitly confirm model-level behavior; verify before production use. |
| prompt_cache_key | string | - | Manual prompt-cache key. Cache hits are reported in usage.prompt_tokens_details.cached_tokens.<br>**Supported Models:** hy4-preview and hy3: officially support caching; hy3-preview: current TokenHub support is not explicitly listed. |
| user | string | - | End-user identifier passed to the model service for abuse detection and usage tracking.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| user_id | string or number | - | Platform-level end-user identifier. It is converted to a string and is not passed to the model service.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| safety_identifier | string | - | Security identifier used for user-level content moderation tracking.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: available through the shared Chat Completions protocol. |
| extra_body | object | - | Additional provider parameters. The platform may merge them into the request or the model service may ignore them.<br>**Supported Models:** hy4-preview, hy3, and hy3-preview: accepted by the shared protocol, but Tencent does not explicitly confirm model-level behavior; verify before production use. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "hy4-preview",
    "messages": [
        {
            "role": "user",
            "content": "Briefly explain what reinforcement learning is."
        }
    ]
}'
```

### Response

The response contains the generated chat completion.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier for the completion. |
| object | string | Object type, always `chat.completion`. |
| created | integer | Unix timestamp of when the completion was created. |
| model | string | The model used for the completion. |
| choices | array | List of completion choices. Each contains `message.content`, `message.reasoning_content` (chain-of-thought), and `finish_reason`. |
| usage | object | Token usage stats: `prompt_tokens`, `completion_tokens`, `total_tokens`. |

#### Example Response

```json
{
    "id": "chatcmpl-a1b2c3d4e5",
    "object": "chat.completion",
    "created": 1779321600,
    "model": "hy4-preview",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "reasoning_content": "The user wants a concise definition of reinforcement learning. Cover agent, environment, actions, rewards, and policy optimization.",
                "content": "Reinforcement learning is a machine learning paradigm where an agent learns to make decisions by interacting with an environment, receiving rewards or penalties, and adjusting its policy to maximize cumulative reward over time."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 28,
        "completion_tokens": 42,
        "total_tokens": 70
    }
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -d '{
    "model": "hy4-preview",
    "messages": [
        {
            "role": "user",
            "content": "Briefly explain what reinforcement learning is."
        }
    ]
}'
```

**Response Example**

```json
{
    "id": "chatcmpl-a1b2c3d4e5",
    "object": "chat.completion",
    "created": 1779321600,
    "model": "hy4-preview",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "reasoning_content": "The user wants a concise definition of reinforcement learning. Cover agent, environment, actions, rewards, and policy optimization.",
                "content": "Reinforcement learning is a machine learning paradigm where an agent learns to make decisions by interacting with an environment, receiving rewards or penalties, and adjusting its policy to maximize cumulative reward over time."
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 28,
        "completion_tokens": 42,
        "total_tokens": 70
    }
}
```

---

## Vidu / viduq3 / Text-to-Video `POST`

_Official Format_

### Text-to-Video

The Vidu text-to-video API generates high-quality videos from text prompts. Supports viduq3-turbo, viduq3-mix, and viduq3-pro models with configurable duration, resolution, aspect ratio, and audio-visual synchronization.

`POST https://api.cloudwise.ai/api/ent/v2/text2video`

### Supported Models

| Model Name |
| --- |
| `viduq3-turbo` |
| `viduq3-mix` |
| `viduq3-pro` |

### Overview

The Vidu text-to-video endpoint creates an asynchronous generation task and returns a `task_id`. Use the query API to poll the task status and retrieve the generated video. All three models — `viduq3-turbo`, `viduq3-mix`, and `viduq3-pro` — share the same request format; `viduq3-pro` is shown as the default example.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Content-Type | string | application/json | required<br>Data exchange format. |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |

### Request Body

| Parameter | Type | Description |
| --- | --- | --- |
| model | string | required<br>Model name. Accepted values: `viduq3-turbo`, `viduq3-mix`, `viduq3-pro`. |
| prompt | string | required<br>Text prompt. A textual description for video generation, with a maximum length of 5000 characters. |
| style | string | The style of the output video. Defaults to `general`. Accepted values: `general`, `anime`. Note: this parameter is not effective when using q2 or q3 models. |
| duration | int | Video duration. For `viduq3-pro` / `viduq3-turbo`: default `5` seconds, available `1 - 16`. |
| seed | int | Random seed. Defaults to a random seed number. Manually set values will override the default random seed. |
| aspect_ratio | string | The aspect ratio of the output video. Defaults to `16:9`. Accepted values: `16:9`, `9:16`, `3:4`, `4:3`, `1:1`. Note: `3:4` & `4:3`only support q2 & q3 models. |
| resolution | string | Resolution. For `viduq3-pro` / `viduq3-turbo` (1 - 16s): default `720p`, available `540p`, `720p`, `1080p`. |
| movement_amplitude | string | The movement amplitude of objects in the frame. Defaults to `auto`. Accepted values: `auto`, `small`, `medium`, `large`. This parameter does not take effect when using the q2 & q3 models. |
| bgm | bool | Whether to add background music to the generated video (not available for q3 models). Default: `false`. Acceptable values: `true`, `false`. |
| audio | bool | Whether to use direct audio-video generation capability. Default: `true`. Enumerated values: `false` (no direct audio-video generation, outputs silent video), `true` (audio-video synchronization, outputs video with sound). Note: only the q3 models support this parameter. |
| payload | string | Transparent transmission parameters. No processing, only data transmission, with a maximum length of 1048576 characters. |
| off_peak | bool | Off-peak mode. Defaults to `false`. When `true`, consumes lower points; tasks submitted in off-peak mode will be generated within 48 hours, and uncompleted tasks are automatically cancelled with points refunded. |
| callback_url | string | Callback URL. When the video generation task changes its status, Vidu sends a POST callback request to this URL with the latest task status. The callback body matches the GET query result body. |

### Request Example

viduq3-pro

```bash
curl -X POST https://api.cloudwise.ai/api/ent/v2/text2video \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "viduq3-pro",
    "prompt": "In an ultra-realistic fashion photography style featuring light blue and pale amber tones, an astronaut in a spacesuit walks through the fog. The background consists of enchanting white and golden lights, creating a minimalist still life and an impressive panoramic scene.",
    "duration": 5,
    "seed": 0,
    "aspect_ratio": "16:9",
    "resolution": "720p",
    "movement_amplitude": "auto",
    "off_peak": false
}'
```

### Response

This endpoint returns asynchronous task information including the task ID and state.

```json
{
  "id": "MTUyMDE0NjIyODc3Mjg3NjI4ODo6MjAyNi0wNi0yNiAxOToxODoyMw==",
  "state": "created",
  "model": "viduq3-pro",
  "type": "text2video",
  "vendor": "vidu",
  "style": "general",
  "prompt": "In an ultra-realistic fashion photography style featuring light blue and pale amber tones, an astronaut in a spacesuit walks through the fog. The background consists of enchanting white and golden lights, creating a minimalist still life and an impressive panoramic scene.",
  "duration": 5,
  "seed": 27158124,
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "movement_amplitude": "auto",
  "audio_type": "all",
  "images": [],
  "payload": "",
  "credits": 100,
  "is_rec": false,
  "cus_priority": 0,
  "off_peak": false,
  "watermark": true,
  "wm_url": "",
  "wm_position": "unspecified",
  "client_request_id": "",
  "meta_data": "",
  "success": true,
  "created_at": "2026-06-26T11:18:27.258342741Z"
}
```

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Task ID. Use this ID to query the generation result. |
| state | string | Current processing state: `created`, `queueing`, `processing`, `success`, `failed`. |
| model | string | The model parameter used for this call. |
| type | string | The task type, e.g. text2video. |
| vendor | string | The underlying vendor of the model. |
| style | string | The style parameter used for this call. |
| prompt | string | The text prompt used for this call. |
| duration | int | The video duration parameter used for this call. |
| seed | int | The random seed used for this call. |
| aspect_ratio | string | The aspect ratio parameter used for this call. |
| resolution | string | The resolution parameter used for this call. |
| movement_amplitude | string | The camera movement amplitude parameter used for this call. |
| audio_type | string | The audio type for this call. |
| images | array | The list of input images (empty for text-to-video). |
| payload | string | The payload parameter used for this call. |
| credits | int | The credits consumed by this call. |
| cus_priority | int | Customer priority of the task. |
| off_peak | bool | The off_peak parameter used for this call. |
| watermark | bool | Whether the output video carries a watermark. |
| success | bool | Whether the task was submitted successfully. |
| created_at | string | Task creation time. |

**Request Example (viduq3-pro)**

```bash
curl -X POST https://api.cloudwise.ai/api/ent/v2/text2video \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "viduq3-pro",
    "prompt": "In an ultra-realistic fashion photography style featuring light blue and pale amber tones, an astronaut in a spacesuit walks through the fog. The background consists of enchanting white and golden lights, creating a minimalist still life and an impressive panoramic scene.",
    "duration": 5,
    "seed": 0,
    "aspect_ratio": "16:9",
    "resolution": "720p",
    "movement_amplitude": "auto",
    "off_peak": false
}'
```

**Response Example**

```json
{
  "id": "MTUyMDE0NjIyODc3Mjg3NjI4ODo6MjAyNi0wNi0yNiAxOToxODoyMw==",
  "state": "created",
  "model": "viduq3-pro",
  "type": "text2video",
  "vendor": "vidu",
  "style": "general",
  "prompt": "In an ultra-realistic fashion photography style featuring light blue and pale amber tones, an astronaut in a spacesuit walks through the fog. The background consists of enchanting white and golden lights, creating a minimalist still life and an impressive panoramic scene.",
  "duration": 5,
  "seed": 27158124,
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "movement_amplitude": "auto",
  "audio_type": "all",
  "images": [],
  "payload": "",
  "credits": 100,
  "is_rec": false,
  "cus_priority": 0,
  "off_peak": false,
  "watermark": true,
  "wm_url": "",
  "wm_position": "unspecified",
  "client_request_id": "",
  "meta_data": "",
  "success": true,
  "created_at": "2026-06-26T11:18:27.258342741Z"
}
```

---

## Vidu / viduq3 / Query Result `GET`

_Official Format_

### Query Result

Retrieve the latest status and output of a Vidu generation task by `task_id` in the path. Returns the generated video URL and cover image when the task state is `success`.

`GET https://api.cloudwise.ai/api/ent/v2/tasks/{id}/creations`

### Supported Models

| Model Name |
| --- |
| `viduq3-turbo` |
| `viduq3-mix` |
| `viduq3-pro` |

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |

### Path Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | string | required<br>Task ID returned by the create request (the `id` field). |

### Request Example

```bash
curl --request GET \
  --url https://api.cloudwise.ai/api/ent/v2/tasks/{id}/creations \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

### Response

```json
{
  "code": "10000",
  "data": {
    "id": "MTUyMDE0NjIyODc3Mjg3NjI4ODo6MjAyNi0wNi0yNiAxOToxODoyMw==",
    "state": "success",
    "model": "viduq3-pro",
    "type": "text2video",
    "vendor": "vidu",
    "template": "",
    "aspect_ratio": "16:9",
    "resolution": "720p",
    "duration": 5,
    "bgm": false,
    "off_peak": false,
    "audio": true,
    "credits": 100,
    "cus_priority": 0,
    "payload": "",
    "err_code": "",
    "err_msg": "",
    "progress": 100,
    "creations": [
      {
        "id": "968050857205579776",
        "url": "https://download.cloudwise.ai/arts/1520146228772876288",
        "cover_url": "https://video.cf.vidu.com/.../cover.jpeg?Expires=...&Signature=...",
        "watermarked_url": "https://video.cf.vidu.com/.../watermarked.mp4?...",
        "speech_url": "",
        "sound_url": "",
        "bgm_url": "",
        "text_content": "",
        "attachments": [],
        "moderation_url": [],
        "video": {
          "duration": 0,
          "fps": 0,
          "resolution": null
        }
      }
    ]
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| code | string | Business status code. `10000` indicates success. |
| data | object | The task details object. |
| data.id | string | Task ID. |
| data.state | string | Task processing state: `created`, `queueing`, `processing`, `success`, `failed`. |
| data.model | string | The model used for this task. |
| data.type | string | The task type, e.g. text2video. |
| data.vendor | string | The underlying vendor of the model. |
| data.aspect_ratio | string | The aspect ratio used for this task. |
| data.resolution | string | The resolution used for this task. |
| data.duration | int | The video duration used for this task. |
| data.bgm | bool | Whether bgm was used for this task. |
| data.off_peak | bool | Whether off-peak mode was used for this task. |
| data.audio | bool | Whether audio-video synchronization was used. |
| data.credits | int | The number of credits consumed by this task. |
| data.payload | string | The payload parameter used for this call. |
| data.err_code | string | Error code. Empty on success. |
| data.err_msg | string | Error message. Empty on success. |
| data.progress | int | Task progress, 0 - 100. |
| data.creations | array | Generated results. Returned when the task state is success. |
| data.creations[].id | string | Creation ID. |
| data.creations[].url | string | The URL of the generated result. |
| data.creations[].cover_url | string | The cover image URL of the generated result. The signed link is valid for a limited time. |
| data.creations[].watermarked_url | string | The watermarked video URL. The signed link is valid for a limited time. |
| data.creations[].video | object | Video metadata such as duration, fps, and resolution. |
| success | bool | Whether the request succeeded. |
| taskStatus | string | Overall task status, e.g. `COMPLETED`. |

**Request Example**

```bash
curl --request GET \
  --url https://api.cloudwise.ai/api/ent/v2/tasks/{id}/creations \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

**Response Example**

```json
{
  "code": "10000",
  "data": {
    "id": "MTUyMDE0NjIyODc3Mjg3NjI4ODo6MjAyNi0wNi0yNiAxOToxODoyMw==",
    "state": "success",
    "model": "viduq3-pro",
    "type": "text2video",
    "vendor": "vidu",
    "template": "",
    "aspect_ratio": "16:9",
    "resolution": "720p",
    "duration": 5,
    "bgm": false,
    "off_peak": false,
    "audio": true,
    "credits": 100,
    "cus_priority": 0,
    "payload": "",
    "err_code": "",
    "err_msg": "",
    "progress": 100,
    "creations": [
      {
        "id": "968050857205579776",
        "url": "https://download.cloudwise.ai/arts/1520146228772876288",
        "cover_url": "https://video.cf.vidu.com/.../cover.jpeg?Expires=...&Signature=...",
        "watermarked_url": "https://video.cf.vidu.com/.../watermarked.mp4?...",
        "speech_url": "",
        "sound_url": "",
        "bgm_url": "",
        "text_content": "",
        "attachments": [],
        "moderation_url": [],
        "video": {
          "duration": 0,
          "fps": 0,
          "resolution": null
        }
      }
    ]
  },
  "success": true,
  "taskStatus": "COMPLETED"
}
```

---

## Vidu / viduq4 / Reference-to-Video `POST`

_Internal Preview_

### Reference-to-Video

The Vidu Q4 reference-to-video API generates a video from multiple reference images, optional reference audio, and a text prompt. It supports synchronized speech and sound generation.

`POST https://api.cloudwise.ai/api/ent/v2/reference2video`

### Supported Models

| Model Name |
| --- |
| `viduq4` |

### Overview

This endpoint creates an asynchronous `viduq4` generation task. The response includes a `task_id`; use the query endpoint to poll the task state and retrieve the generated video.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Content-Type | string | application/json | required<br>Data exchange format. |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |

### Request Body

| Parameter | Type | Description |
| --- | --- | --- |
| model | string | required<br>Model name. Available value: `viduq4`. Vidu Q4 supports reference to 1-12 images and 0-3 audio clips. |
| images | array[string] | Multiple images are supported. Q4 supports uploading 1-12 images. Image Base64 encoding or image URLs are supported, with `png`, `jpeg`, `jpg`, and `webp` formats. The HTTP body must not exceed 20 MB. |
| sounds | array[string] | Up to 0-3 audio files are supported. Each reference audio must be 3-12 seconds, use `mp3` format, and not exceed 50 MB. The HTTP body must not exceed 20 MB. |
| prompt | string | required<br>Text description for video generation. Maximum length: 5,000 characters. |
| duration | int | Video duration in seconds. Defaults to `5`; accepted range is `3-16`. |
| seed | int | Random seed. When omitted or set to 0, the service generates a random seed. |
| aspect_ratio | string | Output aspect ratio. Defaults to `16:9`. Accepted values: `1:1`, `9:16`, `16:9`, `3:4`, and `4:3`. |
| audio | bool | Whether to generate audio together with the video. Q4 defaults to `true`.`false` returns a silent video; `true` enables synchronized speech and sound. |
| resolution | string | Resolution. The default depends on the model and video duration. For `viduq4`, the default is `720p`; accepted values are `540p`, `720p`, `1080p`, `2K`, and `4K`. |
| payload | string | Pass-through parameter transmitted without processing. Maximum length: 1,048,576 characters. |
| callback_url | string | Callback protocol. Set `callback_url` when creating the task. Vidu sends a POST callback containing the latest task status when it changes. The callback body has the same structure as the Query Task API response. For `processing`, `success`, and `failed` callbacks, Vidu retries delivery three times if delivery fails. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/ent/v2/reference2video \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "model": "viduq4",
    "images": [
      "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png",
      "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png",
      "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-3.png"
    ],
    "sounds": [
      "https://scene-aliyun.vidu.zone/media-asset/022634-H3gq7ivRZgfAYKs3.mp3"
    ],
    "prompt": "In the scene of reference image 1, reference image 2 uses reference audio 1 to say to reference image 3: What are you doing? Reference image 3 excitedly says: Q4 is selling well!!!",
    "duration": 5,
    "seed": 0,
    "aspect_ratio": "3:4",
    "audio": true,
    "resolution": "1080p",
    "watermark": true,
    "wm_position": 3
}'
```

### Response

```json
{
  "task_id": "your_task_id_here",
  "state": "created",
  "model": "viduq4",
  "images": [
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png"
  ],
  "sounds": [
    "your_reference_sound1"
  ],
  "prompt": "In the scene of reference image 1, reference image 2 uses reference audio 1 to say to reference image 3: What are you doing?",
  "duration": 5,
  "seed": 123456,
  "aspect_ratio": "3:4",
  "resolution": "1080p",
  "payload": "",
  "off_peak": false,
  "credits": 4,
  "watermark": true,
  "created_at": "2026-09-29T10:00:00.000000Z"
}
```

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| task_id | string | Task ID generated by Vidu. |
| state | string | Processing status. Available values: `created`, `queueing`, `processing`, `success`, and `failed`. |
| model | string | The name of the model called for this request. |
| prompt | string | The prompt parameter of this request. |
| images | array[string] | Image parameters for this request. |
| duration | int | The video duration parameter of this request. |
| seed | int | The random seed parameter for this request. |
| aspect_ratio | string | The ratio parameter of this request. |
| resolution | string | The resolution parameter of this request. |
| payload | string | The pass-through parameters supplied in this request. |
| credits | int | Number of credits used for this request. |
| created_at | string | Task creation time. |

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/ent/v2/reference2video \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "model": "viduq4",
    "images": [
      "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png",
      "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png",
      "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-3.png"
    ],
    "sounds": [
      "https://scene-aliyun.vidu.zone/media-asset/022634-H3gq7ivRZgfAYKs3.mp3"
    ],
    "prompt": "In the scene of reference image 1, reference image 2 uses reference audio 1 to say to reference image 3: What are you doing? Reference image 3 excitedly says: Q4 is selling well!!!",
    "duration": 5,
    "seed": 0,
    "aspect_ratio": "3:4",
    "audio": true,
    "resolution": "1080p",
    "watermark": true,
    "wm_position": 3
}'
```

**Response Example**

```json
{
  "task_id": "your_task_id_here",
  "state": "created",
  "model": "viduq4",
  "images": [
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png"
  ],
  "sounds": [
    "your_reference_sound1"
  ],
  "prompt": "In the scene of reference image 1, reference image 2 uses reference audio 1 to say to reference image 3: What are you doing?",
  "duration": 5,
  "seed": 123456,
  "aspect_ratio": "3:4",
  "resolution": "1080p",
  "payload": "",
  "off_peak": false,
  "credits": 4,
  "watermark": true,
  "created_at": "2026-09-29T10:00:00.000000Z"
}
```

---

## Vidu / viduq4 / Image-to-Video `POST`

_Internal Preview_

### Image-to-Video

The Vidu Q4 image-to-video API generates a video from one first-frame image and an optional text prompt.

`POST https://api.cloudwise.ai/api/ent/v2/img2video`

### Supported Models

| Model Name |
| --- |
| `viduq4` |

### Overview

This endpoint creates an asynchronous `viduq4` generation task from one first-frame image. The response includes a `task_id`; use the Query Result API to poll the task state and retrieve the generated video.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Content-Type | string | application/json | required<br>Data exchange format. |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |

### Request Body

| Parameter | Type | Description |
| --- | --- | --- |
| model | string | required<br>Model name. Available value: `viduq4`. Vidu Q4 supports simultaneous audio-and-video generation and automatic shot transitions. |
| images | array[string] | required<br>First-frame image. Supports Base64-encoded images or image URLs. Only one image is supported, in `png`, `jpeg`, `jpg`, or `webp` format. The image size must not exceed 50 MB, and the HTTP body must be smaller than 20 MB. |
| prompt | string | Text prompt describing the video to generate. Maximum length: 5,000 characters. |
| duration | int | Video duration in seconds. Defaults to `5`; accepted range is `3-16`. |
| seed | int | Random seed. If omitted or set to 0, a random number is used; otherwise the specified seed is used. |
| resolution | string | Resolution. The default depends on the model and video duration. For `viduq4`, the default is `720p`; accepted values are `540p`, `720p`, `1080p`, `2K`, and `4K`. |
| payload | string | Pass-through parameter transmitted without processing. Maximum length: 1,048,576 characters. |
| callback_url | string | Callback protocol. Set `callback_url` when creating the task. Vidu sends a POST callback containing the latest task status when it changes. The callback body has the same structure as the Query Task API response. For `processing`, `success`, and `failed` callbacks, Vidu retries delivery three times if delivery fails. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/ent/v2/img2video \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "model": "viduq4",
    "images": [
      "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png"
    ],
    "prompt": "Generate an abstract video based on the image content.",
    "duration": 5,
    "seed": 0,
    "aspect_ratio": "3:4",
    "audio": true,
    "resolution": "1080p",
    "watermark": true,
    "wm_position": 3
}'
```

### Response

```json
{
  "task_id": "your_task_id_here",
  "state": "created",
  "model": "viduq4",
  "images": [
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png"
  ],
  "prompt": "Generate an abstract video based on the image content.",
  "duration": 5,
  "seed": 123456,
  "resolution": "1080p",
  "payload": "",
  "credits": 4,
  "created_at": "2026-09-29T10:00:00.000000Z"
}
```

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| task_id | string | Task ID generated by Vidu. |
| state | string | Processing status. Available values: `created`, `queueing`, `processing`, `success`, and `failed`. |
| model | string | Model used for this request. |
| prompt | string | Prompt supplied for this request. |
| images | array[string] | Image parameters supplied for this request. |
| duration | int | Video duration supplied for this request. |
| seed | int | Random seed supplied for this request. |
| resolution | string | Resolution supplied for this request. |
| payload | string | Pass-through parameter supplied for this request. |
| credits | int | Number of credits used for this request. |
| created_at | string | Task creation time. |

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/ent/v2/img2video \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "model": "viduq4",
    "images": [
      "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png"
    ],
    "prompt": "Generate an abstract video based on the image content.",
    "duration": 5,
    "seed": 0,
    "aspect_ratio": "3:4",
    "audio": true,
    "resolution": "1080p",
    "watermark": true,
    "wm_position": 3
}'
```

**Response Example**

```json
{
  "task_id": "your_task_id_here",
  "state": "created",
  "model": "viduq4",
  "images": [
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png"
  ],
  "prompt": "Generate an abstract video based on the image content.",
  "duration": 5,
  "seed": 123456,
  "resolution": "1080p",
  "payload": "",
  "credits": 4,
  "created_at": "2026-09-29T10:00:00.000000Z"
}
```

---

## Vidu / viduq4 / Query Result `GET`

_Internal Preview_

### Query Result

Retrieve the latest status and generated assets for a Vidu Q4 image-to-video or reference-to-video task.

`GET https://api.cloudwise.ai/api/ent/v2/tasks/{id}/creations`

### Supported Models

| Model Name |
| --- |
| `viduq4` |

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | - | required<br>Bearer token authentication. Example: `Bearer YOUR_API_KEY`. |

### Path Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| id | string | required<br>Task ID returned by a `viduq4` image-to-video or reference-to-video create request. |

### Request Example

```bash
curl --request GET \
  --url https://api.cloudwise.ai/api/ent/v2/tasks/{id}/creations \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

### Response

```json
{
  "id": "your_task_id_here",
  "state": "success",
  "err_code": "",
  "credits": 4,
  "payload": "",
  "bgm": false,
  "off_peak": false,
  "creations": [
    {
      "id": "your_creations_id",
      "url": "your_generated_results_url",
      "cover_url": "your_generated_results_cover_url",
      "watermarked_url": "your_generated_results_watermarked_url"
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Task ID. |
| state | string | Task state: `created`, `queueing`, `processing`, `success`, or `failed`. |
| err_code | string | Error code. Empty when the task succeeds. |
| credits | int | Credits consumed by the task. |
| payload | string | The pass-through payload from task creation. |
| bgm | bool | Whether background music was used. |
| off_peak | bool | Whether off-peak mode was used. |
| creations | array | Generated result objects. |
| creations[].id | string | Generated result ID. |
| creations[].url | string | Generated video URL, valid for 24 hours. |
| creations[].cover_url | string | Generated video cover URL, valid for 24 hours. |
| creations[].watermarked_url | string | Watermarked video URL, valid for 24 hours. |

**Request Example**

```bash
curl --request GET \
  --url https://api.cloudwise.ai/api/ent/v2/tasks/{id}/creations \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

**Response Example**

```json
{
  "id": "your_task_id_here",
  "state": "success",
  "err_code": "",
  "credits": 4,
  "payload": "",
  "bgm": false,
  "off_peak": false,
  "creations": [
    {
      "id": "your_creations_id",
      "url": "your_generated_results_url",
      "cover_url": "your_generated_results_cover_url",
      "watermarked_url": "your_generated_results_watermarked_url"
    }
  ]
}
```

---

## Unified API / Create Video `POST`

_Official Format_

### Create Video

Unified video generation API supporting multiple providers and models for text-to-video and image-to-video generation.

`POST https://api.cloudwise.ai/api/v1/video-generation/submit`

### Supported Models

| Provider | Model Name |
| --- | --- |
| AliCloud | `wan2.5-t2v-preview` |
| AliCloud | `wan2.5-i2v-preview` |
| AliCloud | `wan2.6-t2v` |
| AliCloud | `wan2.6-i2v` |
| Byteplus | `seedance-1.5-pro` |
| Byteplus | `seedance-1.0-pro` |
| Byteplus | `seedance-1.0-pro-fast` |
| FlashVSR | `flashvsr` |
| Google | `veo-3.1-generate-preview` |
| Google | `veo-3.1-fast-generate-preview` |
| OpenAI | `sora-2` |
| OpenAI | `sora-2-pro` |

### Overview

This unified endpoint provides video generation functionality supporting multiple providers and models. You can generate videos using text prompts or image inputs through a single API interface. The endpoint supports various video generation models from AliCloud, Byteplus, FlashVSR, Google, and OpenAI, allowing you to choose the best model for your specific use case. The API supports asynchronous processing and returns a task ID that can be used to query the generation status and retrieve the final video.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Content-Type | string | - | required<br>Must be set to `application/json`. |
| Authorization | string | - | required<br>The API uses cloudwise-maas API-Key for authentication. Example: `Bearer ak-xxxx`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The model to use. |
| content | object | - | required<br>Content object containing prompt, image, video, or audio inputs. |
| content.prompt | string | - | required<br>Text prompt. Used to describe the elements and visual characteristics expected in the generated video. |
| content.image_url | string | - | Image reference or first frame that guides generation.<br>For sora-2 & sora-2-pro, the resolution of the image must be `720x1280`, `1280x720`, `1024x1792`, or `1792x1024`. |
| content.image_url_last | string | - | Last frame image (only applicable to `seedance-1.5-pro` & `seedance-1.0-pro`). Must be used together with `image_url`. |
| content.video_url | string | - | Video input for video extension (only applicable to flashvsr). |
| content.audio_url | string | - | Audio input (only applicable to wan models). |
| duration | integer | - | Duration of the generated video in seconds.<br>Valid values:<br>- For `wan2.5-preview` models: `5` \| `10`, default 5<br>- For `wan2.6` models: `5` \| `10` \| `15`, default 5<br>- For `seedance-1.5-pro`: 4-12, or -1 (auto-detect duration)<br>- For `seedance-1.0-pro` & `seedance-1.0-pro-fast`: 2-12<br>- For veo models: 4, 6, 8 seconds (1080p / 4k or reference image require 8s)<br>- For sora models: `4`, `8`, `12` |
| resolution | string | - | Video resolution.<br>Valid Values:<br>- For `wan2.5-t2v-preview`:<br>480P<br>`832*480`: 16:9<br>`480*832`: 9:16<br>`624*624`: 1:1<br>720P<br>`1280*720`: 16:9<br>`720*1280`: 9:16<br>`960*960`: 1:1<br>`1088*832`: 4:3<br>`832*1088`: 3:4<br>1080P<br>`1920*1080`: 16:9<br>`1080*1920`: 9:16<br>`1440*1440`: 1:1<br>`1632*1248`: 4:3<br>`1248*1632`: 3:4<br>- For `wan2.6-t2v`:<br>720P<br>`1280*720`: 16:9<br>`720*1280`: 9:16<br>`960*960`: 1:1<br>`1088*832`: 4:3<br>`832*1088`: 3:4<br>1080P<br>`1920*1080`: 16:9<br>`1080*1920`: 9:16<br>`1440*1440`: 1:1<br>`1632*1248`: 4:3<br>`1248*1632`: 3:4<br>- For `wan2.5-i2v-preview` & seedance: `480p`, `720p`, `1080p`<br>- For `wan2.6-i2v`: `720p`, `1080p`<br>- For `flashvsr`: `720p`, `1080p`, `2k`, `4k`<br>- For veo models: `720p`, `1080p` (8 seconds only), `4k` (8 seconds only). When using video extension service, only `720p` is available.<br>- For sora models: `720x1280`, `1280x720`, `1024x1792`, `1792x1024` |
| prompt_extend | boolean | - | Only applicable to wan models. |
| shot_type | string | - | Shot type: `multi` or `single`. Only applicable to `wan2.6`. |
| generate_audio | boolean | - | Only applicable to `seedance-1.5-pro`. |
| camera_fixed | boolean | - | Only applicable to seedance models. |

### Request Example

wan2.6-i2v

seedance-1.5-pro

flashvsr

veo

sora

```bash
curl -X POST https://api.cloudwise.ai/api/v1/video-generation/submit \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "wan2.6-i2v",
    "content": {
        "prompt":"Create a 360-degree orbiting camera shot based on this photo.",
        "image_url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_first_frame.jpeg",
        "image_url_last":"",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250929/stjqnq/example.mp3"
    },
    "duration": 5,
    "resolution": "720p",
    "prompt_extend": true,
    "shot_type": "single"
}'
```

### Response

The response contains the generated video task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| success | boolean | Whether the request was successful. |
| id | string | Task ID returned from the create video task request. |

#### Example Response

```json
{
    "success": true,
    "id": "MTQ*************OA=="
}
```

**Request Example (wan2.6-i2v)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/video-generation/submit \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "wan2.6-i2v",
    "content": {
        "prompt":"Create a 360-degree orbiting camera shot based on this photo.",
        "image_url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_first_frame.jpeg",
        "image_url_last":"",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250929/stjqnq/example.mp3"
    },
    "duration": 5,
    "resolution": "720p",
    "prompt_extend": true,
    "shot_type": "single"
}'
```

**Request Example (seedance-1.5-pro)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/video-generation/submit \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-1-5-pro",
    "content": {
        "prompt": "The girl in the frame says Cheese to the camera, with a 360-degree orbiting camera shot",
        "image_url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_first_frame.jpeg",
        "image_url_last": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_last_frame.jpeg"
    },
    "duration": 5,
    "resolution": "720p",
    "aspect_ratio": "16:9",
    "generate_audio": true,
    "camera_fixed": true
}'
```

**Request Example (flashvsr)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/video-generation/submit \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "flashvsr",
    "content": {
        "video_url": "https://d1q70pf5vjeyhc.cloudfront.net/media/abcdef/videos/example.mp4"
    },
    "resolution": "1080p"
}'
```

**Request Example (veo)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/video-generation/submit \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "veo-3.1-fast-generate-preview",
    "content": {
        "prompt": "The girl is playing a guitar",
        "image_url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seepro_first_frame.jpeg"
    },
    "duration": 8,
    "resolution": "720p"
}'
```

**Request Example (sora)**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/video-generation/submit \
  -H "Authorization: Bearer $YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sora-2",
    "content": {
        "prompt": "The banana is fighting an apple",
        "image_url": "https://tos-prmanent-hk.tos-cn-hongkong.bytepluses.com/imgs/example.jpeg"
    },
    "duration": 4,
    "resolution": "720x1280"
}'
```

**Response Example**

```json
{
    "success": true,
    "id": "MTQ*************OA=="
}
```

---

## Unified API / Retrieve Video `GET`

_Official Format_

### Retrieve Video

Unified video generation API supporting multiple providers and models for text-to-video and image-to-video generation.

`GET https://api.cloudwise.ai/api/v1/video-generation/video-content/{task_id}`

### Overview

This endpoint allows you to retrieve the status and results of video generation tasks submitted through the unified video generation API. Use the task ID returned from the create video endpoint to query the current status and retrieve the generated video once processing is complete.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Content-Type | string | - | required<br>Must be set to `application/json`. |
| Authorization | string | - | required<br>The API uses cloudwise-maas API-Key for authentication. Example: `Bearer ak-xxxx`. |

### Query Parameters

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| task_id | string (path) | - | required<br>Task ID returned from the create video request. |

### Request Example

```bash
curl --request GET \
    --url https://api.cloudwise.ai/api/v1/video-generation/video-content/{task_id} \
    --header 'Authorization: Bearer ak-xxxx'
```

### Response

The response contains task status and results.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| task_id | string | Task ID. |
| success | boolean | Whether the request was successful. |
| taskStatus | string | Task status. |
| video_url | string | Video download URL. |
| model | string | Model used for generation. |
| usage.costs | number | Cost of the request. |
| usage.unit | string | Unit for costs. |

#### Example Response

```json
{
  "video_url": "https://download.cloudwise.ai/arts/{video_id}",
  "success": true,
  "usage": {
    "costs": 0.75,
    "unit": "usd"
  },
  "task_id": "MTQ**************w==",
  "model": "wan2.5-t2v-preview",
  "taskStatus": "COMPLETED"
}
```

**Request Example**

```bash
curl --request GET \
    --url https://api.cloudwise.ai/api/v1/video-generation/video-content/{task_id} \
    --header 'Authorization: Bearer ak-xxxx'
```

**Response Example**

```json
{
  "video_url": "https://download.cloudwise.ai/arts/{video_id}",
  "success": true,
  "usage": {
    "costs": 0.75,
    "unit": "usd"
  },
  "task_id": "MTQ**************w==",
  "model": "wan2.5-t2v-preview",
  "taskStatus": "COMPLETED"
}
```

---

## Unified API / Create Image `POST`

_Official Format_

### Create Image

Unified video generation API supporting multiple providers and models for text-to-video and image-to-video generation.

`POST https://api.cloudwise.ai/api/v1/image-generation`

### Supported Models

| Provider | Model Name |
| --- | --- |
| Byteplus | `seedream-4.0` |
| Byteplus | `seedream-4.5` |
| Google | `gemini-2.5-flash-image` |
| Google | `gemini-3-pro-image-preview` |
| Google | `gemini-3.1-flash-image-preview` |

### Overview

This unified endpoint provides image generation functionality supporting multiple providers and models. You can generate images using text prompts or image-to-image transformations through a single API interface. The endpoint supports various image generation models from Byteplus and Google, allowing you to choose the best model for your specific use case. The API returns a task ID along with the generated image URL and usage information.

### Headers

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Content-Type | string | - | required<br>Must be set to `application/json`. |
| Authorization | string | - | required<br>The API uses cloudwise-maas API-Key for authentication. Example: `Bearer ak-xxxx`. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>The model to use. |
| prompt | string | - | required<br>Text prompt. Used to describe the elements and visual characteristics expected in the generated image. |
| image | object | - | Supports multiple image inputs (only applicable to seedream4.0 & 4.5). |
| size | string | - | Only applicable to seedream4.0 & 4.5.<br><br>**Input Parameter Type 1:**<br>- seedream4.0: `1K`, `2K`, `4K`<br>- seedream4.5: `2K`, `4K`<br><br>**Input Parameter Type 2:**<br>- seedream4.0:<br>• Default value: `2048x2048`<br>• Total pixels range: [1280x720=921,600, 4096x4096=16,777,216]<br>• Aspect ratio range: [1/16, 16]<br>- seedream4.5:<br>• Default value: `2048x2048`<br>• Total pixels range: [2560x1440=3,686,400, 4096x4096=16,777,216]<br>• Aspect ratio range: [1/16, 16] |
| sequential_image_generation | string | - | Only applicable to seedream4.0 & 4.5. Valid values: `auto` \| `disabled`. |
| max_images | integer | - | Range: [1, 15]. Only effective when `sequential_image_generation` is set to `auto`. |

### Request Example

```bash
curl -X POST https://api.cloudwise.ai/api/v1/image-generation \
--header 'Authorization: Bearer $YOUR_API_KEY' --header 'Content-Type: application/json' --data-raw '{
    "model": "gemini-3-pro-image-preview",
    "prompt": "Replace banana with apple.",
    "image":"https://tos-prmanent-hk.tos-cn-hongkong.bytepluses.com/imgs/20260122113150_20b1be58.png"
}'
```

### Response

The response contains the generated image task information.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| task_id | string | Task ID. |
| image_url | string | URL of the generated image. |
| model | string | The model used. |
| usage.costs | number | The cost incurred. |
| usage.unit | string | The unit of cost. |

#### Example Response

```json
{
    "image_url": "https://download.cloudwise.ai/arts/{image_id}",
    "usage": {
        "costs": 0.05,
        "unit": "usd"
    },
    "task_id": "MTQ******************A==",
    "model": "gemini-3-pro-image-preview"
}
```

**Request Example**

```bash
curl -X POST https://api.cloudwise.ai/api/v1/image-generation \
--header 'Authorization: Bearer $YOUR_API_KEY' --header 'Content-Type: application/json' --data-raw '{
    "model": "gemini-3-pro-image-preview",
    "prompt": "Replace banana with apple.",
    "image":"https://tos-prmanent-hk.tos-cn-hongkong.bytepluses.com/imgs/20260122113150_20b1be58.png"
}'
```

**Response Example**

```json
{
    "image_url": "https://download.cloudwise.ai/arts/{image_id}",
    "usage": {
        "costs": 0.05,
        "unit": "usd"
    },
    "task_id": "MTQ******************A==",
    "model": "gemini-3-pro-image-preview"
}
```

---

## XiaoAi / MiMo-V2.5-Pro `POST`

_Official Format_

### MiMo-V2.5-Pro

MiMo-V2.5-Pro is Xiaomi's latest native omnimodal model with 310B total parameters (15B active), supporting text, image, video, and audio understanding within a unified Sparse MoE architecture. Built upon MiMo-V2-Flash's hybrid sliding-window attention backbone, augmented with a 729M-param Vision Transformer and a dedicated audio encoder. It surpasses MiMo-V2-Pro in agentic performance and supports up to 1M tokens context window.

`POST https://api.cloudwise.ai/api/v1/chat/completions`

### Supported Models

| Model Name |
| --- |
| mimo-v2-omni |
| mimo-v2.5 |
| mimo-v2-flash |
| mimo-v2-pro |
| mimo-v2.5-pro |

### Overview

This endpoint provides text generation functionality using the `mimo-v2.5-pro` model. Upload images or provide image URLs to analyze and understand image content with vision-enabled multimodal input.

### Headers

This endpoint requires specific headers for authentication and content type.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |
| Content-Type | string | application/json | required |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | - | required<br>Model ID to use, e.g. mimo-v2.5-pro. |
| messages | array | - | required<br>A list of message objects with role and content. Content can be a string or an array of multimodal parts (text / image_url). Note: only mimo-v2.5 and mimo-v2-omni support multimodal input. |
| stream | boolean | false | If true, partial message deltas will be sent as Server-Sent Events. |
| temperature | number | - | Sampling temperature between 0 and 2. Higher values produce more random outputs. |
| max_tokens | integer | - | Maximum number of tokens to generate in the completion. |

### Request Example

Text Input

Image Input

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "mimo-v2.5-pro",
    "messages": [
      {
        "role": "user",
        "content": "Give me a brief introduction of MoE."
      }
    ]
  }'
```

### Response

The response contains the generated chat completion.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier of the chat completion. |
| object | string | Object type, typically "chat.completion". |
| created | integer | Unix timestamp of when the completion was created. |
| model | string | The model used to generate the completion. |
| choices | array | List of generated message choices, each with role, content and finish_reason. |
| usage | object | Token usage statistics (prompt_tokens, completion_tokens, total_tokens). |

#### Example Response

Text Input

Image Input

```json
{
  "id": "853dea7fe84b4113a9539408a6e1a2ea",
  "object": "chat.completion",
  "created": 1780568772,
  "model": "mimo-v2.5-pro",
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "content": "**MoE (Mixture of Experts)** is a neural network architecture that combines multiple specialized sub-networks (\"experts\") with a gating mechanism to dynamically route inputs to the most relevant experts. ...",
        "role": "assistant"
      }
    }
  ],
  "usage": {
    "completion_tokens": 395,
    "prompt_tokens": 256,
    "total_tokens": 651
  }
}
```

**Request Example (Text Input)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "mimo-v2.5-pro",
    "messages": [
      {
        "role": "user",
        "content": "Give me a brief introduction of MoE."
      }
    ]
  }'
```

**Request Example (Image Input)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "mimo-v2.5",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Describe the scene in detail, including the colors, atmosphere and setting."
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "https://example.com/sample-landscape.jpg"
            }
          }
        ]
      }
    ]
  }'
```

**Response Example (Text Input)**

```json
{
  "id": "853dea7fe84b4113a9539408a6e1a2ea",
  "object": "chat.completion",
  "created": 1780568772,
  "model": "mimo-v2.5-pro",
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "content": "**MoE (Mixture of Experts)** is a neural network architecture that combines multiple specialized sub-networks (\"experts\") with a gating mechanism to dynamically route inputs to the most relevant experts. ...",
        "role": "assistant"
      }
    }
  ],
  "usage": {
    "completion_tokens": 395,
    "prompt_tokens": 256,
    "total_tokens": 651
  }
}
```

**Response Example (Image Input)**

```json
{
  "id": "85a3cb1671ed413cbb9179a9f0c0f2f0",
  "object": "chat.completion",
  "created": 1780568332,
  "model": "mimo-v2.5",
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "content": "This is a serene, mist-shrouded waterfront scene, rendered in a soft, dreamlike palette of lavender, lilac, and muted violet. ...",
        "role": "assistant"
      }
    }
  ],
  "usage": {
    "completion_tokens": 772,
    "prompt_tokens": 563,
    "total_tokens": 1335
  }
}
```

---

## xAI / Grok `POST`

_Official Format_

### Grok 4.7

xAI's frontier model for coding, agentic tasks, and knowledge work, with stronger long-horizon reasoning and self-verification.

`POST https://api.cloudwise.ai/api/v1/chat/completions`

### Supported Models

| Model Name |
| --- |
| `grok-4.7` |
| `grok-4.6` |
| `grok-4.5` |
| `grok-4.3` |

### Overview

This endpoint provides text generation functionality using the xAI Grok models. Upload images or provide image URLs to analyze and understand image content with vision-enabled models. Grok 4.7 uses the same Chat Completions request and response format as the supported Grok 4.x models.

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | "grok-4.7" | required<br>The model to use for the request. grok-4.7 supports text and image input, text output, and a 500,000-token context window. |
| messages | array | - | required<br>Array of message objects for the conversation. Each message contains role and content. |
| stream | boolean | false | If set to true, partial message deltas are sent as server-sent events (SSE) as they become available. |
| max_tokens | integer | - | The maximum number of tokens to generate in the completion. Deprecated in favor of max_completion_tokens. |
| max_completion_tokens | integer | - | An upper bound for the number of tokens that can be generated for a completion, including visible output tokens and reasoning tokens. |
| temperature | number | 1 | What sampling temperature to use, between 0 and 2. Higher values make the output more random, while lower values make it more focused and deterministic. |
| top_p | number | 1 | An alternative to sampling with temperature, called nucleus sampling. The model considers the results of the tokens with top_p probability mass. |
| n | integer | 1 | How many chat completion choices to generate for each input message. |
| stop | string \\| array | - | Up to 4 sequences where the API will stop generating further tokens. |
| presence_penalty | number | 0 | Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the likelihood to talk about new topics. |
| frequency_penalty | number | 0 | Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the likelihood to repeat the same line verbatim. |
| seed | integer | - | If specified, the system will make a best effort to sample deterministically so that repeated requests with the same seed and parameters return the same result. |
| logprobs | boolean | false | Whether to return log probabilities of the output tokens. |
| top_logprobs | integer | - | An integer between 0 and 20 specifying the number of most likely tokens to return at each token position, each with an associated log probability. logprobs must be set to true if this parameter is used. |
| response_format | object | - | An object specifying the format that the model must output. Set to { "type": "json_object" } or a JSON schema for structured outputs. |
| tools | array | - | A list of tools the model may call. Currently, only functions are supported as tools. Use this to provide a list of functions the model may generate JSON inputs for. |
| tool_choice | string \\| object | "auto" | Controls which (if any) tool is called by the model. "none", "auto", "required", or a specific tool via an object. |
| reasoning_effort | string | "high" | Constrains reasoning effort. grok-4.7 supports "low", "medium", "high" (default), and "xhigh". Supported values and defaults may differ for older Grok models. |
| user | string | - | A unique identifier representing your end-user, which can help monitor and detect abuse. |

### Request Example

Text Input

Image Input

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "grok-4.7",
    "messages": [
        {
          "role": "system",
          "content": "Hello，grok！please introduce yourself"
        },
        {
          "role": "user",
          "content": "How are you"
        }
    ]
  }'
```

### Response

The response contains the generated text and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Unique identifier for the completion |
| object | string | Object type, always "text.completion" |
| created | integer | Unix timestamp of when the completion was created |
| model | string | The model used for generating the completion |

#### Example Response

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1699896916,
  "model": "grok-4.7",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The image shows a wooden boardwalk path extending through a lush green grassland..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1250,
    "completion_tokens": 89,
    "total_tokens": 1339
  }
}
```

**Request Example (Text Input)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "grok-4.7",
    "messages": [
        {
          "role": "system",
          "content": "Hello，grok！please introduce yourself"
        },
        {
          "role": "user",
          "content": "How are you"
        }
    ]
  }'
```

**Request Example (Image Input)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "grok-4.7",
    "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "what is in this image?"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80"
          }
        }
      ]
    }
  ]
  }'
```

**Response Example**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1699896916,
  "model": "grok-4.7",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The image shows a wooden boardwalk path extending through a lush green grassland..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1250,
    "completion_tokens": 89,
    "total_tokens": 1339
  }
}
```

---

## xAI / Image / Grok Imagine Image `POST`

_Official Format (Image)_

### Grok Imagine Image

Generate images from text prompts with xAI Grok Imagine Image models.

`POST https://api.cloudwise.ai/api/v1/images/generations`

### Supported Models

| Model Name |
| --- |
| `grok-imagine-image` |
| `grok-imagine-image-quality` |

### Overview

This endpoint creates an image from a natural-language prompt. The standard and quality variants share the same request format; select the model that matches the required fidelity and latency.

### Authentication

This endpoint requires a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your Cloudwise API key. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | "grok-imagine-image" | required<br>Image model to use. |
| prompt | string | - | required<br>Text description of the image to generate. |
| aspect_ratio | string | "1:1" | Supported ratios include `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `2:1`, `1:2`, `21:9`, `5:2`, `19.5:9`, `9:19.5`, `20:9`, `9:20`, or `auto`. |
| resolution | string | "1k" | Output resolution: `1k` or `2k`. |
| quality | string | "medium" | Quality control: `low` or `medium`. |
| n | integer | 1 | Number of images to generate, from 1 to 10. |
| response_format | string | "url" | Response encoding: `url` or `b64_json`. |
| storage_options | object | - | Optional Files API storage configuration with `expires_after`, `filename`, and `public_url`. |
| user | string | - | Optional end-user identifier for abuse monitoring and request tracing. |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/images/generations' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "grok-imagine-image",
    "prompt": "A cinematic photograph of a glass observatory above the clouds at sunrise",
    "aspect_ratio": "16:9",
    "resolution": "2k",
    "quality": "medium",
    "n": 1,
    "response_format": "url"
  }'
```

### Response

The response contains generated image URLs and, when available, the revised prompt.

| Field | Type | Description |
| --- | --- | --- |
| data | array | Generated image objects containing `url`, `mime_type`, and optional `revised_prompt`. |
| usage | object | Billing information, including `cost_in_usd_ticks`. |

#### Example Response

```json
{
  "data": [
    {
      "url": "https://imgen.x.ai/xai-imgen/generated-image-abc123.jpeg",
      "mime_type": "image/jpeg",
      "revised_prompt": "A cinematic photograph of a glass observatory above the clouds at sunrise"
    }
  ],
  "usage": { "cost_in_usd_ticks": 200000000 }
}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/images/generations' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "grok-imagine-image",
    "prompt": "A cinematic photograph of a glass observatory above the clouds at sunrise",
    "aspect_ratio": "16:9",
    "resolution": "2k",
    "quality": "medium",
    "n": 1,
    "response_format": "url"
  }'
```

**Response Example**

```json
{
  "data": [
    {
      "url": "https://imgen.x.ai/xai-imgen/generated-image-abc123.jpeg",
      "mime_type": "image/jpeg",
      "revised_prompt": "A cinematic photograph of a glass observatory above the clouds at sunrise"
    }
  ],
  "usage": { "cost_in_usd_ticks": 200000000 }
}
```

---

## xAI / Image / Image Edit `POST`

_Official Format (Image)_

### Image Edit

Edit one or more source images with a natural-language prompt using Grok Imagine.

`POST https://api.cloudwise.ai/api/v1/images/edits`

### Supported Models

| Model Name |
| --- |
| `grok-imagine-image` |
| `grok-imagine-image-quality` |

### Overview

Provide a public URL, base64 data URL, or Files API ID. Up to three reference images are supported through `images`.

### Authentication

This endpoint requires a Bearer token.

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | "grok-imagine-image" | Image model to use. |
| prompt | string | - | required<br>Instruction describing the edit. |
| image | object | - | Source image with `url` or `file_id`. Public URL, base64 data URL, or xAI Files API ID. |
| images | array | - | Optional multi-reference images; mutually exclusive with image. |
| aspect_ratio | string | "1:1" | Grok Imagine aspect ratio. |
| resolution | string | "1k" | 1k or 2k. |
| n | integer | 1 | Number of edits. |
| response_format | string | "url" | url or b64_json. |
| storage_options | object | - | Optional Files API storage configuration. |
| user | string | - | Optional end-user identifier. |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/images/edits' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "grok-imagine-image",
    "prompt": "Render this as a pencil sketch with detailed shading",
    "image": { "url": "https://example.com/source.png", "type": "image_url" },
    "aspect_ratio": "1:1",
    "resolution": "2k",
    "response_format": "url"
  }'
```

### Response

| Field | Type | Description |
| --- | --- | --- |
| data | array | Generated image objects. |
| usage | object | Billing cost in USD ticks. |

```json
{
  "data": [{
    "url": "https://imgen.x.ai/xai-imgen/edited-image-abc123.jpeg",
    "mime_type": "image/jpeg",
    "revised_prompt": ""
  }],
  "usage": { "cost_in_usd_ticks": 220000000 }
}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/images/edits' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "grok-imagine-image",
    "prompt": "Render this as a pencil sketch with detailed shading",
    "image": { "url": "https://example.com/source.png", "type": "image_url" },
    "aspect_ratio": "1:1",
    "resolution": "2k",
    "response_format": "url"
  }'
```

**Response Example**

```json
{
  "data": [{
    "url": "https://imgen.x.ai/xai-imgen/edited-image-abc123.jpeg",
    "mime_type": "image/jpeg",
    "revised_prompt": ""
  }],
  "usage": { "cost_in_usd_ticks": 220000000 }
}
```

---

## xAI / Video / Grok Imagine Video `POST`

_Official Format (Video)_

### Grok Imagine Video

Create short videos from text prompts, with optional image guidance, using xAI Grok Imagine Video.

`POST https://api.cloudwise.ai/api/v1/videos/generations`

### Supported Models

| Model Name |
| --- |
| `grok-imagine-video` |

### Overview

This asynchronous endpoint starts a video generation task at `/v1/videos/generations`. The response contains a `request_id`; poll `GET /v1/videos/{request_id}` until the status is `done`.

### Authentication

This endpoint requires a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your Cloudwise API key. |

### Request Body

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | "grok-imagine-video" | required<br>Video model to use. |
| prompt | string | - | required<br>Text description. Required for text-to-video; optional for image-to-video. |
| duration | integer | 8 | Video duration from 1 to 15 seconds. Also accepts seconds as an OpenAI-compatible alias. |
| aspect_ratio | string | "16:9" | Valid values: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, or `2:3`. |
| resolution | string | "480p" | Output resolution: `480p`, `720p`, or `1080p`. |
| image | object | - | Optional image input with `url` or `file_id` for image-to-video generation. |
| reference_images | array | - | Optional reference images for reference-to-video workflows. |
| reference_audios | array | - | Optional preset or URL-based voice references, up to three clips. |
| output | object | - | Optional output destination containing a signed upload_url. |
| storage_options | object | - | Optional Files API storage and public URL configuration. |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/videos/generations' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "grok-imagine-video",
    "prompt": "A slow cinematic orbit around a glass observatory above the clouds at sunrise",
    "duration": 8,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }'
```

### Response

The initial response contains a request ID. Poll the retrieval endpoint until the deferred result is ready.

| Field | Type | Description |
| --- | --- | --- |
| request_id | string | Unique ID used with `GET /v1/videos/{request_id}`. |

#### Example Response

```json
{
  "request_id": "video_task_abc123"
}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/videos/generations' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "grok-imagine-video",
    "prompt": "A slow cinematic orbit around a glass observatory above the clouds at sunrise",
    "duration": 8,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }'
```

**Response Example**

```json
{
  "request_id": "video_task_abc123"
}
```

---

## xAI / Video / Get Video Generation Results `GET`

_Official Format (Video)_

### Get Video Generation Results

Poll an asynchronous Grok Imagine video request until it completes.

`GET https://api.cloudwise.ai/api/v1/videos/{request_id}`

### Supported Models

| Model Name |
| --- |
| `grok-imagine-video` |

### Path Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| request_id | string | Required ID returned by video generation. |

### Request Example

```bash
curl -X GET 'https://api.cloudwise.ai/api/v1/videos/{request_id}' \
  --header 'Authorization: Bearer $YOUR_API_KEY'
```

### Response

Status values: `pending`, `done`, `expired`, `failed`.

```json
{
  "status": "done",
  "video": { "url": "https://vidgen.x.ai/video.mp4", "duration": 8, "respect_moderation": true },
  "model": "grok-imagine-video",
  "progress": 100
}
```

**Request Example**

```bash
curl -X GET 'https://api.cloudwise.ai/api/v1/videos/{request_id}' \
  --header 'Authorization: Bearer $YOUR_API_KEY'
```

**Response Example**

```json
{
  "status": "done",
  "video": { "url": "https://vidgen.x.ai/video.mp4", "duration": 8, "respect_moderation": true },
  "model": "grok-imagine-video",
  "progress": 100
}
```

---

## xAI / Video / Video Edit `POST`

_Official Format (Video)_

### Video Edit

Modify an existing video with a natural-language prompt.

`POST https://api.cloudwise.ai/api/v1/videos/edits`

### Supported Models

| Model Name |
| --- |
| `grok-imagine-video` |

### Request Body

| Parameter | Type | Description |
| --- | --- | --- |
| prompt | string | Required edit instruction. |
| video | object | Required public URL, base64 data URL, or Files API file_id. MP4 input is required. |
| model | string | Video model. |
| output | object | Optional signed upload destination. |
| storage_options | object | Optional Files API storage configuration. |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/videos/edits' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{"model":"grok-imagine-video","prompt":"Give the woman a silver necklace","video":{"url":"https://example.com/video.mp4"}}'
```

### Response

Returns a request ID for polling.

```json
{"request_id":"video_edit_abc123"}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/videos/edits' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{"model":"grok-imagine-video","prompt":"Give the woman a silver necklace","video":{"url":"https://example.com/video.mp4"}}'
```

**Response Example**

```json
{"request_id":"video_edit_abc123"}
```

---

## xAI / Video / Video Extension `POST`

_Official Format (Video)_

### Video Extension

Continue an existing video from its last frame.

`POST https://api.cloudwise.ai/api/v1/videos/extensions`

### Supported Models

| Model Name |
| --- |
| `grok-imagine-video` |

### Request Body

| Parameter | Type | Description |
| --- | --- | --- |
| prompt | string | Required description of what happens next. |
| video | object | Required MP4 URL, base64 data URL, or Files API file_id. |
| duration | integer | Extension duration from 2 to 10 seconds; defaults to 6. |
| model | string | Video model. |
| output | object | Optional signed upload destination. |
| storage_options | object | Optional Files API storage configuration. |

### Request Example

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/videos/extensions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{"model":"grok-imagine-video","prompt":"The camera slowly zooms out to reveal the city skyline","video":{"url":"https://example.com/video.mp4"},"duration":6}'
```

### Response

Returns a request ID for polling.

```json
{"request_id":"video_extension_abc123"}
```

**Request Example**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/videos/extensions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{"model":"grok-imagine-video","prompt":"The camera slowly zooms out to reveal the city skyline","video":{"url":"https://example.com/video.mp4"},"duration":6}'
```

**Response Example**

```json
{"request_id":"video_extension_abc123"}
```

---

## ZAI / GLM-5.3-Flash `POST`

_Official Format(Chat)_

### GLM-5.3-Flash

GLM-5.3-Flash is the first native multimodal model in the GLM-5 series, offering efficient coding and agent capabilities with a 1M-token context window and up to 128K output tokens.

`POST https://api.cloudwise.ai/api/v1/chat/completions`

### Supported Models

| Model Name |
| --- |
| `glm-5.3-flash` |
| `glm-5.3` |
| `glm-5.2` |
| `glm-5.1` |
| `glm-5` |
| `glm-4.7` |
| `glm-4.6v` |

### Overview

This endpoint provides text generation with GLM-5.3-Flash. It accepts text, image, video, and file inputs and returns text output.

### GLM-5.3-Flash Parameter Compatibility

Most request fields are shared with other GLM models. The table below identifies the field that is currently exclusive to GLM-5.3-Flash and the shared fields that have Flash-specific constraints.

| Parameter | Scope | GLM-5.3-Flash behavior |
| --- | --- | --- |
| `messages[].content[].file.file_id` | **Flash only** | The official Z.ai API reference currently marks uploaded-file IDs as supported only by GLM-5.3-Flash. |
| `thinking.type` | **Flash constraint** | Must be `enabled`; reasoning cannot be disabled. GLM-5.3 has the same constraint. |
| `reasoning_effort` | **Flash constraint** | Only `low`, `high`, and `max` are accepted. GLM-5.3 has the same value set. |
| `messages[].content[]` | **Shared multimodal** | Supports `text`, `image_url`, `video_url`, and `file` blocks. These fields are also available on selected vision models. |

### Authentication

This endpoint requires authentication using a Bearer token.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| Authorization | string | "Bearer ak_***********" | required<br>Your API key in the format: `ak_*****` |

### Request Body

Standard chat completion request supporting text, multimodal input, and tool calling.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| model | string | glm-5.3-flash | required<br>The standard chat model code to call. GLM-5.3-Flash is the latest native multimodal model.<br>Available options: `glm-5.3-flash`, `glm-5.3`, `glm-5.2`, `glm-5.1`, `glm-5`, `glm-4.7`, `glm-4.6v` (Example: `"glm-5.3-flash"`) |
| messages | array | - | required<br>Conversation messages containing the full context in time order. Supported roles: `system`, `user`, `assistant`, `tool`. GLM-5.3-Flash supports plain-text messages and multimodal content blocks. Do not send only system or assistant messages.<br>Minimum array length: 1 |
| messages.role | enum<string> | user | required<br>Message author role.<br>Available options: `user`, `system`, `assistant`, `tool` |
| messages.content | string \\| object[] | - | required<br>Text content of the message, or an array of `text`, `image_url`, `video_url`, and `file` content blocks for multimodal input.<br>Example: `"What opportunities and challenges will the Chinese large model industry face in 2025?"` |
| messages.content[].type | enum<string> | - | Content block type for a GLM-5.3-Flash multimodal request.<br>Available options: `text`, `image_url`, `video_url`, `file`. These block types are also supported by some other vision models; they are not GLM-5.3-Flash-only fields. |
| messages.content[].text | string | - | Text value when the content block type is text. |
| messages.content[].image_url | object | - | Image input object when the content block type is `image_url`. This field is shared with other supported vision models; it is not GLM-5.3-Flash only. |
| messages.content[].image_url.url | string | - | Public image URL or Base64 Data URL. |
| messages.content[].video_url.url | string | - | Video URL when the block type is `video_url`. This is a multimodal field shared with other supported vision models, not GLM-5.3-Flash only. |
| messages.content[].file | object | - | File input when the block type is `file`. Provide one of `file_id`, `file_url`, or `file_data`. A file block cannot be combined with an `image_url` or `video_url` block in the same request. |
| messages.content[].file.file_id | string | - | **GLM-5.3-Flash only.** ID returned by the File Upload API. The official Z.ai API reference currently marks this field as supported only by GLM-5.3-Flash. |
| messages.content[].file.file_url | string | - | File URL. Supported by GLM-5.3-Flash and selected vision models, including GLM-4.6V and GLM-4.5V; this field is not exclusive to GLM-5.3-Flash. |
| messages.content[].file.file_data | string | - | Base64 file content in the format `data:<MIME>;base64,<BASE64_DATA>`. |
| messages.content[].file.filename | string | - | File name associated with an inline file input. |
| stream | boolean | false | Enable streaming output via Server-Sent Events (SSE). When false, the full response is returned at once. When true, tokens stream in real time and ends with `data: [DONE]`.<br>Example: `false` |
| thinking | object | - | Supported only by GLM-4.5 and above. Controls whether chain-of-thought is enabled. |
| thinking.type | enum<string> | enabled | **GLM-5.3-Flash constraint:** this shared field must be `enabled`; reasoning cannot be disabled. GLM-5.3 has the same constraint, while other supported models may allow `enabled` or `disabled`.<br>GLM-5.3-Flash value: `enabled` |
| reasoning_effort | enum<string> | max | **GLM-5.3-Flash constraint:** this shared field accepts only `low`, `high`, or `max`. `low` uses lightweight reasoning, `high` uses enhanced reasoning, and `max` uses deep reasoning. GLM-5.3 has the same value set; GLM-5.2 also supports the field but applies compatibility mappings to some additional values.<br>Available options: `low`, `high`, `max` |
| thinking.clear_thinking | boolean | true | Controls whether to clear reasoning_content from previous turns.<br>- `true` (default): ignore/remove historical reasoning_content, use only visible text, tool calls, and results as context.<br>- `false`: keep historical reasoning_content in context. If you want preserved thinking, you must pass the full, unmodified reasoning_content in messages; missing or reordered content can reduce quality.<br>Note: this only affects historical thinking blocks, not the current turn.<br>Example: `true` |
| do_sample | boolean | true | Enable sampling. When false, the model selects the most probable tokens and ignores temperature/top_p. Recommended for deterministic tasks like code or translation.<br>Example: `true` |
| temperature | number<float> | 1 | Sampling temperature, range [0.0, 1.0] with two decimals. Defaults: GLM-5/4.7/4.6 = 1.0, GLM-4.5 = 0.6, GLM-4 = 0.75. Higher values add creativity; lower values increase determinism. Adjust either top_p or temperature, not both.<br>Required range: 0 <= x <= 1<br>Example: `1` |
| top_p | number<float> | 0.95 | Nucleus sampling alternative to temperature, range [0.01, 1.0] with two decimals. Defaults: GLM-5/4.7/4.6/4.5 = 0.95, GLM-4 = 0.9. Lower values yield more focused outputs; higher values increase diversity. Avoid adjusting both top_p and temperature together.<br>Required range: 0.01 <= x <= 1<br>Example: `0.95` |
| max_tokens | integer | - | Maximum output tokens. GLM-5.3-Flash and GLM-5/4.7/4.6 support up to 128K, GLM-4.5 up to 96K. Recommended minimum 1024. Tokens are basic text units (about 0.75 English words or 1.5 Chinese characters). The response may be truncated if the limit is reached.<br>Required range: 1 <= x <= 131072<br>Example: `1024` |
| tool_stream | boolean | false | Enable streaming for function calls. Supported only by GLM-5.3-Flash/5/4.7/4.6.<br>Example: `false` |
| tools | object | - | Tool definitions for function calling. |
| tools.type | enum<string> | function | required<br>Available options: `function` |
| tools.function | object | - | required |
| tools.function.name | string | - | required<br>Function name to call. Must match `[a-zA-Z0-9_-]` and be 1-64 characters long. |
| tools.function.description | string | - | required<br>Description of the function for the model to decide when and how to call it. |
| tools.function.parameters | object | - | required<br>JSON Schema defining the function parameters. Omit if the function takes no parameters. |
| tool_choice | enum<string> | - | Controls tool selection.<br>Available options: `auto` |
| stop | string[] | - | Stop words. Generation stops when any string is encountered. Currently supports a single stop word, e.g. `["Human:"]`.<br>Maximum array length: 1 |
| response_format | object | - | Response format for text models. Supported: `{ "type": "text" }` for plain text, `{ "type": "json_object" }` for JSON output. When using JSON mode, instruct the model to output JSON explicitly. |
| response_format.type | enum<string> | text | required<br>Output format type.<br>Available options: `text`, `json_object` |
| request_id | string | - | Request identifier. Provide a UUID to ensure uniqueness; the platform will generate one if omitted. |
| user_id | string | - | End-user identifier. Length 6-128 characters; avoid sensitive information. |

### Request Example

Text Input

Image Input

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
        "model": "glm-5.3-flash",
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful AI assistant."
            },
            {
                "role": "user",
                "content": "Please briefly explain the history of artificial intelligence."
            }
        ],
        "thinking": {
            "type": "enabled",
            "clear_thinking": false
        },
        "reasoning_effort": "max",
        "stream": false,
        "max_tokens": 6400,
        "temperature": 1.0,
        "top_p": 0.95
    }'
```

### Response

The response contains the model output, tool calls, and usage statistics.

#### Response Fields

| Field | Type | Description |
| --- | --- | --- |
| id | string | Task ID. |
| request_id | string | Request ID. |
| created | integer | Unix timestamp in seconds. |
| model | string | Model name. |
| choices | object[] | List of model responses. |
| choices.index | integer | Result index. |
| choices.message | object | Message object. |
| choices.message.role | string | Role of the response message. Default: `assistant`. |
| choices.message.content | string \\| object[] \\| string | Message content. If a function is called, content may be null; otherwise returns the response text. |
| choices.message.tool_calls | object[] | Function calls that should be invoked. |
| choices.message.tool_calls.function | object | Generated function name and JSON arguments. |
| choices.message.tool_calls.function.name | string | required<br>Generated function name. |
| choices.message.tool_calls.function.arguments | string | required<br>JSON-formatted function arguments. Validate before calling. |
| choices.message.tool_calls.mcp | object | MCP tool call parameters. |
| choices.message.tool_calls.mcp.id | string | MCP tool call identifier. |
| choices.message.tool_calls.mcp.type | enum<string> | Tool call type. Available options: `mcp_list_tools`, `mcp_call` |
| choices.message.tool_calls.mcp.server_label | string | MCP server label. |
| choices.message.tool_calls.mcp.error | string | Error message. |
| choices.message.tool_calls.mcp.tools | object[] | Tool list when `type = mcp_list_tools`. |
| choices.message.tool_calls.mcp.tools.name | string | Tool name. |
| choices.message.tool_calls.mcp.tools.description | string | Tool description. |
| choices.message.tool_calls.mcp.tools.annotations | object | Tool annotations. |
| choices.message.tool_calls.mcp.tools.input_schema | object | Tool input schema. |
| choices.message.tool_calls.mcp.tools.input_schema.type | enum<string> | Available options: `object` |
| choices.message.tool_calls.mcp.tools.input_schema.properties | object | Parameter properties. |
| choices.message.tool_calls.mcp.tools.input_schema.required | string[] | Required properties. |
| choices.message.tool_calls.mcp.tools.input_schema.additionalProperties | boolean | Whether additional parameters are allowed. |
| choices.message.tool_calls.mcp.arguments | string | Tool call arguments in JSON string format. |
| choices.message.tool_calls.mcp.name | string | Tool name. |
| choices.message.tool_calls.mcp.output | object | Tool output. |
| choices.message.tool_calls.id | string | Unique identifier for the tool call. |
| choices.message.tool_calls.type | string | Tool type, currently `function` or `mcp`. |
| choices.finish_reason | string | Finish reason: `stop`, `tool_calls`, `length`, `sensitive`, `network_error`. |
| usage | object | Token usage statistics. |
| usage.prompt_tokens | number | Number of input tokens. |
| usage.completion_tokens | number | Number of output tokens. |
| usage.prompt_tokens_details | object | Prompt token details. |
| usage.prompt_tokens_details.cached_tokens | number | Cached prompt tokens. |
| usage.total_tokens | integer | Total tokens. |
| web_search | object[] | Web search result list when WebSearchToolSchema is used. |
| web_search.icon | string | Source site icon. |
| web_search.title | string | Result title. |
| web_search.link | string | Result link. |
| web_search.media | string | Media source name. |
| web_search.publish_date | string | Publish date. |
| web_search.content | string | Snippet content. |
| web_search.refer | string | Reference index. |
| content_filter | object[] | Content safety info. |
| content_filter.role | string | Safety stage: `assistant`, `user`, `history`. |
| content_filter.level | integer | Severity level 0-3. Level 0 is most severe; 3 is mild. |

#### Example Response

```json
{
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "content": "I am a large language model developed by Z.ai. Trained on massive datasets, I can answer questions, assist with writing, and translate languages to provide intelligent and efficient help.",
        "reasoning_content": "The user asked for a brief self-introduction.\nKey points to include:\n1) I am an AI/LLM.\n2) I was developed by Z.ai.\n3) I can answer questions, assist writing, and translate.\n4) I aim to be helpful.\n\nDraft 1:\nI am a large language model developed by Z.ai. I can answer questions, write code, translate languages, and help with creative writing. I was trained on large-scale text data to provide helpful and safe responses.\nWord count is too long.\n\nDraft 2:\nI am a Z.ai-built AI assistant. I am good at answering questions, writing, and translation. I have a large knowledge base and hope to help you.\nWord count looks good.\n\nDraft 3:\nI am a Z.ai AI assistant. Trained on massive data, I can answer questions, assist writing, and translate. I strive to provide accurate and helpful responses.\nThis is concise and professional.\n\nFinal:\nI am a large language model developed by Z.ai. Trained on massive data, I can answer questions, assist writing, and translate to provide intelligent help.",
        "role": "assistant"
      }
    }
  ],
  "created": 1769658751,
  "id": "2026012911521827d748b20fb040ec",
  "model": "glm-5.3-flash",
  "object": "chat.completion",
  "request_id": "2026012911521827d748b20fb040ec",
  "usage": {
    "completion_tokens": 762,
    "completion_tokens_details": {
      "reasoning_tokens": 731
    },
    "prompt_tokens": 12,
    "prompt_tokens_details": {
      "cached_tokens": 2
    },
    "total_tokens": 774
  }
}
```

**Request Example (Text Input)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
        "model": "glm-5.3-flash",
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful AI assistant."
            },
            {
                "role": "user",
                "content": "Please briefly explain the history of artificial intelligence."
            }
        ],
        "thinking": {
            "type": "enabled",
            "clear_thinking": false
        },
        "reasoning_effort": "max",
        "stream": false,
        "max_tokens": 6400,
        "temperature": 1.0,
        "top_p": 0.95
    }'
```

**Request Example (Image Input)**

```bash
curl -X POST 'https://api.cloudwise.ai/api/v1/chat/completions' \
  --header 'Authorization: Bearer $YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "model": "glm-5.3-flash",
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://picsum.photos/200/300"
                    }
                },
                {
                    "type": "text",
                    "text": "Please describe the content of this image."
                }
            ]
        }
    ],
    "stream": false
}'
```

**Response Example**

```json
{
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "content": "I am a large language model developed by Z.ai. Trained on massive datasets, I can answer questions, assist with writing, and translate languages to provide intelligent and efficient help.",
        "reasoning_content": "The user asked for a brief self-introduction.\nKey points to include:\n1) I am an AI/LLM.\n2) I was developed by Z.ai.\n3) I can answer questions, assist writing, and translate.\n4) I aim to be helpful.\n\nDraft 1:\nI am a large language model developed by Z.ai. I can answer questions, write code, translate languages, and help with creative writing. I was trained on large-scale text data to provide helpful and safe responses.\nWord count is too long.\n\nDraft 2:\nI am a Z.ai-built AI assistant. I am good at answering questions, writing, and translation. I have a large knowledge base and hope to help you.\nWord count looks good.\n\nDraft 3:\nI am a Z.ai AI assistant. Trained on massive data, I can answer questions, assist writing, and translate. I strive to provide accurate and helpful responses.\nThis is concise and professional.\n\nFinal:\nI am a large language model developed by Z.ai. Trained on massive data, I can answer questions, assist writing, and translate to provide intelligent help.",
        "role": "assistant"
      }
    }
  ],
  "created": 1769658751,
  "id": "2026012911521827d748b20fb040ec",
  "model": "glm-5.3-flash",
  "object": "chat.completion",
  "request_id": "2026012911521827d748b20fb040ec",
  "usage": {
    "completion_tokens": 762,
    "completion_tokens_details": {
      "reasoning_tokens": 731
    },
    "prompt_tokens": 12,
    "prompt_tokens_details": {
      "cached_tokens": 2
    },
    "total_tokens": 774
  }
}
```
