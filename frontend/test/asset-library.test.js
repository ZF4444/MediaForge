// asset-library.js 回归测试（M9）。
//
// 覆盖范围：
//   1. assetLibraries：无自定义资产库时回退到"默认资产库"。
//   2. activeAssetLibrary：按 activeAssetLibraryId 选中当前资产库，
//      找不到时回退到第一个。
//   3. assetCategories / activeAssetCategory：按类型过滤分类，
//      按 activeAssetCategoryId 选中当前分类。
//   4. assetCategoriesForLibrary：按资产库 id + 类型过滤分类。
//   5. assetMediaKind：按 kind/type 字段或 URL/文件名后缀判定媒体类型
//      （image/video/audio）。
//   6. canvasImageDragPayload：从节点图片构建拖拽 payload。
//
// renderAssetLibrary/bindAssetItemEvents/beginAssetInlineRename/
// openNodeAssetSaveModal 等函数强依赖真实 DOM 和网络请求，跟 M5/M7/M8
// 核心批次一样不适合单元测试，不在本文件覆盖范围内。
import { describe, it, expect } from 'vitest';
import { createAssetLibrarySandbox } from './asset-library-sandbox.js';

describe('assetLibraries', () => {
    it('没有自定义资产库时回退到默认资产库（携带旧版 categories）', () => {
        const { assetLibraries } = createAssetLibrarySandbox({
            assetLibrary: { libraries: [], categories: [{ id: 'c1', type: 'image' }] },
        });
        const libs = assetLibraries();
        expect(libs).toEqual([{ id: 'default', name: '默认资产库', categories: [{ id: 'c1', type: 'image' }] }]);
    });

    it('存在自定义资产库列表时直接返回', () => {
        const libs = [{ id: 'lib1', name: 'A' }, { id: 'lib2', name: 'B' }];
        const { assetLibraries } = createAssetLibrarySandbox({
            assetLibrary: { libraries: libs },
        });
        expect(assetLibraries()).toBe(libs);
    });
});

describe('activeAssetLibrary', () => {
    it('按 activeAssetLibraryId 找到对应资产库', () => {
        const { activeAssetLibrary } = createAssetLibrarySandbox({
            assetLibrary: { libraries: [{ id: 'lib1' }, { id: 'lib2' }] },
            activeAssetLibraryId: 'lib2',
        });
        expect(activeAssetLibrary()).toEqual({ id: 'lib2' });
    });

    it('activeAssetLibraryId 找不到对应项时回退到第一个', () => {
        const { activeAssetLibrary } = createAssetLibrarySandbox({
            assetLibrary: { libraries: [{ id: 'lib1' }, { id: 'lib2' }] },
            activeAssetLibraryId: 'missing',
        });
        expect(activeAssetLibrary()).toEqual({ id: 'lib1' });
    });
});

describe('assetCategories / activeAssetCategory', () => {
    it('assetCategories 按 type 过滤（默认 image，未标注 type 的视为 image）', () => {
        const { assetCategories } = createAssetLibrarySandbox({
            assetLibrary: {
                libraries: [{ id: 'lib1', categories: [
                    { id: 'c1' },
                    { id: 'c2', type: 'video' },
                    { id: 'c3', type: 'image' },
                ] }],
            },
            activeAssetLibraryId: 'lib1',
        });
        expect(assetCategories('image').map(c => c.id)).toEqual(['c1', 'c3']);
        expect(assetCategories('video').map(c => c.id)).toEqual(['c2']);
    });

    it('activeAssetCategory 按 activeAssetCategoryId 选中，找不到时回退到第一个', () => {
        const sandbox = createAssetLibrarySandbox({
            assetLibrary: {
                libraries: [{ id: 'lib1', categories: [{ id: 'c1' }, { id: 'c2' }] }],
            },
            activeAssetLibraryId: 'lib1',
            activeAssetCategoryId: 'c2',
        });
        expect(sandbox.activeAssetCategory()).toEqual({ id: 'c2' });

        const fallback = createAssetLibrarySandbox({
            assetLibrary: {
                libraries: [{ id: 'lib1', categories: [{ id: 'c1' }, { id: 'c2' }] }],
            },
            activeAssetLibraryId: 'lib1',
            activeAssetCategoryId: 'missing',
        });
        expect(fallback.activeAssetCategory()).toEqual({ id: 'c1' });
    });

    it('activeAssetCategory 没有任何分类时返回 null', () => {
        const { activeAssetCategory } = createAssetLibrarySandbox({
            assetLibrary: { libraries: [{ id: 'lib1', categories: [] }] },
            activeAssetLibraryId: 'lib1',
        });
        expect(activeAssetCategory()).toBe(null);
    });
});

describe('assetCategoriesForLibrary', () => {
    it('按资产库 id + 类型过滤分类', () => {
        const { assetCategoriesForLibrary } = createAssetLibrarySandbox({
            assetLibrary: {
                libraries: [
                    { id: 'lib1', categories: [{ id: 'c1', type: 'image' }, { id: 'c2', type: 'video' }] },
                    { id: 'lib2', categories: [{ id: 'c3', type: 'image' }] },
                ],
            },
        });
        expect(assetCategoriesForLibrary('lib1', 'image').map(c => c.id)).toEqual(['c1']);
        expect(assetCategoriesForLibrary('lib2', 'image').map(c => c.id)).toEqual(['c3']);
    });

    it('资产库 id 不存在时返回空数组', () => {
        const { assetCategoriesForLibrary } = createAssetLibrarySandbox({
            assetLibrary: { libraries: [{ id: 'lib1', categories: [] }] },
        });
        expect(assetCategoriesForLibrary('missing', 'image')).toEqual([]);
    });
});

describe('assetMediaKind', () => {
    it('item 为空时默认返回 image', () => {
        const { assetMediaKind } = createAssetLibrarySandbox();
        expect(assetMediaKind(null)).toBe('image');
        expect(assetMediaKind(undefined)).toBe('image');
    });

    it('kind/type 字段直接判定 video/audio', () => {
        const { assetMediaKind } = createAssetLibrarySandbox();
        expect(assetMediaKind({ kind: 'video' })).toBe('video');
        expect(assetMediaKind({ type: 'video' })).toBe('video');
        expect(assetMediaKind({ kind: 'audio' })).toBe('audio');
        expect(assetMediaKind({ type: 'audio' })).toBe('audio');
    });

    it('按 URL 后缀判定视频/音频类型', () => {
        const { assetMediaKind } = createAssetLibrarySandbox();
        expect(assetMediaKind({ url: 'https://x.com/a.mp4?v=1' })).toBe('video');
        expect(assetMediaKind({ url: 'https://x.com/a.webm' })).toBe('video');
        expect(assetMediaKind({ url: 'https://x.com/a.mp3' })).toBe('audio');
        expect(assetMediaKind({ url: 'https://x.com/a.flac' })).toBe('audio');
    });

    it('URL 无法判定时按文件名后缀判定', () => {
        const { assetMediaKind } = createAssetLibrarySandbox();
        expect(assetMediaKind({ url: 'https://x.com/blob', name: 'clip.mov' })).toBe('video');
        expect(assetMediaKind({ url: 'https://x.com/blob', name: 'song.ogg' })).toBe('audio');
    });

    it('无法判定视频/音频时默认返回 image', () => {
        const { assetMediaKind } = createAssetLibrarySandbox();
        expect(assetMediaKind({ url: 'https://x.com/a.png' })).toBe('image');
        expect(assetMediaKind({ url: 'https://x.com/a.jpg', name: 'photo.jpg' })).toBe('image');
    });

    it('优先使用 thumbnail 字段（无 url 时）', () => {
        const { assetMediaKind } = createAssetLibrarySandbox();
        expect(assetMediaKind({ thumbnail: 'https://x.com/a.mp4' })).toBe('video');
    });
});

describe('canvasImageDragPayload', () => {
    it('节点在指定索引没有图片时返回 null', () => {
        const { canvasImageDragPayload } = createAssetLibrarySandbox();
        expect(canvasImageDragPayload({ images: [] }, 0)).toBe(null);
        expect(canvasImageDragPayload(null, 0)).toBe(null);
    });

    it('构建拖拽 payload，缺失字段时使用合理默认值', () => {
        const { canvasImageDragPayload } = createAssetLibrarySandbox();
        const node = { title: 'MyNode', images: [{ url: 'https://x.com/a.png', file_id: 'f1' }] };
        expect(canvasImageDragPayload(node, 0)).toEqual({
            file_id: 'f1',
            url: 'https://x.com/a.png',
            name: 'MyNode',
            kind: 'image',
        });
    });

    it('图片缺少 kind 字段时通过 assetMediaKind 自动判定', () => {
        const { canvasImageDragPayload } = createAssetLibrarySandbox();
        const node = { images: [{ url: 'https://x.com/a.mp4', name: 'clip' }] };
        const payload = canvasImageDragPayload(node, 0);
        expect(payload.kind).toBe('video');
        expect(payload.name).toBe('clip');
    });
});
