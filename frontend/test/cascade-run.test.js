// cascade-run.js 回归测试（M5）。
//
// 覆盖范围（第1批的纯逻辑函数，其余深度依赖 DOM/网络请求的函数不适合
// 单元测试，见 cascade-run-sandbox.js 顶部注释）：
//   1. smartCascadeAbortError：停止信号错误对象的标记字段。
//   2. throwIfSmartCascadeStopRequested：按 runState/全局停止标志决定是否抛出。
//   3. requestSmartCascadeStop：请求停止时对 runState/全局状态的正确置位。
//   4. smartCascadeParallelLimit：按链路是否含 comfy 节点决定并行度上限。
//   5. runSmartCascadeRoundsWithLimit：worker 池按 limit 并发执行、遇停止信号提前退出。
//   6. cascadeRefsFromOutputs：级联输出转换为下一步输入引用的字段映射。
//   7. smartCascadeStopText：停止中/停止运行两种文案。
import { describe, it, expect, vi } from 'vitest';
import { createCascadeRunSandbox } from './cascade-run-sandbox.js';

describe('smartCascadeAbortError', () => {
    it('返回带 smartCascadeStopped 标记的 Error', () => {
        const { smartCascadeAbortError } = createCascadeRunSandbox();
        const err = smartCascadeAbortError();
        // 注意：err 是在 node:vm 沙箱上下文里创建的 Error 实例，它的构造函数
        // 跟当前测试进程主上下文的 Error 类是不同的引用，instanceof Error
        // 天然不成立（这是跨 vm context 的已知限制，不是被测代码的问题），
        // 所以这里改用更宽松但足够验证语义的检查方式。
        expect(err.name).toBe('Error');
        expect(typeof err.message).toBe('string');
        expect(err.smartCascadeStopped).toBe(true);
        expect(err.message).toBe('已停止链路运行');
    });
});

describe('throwIfSmartCascadeStopRequested', () => {
    it('runState.stopRequested 为 true 时抛出', () => {
        const sandbox = createCascadeRunSandbox();
        expect(() => sandbox.throwIfSmartCascadeStopRequested({ stopRequested: true }))
            .toThrow('已停止链路运行');
    });

    it('没有 runState 但全局 smartCascadeStopRequested 为 true 时抛出', () => {
        const sandbox = createCascadeRunSandbox({ smartCascadeStopRequested: true });
        expect(() => sandbox.throwIfSmartCascadeStopRequested(null)).toThrow();
    });

    it('都为 false 时不抛出', () => {
        const sandbox = createCascadeRunSandbox();
        expect(() => sandbox.throwIfSmartCascadeStopRequested({ stopRequested: false })).not.toThrow();
        expect(() => sandbox.throwIfSmartCascadeStopRequested(null)).not.toThrow();
    });

    it('有 runState 时不看全局标志（即使全局为 true，只要 runState.stopRequested 为 false 就不抛）', () => {
        const sandbox = createCascadeRunSandbox({ smartCascadeStopRequested: true });
        expect(() => sandbox.throwIfSmartCascadeStopRequested({ stopRequested: false })).not.toThrow();
    });
});

describe('requestSmartCascadeStop', () => {
    it('指定 loopId 且存在对应 runState 时，置位该 runState.stopRequested', () => {
        const runState = { stopRequested: false, runKey: 'k1', loopId: 'loop1' };
        const runs = new Map([['loop1', runState]]);
        const syncSpy = vi.fn();
        const sandbox = createCascadeRunSandbox({
            smartCascadeRuns: runs,
            fns: { syncSmartCascadeLegacyState: syncSpy },
        });
        sandbox.requestSmartCascadeStop('loop1');
        expect(runState.stopRequested).toBe(true);
        expect(syncSpy).toHaveBeenCalledWith('k1');
    });

    it('已经 stopRequested 的 runState 再次调用不会重复触发 toast/render', () => {
        const runState = { stopRequested: true, runKey: 'k1' };
        const runs = new Map([['loop1', runState]]);
        const toastSpy = vi.fn();
        const sandbox = createCascadeRunSandbox({
            smartCascadeRuns: runs,
            fns: { toast: toastSpy },
        });
        sandbox.requestSmartCascadeStop('loop1');
        expect(toastSpy).not.toHaveBeenCalled();
    });

    it('没有 loopId 且没有活跃 runState 时，走全局 smartCascadeStopRequested 分支', () => {
        const sandbox = createCascadeRunSandbox({ smartCascadeRunning: true });
        sandbox.requestSmartCascadeStop();
        expect(sandbox.smartCascadeStopRequested).toBe(true);
    });

    it('全局未在运行时（smartCascadeRunning=false）调用不产生任何效果', () => {
        const toastSpy = vi.fn();
        const sandbox = createCascadeRunSandbox({
            smartCascadeRunning: false,
            fns: { toast: toastSpy },
        });
        sandbox.requestSmartCascadeStop();
        expect(sandbox.smartCascadeStopRequested).toBe(false);
        expect(toastSpy).not.toHaveBeenCalled();
    });
});

describe('smartCascadeParallelLimit', () => {
    it('链路中没有 comfy 引擎节点时，固定返回 6', () => {
        const sandbox = createCascadeRunSandbox({
            fns: { smartSettingsForNode: () => ({ engine: 'api' }) },
        });
        expect(sandbox.smartCascadeParallelLimit([{ id: 'a' }])).toBe(6);
    });

    it('链路中有 comfy 引擎节点时，按 comfyInstanceCount 限制（且不超过 6）', () => {
        const sandbox = createCascadeRunSandbox({
            comfyInstanceCount: 3,
            fns: { smartSettingsForNode: (node) => (node.id === 'b' ? { engine: 'comfy' } : { engine: 'api' }) },
        });
        expect(sandbox.smartCascadeParallelLimit([{ id: 'a' }, { id: 'b' }])).toBe(3);
    });

    it('comfyInstanceCount 超过 6 时封顶为 6', () => {
        const sandbox = createCascadeRunSandbox({
            comfyInstanceCount: 20,
            fns: { smartSettingsForNode: () => ({ engine: 'comfy' }) },
        });
        expect(sandbox.smartCascadeParallelLimit([{ id: 'a' }])).toBe(6);
    });

    it('comfyInstanceCount 缺省/非法时至少为 1', () => {
        const sandbox = createCascadeRunSandbox({
            comfyInstanceCount: 0,
            fns: { smartSettingsForNode: () => ({ engine: 'comfy' }) },
        });
        expect(sandbox.smartCascadeParallelLimit([{ id: 'a' }])).toBe(1);
    });
});

describe('runSmartCascadeRoundsWithLimit', () => {
    it('按 limit 并发跑完所有轮次', async () => {
        const sandbox = createCascadeRunSandbox();
        const executed = [];
        const runner = vi.fn(async (current, roundOffset) => {
            executed.push([current, roundOffset]);
        });
        await sandbox.runSmartCascadeRoundsWithLimit([10, 20, 30], 2, runner);
        expect(runner).toHaveBeenCalledTimes(3);
        // 每一轮的 (current, roundOffset) 都应该被跑到，不保证顺序（并发 worker）。
        const rounds = executed.map(e => e[1]).sort();
        expect(rounds).toEqual([0, 1, 2]);
    });

    it('runState.stopRequested 为 true 时提前停止，不再领取新任务', async () => {
        const runState = { stopRequested: false };
        const sandbox = createCascadeRunSandbox();
        let callCount = 0;
        const runner = vi.fn(async () => {
            callCount++;
            if (callCount === 1) runState.stopRequested = true;
        });
        await sandbox.runSmartCascadeRoundsWithLimit([1, 2, 3, 4, 5], 1, runner, runState);
        // 单 worker（limit=1）串行执行，第一次执行后设置停止标志，后续不应再执行。
        expect(callCount).toBe(1);
    });

    it('runner 抛出 smartCascadeStopped 错误时该 worker 静默停止，不向上抛出', async () => {
        const sandbox = createCascadeRunSandbox();
        const runner = vi.fn(async () => {
            const err = new Error('stopped');
            err.smartCascadeStopped = true;
            throw err;
        });
        await expect(sandbox.runSmartCascadeRoundsWithLimit([1, 2], 1, runner)).resolves.toBeUndefined();
    });

    it('runner 抛出普通错误时会向上抛出', async () => {
        const sandbox = createCascadeRunSandbox();
        const runner = vi.fn(async () => { throw new Error('boom'); });
        await expect(sandbox.runSmartCascadeRoundsWithLimit([1], 1, runner)).rejects.toThrow('boom');
    });

    it('limit 超过轮次数量时，worker 数量不超过轮次总数', async () => {
        const sandbox = createCascadeRunSandbox();
        const runner = vi.fn(async () => {});
        await sandbox.runSmartCascadeRoundsWithLimit([1, 2], 10, runner);
        expect(runner).toHaveBeenCalledTimes(2);
    });
});

describe('cascadeRefsFromOutputs', () => {
    it('过滤掉没有 url 的输出，补全字段映射', () => {
        const sandbox = createCascadeRunSandbox();
        const outputs = [{ url: 'a.png' }, { url: '' }, { url: 'b.png', name: 'custom.png', kind: 'video', file_id: 'f1' }];
        const targetNode = { id: 'node1', images: [{}, {}, {}, {}] }; // 假设 outputs.length=3, targetNode.images.length=4
        const refs = sandbox.cascadeRefsFromOutputs(outputs, targetNode);
        expect(refs).toHaveLength(2); // 空 url 被过滤
        expect(refs[0]).toMatchObject({ url: 'a.png', name: '图1', kind: 'image', role: 'image_1', nodeId: 'node1' });
        expect(refs[1]).toMatchObject({ url: 'b.png', name: 'custom.png', kind: 'video', role: 'image_2', file_id: 'f1' });
    });

    it('没有 targetNode 时 nodeId 为空、imageIndex 用原始 index', () => {
        const sandbox = createCascadeRunSandbox();
        const refs = sandbox.cascadeRefsFromOutputs([{ url: 'a.png' }], null);
        expect(refs[0].nodeId).toBe('');
        expect(refs[0].imageIndex).toBe(0);
    });

    it('空/undefined outputs 返回空数组', () => {
        const sandbox = createCascadeRunSandbox();
        expect(sandbox.cascadeRefsFromOutputs(null, null)).toEqual([]);
        expect(sandbox.cascadeRefsFromOutputs(undefined, null)).toEqual([]);
    });
});

describe('smartCascadeStopText', () => {
    it('stopping=true 时返回"停止中..."，否则返回"停止运行"', () => {
        const sandbox = createCascadeRunSandbox();
        expect(sandbox.smartCascadeStopText(true)).toBe('停止中...');
        expect(sandbox.smartCascadeStopText(false)).toBe('停止运行');
        expect(sandbox.smartCascadeStopText()).toBe('停止运行');
    });
});
