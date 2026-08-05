#!/usr/bin/env node
/**
 * 构建脚本：
 *   - frontend/src/smart-canvas/utils.js（M1 拆分）和
 *     frontend/src/smart-canvas/loop-node.js（M2 拆分）都是手写源码
 *     （经典 <script>，非 ES module，见各自文件顶部注释），原样复制到
 *     static/dist/smart-canvas/ 对应文件。
 *   - static/js/smart-canvas.js 仍是主体代码的唯一源码（改动频繁，尚未
 *     完全模块化），每次构建都从它重新复制到
 *     static/dist/smart-canvas/main.js，同时留一份到
 *     frontend/src/smart-canvas/main.js 存档（生成文件，不要手动编辑）。
 *
 * 输出目录选择 static/dist/ 而不是 frontend/dist/ 的原因：
 *   main.py 里已有 /static/{page}.html 路由会在响应 HTML 时正则匹配
 *   src="/static/...\.(js|css|html)" 并动态加上 ?v=<version> 做缓存版本控制
 *   （见 app/routers/pages.py::versioned_static_html）。这个正则只认
 *   /static/ 开头的路径。把构建产物放进 static/dist/ 就能直接复用现有的
 *   StaticFiles 挂载（app.mount("/static", ...)）和版本注入逻辑，不需要
 *   给 main.py 新增挂载点。
 *
 * 为什么 utils.js / loop-node.js 不参与 Rollup/vite 打包、也不用 export/import：
 *   smart-canvas.js 依赖经典 <script> 的全局作用域语义（顶层声明自动挂到
 *   window），static/smart-canvas.html 里 57 处内联 onclick="xxx()" 都依赖
 *   这一点。loop-node.js 里还有对 nodes/selectedId 等全局状态的直接重新
 *   赋值（如 createLoopNode 里的 `selectedId = node.id`），这类赋值必须
 *   靠经典脚本共享全局作用域才能工作——ES module 的具名 import 是只读
 *   绑定，重新赋值会直接报运行时错误。所以这些拆分出来的文件都保持
 *   经典脚本语法，通过 <script src> 顺序（utils.js → loop-node.js →
 *   main.js）加载，main.js 里对这些函数的调用方式不变。
 *
 *   等后续某个模块的拆分需要认真解决全局作用域问题时（比如 state.js
 *   真正拆分、给全部内联 onclick 引用的函数补上 window.xxx = xxx），
 *   这个脚本才会切换成调用 `vite build`。
 */
import { copyFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');
const repoRoot = resolve(frontendRoot, '..');

const mainSrc = resolve(repoRoot, 'static/js/smart-canvas.js');
const mainStagingCopy = resolve(frontendRoot, 'src/smart-canvas/main.js');

const outDir = resolve(repoRoot, 'static/dist/smart-canvas');
const mainDest = resolve(outDir, 'main.js');

rmSync(resolve(repoRoot, 'static/dist'), { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// main.js：仍从 static/js/smart-canvas.js 复制（唯一源码在那边）。
copyFileSync(mainSrc, mainDest);
mkdirSync(dirname(mainStagingCopy), { recursive: true });
copyFileSync(mainSrc, mainStagingCopy);

// 手写源码文件（经典脚本，各自独立拆出的模块），直接复制。
// 加载顺序（同时也是这里列出的顺序）：utils.js（M1）→ loop-node.js（M2）→
// node-layout.js → node-model.js（M3）→ connections.js（M4）→
// cascade-run.js（M5）→ upload.js（M6）→ media-display.js（M11）→
// candidate-pool.js（M12）→ clipboard.js（M13）→ node-context-ui.js（M14）→
// workflow-transfer.js（M15）→ canvas-sync.js（M16）→
// prompt-templates.js（M17）→ canvas-render.js（M7）→
// image-editor.js（M8）→ asset-library.js（M9）→
// generation-settings.js（M10）→ main.js。
const handwrittenFiles = ['utils.js', 'loop-node.js', 'node-layout.js', 'node-model.js', 'connections.js', 'cascade-run.js', 'upload.js', 'media-display.js', 'candidate-pool.js', 'clipboard.js', 'node-context-ui.js', 'workflow-transfer.js', 'canvas-sync.js', 'prompt-templates.js', 'canvas-render.js', 'image-editor.js', 'asset-library.js', 'generation-settings.js'];
for (const name of handwrittenFiles) {
  const src = resolve(frontendRoot, 'src/smart-canvas', name);
  const dest = resolve(outDir, name);
  copyFileSync(src, dest);
  console.log(`[build-smart-canvas] copied ${src} -> ${dest}`);
}

console.log(`[build-smart-canvas] copied ${mainSrc} -> ${mainDest}`);
console.log(`[build-smart-canvas] staged  ${mainSrc} -> ${mainStagingCopy}`);

