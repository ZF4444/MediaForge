// 测试辅助：把经典 <script> 形式的 clipboard.js 加载进模拟全局作用域，
// 供 vitest 测试用例调用其中的剪贴板逻辑。原理跟其它 xxx-sandbox.js 一致，
// 见 loop-node-sandbox.js 顶部注释。
//
// 可通过 overrides 注入：navigator / localStorage / document / window / fns / state。
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

const CLIPBOARD_SRC = readSrc('clipboard.js');

export function createMemoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        get length() { return map.size; },
        key: (i) => [...map.keys()][i] ?? null,
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); },
        _map: map,
    };
}

export function createClipboardSandbox(overrides = {}) {
    const state = {
        canvas: overrides.canvas ?? { connections: [] },
        nodes: overrides.nodes || [],
        selectedId: overrides.selectedId ?? '',
        selectedIds: overrides.selectedIds ?? [],
        selectedImage: { nodeId: '', index: -1 },
        lastMouseWorld: overrides.lastMouseWorld ?? null,
        toasts: [],
        calls: { handleFiles: [], createPromptNode: [], render: 0, scheduleSave: 0, pushUndo: 0 },
        idSeq: 0,
        ...(overrides.state || {}),
    };
    const fns = overrides.fns || {};

    const sandbox = {
        window: overrides.window || {},
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise, RegExp, JSON, Error,
        File: overrides.File || class File { constructor(parts, name, opts = {}) { this.parts = parts; this.name = name; this.type = opts.type || ''; } },
        Event: class Event { constructor(type) { this.type = type; } },

        navigator: overrides.navigator || {},
        localStorage: overrides.localStorage === undefined ? createMemoryStorage() : overrides.localStorage,
        document: overrides.document || {
            activeElement: null,
            getElementById: () => null,
            addEventListener() {},
        },

        get canvas() { return state.canvas; },
        set canvas(v) { state.canvas = v; },
        get nodes() { return state.nodes; },
        set nodes(v) { state.nodes = v; },
        get selectedId() { return state.selectedId; },
        set selectedId(v) { state.selectedId = v; },
        get selectedIds() { return state.selectedIds; },
        set selectedIds(v) { state.selectedIds = v; },
        get selectedImage() { return state.selectedImage; },
        set selectedImage(v) { state.selectedImage = v; },
        get lastMouseWorld() { return state.lastMouseWorld; },
        set lastMouseWorld(v) { state.lastMouseWorld = v; },

        selectedNodeIds: fns.selectedNodeIds || (() => (state.selectedIds.length ? state.selectedIds.slice() : (state.selectedId ? [state.selectedId] : []))),
        isEditableTarget: fns.isEditableTarget || (() => false),
        isBootLoadingActive: fns.isBootLoadingActive || (() => false),
        visibleWorldBounds: fns.visibleWorldBounds || (() => ({ left: 0, top: 0, right: 1000, bottom: 800 })),
        viewportCenter: fns.viewportCenter || (() => ({ x: 500, y: 400 })),
        cloneSmartNode: fns.cloneSmartNode || ((node, dx = 0, dy = 0) => {
            const copy = JSON.parse(JSON.stringify(node));
            copy.id = `copy_${++state.idSeq}`;
            copy.x = (Number(node.x) || 0) + dx;
            copy.y = (Number(node.y) || 0) + dy;
            return copy;
        }),
        createPromptNode: fns.createPromptNode || ((x, y, opts) => { state.calls.createPromptNode.push({ x, y, opts }); }),
        handleFiles: fns.handleFiles || ((files, targetId, opts) => { state.calls.handleFiles.push({ files, targetId, opts }); }),
        pushUndo: () => { state.calls.pushUndo++; },
        render: () => { state.calls.render++; },
        scheduleSave: () => { state.calls.scheduleSave++; },
        toast: (message) => { state.toasts.push(message); },
        isSupportedUploadFile: fns.isSupportedUploadFile || ((file) => {
            const type = String(file?.type || '');
            return /^(image|video|audio)\//i.test(type);
        }),
        isPromptTextFile: fns.isPromptTextFile || ((file) => {
            const type = String(file?.type || '').toLowerCase();
            const name = String(file?.name || '').toLowerCase();
            return type === 'text/plain' || /\.txt(\?|$)/.test(name);
        }),

        __state: state,
    };

    vm.createContext(sandbox);
    vm.runInContext(CLIPBOARD_SRC, sandbox, { filename: 'clipboard.js' });
    return sandbox;
}
