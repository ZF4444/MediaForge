// 测试辅助：把经典 <script> 形式的 workflow-transfer.js（M15）加载进
// 模拟全局作用域，供 vitest 测试用例调用其中定义的纯逻辑函数（API
// 错误信息提取、导入数据结构归一化、导出文件名生成）。原理跟其它
// xxx-sandbox.js 一致，见 loop-node-sandbox.js 顶部注释。
//
// 注意：exportSelectedSmartWorkflow/importSmartWorkflowFile/
// insertSmartWorkflowIntoCanvas 等函数强依赖真实 DOM/网络请求/node
// 全局状态，跟 M5/M7/M8 核心批次同类不适合单元测试，因此本 sandbox
// 只覆盖可独立验证的纯函数：apiErrorMessage / normalizeImportedSmartWorkflow /
// smartWorkflowFilename。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function readSrc(name) {
    return fs.readFileSync(
        path.resolve(repoRoot, `frontend/src/smart-canvas/${name}`),
        'utf8'
    );
}

const WORKFLOW_TRANSFER_SRC = readSrc('workflow-transfer.js');

export function createWorkflowTransferSandbox(overrides = {}) {
    const sandbox = {
        window: {},
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise, RegExp, JSON,

        canvas: overrides.canvas ?? null,
        document: {
            getElementById: overrides.fns?.getElementById || (() => null),
        },
    };

    vm.createContext(sandbox);
    vm.runInContext(WORKFLOW_TRANSFER_SRC, sandbox, { filename: 'workflow-transfer.js' });
    return sandbox;
}
