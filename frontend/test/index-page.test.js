import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pagePath = resolve(process.cwd(), 'src/pages/index/index.html');
const html = readFileSync(pagePath, 'utf8');
const config = readFileSync(resolve(process.cwd(), 'vite.config.js'), 'utf8');
const entry = readFileSync(resolve(process.cwd(), 'src/index/main.js'), 'utf8');

describe('workbench page entry', () => {
  it('loads its ESM entry and frontend-owned stylesheet', () => {
    expect(html).toContain('<script type="module" src="/src/index/main.js"></script>');
    expect(html).toContain('href="/src/pages/index/index.css"');
    expect(html).not.toMatch(/<script(?![^>]*type="module")[^>]*>/i);
  });

  it('uses delegated navigation and controls instead of inline handlers', () => {
    expect(html).not.toMatch(/\sonclick\s*=/i);
    expect(html).toContain('data-page-id="canvas"');
    expect(html).toContain('data-studio-action="toggle-theme"');
    expect(html).toContain('data-studio-action="reload"');
  });

  it('is registered as a Vite-built module page', () => {
    expect(config).toContain("page: 'index', mainSrc: 'frontend/src/index/main.js'");
    expect(config).toContain("'workflow-settings', 'index'");
    expect(entry).toContain("import { syncThemeToFrame, toggleTheme }");
    expect(entry).toContain("import 'virtual:mediaforge-i18n'");
    expect(readFileSync(resolve(process.cwd(), 'src/index/theme-lang-sync.js'), 'utf8')).toContain("import { StudioTheme } from 'virtual:mediaforge-theme'");
    expect(entry).toContain("import './version-check.js'");
    expect(entry).not.toContain('studioApiChannel.onmessage');
    expect(entry).not.toContain('ws.onmessage');
    expect(entry).toContain("studioApiChannel.addEventListener('message'");
    expect(entry).toContain("ws.addEventListener('message'");
  });
});
