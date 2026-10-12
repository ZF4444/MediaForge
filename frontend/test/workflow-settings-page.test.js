import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pagePath = resolve(process.cwd(), 'src/pages/workflow-settings/index.html');
const entryPath = resolve(process.cwd(), 'src/workflow-settings/main.js');

describe('workflow settings page entry', () => {
  it('uses a bundled module entry without vendor globals', () => {
    const html = readFileSync(pagePath, 'utf8');
    const entry = readFileSync(entryPath, 'utf8');

    expect(html).toContain('src="/src/workflow-settings/main.js"');
    expect(html).not.toContain('/static/vendor/');
    expect(html).not.toContain('/static/dist/shared/theme.js');
    expect(html).not.toContain('/static/dist/styles/');
    expect(entry).toContain("from 'lucide'");
    expect(entry).toContain("import '../styles/theme.css'");
    expect(entry).toContain("import '../styles/workflow-settings.css'");
    expect(entry).not.toContain('window.lucide');
    expect(entry).not.toContain('window.StudioTheme');
  });

  it('limits the icon package import to the icons used by this page', () => {
    const entry = readFileSync(entryPath, 'utf8');
    expect(entry).toContain('Inbox, Plus, RefreshCw, Search, Trash2, TriangleAlert');
    expect(entry).not.toContain("import { createIcons, icons }");
  });

  it('keeps workflow API operations in a page service', () => {
    const entry = readFileSync(entryPath, 'utf8');
    const service = readFileSync(resolve(process.cwd(), 'src/services/workflow-settings.js'), 'utf8');

    expect(entry).toContain("from '../services/workflow-settings.js'");
    expect(entry).not.toContain("'/api/workflows'");
    expect(entry).not.toContain("'/api/ai/configuration'");
    expect(service).toContain('listWorkflowSources');
    expect(service).toContain('deleteWorkflowSource');
    expect(service).toContain('setWorkflowSourceEnabled');
  });
});
