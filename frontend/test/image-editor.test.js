// image-editor.js 回归测试（M8）。
//
// 覆盖范围：
//   1. gridJoinAutoDims：按图片数量自动计算网格拼接的行列数。
//   2. gridSplitRects / gridSplitRectsCustom：网格切分的矩形区域计算
//      （标准等分网格 + 自定义分割线两种模式）。
//   3. clampCrop：裁剪框在图片显示尺寸内的钳制逻辑。
//   4. clampOutpaint：智能扩图模式下裁剪框（代表扩图边界）的钳制逻辑
//      （与 clampCrop 方向相反：扩图允许裁剪框比图片大）。
//
// openImageEditor/closeImageEditor/renderCropBox/applyImage* 等核心函数
// 强依赖真实 DOM（canvas 绘制/three.js 动态 import 等），跟 M5/M7 核心
// 批次一样不适合单元测试，不在本文件覆盖范围内。
import { describe, it, expect } from 'vitest';
import { createImageEditorSandbox } from './image-editor-sandbox.js';

describe('gridJoinAutoDims', () => {
    it('按 ceil(sqrt(count)) 计算列数，再按列数反推行数', () => {
        const { gridJoinAutoDims } = createImageEditorSandbox();
        expect(gridJoinAutoDims(1)).toEqual({ rows: 1, cols: 1 });
        expect(gridJoinAutoDims(2)).toEqual({ rows: 1, cols: 2 });
        expect(gridJoinAutoDims(4)).toEqual({ rows: 2, cols: 2 });
        expect(gridJoinAutoDims(5)).toEqual({ rows: 2, cols: 3 });
        expect(gridJoinAutoDims(9)).toEqual({ rows: 3, cols: 3 });
    });

    it('数量为 0 或负数时至少返回 1x1', () => {
        const { gridJoinAutoDims } = createImageEditorSandbox();
        expect(gridJoinAutoDims(0)).toEqual({ rows: 1, cols: 1 });
        expect(gridJoinAutoDims(-3)).toEqual({ rows: 1, cols: 1 });
    });
});

describe('gridSplitRects（标准等分网格）', () => {
    it('1行1列（默认无分割线）时返回整张图片一个矩形', () => {
        const sandbox = createImageEditorSandbox({
            elements: {
                gridHorizontalLines: { value: 0 },
                gridVerticalLines: { value: 0 },
                gridGapSize: { value: 0 },
            },
        });
        const rects = sandbox.gridSplitRects(800, 600);
        expect(rects).toEqual([{ row: 0, col: 0, x: 0, y: 0, w: 800, h: 600 }]);
    });

    it('1条横线+1条竖线（2行2列）时平均切成4块，无间隔', () => {
        const sandbox = createImageEditorSandbox({
            elements: {
                gridHorizontalLines: { value: 1 },
                gridVerticalLines: { value: 1 },
                gridGapSize: { value: 0 },
            },
        });
        const rects = sandbox.gridSplitRects(800, 600);
        expect(rects).toHaveLength(4);
        expect(rects).toEqual(expect.arrayContaining([
            { row: 0, col: 0, x: 0, y: 0, w: 400, h: 300 },
            { row: 0, col: 1, x: 400, y: 0, w: 400, h: 300 },
            { row: 1, col: 0, x: 0, y: 300, w: 400, h: 300 },
            { row: 1, col: 1, x: 400, y: 300, w: 400, h: 300 },
        ]));
    });

    it('gridCustomMode 为 true 时委托给 gridSplitRectsCustom', () => {
        const sandbox = createImageEditorSandbox({
            gridCustomMode: true,
            gridCustomLines: [{ type: 'v', pos: 0.5 }],
            elements: { gridGapSize: { value: 0 } },
        });
        const rects = sandbox.gridSplitRects(800, 600);
        // 自定义模式下按竖线 pos=0.5 切成左右两块
        expect(rects).toHaveLength(2);
        expect(rects[0]).toMatchObject({ x: 0, w: 400 });
        expect(rects[1]).toMatchObject({ x: 400, w: 400 });
    });
});

describe('gridSplitRectsCustom', () => {
    it('无自定义分割线时返回整张图片一个矩形', () => {
        const sandbox = createImageEditorSandbox({
            gridCustomLines: [],
            elements: { gridGapSize: { value: 0 } },
        });
        const rects = sandbox.gridSplitRectsCustom(1000, 500);
        expect(rects).toEqual([{ row: 0, col: 0, x: 0, y: 0, w: 1000, h: 500 }]);
    });

    it('两条横向分割线按比例切成三行', () => {
        const sandbox = createImageEditorSandbox({
            gridCustomLines: [
                { type: 'h', pos: 0.3 },
                { type: 'h', pos: 0.6 },
            ],
            elements: { gridGapSize: { value: 0 } },
        });
        const rects = sandbox.gridSplitRectsCustom(100, 900);
        expect(rects).toHaveLength(3);
        expect(rects.map(r => r.h)).toEqual([270, 270, 360]);
    });

    it('重复的分割线位置会被去重', () => {
        const sandbox = createImageEditorSandbox({
            gridCustomLines: [
                { type: 'v', pos: 0.5 },
                { type: 'v', pos: 0.5 },
            ],
            elements: { gridGapSize: { value: 0 } },
        });
        const rects = sandbox.gridSplitRectsCustom(800, 400);
        expect(rects).toHaveLength(2);
    });
});

describe('clampCrop', () => {
    it('cropState 为空时不做任何操作', () => {
        const sandbox = createImageEditorSandbox({ cropState: null });
        expect(() => sandbox.clampCrop()).not.toThrow();
    });

    it('outpaint 模式下委托给 clampOutpaint', () => {
        const sandbox = createImageEditorSandbox({
            imageEditMode: 'outpaint',
            cropState: { w: 100, h: 100, x: 0, y: 0 },
            elements: { cropImage: { clientWidth: 800, clientHeight: 600 } },
        });
        sandbox.clampCrop();
        // clampOutpaint 会把裁剪框放大到至少等于图片显示尺寸
        expect(sandbox.cropState.w).toBe(800);
        expect(sandbox.cropState.h).toBe(600);
    });

    it('裁剪框尺寸被钳制在 [24, 图片显示尺寸] 之间', () => {
        const sandbox = createImageEditorSandbox({
            cropState: { w: 10, h: 5000, x: 0, y: 0 },
            elements: { cropImage: { clientWidth: 800, clientHeight: 600 } },
        });
        sandbox.clampCrop();
        expect(sandbox.cropState.w).toBe(24);
        expect(sandbox.cropState.h).toBe(600);
    });

    it('裁剪框位置被钳制在图片范围内，不会超出右/下边界', () => {
        const sandbox = createImageEditorSandbox({
            cropState: { w: 200, h: 200, x: 700, y: 500 },
            elements: { cropImage: { clientWidth: 800, clientHeight: 600 } },
        });
        sandbox.clampCrop();
        expect(sandbox.cropState.x).toBe(600); // 800 - 200
        expect(sandbox.cropState.y).toBe(400); // 600 - 200
    });

    it('负坐标被钳制为 0', () => {
        const sandbox = createImageEditorSandbox({
            cropState: { w: 200, h: 200, x: -50, y: -30 },
            elements: { cropImage: { clientWidth: 800, clientHeight: 600 } },
        });
        sandbox.clampCrop();
        expect(sandbox.cropState.x).toBe(0);
        expect(sandbox.cropState.y).toBe(0);
    });
});

describe('clampOutpaint', () => {
    it('cropState 为空时不做任何操作', () => {
        const sandbox = createImageEditorSandbox({ cropState: null });
        expect(() => sandbox.clampOutpaint()).not.toThrow();
    });

    it('扩图框比图片小时会被放大到至少等于图片显示尺寸', () => {
        const sandbox = createImageEditorSandbox({
            cropState: { w: 100, h: 100, x: 0, y: 0 },
            elements: { cropImage: { clientWidth: 800, clientHeight: 600 } },
        });
        sandbox.clampOutpaint();
        expect(sandbox.cropState.w).toBe(800);
        expect(sandbox.cropState.h).toBe(600);
    });

    it('扩图框比图片大时保持原尺寸，且位置钳制在有效偏移范围内', () => {
        const sandbox = createImageEditorSandbox({
            cropState: { w: 1000, h: 800, x: 500, y: 400 },
            elements: { cropImage: { clientWidth: 800, clientHeight: 600 } },
        });
        sandbox.clampOutpaint();
        expect(sandbox.cropState.w).toBe(1000);
        expect(sandbox.cropState.h).toBe(800);
        // x 钳制在 [0, w-图片宽度] = [0, 200]
        expect(sandbox.cropState.x).toBe(200);
        expect(sandbox.cropState.y).toBe(200);
    });
});
