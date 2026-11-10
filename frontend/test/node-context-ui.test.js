// node-context-ui.js 回归测试（M14）。
//
// 覆盖范围：
//   1. nodeShortcutTargetFor：找到节点当前应该操作的具体媒体引用
//      （优先取 selectedImage 指定的那一张，否则取第一张有效引用）。
//   2. shouldShowNodeShortcutBar：判断是否该显示节点悬浮快捷栏
//      （排除多选/非当前选中节点/prompt与loop节点/缩略图拖拽中/
//      多节点批量拖拽等场景）。
//
// nodeShortcutBarHtml/nodeContextMenuHtml/openNodeContextMenu/
// openCanvasContextMenu 等 HTML 渲染/DOM 操作函数强依赖真实 DOM 元素，
// 跟 M5/M7/M8 核心批次一样不适合单元测试，不在本文件覆盖范围内。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createNodeContextUiSandbox } from './node-context-ui-sandbox.js';

describe('nodeShortcutTargetFor', () => {
    it('节点为空时返回 null', () => {
        const { nodeShortcutTargetFor } = createNodeContextUiSandbox();
        expect(nodeShortcutTargetFor(null)).toBe(null);
    });

    it('节点没有任何带 url 的图片引用时返回 null', () => {
        const { nodeShortcutTargetFor } = createNodeContextUiSandbox();
        expect(nodeShortcutTargetFor({ id: 'n1', images: [{ url: '' }] })).toBe(null);
        expect(nodeShortcutTargetFor({ id: 'n1', images: [] })).toBe(null);
    });

    it('selectedImage 匹配时优先使用 selectedImage 指定的那一张', () => {
        const node = {
            id: 'n1',
            images: [
                { url: 'a.png', nodeId: 'n1', imageIndex: 0 },
                { url: 'b.png', nodeId: 'n1', imageIndex: 1 },
            ],
        };
        const sandbox = createNodeContextUiSandbox({
            nodes: [node],
            selectedImage: { nodeId: 'n1', index: 1 },
        });
        const target = sandbox.nodeShortcutTargetFor(node);
        expect(target.image.url).toBe('b.png');
        expect(target.index).toBe(1);
    });

    it('selectedImage 不匹配当前节点时回退到第一张有效引用', () => {
        const node = {
            id: 'n1',
            images: [{ url: 'a.png', nodeId: 'n1', imageIndex: 0 }],
        };
        const sandbox = createNodeContextUiSandbox({
            nodes: [node],
            selectedImage: { nodeId: 'other-node', index: 0 },
        });
        const target = sandbox.nodeShortcutTargetFor(node);
        expect(target.image.url).toBe('a.png');
    });

    it('返回结构包含 ownerNode/node/image/index/kind', () => {
        const node = { id: 'n1', images: [{ url: 'a.mp4', nodeId: 'n1', imageIndex: 0, kind: 'video' }] };
        const sandbox = createNodeContextUiSandbox({ nodes: [node] });
        const target = sandbox.nodeShortcutTargetFor(node);
        expect(target).toMatchObject({
            ownerNode: node,
            node,
            index: 0,
            kind: 'video',
        });
    });
});

describe('contextMenuCandidateImage', () => {
    const node = {
        id: 'n1',
        images: [{ url: 'main.png', file_id: 'f0' }],
        candidateImages: [
            { url: 'main.png', file_id: 'f0' },
            { url: 'c1.png', file_id: 'f1' },
            { url: 'c2.png', file_id: 'f2' },
        ],
    };

    it('返回右键点中的候选图而不是主图，并带上 nodeId/imageIndex', () => {
        const { contextMenuCandidateImage } = createNodeContextUiSandbox({ nodes: [node] });
        const img = contextMenuCandidateImage(node, '2');
        expect(img).toMatchObject({ url: 'c2.png', file_id: 'f2', nodeId: 'n1', imageIndex: 2 });
    });

    it('没有候选索引（右键在主图上）时返回 null，调用方回退到主图', () => {
        const { contextMenuCandidateImage } = createNodeContextUiSandbox({ nodes: [node] });
        expect(contextMenuCandidateImage(node, undefined)).toBe(null);
        expect(contextMenuCandidateImage(node, '')).toBe(null);
    });

    it('索引非法或越界时返回 null', () => {
        const { contextMenuCandidateImage } = createNodeContextUiSandbox({ nodes: [node] });
        expect(contextMenuCandidateImage(node, '-1')).toBe(null);
        expect(contextMenuCandidateImage(node, 'abc')).toBe(null);
        expect(contextMenuCandidateImage(node, '9')).toBe(null);
    });
});

describe('candidateIndexFromContextTarget', () => {
    // 最小假元素：closest(selector) 只按下面登记的选择器返回对应祖先。
    const el = (ancestors = {}) => ({ closest: (selector) => ancestors[selector] || null });
    const gridItem = (n) => ({ dataset: { candidateGridItem: String(n) } });
    const panel = (n) => ({ dataset: { candidateIndex: String(n) } });

    it('右键在展开网格项上：返回该项的候选索引', () => {
        const { candidateIndexFromContextTarget } = createNodeContextUiSandbox();
        expect(candidateIndexFromContextTarget(el({ '[data-candidate-grid-item]': gridItem(3) }))).toBe(3);
    });

    it('右键在单张翻页预览浮层上：返回浮层当前显示的候选索引（浮层嵌在主图里，不能当成主图）', () => {
        const { candidateIndexFromContextTarget } = createNodeContextUiSandbox();
        expect(candidateIndexFromContextTarget(el({ '.candidate-panel': panel(1) }))).toBe(1);
    });

    it('索引为 0 的候选也要识别（不能被当成"没有"）', () => {
        const { candidateIndexFromContextTarget } = createNodeContextUiSandbox();
        expect(candidateIndexFromContextTarget(el({ '[data-candidate-grid-item]': gridItem(0) }))).toBe(0);
        expect(candidateIndexFromContextTarget(el({ '.candidate-panel': panel(0) }))).toBe(0);
    });

    it('同时命中网格项与浮层时以网格项为准', () => {
        const { candidateIndexFromContextTarget } = createNodeContextUiSandbox();
        expect(candidateIndexFromContextTarget(el({
            '[data-candidate-grid-item]': gridItem(2),
            '.candidate-panel': panel(5),
        }))).toBe(2);
    });

    it('不在候选池内（主图、节点空白处）返回 -1', () => {
        const { candidateIndexFromContextTarget } = createNodeContextUiSandbox();
        expect(candidateIndexFromContextTarget(el())).toBe(-1);
        expect(candidateIndexFromContextTarget(null)).toBe(-1);
        expect(candidateIndexFromContextTarget({})).toBe(-1);
    });

    it('索引缺失或非法时返回 -1', () => {
        const { candidateIndexFromContextTarget } = createNodeContextUiSandbox();
        expect(candidateIndexFromContextTarget(el({ '.candidate-panel': { dataset: {} } }))).toBe(-1);
        expect(candidateIndexFromContextTarget(el({ '.candidate-panel': panel('abc') }))).toBe(-1);
        expect(candidateIndexFromContextTarget(el({ '.candidate-panel': panel(-2) }))).toBe(-1);
        expect(candidateIndexFromContextTarget(el({ '.candidate-panel': panel('1.5') }))).toBe(-1);
    });
});

describe('isNodeContextMenuTarget 与候选池收起逻辑', () => {
    it('菜单内的元素返回 true，其它与空值返回 false', () => {
        const { isNodeContextMenuTarget } = createNodeContextUiSandbox();
        const inMenu = { closest: (sel) => (sel === '.node-context-menu' ? {} : null) };
        const outside = { closest: () => null };
        expect(isNodeContextMenuTarget(inMenu)).toBe(true);
        expect(isNodeContextMenuTarget(outside)).toBe(false);
        expect(isNodeContextMenuTarget(null)).toBe(false);
        expect(isNodeContextMenuTarget({})).toBe(false);
    });

    // 这两个监听器写在 main.js 顶层并直接绑定 document，无法在 vm 里单独加载，按项目约定读源码文本断言。
    // 回归点：点右键菜单项（下载/复制…）以及下载产生的合成 <a download> 点击，都不能收起预览浮层/展开网格。
    const main = readFileSync(resolve(process.cwd(), 'src/canvas/main.js'), 'utf8');
    const body = (name) => {
        const start = main.indexOf(`function ${name}(`);
        const next = main.indexOf('\nfunction ', start + 1);
        const nextStmt = main.indexOf('\ndocument.addEventListener', start + 1);
        const end = Math.min(...[next, nextStmt].filter(i => i > -1));
        return main.slice(start, end);
    };

    it('documentMousedownHandler 忽略右键菜单内的点击', () => {
        expect(body('documentMousedownHandler')).toContain('isNodeContextMenuTarget(event.target)');
    });

    it('documentClickHandler 忽略右键菜单内的点击与下载锚点的合成点击', () => {
        const fn = body('documentClickHandler');
        expect(fn).toContain('isNodeContextMenuTarget(event.target)');
        expect(fn).toContain("a[download]");
        // 忽略判断必须在真正收起（closeExpandedCandidateGrids）之前
        expect(fn.indexOf("a[download]")).toBeLessThan(fn.indexOf('closeExpandedCandidateGrids()'));
        expect(fn.indexOf('isNodeContextMenuTarget')).toBeLessThan(fn.indexOf('closeExpandedCandidateGrids()'));
    });
});

describe('shouldShowNodeShortcutBar', () => {
    const node = { id: 'n1', type: 'smart-image', images: [{ url: 'a.png', nodeId: 'n1', imageIndex: 0 }] };

    it('节点为空或未选中时不显示', () => {
        const sandbox = createNodeContextUiSandbox({ nodes: [node], selectedId: '' });
        expect(sandbox.shouldShowNodeShortcutBar(null)).toBe(false);
        expect(sandbox.shouldShowNodeShortcutBar(node)).toBe(false);
    });

    it('多选状态下不显示（即使当前节点是选中项之一）', () => {
        const sandbox = createNodeContextUiSandbox({
            nodes: [node], selectedId: 'n1', selectedIds: ['n1', 'n2'],
        });
        expect(sandbox.shouldShowNodeShortcutBar(node)).toBe(false);
    });

    it('smart-prompt / smart-loop 类型节点不显示', () => {
        const promptNode = { ...node, type: 'smart-prompt' };
        const loopNode = { ...node, type: 'smart-loop' };
        const sandbox1 = createNodeContextUiSandbox({ nodes: [promptNode], selectedId: 'n1' });
        expect(sandbox1.shouldShowNodeShortcutBar(promptNode)).toBe(false);
        const sandbox2 = createNodeContextUiSandbox({ nodes: [loopNode], selectedId: 'n1' });
        expect(sandbox2.shouldShowNodeShortcutBar(loopNode)).toBe(false);
    });

    it('缩略图拖拽（拆图）进行中时不显示', () => {
        const sandbox = createNodeContextUiSandbox({
            nodes: [node], selectedId: 'n1', thumbDragState: { nodeId: 'n1' },
        });
        expect(sandbox.shouldShowNodeShortcutBar(node)).toBe(false);
    });

    it('拖动的正是当前单选节点本身时仍显示（跟随移动）', () => {
        const sandbox = createNodeContextUiSandbox({
            nodes: [node], selectedId: 'n1', dragState: { id: 'n1' },
        });
        expect(sandbox.shouldShowNodeShortcutBar(node)).toBe(true);
    });

    it('拖动的是其它节点或多节点批量拖动时不显示', () => {
        const sandbox1 = createNodeContextUiSandbox({
            nodes: [node], selectedId: 'n1', dragState: { id: 'n2' },
        });
        expect(sandbox1.shouldShowNodeShortcutBar(node)).toBe(false);

        const sandbox2 = createNodeContextUiSandbox({
            nodes: [node], selectedId: 'n1', dragState: { id: 'n1', group: [{ id: 'n1' }, { id: 'n2' }] },
        });
        expect(sandbox2.shouldShowNodeShortcutBar(node)).toBe(false);
    });

    it('拖动缩略图已分离（thumbDetached）时不显示', () => {
        const sandbox = createNodeContextUiSandbox({
            nodes: [node], selectedId: 'n1', dragState: { id: 'n1', thumbDetached: true },
        });
        expect(sandbox.shouldShowNodeShortcutBar(node)).toBe(false);
    });

    it('普通图片节点单选、无拖拽时显示', () => {
        const sandbox = createNodeContextUiSandbox({ nodes: [node], selectedId: 'n1' });
        expect(sandbox.shouldShowNodeShortcutBar(node)).toBe(true);
    });

    it('节点没有有效媒体引用时不显示（即使满足其它条件）', () => {
        const emptyNode = { id: 'n1', type: 'smart-image', images: [] };
        const sandbox = createNodeContextUiSandbox({ nodes: [emptyNode], selectedId: 'n1' });
        expect(sandbox.shouldShowNodeShortcutBar(emptyNode)).toBe(false);
    });
});
