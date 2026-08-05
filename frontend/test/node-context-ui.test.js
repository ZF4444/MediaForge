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
