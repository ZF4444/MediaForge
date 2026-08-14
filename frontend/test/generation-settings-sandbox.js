// 测试辅助：把经典 <script> 形式的 generation-settings.js（M10）加载进
// 模拟全局作用域，供 vitest 测试用例调用其中定义的纯逻辑函数（比例/
// 尺寸计算、图标 class 判定等）。原理跟其它 xxx-sandbox.js 一致，
// 见 loop-node-sandbox.js 顶部注释。
//
// 注意：renderDynamicParams/bindDynamicParams/loadConfig 等核心函数
// 强依赖真实 DOM（dynamicParams.innerHTML 赋值/事件绑定等）与网络请求，
// 跟 M5/M7/M8 核心批次同类的"过于依赖 DOM/网络，不适合单元测试"情形，
// 因此本 sandbox 只覆盖可独立验证的纯函数：gcdInt / imageSizeForRatio /
// reducedRatioForImage / closestStandardRatioKey / parseRatioValue /
// parseSizeValue / ratioIconClass / videoAspectIconClass / ratioLabel /
// msModelLabel。
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

const GENERATION_SETTINGS_SRC = readSrc('generation-settings.js');

export function createGenerationSettingsSandbox(overrides = {}) {
    const state = {
        settings: overrides.settings ?? {},
    };

    const sandbox = {
        window: {},
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise, RegExp,

        get settings() { return state.settings; },
        set settings(v) { state.settings = v; },

        tr: overrides.fns?.tr || ((key) => key),

        // MS_GEN_MODELS 是在 main.js 更早处定义的模块级常量（ModelScope
        // 模型元数据表），本文件的 msModelLabel 会读取它。sandbox 里用一个
        // 最小的默认值代替，测试用例可通过 overrides.msGenModels 自定义。
        MS_GEN_MODELS: overrides.msGenModels || {},

        __state: state,
    };

    vm.createContext(sandbox);
    vm.runInContext(GENERATION_SETTINGS_SRC, sandbox, { filename: 'generation-settings.js' });
    return sandbox;
}
