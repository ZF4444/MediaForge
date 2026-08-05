// 测试辅助：把经典 <script> 形式的 ms-lora.js（api-settings 页面）加载进
// 模拟全局作用域，供 vitest 测试用例调用其中定义的纯逻辑函数。
//
// 注意：renderMsLoras/addMsLora/updateMsLora/removeMsLora 依赖 provider()
// 和真实 DOM（msLoraList），不适合单元测试。本 sandbox 主要覆盖
// normalizeLoraStrength 这个纯函数，以及依赖 provider() 的
// msLoraTargetOptions（通过覆盖 provider 函数来测试）。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const MS_LORA_SRC = fs.readFileSync(
    path.resolve(repoRoot, 'frontend/src/api-settings/ms-lora.js'),
    'utf8'
);

export function createMsLoraSandbox(overrides = {}) {
    const sandbox = {
        window: {},
        console, Math, Array, Object, Number, String, Boolean, JSON,

        MS_BUILTIN_IMAGE_MODELS: overrides.MS_BUILTIN_IMAGE_MODELS ?? ['Tongyi-MAI/Z-Image-Turbo', 'Qwen/Qwen-Image-2512'],
        provider: overrides.fns?.provider || (() => null),
        unique: overrides.fns?.unique || (values => {
            const seen = new Set();
            return values.map(v => String(v || '').trim()).filter(v => v && !seen.has(v) && seen.add(v));
        }),
        escapeHtml: overrides.fns?.escapeHtml || (s => String(s ?? '')),
        escapeAttr: overrides.fns?.escapeAttr || (s => String(s ?? '')),
        tr: overrides.fns?.tr || (key => key),
        refreshIcons: overrides.fns?.refreshIcons || (() => {}),
        msLoraList: overrides.msLoraList ?? null,
    };

    vm.createContext(sandbox);
    vm.runInContext(MS_LORA_SRC, sandbox, { filename: 'ms-lora.js' });
    return sandbox;
}
