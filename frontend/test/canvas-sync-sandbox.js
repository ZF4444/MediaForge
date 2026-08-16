// 测试辅助：把经典 <script> 形式的 canvas-sync.js（M16）加载进模拟全局
// 作用域，供 vitest 测试用例调用其中定义的纯逻辑函数（多端协作画布/
// 节点/连线合并逻辑）。原理跟其它 xxx-sandbox.js 一致，见
// loop-node-sandbox.js 顶部注释。
//
// 注意：applyMergedServerCanvas/mergeReloadCanvasNow/scheduleCanvasMergeReload/
// handleCanvasUpdatedMessage/startCanvasMetaPoll 强依赖真实 DOM/网络请求/
// 定时器/画布全局状态（nodes/canvas/canvasId/dragState/selectionState），
// 跟 M5/M7/M8 核心批次同类不适合单元测试，因此本 sandbox 只覆盖可独立
// 验证的纯函数：mergeSmartImageLists / smartNodeInFlight / mergeSmartNode /
// mergeSmartNodeLists / mergeSmartConnections。
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

const CANVAS_SYNC_SRC = readSrc('canvas-sync.js');

export function createCanvasSyncSandbox(overrides = {}) {
    const sandbox = {
        window: {},
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise, RegExp, JSON,

        // applyMergedServerCanvas/mergeReloadCanvasNow/startCanvasMetaPoll 依赖的
        // 画布全局状态，纯函数测试用不到，这里只给最基本的占位，避免报未定义。
        nodes: overrides.nodes ?? [],
        canvas: overrides.canvas ?? null,
        canvasId: overrides.canvasId ?? '',
        dragState: overrides.dragState ?? null,
        selectionState: overrides.selectionState ?? null,
        smartClientId: overrides.smartClientId ?? 'canvas_smart_test',
        canvasSyncInFlight: false,
        canvasSaveDirty: false,
        canvasSaveAgain: false,
        canvasSyncTimer: null,
        canvasMetaPollTimer: null,

        smartPendingTasks: overrides.fns?.smartPendingTasks || (() => []),
        normalizeLegacySmartNode: overrides.fns?.normalizeLegacySmartNode || (n => n),
        render: overrides.fns?.render || (() => {}),
        resumeSmartPendingTasks: overrides.fns?.resumeSmartPendingTasks || (() => {}),
        document: {
            getElementById: overrides.fns?.getElementById || (() => null),
        },
        fetch: overrides.fns?.fetch || (() => Promise.resolve({ ok: false })),
        setTimeout, clearTimeout, setInterval, clearInterval,
    };

    vm.createContext(sandbox);
    vm.runInContext(CANVAS_SYNC_SRC, sandbox, { filename: 'canvas-sync.js' });
    return sandbox;
}
