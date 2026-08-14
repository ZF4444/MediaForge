// 测试辅助：把经典 <script> 形式的 asset-library.js（M9）加载进模拟全局作用域，
// 供 vitest 测试用例调用其中定义的纯逻辑函数（资产库/分类数据访问、
// 媒体类型判定、拖拽 payload 构建）。原理跟其它 xxx-sandbox.js 一致，
// 见 loop-node-sandbox.js 顶部注释。
//
// 注意：renderAssetLibrary/bindAssetItemEvents/beginAssetInlineRename/
// openNodeAssetSaveModal 等函数强依赖真实 DOM（assetGrid 元素查询/
// fetch 网络请求等），跟 M5/M7/M8 核心批次同类的"过于依赖 DOM/网络，
// 不适合单元测试"情形，因此本 sandbox 只覆盖可独立验证的纯函数：
// assetLibraries / activeAssetLibrary / assetCategories /
// activeAssetCategory / assetCategoriesForLibrary / assetMediaKind /
// canvasImageDragPayload。
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

const ASSET_LIBRARY_SRC = readSrc('asset-library.js');

export function createAssetLibrarySandbox(overrides = {}) {
    const state = {
        assetLibrary: overrides.assetLibrary ?? { libraries: [], categories: [] },
        activeAssetLibraryId: overrides.activeAssetLibraryId ?? '',
        activeAssetCategoryId: overrides.activeAssetCategoryId ?? '',
    };

    const sandbox = {
        window: {},
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise, RegExp,

        get assetLibrary() { return state.assetLibrary; },
        set assetLibrary(v) { state.assetLibrary = v; },
        get activeAssetLibraryId() { return state.activeAssetLibraryId; },
        set activeAssetLibraryId(v) { state.activeAssetLibraryId = v; },
        get activeAssetCategoryId() { return state.activeAssetCategoryId; },
        set activeAssetCategoryId(v) { state.activeAssetCategoryId = v; },

        __state: state,
    };

    vm.createContext(sandbox);
    vm.runInContext(ASSET_LIBRARY_SRC, sandbox, { filename: 'asset-library.js' });
    return sandbox;
}
