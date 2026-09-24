import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pagePath = resolve(process.cwd(), 'src/pages/workflow-config/index.html');

describe('workflow config page entry', () => {
  it('loads theme setup through its page entry module', () => {
    const html = readFileSync(pagePath, 'utf8');
    const entry = readFileSync(resolve(process.cwd(), 'src/workflow-config/main.js'), 'utf8');

    expect(html).not.toContain('theme.js');
    expect(html).not.toContain('/static/dist/shared/theme.js');
    expect(html).toContain('<script type="module" src="../../workflow-config/main.js"></script>');
    expect(entry).toContain("import { applyStoredTheme } from '../shared/theme-bootstrap.js'");
    expect(entry).toContain("from '../services/workflow-config.js'");
    expect(entry).not.toMatch(/apiJson|fetch\(|\/api\//);
  });
});
