// media-display.js 回归测试（M11）。
//
// 覆盖范围：
//   1. isVideoMediaItem / isAudioMediaItem / isTextMediaItem /
//      isFileMediaItem：按 kind 字段或 URL 后缀判定媒体子类型。
//   2. mediaKindForItem：综合上述判定函数得出最终媒体类型
//      （file > text > audio > video > image 优先级）。
//   3. mediaKindForFile：本地 File 对象（上传前）的媒体类型判定。
//   4. mediaKindForUrls：URL 列表的整体媒体类型判定。
//   5. looksLikeImageMediaUrl：图片 URL 识别（data URI / 常见图片后缀）。
//   6. imageRefsOnly / videoRefsOnly / audioRefsOnly：按类型过滤引用列表。
//   7. outputMediaKindForItem / defaultOutputExtForKind：生成结果的媒体
//      类型与默认扩展名映射。
//   8. resultMediaUrls：从各家 API 千奇百怪的返回结构里抽取统一的
//      {url, file_id, kind, name} 列表。
//   9. outputUrlLooksVideo：结果 URL 是否为视频文件。
//   10. safeExportFileName / fileNameFromUrl / fileIdFromUrl：文件名/
//       URL 相关的字符串处理。
//
// activateCanvasVideoPreview/renderCropBox 同类的 DOM 渲染/播放控制
// 函数、downloadPreviewFile 等直接触发浏览器下载的函数，跟 M5/M7/M8
// 核心批次一样不适合单元测试，不在本文件覆盖范围内。
import { describe, it, expect } from 'vitest';
import { createMediaDisplaySandbox } from './media-display-sandbox.js';

describe('媒体子类型判定（isVideoMediaItem 等）', () => {
    it('isVideoMediaItem：按 kind 字段或 URL 后缀判定', () => {
        const { isVideoMediaItem } = createMediaDisplaySandbox();
        expect(isVideoMediaItem({ kind: 'video' })).toBe(true);
        expect(isVideoMediaItem({ url: 'https://x.com/a.mp4' })).toBe(true);
        expect(isVideoMediaItem({ url: 'https://x.com/a.mp4?v=1' })).toBe(true);
        expect(isVideoMediaItem({ url: 'https://x.com/a.png' })).toBe(false);
        expect(isVideoMediaItem(null)).toBe(false);
    });

    it('isAudioMediaItem：按 kind 字段或 URL 后缀判定', () => {
        const { isAudioMediaItem } = createMediaDisplaySandbox();
        expect(isAudioMediaItem({ kind: 'audio' })).toBe(true);
        expect(isAudioMediaItem({ url: 'https://x.com/a.mp3' })).toBe(true);
        expect(isAudioMediaItem({ url: 'https://x.com/a.png' })).toBe(false);
    });

    it('isTextMediaItem：按 kind 字段或 URL 后缀判定', () => {
        const { isTextMediaItem } = createMediaDisplaySandbox();
        expect(isTextMediaItem({ kind: 'text' })).toBe(true);
        expect(isTextMediaItem({ url: 'https://x.com/a.srt' })).toBe(true);
        expect(isTextMediaItem({ url: 'https://x.com/a.png' })).toBe(false);
    });

    it('isFileMediaItem：按 kind 字段或 URL 后缀判定', () => {
        const { isFileMediaItem } = createMediaDisplaySandbox();
        expect(isFileMediaItem({ kind: 'file' })).toBe(true);
        expect(isFileMediaItem({ url: 'https://x.com/a.glb' })).toBe(true);
        expect(isFileMediaItem({ url: 'https://x.com/a.png' })).toBe(false);
    });
});

describe('mediaKindForItem', () => {
    it('按 file > text > audio > video > image 优先级判定', () => {
        const { mediaKindForItem } = createMediaDisplaySandbox();
        expect(mediaKindForItem({ kind: 'file' })).toBe('file');
        expect(mediaKindForItem({ kind: 'text' })).toBe('text');
        expect(mediaKindForItem({ kind: 'audio' })).toBe('audio');
        expect(mediaKindForItem({ kind: 'video' })).toBe('video');
        expect(mediaKindForItem({ url: 'https://x.com/a.png' })).toBe('image');
    });
});

describe('mediaKindForFile', () => {
    it('按 MIME type 前缀判定', () => {
        const { mediaKindForFile } = createMediaDisplaySandbox();
        expect(mediaKindForFile({ type: 'video/mp4', name: 'a.mp4' })).toBe('video');
        expect(mediaKindForFile({ type: 'audio/mpeg', name: 'a.mp3' })).toBe('audio');
        expect(mediaKindForFile({ type: 'text/plain', name: 'a.txt' })).toBe('text');
        expect(mediaKindForFile({ type: 'image/png', name: 'a.png' })).toBe('image');
    });

    it('MIME type 缺失时按文件名后缀判定', () => {
        const { mediaKindForFile } = createMediaDisplaySandbox();
        expect(mediaKindForFile({ name: 'clip.webm' })).toBe('video');
        expect(mediaKindForFile({ name: 'archive.zip' })).toBe('file');
        expect(mediaKindForFile({ name: 'model.glb' })).toBe('file');
    });

    it('无法判定时默认返回 image', () => {
        const { mediaKindForFile } = createMediaDisplaySandbox();
        expect(mediaKindForFile({ name: 'unknown.xyz' })).toBe('image');
        expect(mediaKindForFile(null)).toBe('image');
    });
});

describe('mediaKindForUrls', () => {
    it('按 file > video > audio > text 优先级判定整个列表', () => {
        const { mediaKindForUrls } = createMediaDisplaySandbox();
        expect(mediaKindForUrls(['https://x.com/a.png', 'https://x.com/b.mp4'])).toBe('video');
        expect(mediaKindForUrls(['https://x.com/a.zip'])).toBe('file');
    });

    it('空列表或全部识别为图片时返回 fallback（默认 image）', () => {
        const { mediaKindForUrls } = createMediaDisplaySandbox();
        expect(mediaKindForUrls([])).toBe('image');
        expect(mediaKindForUrls(['https://x.com/a.png'])).toBe('image');
    });
});

describe('looksLikeImageMediaUrl', () => {
    it('data:image/ URI 判定为图片', () => {
        const { looksLikeImageMediaUrl } = createMediaDisplaySandbox();
        expect(looksLikeImageMediaUrl('data:image/png;base64,abc')).toBe(true);
    });

    it('asset:// 协议判定为非图片', () => {
        const { looksLikeImageMediaUrl } = createMediaDisplaySandbox();
        expect(looksLikeImageMediaUrl('asset://foo')).toBe(false);
    });

    it('按常见图片后缀判定（忽略查询参数/锚点）', () => {
        const { looksLikeImageMediaUrl } = createMediaDisplaySandbox();
        expect(looksLikeImageMediaUrl('https://x.com/a.png?v=1')).toBe(true);
        expect(looksLikeImageMediaUrl('https://x.com/a.jpeg#frag')).toBe(true);
        expect(looksLikeImageMediaUrl('https://x.com/a.mp4')).toBe(false);
    });

    it('空字符串返回 false', () => {
        const { looksLikeImageMediaUrl } = createMediaDisplaySandbox();
        expect(looksLikeImageMediaUrl('')).toBe(false);
        expect(looksLikeImageMediaUrl(null)).toBe(false);
    });
});

describe('imageRefsOnly / videoRefsOnly / audioRefsOnly', () => {
    it('按媒体类型过滤引用列表', () => {
        const sandbox = createMediaDisplaySandbox();
        const refs = [
            { url: 'https://x.com/a.png' },
            { url: 'https://x.com/b.mp4' },
            { url: 'https://x.com/c.mp3' },
            { url: '' }, // 无 url，应被排除
        ];
        expect(sandbox.imageRefsOnly(refs).map(r => r.url)).toEqual(['https://x.com/a.png']);
        expect(sandbox.videoRefsOnly(refs).map(r => r.url)).toEqual(['https://x.com/b.mp4']);
        expect(sandbox.audioRefsOnly(refs).map(r => r.url)).toEqual(['https://x.com/c.mp3']);
    });

    it('videoRefsOnly 会排除看起来像图片 URL 的视频 kind 项（容错误标注场景）', () => {
        const { videoRefsOnly } = createMediaDisplaySandbox();
        const refs = [{ url: 'https://x.com/a.png', kind: 'video' }];
        expect(videoRefsOnly(refs)).toEqual([]);
    });
});

describe('outputMediaKindForItem / defaultOutputExtForKind', () => {
    it('outputMediaKindForItem 优先使用显式 kind/type/mediaKind 字段', () => {
        const { outputMediaKindForItem } = createMediaDisplaySandbox();
        expect(outputMediaKindForItem({ kind: 'video' })).toBe('video');
        expect(outputMediaKindForItem({ type: 'audio' })).toBe('audio');
        expect(outputMediaKindForItem('https://x.com/a.mp4')).toBe('video');
    });

    it('outputMediaKindForItem 没有显式字段时回退到 URL 后缀判定', () => {
        const { outputMediaKindForItem } = createMediaDisplaySandbox();
        expect(outputMediaKindForItem({ url: 'https://x.com/a.png' })).toBe('image');
    });

    it('defaultOutputExtForKind 按类型映射默认扩展名', () => {
        const { defaultOutputExtForKind } = createMediaDisplaySandbox();
        expect(defaultOutputExtForKind('image')).toBe('png');
        expect(defaultOutputExtForKind('video')).toBe('mp4');
        expect(defaultOutputExtForKind('audio')).toBe('mp3');
        expect(defaultOutputExtForKind('text')).toBe('txt');
        expect(defaultOutputExtForKind('file')).toBe('zip');
    });
});

describe('resultMediaUrls', () => {
    it('支持纯字符串 URL', () => {
        const { resultMediaUrls } = createMediaDisplaySandbox();
        expect(resultMediaUrls('https://x.com/a.png')).toEqual(['https://x.com/a.png']);
    });

    it('支持字符串数组', () => {
        const { resultMediaUrls } = createMediaDisplaySandbox();
        expect(resultMediaUrls(['https://x.com/a.png', 'https://x.com/b.png'])).toEqual([
            'https://x.com/a.png', 'https://x.com/b.png',
        ]);
    });

    it('支持嵌套对象结构（images/outputs 等常见字段名）', () => {
        const { resultMediaUrls } = createMediaDisplaySandbox();
        const result = { images: [{ url: 'https://x.com/a.png', file_id: 'f1' }] };
        expect(resultMediaUrls(result)).toEqual([{ url: 'https://x.com/a.png', file_id: 'f1', kind: '', name: '' }]);
    });

    it('去重同一 URL 时，字符串形式会被后续出现的对象形式覆盖（对象携带更多信息）', () => {
        const { resultMediaUrls } = createMediaDisplaySandbox();
        // 顶层 url 字段先被处理成字符串同源对象，images[].url 是同一个 url 但
        // 顶层没有 file_id；由于两者都是 object，去重逻辑保留先出现的一份。
        const result = {
            images: ['https://x.com/a.png', { url: 'https://x.com/a.png', file_id: 'f1' }],
        };
        const urls = resultMediaUrls(result);
        expect(urls).toHaveLength(1);
        expect(urls[0]).toMatchObject({ url: 'https://x.com/a.png', file_id: 'f1' });
    });

    it('空/无效输入返回空数组', () => {
        const { resultMediaUrls } = createMediaDisplaySandbox();
        expect(resultMediaUrls(null)).toEqual([]);
        expect(resultMediaUrls({})).toEqual([]);
    });
});

describe('outputUrlLooksVideo', () => {
    it('按常见视频后缀判定', () => {
        const { outputUrlLooksVideo } = createMediaDisplaySandbox();
        expect(outputUrlLooksVideo('https://x.com/a.mp4')).toBe(true);
        expect(outputUrlLooksVideo('https://x.com/a.mov?v=1')).toBe(true);
        expect(outputUrlLooksVideo('https://x.com/a.png')).toBe(false);
    });
});

describe('safeExportFileName', () => {
    it('替换文件名中的非法字符', () => {
        const { safeExportFileName } = createMediaDisplaySandbox();
        expect(safeExportFileName('a/b:c*d?e')).toBe('a_b_c_d_e');
    });

    it('空名称时使用 fallback', () => {
        const { safeExportFileName } = createMediaDisplaySandbox();
        expect(safeExportFileName('', 'default.zip')).toBe('default.zip');
        expect(safeExportFileName(null)).toBe('download.zip');
    });
});

describe('fileNameFromUrl', () => {
    it('从完整 URL 提取文件名', () => {
        const { fileNameFromUrl } = createMediaDisplaySandbox();
        expect(fileNameFromUrl('https://x.com/path/to/image.png?v=1')).toBe('image.png');
    });

    it('对无法解析为 URL 的字符串走兜底逻辑', () => {
        const { fileNameFromUrl } = createMediaDisplaySandbox();
        expect(fileNameFromUrl('relative/path/file.png?x=1#y')).toBe('file.png');
    });
});

describe('fileIdFromUrl', () => {
    it('从 /api/files/<id>/preview 或 /download 路径提取 file_id', () => {
        const { fileIdFromUrl } = createMediaDisplaySandbox();
        expect(fileIdFromUrl('/api/files/abc123/preview')).toBe('abc123');
        expect(fileIdFromUrl('/api/files/abc123/download?x=1')).toBe('abc123');
    });

    it('不匹配该路径格式时返回空字符串', () => {
        const { fileIdFromUrl } = createMediaDisplaySandbox();
        expect(fileIdFromUrl('https://x.com/a.png')).toBe('');
        expect(fileIdFromUrl('')).toBe('');
    });
});
