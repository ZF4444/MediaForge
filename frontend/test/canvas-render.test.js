// canvas-render.js 回归测试（M7）。
//
// 覆盖范围：
//   1. formatRunDuration：毫秒 -> "Ns" / "M:SS" 文案格式化。
//   2. nodeRunElapsedMs：运行中/已结束/未运行三种状态下的耗时计算。
//   3. runTimePillHtml：运行计时角标 HTML（运行中 vs 已完成 vs 不显示的场景）。
//   4. hideRunTimerForNode：隐藏计时角标的前置条件判断。
//   5. smartRecoverableImageTask：从待处理任务列表里找出"失败且可恢复"的任务。
//
// render()/bindNodeEvents()/measureSmartNodeImages() 等核心渲染/事件绑定函数
// 强依赖真实 DOM 与几乎全部其它模块状态，跟 M5 核心批次一样不适合单元测试，
// 不在本文件覆盖范围内。
import { describe, it, expect } from 'vitest';
import { createCanvasRenderSandbox } from './canvas-render-sandbox.js';

describe('formatRunDuration', () => {
    it('小于 60 秒时显示为 "Ns"', () => {
        const { formatRunDuration } = createCanvasRenderSandbox();
        expect(formatRunDuration(0)).toBe('0s');
        expect(formatRunDuration(999)).toBe('0s');
        expect(formatRunDuration(1000)).toBe('1s');
        expect(formatRunDuration(59_000)).toBe('59s');
    });

    it('大于等于 60 秒时显示为 "M:SS"', () => {
        const { formatRunDuration } = createCanvasRenderSandbox();
        expect(formatRunDuration(60_000)).toBe('1:00');
        expect(formatRunDuration(65_000)).toBe('1:05');
        expect(formatRunDuration(600_000)).toBe('10:00');
    });

    it('负数/非法输入按 0 处理', () => {
        const { formatRunDuration } = createCanvasRenderSandbox();
        expect(formatRunDuration(-100)).toBe('0s');
        expect(formatRunDuration(undefined)).toBe('0s');
        expect(formatRunDuration(null)).toBe('0s');
    });
});

describe('nodeRunElapsedMs', () => {
    it('节点为空时返回 0', () => {
        const { nodeRunElapsedMs } = createCanvasRenderSandbox();
        expect(nodeRunElapsedMs(null)).toBe(0);
        expect(nodeRunElapsedMs(undefined)).toBe(0);
    });

    it('已结束（runFinishedAt + runStartedAt）时优先使用 runElapsedMs', () => {
        const { nodeRunElapsedMs } = createCanvasRenderSandbox();
        const node = { runStartedAt: 1000, runFinishedAt: 5000, runElapsedMs: 3500 };
        expect(nodeRunElapsedMs(node)).toBe(3500);
    });

    it('已结束但没有 runElapsedMs 时回退为 runFinishedAt - runStartedAt', () => {
        const { nodeRunElapsedMs } = createCanvasRenderSandbox();
        const node = { runStartedAt: 1000, runFinishedAt: 5000 };
        expect(nodeRunElapsedMs(node)).toBe(4000);
    });

    it('运行中（只有 runStartedAt）时用当前时间 - 开始时间', () => {
        const { nodeRunElapsedMs } = createCanvasRenderSandbox({
            fns: { nowMs: () => 10_000 },
        });
        const node = { runStartedAt: 3000 };
        expect(nodeRunElapsedMs(node)).toBe(7000);
    });

    it('既没开始也没结束时返回 0', () => {
        const { nodeRunElapsedMs } = createCanvasRenderSandbox();
        expect(nodeRunElapsedMs({})).toBe(0);
    });
});

describe('runTimePillHtml', () => {
    it('节点为空、被隐藏、或是 smart-prompt 类型时不显示', () => {
        const { runTimePillHtml } = createCanvasRenderSandbox();
        expect(runTimePillHtml(null)).toBe('');
        expect(runTimePillHtml({ runTimerHidden: true, runFinishedAt: 1 })).toBe('');
        expect(runTimePillHtml({ type: 'smart-prompt', runFinishedAt: 1 })).toBe('');
    });

    it('未运行且没有结束时间时不显示', () => {
        const { runTimePillHtml } = createCanvasRenderSandbox();
        expect(runTimePillHtml({ id: 'n1' })).toBe('');
    });

    it('运行中时显示不带 done 的角标', () => {
        const { runTimePillHtml } = createCanvasRenderSandbox({
            fns: { nowMs: () => 5000 },
        });
        const html = runTimePillHtml({ id: 'n1', running: true, runStartedAt: 2000 });
        expect(html).toContain('data-run-timer="n1"');
        expect(html).not.toContain(' done"');
        expect(html).toContain('3s');
    });

    it('已完成时显示带 done 类名的角标', () => {
        const { runTimePillHtml } = createCanvasRenderSandbox();
        const html = runTimePillHtml({ id: 'n2', runStartedAt: 1000, runFinishedAt: 4000 });
        expect(html).toContain('run-time-pill done');
        expect(html).toContain('3s');
    });
});

describe('hideRunTimerForNode', () => {
    it('节点为空时返回 false', () => {
        const { hideRunTimerForNode } = createCanvasRenderSandbox();
        expect(hideRunTimerForNode(null)).toBe(false);
    });

    it('已经隐藏/仍在运行/没有结束时间时返回 false，不调用 scheduleSave', () => {
        const sandbox = createCanvasRenderSandbox();
        expect(sandbox.hideRunTimerForNode({ runTimerHidden: true, runFinishedAt: 1 })).toBe(false);
        expect(sandbox.hideRunTimerForNode({ pending: true, runFinishedAt: 1 })).toBe(false);
        expect(sandbox.hideRunTimerForNode({ running: true, runFinishedAt: 1 })).toBe(false);
        expect(sandbox.hideRunTimerForNode({ jimengPending: true, runFinishedAt: 1 })).toBe(false);
        expect(sandbox.hideRunTimerForNode({})).toBe(false);
        expect(sandbox.__state.scheduleSaveCalls).toBe(0);
    });

    it('满足隐藏条件时设置 runTimerHidden 并触发 scheduleSave', () => {
        const sandbox = createCanvasRenderSandbox();
        const node = { runFinishedAt: 1000 };
        expect(sandbox.hideRunTimerForNode(node)).toBe(true);
        expect(node.runTimerHidden).toBe(true);
        expect(sandbox.__state.scheduleSaveCalls).toBe(1);
    });
});

describe('smartRecoverableImageTask', () => {
    it('没有待处理任务时返回 null', () => {
        const { smartRecoverableImageTask } = createCanvasRenderSandbox({
            fns: { smartPendingTasks: () => [] },
        });
        expect(smartRecoverableImageTask({})).toBe(null);
    });

    it('存在失败且带 recoverTaskId 的任务时返回该任务', () => {
        const task = { failed: true, recoverTaskId: 't1' };
        const { smartRecoverableImageTask } = createCanvasRenderSandbox({
            fns: { smartPendingTasks: () => [{ failed: false }, task] },
        });
        expect(smartRecoverableImageTask({})).toBe(task);
    });

    it('任务失败但没有 recoverTaskId 时不算可恢复', () => {
        const { smartRecoverableImageTask } = createCanvasRenderSandbox({
            fns: { smartPendingTasks: () => [{ failed: true, recoverTaskId: '' }] },
        });
        expect(smartRecoverableImageTask({})).toBe(null);
    });
});
