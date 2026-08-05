import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { createNodeGraphEditorSandbox } from './node-graph-editor-sandbox.js';

function run(ctx, expr) {
    return vm.runInContext(expr, ctx);
}

describe('computeLayers', () => {
    it('无依赖关系的孤立节点都在第 0 层', () => {
        const workflow = {
            a: { inputs: {} },
            b: { inputs: {} },
        };
        const ctx = createNodeGraphEditorSandbox({ currentWorkflow: workflow });
        const result = JSON.parse(run(ctx, 'JSON.stringify(computeLayers())'));
        expect(result.layer.a).toBe(0);
        expect(result.layer.b).toBe(0);
    });

    it('简单的线性依赖链按顺序分层', () => {
        // a -> b -> c（b 依赖 a 的输出，c 依赖 b 的输出）
        const workflow = {
            a: { inputs: {} },
            b: { inputs: { image: ['a', 0] } },
            c: { inputs: { image: ['b', 0] } },
        };
        const ctx = createNodeGraphEditorSandbox({ currentWorkflow: workflow });
        const result = JSON.parse(run(ctx, 'JSON.stringify(computeLayers())'));
        expect(result.layer.a).toBe(0);
        expect(result.layer.b).toBe(1);
        expect(result.layer.c).toBe(2);
    });

    it('一个节点被多个下游引用时，取较深的层级', () => {
        // a -> b -> d, a -> c -> d（d 应该在 a 之后两层，取决于路径长度）
        const workflow = {
            a: { inputs: {} },
            b: { inputs: { x: ['a', 0] } },
            c: { inputs: { x: ['a', 0] } },
            d: { inputs: { x: ['b', 0], y: ['c', 0] } },
        };
        const ctx = createNodeGraphEditorSandbox({ currentWorkflow: workflow });
        const result = JSON.parse(run(ctx, 'JSON.stringify(computeLayers())'));
        expect(result.layer.a).toBe(0);
        expect(result.layer.b).toBe(1);
        expect(result.layer.c).toBe(1);
        expect(result.layer.d).toBe(2);
    });

    it('引用不存在的上游节点时忽略该引用', () => {
        const workflow = {
            a: { inputs: { x: ['nonexistent', 0] } },
        };
        const ctx = createNodeGraphEditorSandbox({ currentWorkflow: workflow });
        const result = JSON.parse(run(ctx, 'JSON.stringify(computeLayers())'));
        expect(result.layer.a).toBe(0);
    });

    it('buckets 按层级分组节点 id', () => {
        const workflow = {
            a: { inputs: {} },
            b: { inputs: { x: ['a', 0] } },
        };
        const ctx = createNodeGraphEditorSandbox({ currentWorkflow: workflow });
        const result = JSON.parse(run(ctx, 'JSON.stringify(computeLayers())'));
        expect(result.buckets['0']).toEqual(['a']);
        expect(result.buckets['1']).toEqual(['b']);
    });

    it('空工作流返回空结果', () => {
        const ctx = createNodeGraphEditorSandbox({ currentWorkflow: {} });
        const result = JSON.parse(run(ctx, 'JSON.stringify(computeLayers())'));
        expect(result.layer).toEqual({});
        expect(result.buckets).toEqual({});
    });
});
