// workflow-transfer.js 回归测试（M15）。
//
// 覆盖范围：
//   1. apiErrorMessage：从各种可能的后端错误响应结构里提取可读的错误
//      文案（字符串/FastAPI 风格的 detail 数组/普通对象/兜底 JSON）。
//   2. normalizeImportedSmartWorkflow：把三种可能的导入 JSON 结构
//      （纯数组/{nodes,connections}/{workflow:{nodes,connections}}）
//      统一归一化为 {nodes, connections} 形式。
//   3. smartWorkflowFilename：按画布标题+时间戳生成导出文件名（清理
//      非法字符）。
//
// exportSelectedSmartWorkflow/importSmartWorkflowFile/
// insertSmartWorkflowIntoCanvas 等函数强依赖真实 DOM/网络请求/node
// 全局状态，跟 M5/M7/M8 核心批次一样不适合单元测试，不在本文件覆盖
// 范围内。
import { describe, it, expect } from 'vitest';
import { createWorkflowTransferSandbox } from './workflow-transfer-sandbox.js';

describe('apiErrorMessage', () => {
    it('data 为空时返回 fallback', () => {
        const { apiErrorMessage } = createWorkflowTransferSandbox();
        expect(apiErrorMessage(null, '默认错误')).toBe('默认错误');
        expect(apiErrorMessage(undefined)).toBe('请求失败');
    });

    it('data 为字符串时直接返回', () => {
        const { apiErrorMessage } = createWorkflowTransferSandbox();
        expect(apiErrorMessage('出错了')).toBe('出错了');
        expect(apiErrorMessage('')).toBe('请求失败');
    });

    it('detail/error/message 为字符串时优先返回', () => {
        const { apiErrorMessage } = createWorkflowTransferSandbox();
        expect(apiErrorMessage({ detail: '文件太大' })).toBe('文件太大');
        expect(apiErrorMessage({ error: '未授权' })).toBe('未授权');
        expect(apiErrorMessage({ message: '超时' })).toBe('超时');
    });

    it('detail 为 FastAPI 风格的校验错误数组时拼接 loc+msg', () => {
        const { apiErrorMessage } = createWorkflowTransferSandbox();
        const data = {
            detail: [
                { loc: ['body', 'name'], msg: '字段不能为空' },
                { loc: ['body', 'age'], msg: '必须是数字' },
            ],
        };
        expect(apiErrorMessage(data)).toBe('name: 字段不能为空\nage: 必须是数字');
    });

    it('detail 数组里的纯字符串项直接使用', () => {
        const { apiErrorMessage } = createWorkflowTransferSandbox();
        expect(apiErrorMessage({ detail: ['错误A', '错误B'] })).toBe('错误A\n错误B');
    });

    it('detail 为普通对象时取 message/msg 字段', () => {
        const { apiErrorMessage } = createWorkflowTransferSandbox();
        expect(apiErrorMessage({ detail: { message: '内部错误' } })).toBe('内部错误');
    });

    it('没有任何已知字段时兜底为 JSON 字符串', () => {
        const { apiErrorMessage } = createWorkflowTransferSandbox();
        expect(apiErrorMessage({ code: 500 })).toBe('{"code":500}');
    });
});

describe('normalizeImportedSmartWorkflow', () => {
    it('纯数组形式：视为 nodes，connections 为空', () => {
        const { normalizeImportedSmartWorkflow } = createWorkflowTransferSandbox();
        const nodes = [{ id: 'n1' }];
        expect(normalizeImportedSmartWorkflow(nodes)).toEqual({ nodes, connections: [] });
    });

    it('{nodes, connections} 形式：直接使用', () => {
        const { normalizeImportedSmartWorkflow } = createWorkflowTransferSandbox();
        const data = { nodes: [{ id: 'n1' }], connections: [{ from: 'n1', to: 'n2' }] };
        expect(normalizeImportedSmartWorkflow(data)).toEqual(data);
    });

    it('{nodes} 形式无 connections 时补空数组', () => {
        const { normalizeImportedSmartWorkflow } = createWorkflowTransferSandbox();
        const data = { nodes: [{ id: 'n1' }] };
        expect(normalizeImportedSmartWorkflow(data)).toEqual({ nodes: data.nodes, connections: [] });
    });

    it('{workflow:{nodes,connections}} 形式：解包 workflow 字段', () => {
        const { normalizeImportedSmartWorkflow } = createWorkflowTransferSandbox();
        const data = { workflow: { nodes: [{ id: 'n1' }], connections: [{ from: 'n1', to: 'n2' }] } };
        expect(normalizeImportedSmartWorkflow(data)).toEqual({ nodes: data.workflow.nodes, connections: data.workflow.connections });
    });

    it('无法识别的结构返回空的 nodes/connections', () => {
        const { normalizeImportedSmartWorkflow } = createWorkflowTransferSandbox();
        expect(normalizeImportedSmartWorkflow({})).toEqual({ nodes: [], connections: [] });
        expect(normalizeImportedSmartWorkflow(null)).toEqual({ nodes: [], connections: [] });
    });
});

describe('smartWorkflowFilename', () => {
    it('使用 canvas.title 作为文件名基础，清理非法字符', () => {
        const sandbox = createWorkflowTransferSandbox({ canvas: { title: 'My/Test:Canvas' } });
        const filename = sandbox.smartWorkflowFilename('json');
        expect(filename).toMatch(/^My_Test_Canvas-workflow-\d+\.json$/);
    });

    it('标题里的空格替换为短横线', () => {
        const sandbox = createWorkflowTransferSandbox({ canvas: { title: 'my canvas title' } });
        const filename = sandbox.smartWorkflowFilename('zip');
        expect(filename).toMatch(/^my-canvas-title-workflow-\d+\.zip$/);
    });

    it('没有 canvas.title 且找不到 DOM 元素时回退为 smart-canvas', () => {
        const sandbox = createWorkflowTransferSandbox({ canvas: null });
        const filename = sandbox.smartWorkflowFilename('json');
        expect(filename).toMatch(/^smart-canvas-workflow-\d+\.json$/);
    });

    it('标题过长时截断到 48 字符以内', () => {
        const longTitle = 'a'.repeat(100);
        const sandbox = createWorkflowTransferSandbox({ canvas: { title: longTitle } });
        const filename = sandbox.smartWorkflowFilename('json');
        const basePart = filename.split('-workflow-')[0];
        expect(basePart.length).toBeLessThanOrEqual(48);
    });
});
