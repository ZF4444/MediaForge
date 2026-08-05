// node-layout.js 回归测试（M3）。
//
// 覆盖范围：
//   1. safeScale / nodeScale / mediaNodeDefaultScale：缩放系数计算。
//   2. singleImageLayout：单图节点按原始宽高比或显式尺寸计算展示尺寸。
//   3. groupImageGridLayout：多图分组在给定容器尺寸下的网格排布搜索。
//   4. smartNodeInputThumbRows / smartNodeInputThumbsHeight：输入缩略图行数/高度。
//   5. promptNodeLayoutSize：Prompt 节点尺寸计算（含历史遗留高度兼容）。
//   6. imageLayout / nodeRect：统一入口，按节点类型分派到不同布局分支。
import { describe, it, expect } from 'vitest';
import { createNodeLayoutSandbox } from './node-layout-sandbox.js';

describe('safeScale', () => {
    it('正数返回原值，非正数/非数字回退为 1', () => {
        const { safeScale } = createNodeLayoutSandbox();
        expect(safeScale(2)).toBe(2);
        expect(safeScale(0)).toBe(1);
        expect(safeScale(-1)).toBe(1);
        expect(safeScale(NaN)).toBe(1);
        expect(safeScale(undefined)).toBe(1);
    });
});

describe('mediaNodeDefaultScale', () => {
    it('多图（>1）用分组默认缩放，单图/无图用单图默认缩放', () => {
        const sandbox = createNodeLayoutSandbox();
        expect(sandbox.mediaNodeDefaultScale({ images: [{}, {}] })).toBe(0.8);
        expect(sandbox.mediaNodeDefaultScale({ images: [{}] })).toBe(2);
        expect(sandbox.mediaNodeDefaultScale({ images: [] })).toBe(2);
        expect(sandbox.mediaNodeDefaultScale(null)).toBe(2);
    });
});

describe('nodeScale', () => {
    it('smart-image 节点或无 type 走 mediaNodeDefaultScale，其它类型固定为 1', () => {
        const sandbox = createNodeLayoutSandbox();
        expect(sandbox.nodeScale({ type: 'smart-image', images: [{}, {}] })).toBe(0.8);
        expect(sandbox.nodeScale({})).toBe(2); // 无 type
        expect(sandbox.nodeScale({ type: 'smart-prompt' })).toBe(1);
    });
});

describe('singleImageLayout', () => {
    it('非 smart-image 节点且显式尺寸 > 24 时，直接使用显式宽高', () => {
        const sandbox = createNodeLayoutSandbox({
            fns: { isSmartImageNode: (n) => n?.type === 'smart-image' },
        });
        const result = sandbox.singleImageLayout({}, { type: 'smart-group', w: 300, h: 200 }, 1);
        expect(result).toMatchObject({ width: 300, height: 200, single: true, cols: 1, rows: 1 });
    });

    it('有原始宽高时按比例适配进最大展示框', () => {
        const sandbox = createNodeLayoutSandbox();
        // 原图 1600x900（16:9），scale=1 时最大框 260x220
        const result = sandbox.singleImageLayout({ natural_w: 1600, natural_h: 900 }, null, 1);
        expect(result.width).toBeLessThanOrEqual(260);
        expect(result.height).toBeLessThanOrEqual(220);
        // 保持宽高比
        expect(Math.abs(result.width / result.height - 1600 / 900)).toBeLessThan(0.05);
    });

    it('没有原始尺寸信息时回退到默认 260x180（按 scale 缩放）', () => {
        const sandbox = createNodeLayoutSandbox();
        const result = sandbox.singleImageLayout({}, null, 1);
        expect(result).toMatchObject({ width: 260, height: 180 });
    });
});

describe('groupImageGridLayout', () => {
    it('在给定容器尺寸内搜索能容纳 count 张图的最优列数/缩略图尺寸', () => {
        const sandbox = createNodeLayoutSandbox();
        const result = sandbox.groupImageGridLayout(4, 600, 400, 224);
        expect(result.cols * result.rows).toBeGreaterThanOrEqual(4);
        expect(result.thumb).toBeGreaterThan(0);
        // 缩略图占用空间不应超过容器（含 pad/gap 的宽松上界检查）
        const usedW = result.cols * result.thumb + (result.cols - 1) * 8 + 32;
        expect(usedW).toBeLessThanOrEqual(600 + 1); // +1 容忍舍入
    });

    it('容器过小导致无法容纳任何列数时，回退到默认两列布局', () => {
        const sandbox = createNodeLayoutSandbox();
        const result = sandbox.groupImageGridLayout(6, 10, 10, 224);
        expect(result.cols).toBe(2);
        expect(result.rows).toBe(3);
    });
});

describe('smartNodeInputThumbRows / smartNodeInputThumbsHeight', () => {
    it('0 张图返回 0 行 / 0 高度', () => {
        const sandbox = createNodeLayoutSandbox();
        expect(sandbox.smartNodeInputThumbRows(0)).toBe(0);
        expect(sandbox.smartNodeInputThumbsHeight([])).toBe(0);
    });

    it('每 5 个一行，超过 10 个时多算一格（+N 徽标占位）', () => {
        const sandbox = createNodeLayoutSandbox();
        expect(sandbox.smartNodeInputThumbRows(5)).toBe(1);
        expect(sandbox.smartNodeInputThumbRows(6)).toBe(2);
        expect(sandbox.smartNodeInputThumbRows(10)).toBe(2);
        // 11 张：display count 用 11（10张+"+1"占位）-> ceil(11/5)=3
        expect(sandbox.smartNodeInputThumbRows(11)).toBe(3);
        expect(sandbox.smartNodeInputThumbRows(20)).toBe(3);
    });

    it('高度按行数 * 44 + (行数-1)*6 + 8 计算', () => {
        const sandbox = createNodeLayoutSandbox();
        const images = new Array(5).fill({ url: 'x.png' });
        // 5张 -> 1行 -> 1*44 + 0 + 8 = 52
        expect(sandbox.smartNodeInputThumbsHeight(images)).toBe(52);
    });
});

describe('promptNodeLayoutSize', () => {
    it('无显式尺寸或旧版尺寸时使用当前默认值 316x194', () => {
        const sandbox = createNodeLayoutSandbox();
        expect(sandbox.promptNodeLayoutSize({})).toEqual({ width: 316, height: 194 });
        expect(sandbox.promptNodeLayoutSize({ w: 360, h: 230 })).toEqual({ width: 316, height: 194 });
    });

    it('历史遗留展开高度会被兼容性收起为默认高度', () => {
        const sandbox = createNodeLayoutSandbox();
        for (const legacyH of [292, 340, 344, 400]) {
            expect(sandbox.promptNodeLayoutSize({ h: legacyH }).height).toBe(194);
        }
    });

    it('非旧版显式尺寸会被保留（不小于回退高度）', () => {
        const sandbox = createNodeLayoutSandbox();
        expect(sandbox.promptNodeLayoutSize({ w: 500, h: 250 })).toEqual({ width: 500, height: 250 });
    });
});

describe('imageLayout 按节点类型分派', () => {
    it('smart-loop 节点：宽度取显式值或 smartLoopWidth，高度取 max(显式值, smartLoopHeight)', () => {
        const sandbox = createNodeLayoutSandbox();
        const node = { type: 'smart-loop', imageInput: false, showPrompt: false };
        const result = sandbox.imageLayout([], 1, node);
        expect(result.width).toBe(340); // smartLoopWidth 固定 340
        expect(result.height).toBe(168); // smartLoopHeight 基础高度
    });

    it('smart-prompt 节点：走 promptNodeLayoutSize', () => {
        const sandbox = createNodeLayoutSandbox();
        const result = sandbox.imageLayout([], 1, { type: 'smart-prompt' });
        expect(result).toMatchObject({ width: 316, height: 194, single: true });
    });

    it('0 张图非 pending 状态：使用空生成节点默认尺寸', () => {
        const sandbox = createNodeLayoutSandbox();
        const result = sandbox.imageLayout([], 1, { type: 'smart-image' });
        expect(result).toMatchObject({ width: 316, height: 194, single: true });
    });

    it('1 张图：走 singleImageLayout', () => {
        const sandbox = createNodeLayoutSandbox();
        const result = sandbox.imageLayout([{ natural_w: 100, natural_h: 100 }], 1, { type: 'smart-image' });
        expect(result.single).toBe(true);
    });

    it('多张图无 grid 信息：按 cols/rows 网格计算尺寸', () => {
        const sandbox = createNodeLayoutSandbox();
        const images = new Array(4).fill({ url: 'x.png' });
        const result = sandbox.imageLayout(images, 1, { type: 'smart-image' });
        expect(result.cols).toBeGreaterThanOrEqual(2);
        expect(result.rows).toBeGreaterThanOrEqual(1);
        expect(result.cols * result.rows).toBeGreaterThanOrEqual(4);
    });
});

describe('nodeRect', () => {
    it('返回节点的 x/y 以及 imageLayout 计算出的 width/height', () => {
        const sandbox = createNodeLayoutSandbox();
        const node = { x: 10, y: 20, type: 'smart-image', images: [] };
        const rect = sandbox.nodeRect(node);
        expect(rect.x).toBe(10);
        expect(rect.y).toBe(20);
        expect(rect.width).toBe(316);
        expect(rect.height).toBe(194);
    });

    it('x/y 缺省时回退为 0', () => {
        const sandbox = createNodeLayoutSandbox();
        const rect = sandbox.nodeRect({ type: 'smart-image', images: [] });
        expect(rect.x).toBe(0);
        expect(rect.y).toBe(0);
    });
});
