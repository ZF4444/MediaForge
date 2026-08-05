// 测试辅助：把经典 <script> 形式的 detail-lightbox.js（asset-manager 页面）
// 加载进模拟全局作用域，供 vitest 测试用例调用其中定义的纯逻辑函数。
//
// 注意：showDetailPreview/beginMarqueeSelection 等强依赖真实 DOM 事件/
// getBoundingClientRect，不适合单元测试。本 sandbox 主要覆盖两个纯函数：
// rectsIntersect（矩形相交判断）、marqueeTargetSelector（根据当前标签页
// 和管理模式状态决定框选目标选择器）。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const DETAIL_LIGHTBOX_SRC = fs.readFileSync(
    path.resolve(repoRoot, 'frontend/src/asset-manager/detail-lightbox.js'),
    'utf8'
);

export function createDetailLightboxSandbox(overrides = {}) {
    const sandbox = {
        window: { open: overrides.fns?.windowOpen || (() => {}) },
        console, Math, Array, Object, Number, String, Boolean, Set, Map, JSON,

        activeTab: overrides.activeTab ?? 'assets',
        assetManageMode: overrides.assetManageMode ?? false,
        promptManageMode: overrides.promptManageMode ?? false,
        localManageMode: overrides.localManageMode ?? false,
        selectedAssetIds: overrides.selectedAssetIds ?? new Set(),
        selectedPromptIds: overrides.selectedPromptIds ?? new Set(),
        selectedLocalIds: overrides.selectedLocalIds ?? new Set(),
        selectedLocalUploadIds: overrides.selectedLocalUploadIds ?? new Set(),
        marqueeState: overrides.marqueeState ?? null,
        lightboxPanState: overrides.lightboxPanState ?? null,
        findAssetItem: overrides.fns?.findAssetItem || (() => null),
        findPromptItem: overrides.fns?.findPromptItem || (() => null),
        findLocalItem: overrides.fns?.findLocalItem || (() => null),
        findLocalUpload: overrides.fns?.findLocalUpload || (() => null),
        findStorageEntry: overrides.fns?.findStorageEntry || (() => null),
        localItemKind: overrides.fns?.localItemKind || (() => 'image'),
        localObjectUrl: overrides.fns?.localObjectUrl || (() => ''),
        assetKind: overrides.fns?.assetKind || (() => 'image'),
        assetThumb: overrides.fns?.assetThumb || (() => ''),
        escapeHtml: overrides.fns?.escapeHtml || (s => String(s ?? '')),
        escapeAttr: overrides.fns?.escapeAttr || (s => String(s ?? '')),
        setStatus: overrides.fns?.setStatus || (() => {}),
        refreshIcons: overrides.fns?.refreshIcons || (() => {}),
        render: overrides.fns?.render || (() => {}),
        document: overrides.document ?? {
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({ classList: { add(){}, remove(){}, toggle(){} }, dataset: {}, style: {}, addEventListener(){}, appendChild(){}, remove(){} }),
            body: { appendChild(){} },
            addEventListener(){},
            removeEventListener(){},
        },
    };

    vm.createContext(sandbox);
    vm.runInContext(DETAIL_LIGHTBOX_SRC, sandbox, { filename: 'detail-lightbox.js' });
    return sandbox;
}
