// upload.js 回归测试（M6）。
//
// 覆盖范围（拖拽数据解析 + 文件上传的纯逻辑部分；真正发起网络请求/DOM
// 交互的部分用最小化 mock，见 upload-sandbox.js）：
//   1. isSupportedUploadFile：按 MIME 类型/文件名后缀判断是否支持上传。
//   2. uploadTitleForItems：按素材类型组合生成默认标题。
//   3. smartDropDataTypes / readSmartDropData / decodeSmartDropText：
//      拖拽事件数据的基础读取与解码。
//   4. isRemoteSmartImageDropValue / isLocalSmartImageDropValue：
//      区分远程 URL / 本地文件路径两种拖拽来源。
//   5. smartImageDropPayload：按优先级（文件 > 本地路径 > 远程 URL）
//      归纳拖拽内容类型。
//   6. hasSmartAssetDrag / hasMediaDrawerDrag / hasSmartInputThumbDrag：
//      按自定义 dataTransfer type 识别内部拖拽来源。
//   7. appendImagesToSmartNode：把上传结果追加到目标节点（含新建节点/
//      追加到已有分组节点两种路径）。
import { describe, it, expect, vi } from 'vitest';
import { createUploadSandbox } from './upload-sandbox.js';

describe('isSupportedUploadFile', () => {
    it('按 MIME 类型判断图片/视频/音频均支持', () => {
        const sandbox = createUploadSandbox();
        expect(sandbox.isSupportedUploadFile({ type: 'image/png', name: 'a.png' })).toBe(true);
        expect(sandbox.isSupportedUploadFile({ type: 'video/mp4', name: 'a.mp4' })).toBe(true);
        expect(sandbox.isSupportedUploadFile({ type: 'audio/mpeg', name: 'a.mp3' })).toBe(true);
    });

    it('MIME 类型缺失时按文件名后缀兜底判断', () => {
        const sandbox = createUploadSandbox();
        expect(sandbox.isSupportedUploadFile({ type: '', name: 'photo.JPG' })).toBe(true);
        expect(sandbox.isSupportedUploadFile({ type: '', name: 'clip.webm' })).toBe(true);
        expect(sandbox.isSupportedUploadFile({ type: '', name: 'doc.pdf' })).toBe(false);
    });

    it('不支持的类型/无文件信息返回 false', () => {
        const sandbox = createUploadSandbox();
        expect(sandbox.isSupportedUploadFile({ type: 'application/pdf', name: 'a.pdf' })).toBe(false);
        expect(sandbox.isSupportedUploadFile(null)).toBe(false);
    });
});

describe('uploadTitleForItems', () => {
    it('单张图片返回 Image，多张返回 Group', () => {
        const sandbox = createUploadSandbox({
            fns: { mediaKindForItem: () => 'image' },
        });
        expect(sandbox.uploadTitleForItems([{ kind: 'image' }])).toBe('Image');
        expect(sandbox.uploadTitleForItems([{ kind: 'image' }, { kind: 'image' }])).toBe('Group');
    });

    it('混合媒体类型返回 Media（多个）或 fallback（单个）', () => {
        const sandbox = createUploadSandbox({
            fns: { mediaKindForItem: (item) => item.kind },
        });
        expect(sandbox.uploadTitleForItems([{ kind: 'image' }, { kind: 'video' }])).toBe('Media');
    });

    it('全部为视频返回 Video/Videos，全部音频返回 Audio', () => {
        const sandbox = createUploadSandbox({
            fns: { mediaKindForItem: (item) => item.kind },
        });
        expect(sandbox.uploadTitleForItems([{ kind: 'video' }])).toBe('Video');
        expect(sandbox.uploadTitleForItems([{ kind: 'video' }, { kind: 'video' }])).toBe('Videos');
        expect(sandbox.uploadTitleForItems([{ kind: 'audio' }, { kind: 'audio' }])).toBe('Audio');
    });

    it('空列表返回 fallback', () => {
        const sandbox = createUploadSandbox();
        expect(sandbox.uploadTitleForItems([], 'MyFallback')).toBe('MyFallback');
    });
});

describe('smartDropDataTypes / readSmartDropData / decodeSmartDropText', () => {
    it('smartDropDataTypes 返回 dataTransfer.types 的字符串数组', () => {
        const sandbox = createUploadSandbox();
        const dt = sandbox.__makeDataTransfer({ types: ['text/plain', 'text/html'] });
        expect(sandbox.smartDropDataTypes(dt)).toEqual(['text/plain', 'text/html']);
    });

    it('readSmartDropData 读取指定 type 的数据，异常时返回空字符串', () => {
        const sandbox = createUploadSandbox();
        const dt = sandbox.__makeDataTransfer({ data: { 'text/plain': 'hello' } });
        expect(sandbox.readSmartDropData(dt, 'text/plain')).toBe('hello');
        expect(sandbox.readSmartDropData(null, 'text/plain')).toBe('');
    });

    it('decodeSmartDropText 解码 URI 编码文本，失败时原样返回', () => {
        const sandbox = createUploadSandbox();
        expect(sandbox.decodeSmartDropText('hello%20world')).toBe('hello world');
        expect(sandbox.decodeSmartDropText('')).toBe('');
    });
});

describe('isRemoteSmartImageDropValue / isLocalSmartImageDropValue', () => {
    it('识别 http(s)/data:/blob: 为远程值', () => {
        const sandbox = createUploadSandbox();
        expect(sandbox.isRemoteSmartImageDropValue('https://example.com/a.png')).toBe(true);
        expect(sandbox.isRemoteSmartImageDropValue('data:image/png;base64,xxx')).toBe(true);
        expect(sandbox.isRemoteSmartImageDropValue('blob:http://x/1')).toBe(true);
        expect(sandbox.isRemoteSmartImageDropValue('/local/path.png')).toBe(false);
    });

    it('识别 Windows/POSIX 本地路径（且必须是受支持的图片后缀）', () => {
        const sandbox = createUploadSandbox();
        expect(sandbox.isLocalSmartImageDropValue('/Users/a/photo.png')).toBe(true);
        expect(sandbox.isLocalSmartImageDropValue('C:\\Users\\a\\photo.jpg')).toBe(true);
        expect(sandbox.isLocalSmartImageDropValue('/Users/a/document.pdf')).toBe(false);
        expect(sandbox.isLocalSmartImageDropValue('https://example.com/a.png')).toBe(false);
    });

    it('file:// URL 会被解析为本地路径', () => {
        const sandbox = createUploadSandbox();
        expect(sandbox.isLocalSmartImageDropValue('file:///Users/a/photo.png')).toBe(true);
    });

    it('空值/非法值返回 false', () => {
        const sandbox = createUploadSandbox();
        expect(sandbox.isRemoteSmartImageDropValue('')).toBe(false);
        expect(sandbox.isLocalSmartImageDropValue('')).toBe(false);
        expect(sandbox.isLocalSmartImageDropValue(null)).toBe(false);
    });
});

describe('smartImageDropPayload', () => {
    it('有文件时优先返回 files 类型', () => {
        const sandbox = createUploadSandbox();
        const file = new sandbox.File([], 'a.png', { type: 'image/png' });
        const dt = sandbox.__makeDataTransfer({ files: [file] });
        const payload = sandbox.smartImageDropPayload(dt);
        expect(payload.type).toBe('files');
        expect(payload.files).toHaveLength(1);
    });

    it('没有文件但有本地路径文本时返回 localPaths 类型', () => {
        const sandbox = createUploadSandbox();
        const dt = sandbox.__makeDataTransfer({
            types: ['text/plain'],
            data: { 'text/plain': '/Users/a/photo.png' },
        });
        const payload = sandbox.smartImageDropPayload(dt);
        expect(payload.type).toBe('localPaths');
        expect(payload.localPaths).toEqual(['/Users/a/photo.png']);
    });

    it('没有文件/本地路径但有远程 URL 时返回 url 类型', () => {
        const sandbox = createUploadSandbox();
        const dt = sandbox.__makeDataTransfer({
            types: ['text/plain'],
            data: { 'text/plain': 'https://example.com/a.png' },
        });
        const payload = sandbox.smartImageDropPayload(dt);
        expect(payload.type).toBe('url');
        expect(payload.url).toBe('https://example.com/a.png');
    });

    it('什么都没有时返回 none 类型', () => {
        const sandbox = createUploadSandbox();
        const dt = sandbox.__makeDataTransfer({});
        expect(sandbox.smartImageDropPayload(dt).type).toBe('none');
    });
});

describe('hasSmartAssetDrag / hasMediaDrawerDrag / hasSmartInputThumbDrag', () => {
    it('按自定义 dataTransfer type 识别内部拖拽来源', () => {
        const sandbox = createUploadSandbox();
        const assetDt = sandbox.__makeDataTransfer({ types: ['application/x-smart-asset'] });
        const thumbDt = sandbox.__makeDataTransfer({ types: ['application/x-smart-input-thumb'] });
        const plainDt = sandbox.__makeDataTransfer({ types: ['text/plain'] });

        expect(sandbox.hasSmartAssetDrag(assetDt)).toBe(true);
        expect(sandbox.hasMediaDrawerDrag(assetDt)).toBe(true);
        expect(sandbox.hasSmartInputThumbDrag(thumbDt)).toBe(true);
        expect(sandbox.hasSmartAssetDrag(plainDt)).toBe(false);
        expect(sandbox.hasSmartInputThumbDrag(plainDt)).toBe(false);
    });
});

describe('appendImagesToSmartNode', () => {
    it('追加到已有的 smart-group 节点：合并图片、重新排布、选中该节点', () => {
        const groupNode = { id: 'g1', type: 'smart-group', images: [] };
        const arrangeSpy = vi.fn();
        const renderSpy = vi.fn();
        const saveSpy = vi.fn();
        const sandbox = createUploadSandbox({
            nodes: [groupNode],
            fns: {
                isSmartGroupNode: (n) => n?.type === 'smart-group',
                arrangeSmartGroupMembers: arrangeSpy,
                render: renderSpy,
                scheduleSave: saveSpy,
            },
        });
        sandbox.appendImagesToSmartNode([{ url: 'a.png', kind: 'image' }], 'g1');
        expect(groupNode.images).toHaveLength(1);
        expect(arrangeSpy).toHaveBeenCalledWith(groupNode, { skipUndo: true });
        expect(sandbox.selectedId).toBe('g1');
        expect(renderSpy).toHaveBeenCalled();
        expect(saveSpy).toHaveBeenCalled();
    });

    it('没有目标节点时创建新的图片节点', () => {
        const createSpy = vi.fn((point, images, opts) => ({ id: 'created', type: opts.type, images: [] }));
        const sandbox = createUploadSandbox({
            nodes: [],
            fns: { createImageNodeAt: createSpy },
        });
        sandbox.appendImagesToSmartNode([{ url: 'a.png', kind: 'image' }], '');
        expect(createSpy).toHaveBeenCalled();
        expect(sandbox.selectedId).toBe('created');
    });

    it('没有任何有效 url 的上传结果时不做任何操作', () => {
        const renderSpy = vi.fn();
        const sandbox = createUploadSandbox({ fns: { render: renderSpy } });
        sandbox.appendImagesToSmartNode([{ url: '' }, {}], 'missing');
        expect(renderSpy).not.toHaveBeenCalled();
    });

    it('多图追加会设置分组标题与默认缩放', () => {
        const node = { id: 'n1', type: 'smart-image', images: [{ url: 'old.png' }] };
        const sandbox = createUploadSandbox({ nodes: [node] });
        sandbox.appendImagesToSmartNode([{ url: 'a.png', kind: 'image' }], 'n1');
        expect(node.images).toHaveLength(2);
        expect(node.title).toBe('Group');
        expect(node.scale).toBe(0.8);
    });
});
