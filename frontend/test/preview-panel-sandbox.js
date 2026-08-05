// 测试辅助：把经典 <script> 形式的 preview-panel.js（comfyui-settings 页面）
// 加载进模拟全局作用域，供 vitest 测试用例调用其中定义的纯逻辑函数。
//
// 注意：renderPreview/renderPreviewField/openImagePreview 等依赖
// currentConfig/真实 DOM，不适合单元测试。本 sandbox 主要覆盖纯函数：
// randomValueForField（按字段的 min/max/step 生成随机值）、
// fieldSupportsRandom（判断字段是否支持随机数功能）、以及依赖状态
// 读取的 isPreviewRandomActive/randomButtonHtml。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const PREVIEW_PANEL_SRC = fs.readFileSync(
    path.resolve(repoRoot, 'frontend/src/comfyui-settings/preview-panel.js'),
    'utf8'
);

export function createPreviewPanelSandbox(overrides = {}) {
    const sandbox = {
        window: {},
        console, Math, Array, Object, Number, String, Boolean, JSON,

        currentConfig: overrides.currentConfig ?? { fields: [] },
        previewValues: overrides.previewValues ?? {},
        previewRandomActive: overrides.previewRandomActive ?? {},
        previewImageUrls: overrides.previewImageUrls ?? {},
        runResult: overrides.runResult ?? null,
        fieldKind: overrides.fns?.fieldKind || (() => 'text'),
        isMediaField: overrides.fns?.isMediaField || (() => false),
        mediaAccept: overrides.fns?.mediaAccept || (() => 'image/*'),
        mediaUploadText: overrides.fns?.mediaUploadText || (() => ''),
        mediaUploadFailedText: overrides.fns?.mediaUploadFailedText || (() => ''),
        mediaPreviewHtml: overrides.fns?.mediaPreviewHtml || (() => ''),
        pickImage: overrides.fns?.pickImage || (() => {}),
        escapeHtml: overrides.fns?.escapeHtml || (s => String(s ?? '')),
        escapeAttr: overrides.fns?.escapeAttr || (s => String(s ?? '')),
        tr: overrides.fns?.tr || (key => key),
        tf: overrides.fns?.tf || (key => key),
        document: {
            getElementById: overrides.fns?.getElementById || (() => null),
            querySelector: overrides.fns?.querySelector || (() => null),
        },
    };

    vm.createContext(sandbox);
    vm.runInContext(PREVIEW_PANEL_SRC, sandbox, { filename: 'preview-panel.js' });
    return sandbox;
}
