import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('RunningHub workflow settings page entry', () => {
  it('owns the page shell and styles in frontend', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/pages/rh-workflow-settings/index.html'), 'utf8');
    expect(html).toContain('../../rh-workflow-settings/runtime.js');
    expect(html).toContain('/static/dist/styles/rh-workflow-settings.css');
    expect(html).not.toContain('/static/dist/rh-workflow-settings/main.js');
    expect(html).not.toContain('/static/dist/workflow-settings/rh-workflow-editor.js');
    expect(html).not.toContain('/static/vendor/js/lucide.js');
    expect(html).not.toContain('/static/dist/shared/theme.js');
    expect(html).not.toMatch(/on(?:click|input|change|dblclick)=/i);
  });

  it('uses the npm Lucide module boundary', () => {
    const runtime = readFileSync(resolve(process.cwd(), 'src/rh-workflow-settings/runtime.js'), 'utf8');
    expect(runtime).not.toContain("from 'lucide'");
    expect(runtime).toContain("from 'virtual:rh-workflow-settings-features'");
    expect(runtime).toContain("import 'virtual:mediaforge-theme';");
    expect(runtime).not.toContain('window.lucide');
    const config = readFileSync(resolve(process.cwd(), 'vite.config.js'), 'utf8');
    expect(config).toContain(".replaceAll('window.lucide', 'lucide')");
  });

  it('keeps dynamic editor templates free of inline event handlers', () => {
    const sources = [
      'src/rh-workflow-settings/main.js',
      'src/workflow-settings/rh-workflow-editor.js',
    ].map(path => readFileSync(resolve(process.cwd(), path), 'utf8')).join('\n');
    expect(sources).not.toMatch(/\bon(?:click|input|change|mousedown|dblclick)=/i);
    expect(sources).not.toMatch(/input\.onchange\s*=/);
    expect(sources).toContain("input.addEventListener('change'");
  });
});
