// 测试辅助：把经典 <script> 形式的 storage-manager.js（asset-manager 页面）
// 加载进模拟全局作用域，供 vitest 测试用例调用其中定义的纯逻辑函数。
//
// 注意：loadStorageUsage/loadStorageFiles/deleteStorageEntries/
// renderStorageManager 等依赖网络请求/真实 DOM，不适合单元测试。本
// sandbox 主要覆盖读取 storageUsage/storageFiles 状态做计算的纯函数：
// storageUsagePercent/storageEntries/storageCategories/
// currentStorageEntries/findStorageEntry/selectedStorageEntry/
// storagePageInfo/storageThumbUrl/storageDateInputValue。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const STORAGE_MANAGER_SRC = fs.readFileSync(
    path.resolve(repoRoot, 'frontend/src/asset-manager/storage-manager.js'),
    'utf8'
);

export function createStorageManagerSandbox(overrides = {}) {
    const sandbox = {
        window: {},
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, JSON, URLSearchParams,

        storageUsage: overrides.storageUsage ?? { usage_by_category: [] },
        storageFiles: overrides.storageFiles ?? { entries: [], offset: 0, limit: 50, has_more: false, total_matches: 0, total_pages: 0, current_page: 1 },
        storageCategoryFilter: overrides.storageCategoryFilter ?? '',
        storageQuery: overrides.storageQuery ?? '',
        storageSortOrder: overrides.storageSortOrder ?? 'desc',
        storageCreatedBefore: overrides.storageCreatedBefore ?? null,
        storageUnreferencedOnly: overrides.storageUnreferencedOnly ?? false,
        storageFiltersOpen: overrides.storageFiltersOpen ?? false,
        storageSelectedIds: overrides.storageSelectedIds ?? new Set(),
        storageManageMode: overrides.storageManageMode ?? false,
        meInfo: overrides.meInfo ?? { user_id: '', pages: [] },
        root: overrides.root ?? null,
        assetThumb: overrides.fns?.assetThumb || (() => ''),
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
    };

    vm.createContext(sandbox);
    vm.runInContext(STORAGE_MANAGER_SRC, sandbox, { filename: 'storage-manager.js' });
    return sandbox;
}
