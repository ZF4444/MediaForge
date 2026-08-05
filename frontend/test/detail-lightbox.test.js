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
