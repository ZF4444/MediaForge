import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');

describe('frontend vendor boundary', () => {
  it('uses frontend-managed fonts instead of the legacy vendor font bundle', () => {
    const sourceFiles = readFileSync(resolve(sourceRoot, 'styles/fonts.css'), 'utf8');
    expect(sourceFiles).toContain("url('/fonts/inter-4.ttf')");
    expect(sourceFiles).not.toContain('/static/vendor/');
  });

  it('does not require the legacy static fonts directory', () => {
    const source = readFileSync(resolve(sourceRoot, 'styles/fonts.css'), 'utf8');
    expect(source).not.toContain('/static/fonts/');
  });

  it('keeps public compatibility styles on the frontend-managed font path', () => {
    const publicStyles = ['canvas.css', 'asset-manager.css']
      .map(file => readFileSync(resolve(sourceRoot, 'styles', file), 'utf8'))
      .join('\n');
    expect(publicStyles).toContain("@import './fonts.css';");
    expect(publicStyles).not.toContain('/static/vendor/css/fonts.css');
  });

  it('keeps migrated page sources independent of legacy third-party vendor URLs', () => {
    const sourceFiles = [
      'pages/canvas/index.html',
      'pages/comfyui-settings/index.html',
      'pages/rh-workflow-settings/index.html',
      'canvas/runtime.js',
      'comfyui-settings/runtime.js',
      'rh-workflow-settings/runtime.js',
    ].map(file => readFileSync(resolve(sourceRoot, file), 'utf8')).join('\n');

    expect(sourceFiles).not.toMatch(/\/static\/vendor\/js\/(lucide|marked|dompurify|tailwindcss|three)/i);
    expect(sourceFiles).not.toMatch(/\/static\/dist\/shared\/(theme|i18n|markdown-renderer|upload-quota-dialog)\.js/i);
  });

  it('keeps shared ESM services free of compatibility globals', () => {
    const sourceFiles = ['shared/runninghub-client.js', 'shared/image-preview.js']
      .map(file => readFileSync(resolve(sourceRoot, file), 'utf8'))
      .join('\n');
    expect(sourceFiles).not.toMatch(/window\.(RunningHubClient|StudioImagePreview)/);
  });

  it('exports the shared theme API as ESM instead of registering window globals', () => {
    const theme = readFileSync(resolve(sourceRoot, 'shared/theme.js'), 'utf8');
    const compatibility = readFileSync(resolve(process.cwd(), '../static/dist/shared/theme.js'), 'utf8');
    expect(theme).toContain('export const StudioTheme');
    expect(theme).toContain('export const StudioScale');
    expect(theme).not.toMatch(/window\.Studio(Theme|Scale)\s*=/);
    expect(compatibility).toContain('window.StudioTheme =');
    expect(compatibility).toContain('window.StudioScale =');
    expect(compatibility).not.toMatch(/^\s*export\s/m);
  });

  it('exports the shared i18n API as ESM instead of registering window globals', () => {
    const i18n = readFileSync(resolve(sourceRoot, 'shared/i18n-core.js'), 'utf8');
    expect(i18n).toContain('export const StudioI18n');
    expect(i18n).not.toContain('window.StudioI18n');
  });

  it('bundles VNCCS Three.js dependencies from npm', () => {
    const embed = readFileSync(resolve(sourceRoot, 'vnccs/embed-runtime.js'), 'utf8');
    const poseStudio = readFileSync(resolve(sourceRoot, 'vnccs/pose-studio.js'), 'utf8');
    const output = readFileSync(resolve(process.cwd(), '../static/vnccs-pose-studio-embed.html'), 'utf8');
    expect(embed).toContain("import('virtual:vnccs-pose-studio')");
    expect(poseStudio).toContain("import * as THREE from 'three';");
    expect(poseStudio).toContain("import { OrbitControls } from 'three/addons/controls/OrbitControls.js';");
    expect(poseStudio).toContain("import { TransformControls } from 'three/addons/controls/TransformControls.js';");
    expect(poseStudio).not.toContain("/static/vendor/js/vnccs/");
    expect(poseStudio).not.toMatch(/(?:btnList|btnGrid|undoBtn|redoBtn|ikDepthSelect|refBtn)\.(onclick|onchange)\s*=/);
    expect(poseStudio).toContain("btnList.addEventListener('click'");
    expect(poseStudio).toContain("ikDepthSelect.addEventListener('change'");
    expect(poseStudio).not.toMatch(/(?:resetBtn|recenterBtn|okBtn)\.onclick\s*=/);
    expect(poseStudio).toContain("recenterBtn.addEventListener('click'");
    expect(poseStudio).toContain("okBtn.addEventListener('click'");
    expect(poseStudio).not.toMatch(/(?:overrideBtn|resetLightBtn|removeBtn|typeSelect|colorInput|intSlider|radSlider|hSlider|addBtn)\.(onclick|onchange|oninput)\s*=/);
    expect(poseStudio).toContain("overrideBtn.addEventListener('click'");
    expect(poseStudio).toContain("typeSelect.addEventListener('change'");
    expect(poseStudio).toContain("addBtn.addEventListener('click'");
    expect(output).toContain('/static/dist/vnccs-pose-studio-embed/main.js');
    expect(output).not.toContain('/static/vendor/js/vnccs/vnccs_pose_studio.js');
  });

  it('owns the VNCCS embed shell in frontend while preserving its URL output', () => {
    const page = readFileSync(resolve(sourceRoot, 'pages/vnccs-pose-studio-embed/index.html'), 'utf8');
    const output = readFileSync(resolve(process.cwd(), '../static/vnccs-pose-studio-embed.html'), 'utf8');
    expect(page).toContain('../../vnccs/embed-runtime.js');
    expect(page).not.toMatch(/<script>\s*[\s\S]*?<\/script>/i);
    expect(page).not.toContain('/static/dist/vnccs/standalone-shim.js');
    expect(output).toContain('/static/dist/vnccs-pose-studio-embed/main.js');
    expect(output).not.toContain('vnccs-standalone-ready', '');
  });
});
