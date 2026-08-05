import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { createStorageManagerSandbox } from './storage-manager-sandbox.js';

function run(ctx, expr) {
    return vm.runInContext(expr, ctx);
}

describe('storageUsagePercent', () => {
    it('quota 为 0 时返回 0', () => {
        const ctx = createStorageManagerSandbox({ storageUsage: { quota_bytes: 0, used_bytes: 100 } });
        expect(run(ctx, 'storageUsagePercent()')).toBe(0);
    });

    it('正常计算用量百分比', () => {
        const ctx = createStorageManagerSandbox({ storageUsage: { quota_bytes: 1000, used_bytes: 250 } });
        expect(run(ctx, 'storageUsagePercent()')).toBe(25);
    });

    it('超出配额时封顶 100', () => {
        const ctx = createStorageManagerSandbox({ storageUsage: { quota_bytes: 1000, used_bytes: 5000 } });
        expect(run(ctx, 'storageUsagePercent()')).toBe(100);
    });
});

describe('storageEntries / currentStorageEntries', () => {
    it('返回 storageFiles.entries 数组', () => {
        const entries = [{ file_id: 'a' }, { file_id: 'b' }];
        const ctx = createStorageManagerSandbox({ storageFiles: { entries } });
        expect(run(ctx, 'JSON.stringify(storageEntries())')).toBe(JSON.stringify(entries));
        expect(run(ctx, 'JSON.stringify(currentStorageEntries())')).toBe(JSON.stringify(entries));
    });

    it('entries 非数组时兜底为空数组', () => {
        const ctx = createStorageManagerSandbox({ storageFiles: {} });
        expect(run(ctx, 'JSON.stringify(storageEntries())')).toBe('[]');
    });
});

describe('findStorageEntry / selectedStorageEntry', () => {
    const entries = [{ file_id: 'a', name: 'A' }, { file_id: 'b', name: 'B' }];

    it('按 file_id 查找', () => {
        const ctx = createStorageManagerSandbox({ storageFiles: { entries } });
        expect(run(ctx, "JSON.stringify(findStorageEntry('b'))")).toBe(JSON.stringify(entries[1]));
    });

    it('找不到返回 null', () => {
        const ctx = createStorageManagerSandbox({ storageFiles: { entries } });
        expect(run(ctx, "findStorageEntry('nope')")).toBeNull();
    });

    it('selectedStorageEntry 优先返回已选中的第一个，否则返回列表第一个', () => {
        const ctx1 = createStorageManagerSandbox({ storageFiles: { entries }, storageSelectedIds: new Set(['b']) });
        expect(run(ctx1, 'JSON.stringify(selectedStorageEntry())')).toBe(JSON.stringify(entries[1]));

        const ctx2 = createStorageManagerSandbox({ storageFiles: { entries }, storageSelectedIds: new Set() });
        expect(run(ctx2, 'JSON.stringify(selectedStorageEntry())')).toBe(JSON.stringify(entries[0]));
    });
});

describe('storagePageInfo', () => {
    it('正常计算总页数和当前页', () => {
        const ctx = createStorageManagerSandbox({
            storageFiles: { total_matches: 125, limit: 50, current_page: 2, offset: 50 },
        });
        const info = JSON.parse(run(ctx, 'JSON.stringify(storagePageInfo())'));
        expect(info.totalMatches).toBe(125);
        expect(info.limit).toBe(50);
        expect(info.totalPages).toBe(3);
        expect(info.currentPage).toBe(2);
    });

    it('没有匹配项时总页数至少为 1', () => {
        const ctx = createStorageManagerSandbox({ storageFiles: { total_matches: 0, limit: 50 } });
        const info = JSON.parse(run(ctx, 'JSON.stringify(storagePageInfo())'));
        expect(info.totalPages).toBe(1);
        expect(info.currentPage).toBe(1);
    });
});

describe('storageThumbUrl', () => {
    it('拼接标准缩略图 API 路径', () => {
        const ctx = createStorageManagerSandbox();
        expect(run(ctx, "storageThumbUrl('file123')")).toBe('/api/files/file123/thumb');
    });

    it('空 id 返回空字符串', () => {
        const ctx = createStorageManagerSandbox();
        expect(run(ctx, "storageThumbUrl('')")).toBe('');
    });

    it('对 id 做 URL 编码', () => {
        const ctx = createStorageManagerSandbox();
        expect(run(ctx, "storageThumbUrl('a b/c')")).toBe('/api/files/a%20b%2Fc/thumb');
    });
});

describe('storageDateInputValue', () => {
    it('未设置 storageCreatedBefore 时返回空字符串', () => {
        const ctx = createStorageManagerSandbox({ storageCreatedBefore: null });
        expect(run(ctx, 'storageDateInputValue()')).toBe('');
    });

    it('设置了时间戳时返回 YYYY-MM-DD 格式', () => {
        const ctx = createStorageManagerSandbox({ storageCreatedBefore: new Date('2026-03-15T12:00:00Z').getTime() });
        const result = run(ctx, 'storageDateInputValue()');
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
