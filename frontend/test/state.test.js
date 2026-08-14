// M22 state.js 的初始值回归测试：确认核心状态变量的初始值在物理搬移
// 前后完全一致。state.js 本身只有声明语句，没有任何函数逻辑，所以
// 这里不需要 sandbox 辅助文件，直接加载源码文本验证初始值即可。
//
// 注意：Node vm 模块的细节——contextify 后的 sandbox 对象不会自动
// 反映 `let`/`const` 声明的绑定（那些绑定只存在于 vm 上下文的词法
// 环境里，不是 sandbox 对象的属性），必须始终通过 vm.runInContext(...)
// 表达式取值，不能直接读 sandbox.nodes 之类的属性。
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const STATE_SRC = fs.readFileSync(path.resolve(repoRoot, 'frontend/src/canvas/state.js'), 'utf8');

function loadStateContext() {
    const sandbox = { console };
    vm.createContext(sandbox);
    vm.runInContext(STATE_SRC, sandbox, { filename: 'state.js' });
    return sandbox;
}

function evalIn(ctx, expr) {
    return vm.runInContext(expr, ctx);
}

describe('state.js 初始值', () => {
    it('canvas 初始为 null', () => {
        const ctx = loadStateContext();
        expect(evalIn(ctx, 'canvas')).toBeNull();
    });

    it('nodes 初始为空数组', () => {
        const ctx = loadStateContext();
        expect(evalIn(ctx, 'nodes')).toEqual([]);
    });

    it('selectedId 初始为空字符串', () => {
        const ctx = loadStateContext();
        expect(evalIn(ctx, 'selectedId')).toBe('');
    });

    it('selectedIds 初始为空数组', () => {
        const ctx = loadStateContext();
        expect(evalIn(ctx, 'selectedIds')).toEqual([]);
    });

    it('selectedImage 初始为 {nodeId:"", index:-1}', () => {
        const ctx = loadStateContext();
        expect(evalIn(ctx, 'JSON.stringify(selectedImage)')).toBe(JSON.stringify({ nodeId: '', index: -1 }));
    });

    it('viewport 初始为 {x:0, y:0, scale:1}', () => {
        const ctx = loadStateContext();
        expect(evalIn(ctx, 'JSON.stringify(viewport)')).toBe(JSON.stringify({ x: 0, y: 0, scale: 1 }));
    });

    it('这6个变量都是可重新赋值的（let 声明，不是 const），且跨语句持久生效', () => {
        const ctx = loadStateContext();
        expect(() => {
            evalIn(ctx, 'nodes = [{id:"a"}]; selectedId = "a"; viewport.x = 100;');
        }).not.toThrow();
        expect(evalIn(ctx, 'JSON.stringify(nodes)')).toBe(JSON.stringify([{ id: 'a' }]));
        expect(evalIn(ctx, 'selectedId')).toBe('a');
        expect(evalIn(ctx, 'viewport.x')).toBe(100);
    });
});
