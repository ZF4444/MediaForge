import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { createMsLoraSandbox } from './ms-lora-sandbox.js';

function run(ctx, expr) {
    return vm.runInContext(expr, ctx);
}

describe('normalizeLoraStrength', () => {
    it('限制在 0-2 之间', () => {
        const ctx = createMsLoraSandbox();
        expect(run(ctx, 'normalizeLoraStrength(0.8)')).toBe(0.8);
        expect(run(ctx, 'normalizeLoraStrength(-1)')).toBe(0);
        expect(run(ctx, 'normalizeLoraStrength(5)')).toBe(2);
    });

    it('非法值兜底为 0.8', () => {
        const ctx = createMsLoraSandbox();
        expect(run(ctx, 'normalizeLoraStrength(NaN)')).toBe(0.8);
        expect(run(ctx, "normalizeLoraStrength('abc')")).toBe(0.8);
        expect(run(ctx, 'normalizeLoraStrength(undefined)')).toBe(0.8);
    });

    it('字符串数字正常转换', () => {
        const ctx = createMsLoraSandbox();
        expect(run(ctx, "normalizeLoraStrength('1.2')")).toBe(1.2);
    });
});

describe('msLoraTargetOptions', () => {
    it('合并选中值/内置模型/供应商已配置模型，生成去重的 option 列表', () => {
        const ctx = createMsLoraSandbox({
            fns: {
                provider: () => ({ image_models: ['custom-model-1'] }),
            },
        });
        const html = run(ctx, "msLoraTargetOptions('custom-model-1')");
        expect(html).toContain('custom-model-1');
        expect(html).toContain('Tongyi-MAI/Z-Image-Turbo');
        expect(html).toContain('selected');
    });

    it('provider() 返回 null 时不报错，仅用内置模型', () => {
        const ctx = createMsLoraSandbox({ fns: { provider: () => null } });
        const html = run(ctx, "msLoraTargetOptions('Tongyi-MAI/Z-Image-Turbo')");
        expect(html).toContain('Tongyi-MAI/Z-Image-Turbo');
    });
});
