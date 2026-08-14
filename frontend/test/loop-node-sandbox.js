// 测试辅助：把经典 <script>（非 ES module）形式的 loop-node.js / utils.js
// 加载进一个模拟的全局作用域里，供 vitest 测试用例调用其中定义的函数。
//
// 为什么需要这样做而不是直接 import：loop-node.js 依赖 canvas.js
// 里的全局状态（nodes/selectedId/canvas 等）和一批工具/渲染函数
// （render/scheduleSave/tr/trf/uid/escapeHtml/nodeRect/imageLayout/
// cloneSmartNode/addConnection/connectInputNode/inputNodesFor/
// imagesForNode/smartGroupCompactMembers/smartNodeInputThumbsHtml/
// bindScrollableText/splitSmartPromptItems/isVideoMediaItem/
// mediaKindForUrls/stripImageGenerationMeta/smartCascadeRunForLoop/
// smartCascadeIsLoopRunning/smartCascadeStopText/requestSmartCascadeStop/
// runSmartCascadeFromLoop/refsForDirectLoopRound 等），这些在真实页面里
// 由同一个全局作用域里的其它经典脚本提供。测试时用最小化的 stub/mock
// 提供这些依赖，只验证 loop-node.js 自身的计算逻辑（布局尺寸、循环次数、
// 输入图片切片等纯逻辑），不测试 DOM 渲染细节。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const UTILS_SRC = fs.readFileSync(
    path.resolve(repoRoot, 'frontend/src/canvas/utils.js'),
    'utf8'
);
const LOOP_NODE_SRC = fs.readFileSync(
    path.resolve(repoRoot, 'frontend/src/canvas/loop-node.js'),
    'utf8'
);

/**
 * 创建一个装有 utils.js + loop-node.js 全局函数的沙箱上下文。
 * @param {object} overrides 覆盖/补充默认 mock 的依赖（比如自定义 nodes 数组）。
 * @returns {vm.Context} 可以从中读取 sandbox.smartLoopCount 等函数。
 */
export function createLoopNodeSandbox(overrides = {}) {
    let cloneCounter = 0;
    const state = {
        nodes: overrides.nodes || [],
        selectedId: '',
        canvas: overrides.canvas || { connections: [] },
        smartLoopContext: null,
    };

    const sandbox = {
        window: {
            StudioI18n: null, // tr() 会走 fallback（原样返回 key）
            lucide: null,
        },
        console,
        Date,
        Math,
        Array,
        Object,
        Number,
        String,
        Boolean,
        Set,
        Map,
        Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
        document: overrides.document || {
            createElement: () => ({}),
            getSelection: () => null,
        },

        // 状态（用 getter/setter 让 loop-node.js 里的重新赋值——比如
        // createLoopNode 里的 `selectedId = node.id`——能被测试读取到）。
        get nodes(){ return state.nodes; },
        set nodes(v){ state.nodes = v; },
        get selectedId(){ return state.selectedId; },
        set selectedId(v){ state.selectedId = v; },
        get canvas(){ return state.canvas; },
        set canvas(v){ state.canvas = v; },
        get smartLoopContext(){ return state.smartLoopContext; },
        set smartLoopContext(v){ state.smartLoopContext = v; },

        // 布局/节点相关的依赖函数，默认给最小可用实现，测试用例可通过
        // overrides.fns 覆盖。
        pushUndo: overrides.fns?.pushUndo || (() => {}),
        render: overrides.fns?.render || (() => {}),
        scheduleSave: overrides.fns?.scheduleSave || (() => {}),
        addConnection: overrides.fns?.addConnection || (() => {}),
        connectInputNode: overrides.fns?.connectInputNode || (() => {}),
        bindScrollableText: overrides.fns?.bindScrollableText || (() => {}),
        splitSmartPromptItems: overrides.fns?.splitSmartPromptItems || ((text) => {
            const trimmed = String(text || '').trim();
            if (!trimmed) return [];
            const lines = trimmed.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
            return lines.length >= 2 ? lines : [trimmed];
        }),
        inputNodesFor: overrides.fns?.inputNodesFor || (() => []),
        imagesForNode: overrides.fns?.imagesForNode || (() => []),
        smartGroupCompactMembers: overrides.fns?.smartGroupCompactMembers || (() => []),
        smartNodeInputThumbsHeight: overrides.fns?.smartNodeInputThumbsHeight || (() => 0),
        smartNodeInputThumbsHtml: overrides.fns?.smartNodeInputThumbsHtml || (() => ''),
        nodeRect: overrides.fns?.nodeRect || ((node) => ({
            x: node?.x || 0, y: node?.y || 0,
            width: node?.w || 260, height: node?.h || 180,
        })),
        imageLayout: overrides.fns?.imageLayout || ((images) => ({
            width: 260 * (images?.length || 1),
            height: 200,
        })),
        cloneSmartNode: overrides.fns?.cloneSmartNode || ((node, dx, dy) => ({
            ...node,
            id: `${node.id}_clone_${cloneCounter++}`,
            x: (node.x || 0) + dx,
            y: (node.y || 0) + dy,
        })),
        stripImageGenerationMeta: overrides.fns?.stripImageGenerationMeta || ((img) => img),
        isVideoMediaItem: overrides.fns?.isVideoMediaItem || (() => false),
        mediaKindForUrls: overrides.fns?.mediaKindForUrls || (() => 'image'),
        smartCascadeRunForLoop: overrides.fns?.smartCascadeRunForLoop || (() => null),
        smartCascadeIsLoopRunning: overrides.fns?.smartCascadeIsLoopRunning || (() => false),
        smartCascadeStopText: overrides.fns?.smartCascadeStopText || (() => ''),
        requestSmartCascadeStop: overrides.fns?.requestSmartCascadeStop || (() => {}),
        runSmartCascadeFromLoop: overrides.fns?.runSmartCascadeFromLoop || (() => {}),
        refsForDirectLoopRound: overrides.fns?.refsForDirectLoopRound || (() => []),
        promptInputNodesFor: overrides.fns?.promptInputNodesFor || (() => []),
        MEDIA_NODE_DEFAULT_SCALE: 2,
        MEDIA_GROUP_DEFAULT_SCALE: 0.8,
    };

    vm.createContext(sandbox);
    vm.runInContext(UTILS_SRC, sandbox, { filename: 'utils.js' });
    vm.runInContext(LOOP_NODE_SRC, sandbox, { filename: 'loop-node.js' });
    return sandbox;
}
