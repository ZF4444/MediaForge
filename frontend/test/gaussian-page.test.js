import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const entryPath = resolve(process.cwd(), 'src/gaussian/main.js');
const pagePath = resolve(process.cwd(), 'src/pages/gaussian/index.html');

describe('Gaussian page module imports', () => {
  it('uses only its required Lucide icons through ESM', () => {
    const entry = readFileSync(entryPath, 'utf8');

    expect(entry).toMatch(/import \{ createIcons, [^}]+\} from 'lucide'/);
    expect(entry).not.toContain('window.lucide');
    expect(entry).not.toContain('lucide.createIcons');
    expect(entry).toContain("import RunningHubClient from '../shared/runninghub-client.js'");
    expect(entry).toContain("import StudioImagePreview from '../shared/image-preview.js'");
    expect(entry).toContain("import HistoryBulkManager from '../shared/history-bulk-manager.js'");
    expect(entry).not.toContain('window.StudioImagePreview');
    expect(entry).not.toContain('window.HistoryBulkManager');
  });

  it('registers every Lucide icon used by the page markup and script', () => {
    const entry = readFileSync(entryPath, 'utf8');
    const html = readFileSync(pagePath, 'utf8');
    const pascal = name => name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
    const used = new Set([...`${html}\n${entry}`.matchAll(/data-lucide=\\?"([a-z0-9-]+)\\?"/g)].map(match => match[1]));
    const registered = entry.match(/const gaussianIcons = \{([^}]*)\}/)[1].split(',').map(name => name.trim());

    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(registered, `icon "${name}" is not registered`).toContain(pascal(name));
  });

  it('owns the Gaussian HTML and styles in the frontend source tree', () => {
    const entry = readFileSync(entryPath, 'utf8');
    const html = readFileSync(pagePath, 'utf8');

    expect(html).toContain('src="../../gaussian/main.js"');
    expect(html).not.toMatch(/<script\s+src="\/static\/vendor|<style\b|\sonclick=/i);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(entry).toContain("import '@tailwindcss/browser'");
    expect(html).toContain('data-gaussian-action="generate"');
    expect(entry).toContain("import '../pages/gaussian/page.css'");
    expect(entry).not.toMatch(/window\.(handleGenerate|handleRepair|zoomImage|closeLightbox|handleOutsideClick|downloadLightboxImage)\s*=/);
    expect(entry).not.toMatch(/(?:reader|probe|img)\.onload\s*=/);
    expect(entry).toContain("reader.addEventListener('load'");
    expect(entry).toContain("img.addEventListener('load'");
  });

  it('uses frontend-managed font assets instead of static vendor URLs', () => {
    const html = readFileSync(pagePath, 'utf8');
    const fonts = readFileSync(resolve(process.cwd(), 'src/styles/fonts.css'), 'utf8');

    expect(html).toContain('../../styles/fonts.css');
    expect(html).not.toContain('/static/vendor/');
    expect(fonts).toContain("url('/fonts/inter-4.ttf')");
  });
});
