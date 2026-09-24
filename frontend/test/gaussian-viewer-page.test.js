import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const entry = readFileSync(resolve(process.cwd(), 'src/gaussian-viewer/main.js'), 'utf8');
const html = readFileSync(resolve(process.cwd(), 'src/pages/gaussian-viewer/index.html'), 'utf8');
const css = readFileSync(resolve(process.cwd(), 'src/pages/gaussian-viewer/page.css'), 'utf8');

describe('Gaussian viewer page ownership', () => {
  it('uses frontend-owned markup and styles with the Vite module entry', () => {
    expect(html).toContain('src="../../gaussian-viewer/main.js"');
    expect(html).toContain('href="./page.css"');
    expect(html).not.toMatch(/<style\b/);
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/<script\s+src=/i);
    expect(css).toContain('#viewerContainer');
  });

  it('imports the shared RunningHub client instead of relying on script order', () => {
    expect(entry).toContain("import RunningHubClient from '../shared/runninghub-client.js'");
    expect(entry).not.toContain('window.RunningHubClient');
    expect(entry).toContain("import SPLAT from '../vendor/gsplat-bundle.js'");
    expect(entry).toContain("import PreciseOrbitControls from './precise-orbit-controls.js'");
    expect(entry).not.toMatch(/window\.(GSPLAT|PreciseOrbitControls)/);
    expect(entry).not.toMatch(/img\.on(?:load|error)\s*=/);
    expect(entry).toContain("img.addEventListener('load'");
    expect(entry).toContain("img.addEventListener('error'");
  });
});
