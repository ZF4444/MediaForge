// 测试辅助：把经典 <script> 形式的 cascade-run.js（M5）加载进模拟全局
// 作用域，供 vitest 测试用例调用其中定义的函数。原理跟其它 xxx-sandbox.js
// 一致，见 loop-node-sandbox.js 顶部注释。
//
// cascade-run.js 体量最大、依赖最深（大量 DOM 元素、fetch、复杂节点图
// 遍历），这里只给出测试真正需要用到的最小化 mock，覆盖第 1 批的纯逻辑
// 函数（smartCascadeParallelLimit/smartCascadeAbortError/
// throwIfSmartCascadeStopRequested/cascadeRefsFromOutputs/
// smartCascadeStopText 等），不尝试测试 runSmartCascade/runGeneration
// 这类深度依赖 DOM 和网络请求的核心编排函数（这些函数的正确性主要靠
// 字节级 diff 校验 + 人工浏览器回归覆盖，不适合用单元测试模拟）。
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
const CASCADE_RUN_SRC = readSrc('cascade-run.js');

export function createCascadeRunSandbox(overrides = {}) {
    const state = {
        smartCascadeRuns: overrides.smartCascadeRuns || new Map(),
        smartCascadeActiveLoopId: overrides.smartCascadeActiveLoopId || '',
        smartCascadeRunning: overrides.smartCascadeRunning || false,
        smartCascadeStopRequested: overrides.smartCascadeStopRequested || false,
        comfyInstanceCount: overrides.comfyInstanceCount ?? 1,
    };

    const sandbox = {
        window: { StudioI18n: null, lucide: null },
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise,
        setTimeout,

        get smartCascadeRuns(){ return state.smartCascadeRuns; },
        set smartCascadeRuns(v){ state.smartCascadeRuns = v; },
        get smartCascadeActiveLoopId(){ return state.smartCascadeActiveLoopId; },
        set smartCascadeActiveLoopId(v){ state.smartCascadeActiveLoopId = v; },
        get smartCascadeRunning(){ return state.smartCascadeRunning; },
        set smartCascadeRunning(v){ state.smartCascadeRunning = v; },
        get smartCascadeStopRequested(){ return state.smartCascadeStopRequested; },
        set smartCascadeStopRequested(v){ state.smartCascadeStopRequested = v; },
        get comfyInstanceCount(){ return state.comfyInstanceCount; },
        set comfyInstanceCount(v){ state.comfyInstanceCount = v; },

        smartCascadeRunForLoop: overrides.fns?.smartCascadeRunForLoop || ((loopId) => state.smartCascadeRuns.get(loopId) || null),
        syncSmartCascadeLegacyState: overrides.fns?.syncSmartCascadeLegacyState || (() => {}),
        smartSettingsForNode: overrides.fns?.smartSettingsForNode || (() => ({})),
        toast: overrides.fns?.toast || (() => {}),
        render: overrides.fns?.render || (() => {}),
    };

    vm.createContext(sandbox);
    vm.runInContext(UTILS_SRC, sandbox, { filename: 'utils.js' });
    // cascade-run.js 里的其它函数（runComfyGeneration 等）引用了大量本
    // sandbox 未提供的全局，加载时不会报错（只是函数声明，不会立即执行），
    // 只有真正调用到具体某个函数时才需要该函数用到的那些依赖存在。
    vm.runInContext(CASCADE_RUN_SRC, sandbox, { filename: 'cascade-run.js' });
    return sandbox;
}
