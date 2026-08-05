// 测试辅助：把经典 <script> 形式的 upload.js（M6）加载进模拟全局作用域，
// 供 vitest 测试用例调用其中定义的上传/拖拽解析函数。原理跟其它
// xxx-sandbox.js 一致，见 loop-node-sandbox.js 顶部注释。
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

const UPLOAD_SRC = readSrc('upload.js');

export function createUploadSandbox(overrides = {}) {
    const state = {
        nodes: overrides.nodes || [],
        selectedId: '',
        undoSuppressed: false,
    };

    // 简单的 DataTransfer mock：只支持测试用到的 types/getData/files/items 接口。
    function makeDataTransfer({ types = [], data = {}, files = [] } = {}) {
        return {
            types,
            files,
            items: files.map(f => ({
                kind: 'file',
                webkitGetAsEntry: () => null,
                getAsFile: () => f,
            })),
            getData: (type) => data[type] || '',
        };
    }

    const sandbox = {
        window: { StudioI18n: null, MediaForgeUpload: overrides.mediaForgeUpload || null },
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise,
        File: overrides.File || class File {
            constructor(parts, name, opts) { this.name = name; this.type = opts?.type || ''; }
        },
        FormData: class FormData { append(){} },
        DOMParser: overrides.DOMParser || class DOMParser {
            parseFromString(text) {
                // 极简 mock：不解析真实 HTML，只返回空结果（测试里不依赖 HTML 片段解析）。
                return { querySelectorAll: () => [] };
            }
        },
        fetch: overrides.fetch || (() => Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [] }) })),
        URL: URL,

        get nodes(){ return state.nodes; },
        set nodes(v){ state.nodes = v; },
        get selectedId(){ return state.selectedId; },
        set selectedId(v){ state.selectedId = v; },
        get undoSuppressed(){ return state.undoSuppressed; },
        set undoSuppressed(v){ state.undoSuppressed = v; },

        tr: overrides.fns?.tr || ((k) => k),
        smartResponseErrorMessage: overrides.fns?.smartResponseErrorMessage || (() => Promise.resolve('error')),
        selectedNode: overrides.fns?.selectedNode || (() => null),
        isSmartGroupNode: overrides.fns?.isSmartGroupNode || (() => false),
        isSmartImageNode: overrides.fns?.isSmartImageNode || ((n) => !n?.type || n.type === 'smart-image'),
        arrangeSmartGroupMembers: overrides.fns?.arrangeSmartGroupMembers || (() => {}),
        createImageNodeAt: overrides.fns?.createImageNodeAt || ((point, images, opts) => ({ id: 'new_node', type: opts?.type || 'smart-image', images: images || [] })),
        viewportCenter: overrides.fns?.viewportCenter || (() => ({ x: 0, y: 0 })),
        render: overrides.fns?.render || (() => {}),
        scheduleSave: overrides.fns?.scheduleSave || (() => {}),
        pushUndo: overrides.fns?.pushUndo || (() => {}),
        toast: overrides.fns?.toast || (() => {}),
        mediaKindForFile: overrides.fns?.mediaKindForFile || ((f) => (f?.type || '').startsWith('video/') ? 'video' : (f?.type || '').startsWith('audio/') ? 'audio' : 'image'),
        mediaKindForItem: overrides.fns?.mediaKindForItem || ((item) => item?.kind || 'image'),
        showUploadProgress: overrides.fns?.showUploadProgress || (() => {}),
        updateUploadProgress: overrides.fns?.updateUploadProgress || (() => {}),
        hideUploadProgress: overrides.fns?.hideUploadProgress || (() => {}),

        MEDIA_NODE_DEFAULT_SCALE: 2,
        MEDIA_GROUP_PREVIOUS_DEFAULT_SCALE: 1.6,
        MEDIA_GROUP_DEFAULT_SCALE: 0.8,

        __makeDataTransfer: makeDataTransfer,
    };

    vm.createContext(sandbox);
    vm.runInContext(UPLOAD_SRC, sandbox, { filename: 'upload.js' });
    return sandbox;
}
