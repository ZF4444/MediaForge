// 测试辅助：把经典 <script> 形式的 media-display.js（M11）加载进模拟
// 全局作用域，供 vitest 测试用例调用其中定义的纯逻辑函数（媒体类型
// 判定、结果 URL 归一化、文件名/URL 解析等）。原理跟其它 xxx-sandbox.js
// 一致，见 loop-node-sandbox.js 顶部注释。
//
// 注意：activateCanvasVideoPreview/renderCropBox 同类的 DOM 渲染/播放
// 控制函数、downloadPreviewFile 等直接触发浏览器下载的函数，跟 M5/M7/
// M8 核心批次同类的"过于依赖 DOM/网络，不适合单元测试"情形，因此本
// sandbox 只覆盖可独立验证的纯函数：isVideoMediaItem / isAudioMediaItem /
// isTextMediaItem / isFileMediaItem / mediaKindForFile / mediaKindForItem /
// mediaKindForUrls / looksLikeImageMediaUrl / outputMediaKindForItem /
// defaultOutputExtForKind / resultMediaUrls / imageRefsOnly / videoRefsOnly /
// audioRefsOnly / outputUrlLooksVideo / safeExportFileName / fileNameFromUrl /
// fileIdFromUrl。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function readSrc(name) {
    return fs.readFileSync(
        path.resolve(repoRoot, `frontend/src/smart-canvas/${name}`),
        'utf8'
    );
}

const MEDIA_DISPLAY_SRC = readSrc('media-display.js');

export function createMediaDisplaySandbox(overrides = {}) {
    const sandbox = {
        window: { location: { href: overrides.locationHref || 'https://example.com/' } },
        document: { addEventListener() {} },
        console, Date, Math, Array, Object, Number, String, Boolean, Set, Map, Promise, RegExp,
        URL,
        decodeURIComponent,
    };

    vm.createContext(sandbox);
    vm.runInContext(MEDIA_DISPLAY_SRC, sandbox, { filename: 'media-display.js' });
    return sandbox;
}
