// 测试辅助：把经典 <script> 形式的 field-editor.js（comfyui-settings 页面）
// 加载进模拟全局作用域，供 vitest 测试用例调用其中定义的纯逻辑函数。
//
// 注意：toggleField/updateField/renderInputRow/renderExtras 等依赖
// currentConfig/currentWorkflow/真实 DOM，不适合单元测试。本 sandbox
// 主要覆盖纯函数：guessType（按字段名/取值猜测合适的字段类型）、
// makeFieldId（随机 id 生成），以及依赖状态读取的 fieldFor。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const FIELD_EDITOR_SRC = fs.readFileSync(
    path.resolve(repoRoot, 'frontend/src/comfyui-settings/field-editor.js'),
    'utf8'
);

export function createFieldEditorSandbox(overrides = {}) {
    const sandbox = {
        window: {},
        console, Math, Array, Object, Number, String, Boolean, JSON, RegExp,

        currentConfig: overrides.currentConfig ?? { fields: [] },
        currentWorkflow: overrides.currentWorkflow ?? {},
        previewValues: overrides.previewValues ?? {},
        previewRandomActive: overrides.previewRandomActive ?? {},
        popupNodeId: overrides.popupNodeId ?? null,
        workspaceMode: overrides.workspaceMode ?? 'graph',
        miniCanvasHost: overrides.miniCanvasHost ?? null,
        fieldKind: overrides.fns?.fieldKind || (() => 'text'),
        isMediaField: overrides.fns?.isMediaField || (() => false),
        mediaFieldLabel: overrides.fns?.mediaFieldLabel || (() => ''),
        inputLabel: overrides.fns?.inputLabel || (input => input),
        renderPreview: overrides.fns?.renderPreview || (() => {}),
        renderEditor: overrides.fns?.renderEditor || (() => {}),
        renderMiniCanvasPreview: overrides.fns?.renderMiniCanvasPreview || (() => {}),
        refreshPopupBody: overrides.fns?.refreshPopupBody || (() => {}),
        escapeHtml: overrides.fns?.escapeHtml || (s => String(s ?? '')),
        escapeAttr: overrides.fns?.escapeAttr || (s => String(s ?? '')),
        tr: overrides.fns?.tr || (key => key),
        tf: overrides.fns?.tf || (key => key),
        document: {
            getElementById: overrides.fns?.getElementById || (() => null),
        },
    };

    vm.createContext(sandbox);
    vm.runInContext(FIELD_EDITOR_SRC, sandbox, { filename: 'field-editor.js' });
    return sandbox;
}
