// connections.js 回归测试（M4）。
//
// 覆盖范围：
//   1. addConnection：去重、禁止自环、默认 kind='flow'。
//   2. connectInputNode：普通节点直连、对 smart-loop 目标节点的
//      imageInput/showPrompt 自动识别与开关、不满足条件时返回 false。
//   3. outgoingConnectionsFor / outgoingInputConnectionsFor：按 kind 过滤。
//   4. connectionMidpoint：普通连线与 history 连线的中点计算方式不同。
//   5. insertionConnectionForNode：只对 smart-loop 节点生效，按距离找最近连线。
//   6. connectionGeometry：flow 连线（右→左）与 history 连线（下→上）
//      的贝塞尔曲线端点方向不同。
import { describe, it, expect } from 'vitest';
import { createConnectionsSandbox } from './connections-sandbox.js';

describe('addConnection', () => {
    it('创建一条新连线，写入 canvas.connections', () => {
        const sandbox = createConnectionsSandbox();
        sandbox.addConnection('a', 'b');
        expect(sandbox.canvas.connections).toEqual([{ from: 'a', to: 'b', kind: 'flow' }]);
    });

    it('默认 kind 为 flow，可显式指定其它 kind', () => {
        const sandbox = createConnectionsSandbox();
        sandbox.addConnection('a', 'b', 'input');
        expect(sandbox.canvas.connections[0].kind).toBe('input');
    });

    it('相同 from/to/kind 的连线不会重复添加', () => {
        const sandbox = createConnectionsSandbox();
        sandbox.addConnection('a', 'b');
        sandbox.addConnection('a', 'b');
        expect(sandbox.canvas.connections).toHaveLength(1);
    });

    it('相同 from/to 但不同 kind 视为不同连线，都会保留', () => {
        const sandbox = createConnectionsSandbox();
        sandbox.addConnection('a', 'b', 'flow');
        sandbox.addConnection('a', 'b', 'input');
        expect(sandbox.canvas.connections).toHaveLength(2);
    });

    it('自环（from===to）或缺少 from/to 时不添加', () => {
        const sandbox = createConnectionsSandbox();
        sandbox.addConnection('a', 'a');
        sandbox.addConnection('', 'b');
        sandbox.addConnection('a', '');
        expect(sandbox.canvas.connections).toHaveLength(0);
    });
});

describe('connectInputNode', () => {
    it('普通节点之间直连成功，并记录 inputNodeIds', () => {
        const from = { id: 'a', type: 'smart-image' };
        const to = { id: 'b', type: 'smart-image' };
        const sandbox = createConnectionsSandbox({ nodes: [from, to] });
        const ok = sandbox.connectInputNode('a', 'b');
        expect(ok).toBe(true);
        expect(to.inputNodeIds).toEqual(['a']);
        expect(sandbox.canvas.connections).toEqual([{ from: 'a', to: 'b', kind: 'input' }]);
    });

    it('source/target 节点不存在或自连时返回 false', () => {
        const sandbox = createConnectionsSandbox({ nodes: [{ id: 'a', type: 'smart-image' }] });
        expect(sandbox.connectInputNode('a', 'missing')).toBe(false);
        expect(sandbox.connectInputNode('a', 'a')).toBe(false);
    });

    it('连到 smart-loop 节点：图片类源节点会自动开启目标的 imageInput', () => {
        const from = { id: 'a', type: 'smart-image' };
        const to = { id: 'loop', type: 'smart-loop', imageInput: false, showPrompt: false };
        const sandbox = createConnectionsSandbox({ nodes: [from, to] });
        const ok = sandbox.connectInputNode('a', 'loop');
        expect(ok).toBe(true);
        expect(to.imageInput).toBe(true);
    });

    it('连到 smart-loop 节点：提示词类源节点会自动开启目标的 showPrompt', () => {
        const from = { id: 'a', type: 'smart-prompt' };
        const to = { id: 'loop', type: 'smart-loop', imageInput: false, showPrompt: false };
        const sandbox = createConnectionsSandbox({ nodes: [from, to] });
        const ok = sandbox.connectInputNode('a', 'loop');
        expect(ok).toBe(true);
        expect(to.showPrompt).toBe(true);
    });

    it('连到 smart-loop 节点：既非图片也非提示词来源时连接失败', () => {
        const from = { id: 'a', type: 'smart-loop', imageInput: false, showPrompt: false };
        const to = { id: 'loop2', type: 'smart-loop', imageInput: false, showPrompt: false };
        const sandbox = createConnectionsSandbox({ nodes: [from, to] });
        const ok = sandbox.connectInputNode('a', 'loop2');
        expect(ok).toBe(false);
    });

    it('重复连接同一 source 不会产生重复的 inputNodeIds', () => {
        const from = { id: 'a', type: 'smart-image' };
        const to = { id: 'b', type: 'smart-image', inputNodeIds: ['a'] };
        const sandbox = createConnectionsSandbox({ nodes: [from, to] });
        sandbox.connectInputNode('a', 'b');
        expect(to.inputNodeIds).toEqual(['a']);
    });
});

describe('outgoingConnectionsFor / outgoingInputConnectionsFor', () => {
    it('按 kind 过滤出以该节点为起点的连线', () => {
        const canvas = { connections: [
            { from: 'a', to: 'b', kind: 'flow' },
            { from: 'a', to: 'c', kind: 'input' },
            { from: 'x', to: 'a', kind: 'input' },
        ] };
        const sandbox = createConnectionsSandbox({ canvas });
        const flowOut = sandbox.outgoingConnectionsFor({ id: 'a' }, ['flow']);
        expect(flowOut).toHaveLength(1);
        expect(flowOut[0].to).toBe('b');

        const inputOut = sandbox.outgoingInputConnectionsFor({ id: 'a' });
        expect(inputOut).toHaveLength(1);
        expect(inputOut[0].to).toBe('c');
    });

    it('节点为空时返回空数组', () => {
        const sandbox = createConnectionsSandbox();
        expect(sandbox.outgoingConnectionsFor(null)).toEqual([]);
    });
});

describe('connectionMidpoint', () => {
    it('flow 连线：中点取起点右侧中点与终点左侧中点的均值', () => {
        const fromNode = { id: 'a', x: 0, y: 0, type: 'smart-image', images: [] };
        const toNode = { id: 'b', x: 500, y: 0, type: 'smart-image', images: [] };
        const sandbox = createConnectionsSandbox({ nodes: [fromNode, toNode] });
        const mid = sandbox.connectionMidpoint({ from: 'a', to: 'b', kind: 'flow' });
        // nodeRect 对空 smart-image 节点返回 316x194（EMPTY_GENERATION_NODE 尺寸）
        expect(mid).not.toBeNull();
        expect(mid.x).toBeGreaterThan(0);
    });

    it('连线的起止节点不存在时返回 null', () => {
        const sandbox = createConnectionsSandbox({ nodes: [] });
        expect(sandbox.connectionMidpoint({ from: 'missing1', to: 'missing2' })).toBeNull();
    });

    it('history 连线与 flow 连线的中点计算方式不同', () => {
        // from/to 节点尺寸不同（to 是 4 图分组，比空的 from 节点更高更宽），
        // 这样才能让 flow 用"边缘对边缘"、history 用"中心对中心"这两种
        // 不同取法的计算结果产生可观察的差异（当两节点尺寸相同时，这两条
        // 公式代数上恰好等价，不适合用来区分）。
        const fromNode = { id: 'a', x: 0, y: 0, type: 'smart-image', images: [] };
        const toNode = {
            id: 'b', x: 500, y: 1000, type: 'smart-image',
            images: [{ url: '1.png' }, { url: '2.png' }, { url: '3.png' }, { url: '4.png' }],
        };
        const sandbox = createConnectionsSandbox({ nodes: [fromNode, toNode] });
        const flowMid = sandbox.connectionMidpoint({ from: 'a', to: 'b', kind: 'flow' });
        const historyMid = sandbox.connectionMidpoint({ from: 'a', to: 'b', kind: 'history' });
        expect(flowMid).not.toEqual(historyMid);
    });
});

describe('insertionConnectionForNode', () => {
    it('非 smart-loop 节点直接返回 null', () => {
        const sandbox = createConnectionsSandbox();
        expect(sandbox.insertionConnectionForNode({ id: 'a', type: 'smart-image' })).toBeNull();
    });

    it('没有任何连线时返回 null', () => {
        const sandbox = createConnectionsSandbox({ canvas: { connections: [] } });
        expect(sandbox.insertionConnectionForNode({ id: 'loop', type: 'smart-loop', x: 0, y: 0 })).toBeNull();
    });

    it('找到距离循环节点中心最近的一条连线', () => {
        const nodeA = { id: 'a', x: 0, y: 0, type: 'smart-image', images: [] };
        const nodeB = { id: 'b', x: 400, y: 0, type: 'smart-image', images: [] };
        const nodeC = { id: 'c', x: 400, y: 2000, type: 'smart-image', images: [] }; // 远处的连线
        const nodeD = { id: 'd', x: 800, y: 2000, type: 'smart-image', images: [] };
        const loop = { id: 'loop', type: 'smart-loop', x: 150, y: 20 }; // 靠近 a->b 这条连线
        const canvas = { connections: [
            { from: 'a', to: 'b', kind: 'flow' },
            { from: 'c', to: 'd', kind: 'flow' },
        ] };
        const sandbox = createConnectionsSandbox({ nodes: [nodeA, nodeB, nodeC, nodeD, loop], canvas });
        const result = sandbox.insertionConnectionForNode(loop);
        expect(result).not.toBeNull();
        expect(result.conn.from).toBe('a');
        expect(result.conn.to).toBe('b');
    });

    it('不会匹配循环节点自身参与的连线', () => {
        const loop = { id: 'loop', type: 'smart-loop', x: 0, y: 0 };
        const other = { id: 'x', x: 10, y: 10, type: 'smart-image', images: [] };
        const canvas = { connections: [{ from: 'loop', to: 'x', kind: 'flow' }] };
        const sandbox = createConnectionsSandbox({ nodes: [loop, other], canvas });
        expect(sandbox.insertionConnectionForNode(loop)).toBeNull();
    });
});

describe('connectionGeometry', () => {
    it('flow 连线：起点在源节点右侧中点，终点在目标节点左侧中点', () => {
        const fromNode = { id: 'a', x: 0, y: 0, type: 'smart-image', images: [] };
        const toNode = { id: 'b', x: 500, y: 0, type: 'smart-image', images: [] };
        const sandbox = createConnectionsSandbox({ nodes: [fromNode, toNode] });
        const geo = sandbox.connectionGeometry(fromNode, toNode, false);
        // fromNode 右边缘 = x + width(316) = 316；toNode 左边缘 = 500
        expect(geo.fx).toBe(316);
        expect(geo.tx).toBe(500);
        expect(geo.curve).toContain('M316');
    });

    it('history 连线：起点在源节点底边中点，终点在目标节点顶边中点', () => {
        const fromNode = { id: 'a', x: 0, y: 0, type: 'smart-image', images: [] };
        const toNode = { id: 'b', x: 0, y: 300, type: 'smart-image', images: [] };
        const sandbox = createConnectionsSandbox({ nodes: [fromNode, toNode] });
        const geo = sandbox.connectionGeometry(fromNode, toNode, true);
        // fromNode 高度 194，起点 y = 194；终点 y = 300
        expect(geo.fy).toBe(194);
        expect(geo.ty).toBe(300);
    });
});
