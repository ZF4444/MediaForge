import { defineConfig, build as viteBuild } from 'vite';
import { relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const frontendRoot = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(frontendRoot, '..');
const assetManagerFeatureFiles = [
  'storage-manager.js',
  'local-assets.js',
  'asset-library.js',
  'prompt-library.js',
  'avatar-registration.js',
  'detail-lightbox.js',
  'main.js',
];

const canvasFeatureFiles = [
  'state.js', 'utils.js', 'loop-node.js', 'node-layout.js', 'node-model.js',
  'connections.js', 'cascade-run.js', 'upload.js', 'media-display.js',
  'candidate-pool.js', 'clipboard.js', 'node-context-ui.js', 'workflow-transfer.js',
  'canvas-sync.js', 'canvas-sync-socket.js', 'prompt-templates.js', 'prompt-task-rules.js', 'mention-composer.js',
  'canvas-render.js', 'image-editor.js', 'asset-library.js', 'generation-settings.js', 'main.js',
  'agent/agent-state.js', 'agent/agent-bridge.js', 'agent/agent-client.js',
  'agent/agent-plan.js', 'agent/agent-event-projector.js',
  'agent/agent-events.js', 'agent/agent-panel.js',
];
const canvasActionExports = [
  'applyGridJoinPreset', 'applyGridPreset', 'applyImageEdit', 'clearEditDrawing',
  'clearGridCustomLines', 'closeCanvasLog', 'closeCanvasShortcuts', 'closeCanvasWorkflowTransferModal',
  'closeImageEditor', 'deletePreviewCandidate', 'downloadPreviewGroup',
  'downloadPreviewImage', 'exportPanoramaFrame', 'exportSelectedCanvasWorkflow',
  'exportVideoFrame', 'navigatePreviewImage', 'openCanvasLog', 'openCanvasShortcuts',
  'redoEditDrawing', 'resetGridJoinLayout', 'resetImageEditZoom', 'setBrushTool',
  'setGridCustomOrientation', 'setGridJoinOutputSize', 'toggleGridCustomMode',
  'togglePanoramaPreview', 'togglePreviewCompare', 'undoEditDrawing', 'undoGridCustomLine',
];
const comfyUiFeatureFiles = [
  'node-graph-editor.js', 'field-editor.js', 'preview-panel.js', 'mini-canvas.js', 'comfy-instances.js', 'main.js',
];
const i18nFeatureFiles = [
  'i18n-core.js', 'i18n/common.js', 'i18n/studio.js', 'i18n/canvas.js',
  'i18n/canvas-features.js', 'i18n/comfyui-settings.js',
];
const comfyUiActionExports = [
  'closeImagePreview', 'closeNodePopup', 'openNodePopup', 'graphFit', 'graphZoom', 'onSave',
  'selectWorkflow', 'setWorkspaceMode', 'toggleNodeCard', 'toggleNodeList', 'updateWorkflowTitle',
  'addComfyInstance', 'removeComfyInstance', 'updateComfyInstance',
  'addMiniNode', 'onRun', 'openImagePreview', 'pickImage', 'pickMiniImage', 'removeMiniNode',
  'setPreviewValue', 'togglePreviewRandom', 'updateDropdownOption', 'updateField', 'toggleField',
  'addDropdownOption', 'removeDropdownOption', 'updateMiniNode',
];
const rhWorkflowFeatureFiles = [
  ['rh-workflow-settings', 'main.js'],
  ['workflow-settings', 'rh-workflow-editor.js'],
];
const rhWorkflowActionExports = [
  'closeRhWorkflowEditor', 'createRhEntryFromPaste', 'exportRhWorkflowJson',
  'fetchRhAppEditor', 'importRhWorkflowJson', 'saveRhWorkflowEditor',
  'updateRhWorkflowEditorMeta', 'closeRhNodePopover', 'openRhAppEditor',
  'openRhAppFieldPopover', 'pickRhPreviewMedia', 'pickRhThumbnail', 'removeRhEntry',
  'testRhMappedPreview', 'toggleRhPreviewRandom', 'toggleRhWorkflowEditorField',
  'updateRhEntry', 'updateRhPreviewValue', 'updateRhWorkflowEditorField', 'setRhWorkflowMedia',
  'setRhFieldQuery', 'setRhFieldKindFilter', 'toggleRhOnlyEnabled', 'clearRhFieldFilters',
  'setRhVisibleFieldsEnabled', 'setRhRightTab',
];

function assetManagerFeatures() {
  const virtualId = 'virtual:asset-manager-features';
  const resolvedVirtualId = `\0${virtualId}`;
  return {
    name: 'mediaforge-asset-manager-esm-entry',
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
    },
    load(id) {
      if (id !== resolvedVirtualId) return null;
      const importedService = [
        `import { loadAssetManagerBootstrap } from ${JSON.stringify(resolve(frontendRoot, 'src/services/asset-manager.js'))};`,
        `import { upload } from ${JSON.stringify(resolve(frontendRoot, 'src/services/upload-quota.js'))};`,
        `import { getFileMetadata } from ${JSON.stringify(resolve(frontendRoot, 'src/services/file-metadata.js'))};`,
        `import { apiJson as httpApiJson, apiConfirm, apiPrompt, openExternal } from ${JSON.stringify(resolve(frontendRoot, 'src/services/http.js'))};`,
      ].join('\n');
      const featureSources = assetManagerFeatureFiles
        .map(name => readFileSync(resolve(frontendRoot, 'src/asset-manager', name), 'utf8'))
        .join('\n\n');
      // 必须注册 http.js 的 apiJson：拼接进来的 main.js 里有同名本地 apiJson，它会转调
      // runtimeServices.apiJson；若这里误注册成本地函数自身，就会无限递归（Maximum call stack size exceeded）。
      return `${importedService}\nObject.assign(globalThis.__MediaForgeRuntimeServices || (globalThis.__MediaForgeRuntimeServices = {}), { apiJson: httpApiJson, apiConfirm, apiPrompt, openExternal });\n${featureSources}`;
    },
  };
}

function canvasFeatures() {
  const virtualId = 'virtual:canvas-features';
  const resolvedVirtualId = `\0${virtualId}`;
  return {
    name: 'mediaforge-canvas-esm-entry',
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
    },
    load(id) {
      if (id !== resolvedVirtualId) return null;
      const source = canvasFeatureFiles
        .map(name => readFileSync(resolve(frontendRoot, 'src/canvas', name), 'utf8'))
        .join('\n\n');
      const uploadService = JSON.stringify(resolve(frontendRoot, 'src/services/upload-quota.js'));
      const featureImports = [
        "import { createIcons, icons } from 'lucide';",
        "import { listWorkflows, getWorkflow, deleteWorkflow, saveWorkflow, updateWorkflowConfig, runWorkflow, uploadWorkflowFile, listComfyInstances, saveComfyInstances as persistComfyInstances } from './src/services/comfyui.js';",
        "import { StudioI18n } from 'virtual:mediaforge-i18n';",
        "import { StudioTheme } from 'virtual:mediaforge-theme';",
        "import * as THREE from 'three';",
        `import { renderMarkdown } from ${JSON.stringify(resolve(frontendRoot, 'src/shared/markdown.js'))};`,
        `import { MediaForgeUpload } from ${uploadService};`,
        `import { apiJson, apiText, apiBlob, apiForm, apiConfirm, apiPrompt, openExternal, canvasApi } from ${JSON.stringify(resolve(frontendRoot, 'src/services/http.js'))};`,
        `globalThis.__MediaForgeRuntimeServices = globalThis.__MediaForgeRuntimeServices || {};`,
        `Object.assign(globalThis.__MediaForgeRuntimeServices, { apiJson, apiText, apiBlob, apiForm, apiConfirm, apiPrompt, openExternal, canvasApi });`,
        "const lucide = { createIcons: options => createIcons({ icons, ...(options && typeof options === 'object' && 'root' in options ? options : { root: options }) }) };",
        "const MediaForgeMarkdown = { render: renderMarkdown };",
        'let CanvasAgentState, CanvasAgentBridge, CanvasAgentClient, CanvasAgentPlan, CanvasAgentEventProjector, CanvasAgentEvents, CanvasAgentPanel, canvasAgentHandleEvent;',
      ].join('\n');
      const moduleSource = source
        .replaceAll('window.MediaForgeUpload', 'MediaForgeUpload')
        .replaceAll('window.focusCanvasNode', 'focusCanvasNode')
        .replaceAll('window.lucide', 'lucide')
        .replaceAll('window.StudioI18n', 'StudioI18n')
        .replaceAll('window.StudioTheme', 'StudioTheme')
        .replaceAll('window.MediaForgeMarkdown', 'MediaForgeMarkdown')
        .replaceAll('window.CanvasAgentState', 'CanvasAgentState')
        .replaceAll('window.CanvasAgentBridge', 'CanvasAgentBridge')
        .replaceAll('window.CanvasAgentClient', 'CanvasAgentClient')
        .replaceAll('window.CanvasAgentPlan', 'CanvasAgentPlan')
        .replaceAll('window.CanvasAgentEventProjector', 'CanvasAgentEventProjector')
        .replaceAll('window.CanvasAgentEvents', 'CanvasAgentEvents')
        .replaceAll('window.CanvasAgentPanel', 'CanvasAgentPanel')
        .replaceAll('window.canvasAgentHandleEvent', 'canvasAgentHandleEvent')
        .replaceAll('window.THREE', 'THREE');
      return `${featureImports}\n${moduleSource}\n\nexport { ${canvasActionExports.join(', ')} };`;
    },
  };
}

function comfyUiFeatures() {
  const virtualId = 'virtual:comfyui-settings-features';
  const resolvedVirtualId = `\0${virtualId}`;
  return {
    name: 'mediaforge-comfyui-settings-esm-entry',
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
    },
    load(id) {
      if (id !== resolvedVirtualId) return null;
      const source = comfyUiFeatureFiles
        .map(name => readFileSync(resolve(frontendRoot, 'src/comfyui-settings', name), 'utf8'))
        .join('\n\n');
      const featureImports = [
        "import { createIcons, icons } from 'lucide';",
        `import { listWorkflows, getWorkflow, deleteWorkflow, saveWorkflow, updateWorkflowConfig, runWorkflow, uploadWorkflowFile, listComfyInstances, saveComfyInstances as persistComfyInstances } from ${JSON.stringify(resolve(frontendRoot, 'src/services/comfyui.js'))};`,
        "import { StudioI18n } from 'virtual:mediaforge-i18n';",
        "import { StudioTheme } from 'virtual:mediaforge-theme';",
        "const lucide = { createIcons: options => createIcons({ icons, ...(options && typeof options === 'object' && 'root' in options ? options : { root: options }) }) };",
      ].join('\n');
      const moduleSource = source
        .replaceAll('window.lucide', 'lucide')
        .replaceAll('window.StudioI18n', 'StudioI18n')
        .replaceAll('window.StudioTheme', 'StudioTheme');
      return `${featureImports}\n${moduleSource}\n\nexport { ${comfyUiActionExports.join(', ')} };`;
    },
  };
}

function i18nFeatures() {
  const virtualId = 'virtual:mediaforge-i18n';
  const resolvedVirtualId = `\0${virtualId}`;
  return {
    name: 'mediaforge-i18n-esm-entry',
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
    },
    load(id) {
      if (id !== resolvedVirtualId) return null;
      const [core, ...bundles] = i18nFeatureFiles.map(name => readFileSync(resolve(frontendRoot, 'src/shared', name), 'utf8'));
      const moduleCore = core.replace('export const StudioI18n =', 'const StudioI18n =');
      return `${[moduleCore, ...bundles].join('\n\n').replaceAll('window.StudioI18n', 'StudioI18n')}\n\nexport { StudioI18n };`;
    },
  };
}

function themeFeatures() {
  const virtualId = 'virtual:mediaforge-theme';
  const resolvedVirtualId = `\0${virtualId}`;
  return {
    name: 'mediaforge-theme-esm-entry',
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
    },
    load(id) {
      if (id !== resolvedVirtualId) return null;
      return readFileSync(resolve(frontendRoot, 'src/shared/theme.js'), 'utf8');
    },
  };
}

function rhWorkflowFeatures() {
  const virtualId = 'virtual:rh-workflow-settings-features';
  const resolvedVirtualId = `\0${virtualId}`;
  return {
    name: 'mediaforge-rh-workflow-settings-esm-entry',
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
    },
    load(id) {
      if (id !== resolvedVirtualId) return null;
      const source = rhWorkflowFeatureFiles
        .map(([directory, name]) => readFileSync(resolve(frontendRoot, 'src', directory, name), 'utf8'))
        .join('\n\n');
      const uploadService = JSON.stringify(resolve(frontendRoot, 'src/services/upload-quota.js'));
      const featureImports = [
        "import { createIcons, icons } from 'lucide';",
        `import { getAiConfiguration, saveAiConfiguration } from ${JSON.stringify(resolve(frontendRoot, 'src/services/ai-configuration.js'))};`,
        `import { MediaForgeUpload } from ${uploadService};`,
        "const lucide = { createIcons: options => createIcons({ icons, ...(options && typeof options === 'object' && 'root' in options ? options : { root: options }) }) };",
      ].join('\n');
      const moduleSource = source
        .replaceAll('window.MediaForgeUpload', 'MediaForgeUpload')
        .replaceAll('window.lucide', 'lucide');
      return `${featureImports}\n${moduleSource}\n\nexport { ${rhWorkflowActionExports.join(', ')} };`;
    },
  };
}

function vnccsPoseStudio() {
  const virtualId = 'virtual:vnccs-pose-studio';
  const resolvedVirtualId = `\0${virtualId}`;
  return {
    name: 'mediaforge-vnccs-pose-studio-esm',
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
    },
    load(id) {
      if (id !== resolvedVirtualId) return null;
      const source = readFileSync(resolve(frontendRoot, 'src/vnccs/pose-studio.js'), 'utf8')
        .replace("from './standalone-module.js'", `from ${JSON.stringify(resolve(frontendRoot, 'src/vnccs/standalone-module.js'))}`);
      return source;
    },
  };
}


function staticPageOutput() {
  return {
    name: 'mediaforge-static-page-output',
    generateBundle(_options, bundle) {
      // HTML 中指向 /static/ 的 <link rel="stylesheet"> 会被 Vite 当作 CSS 导入写进入口 JS，
      // 变成 import "/static/dist/styles/xxx.css"。浏览器会把 CSS 当模块解析并报 MIME 错误，
      // 导致整个入口脚本不执行。样式由下方回填的 <link> 加载，这里移除这些无效的 JS 导入。
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        chunk.code = chunk.code.replace(/import\s*["']\/static\/[^"']+\.css["'];?/g, '');
      }
      for (const [oldName, asset] of Object.entries(bundle)) {
        if (asset.type !== 'asset') continue;
        const page = pages.find(({ htmlSrc }) => {
          const normalizedHtmlSrc = htmlSrc?.replaceAll('\\', '/').replace('frontend/', '');
          return normalizedHtmlSrc && oldName.endsWith(normalizedHtmlSrc);
        });
        if (!page) continue;
        const html = String(asset.source);
        const sourceHtml = readFileSync(resolve(repoRoot, page.htmlSrc), 'utf8');
        const earlyThemeBootstrap = sourceHtml.match(/<script\b(?=[^>]*src=["'][^"']*theme-bootstrap-early\.js["'])[^>]*><\/script>/i)?.[0];
        if (earlyThemeBootstrap && !html.includes('theme-bootstrap-early.js')) {
          asset.source = `${asset.source}`.replace(/(<meta\b[^>]*charset=["'][^"']+["'][^>]*>)/i, `$1\n    ${earlyThemeBootstrap}`);
        }
        const staticStyles = [...sourceHtml.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["'](\/static\/[^"']+)["'][^>]*>/gi)];
        for (const match of staticStyles) {
          if (!html.includes(match[1])) asset.source = `${asset.source}`.replace(/<\/head>/i, `${match[0]}\n</head>`);
        }
        delete bundle[oldName];
        asset.fileName = `${page.page}.html`;
        bundle[asset.fileName] = asset;
      }
    },
  };
}

function legacyAssets() {
  const files = [
    [resolve(frontendRoot, 'src/shared/theme-bootstrap-early.js'), 'dist/shared/theme-bootstrap-early.js'],
    ...sharedFiles.map(name => [resolve(frontendRoot, 'src/shared', name), `dist/shared/${name}`]),
    ...styleFiles.map(name => [resolve(frontendRoot, 'src/styles', name), `dist/styles/${name}`]),
    [resolve(frontendRoot, 'src/styles/login.css'), 'dist/styles/login.css'],
    [resolve(frontendRoot, 'src/services/http.js'), 'dist/services/http.js'],
  ];
  return {
    name: 'mediaforge-legacy-assets',
    generateBundle() {
      for (const [source, fileName] of files) {
        let content = readFileSync(source, 'utf8');
        if (fileName === 'dist/shared/theme.js') {
          content = content
            .replace('export const StudioTheme =', 'window.StudioTheme =')
            .replace('export const StudioScale =', 'window.StudioScale =');
        }
        // fonts.css 里的字体写成 /fonts/xxx.ttf（Vite 打包路径会自动改成 /static/fonts/），
        // 原样拷贝到 dist/styles 时必须手动改写，否则浏览器请求 /fonts/* 会 404。
        if (fileName === 'dist/styles/fonts.css') {
          content = content.replaceAll("url('/fonts/", "url('/static/fonts/");
        }
        this.emitFile({ type: 'asset', fileName, source: content });
      }
    },
  };
}

function staticPageDev() {
  return {
    name: 'mediaforge-static-page-dev',
    enforce: 'pre',
    configureServer(server) {
      const htmlPages = pages.filter(({ htmlSrc }) => htmlSrc);
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split('?')[0];
        const page = htmlPages.find(({ page }) => pathname === `/static/${page}.html`);
        if (page) {
          try {
            const sourcePath = `/${page.htmlSrc.replace(/^frontend\//, '')}`;
            const htmlSource = readFileSync(resolve(repoRoot, page.htmlSrc), 'utf8')
              .replaceAll('/static/dist/shared/theme-bootstrap-early.js', '/src/shared/theme-bootstrap-early.js');
            let html = await server.transformIndexHtml(sourcePath, htmlSource);
            const htmlDirectory = page.htmlSrc.replace(/^frontend\//, '').replace(/\/[^/]+$/, '');
            const sourceUrl = assetPath => {
              const absolutePath = resolve(frontendRoot, htmlDirectory, assetPath);
              return `/${relative(frontendRoot, absolutePath).split(sep).join('/')}`;
            };
            html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => {
              if (!/\btype=["']module["']/i.test(tag)) return tag;
              const source = tag.match(/\bsrc=(["'])([^"']+)\1/i);
              if (!source) return tag;
              if (source[2].startsWith('/') || /^[a-z]+:/i.test(source[2])) return tag;
              return tag.replace(source[0], `src="${sourceUrl(source[2])}"`);
            });
            html = html.replace(/<link\b[^>]*>/gi, tag => {
              const href = tag.match(/\bhref=(["'])([^"']+)\1/i);
              if (!href || href[2].startsWith('/') || /^[a-z]+:/i.test(href[2]) || href[2].startsWith('#')) return tag;
              return tag.replace(href[0], `href="${sourceUrl(href[2])}"`);
            });
            html = html.replaceAll('/static/images/', '/images/');
            html = html.replace(/\/static\/dist\/styles\/([\w.-]+\.css)/g, '/src/styles/$1');
            response.statusCode = 200;
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(html);
          } catch (error) {
            next(error);
          }
          return;
        }
        if (request.url === '/static/main.js') request.url = '/src/pages/login/main.js';
        else if (request.url === '/static/dist/styles/login.css') request.url = '/src/styles/login.css';
        else if (request.url === '/static/dist/angle/main.js') request.url = '/src/angle/main.js';
        else if (request.url === '/static/dist/angle/module.js') request.url = '/src/angle/module.js';
        else if (request.url === '/static/dist/shared/theme-bootstrap-early.js') request.url = '/src/shared/theme-bootstrap-early.js';
        else if (request.url === '/static/dist/styles/gpt-chat.css') request.url = '/src/styles/gpt-chat.css';
        else if (request.url === '/static/dist/styles/rh-workflow-settings.css') request.url = '/src/styles/rh-workflow-settings.css';
        else if (request.url === '/static/dist/styles/fonts.css') request.url = '/src/styles/fonts.css';
        else if (request.url?.startsWith('/static/dist/styles/')) {
          const styleName = request.url.slice('/static/dist/styles/'.length).split('?')[0];
          if (styleFiles.includes(styleName)) request.url = `/src/styles/${styleName}`;
        }
        else if (request.url?.startsWith('/static/dist/') || request.url?.startsWith('/static/vendor/')) {
          request.url = request.url.replace(/^\/static\//, '/');
        }
        next();
      });
    },
  };
}

export const pages = [
  { page: 'canvas', htmlSrc: 'frontend/src/pages/canvas/index.html', isPage: true },
  { page: 'asset-manager', htmlSrc: 'frontend/src/pages/asset-manager/index.html', isPage: true },
  { page: 'storage-manager', htmlSrc: 'frontend/src/pages/storage-manager/index.html', isPage: true },
  { page: 'comfyui-settings', htmlSrc: 'frontend/src/pages/comfyui-settings/index.html', isPage: true },
  { page: 'rh-workflow-settings', htmlSrc: 'frontend/src/pages/rh-workflow-settings/index.html', isPage: true },
  ...['storage-quota', 'workflow-config', 'ai-connections', 'canvas-manager', 'access-control', 'broadcast-admin', 'user-management', 'my-account', 'user-data-migration', 'fbx-node-picker'].map(page => ({ page, mainSrc: `frontend/src/${page}/main.js`, handwrittenFiles: [] })),
  { page: 'api-settings', mainSrc: 'frontend/src/api-settings/main.js', handwrittenFiles: [], htmlSrc: 'frontend/src/pages/api-settings/index.html', isPage: true },
  { page: 'gaussian-viewer', mainSrc: 'frontend/src/gaussian-viewer/main.js', handwrittenFiles: [], htmlSrc: 'frontend/src/pages/gaussian-viewer/index.html', isPage: true },
  { page: 'gaussian', mainSrc: 'frontend/src/gaussian/main.js', handwrittenFiles: [], htmlSrc: 'frontend/src/pages/gaussian/index.html', isPage: true },
  { page: 'pose-studio', mainSrc: 'frontend/src/pose-studio/main.js', handwrittenFiles: [], htmlSrc: 'frontend/src/pages/pose-studio/index.html', isPage: true },
  { page: 'feedback-admin', mainSrc: 'frontend/src/pages/feedback-admin/main.js', handwrittenFiles: [], htmlSrc: 'frontend/src/pages/feedback-admin/index.html', isPage: true },
  { page: 'gpt-chat', mainSrc: 'frontend/src/gpt-chat/main.js', handwrittenFiles: [], htmlSrc: 'frontend/src/pages/gpt-chat/index.html', isPage: true },
  { page: 'index', mainSrc: 'frontend/src/index/main.js', handwrittenFiles: [], htmlSrc: 'frontend/src/pages/index/index.html', isPage: true },
  { page: 'vnccs', mainSrc: 'frontend/src/vnccs/standalone-module.js', handwrittenFiles: ['standalone-shim.js'] },
  { page: 'vnccs-pose-studio-embed', htmlSrc: 'frontend/src/pages/vnccs-pose-studio-embed/index.html', isPage: true },
  ...['login', 'broadcast-admin', 'access-control', 'canvas-manager', 'storage-quota', 'workflow-config', 'ai-connections', 'my-account', 'user-data-migration', 'user-management', 'workflow-settings', 'fbx-node-picker', 'angle'].map(page => ({
    page,
    mainSrc: `frontend/src/${page}/main.js`,
    handwrittenFiles: [],
    htmlSrc: `frontend/src/pages/${page}/index.html`,
    isPage: true,
  })),
];

export const modulePages = new Set([
  'login', 'storage-quota', 'workflow-config', 'ai-connections', 'canvas-manager',
  'access-control', 'feedback-admin', 'user-management', 'my-account',
  'user-data-migration', 'gpt-chat', 'broadcast-admin', 'gaussian-viewer',
  'fbx-node-picker', 'angle', 'gaussian', 'pose-studio', 'vnccs', 'workflow-settings', 'index',
  'api-settings', 'asset-manager', 'storage-manager', 'comfyui-settings', 'rh-workflow-settings', 'canvas', 'vnccs-pose-studio-embed',
]);


export const sharedFiles = [
  'theme.js', 'runninghub-client.js', 'image-preview.js',
  'history-bulk-manager.js', 'markdown-renderer.js',
];
export const styleFiles = [
  'api-settings.css', 'asset-manager.css', 'canvas-agent.css', 'canvas-manager.css',
  'canvas.css', 'comfyui-settings.css', 'macos-dark.css',
  'markdown-content.css', 'theme.css', 'fonts.css', 'workflow-settings.css', 'workspace-theme.css',
  'user-data-migration.css', 'gpt-chat.css', 'rh-workflow-settings.css',
];

export const moduleInputs = Object.fromEntries(
  pages.filter(({ page, htmlSrc }) => modulePages.has(page) && htmlSrc).map(({ page, htmlSrc }) => [page, resolve(repoRoot, htmlSrc)]),
);

for (const { page, mainSrc } of pages.filter(({ page, htmlSrc }) => modulePages.has(page) && !htmlSrc)) {
  // Duplicate compatibility entries must not replace the HTML build input.
  if (!moduleInputs[page]) moduleInputs[page] = resolve(repoRoot, mainSrc);
}

function viteConfig({ dev = false } = {}) {
  return {
    root: frontendRoot,
    ...(dev ? {} : { configFile: false }),
    publicDir: resolve(frontendRoot, 'public'),
    base: dev ? '/' : '/static/',
    plugins: [staticPageDev(), assetManagerFeatures(), canvasFeatures(), comfyUiFeatures(), rhWorkflowFeatures(), vnccsPoseStudio(), i18nFeatures(), themeFeatures()],
    build: {
      outDir: resolve(repoRoot, 'static'),
      emptyOutDir: false,
      sourcemap: true,
      copyPublicDir: true,
      rollupOptions: {
        input: moduleInputs,
        plugins: [legacyAssets(), staticPageOutput()],
        external: id => id.startsWith('/static/'),
        output: {
          format: 'es',
          entryFileNames: 'dist/[name]/main.js',
          chunkFileNames: 'dist/chunks/[name]-[hash].js',
          assetFileNames: 'dist/assets/[name]-[hash][extname]',
        },
      },
    },
  };
}

export const compatibilityConfig = viteConfig();

export async function buildFrontend() {
  const { copyFileSync, mkdirSync, rmSync } = await import('fs');
  for (const name of ['storage-manager.js', 'local-assets.js', 'asset-library.js', 'prompt-library.js', 'avatar-registration.js', 'detail-lightbox.js', 'main.js', 'main.js.map']) {
    rmSync(resolve(repoRoot, 'static/dist/asset-manager', name), { force: true });
  }
  rmSync(resolve(repoRoot, 'static/dist/shared/upload-quota-dialog.js'), { force: true });
  rmSync(resolve(repoRoot, 'static/dist/shared/caption-menu.js'), { force: true });
  rmSync(resolve(repoRoot, 'static/dist/styles/caption-menu.css'), { force: true });
  rmSync(resolve(repoRoot, 'static/dist/shared/i18n.js'), { force: true });
  rmSync(resolve(repoRoot, 'static/dist/shared/i18n-core.js'), { force: true });
  rmSync(resolve(repoRoot, 'static/dist/shared/i18n'), { recursive: true, force: true });
  rmSync(resolve(repoRoot, 'static/dist/canvas'), { recursive: true, force: true });
  rmSync(resolve(repoRoot, 'static/dist/comfyui-settings'), { recursive: true, force: true });
  rmSync(resolve(repoRoot, 'static/dist/rh-workflow-settings'), { recursive: true, force: true });
  rmSync(resolve(repoRoot, 'static/dist/workflow-settings/rh-workflow-editor.js'), { force: true });
  for (const { page, mainSrc, handwrittenFiles, copyFiles = [] } of pages.filter(({ page, isPage, copyClassicFiles }) => copyClassicFiles || (!isPage && !modulePages.has(page)))) {
    const outputDir = resolve(repoRoot, 'static/dist', page);
    rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(outputDir, { recursive: true });
    copyFileSync(resolve(repoRoot, mainSrc), resolve(outputDir, 'main.js'));
    for (const name of handwrittenFiles) {
      const source = resolve(frontendRoot, 'src', page, name);
      const output = resolve(outputDir, name);
      mkdirSync(resolve(output, '..'), { recursive: true });
      copyFileSync(source, output);
    }
    for (const { source, output } of copyFiles) {
      const target = resolve(repoRoot, output);
      mkdirSync(resolve(target, '..'), { recursive: true });
      copyFileSync(resolve(repoRoot, source), target);
    }
  }
  rmSync(resolve(repoRoot, 'static/dist/chunks'), { recursive: true, force: true });
  rmSync(resolve(repoRoot, 'static/dist/assets'), { recursive: true, force: true });
  rmSync(resolve(repoRoot, 'static/src'), { recursive: true, force: true });
  await viteBuild(compatibilityConfig);
  // The legacy public tree may still contain copied compatibility artifacts;
  // never let those stale bundles become part of the deployable Vite output.
  rmSync(resolve(repoRoot, 'static/dist/dist'), { recursive: true, force: true });
  rmSync(resolve(repoRoot, 'static/dist/shared/upload-quota-dialog.js'), { force: true });
  rmSync(resolve(repoRoot, 'static/dist/shared/caption-menu.js'), { force: true });
  rmSync(resolve(repoRoot, 'static/dist/styles/caption-menu.css'), { force: true });
  rmSync(resolve(repoRoot, 'static/dist/shared/i18n.js'), { force: true });
  rmSync(resolve(repoRoot, 'static/dist/shared/i18n-core.js'), { force: true });
  rmSync(resolve(repoRoot, 'static/dist/shared/i18n'), { recursive: true, force: true });
}

export default defineConfig(() => viteConfig({ dev: true }));
