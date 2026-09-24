import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('asset manager page entries', () => {
  it.each(['asset-manager', 'storage-manager'])('owns the %s HTML shell in frontend', page => {
    const html = readFileSync(resolve(process.cwd(), `src/pages/${page}/index.html`), 'utf8');
    expect(html).toContain('type="module" src="../../asset-manager/page-runtime.js"');
    expect(html).not.toContain('onclick=');
    expect(html).not.toContain('/static/dist/shared/theme.js');
    expect(html).not.toContain('/static/dist/shared/upload-quota-dialog.js');
    expect(html).toContain('/static/dist/shared/theme-bootstrap-early.js');
    expect(html).toContain('type="module" blocking="render"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('../../asset-manager/page-runtime.js');
    expect(html).not.toContain('/static/dist/asset-manager/storage-manager.js');
    expect(html).not.toContain('/static/dist/asset-manager/local-assets.js');
    expect(html).not.toContain('/static/dist/asset-manager/asset-library.js');
    expect(html).not.toContain('/static/dist/asset-manager/prompt-library.js');
    expect(html).not.toContain('/static/dist/asset-manager/avatar-registration.js');
    expect(html).not.toContain('/static/dist/asset-manager/detail-lightbox.js');
    expect(html).not.toContain('/static/vendor/js/lucide.js');
  });

  it('uses a page event instead of a global Lucide object', () => {
    const entry = readFileSync(resolve(process.cwd(), 'src/asset-manager/main.js'), 'utf8');
    const assetLibrary = readFileSync(resolve(process.cwd(), 'src/asset-manager/asset-library.js'), 'utf8');
    const promptLibrary = readFileSync(resolve(process.cwd(), 'src/asset-manager/prompt-library.js'), 'utf8');
    const icons = readFileSync(resolve(process.cwd(), 'src/asset-manager/icons.js'), 'utf8');
    const runtime = readFileSync(resolve(process.cwd(), 'src/asset-manager/page-runtime.js'), 'utf8');
    expect(entry).toContain("document.dispatchEvent(new Event('asset-manager:refresh-icons'))");
    expect(entry).not.toContain('window.lucide');
    expect(icons).toContain("} from 'lucide'");
    expect(icons).toContain('createIcons({ icons })');
    expect(runtime).toContain("import { initializePageTheme } from '../shared/theme-runtime.js';");
    expect(promptLibrary).not.toContain('onclick=');
    expect(entry).toContain("event.target.closest?.('[data-prompt-check]')");
  });

  it('loads initial page data through its service module', () => {
    const entry = readFileSync(resolve(process.cwd(), 'src/asset-manager/main.js'), 'utf8');
    const assetLibrary = readFileSync(resolve(process.cwd(), 'src/asset-manager/asset-library.js'), 'utf8');
    const html = readFileSync(resolve(process.cwd(), 'src/pages/asset-manager/index.html'), 'utf8');
    const runtime = readFileSync(resolve(process.cwd(), 'src/asset-manager/page-runtime.js'), 'utf8');
    expect(entry).toContain('loadAssetManagerBootstrap()');
    expect(html).toContain('../../asset-manager/page-runtime.js');
    const service = readFileSync(resolve(process.cwd(), 'src/services/asset-manager.js'), 'utf8');
  const uploadService = readFileSync(resolve(process.cwd(), 'src/services/upload-quota.js'), 'utf8');
  expect(uploadService).not.toMatch(/xhr(?:\.upload)?\.on(?:progress|load|error)\s*=/);
  expect(uploadService).toContain("xhr.addEventListener('load'");
    expect(service).toContain('export async function loadAssetManagerBootstrap()');
    expect(uploadService).toContain('export async function upload(form, onProgress)');
    expect(assetLibrary).toContain('const uploaded = await upload(form);');
    expect(assetLibrary).not.toMatch(/probe\.on(?:load|error|loadedmetadata)\s*=/);
    expect(assetLibrary).toContain("probe.addEventListener('loadedmetadata'");
    expect(assetLibrary).toContain("probe.addEventListener('load'");
    expect(assetLibrary).not.toContain('window.MediaForgeUpload.upload');
    expect(entry).not.toMatch(/apiJson\(['"]\/api\//);
  });

  it('keeps shared request helpers inside the page feature module', () => {
    const entry = readFileSync(resolve(process.cwd(), 'src/asset-manager/main.js'), 'utf8');
    expect(entry).toMatch(/async function apiJson\(url, options = \{\}\)/);
    expect(entry).toContain('if (!response.ok) throw new Error');
  });
});
