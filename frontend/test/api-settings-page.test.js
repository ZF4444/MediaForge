import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pagePath = resolve(process.cwd(), 'src/pages/api-settings/index.html');

describe('api settings compatibility page', () => {
  it('keeps the legacy URL as a frontend-owned module page', () => {
    const html = readFileSync(pagePath, 'utf8');
    const entry = readFileSync(resolve(process.cwd(), 'src/api-settings/main.js'), 'utf8');

    expect(html).toContain('<script type="module" src="../../api-settings/main.js"></script>');
    expect(html).not.toContain('static/js/');
    expect(entry).toContain("window.location.replace('/static/ai-connections.html')");
  });
});
