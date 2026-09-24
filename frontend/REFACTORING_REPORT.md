# MediaForge 前端彻底现代化重构报告

## 1. 重构结论

本轮重构已将前端页面、构建、服务层、样式、共享逻辑和测试迁移到
`frontend/` 管理。Vite 负责开发和生产构建，构建结果继续写入 `static/`，
因此后端现有 `/static/*.html` 入口保持不变。

当前验证结果：

- 26 个页面源码入口位于 `frontend/src/pages/`。
- 生产构建成功，输出 27 个页面入口。
- Vitest：60 个测试文件、562 个测试全部通过。
- Playwright 开发环境：10 个测试通过，1 个生产资源测试在 dev server 中跳过。
- Playwright 生产静态服务器：2 个测试全部通过。
- 页面源码内联事件属性数量为 0。
- 页面源码不再引用 `/static/vendor/`。
- 字体由 `frontend/public/fonts/` 提供，旧 `static/fonts/` 不再是运行时依赖。
- `git diff --check` 通过。

## 2. 最终目录结构

```text
frontend/
├── src/
│   ├── pages/        26 个页面入口模板
│   ├── components/   可复用组件
│   ├── services/     HTTP、上传、工作流、素材等服务
│   ├── styles/       页面和主题样式
│   ├── shared/       主题、Markdown、历史记录等共享逻辑
│   └── vendor/       必须由源码打包的第三方 bundle
├── public/           图片、字体、运行时公共资源
├── scripts/          页面构建和生产静态服务器
└── test/             Vitest 与 Playwright 测试
```

## 3. 构建体系

- `frontend/vite.config.js` 使用页面注册表和 virtual module 插件构建全部页面。
- `frontend/scripts/build-pages.mjs` 统一生成 `static/*.html` 和 `static/dist/`。
- 页面开发通过 Vite dev server，生产验证通过
  `frontend/scripts/serve-static.mjs`。
- 第三方依赖由 npm 管理，包括 `lucide`、`marked`、`dompurify`、`three`、
  `@tailwindcss/browser` 和 Playwright/Vitest。
- 旧 `static/vendor` 不再被源码页面引用；生产产物也不包含旧 vendor URL。

## 4. 页面模块化

已迁移的页面域包括：Canvas、Canvas Manager、Asset Manager、ComfyUI Settings、
Workflow Settings、RunningHub Workflow Settings、GPT Chat、Gaussian Viewer、
Gaussian、Angle、Pose Studio、VNCCS Embed、Feedback Admin、Broadcast Admin、
User Management、Access Control、My Account、Storage Manager、Storage Quota、
API Settings、Login、Index、Workflow Config、FBX Node Picker 和 User Data Migration。

页面入口使用 ESM；API 请求集中在 `src/services/`。对于仍依赖大量共享顶层
状态的 Canvas/ComfyUI 经典脚本，Vite virtual module 提供 runtime service bridge，
使其可以使用统一服务而不引入不兼容的裸 import。

## 5. 服务层与组件化

统一 HTTP 服务提供：

- `apiJson`：JSON 请求和结构化错误状态。
- `apiText`、`apiBlob`、`apiStream`：文本、二进制和流式响应。
- `apiForm`：multipart/form-data 上传。
- `apiConfirm`、`apiPrompt`、`openExternal`：浏览器交互适配。
- Canvas、工作流、ComfyUI、素材库和上传服务封装。

已抽取并测试的共享组件/逻辑包括工作流封面选择器、Action delegation、
上传配额对话框、历史批量管理、主题同步、Markdown 渲染、素材和文件服务。
组件支持销毁和事件监听清理，避免重复挂载造成泄漏。

## 6. HTML 与样式

- 页面不再使用 inline `onclick`、`onchange`、`oninput` 等事件属性。
- 事件通过 `data-action` 和页面 runtime delegation 绑定。
- 页面样式已迁移到 `src/styles/`，构建输出到 `static/dist/styles/`。
- 主题初始化、字体和公共图片由 frontend 资源体系管理。

## 7. 兼容策略

- 保留所有现有 `/static/*.html` URL，不要求后端路由变更。
- 开发环境允许 `/src/...` 入口，生产环境使用 `/static/dist/...` 产物。
- 经典 Canvas/ComfyUI 脚本暂保留共享作用域，是为了兼容其大量状态读写和
  现有运行时行为；服务依赖通过 bridge 注入，而不是绕过适配层添加 ESM import。
- 这意味着“页面入口和服务层已 ESM 化”，但 Canvas 内部历史状态尚未完全
  转换为纯 ESM 状态容器，这是已知边界而非未记录的隐式依赖。

## 8. 验证命令

```bash
cd frontend
npm test -- --run
npm run test:e2e
npm run test:e2e:production
npm run build
git diff --check
```

`test:e2e:production` 会先构建，再启动 `serve-static.mjs`，验证旧 URL、生产
JavaScript 产物、缓存头以及旧 vendor 引用不存在。

## 10. 静态资源清理

- 删除了不再使用的 `static/fonts/` 副本；字体统一由 `frontend/public/fonts/` 提供。
- 删除了未被引用的旧高斯辅助脚本 `static/gaussian/js/`；查看器使用
  `frontend/src/vendor/gsplat-bundle.js`。
- 保留 `static/images/logo.png` 和 `static/images/zip-placeholder.svg`，因为旧版
  HTML 页面和冒烟测试仍通过兼容路径引用它们。

## 9. 后续可选工作

这些不阻塞本轮交付：

1. 将 Canvas 的经典共享状态继续收敛到可变 state service，并逐步减少顶层
   `let` 变量。
2. 对生产静态服务器增加 gzip/brotli 和更细粒度的 immutable asset 策略。
3. 使用动态 import 进一步拆分 Canvas、Three.js 和图标大 chunk。
4. 将 production E2E 接入 CI，并在真实后端 API 环境补充认证和数据流测试。
