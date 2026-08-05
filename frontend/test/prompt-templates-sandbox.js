// 测试辅助：把经典 <script> 形式的 prompt-templates.js（M17）加载进
// 模拟全局作用域，供 vitest 测试用例调用其中定义的纯逻辑函数（模板
// 文案格式化、预设默认命名、搜索文本拼接等）。原理跟其它
// xxx-sandbox.js 一致，见 loop-node-sandbox.js 顶部注释。
//
// 注意：绝大多数函数强依赖真实 DOM（模板面板/预设面板的渲染与交互）/
// 网络请求（模板库 CRUD）/画布全局状态（nodes/selectedId 等），跟
// M5/M7/M8 核心批次同类不适合单元测试，因此本 sandbox 只覆盖可独立
// 验证的纯函数：defaultPromptPresetName / promptTemplateText /
// promptTemplateSearchText / defaultPromptTemplateGroups /
// promptTemplateName / promptTemplateScene。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function readSrc(name) {
    return fs.readFileSync(
        path.resolve(repoRoot, `frontend/src/smart-canvas/${name}`),
        'utf8'
    );
}

const PROMPT_TEMPLATES_SRC = readSrc('prompt-templates.js');

export function createPromptTemplatesSandbox(overrides = {}) {
    const trDict = overrides.trDict || {};
    const sandbox = {
        window: {
            StudioI18n: overrides.studioI18n ?? { lang: () => 'zh' },
        },
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise, RegExp, JSON,

        tr: overrides.fns?.tr || (key => (key in trDict ? trDict[key] : key)),

        // 纯函数测试用不到的状态/DOM，占位避免报未定义。
        promptPresets: overrides.promptPresets ?? [],
        promptTemplateGroups: overrides.promptTemplateGroups ?? [],
        promptTemplateOverrides: overrides.promptTemplateOverrides ?? { hiddenBuiltinIds: [], editedBuiltins: {} },
        promptLibraries: overrides.promptLibraries ?? [],
        builtinPromptTemplates: overrides.builtinPromptTemplates ?? [],
        activePromptLibraryId: overrides.activePromptLibraryId ?? 'system',
        nodes: overrides.nodes ?? [],
        localStorage: { getItem() { return null; }, setItem() {} },
        document: { getElementById: () => null },
    };

    vm.createContext(sandbox);
    vm.runInContext(PROMPT_TEMPLATES_SRC, sandbox, { filename: 'prompt-templates.js' });
    return sandbox;
}
