// loop-node.js 回归测试（M2）。
//
// 覆盖范围：
//   1. smartLoopCount：图片输入/提示词输入两种模式下的次数自动计算。
//   2. smartLoopWidth/smartLoopHeight/fitSmartLoopNode：节点尺寸计算。
//   3. smartLoopInputImages：按批次大小对输入图片切片。
//   4. cloneLoopChainForRound 的布局快照测试：验证各轮克隆链路在 Y 轴上
//      不重叠——这是本次重构会话之前修复过的一类 bug（见 git log 里
//      "循环级联行距"相关的几次 commit），转成永久回归测试。
import { describe, it, expect } from 'vitest';
import { createLoopNodeSandbox } from './loop-node-sandbox.js';

describe('smartLoopCount', () => {
    it('无图片/无提示词输入时，使用 node.count（默认 1）', () => {
        const { smartLoopCount } = createLoopNodeSandbox();
        expect(smartLoopCount({})).toBe(1);
        expect(smartLoopCount({ count: 5 })).toBe(5);
    });

    it('图片输入模式：按 ceil(素材总数 / 批次大小) 计算，且限制在 [1,100]', () => {
        const sandbox = createLoopNodeSandbox({
            fns: {
                inputNodesFor: () => [{ id: 'src', type: 'smart-image' }],
                imagesForNode: () => new Array(10).fill({ url: 'x.png' }),
            },
        });
        const node = { imageInput: true, imageBatchSize: 3 };
        // 10 张图，每批 3 张 -> ceil(10/3) = 4
        expect(sandbox.smartLoopCount(node)).toBe(4);
    });

    it('图片输入模式：没有可用图片时返回 1', () => {
        const sandbox = createLoopNodeSandbox({
            fns: { inputNodesFor: () => [], imagesForNode: () => [] },
        });
        expect(sandbox.smartLoopCount({ imageInput: true, imageBatchSize: 2 })).toBe(1);
    });

    it('提示词输入模式：按变量提示词字段数量计算', () => {
        const sandbox = createLoopNodeSandbox();
        const node = { showPrompt: true, variablePrompts: ['a', 'b', 'c'] };
        expect(sandbox.smartLoopCount(node)).toBe(3);
    });

    it('次数上限为 100', () => {
        const sandbox = createLoopNodeSandbox({
            fns: {
                inputNodesFor: () => [{ id: 'src', type: 'smart-image' }],
                imagesForNode: () => new Array(500).fill({ url: 'x.png' }),
            },
        });
        expect(sandbox.smartLoopCount({ imageInput: true, imageBatchSize: 1 })).toBe(100);
    });
});

describe('smartLoopWidth / smartLoopHeight / fitSmartLoopNode', () => {
    it('固定宽度 340', () => {
        const { smartLoopWidth } = createLoopNodeSandbox();
        expect(smartLoopWidth({})).toBe(340);
    });

    it('基础高度 168，开启图片输入 +72，开启提示词按字段数 +94+n*58', () => {
        const sandbox = createLoopNodeSandbox();
        expect(sandbox.smartLoopHeight({})).toBe(168);
        expect(sandbox.smartLoopHeight({ imageInput: true })).toBe(168 + 72);
        const withPrompt = sandbox.smartLoopHeight({ showPrompt: true, variablePrompts: ['a', 'b'] });
        expect(withPrompt).toBe(168 + 94 + 2 * 58);
    });

    it('fitSmartLoopNode 只对 type===smart-loop 的节点生效，并写回 w/h', () => {
        const sandbox = createLoopNodeSandbox();
        const node = { type: 'smart-loop' };
        sandbox.fitSmartLoopNode(node);
        expect(node.w).toBe(340);
        expect(node.h).toBe(168);

        const other = { type: 'smart-image' };
        sandbox.fitSmartLoopNode(other);
        expect(other.w).toBeUndefined();
    });
});

describe('smartLoopInputImages', () => {
    it('非图片输入模式返回空数组', () => {
        const sandbox = createLoopNodeSandbox();
        expect(sandbox.smartLoopInputImages({ imageInput: false })).toEqual([]);
    });

    it('按 loopStart/imageBatchSize 从输入图片里切出当前批次', () => {
        const images = new Array(10).fill(null).map((_, i) => ({ url: `${i + 1}.png` }));
        const sandbox = createLoopNodeSandbox({
            fns: {
                inputNodesFor: () => [{ id: 'src', type: 'smart-image' }],
                imagesForNode: () => images,
            },
        });
        const node = { imageInput: true, imageBatchSize: 3, loopStart: 1 };
        // 第 1 轮（index=1）：取第 1-3 张
        const round1 = sandbox.smartLoopInputImages(node, { index: 1 });
        expect(round1.map(i => i.url)).toEqual(['1.png', '2.png', '3.png']);
        // 第 2 轮（index=2，批次大小3）：取第 2-4 张（滑动窗口，不是分页）
        const round2 = sandbox.smartLoopInputImages(node, { index: 2 });
        expect(round2.map(i => i.url)).toEqual(['2.png', '3.png', '4.png']);
    });
});

describe('cloneLoopChainForRound 布局快照测试（防止 Y 轴重叠回归）', () => {
    // 构造一条最简单的链路：rootNode -> childNode。
    function buildSubgraph(rootNode, childNode) {
        return {
            nodes: [rootNode, childNode],
            edges: [{ from: rootNode.id, to: childNode.id }],
        };
    }

    it('多轮克隆的 Y 坐标不重叠（串行模式，columnsPerRow=1）', () => {
        const rootNode = { id: 'root', x: 0, y: 0, w: 260, h: 180 };
        const childNode = { id: 'child', x: 400, y: 0, w: 260, h: 180 };
        const loopNode = { id: 'loop', imageInput: true };
        const sandbox = createLoopNodeSandbox({
            nodes: [rootNode, childNode, loopNode],
        });
        const subgraph = buildSubgraph(rootNode, childNode);

        const rounds = [0, 1, 2].map(roundOffset =>
            sandbox.cloneLoopChainForRound(subgraph, rootNode, loopNode, roundOffset + 1, 3, roundOffset, 1)
        );

        const rootClones = rounds.map(r => r.clonedRoot).filter(Boolean);
        expect(rootClones).toHaveLength(3);

        // 核心回归断言：每一轮克隆根节点的 Y 坐标必须严格递增，不能重叠
        // （对应本次会话之前修复的"循环节点 Y 轴重叠"问题）。
        const ys = rootClones.map(n => n.y);
        for (let i = 1; i < ys.length; i++) {
            expect(ys[i]).toBeGreaterThan(ys[i - 1]);
        }

        // 行间距要覆盖链路里最高节点的高度（180）+ 140 的固定间距，
        // 否则高节点会在 Y 轴上被压缩重叠。
        const rowGap = ys[1] - ys[0];
        expect(rowGap).toBeGreaterThanOrEqual(180 + 140);
    });

    it('链路内节点比根节点更高时，行距按链路最高节点计算，不会重叠', () => {
        // 子节点高度(400) 明显大于根节点高度(180)，行距必须按 400 算，
        // 而不是只看根节点的 180 —— 这正是本次会话修复的问题场景。
        const rootNode = { id: 'root', x: 0, y: 0, w: 260, h: 180 };
        const tallChild = { id: 'child', x: 400, y: 0, w: 260, h: 400 };
        const loopNode = { id: 'loop', imageInput: true };
        const sandbox = createLoopNodeSandbox({
            nodes: [rootNode, tallChild, loopNode],
        });
        const subgraph = buildSubgraph(rootNode, tallChild);

        const round0 = sandbox.cloneLoopChainForRound(subgraph, rootNode, loopNode, 1, 2, 0, 1);
        const round1 = sandbox.cloneLoopChainForRound(subgraph, rootNode, loopNode, 2, 2, 1, 1);

        const rowGap = round1.clonedRoot.y - round0.clonedRoot.y;
        // 行距必须 >= 链路最高节点高度(400) + 140，不能只按根节点的 180 算。
        expect(rowGap).toBeGreaterThanOrEqual(400 + 140);
    });

    it('并行模式（columnsPerRow>1）按列排列，同一行内 Y 坐标相同、X 坐标递增', () => {
        const rootNode = { id: 'root', x: 0, y: 0, w: 260, h: 180 };
        const childNode = { id: 'child', x: 400, y: 0, w: 260, h: 180 };
        const loopNode = { id: 'loop', imageInput: true };
        const sandbox = createLoopNodeSandbox({
            nodes: [rootNode, childNode, loopNode],
        });
        const subgraph = buildSubgraph(rootNode, childNode);
        const columnsPerRow = 2;

        const rounds = [0, 1, 2, 3].map(roundOffset =>
            sandbox.cloneLoopChainForRound(subgraph, rootNode, loopNode, roundOffset + 1, 4, roundOffset, columnsPerRow)
        );
        const roots = rounds.map(r => r.clonedRoot);

        // 第0、1轮在同一行（row=0），Y 相同；第2、3轮在同一行（row=1），Y 相同且比第0行大。
        expect(roots[0].y).toBe(roots[1].y);
        expect(roots[2].y).toBe(roots[3].y);
        expect(roots[2].y).toBeGreaterThan(roots[0].y);
        // 同一行内 X 坐标随列递增，不重叠。
        expect(roots[1].x).toBeGreaterThan(roots[0].x);
        expect(roots[3].x).toBeGreaterThan(roots[2].x);
    });

    it('克隆出的节点会清空运行痕迹字段（images/pending/running 等）', () => {
        const rootNode = {
            id: 'root', x: 0, y: 0, w: 260, h: 180,
            images: [{ url: 'old.png' }], pending: 1, running: true, queued: true,
            runPrompt: 'old prompt',
        };
        const childNode = { id: 'child', x: 400, y: 0, w: 260, h: 180 };
        const loopNode = { id: 'loop', imageInput: true };
        const sandbox = createLoopNodeSandbox({
            nodes: [rootNode, childNode, loopNode],
        });
        const subgraph = buildSubgraph(rootNode, childNode);

        const result = sandbox.cloneLoopChainForRound(subgraph, rootNode, loopNode, 1, 1, 0, 1);
        expect(result.clonedRoot.images).toEqual([]);
        expect(result.clonedRoot.pending).toBe(0);
        expect(result.clonedRoot.running).toBe(false);
        expect(result.clonedRoot.queued).toBe(false);
        expect(result.clonedRoot.runPrompt).toBeUndefined();
        expect(result.clonedRoot.loopCloneRound).toBe(1);
        expect(result.clonedRoot.loopCloneSourceId).toBe('loop');
    });
});

describe('createLoopNode', () => {
    it('创建的节点写入 nodes 数组并设为选中项', () => {
        const sandbox = createLoopNodeSandbox({ nodes: [] });
        const node = sandbox.createLoopNode(10, 20);
        expect(sandbox.nodes).toContain(node);
        expect(sandbox.selectedId).toBe(node.id);
        expect(node.type).toBe('smart-loop');
        expect(node.x).toBe(10);
        expect(node.y).toBe(20);
    });

    it('options.select === false 时不改变 selectedId', () => {
        const sandbox = createLoopNodeSandbox({ nodes: [] });
        sandbox.selectedId = 'keep-me';
        sandbox.createLoopNode(0, 0, { select: false });
        expect(sandbox.selectedId).toBe('keep-me');
    });
});
