import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ComfyUI settings page entry', () => {
  it('owns the HTML shell in frontend and keeps only the legacy feature boundary', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/pages/comfyui-settings/index.html'), 'utf8');
    expect(html).toContain('../../comfyui-settings/runtime.js');
    expect(html).toContain('/static/dist/shared/theme-bootstrap-early.js');
    expect(html).toContain('type="module" blocking="render"');
    expect(html).not.toContain('/static/vendor/js/tailwindcss-cdn.js');
    expect(html).not.toContain('/static/vendor/js/lucide.js');
    expect(html).not.toContain('/static/dist/shared/i18n.js');
    expect(html).not.toContain('/static/dist/shared/theme.js');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/on(?:click|input|change|dblclick)=/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toContain('/static/dist/comfyui-settings/main.js');
  });

  it('uses npm runtime dependencies for Tailwind and icons', () => {
    const runtime = readFileSync(resolve(process.cwd(), 'src/comfyui-settings/runtime.js'), 'utf8');
    expect(runtime).toContain("import '@tailwindcss/browser';");
    expect(runtime).not.toContain("from 'lucide'");
    expect(runtime).not.toContain('window.lucide');
    const config = readFileSync(resolve(process.cwd(), 'vite.config.js'), 'utf8');
    expect(config).toContain("import { createIcons, icons } from 'lucide';");
    expect(config).toContain(".replaceAll('window.lucide', 'lucide')");
    expect(config).toContain("replaceAll('window.StudioI18n', 'StudioI18n')");
    expect(config).toContain("replaceAll('window.StudioTheme', 'StudioTheme')");
    expect(runtime).toContain("import * as comfyUiActions from 'virtual:comfyui-settings-features';");
    expect(runtime).toContain("import 'virtual:mediaforge-i18n';");
    const source = readFileSync(resolve(process.cwd(), 'src/comfyui-settings/main.js'), 'utf8');
    expect(source).not.toContain('window.StudioI18n');
  });

  it('keeps dynamic feature templates free of inline event handlers', () => {
    const sources = [
      'src/comfyui-settings/main.js',
      'src/comfyui-settings/node-graph-editor.js',
      'src/comfyui-settings/field-editor.js',
      'src/comfyui-settings/preview-panel.js',
      'src/comfyui-settings/mini-canvas.js',
      'src/comfyui-settings/comfy-instances.js',
    ].map(path => readFileSync(resolve(process.cwd(), path), 'utf8')).join('\n');
    expect(sources).not.toMatch(/\bon(?:click|input|change|mousedown)=/i);
    expect(sources).not.toContain('window.onmousemove');
    expect(sources).not.toContain('window.onmouseup');
    expect(sources).not.toContain('canvas.onwheel');
    expect(sources).not.toContain('canvas.onmousedown');
    expect(sources).not.toContain('popup.onwheel');
    expect(sources).not.toMatch(/input\.onchange\s*=/);
    expect(sources).toContain("input.addEventListener('change'");
    expect(sources).toContain("popup.addEventListener('wheel', popupWheelHandler)");
    expect(sources).toContain("popup.removeEventListener('wheel', popupWheelHandler)");
    expect(sources).toContain("canvas.addEventListener('wheel', miniCanvasWheelHandler");
    expect(sources).toContain("canvas.addEventListener('mousedown', miniCanvasMouseDownHandler");
    expect(sources).toContain("miniCanvasElement.removeEventListener('wheel', miniCanvasWheelHandler)");
    expect(sources).toContain("miniCanvasElement.removeEventListener('mousedown', miniCanvasMouseDownHandler)");
    expect(sources).toContain("window.addEventListener('mousemove'");
    expect(sources).toContain("window.addEventListener('mouseup'");
    expect(sources).toContain("window.removeEventListener('mousemove', miniCanvasMoveHandler)");
    expect(sources).toContain("window.removeEventListener('mouseup', miniCanvasUpHandler)");
  });
});
