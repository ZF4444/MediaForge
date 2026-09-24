import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const entryPath = resolve(process.cwd(), 'src/angle/main.js');
const modulePath = resolve(process.cwd(), 'src/angle/module.js');
const pagePath = resolve(process.cwd(), 'src/pages/angle/index.html');
const stylePath = resolve(process.cwd(), 'src/styles/angle.css');

describe('angle page module imports', () => {
  it('uses the npm icon module instead of the global Lucide script', () => {
    const entry = readFileSync(entryPath, 'utf8');
    const html = readFileSync(resolve(process.cwd(), '../static/angle.html'), 'utf8');

    expect(entry).toContain("from 'lucide'");
    expect(entry).not.toContain('lucide.createIcons');
    expect(html).not.toContain('/static/vendor/js/lucide.js');
  });

  it('keeps page styles and event bindings in frontend modules', () => {
    const entry = readFileSync(entryPath, 'utf8');
    const page = readFileSync(pagePath, 'utf8');
    const styles = readFileSync(stylePath, 'utf8');

    expect(entry).toContain("'../styles/angle.css'");
    expect(page).not.toMatch(/<style\b|\sonclick=|\soninput=|\sstyle=/i);
    expect(styles).toContain('.container-box');
  });

  it('uses module exports for camera controls instead of window bridges', () => {
    const entry = readFileSync(entryPath, 'utf8');
    const moduleSource = readFileSync(modulePath, 'utf8');

    expect(entry).toContain("import { angleControl, updateCloudProgress } from './module.js'");
    expect(moduleSource).toContain('export const angleControl = createAngleCamera()');
    expect(moduleSource).not.toMatch(/window\.(updateCamera|syncInput|resetControl|angleControl|buildAnglePrompt|update3DTexture|updateCloudProgress)/);
  });

  it('loads shared behavior as modules without classic page scripts', () => {
    const entry = readFileSync(entryPath, 'utf8');
    const page = readFileSync(pagePath, 'utf8');

    expect(entry).toContain("from '../shared/runninghub-client.js'");
    expect(entry).toContain("from '../shared/image-preview.js'");
    expect(entry).toContain("from '../shared/history-bulk-manager.js'");
    expect(page).not.toMatch(/<script\s+src="\/static\/dist\/shared\//i);
  });

  it('loads Tailwind from npm and frontend-managed font assets', () => {
    const entry = readFileSync(entryPath, 'utf8');
    const page = readFileSync(pagePath, 'utf8');

    expect(entry).toContain("import '@tailwindcss/browser'");
    expect(page).toContain('../../styles/fonts.css');
    expect(page).not.toContain('/static/vendor/');
  });

  it('initializes page behavior without DOMContentLoaded or inline event handlers', () => {
    const entry = readFileSync(entryPath, 'utf8');
    const page = readFileSync(pagePath, 'utf8');

    expect(entry).not.toContain('DOMContentLoaded');
    expect(entry).not.toMatch(/\.on(?:click|change)\s*=/);
    expect(page).not.toMatch(/\son(?:click|change|input|submit)=/i);
  });
});
