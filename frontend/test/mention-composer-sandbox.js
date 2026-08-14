// 测试辅助：把经典 <script> 形式的 mention-composer.js（M21）加载进
// 模拟全局作用域，供 vitest 测试用例调用其中定义的纯逻辑函数（拖拽
// 排序辅助/提示词纯文本还原/@提及 token HTML 渲染/生成结果节点判断）。
// 原理跟其它 xxx-sandbox.js 一致，见 loop-node-sandbox.js 顶部注释。
//
// 注意：绝大多数函数（renderMentionPicker/renderPromptComposer/
// buildPromptRequest/各种 xxxImagesFor 引用图片收集函数）强依赖真实
// DOM（Selection API/contenteditable 光标位置）/画布全局状态（nodes/
// 连线关系）/网络请求，跟 M5/M7/M8 核心批次同类不适合单元测试，因此
// 本 sandbox 只覆盖可独立验证的纯函数：sameOrderedIds /
// movedBeforeAfterIds / originalPromptTextFromParts / mentionTokenHtml /
// isGeneratedResultNode。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function readSrc(name) {
    return fs.readFileSync(
        path.resolve(repoRoot, `frontend/src/canvas/${name}`),
        'utf8'
    );
}

const MENTION_COMPOSER_SRC = readSrc('mention-composer.js');

export function createMentionComposerSandbox(overrides = {}) {
    const sandbox = {
        window: { getSelection: () => null, StudioI18n: { lang: () => 'zh' } },
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise, RegExp, JSON,

        escapeHtml: overrides.fns?.escapeHtml || ((s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))),
        tr: overrides.fns?.tr || (key => key),
        mediaKindForItem: overrides.fns?.mediaKindForItem || (img => img?.kind || 'image'),
        videoPosterHtml: overrides.fns?.videoPosterHtml || (img => `<video-poster src="${img.url}"></video-poster>`),
        isSmartImageNode: overrides.fns?.isSmartImageNode || (node => node?.type === 'smart-image' || !node?.type),

        nodes: overrides.nodes ?? [],
        document: { getElementById: () => null },
    };

    vm.createContext(sandbox);
    vm.runInContext(MENTION_COMPOSER_SRC, sandbox, { filename: 'mention-composer.js' });
    return sandbox;
}
