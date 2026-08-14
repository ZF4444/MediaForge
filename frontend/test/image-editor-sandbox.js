// 测试辅助：把经典 <script> 形式的 image-editor.js（M8）加载进模拟全局作用域，
// 供 vitest 测试用例调用其中定义的纯逻辑函数（网格布局计算/裁剪范围钳制等）。
// 原理跟其它 xxx-sandbox.js 一致，见 loop-node-sandbox.js 顶部注释。
//
// 注意：openImageEditor/closeImageEditor/renderCropBox/applyImage*
// 等核心函数强依赖真实 DOM（canvas 绘制/getBoundingClientRect/
// three.js 动态 import 等），属于 M5/M7 核心批次同类的
// "过于依赖 DOM/网络，不适合单元测试" 情形，因此本 sandbox 只覆盖可独立
// 验证的纯函数：gridJoinAutoDims / gridSplitRects(Custom) / clampCrop /
// clampOutpaint / cropBounds。
//
// cropImageDisplaySize()（clampCrop/clampOutpaint 间接依赖）会读取
// document.getElementById('cropImage') 的 clientWidth/clientHeight，
// 因此这里用一个可配置的元素表模拟 DOM，而不是像 canvas-render-sandbox
// 那样直接覆盖函数本身——image-editor.js 内部已经定义了这些函数，
// 顶层声明会遮蔽任何试图预先赋值的同名 sandbox 属性。
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

const IMAGE_EDITOR_SRC = readSrc('image-editor.js');

export function createImageEditorSandbox(overrides = {}) {
    const state = {
        cropState: overrides.cropState ?? null,
        imageEditMode: overrides.imageEditMode ?? 'crop',
        gridCustomMode: overrides.gridCustomMode ?? false,
        gridCustomLines: overrides.gridCustomLines ?? [],
        imageEditBaseW: 0,
        imageEditBaseH: 0,
        imageEditZoom: 1,
        gridJoinLayout: overrides.gridJoinLayout ?? null,
        elements: { ...(overrides.elements || {}) },
    };

    function makeEl(id) {
        if (state.elements[id] !== undefined) return state.elements[id];
        return null;
    }

    const sandbox = {
        window: { innerWidth: 1600, innerHeight: 1000 },
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise,

        document: {
            getElementById: overrides.fns?.getElementById || makeEl,
        },

        get cropState() { return state.cropState; },
        set cropState(v) { state.cropState = v; },
        get imageEditMode() { return state.imageEditMode; },
        set imageEditMode(v) { state.imageEditMode = v; },
        get gridCustomMode() { return state.gridCustomMode; },
        set gridCustomMode(v) { state.gridCustomMode = v; },
        get gridCustomLines() { return state.gridCustomLines; },
        set gridCustomLines(v) { state.gridCustomLines = v; },
        get imageEditBaseW() { return state.imageEditBaseW; },
        set imageEditBaseW(v) { state.imageEditBaseW = v; },
        get imageEditBaseH() { return state.imageEditBaseH; },
        set imageEditBaseH(v) { state.imageEditBaseH = v; },
        get imageEditZoom() { return state.imageEditZoom; },
        set imageEditZoom(v) { state.imageEditZoom = v; },
        get gridJoinLayout() { return state.gridJoinLayout; },
        set gridJoinLayout(v) { state.gridJoinLayout = v; },

        __state: state,
        __setElement: (id, el) => { state.elements[id] = el; },
    };

    vm.createContext(sandbox);
    vm.runInContext(IMAGE_EDITOR_SRC, sandbox, { filename: 'image-editor.js' });
    return sandbox;
}
