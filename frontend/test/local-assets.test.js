import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { createLocalAssetsSandbox } from './local-assets-sandbox.js';

function run(ctx, expr) {
    return vm.runInContext(expr, ctx);
}

describe('isLocalMediaFile', () => {
    it('按 MIME type 前缀识别图片/视频/音频', () => {
        const ctx = createLocalAssetsSandbox();
        expect(run(ctx, "isLocalMediaFile({type:'image/png', name:'x'})")).toBe(true);
        expect(run(ctx, "isLocalMediaFile({type:'video/mp4', name:'x'})")).toBe(true);
        expect(run(ctx, "isLocalMediaFile({type:'audio/mpeg', name:'x'})")).toBe(true);
    });

    it('MIME type 缺失或不匹配时按文件名后缀兜底判断', () => {
        const ctx = createLocalAssetsSandbox();
        expect(run(ctx, "isLocalMediaFile({type:'', name:'photo.png'})")).toBe(true);
        expect(run(ctx, "isLocalMediaFile({type:'application/octet-stream', name:'clip.mp4'})")).toBe(true);
        expect(run(ctx, "isLocalMediaFile({type:'', name:'doc.pdf'})")).toBe(false);
    });

    it('空文件返回 false', () => {
        const ctx = createLocalAssetsSandbox();
        expect(run(ctx, 'isLocalMediaFile(null)')).toBe(false);
    });
});

describe('localItemKind', () => {
    it('item 自带 kind 时直接使用', () => {
        const ctx = createLocalAssetsSandbox();
        expect(run(ctx, "localItemKind({kind:'video', name:'x.png'})")).toBe('video');
    });

    it('没有 kind 时按文件名后缀判断，默认 image', () => {
        const ctx = createLocalAssetsSandbox();
        expect(run(ctx, "localItemKind({name:'clip.mp4'})")).toBe('video');
        expect(run(ctx, "localItemKind({name:'song.mp3'})")).toBe('audio');
        expect(run(ctx, "localItemKind({name:'pic.png'})")).toBe('image');
        expect(run(ctx, "localItemKind({name:'unknown.xyz'})")).toBe('image');
    });
});

describe('localObjectUrl', () => {
    it('直接返回 item.url', () => {
        const ctx = createLocalAssetsSandbox();
        expect(run(ctx, "localObjectUrl({url:'/foo/bar.png'})")).toBe('/foo/bar.png');
    });

    it('没有 url 时返回空字符串', () => {
        const ctx = createLocalAssetsSandbox();
        expect(run(ctx, 'localObjectUrl({})')).toBe('');
        expect(run(ctx, 'localObjectUrl(null)')).toBe('');
    });
});

describe('localFolderId / localChildPath', () => {
    it('localFolderId 空路径映射为 __root__', () => {
        const ctx = createLocalAssetsSandbox();
        expect(run(ctx, "localFolderId('')")).toBe('__root__');
        expect(run(ctx, "localFolderId('sub/dir')")).toBe('sub/dir');
    });

    it('localChildPath 拼接父路径和子名称', () => {
        const ctx = createLocalAssetsSandbox();
        expect(run(ctx, "localChildPath('parent', 'child')")).toBe('parent/child');
        expect(run(ctx, "localChildPath('', 'child')")).toBe('child');
    });
});

describe('localFolderTotal', () => {
    it('递归统计文件夹及其子文件夹的素材总数', () => {
        const ctx = createLocalAssetsSandbox();
        const folder = {
            items: [{ id: '1' }, { id: '2' }],
            children: [
                { items: [{ id: '3' }], children: [] },
                { items: [{ id: '4' }, { id: '5' }], children: [{ items: [{ id: '6' }], children: [] }] },
            ],
        };
        expect(run(ctx, `localFolderTotal(${JSON.stringify(folder)})`)).toBe(6);
    });

    it('空文件夹返回 0', () => {
        const ctx = createLocalAssetsSandbox();
        expect(run(ctx, 'localFolderTotal(null)')).toBe(0);
        expect(run(ctx, 'localFolderTotal({})')).toBe(0);
    });
});

describe('findLocalItem', () => {
    it('从 localItemMap 中按 id 查找', () => {
        const localItemMap = new Map([['a', { id: 'a', name: 'A' }]]);
        const ctx = createLocalAssetsSandbox({ localItemMap });
        expect(run(ctx, "JSON.stringify(findLocalItem('a'))")).toBe(JSON.stringify({ id: 'a', name: 'A' }));
    });

    it('找不到返回 null', () => {
        const ctx = createLocalAssetsSandbox({ localItemMap: new Map() });
        expect(run(ctx, "findLocalItem('missing')")).toBeNull();
    });
});

describe('indexSharedTree', () => {
    it('递归把文件夹树的所有节点/素材注册进 Map', () => {
        const localFolderMap = new Map();
        const localItemMap = new Map();
        const ctx = createLocalAssetsSandbox({ localFolderMap, localItemMap });
        const tree = {
            id: 'root',
            items: [{ id: 'item1' }],
            children: [
                { id: 'child1', items: [{ id: 'item2' }], children: [] },
            ],
        };
        run(ctx, `indexSharedTree(${JSON.stringify(tree)})`);
        expect(run(ctx, "localFolderMap.has('root')")).toBe(true);
        expect(run(ctx, "localFolderMap.has('child1')")).toBe(true);
        expect(run(ctx, "localItemMap.has('item1')")).toBe(true);
        expect(run(ctx, "localItemMap.has('item2')")).toBe(true);
    });

    it('null 节点安全跳过', () => {
        const ctx = createLocalAssetsSandbox();
        expect(() => run(ctx, 'indexSharedTree(null)')).not.toThrow();
    });
});
