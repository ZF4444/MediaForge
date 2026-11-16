// Ctrl/Cmd+点击切换多选（效果等同框选）。
//
// 覆盖：
//   1. toggleNodeInSelection / isMultiSelectModifier：纯函数。
//   2. applyNodeModifierSelection：与 setCanvasSelection 配合后的选择状态。
//   3. 接线：节点 click、视频 mousedown、上传区 click、缩略图 click、提示词文本框 click
//      都走同一个入口；拖拽不再依赖 Ctrl。
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const stateSrc = read('../src/canvas/state.js');
const mainSrc = read('../src/canvas/main.js');
const renderSrc = read('../src/canvas/canvas-render.js');

// 截取函数体：以"下一个同级声明"为终点，避免非贪婪正则被 catch (e) {} 截断。
function sliceBetween(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    if (from < 0 || to < 0) throw new Error(`cannot slice ${start} .. ${end}`);
    return source.slice(from, to);
}

// 先放函数声明，再放 let 状态，最后用表达式取值（vm 里 let 不会挂到 sandbox 上）。
function createContext({ selectedId = '', selectedIds = [], running = false } = {}) {
    const calls = { render: 0, savePromptDraft: 0 };
    const sandbox = {
        smartCascadeAnyRunning: () => running,
        savePromptDraftForCurrent: () => { calls.savePromptDraft++; },
        render: () => { calls.render++; },
    };
    vm.createContext(sandbox);
    const code = [
        'let selectedId = ' + JSON.stringify(selectedId) + ';',
        'let selectedIds = ' + JSON.stringify(selectedIds) + ';',
        "let selectedImage = {nodeId:'', index:-1};",
        "let candidatePanelNodeId = 'x'; let candidatePanelIndex = 3;",
        "let suppressComposerForCandidateNodeId = 'y'; let smartCascadeSilentSelection = true;",
        // state.js 里的 setCanvasSelection / toggleNodeInSelection / isMultiSelectModifier
        sliceBetween(stateSrc, 'function toggleNodeInSelection(', 'function setCanvasSelection(')
            + sliceBetween(stateSrc, 'function setCanvasSelection(', '\n}\n') + '\n}',
        sliceBetween(mainSrc, 'function applyNodeModifierSelection(', 'function isNodeSelected('),
    ].join('\n');
    vm.runInContext(code, sandbox, { filename: 'click-multi-select' });
    const read = expr => vm.runInContext(expr, sandbox);
    const click = (id, mods = { ctrlKey: true }) => vm.runInContext(
        `applyNodeModifierSelection(${JSON.stringify(mods)}, ${JSON.stringify(id)})`, sandbox);
    return { calls, read, click };
}

describe('toggleNodeInSelection / isMultiSelectModifier', () => {
    const load = () => {
        const sandbox = {};
        vm.createContext(sandbox);
        vm.runInContext(
            sliceBetween(stateSrc, 'function toggleNodeInSelection(', 'function setCanvasSelection('),
            sandbox,
        );
        return sandbox;
    };

    it('当前只有单选时，先并入集合再追加', () => {
        const { toggleNodeInSelection } = load();
        expect(toggleNodeInSelection([], 'a', 'b')).toEqual(['a', 'b']);
    });

    it('已有多选时追加新节点，保持原顺序', () => {
        const { toggleNodeInSelection } = load();
        expect(toggleNodeInSelection(['a', 'b'], '', 'c')).toEqual(['a', 'b', 'c']);
    });

    it('点击已选节点则移除', () => {
        const { toggleNodeInSelection } = load();
        expect(toggleNodeInSelection(['a', 'b', 'c'], '', 'b')).toEqual(['a', 'c']);
        expect(toggleNodeInSelection([], 'a', 'a')).toEqual([]);
    });

    it('没有任何选择时点击得到单个节点', () => {
        const { toggleNodeInSelection } = load();
        expect(toggleNodeInSelection([], '', 'a')).toEqual(['a']);
    });

    it('空 id 返回空集合，不修改入参', () => {
        const { toggleNodeInSelection } = load();
        const input = ['a'];
        expect(toggleNodeInSelection(input, '', '')).toEqual([]);
        expect(input).toEqual(['a']);
    });

    it('Ctrl 或 Meta 才算多选修饰键，Shift/Alt 不算', () => {
        const sandbox = {};
        vm.createContext(sandbox);
        vm.runInContext(sliceBetween(stateSrc, 'function isMultiSelectModifier(', 'function setCanvasSelection('), sandbox);
        const { isMultiSelectModifier } = sandbox;
        expect(isMultiSelectModifier({ ctrlKey: true })).toBe(true);
        expect(isMultiSelectModifier({ metaKey: true })).toBe(true);
        expect(isMultiSelectModifier({ shiftKey: true })).toBe(false);
        expect(isMultiSelectModifier({ altKey: true })).toBe(false);
        expect(isMultiSelectModifier(null)).toBe(false);
    });
});

describe('applyNodeModifierSelection', () => {
    it('没有修饰键时不处理，由调用方走原有单选逻辑', () => {
        const ctx = createContext({ selectedId: 'a' });
        expect(ctx.click('b', { ctrlKey: false, metaKey: false })).toBe(false);
        expect(ctx.read('selectedId')).toBe('a');
        expect(ctx.calls.render).toBe(0);
    });

    it('已单选 A 后 Ctrl 点 B：变成 [A,B] 多选，selectedId 置空（与框选一致）', () => {
        const ctx = createContext({ selectedId: 'a' });
        expect(ctx.click('b')).toBe(true);
        expect(ctx.read('selectedIds')).toEqual(['a', 'b']);
        expect(ctx.read('selectedId')).toBe('');
        expect(ctx.calls.render).toBe(1);
        expect(ctx.calls.savePromptDraft).toBe(1);
    });

    it('Meta（Cmd）同样生效', () => {
        const ctx = createContext({ selectedId: 'a' });
        expect(ctx.click('b', { metaKey: true })).toBe(true);
        expect(ctx.read('selectedIds')).toEqual(['a', 'b']);
    });

    it('连续点选三个后再点其中一个：移除，剩两个仍是多选', () => {
        const ctx = createContext();
        ctx.click('a'); ctx.click('b'); ctx.click('c');
        expect(ctx.read('selectedIds')).toEqual(['a', 'b', 'c']);
        ctx.click('b');
        expect(ctx.read('selectedIds')).toEqual(['a', 'c']);
        expect(ctx.read('selectedId')).toBe('');
    });

    it('移除到只剩 1 个时退回单选（selectedId 有值、selectedIds 清空）', () => {
        const ctx = createContext({ selectedIds: ['a', 'b'] });
        ctx.click('b');
        expect(ctx.read('selectedId')).toBe('a');
        expect(ctx.read('selectedIds')).toEqual([]);
    });

    it('移除到 0 个时清空选择', () => {
        const ctx = createContext({ selectedId: 'a' });
        ctx.click('a');
        expect(ctx.read('selectedId')).toBe('');
        expect(ctx.read('selectedIds')).toEqual([]);
    });

    it('清除图片级选择、候选面板和输入栏抑制状态', () => {
        const ctx = createContext({ selectedId: 'a' });
        ctx.click('b');
        expect(ctx.read('selectedImage')).toEqual({ nodeId: '', index: -1 });
        expect(ctx.read('candidatePanelNodeId')).toBe('');
        expect(ctx.read('candidatePanelIndex')).toBe(0);
        expect(ctx.read('suppressComposerForCandidateNodeId')).toBe('');
    });

    it('级联运行中退出静默选择状态，与单击行为一致', () => {
        const ctx = createContext({ selectedId: 'a', running: true });
        ctx.click('b');
        expect(ctx.read('smartCascadeSilentSelection')).toBe(false);
    });
});

describe('接线与拖拽', () => {
    it('节点 click、上传区 click、缩略图 click、提示词文本框 click 都走同一入口', () => {
        expect((renderSrc.match(/applyNodeModifierSelection\(e, id\)/g) || []).length).toBe(3);
        expect(mainSrc).toContain('applyNodeModifierSelection(e, node.id)');
    });

    it('视频 mousedown 遇到修饰键不折叠选择', () => {
        const body = sliceBetween(renderSrc, "if(!e.target.closest('video')) return;", "el.addEventListener('click'");
        expect(body).toContain('if(isMultiSelectModifier(e)) return;');
        expect(body.indexOf('isMultiSelectModifier')).toBeLessThan(body.indexOf('setCanvasSelection'));
    });

    it('拖拽不再读取 Ctrl：没有 ctrlGroup 与循环节点插入连线逻辑', () => {
        const all = [renderSrc, mainSrc, read('../src/canvas/connections.js'), read('../src/canvas/loop-node.js')].join('\n');
        for (const name of ['ctrlGroup', 'loopInsertPreview', 'insertLoopNodeIntoConnection', 'insertionConnectionForNode']) {
            expect(all).not.toContain(name);
        }
    });

    it('单个节点拖到多图节点上仍会合并，不再要求 Ctrl', () => {
        expect(renderSrc).toContain('if(target && (target.images || []).length > 1){');
        expect(renderSrc).toContain('mergeImageNodesIntoGroup(draggedNode.id, target.id);');
    });

    it('快捷键窗口与 i18n 包含点选说明', () => {
        const html = read('../src/pages/canvas/index.html');
        const i18n = read('../src/shared/i18n/canvas-features.js');
        expect(html).toContain('data-i18n="smart.shortcutClickSelect"');
        expect(i18n).toMatch(/"smart\.shortcutClickSelect": \{ zh: "[^"]+", en: "[^"]+" \}/);
    });
});

describe('mergeBoxSelection / Ctrl+框选保留已有选择', () => {
    const load = () => {
        const sandbox = {};
        vm.createContext(sandbox);
        vm.runInContext(sliceBetween(stateSrc, 'function mergeBoxSelection(', 'function isMultiSelectModifier('), sandbox);
        return sandbox;
    };

    it('原有选择在前、框内新增在后', () => {
        const { mergeBoxSelection } = load();
        expect(mergeBoxSelection(['a', 'b'], ['c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
    });

    it('重叠的节点只保留一份', () => {
        const { mergeBoxSelection } = load();
        expect(mergeBoxSelection(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('没有基础选择时等同于框选结果（普通框选行为不变）', () => {
        const { mergeBoxSelection } = load();
        expect(mergeBoxSelection([], ['a', 'b'])).toEqual(['a', 'b']);
        expect(mergeBoxSelection(undefined, ['a'])).toEqual(['a']);
    });

    it('框内为空时保留原有选择（Ctrl+点击空白不会清空）', () => {
        const { mergeBoxSelection } = load();
        expect(mergeBoxSelection(['a', 'b'], [])).toEqual(['a', 'b']);
    });

    it('忽略空值，不修改入参', () => {
        const { mergeBoxSelection } = load();
        const base = ['a'];
        expect(mergeBoxSelection(base, ['', null, 'b'])).toEqual(['a', 'b']);
        expect(base).toEqual(['a']);
    });

    it('接线：按下时仅在 Ctrl/Cmd 下记录 baseIds，更新与结束都走 boxSelectionIds', () => {
        expect(mainSrc).toContain('const baseIds = isMultiSelectModifier(e) ? selectedNodeIds()');
        expect(mainSrc).toContain('startWorld:screenToWorld(e), baseIds}');
        expect((mainSrc.match(/boxSelectionIds\(selectionState,/g) || []).length).toBe(2);
        expect(mainSrc).not.toMatch(/selectedIds = nodesInSelectionBounds\(selectionState/);
    });

    it('快捷键窗口文案覆盖框选追加', () => {
        const i18n = read('../src/shared/i18n/canvas-features.js');
        expect(i18n).toContain('smart.shortcutClickSelect');
        expect(i18n).toMatch(/"smart\.shortcutAddBoxSelect": \{ zh: "[^"]+", en: "[^"]+" \}/);
        expect(read('../src/pages/canvas/index.html')).toContain('data-i18n="smart.shortcutAddBoxSelect"');
    });
});

describe('选中节点高亮与序号徽标', () => {
    const css = read('../src/styles/canvas.css');

    // 最小 DOM 桩：只实现 syncSelectionOrderBadges 用到的接口。
    function badgeContext(selectedIds, existingIds) {
        const els = new Map(existingIds.map(id => [id, { dataset: {}, removeAttribute(name) { if (name === 'data-select-order') delete this.dataset.selectOrder; } }]));
        const world = {
            querySelectorAll: () => [...els.values()].filter(el => el.dataset.selectOrder !== undefined),
            querySelector: sel => els.get(/data-id="([^"]+)"/.exec(sel)?.[1]) || null,
        };
        const sandbox = { world, selectedIds, CSS: { escape: v => v } };
        vm.createContext(sandbox);
        vm.runInContext(sliceBetween(mainSrc, 'function syncSelectionOrderBadges(', 'function syncSelectionUi('), sandbox);
        return { run: () => sandbox.syncSelectionOrderBadges(), order: id => els.get(id)?.dataset.selectOrder };
    }

    it('多选时按选择顺序标 1..N', () => {
        const ctx = badgeContext(['c', 'a', 'b'], ['a', 'b', 'c']);
        ctx.run();
        expect([ctx.order('c'), ctx.order('a'), ctx.order('b')]).toEqual(['1', '2', '3']);
    });

    it('单选或无选择时不显示序号', () => {
        const single = badgeContext(['a'], ['a']);
        single.run();
        expect(single.order('a')).toBeUndefined();
    });

    it('选择集合里已不存在的节点不占序号', () => {
        const ctx = badgeContext(['gone', 'a', 'b'], ['a', 'b']);
        ctx.run();
        expect([ctx.order('a'), ctx.order('b')]).toEqual(['1', '2']);
    });

    it('取消选择后旧序号被清除', () => {
        const ctx = badgeContext(['a', 'b'], ['a', 'b']);
        ctx.run();
        expect(ctx.order('a')).toBe('1');
        // 同一个桩上缩成单选，再同步
        const sandbox2 = badgeContext(['b'], ['a', 'b']);
        sandbox2.run();
        expect(sandbox2.order('a')).toBeUndefined();
    });

    it('syncSelectionUi 与 updateSelectionActions 都会刷新序号', () => {
        expect(sliceBetween(mainSrc, 'function syncSelectionUi(', '// Ctrl/Cmd+点击节点')).toContain('syncSelectionOrderBadges();');
        expect(sliceBetween(mainSrc, 'function updateSelectionActions(', 'function finishSelection(')).toContain('syncSelectionOrderBadges();');
    });

    it('样式：所有选中节点统一描边，多选时才显示序号徽标', () => {
        expect(css).toMatch(/\.image-node\.selected::after\s*\{[^}]*border:2px solid var\(--mf-select-ring\)/);
        expect(css).toMatch(/\.image-node\.selected\[data-select-order\]::before\s*\{[^}]*content:attr\(data-select-order\)/);
        expect(css).toContain('--mf-select-ring');
    });

    it('多选后整体外框退为虚线，框选进行中恢复实线', () => {
        expect(css).toMatch(/\.selection-box\.is-resting\s*\{[^}]*dashed/);
        expect(mainSrc).toContain("selectionBox.classList.toggle('is-resting', selectedEls.length >= 2);");
        expect(mainSrc).toContain("selectionBox.classList.remove('is-resting');");
    });
});
