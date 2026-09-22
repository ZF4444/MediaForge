import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { createDetailLightboxSandbox } from './detail-lightbox-sandbox.js';

function run(ctx, expr) {
    return vm.runInContext(expr, ctx);
}

describe('rectsIntersect', () => {
    it('重叠的矩形返回 true', () => {
        const ctx = createDetailLightboxSandbox();
        const a = { left: 0, right: 10, top: 0, bottom: 10 };
        const b = { left: 5, right: 15, top: 5, bottom: 15 };
        expect(run(ctx, `rectsIntersect(${JSON.stringify(a)}, ${JSON.stringify(b)})`)).toBe(true);
    });

    it('完全分离的矩形返回 false', () => {
        const ctx = createDetailLightboxSandbox();
        const a = { left: 0, right: 10, top: 0, bottom: 10 };
        const b = { left: 20, right: 30, top: 20, bottom: 30 };
        expect(run(ctx, `rectsIntersect(${JSON.stringify(a)}, ${JSON.stringify(b)})`)).toBe(false);
    });

    it('边缘刚好接触（不重叠）返回 false（严格不等号）', () => {
        const ctx = createDetailLightboxSandbox();
        const a = { left: 0, right: 10, top: 0, bottom: 10 };
        const b = { left: 10, right: 20, top: 0, bottom: 10 };
        expect(run(ctx, `rectsIntersect(${JSON.stringify(a)}, ${JSON.stringify(b)})`)).toBe(false);
    });

    it('一个矩形完全包含另一个返回 true', () => {
        const ctx = createDetailLightboxSandbox();
        const a = { left: 0, right: 100, top: 0, bottom: 100 };
        const b = { left: 10, right: 20, top: 10, bottom: 20 };
        expect(run(ctx, `rectsIntersect(${JSON.stringify(a)}, ${JSON.stringify(b)})`)).toBe(true);
    });
});

describe('marqueeTargetSelector', () => {
    it('assets 标签页 + 管理模式开启时返回资产卡片选择器', () => {
        const ctx = createDetailLightboxSandbox({ activeTab: 'assets', assetManageMode: true });
        expect(run(ctx, 'marqueeTargetSelector()')).toBe('[data-asset-card]');
    });

    it('prompts 标签页 + 管理模式开启时返回提示词行选择器', () => {
        const ctx = createDetailLightboxSandbox({ activeTab: 'prompts', promptManageMode: true });
        expect(run(ctx, 'marqueeTargetSelector()')).toBe('[data-prompt-row]');
    });

    it('local 标签页 + 管理模式开启时返回本地卡片选择器', () => {
        const ctx = createDetailLightboxSandbox({ activeTab: 'local', localManageMode: true });
        expect(run(ctx, 'marqueeTargetSelector()')).toBe('[data-local-card]');
    });

    it('管理模式未开启时返回空字符串（不允许框选）', () => {
        const ctx = createDetailLightboxSandbox({ activeTab: 'assets', assetManageMode: false });
        expect(run(ctx, 'marqueeTargetSelector()')).toBe('');
    });

    it('storage/canvas-assets 标签页始终返回空字符串（不支持框选）', () => {
        const ctx = createDetailLightboxSandbox({ activeTab: 'storage' });
        expect(run(ctx, 'marqueeTargetSelector()')).toBe('');
    });
});

describe('showDetailPreview', () => {
    function sandboxWithCapturedOverlay(overrides = {}) {
        let capturedOverlay = null;
        const doc = {
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => {
                capturedOverlay = { classList: { add(){}, remove(){}, toggle(){} }, dataset: {}, style: {}, addEventListener(){}, appendChild(){}, remove(){}, innerHTML:'' };
                return capturedOverlay;
            },
            body: { appendChild(){}, classList: { add(){}, remove(){} } },
            addEventListener(){},
            removeEventListener(){},
        };
        const statusCalls = [];
        const ctx = createDetailLightboxSandbox({
            ...overrides,
            document: doc,
            fns: { ...(overrides.fns || {}), setStatus: (msg) => statusCalls.push(msg) },
        });
        return { ctx, getOverlay: () => capturedOverlay, statusCalls };
    }

    it('video 类型渲染 <video> 标签并允许预览（不再提示"仅图片支持"）', () => {
        const { ctx, getOverlay, statusCalls } = sandboxWithCapturedOverlay({
            activeTab: 'storage',
            fns: { findStorageEntry: () => ({ file_id: 'v1', kind: 'video', url: 'https://example.com/clip.mp4', original_name: 'clip.mp4' }) },
        });
        run(ctx, "showDetailPreview('storage', 'v1')");
        expect(statusCalls).toEqual([]);
        expect(getOverlay().innerHTML).toContain('<video');
        expect(getOverlay().innerHTML).toContain('controls');
        expect(getOverlay().innerHTML).toContain('clip.mp4');
    });

    it('image 类型仍渲染 <img> 标签', () => {
        const { ctx, getOverlay, statusCalls } = sandboxWithCapturedOverlay({
            activeTab: 'storage',
            fns: { findStorageEntry: () => ({ file_id: 'i1', kind: 'image', url: 'https://example.com/pic.png', original_name: 'pic.png' }) },
        });
        run(ctx, "showDetailPreview('storage', 'i1')");
        expect(statusCalls).toEqual([]);
        expect(getOverlay().innerHTML).toContain('<img');
        expect(getOverlay().innerHTML).not.toContain('<video');
    });

    it('文档等其它类型仍提示不支持放大预览，不创建 overlay', () => {
        const { ctx, getOverlay, statusCalls } = sandboxWithCapturedOverlay({
            activeTab: 'storage',
            fns: { findStorageEntry: () => ({ file_id: 'd1', kind: 'document', url: 'https://example.com/f.pdf' }) },
        });
        run(ctx, "showDetailPreview('storage', 'd1')");
        expect(statusCalls).toEqual(['仅图片/视频支持放大预览']);
        expect(getOverlay()).toBeNull();
    });

    it('asset 来源的视频同样支持预览', () => {
        const { ctx, getOverlay } = sandboxWithCapturedOverlay({
            activeTab: 'assets',
            fns: {
                assetKind: () => 'video',
                findAssetItem: () => ({ id: 'a1', url: 'https://example.com/a.mp4', name: 'a.mp4' }),
            },
        });
        run(ctx, "showDetailPreview('asset', 'a1')");
        expect(getOverlay().innerHTML).toContain('<video');
    });
});
