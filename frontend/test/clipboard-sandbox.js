// 测试辅助：把经典 <script> 形式的 clipboard.js（M13）加载进模拟全局
// 作用域，供 vitest 测试用例调用其中定义的纯逻辑函数（剪贴板 MIME
// 类型映射、剪贴板事件文件提取等）。原理跟其它 xxx-sandbox.js 一致，
// 见 loop-node-sandbox.js 顶部注释。
//
// 注意：copySelectedNodes/pasteNodes/pasteFromContextMenu 等函数强
// 依赖真实 DOM/node 全局状态/navigator.clipboard 异步 API，跟 M5/M7/M8
// 核心批次同类的"过于依赖 DOM/网络，不适合单元测试"情形，因此本
// sandbox 只覆盖可独立验证的纯函数：clipboardMediaExtension /
// canReadSystemClipboard / clipboardEventMediaFiles。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function readSrc(name) {
    return fs.readFileSync(
        path.resolve(repoRoot, `frontend/src/canvas/${name}`),
        'utf8'
    );
}

const CLIPBOARD_SRC = readSrc('clipboard.js');

export function createClipboardSandbox(overrides = {}) {
    const sandbox = {
        window: {},
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise, RegExp,

        navigator: overrides.navigator || {},

        // isSupportedUploadFile 正常在 upload.js 里定义，本 sandbox 单独
        // 加载 clipboard.js 时提供一个最小可用的替代实现（按 File 的
        // type 前缀判断，跟真实实现的核心逻辑一致）。
        isSupportedUploadFile: overrides.fns?.isSupportedUploadFile || ((file) => {
            const type = String(file?.type || '');
            return /^(image|video|audio)\//i.test(type);
        }),
    };

    vm.createContext(sandbox);
    vm.runInContext(CLIPBOARD_SRC, sandbox, { filename: 'clipboard.js' });
    return sandbox;
}
