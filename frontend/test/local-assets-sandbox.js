// 测试辅助：把经典 <script> 形式的 local-assets.js（asset-manager 页面）
// 加载进模拟全局作用域，供 vitest 测试用例调用其中定义的纯逻辑函数。
//
// 注意：uploadLocalAssets/deleteLocalAssets/loadSharedFolders/
// registerSharedFolder 等依赖网络请求/真实 DOM，不适合单元测试。本
// sandbox 主要覆盖纯逻辑函数：isLocalMediaFile/localItemKind/
// localFolderId/localChildPath/indexSharedTree，以及依赖状态读取的
// localFolderTotal/localItemsForFolder/findLocalItem。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const LOCAL_ASSETS_SRC = fs.readFileSync(
    path.resolve(repoRoot, 'frontend/src/asset-manager/local-assets.js'),
    'utf8'
);

export function createLocalAssetsSandbox(overrides = {}) {
    const sandbox = {
        window: {},
        console, Math, Array, Object, Number, String, Boolean, Set, Map, JSON,

        LOCAL_MEDIA_EXTS: overrides.LOCAL_MEDIA_EXTS ?? /\.(png|jpe?g|webp|gif|bmp|avif|svg|mp4|webm|mov|m4v|mp3|wav|flac|ogg|m4a|aac)(\?|#|$)/i,
        sharedFolders: overrides.sharedFolders ?? [],
        activeSharedFolderId: overrides.activeSharedFolderId ?? '',
        activeSharedFolderName: overrides.activeSharedFolderName ?? '',
        localFolders: overrides.localFolders ?? [],
        localFolderMap: overrides.localFolderMap ?? new Map(),
        localItemMap: overrides.localItemMap ?? new Map(),
        activeLocalFolderId: overrides.activeLocalFolderId ?? '',
        selectedLocalId: overrides.selectedLocalId ?? '',
        selectedLocalIds: overrides.selectedLocalIds ?? new Set(),
        localQuery: overrides.localQuery ?? '',
        localManageMode: overrides.localManageMode ?? false,
        localClipboard: overrides.localClipboard ?? null,
        localAssets: overrides.localAssets ?? [],
        localAssetsLoaded: overrides.localAssetsLoaded ?? false,
        selectedLocalUploadId: overrides.selectedLocalUploadId ?? '',
        selectedLocalUploadIds: overrides.selectedLocalUploadIds ?? new Set(),
        localUploadQuery: overrides.localUploadQuery ?? '',
        localUploadManageMode: overrides.localUploadManageMode ?? false,
        root: overrides.root ?? null,
        uploadInput: overrides.uploadInput ?? null,
        assetThumb: overrides.fns?.assetThumb || (() => ''),
        assetKindLabel: overrides.fns?.assetKindLabel || (() => ''),
        escapeHtml: overrides.fns?.escapeHtml || (s => String(s ?? '')),
        escapeAttr: overrides.fns?.escapeAttr || (s => String(s ?? '')),
        formatDate: overrides.fns?.formatDate || (() => ''),
        formatFileSize: overrides.fns?.formatFileSize || (() => ''),
        setStatus: overrides.fns?.setStatus || (() => {}),
        apiJson: overrides.fns?.apiJson || (() => Promise.resolve({})),
        refreshIcons: overrides.fns?.refreshIcons || (() => {}),
        render: overrides.fns?.render || (() => {}),
        confirm: overrides.fns?.confirm || (() => true),
        alert: overrides.fns?.alert || (() => {}),
        fetch: overrides.fns?.fetch || (() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })),
        window_open: overrides.fns?.windowOpen || (() => {}),
    };
    sandbox.window.open = sandbox.window_open;

    vm.createContext(sandbox);
    vm.runInContext(LOCAL_ASSETS_SRC, sandbox, { filename: 'local-assets.js' });
    return sandbox;
}
