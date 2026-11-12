// 画布视口缩放保护的源码约束：main.js 是经典脚本，难以整体加载，
// 这里直接读源码文本断言关键保护没有被改掉。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(resolve(process.cwd(), 'src/canvas/main.js'), 'utf8');

// 截取函数体：从 `function name(` 到下一个顶层（行首）声明，避免被 catch (e) {} 等截断。
function functionBody(name) {
    const start = src.search(new RegExp(`^(async )?function ${name}\\(`, 'm'));
    expect(start, `找不到函数 ${name}`).toBeGreaterThanOrEqual(0);
    const rest = src.slice(start + 1);
    const next = rest.search(/^(async function |function |const |let |shell\.addEventListener)/m);
    return next < 0 ? rest : rest.slice(0, next);
}

describe('shellWheelHandler 滚轮缩放保护', () => {
    const body = functionBody('shellWheelHandler');

    it('按 deltaMode 换算并限制单次 deltaY', () => {
        expect(body).toContain('deltaMode');
        expect(body).toMatch(/Math\.max\(-100, Math\.min\(100,/);
    });

    it('忽略非有限的 deltaY，并通过 safeScale 得到最终缩放', () => {
        expect(body).toContain('Number.isFinite(wheelDelta)');
        expect(body).toContain('safeScale(viewport.scale * factor)');
        expect(body).not.toContain('e.deltaY * 0.001');
    });
});

describe('loadCanvas 加载坏视口修复', () => {
    const body = functionBody('loadCanvas');

    it('校验视口，并在渲染后对坏视口执行适应全部', () => {
        expect(body).toContain('isViewportUsable(viewport)');
        expect(body).toContain('if(viewportNeedsRepair) fitAllNodesViewport();');
        const renderAt = body.indexOf('render();');
        const fitAt = body.indexOf('if(viewportNeedsRepair) fitAllNodesViewport();');
        expect(fitAt).toBeGreaterThan(renderAt);
    });

    it('x/y 无效时回退为 0', () => {
        expect(body).toContain('viewport.x = 0');
        expect(body).toContain('viewport.y = 0');
    });
});

describe('fitAllNodesViewport 缩放下限', () => {
    it('引用 CANVAS_MIN_SCALE，不再写死 0.06', () => {
        const body = functionBody('fitAllNodesViewport');
        expect(body).toContain('CANVAS_MIN_SCALE');
        expect(body).not.toContain('Math.max(0.06');
    });
});
