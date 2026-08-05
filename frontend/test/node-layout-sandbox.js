// 测试辅助：把经典 <script> 形式的 node-layout.js（M3）加载进模拟全局作用域，
// 供 vitest 测试用例调用其中定义的布局计算函数。原理跟
// loop-node-sandbox.js 一致，见该文件顶部注释。
//
// node-layout.js 依赖的外部全局在这里给最小化 mock：
//   isSmartImageNode —— 类型判断，默认按 node.type==='smart-image'||无type 判断
//   smartGroupMembers / smartGroupCompactMembers / smartGroupImageRefs ——
//     分组成员查询，默认返回空，测试用例可通过 overrides.fns 覆盖
//   smartLoopWidth / smartLoopHeight —— M2 已拆到 loop-node.js，这里真实
//     加载 loop-node.js（而不是 mock），让 imageLayout 对 smart-loop 类型
//     节点的分支走真实逻辑
//   inputThumbType / inputThumbLabel / isAudioMediaItem / isVideoMediaItem /
//     videoPosterHtml —— smartNodeInputThumbsHtml 用到的媒体缩略图渲染细节
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const UTILS_SRC = fs.readFileSync(
    path.resolve(repoRoot, 'frontend/src/smart-canvas/utils.js'),
    'utf8'
);
const LOOP_NODE_SRC = fs.readFileSync(
    path.resolve(repoRoot, 'frontend/src/smart-canvas/loop-node.js'),
    'utf8'
);
const NODE_LAYOUT_SRC = fs.readFileSync(
    path.resolve(repoRoot, 'frontend/src/smart-canvas/node-layout.js'),
    'utf8'
);

export function createNodeLayoutSandbox(overrides = {}) {
    let cloneCounter = 0;
    const state = {
        nodes: overrides.nodes || [],
        selectedId: '',
        canvas: overrides.canvas || { connections: [] },
        smartLoopContext: null,
    };

    const isSmartImageNode = overrides.fns?.isSmartImageNode
        || ((node) => !node?.type || node.type === 'smart-image' || node.type === 'smart-asset-image');

    const sandbox = {
        window: { StudioI18n: null, lucide: null },
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map,
        Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
        document: overrides.document || { createElement: () => ({}), getSelection: () => null },

        get nodes(){ return state.nodes; },
        set nodes(v){ state.nodes = v; },
        get selectedId(){ return state.selectedId; },
        set selectedId(v){ state.selectedId = v; },
        get canvas(){ return state.canvas; },
        set canvas(v){ state.canvas = v; },
        get smartLoopContext(){ return state.smartLoopContext; },
        set smartLoopContext(v){ state.smartLoopContext = v; },

        // loop-node.js 的其它依赖（node-layout 测试不关心这些，给最小 stub）
        pushUndo: () => {},
        render: () => {},
        scheduleSave: () => {},
        addConnection: () => {},
        connectInputNode: () => {},
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
        isVideoMediaItem: overrides.fns?.isVideoMediaItem || (() => false),
        isAudioMediaItem: overrides.fns?.isAudioMediaItem || (() => false),
        mediaKindForUrls: () => 'image',
        smartCascadeRunForLoop: () => null,
        smartCascadeIsLoopRunning: () => false,
        smartCascadeStopText: () => '',
        requestSmartCascadeStop: () => {},
        runSmartCascadeFromLoop: () => {},
        refsForDirectLoopRound: () => [],
        promptInputNodesFor: () => [],

        // node-layout.js 自身的依赖
        isSmartImageNode,
        inputThumbType: overrides.fns?.inputThumbType || (() => 'image'),
        inputThumbLabel: overrides.fns?.inputThumbLabel || ((img, i) => `#${i + 1}`),
        videoPosterHtml: overrides.fns?.videoPosterHtml || (() => '<div class="video-poster"></div>'),

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
    return sandbox;
}
