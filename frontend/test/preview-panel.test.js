import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { createPreviewPanelSandbox } from './preview-panel-sandbox.js';

function run(ctx, expr) {
    return vm.runInContext(expr, ctx);
}

describe('fieldSupportsRandom', () => {
    it('type 为 number 且 random_enabled 为 true 时支持随机', () => {
        const ctx = createPreviewPanelSandbox();
        expect(run(ctx, "fieldSupportsRandom({type:'number', random_enabled:true})")).toBe(true);
    });

    it('其它类型或 random_enabled 未开启时不支持', () => {
        const ctx = createPreviewPanelSandbox();
        expect(run(ctx, "fieldSupportsRandom({type:'slider', random_enabled:true})")).toBe(false);
        expect(run(ctx, "fieldSupportsRandom({type:'number', random_enabled:false})")).toBe(false);
        expect(run(ctx, "fieldSupportsRandom(null)")).toBe(false);
    });
});

describe('isPreviewRandomActive', () => {
    it('未设置时默认视为激活（true）', () => {
        const ctx = createPreviewPanelSandbox({ previewRandomActive: {} });
        expect(run(ctx, "isPreviewRandomActive('f1')")).toBe(true);
    });

    it('显式设置为 false 时视为未激活', () => {
        const ctx = createPreviewPanelSandbox({ previewRandomActive: { f1: false } });
        expect(run(ctx, "isPreviewRandomActive('f1')")).toBe(false);
    });
});

describe('randomValueForField', () => {
    it('整数字段（step 未指定或 >= 1）返回整数', () => {
        const ctx = createPreviewPanelSandbox();
        const result = run(ctx, "randomValueForField({min:0, max:10})");
        expect(Number.isInteger(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(10);
    });

    it('浮点 step 字段返回浮点数', () => {
        const ctx = createPreviewPanelSandbox();
        const result = run(ctx, "randomValueForField({min:0, max:1, step:0.01})");
        expect(typeof result).toBe('number');
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
    });

    it('看起来像 seed/noise 的字段名，未指定范围时使用较大的默认上限', () => {
        const ctx = createPreviewPanelSandbox();
        const result = run(ctx, "randomValueForField({input:'seed', name:''})");
        expect(result).toBeGreaterThanOrEqual(1);
    });

    it('非 seed 字段名，未指定范围时使用默认 0-999999', () => {
        const ctx = createPreviewPanelSandbox();
        const result = run(ctx, "randomValueForField({input:'count', name:''})");
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(999999);
    });

    it('max <= min 时使用默认上限而不是产生无效范围', () => {
        const ctx = createPreviewPanelSandbox();
        const result = run(ctx, "randomValueForField({min:100, max:50, input:'count'})");
        expect(result).toBeGreaterThanOrEqual(100);
    });
});

describe('randomButtonHtml', () => {
    it('字段不支持随机时返回空字符串', () => {
        const ctx = createPreviewPanelSandbox();
        expect(run(ctx, "randomButtonHtml({type:'text'})")).toBe('');
    });

    it('字段支持随机时返回带 onclick 的按钮 HTML', () => {
        const ctx = createPreviewPanelSandbox();
        const html = run(ctx, "randomButtonHtml({id:'f1', type:'number', random_enabled:true})");
        expect(html).toContain('togglePreviewRandom');
        expect(html).toContain('f1');
    });
});
