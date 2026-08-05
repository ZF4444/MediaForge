// 测试辅助：把经典 <script> 形式的 node-graph-editor.js（comfyui-settings
// 页面）加载进模拟全局作用域，供 vitest 测试用例调用其中定义的纯逻辑
// 函数。
//
// 注意：renderGraph/attachPanZoom/openNodePopup 等依赖真实 DOM/SVG 渲染，
// 不适合单元测试。本 sandbox 主要覆盖 computeLayers——按 ComfyUI 工作流
// JSON 里节点间的输入引用关系（[nodeId, outputIndex] 形式）计算拓扑
// 层级，用于图编辑器的分层布局。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const NODE_GRAPH_EDITOR_SRC = fs.readFileSync(
    path.resolve(repoRoot, 'frontend/src/comfyui-settings/node-graph-editor.js'),
    'utf8'
);

export function createNodeGraphEditorSandbox(overrides = {}) {
    const sandbox = {
        window: {},
        console, Math, Array, Object, Number, String, Boolean, Set, Map, JSON,

        currentWorkflow: overrides.currentWorkflow ?? {},
        currentConfig: overrides.currentConfig ?? { fields: [] },
        graphView: overrides.graphView ?? { k: 1, x: 0, y: 0 },
        graphContentSize: overrides.graphContentSize ?? { w: 0, h: 0 },
        panState: overrides.panState ?? null,
        popupNodeId: overrides.popupNodeId ?? null,
        nodeLabel: overrides.fns?.nodeLabel || (id => id),
        nodeSub: overrides.fns?.nodeSub || (() => ''),
        nodeIcon: overrides.fns?.nodeIcon || (() => ''),
        inputLabel: overrides.fns?.inputLabel || (input => input),
        fieldFor: overrides.fns?.fieldFor || (() => null),
        toggleField: overrides.fns?.toggleField || (() => {}),
        refreshPopupBody: overrides.fns?.refreshPopupBody || (() => {}),
        renderPreview: overrides.fns?.renderPreview || (() => {}),
        renderWorkspaceView: overrides.fns?.renderWorkspaceView || (() => {}),
        escapeHtml: overrides.fns?.escapeHtml || (s => String(s ?? '')),
        escapeAttr: overrides.fns?.escapeAttr || (s => String(s ?? '')),
        tr: overrides.fns?.tr || (key => key),
        tf: overrides.fns?.tf || (key => key),
        setStatus: overrides.fns?.setStatus || (() => {}),
        refreshIcons: overrides.fns?.refreshIcons || (() => {}),
        document: {
            getElementById: overrides.fns?.getElementById || (() => null),
            querySelector: overrides.fns?.querySelector || (() => null),
            querySelectorAll: overrides.fns?.querySelectorAll || (() => []),
        },
    };

    vm.createContext(sandbox);
    vm.runInContext(NODE_GRAPH_EDITOR_SRC, sandbox, { filename: 'node-graph-editor.js' });
    return sandbox;
}
