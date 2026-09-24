import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pagePath = resolve(process.cwd(), 'src/pages/pose-studio/index.html');
const entryPath = resolve(process.cwd(), 'src/pose-studio/main.js');
const stylePath = resolve(process.cwd(), 'src/pages/pose-studio/page.css');

describe('pose studio page modules', () => {
  it('uses the npm icon module and local page services', () => {
    const entry = readFileSync(entryPath, 'utf8');

    expect(entry).toContain("import { createIcons, icons } from 'lucide'");
    expect(entry).toContain("import 'virtual:mediaforge-theme'");
    expect(entry).not.toContain('window.lucide');
    expect(entry).not.toContain('window.readResponsePayload');
    expect(entry).not.toContain('window.responseErrorMessage');
  });

  it('keeps the legacy path while removing inline styles and event handlers', () => {
    const html = readFileSync(pagePath, 'utf8');
    const css = readFileSync(stylePath, 'utf8');

    expect(html).toContain('../../pose-studio/main.js');
    expect(html).toContain('./page.css');
    expect(html).not.toMatch(/<style\b|<script\s+src="\/static\/vendor|<script\s+src="\/static\/dist\/shared|\sonclick=|\sonchange=|\sstyle=/i);
    expect(css).toContain('.pose-workspace');
  });

  it('uses delegated pose actions rather than page-global handlers', () => {
    const html = readFileSync(pagePath, 'utf8');
    const entry = readFileSync(entryPath, 'utf8');

    expect(html).toContain('data-pose-action="generate-fbx"');
    expect(html).toContain('data-pose-action="transfer"');
    expect(entry).toContain("event.target.closest('[data-pose-action]')");
    expect(entry).not.toContain('window.generateFbx');
    expect(entry).not.toContain('window.transferPose');
    expect(entry).not.toMatch(/reader\.on(?:load|error)\s*=/);
    expect(entry).toContain("reader.addEventListener('load'");
  });
});
