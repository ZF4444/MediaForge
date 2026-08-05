// clipboard.js 回归测试（M13）。
//
// 覆盖范围：
//   1. clipboardMediaExtension：MIME 类型到文件扩展名的映射表。
//   2. canReadSystemClipboard：浏览器是否支持主动读取系统剪贴板。
//   3. clipboardEventMediaFiles：从 paste 事件的 clipboardData 里提取
//      媒体文件（优先 items，为空才回退到 files，避免同一次粘贴的
//      两路数据都取导致重复）。
//
// copySelectedNodes/pasteNodes/pasteFromContextMenu 等函数强依赖真实
// DOM/node 全局状态/navigator.clipboard 异步 API，跟 M5/M7/M8 核心批次
// 一样不适合单元测试，不在本文件覆盖范围内。
import { describe, it, expect } from 'vitest';
import { createClipboardSandbox } from './clipboard-sandbox.js';

describe('clipboardMediaExtension', () => {
    it('按已知 MIME 类型映射到对应扩展名', () => {
        const { clipboardMediaExtension } = createClipboardSandbox();
        expect(clipboardMediaExtension('image/png')).toBe('png');
        expect(clipboardMediaExtension('image/jpeg')).toBe('jpg');
        expect(clipboardMediaExtension('video/mp4')).toBe('mp4');
        expect(clipboardMediaExtension('audio/mpeg')).toBe('mp3');
        expect(clipboardMediaExtension('audio/x-wav')).toBe('wav');
    });

    it('大小写不敏感', () => {
        const { clipboardMediaExtension } = createClipboardSandbox();
        expect(clipboardMediaExtension('IMAGE/PNG')).toBe('png');
    });

    it('未知类型回退为 bin', () => {
        const { clipboardMediaExtension } = createClipboardSandbox();
        expect(clipboardMediaExtension('application/pdf')).toBe('bin');
        expect(clipboardMediaExtension('')).toBe('bin');
        expect(clipboardMediaExtension(undefined)).toBe('bin');
    });
});

describe('canReadSystemClipboard', () => {
    it('navigator.clipboard.read 存在时返回 true', () => {
        const { canReadSystemClipboard } = createClipboardSandbox({
            navigator: { clipboard: { read: () => {} } },
        });
        expect(canReadSystemClipboard()).toBe(true);
    });

    it('navigator.clipboard 不存在或 read 不是函数时返回 false', () => {
        expect(createClipboardSandbox({ navigator: {} }).canReadSystemClipboard()).toBe(false);
        expect(createClipboardSandbox({ navigator: { clipboard: {} } }).canReadSystemClipboard()).toBe(false);
        expect(createClipboardSandbox({ navigator: { clipboard: { read: 'not-a-fn' } } }).canReadSystemClipboard()).toBe(false);
    });
});

describe('clipboardEventMediaFiles', () => {
    function makeItem(kind, type, file) {
        return { kind, type, getAsFile: () => file };
    }

    it('优先从 items 里提取媒体文件（按 kind=file 且 MIME 前缀过滤）', () => {
        const { clipboardEventMediaFiles } = createClipboardSandbox();
        const imgFile = { type: 'image/png' };
        const items = [
            makeItem('file', 'image/png', imgFile),
            makeItem('string', 'text/plain', null),
        ];
        const result = clipboardEventMediaFiles({ items, files: [] });
        expect(result).toEqual([imgFile]);
    });

    it('items 为空或没有匹配项时回退到 files', () => {
        const { clipboardEventMediaFiles } = createClipboardSandbox();
        const videoFile = { type: 'video/mp4' };
        const result = clipboardEventMediaFiles({ items: [], files: [videoFile] });
        expect(result).toEqual([videoFile]);
    });

    it('items 存在但均非媒体类型时（如纯文本），回退到 files', () => {
        const { clipboardEventMediaFiles } = createClipboardSandbox();
        const audioFile = { type: 'audio/mpeg' };
        const items = [makeItem('string', 'text/plain', null)];
        const result = clipboardEventMediaFiles({ items, files: [audioFile] });
        expect(result).toEqual([audioFile]);
    });

    it('files 里的非媒体文件会被过滤掉', () => {
        const { clipboardEventMediaFiles } = createClipboardSandbox();
        const pdfFile = { type: 'application/pdf' };
        const result = clipboardEventMediaFiles({ items: [], files: [pdfFile] });
        expect(result).toEqual([]);
    });

    it('clipboardData 为 null/undefined 时不抛错，返回空数组', () => {
        const { clipboardEventMediaFiles } = createClipboardSandbox();
        expect(clipboardEventMediaFiles(null)).toEqual([]);
        expect(clipboardEventMediaFiles(undefined)).toEqual([]);
    });
});
