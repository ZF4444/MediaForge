// 测试辅助：把经典 <script> 形式的 node-context-ui.js（M14）加载进
// 模拟全局作用域，供 vitest 测试用例调用其中定义的判断逻辑函数
// （快捷栏显示条件、快捷操作目标查找）。原理跟其它 xxx-sandbox.js
// 一致，见 loop-node-sandbox.js 顶部注释。
//
// 注意：nodeShortcutBarHtml/nodeContextMenuHtml/openNodeContextMenu/
// openCanvasContextMenu 等 HTML 渲染/DOM 操作函数强依赖真实 DOM 元素
// （nodeContextMenu/nodeShortcutOverlay 等），跟 M5/M7/M8 核心批次
// 同类不适合单元测试，因此本 sandbox 只覆盖判断逻辑较重、依赖面
// 相对可控的两个函数：nodeShortcutTargetFor / shouldShowNodeShortcutBar。
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

const NODE_CONTEXT_UI_SRC = readSrc('node-context-ui.js');

export function createNodeContextUiSandbox(overrides = {}) {
    const state = {
        nodes: overrides.nodes || [],
        selectedId: overrides.selectedId ?? '',
        selectedIds: overrides.selectedIds ?? [],
        selectedImage: overrides.selectedImage ?? { nodeId: '', index: -1 },
        dragState: overrides.dragState ?? null,
        thumbDragState: overrides.thumbDragState ?? null,
    };

    const sandbox = {
        window: {},
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise, RegExp,

        get nodes() { return state.nodes; },
        set nodes(v) { state.nodes = v; },
        get selectedId() { return state.selectedId; },
        set selectedId(v) { state.selectedId = v; },
        get selectedIds() { return state.selectedIds; },
        set selectedIds(v) { state.selectedIds = v; },
        get selectedImage() { return state.selectedImage; },
        set selectedImage(v) { state.selectedImage = v; },
        get dragState() { return state.dragState; },
        set dragState(v) { state.dragState = v; },
        get thumbDragState() { return state.thumbDragState; },
        set thumbDragState(v) { state.thumbDragState = v; },

        selectedNode: overrides.fns?.selectedNode || (() => state.nodes.find(n => n.id === state.selectedId) || null),
        isNodeSelected: overrides.fns?.isNodeSelected || ((id) => state.selectedId === id || state.selectedIds.includes(id)),
        imagesForNode: overrides.fns?.imagesForNode || ((node) => (node?.images || [])),
        mediaKindForItem: overrides.fns?.mediaKindForItem || ((item) => item?.kind || 'image'),

        __state: state,
    };

    vm.createContext(sandbox);
    vm.runInContext(NODE_CONTEXT_UI_SRC, sandbox, { filename: 'node-context-ui.js' });
    return sandbox;
}
