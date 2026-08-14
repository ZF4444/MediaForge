// 测试辅助：把经典 <script> 形式的 connections.js（M4）加载进模拟全局作用域，
// 供 vitest 测试用例调用其中定义的连线数据函数。原理跟其它 xxx-sandbox.js
// 一致，见 loop-node-sandbox.js 顶部注释。
//
// connections.js 里的渐进依赖：node-layout.js 提供 nodeRect（用于计算连线
// 端点坐标），loop-node.js 提供 fitSmartLoopNode/createLoopNode，
// node-model.js 提供 createPromptNode。这里都真实加载这几个文件（而不是
// mock），因为它们本身已经有独立的回归测试覆盖，这里只需要把它们的组合
// 效果跑起来即可。DOM 相关的重依赖（world/document 里的 querySelector 等）
// 仍然 mock，因为测试目标是连线数据操作本身，不是渲染像素。
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

const UTILS_SRC = readSrc('utils.js');
const LOOP_NODE_SRC = readSrc('loop-node.js');
const NODE_LAYOUT_SRC = readSrc('node-layout.js');
const NODE_MODEL_SRC = readSrc('node-model.js');
const CONNECTIONS_SRC = readSrc('connections.js');

export function createConnectionsSandbox(overrides = {}) {
    let cloneCounter = 0;
    let uidCounter = 0;
    const state = {
        nodes: overrides.nodes || [],
        selectedId: '',
        canvas: overrides.canvas || { connections: [] },
        smartLoopContext: null,
        dragState: null,
        portDragState: overrides.portDragState || null,
        loopInsertPreview: null,
        connectionLayerRefreshQueued: false,
        lastConnectionLayerRefreshAt: 0,
    };

    const isSmartImageNode = overrides.fns?.isSmartImageNode
        || ((node) => !node?.type || node.type === 'smart-image' || node.type === 'smart-asset-image');

    const noopEl = { querySelector: () => null, querySelectorAll: () => [], appendChild: () => {} };

    const sandbox = {
        window: { StudioI18n: null, lucide: null, innerWidth: 1920, innerHeight: 1080 },
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map,
        Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
        document: overrides.document || {
            createElement: () => noopEl,
            createElementNS: () => ({ setAttribute: () => {} }),
            getSelection: () => null,
            elementFromPoint: () => null,
        },
        world: overrides.world || noopEl,
        shell: overrides.shell || { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
        portDropMenu: overrides.portDropMenu || null,
        performance: { now: () => Date.now() },
        requestAnimationFrame: (fn) => fn(),

        get nodes(){ return state.nodes; },
        set nodes(v){ state.nodes = v; },
        get selectedId(){ return state.selectedId; },
        set selectedId(v){ state.selectedId = v; },
        get canvas(){ return state.canvas; },
        set canvas(v){ state.canvas = v; },
        get smartLoopContext(){ return state.smartLoopContext; },
        set smartLoopContext(v){ state.smartLoopContext = v; },
        get dragState(){ return state.dragState; },
        set dragState(v){ state.dragState = v; },
        get portDragState(){ return state.portDragState; },
        set portDragState(v){ state.portDragState = v; },
        get loopInsertPreview(){ return state.loopInsertPreview; },
        set loopInsertPreview(v){ state.loopInsertPreview = v; },
        get connectionLayerRefreshQueued(){ return state.connectionLayerRefreshQueued; },
        set connectionLayerRefreshQueued(v){ state.connectionLayerRefreshQueued = v; },
        get lastConnectionLayerRefreshAt(){ return state.lastConnectionLayerRefreshAt; },
        set lastConnectionLayerRefreshAt(v){ state.lastConnectionLayerRefreshAt = v; },

        // 通用依赖
        pushUndo: overrides.fns?.pushUndo || (() => {}),
        commitPendingUndo: overrides.fns?.commitPendingUndo || (() => {}),
        discardPendingUndo: overrides.fns?.discardPendingUndo || (() => {}),
        render: overrides.fns?.render || (() => {}),
        scheduleSave: overrides.fns?.scheduleSave || (() => {}),
        screenToWorld: overrides.fns?.screenToWorld || ((p) => ({ x: p.clientX ?? p.x ?? 0, y: p.clientY ?? p.y ?? 0 })),
        uid: overrides.fns?.uid || ((prefix) => `${prefix}_${uidCounter++}`),
        bindScrollableText: () => {},
        splitSmartPromptItems: (text) => {
            const trimmed = String(text || '').trim();
            if (!trimmed) return [];
            const lines = trimmed.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
            return lines.length >= 2 ? lines : [trimmed];
        },
        inputNodesFor: overrides.fns?.inputNodesFor || (() => []),
        imagesForNode: overrides.fns?.imagesForNode || (() => []),
        smartGroupCompactMembers: overrides.fns?.smartGroupCompactMembers || (() => []),
        smartGroupMembers: overrides.fns?.smartGroupMembers || (() => []),
        smartGroupImageRefs: overrides.fns?.smartGroupImageRefs || (() => []),
        cloneSmartNode: (node, dx, dy) => ({
            ...node, id: `${node.id}_clone_${cloneCounter++}`,
            x: (node.x || 0) + dx, y: (node.y || 0) + dy,
        }),
        stripImageGenerationMeta: (img) => img,
        isVideoMediaItem: () => false,
        isAudioMediaItem: () => false,
        mediaKindForUrls: () => 'image',
        smartCascadeRunForLoop: () => null,
        smartCascadeIsLoopRunning: () => false,
        smartCascadeStopText: () => '',
        requestSmartCascadeStop: () => {},
        runSmartCascadeFromLoop: () => {},
        refsForDirectLoopRound: () => [],
        promptInputNodesFor: () => [],
        isSmartImageNode,
        isSmartGroupNode: overrides.fns?.isSmartGroupNode || ((node) => node?.type === 'smart-group'),
        isHistoryGroupNode: overrides.fns?.isHistoryGroupNode || (() => false),
        demoteHistoryGroupNode: overrides.fns?.demoteHistoryGroupNode || (() => {}),
        cascadeConnectionKeys: overrides.fns?.cascadeConnectionKeys || (() => new Set()),
        smartCascadeEdgeState: overrides.fns?.smartCascadeEdgeState || (() => ''),
        createGenerationNodeByKind: overrides.fns?.createGenerationNodeByKind || (() => ({ id: 'gen_node' })),
        inputThumbType: () => 'image',
        inputThumbLabel: (img, i) => `#${i + 1}`,
        videoPosterHtml: () => '<div class="video-poster"></div>',
        tr: overrides.fns?.tr || ((k) => k),
        resolveChatProviderId: () => '',
        resolveChatModel: () => '',

        MEDIA_NODE_DEFAULT_SCALE: 2,
        MEDIA_GROUP_PREVIOUS_DEFAULT_SCALE: 1.6,
        MEDIA_GROUP_DEFAULT_SCALE: 0.8,
        MEDIA_GROUP_THUMB_BASE: 224,
        EMPTY_GENERATION_NODE_WIDTH: 316,
        EMPTY_GENERATION_NODE_HEIGHT: 194,
        SMART_GROUP_DEFAULT_WIDTH: 340,
        SMART_GROUP_DEFAULT_HEIGHT: 286,
        SMART_GROUP_LEGACY_HEIGHT: 220,
        SMART_GROUP_MIN_WIDTH: 150,
        SMART_GROUP_MIN_HEIGHT: 130,
    };

    vm.createContext(sandbox);
    vm.runInContext(UTILS_SRC, sandbox, { filename: 'utils.js' });
    vm.runInContext(LOOP_NODE_SRC, sandbox, { filename: 'loop-node.js' });
    vm.runInContext(NODE_LAYOUT_SRC, sandbox, { filename: 'node-layout.js' });
    vm.runInContext(NODE_MODEL_SRC, sandbox, { filename: 'node-model.js' });
    vm.runInContext(CONNECTIONS_SRC, sandbox, { filename: 'connections.js' });
    return sandbox;
}
