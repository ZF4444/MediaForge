// M16 canvas-sync.js 的纯逻辑函数单元测试：多端协作画布/节点/连线合并。
import { describe, it, expect } from 'vitest';
import { createCanvasSyncSandbox } from './canvas-sync-sandbox.js';

describe('mergeSmartImageLists', () => {
    it('本地在前，去重后附加对方多出来的图', () => {
        const sandbox = createCanvasSyncSandbox();
        const local = [{ url: 'a.png' }, { url: 'b.png' }];
        const remote = [{ url: 'b.png' }, { url: 'c.png' }];
        const merged = sandbox.mergeSmartImageLists(local, remote);
        expect(merged.map(i => i.url)).toEqual(['a.png', 'b.png', 'c.png']);
    });

    it('本地为空时直接采用对方全部', () => {
        const sandbox = createCanvasSyncSandbox();
        const merged = sandbox.mergeSmartImageLists([], [{ url: 'x.png' }]);
        expect(merged.map(i => i.url)).toEqual(['x.png']);
    });

    it('两边都为空返回空数组', () => {
        const sandbox = createCanvasSyncSandbox();
        expect(sandbox.mergeSmartImageLists(null, null)).toEqual([]);
    });

    it('本地没有 url 的项目会保留，对方没有 url 的项目会被跳过', () => {
        const sandbox = createCanvasSyncSandbox();
        const local = [{ note: 'no-url' }];
        const remote = [{ note: 'also-no-url' }];
        const merged = sandbox.mergeSmartImageLists(local, remote);
        // 本地循环无条件 push；对方循环遇到没有 url 的项会被 `if(!u...) return` 跳过。
        expect(merged.length).toBe(1);
        expect(merged[0].note).toBe('no-url');
    });
});

describe('smartNodeInFlight', () => {
    it('running 为 true 时判定为进行中', () => {
        const sandbox = createCanvasSyncSandbox();
        expect(sandbox.smartNodeInFlight({ running: true })).toBe(true);
    });

    it('pending/queued/jimengPending 任一为真也判定为进行中', () => {
        const sandbox = createCanvasSyncSandbox();
        expect(sandbox.smartNodeInFlight({ pending: 1 })).toBe(true);
        expect(sandbox.smartNodeInFlight({ queued: true })).toBe(true);
        expect(sandbox.smartNodeInFlight({ jimengPending: true })).toBe(true);
    });

    it('有未完成的 pendingTasks 时也判定为进行中', () => {
        const sandbox = createCanvasSyncSandbox({
            fns: { smartPendingTasks: () => [{ id: 't1' }] },
        });
        expect(sandbox.smartNodeInFlight({})).toBe(true);
    });

    it('都没有时判定为不在进行中', () => {
        const sandbox = createCanvasSyncSandbox();
        expect(sandbox.smartNodeInFlight({})).toBe(false);
    });

    it('node 为空时返回 false', () => {
        const sandbox = createCanvasSyncSandbox();
        expect(sandbox.smartNodeInFlight(null)).toBe(false);
    });
});

describe('mergeSmartNode', () => {
    it('本地正在生成时，以本地为基底，只并入对方多出来的图', () => {
        const sandbox = createCanvasSyncSandbox();
        const local = { id: 'n1', running: true, title: 'Local Title', images: [{ url: 'a.png' }] };
        const remote = { id: 'n1', running: false, title: 'Remote Title', images: [{ url: 'b.png' }] };
        const merged = sandbox.mergeSmartNode(local, remote);
        expect(merged.title).toBe('Local Title');
        expect(merged.images.map(i => i.url)).toEqual(['a.png', 'b.png']);
    });

    it('本地空闲时，以对方为基底，图片仍取并集', () => {
        const sandbox = createCanvasSyncSandbox();
        const local = { id: 'n1', running: false, title: 'Local Title', images: [{ url: 'a.png' }] };
        const remote = { id: 'n1', running: false, title: 'Remote Title', images: [{ url: 'b.png' }] };
        const merged = sandbox.mergeSmartNode(local, remote);
        expect(merged.title).toBe('Remote Title');
        expect(merged.images.map(i => i.url)).toEqual(['a.png', 'b.png']);
    });
});

describe('mergeSmartNodeLists', () => {
    it('保留仅本地存在的节点', () => {
        const sandbox = createCanvasSyncSandbox();
        const local = [{ id: 'n1', images: [] }];
        const remote = [];
        const merged = sandbox.mergeSmartNodeLists(local, remote);
        expect(merged.map(n => n.id)).toEqual(['n1']);
    });

    it('加入仅对方存在的节点', () => {
        const sandbox = createCanvasSyncSandbox();
        const local = [];
        const remote = [{ id: 'n2', images: [] }];
        const merged = sandbox.mergeSmartNodeLists(local, remote);
        expect(merged.map(n => n.id)).toEqual(['n2']);
    });

    it('双方都存在的节点走合并逻辑，且保持首次出现的顺序', () => {
        const sandbox = createCanvasSyncSandbox();
        const local = [
            { id: 'n1', running: false, title: 'L1', images: [] },
            { id: 'n2', running: true, title: 'L2', images: [{ url: 'x.png' }] },
        ];
        const remote = [
            { id: 'n2', running: false, title: 'R2', images: [{ url: 'y.png' }] },
            { id: 'n1', running: false, title: 'R1', images: [] },
        ];
        const merged = sandbox.mergeSmartNodeLists(local, remote);
        expect(merged.map(n => n.id)).toEqual(['n1', 'n2']);
        expect(merged[0].title).toBe('R1'); // n1 本地不在进行中，以对方为基底
        expect(merged[1].title).toBe('L2'); // n2 本地在进行中，以本地为基底
        expect(merged[1].images.map(i => i.url)).toEqual(['x.png', 'y.png']);
    });

    it('过滤掉合并结果中的假值（防御性 filter(Boolean)）', () => {
        const sandbox = createCanvasSyncSandbox();
        const merged = sandbox.mergeSmartNodeLists(
            [{ id: 'n1', images: [] }],
            [{ id: 'n1', images: [] }]
        );
        expect(merged.length).toBe(1);
    });
});

describe('mergeSmartConnections', () => {
    it('去重并只保留端点都在 nodeIds 集合内的连线', () => {
        const sandbox = createCanvasSyncSandbox();
        const nodeIds = new Set(['a', 'b']);
        const local = [{ from: 'a', to: 'b', kind: 'flow' }];
        const remote = [{ from: 'a', to: 'b', kind: 'flow' }, { from: 'b', to: 'c', kind: 'flow' }];
        const merged = sandbox.mergeSmartConnections(local, remote, nodeIds);
        expect(merged).toEqual([{ from: 'a', to: 'b', kind: 'flow' }]);
    });

    it('相同 from/to 但不同 kind 视为不同连线，都保留', () => {
        const sandbox = createCanvasSyncSandbox();
        const nodeIds = new Set(['a', 'b']);
        const local = [{ from: 'a', to: 'b', kind: 'flow' }];
        const remote = [{ from: 'a', to: 'b', kind: 'ref' }];
        const merged = sandbox.mergeSmartConnections(local, remote, nodeIds);
        expect(merged.length).toBe(2);
    });

    it('空输入返回空数组', () => {
        const sandbox = createCanvasSyncSandbox();
        expect(sandbox.mergeSmartConnections(null, null, new Set())).toEqual([]);
    });
});
