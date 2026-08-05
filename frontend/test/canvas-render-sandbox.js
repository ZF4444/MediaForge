// 测试辅助：把经典 <script> 形式的 canvas-render.js（M7）加载进模拟全局作用域，
// 供 vitest 测试用例调用其中定义的纯逻辑函数（运行计时/任务恢复文案等）。
// 原理跟其它 xxx-sandbox.js 一致，见 loop-node-sandbox.js 顶部注释。
//
// 注意：canvas-render.js 里 render()/bindNodeEvents()/measureSmartNodeImages()
// 等核心函数强依赖真实 DOM（document.querySelectorAll/getBoundingClientRect/
// requestAnimationFrame 等）与几乎全部其它模块的状态，属于 M5 核心批次同类的
// "过于依赖 DOM/网络，不适合单元测试" 情形，因此本 sandbox 只覆盖可独立验证的
// 纯函数：formatRunDuration / nodeRunElapsedMs / runTimePillHtml /
// hideRunTimerForNode / smartRecoverableImageTask。
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

const CANVAS_RENDER_SRC = readSrc('canvas-render.js');

export function createCanvasRenderSandbox(overrides = {}) {
    const state = {
        scheduleSaveCalls: 0,
    };

    const sandbox = {
        window: {},
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise,

        nowMs: overrides.fns?.nowMs || (() => 1_700_000_000_000),
        escapeHtml: overrides.fns?.escapeHtml || ((s) => String(s ?? '')),
        scheduleSave: overrides.fns?.scheduleSave || (() => { state.scheduleSaveCalls += 1; }),
        smartPendingTasks: overrides.fns?.smartPendingTasks || (() => []),

        __state: state,
    };

    vm.createContext(sandbox);
    vm.runInContext(CANVAS_RENDER_SRC, sandbox, { filename: 'canvas-render.js' });
    return sandbox;
}
