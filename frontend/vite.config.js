import { defineConfig } from 'vite';
import { resolve } from 'path';

// M0 占位配置：真正的构建逻辑在 M1 拆分出 ES module 后启用。
// 当前 canvas.js 仍是单文件、依赖全局作用域的经典脚本
// （详见 scripts/build-canvas.mjs 顶部注释），不适合直接丢给
// Rollup 打包，因此 M0 阶段用一个独立的 Node 脚本
// （scripts/build-canvas.mjs）把源文件复制到 dist/，
// 只验证"构建产物目录结构 + FastAPI 挂载方式"这条流水线本身可用。
// 保留这份 vite.config.js 是为了让 M1 开始拆分模块后，
// npm run build 可以无缝切换成真正调用 `vite build`。
export default defineConfig({
  root: __dirname,
  build: {
    outDir: resolve(__dirname, '../static/dist'),
    emptyOutDir: true,
    sourcemap: true,
  },
});
