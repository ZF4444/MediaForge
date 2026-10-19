// clipboard.js 回归测试。
//
// 核心约束：画布粘贴只取决于"此刻系统剪贴板里有什么"，不存在内部剪贴板与系统剪贴板
// 之间的"谁更新"的猜测。覆盖：
//   1. 纯函数：标记解析、MIME 映射、paste 事件文件提取
//   2. resolveCanvasPaste：粘贴内容的优先级
//   3. planCanvasPaste：节点副本、连线重映射
//   4. 复制 → 写入系统剪贴板标记 → 粘贴的完整往返，以及"复制后又在系统里复制别的"场景
//   5. 右键菜单粘贴（navigator.clipboard.read 可用 / 不可用）
import { describe, it, expect } from 'vitest';
import { createClipboardSandbox } from './clipboard-sandbox.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function makeNodes() {
    return [
        { id: 'a', type: 'smart-prompt', x: 100, y: 100, text: 'A' },
        { id: 'b', type: 'smart-image', x: 300, y: 100, inputNodeIds: ['a', 'up'] },
        { id: 'up', type: 'smart-prompt', x: 0, y: 0, text: 'upstream' },
    ];
}

// 模拟系统剪贴板：writeText 写入，read 读出；也可以模拟"用户在别处复制了东西"。
function makeSystemClipboard() {
    const store = { text: '', files: [] };
    return {
        store,
        api: {
            writeText: async (text) => { store.text = text; store.files = []; },
            read: async () => {
                const items = [];
                for (const f of store.files) {
                    items.push({ types: [f.type], getType: async () => ({ type: f.type, text: async () => '' }) });
                }
                if (store.text) {
                    items.push({ types: ['text/plain'], getType: async () => ({ type: 'text/plain', text: async () => store.text }) });
                }
                return items;
            },
        },
        copyExternalText(text) { store.text = text; store.files = []; },
        copyExternalImage() { store.text = ''; store.files = [{ type: 'image/png' }]; },
    };
}

function makeSandbox({ withRead = true, nodes = makeNodes(), selectedIds = [], selectedId = '', connections } = {}) {
    const clip = makeSystemClipboard();
    const navigator = { clipboard: withRead ? clip.api : { writeText: clip.api.writeText } };
    const sandbox = createClipboardSandbox({
        navigator,
        nodes,
        selectedId,
        selectedIds,
        canvas: { connections: connections ?? [{ from: 'up', to: 'b' }, { from: 'a', to: 'b' }, { from: 'b', to: 'zzz' }] },
        lastMouseWorld: { x: 400, y: 300 },
    });
    return { sandbox, clip, state: sandbox.__state };
}

describe('clipboardMediaExtension', () => {
    it('按已知 MIME 类型映射到对应扩展名', () => {
        const { clipboardMediaExtension } = createClipboardSandbox();
        expect(clipboardMediaExtension('image/png')).toBe('png');
        expect(clipboardMediaExtension('image/jpeg')).toBe('jpg');
        expect(clipboardMediaExtension('video/mp4')).toBe('mp4');
        expect(clipboardMediaExtension('audio/mpeg')).toBe('mp3');
        expect(clipboardMediaExtension('audio/x-wav')).toBe('wav');
    });

    it('大小写不敏感，未知类型回退为 bin', () => {
        const { clipboardMediaExtension } = createClipboardSandbox();
        expect(clipboardMediaExtension('IMAGE/PNG')).toBe('png');
        expect(clipboardMediaExtension('application/pdf')).toBe('bin');
        expect(clipboardMediaExtension(undefined)).toBe('bin');
    });
});

describe('canReadSystemClipboard', () => {
    it('navigator.clipboard.read 存在时返回 true', () => {
        expect(createClipboardSandbox({ navigator: { clipboard: { read: () => {} } } }).canReadSystemClipboard()).toBe(true);
    });

    it('不存在或 read 不是函数时返回 false', () => {
        expect(createClipboardSandbox({ navigator: {} }).canReadSystemClipboard()).toBe(false);
        expect(createClipboardSandbox({ navigator: { clipboard: {} } }).canReadSystemClipboard()).toBe(false);
        expect(createClipboardSandbox({ navigator: { clipboard: { read: 'x' } } }).canReadSystemClipboard()).toBe(false);
    });
});

describe('clipboardEventMediaFiles', () => {
    const makeItem = (kind, type, file) => ({ kind, type, getAsFile: () => file });

    it('优先从 items 里提取媒体文件', () => {
        const { clipboardEventMediaFiles } = createClipboardSandbox();
        const img = { type: 'image/png' };
        const result = clipboardEventMediaFiles({
            items: [makeItem('file', 'image/png', img), makeItem('string', 'text/plain', null)],
            files: [],
        });
        expect(result).toEqual([img]);
    });

    it('items 没有匹配项时回退到 files；非媒体文件被过滤', () => {
        const { clipboardEventMediaFiles } = createClipboardSandbox();
        const video = { type: 'video/mp4' };
        expect(clipboardEventMediaFiles({ items: [makeItem('string', 'text/plain', null)], files: [video] })).toEqual([video]);
        expect(clipboardEventMediaFiles({ items: [], files: [{ type: 'application/pdf', name: 'a.pdf' }] })).toEqual([]);
    });

    it('.txt 文件可以被粘贴（转提示词节点）', () => {
        const { clipboardEventMediaFiles } = createClipboardSandbox();
        const txt = { type: 'text/plain', name: 'p.txt' };
        expect(clipboardEventMediaFiles({ items: [], files: [txt] })).toEqual([txt]);
    });

    it('clipboardData 为空时返回空数组', () => {
        const { clipboardEventMediaFiles } = createClipboardSandbox();
        expect(clipboardEventMediaFiles(null)).toEqual([]);
        expect(clipboardEventMediaFiles(undefined)).toEqual([]);
    });
});

describe('parseCanvasClipboardToken', () => {
    it('能解析标记文本，大小写不敏感并统一为小写', () => {
        const { parseCanvasClipboardToken, canvasClipboardMarkerText } = createClipboardSandbox();
        const marker = canvasClipboardMarkerText(2, 'AbC123xyz9');
        expect(parseCanvasClipboardToken(marker)).toBe('abc123xyz9');
    });

    it('普通文本、空值、超长文本都不是标记', () => {
        const { parseCanvasClipboardToken } = createClipboardSandbox();
        expect(parseCanvasClipboardToken('hello')).toBe('');
        expect(parseCanvasClipboardToken('')).toBe('');
        expect(parseCanvasClipboardToken(null)).toBe('');
        // 用户复制的长文档里恰好含有标记字样，不应被当成画布剪贴板
        expect(parseCanvasClipboardToken('x'.repeat(400) + ' mediaforge-canvas://abcdef123456')).toBe('');
    });
});

describe('resolveCanvasPaste（粘贴优先级）', () => {
    const payload = { nodes: [{ id: 'a' }], connections: [] };
    const lookupOk = () => payload;
    const img = { type: 'image/png', name: 'x.png' };

    it('含画布标记时粘贴节点，即使同时有图片', () => {
        const { resolveCanvasPaste, canvasClipboardMarkerText } = createClipboardSandbox();
        const r = resolveCanvasPaste({ files: [img], text: canvasClipboardMarkerText(1, 'tok12345') }, lookupOk);
        expect(r.type).toBe('nodes');
        expect(r.payload).toBe(payload);
    });

    it('标记对应的数据已不存在 → stale，而不是退回去粘贴别的东西', () => {
        const { resolveCanvasPaste, canvasClipboardMarkerText } = createClipboardSandbox();
        const r = resolveCanvasPaste({ files: [], text: canvasClipboardMarkerText(1, 'tok12345') }, () => null);
        expect(r.type).toBe('stale');
    });

    it('没有标记时：图片 > 纯文本 > 空', () => {
        const { resolveCanvasPaste } = createClipboardSandbox();
        expect(resolveCanvasPaste({ files: [img], text: 'abc' }, lookupOk).type).toBe('media');
        expect(resolveCanvasPaste({ files: [], text: 'abc' }, lookupOk).type).toBe('text');
        expect(resolveCanvasPaste({ files: [], text: '   ' }, lookupOk).type).toBe('empty');
        expect(resolveCanvasPaste({ files: [{ type: 'application/pdf', name: 'a.pdf' }], text: '' }, lookupOk).type).toBe('empty');
        expect(resolveCanvasPaste(null, lookupOk).type).toBe('empty');
    });
});

describe('planCanvasPaste', () => {
    it('整体以选区中心对齐到粘贴点，保持相对位置', () => {
        const { sandbox } = makeSandbox();
        const payload = { nodes: [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 300, y: 200 }], connections: [] };
        const { copies } = sandbox.planCanvasPaste(payload, { x: 1000, y: 1000 }, new Set());
        // 中心 (200,150) → (1000,1000)
        expect(copies.map(c => [c.x, c.y])).toEqual([[900, 950], [1100, 1050]]);
        expect(copies.every(c => !['a', 'b'].includes(c.id))).toBe(true);
    });

    it('复制集内部的引用指向新副本，外部引用仅在节点仍存在时保留', () => {
        const { sandbox } = makeSandbox();
        const payload = {
            nodes: [
                { id: 'a', x: 0, y: 0 },
                { id: 'b', x: 10, y: 0, inputNodeIds: ['a', 'up', 'deleted'], sourceNodeId: 'deleted' },
            ],
            connections: [{ from: 'a', to: 'b' }, { from: 'up', to: 'b' }, { from: 'deleted', to: 'b' }],
        };
        const { copies, connections } = sandbox.planCanvasPaste(payload, { x: 0, y: 0 }, new Set(['up']));
        const [ca, cb] = copies;
        expect(Array.from(cb.inputNodeIds)).toEqual([ca.id, 'up']);
        expect(cb.sourceNodeId).toBeUndefined();
        expect(connections.map(c => [c.from, c.to])).toEqual([[ca.id, cb.id], ['up', cb.id]]);
    });
});

describe('复制 → 系统剪贴板 → 粘贴（核心场景）', () => {
    it('复制后系统剪贴板里只有标记文本，节点数据不放进剪贴板', async () => {
        const { sandbox, clip } = makeSandbox({ selectedId: 'a' });
        expect(await sandbox.copySelectedNodes()).toBe(true);
        expect(clip.store.text).toMatch(/mediaforge-canvas:\/\/[a-z0-9]+/);
        expect(clip.store.text).not.toContain('upstream');
    });

    it('画布里复制 → Ctrl+V 粘贴出刚复制的节点', async () => {
        const { sandbox, clip, state } = makeSandbox({ selectedIds: ['a', 'b'] });
        await sandbox.copySelectedNodes();
        const before = state.nodes.length;
        sandbox.pasteCanvasSnapshot({ files: [], text: clip.store.text });
        expect(state.nodes.length).toBe(before + 2);
        expect(state.selectedIds.length).toBe(2);
        // 只保留流入被复制节点的连线：up→b、a→b 都保留，b→zzz 不保留
        expect(state.canvas.connections.some(c => c.to === 'zzz' && c.from !== 'b')).toBe(false);
        expect(state.canvas.connections.length).toBe(3 + 2);
    });

    it('回归：系统里先复制了图片，再在画布复制节点 → 粘贴的是节点', async () => {
        const { sandbox, clip, state } = makeSandbox({ selectedId: 'a' });
        clip.copyExternalImage();
        await sandbox.copySelectedNodes();
        const snapshot = await sandbox.readSystemClipboardSnapshot();
        sandbox.pasteCanvasSnapshot(snapshot);
        expect(state.calls.handleFiles.length).toBe(0);
        expect(state.nodes.length).toBe(4);
    });

    it('回归：画布里复制节点后，在系统里复制了图片 → 粘贴的是图片，不是旧节点', async () => {
        const { sandbox, clip, state } = makeSandbox({ selectedId: 'a' });
        await sandbox.copySelectedNodes();
        clip.copyExternalImage();
        const snapshot = await sandbox.readSystemClipboardSnapshot();
        sandbox.pasteCanvasSnapshot(snapshot);
        expect(state.nodes.length).toBe(3);
        expect(state.calls.handleFiles.length).toBe(1);
    });

    it('回归：画布里复制节点后，在系统里复制了文字 → 粘贴出提示词节点', async () => {
        const { sandbox, clip, state } = makeSandbox({ selectedId: 'a' });
        await sandbox.copySelectedNodes();
        clip.copyExternalText('你好，世界');
        sandbox.pasteCanvasSnapshot(await sandbox.readSystemClipboardSnapshot());
        expect(state.nodes.length).toBe(3);
        expect(state.calls.createPromptNode.length).toBe(1);
        expect(state.calls.createPromptNode[0].opts.text).toBe('你好，世界');
    });

    it('同一份复制可以连续粘贴多次', async () => {
        const { sandbox, clip, state } = makeSandbox({ selectedId: 'a' });
        await sandbox.copySelectedNodes();
        sandbox.pasteCanvasSnapshot({ files: [], text: clip.store.text });
        sandbox.pasteCanvasSnapshot({ files: [], text: clip.store.text });
        expect(state.nodes.length).toBe(5);
    });

    it('没有选中节点时不复制，也不改动系统剪贴板', async () => {
        const { sandbox, clip } = makeSandbox();
        clip.copyExternalText('keep me');
        expect(await sandbox.copySelectedNodes()).toBe(false);
        expect(clip.store.text).toBe('keep me');
    });

    it('写入系统剪贴板失败时提示并清理存储', async () => {
        const { sandbox, state } = makeSandbox({ selectedId: 'a' });
        sandbox.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
        sandbox.document.execCommand = () => false;
        sandbox.document.createElement = () => ({ style: {}, setAttribute() {}, focus() {}, select() {} });
        sandbox.document.body = { appendChild() {}, removeChild() {} };
        expect(await sandbox.copySelectedNodes()).toBe(false);
        expect(state.toasts.some(t => t.includes('复制失败'))).toBe(true);
    });

    it('标记存在但数据丢失（如换了浏览器）→ 提示失效，不生成任何内容', async () => {
        const { sandbox, state } = makeSandbox();
        const r = sandbox.pasteCanvasSnapshot({ files: [], text: 'mediaforge-canvas://deadbeef01' });
        expect(r).toBe(false);
        expect(state.nodes.length).toBe(3);
        expect(state.toasts.at(-1)).toContain('已失效');
    });

    it('localStorage 不可用时同页内仍可复制粘贴', async () => {
        const clip = makeSystemClipboard();
        const sandbox = createClipboardSandbox({
            navigator: { clipboard: clip.api }, localStorage: null, nodes: makeNodes(), selectedId: 'a',
            canvas: { connections: [] }, lastMouseWorld: { x: 1, y: 1 },
        });
        await sandbox.copySelectedNodes();
        sandbox.pasteCanvasSnapshot({ files: [], text: clip.store.text });
        expect(sandbox.__state.nodes.length).toBe(4);
    });

    it('每次复制只保留最新一份存储', async () => {
        const storage = (await import('./clipboard-sandbox.js')).createMemoryStorage();
        const clip = makeSystemClipboard();
        const sandbox = createClipboardSandbox({
            navigator: { clipboard: clip.api }, localStorage: storage, nodes: makeNodes(), selectedId: 'a',
            canvas: { connections: [] },
        });
        await sandbox.copySelectedNodes();
        await sandbox.copySelectedNodes();
        await sandbox.copySelectedNodes();
        expect(storage._map.size).toBe(1);
    });
});

describe('粘贴位置', () => {
    it('右键粘贴使用右键时记录的位置', async () => {
        const { sandbox, clip, state } = makeSandbox({ selectedId: 'a' });
        await sandbox.copySelectedNodes();
        state.nodes.splice(0, state.nodes.length, ...state.nodes); // no-op，保持引用
        await sandbox.pasteFromContextMenu({ x: 700, y: 650 });
        const pasted = state.nodes.at(-1);
        // 单节点：中心对齐到 (700,650)
        expect([pasted.x, pasted.y]).toEqual([700, 650]);
    });

    it('Ctrl+V 使用鼠标位置；鼠标在可视区外时用视口中心', async () => {
        const { sandbox, clip, state } = makeSandbox({ selectedId: 'a' });
        await sandbox.copySelectedNodes();
        sandbox.pasteCanvasSnapshot({ files: [], text: clip.store.text });
        expect([state.nodes.at(-1).x, state.nodes.at(-1).y]).toEqual([400, 300]);
        state.lastMouseWorld = { x: 99999, y: 99999 };
        sandbox.pasteCanvasSnapshot({ files: [], text: clip.store.text });
        expect([state.nodes.at(-1).x, state.nodes.at(-1).y]).toEqual([500, 400]);
    });
});

describe('右键菜单粘贴', () => {
    it('可读系统剪贴板时与 Ctrl+V 行为一致：画布标记 → 节点', async () => {
        const { sandbox, state } = makeSandbox({ selectedId: 'a' });
        await sandbox.copySelectedNodes();
        await sandbox.pasteFromContextMenu({ x: 10, y: 10 });
        expect(state.nodes.length).toBe(4);
    });

    it('可读系统剪贴板时：系统图片 → 在右键位置新建媒体节点', async () => {
        const { sandbox, clip, state } = makeSandbox();
        clip.copyExternalImage();
        await sandbox.pasteFromContextMenu({ x: 10, y: 20 }, { forceNew: true });
        expect(state.calls.handleFiles.length).toBe(1);
        const call = state.calls.handleFiles[0];
        expect(call.opts.point).toEqual({ x: 10, y: 20 });
        expect(call.opts.forceNew).toBe(true);
    });

    it('读取被拒绝/不可用，且本页复制后系统剪贴板未被覆盖 → 直接粘贴刚复制的节点', async () => {
        const { sandbox, state } = makeSandbox({ withRead: false, selectedId: 'a' });
        await sandbox.copySelectedNodes();
        await sandbox.pasteFromContextMenu({ x: 5, y: 5 });
        expect(state.nodes.length).toBe(4);
    });

    it('读取不可用，且复制后失焦（可能在别处复制过）→ 不猜测，提示按 Ctrl+V', async () => {
        const { sandbox, state } = makeSandbox({ withRead: false, selectedId: 'a' });
        await sandbox.copySelectedNodes();
        sandbox.invalidateOwnedCanvasClipboard();
        const r = await sandbox.pasteFromContextMenu({ x: 5, y: 5 });
        expect(r).toBe(false);
        expect(state.nodes.length).toBe(3);
        expect(state.toasts.at(-1)).toContain('Ctrl+V');
    });

    it('提示文案区分 HTTP 非安全上下文与权限被拒绝，且不含会触发红色告警的字样', async () => {
        const insecure = makeSandbox({ withRead: false });
        insecure.sandbox.window.isSecureContext = false;
        await insecure.sandbox.pasteFromContextMenu({ x: 1, y: 1 });
        expect(insecure.state.toasts.at(-1)).toContain('HTTP');
        expect(insecure.state.toasts.at(-1)).toContain('Ctrl+V');

        const denied = makeSandbox();
        denied.sandbox.navigator.clipboard.read = async () => { throw new Error('NotAllowedError'); };
        await denied.sandbox.pasteFromContextMenu({ x: 1, y: 1 });
        expect(denied.state.toasts.at(-1)).toContain('权限被拒绝');

        const alertWords = /失败|错误|异常|缺少|请输入|请选择|请先|没有|无法|不能|不支持|超时|未|fail|error|need|required|invalid/i;
        expect(alertWords.test(insecure.state.toasts.at(-1))).toBe(false);
        expect(alertWords.test(denied.state.toasts.at(-1))).toBe(false);
    });

    it('读取不可用后按 Ctrl+V，会粘贴到右键时记录的位置', async () => {
        const { sandbox, clip, state } = makeSandbox({ withRead: false, selectedId: 'a' });
        await sandbox.copySelectedNodes();
        sandbox.invalidateOwnedCanvasClipboard();
        await sandbox.pasteFromContextMenu({ x: 222, y: 333 });
        sandbox.pasteCanvasSnapshot({ files: [], text: clip.store.text });
        const pasted = state.nodes.at(-1);
        expect([pasted.x, pasted.y]).toEqual([222, 333]);
    });

    it('剪贴板为空 → 提示没有可粘贴的内容', async () => {
        const { sandbox, state } = makeSandbox();
        await sandbox.pasteFromContextMenu({ x: 0, y: 0 });
        expect(state.toasts.at(-1)).toContain('没有可粘贴');
    });
});

describe('handleCanvasPasteEvent', () => {
    function makeEvent(data) {
        const ev = {
            target: {},
            prevented: false,
            clipboardData: {
                items: [], files: data.files || [],
                getData: (t) => (t === 'text/plain' ? (data.text || '') : ''),
            },
            preventDefault() { ev.prevented = true; },
            stopPropagation() {},
        };
        return ev;
    }

    it('画布聚焦时：接管事件并粘贴系统剪贴板中的内容', async () => {
        const { sandbox, clip, state } = makeSandbox({ selectedId: 'a' });
        await sandbox.copySelectedNodes();
        const ev = makeEvent({ text: clip.store.text });
        sandbox.handleCanvasPasteEvent(ev);
        expect(ev.prevented).toBe(true);
        expect(state.nodes.length).toBe(4);
    });

    it('输入框聚焦时：不生成节点，也不会把画布标记插进输入框', async () => {
        const { sandbox, state } = makeSandbox({ selectedId: 'a' });
        const input = { matches: () => true, value: '', setRangeText: () => { throw new Error('should not insert'); }, dispatchEvent() {} };
        sandbox.isEditableTarget = () => true;
        const ev = makeEvent({ text: 'mediaforge-canvas://abc12345' });
        ev.target = { closest: () => input };
        sandbox.handleCanvasPasteEvent(ev);
        expect(state.nodes.length).toBe(3);
    });

    it('启动加载中：拦截粘贴', () => {
        const { sandbox, state } = makeSandbox();
        sandbox.isBootLoadingActive = () => true;
        const ev = makeEvent({ text: 'hello' });
        sandbox.handleCanvasPasteEvent(ev);
        expect(ev.prevented).toBe(true);
        expect(state.calls.createPromptNode.length).toBe(0);
    });
});
