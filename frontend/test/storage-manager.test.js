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

describe('storageCardThumb', () => {
    it('video 类型渲染 <img> 指向 /thumb 接口，而不是 <video>（/thumb 只返回静态图片，video 标签加载会静默失败）', () => {
        const ctx = createStorageManagerSandbox();
        const html = run(ctx, "storageCardThumb({file_id:'abc', kind:'video', original_name:'clip.mp4'})");
        expect(html).toContain('<img');
        expect(html).not.toContain('<video');
        expect(html).toContain('/api/files/abc/thumb');
    });

    it('image 类型同样渲染 <img> 指向 /thumb 接口', () => {
        const ctx = createStorageManagerSandbox();
        const html = run(ctx, "storageCardThumb({file_id:'xyz', kind:'image', original_name:'pic.png'})");
        expect(html).toContain('<img');
        expect(html).toContain('/api/files/xyz/thumb');
    });

    it('缺少 file_id 时回退到 assetThumb(item.url)', () => {
        const calls = [];
        const ctx = createStorageManagerSandbox({
            fns: { assetThumb: (item) => { calls.push(item); return '<i>fallback</i>'; } },
        });
        const html = run(ctx, "storageCardThumb({kind:'video', url:'https://example.com/v.mp4', original_name:'clip.mp4'})");
        expect(html).toBe('<i>fallback</i>');
        expect(calls[0].url).toBe('https://example.com/v.mp4');
    });

    it('非 image/video 类型（如文档）回退到 assetThumb(item.url)', () => {
        const calls = [];
        const ctx = createStorageManagerSandbox({
            fns: { assetThumb: (item) => { calls.push(item); return '<i>doc</i>'; } },
        });
        const html = run(ctx, "storageCardThumb({file_id:'doc1', kind:'document', url:'https://example.com/f.pdf'})");
        expect(html).toBe('<i>doc</i>');
        expect(calls[0].kind).toBe('document');
    });
});

describe('exportStorageEntries', () => {
    function exportCtx(extra = {}) {
        const statuses = [];
        const ctx = createStorageManagerSandbox({
            storageFiles: { entries: [{ file_id: 'a', original_name: 'a.png' }] },
            fns: { setStatus: s => statuses.push(s) },
        });
        const clicks = [];
        ctx.document = {
            createElement: () => ({ click() { clicks.push(this.href + '|' + (this.download || '')); }, remove() {} }),
            body: { appendChild() {} },
        };
        ctx.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
        ctx.setTimeout = () => 0;
        Object.assign(ctx, extra);
        return { ctx, statuses, clicks };
    }

    it('未选择文件时不做任何事', async () => {
        const { ctx, statuses, clicks } = exportCtx();
        await run(ctx, 'exportStorageEntries([])');
        expect(statuses).toEqual([]);
        expect(clicks).toEqual([]);
    });

    it('只选 1 个文件时直接走单文件下载接口', async () => {
        const { ctx, clicks } = exportCtx();
        await run(ctx, "exportStorageEntries(['a'])");
        expect(clicks).toEqual(['/api/files/a/download|a.png']);
    });

    it('选多个文件时请求 /api/storage/export 并保存 zip', async () => {
        const calls = [];
        const response = {
            ok: true,
            headers: { get: name => ({ 'Content-Disposition': "attachment; filename*=UTF-8''pack.zip", 'X-Export-Count': '2', 'X-Export-Skipped': '1' })[name] },
            blob: async () => 'BLOB',
        };
        const { ctx, statuses, clicks } = exportCtx({
            fetch: async (url, opts) => { calls.push([url, JSON.parse(opts.body)]); return response; },
        });
        await run(ctx, "exportStorageEntries(['a','b','a'])");
        expect(calls).toEqual([['/api/storage/export', { file_ids: ['a', 'b'] }]]);
        expect(clicks).toEqual(['blob:x|pack.zip']);
        expect(statuses.at(-1)).toBe('已导出 2 个文件，1 个文件读取失败');
    });

    it('后端返回错误时在状态栏显示 detail', async () => {
        const { ctx, statuses, clicks } = exportCtx({
            fetch: async () => ({ ok: false, json: async () => ({ detail: '请分批导出' }) }),
        });
        await run(ctx, "exportStorageEntries(['a','b'])");
        expect(statuses.at(-1)).toBe('请分批导出');
        expect(clicks).toEqual([]);
    });
});

describe('deleteSelectedStorageEntries', () => {
    function deleteCtx(confirmResult) {
        const messages = [];
        const requests = [];
        const ctx = createStorageManagerSandbox({
            storageFiles: { entries: [{ file_id: 'a' }, { file_id: 'b' }], total_matches: 2, limit: 50 },
            storageSelectedIds: new Set(['a', 'b']),
            fns: {
                confirm: message => { messages.push(message); return confirmResult; },
                apiJson: async (url, options) => { requests.push([url, options?.body]); return { removed: 2, deleted: ['a', 'b'], entries: [] }; },
            },
        });
        return { ctx, messages, requests };
    }

    it('确认后才调用删除接口，弹窗里显示选中数量', async () => {
        const { ctx, messages, requests } = deleteCtx(true);
        await run(ctx, 'deleteSelectedStorageEntries()');
        expect(messages).toEqual(['确定删除选中的 2 个文件？此操作不可恢复。']);
        expect(requests.find(([url]) => url === '/api/storage/delete')?.[1]).toBe(JSON.stringify({ file_ids: ['a', 'b'] }));
    });

    it('取消确认时不调用任何接口，选中状态保持不变', async () => {
        const { ctx, requests } = deleteCtx(false);
        await run(ctx, 'deleteSelectedStorageEntries()');
        expect(requests).toEqual([]);
        expect(run(ctx, 'storageSelectedIds.size')).toBe(2);
    });

    it('没有选中文件时不弹窗', async () => {
        const { ctx, messages } = deleteCtx(true);
        run(ctx, 'storageSelectedIds.clear()');
        await run(ctx, 'deleteSelectedStorageEntries()');
        expect(messages).toEqual([]);
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
