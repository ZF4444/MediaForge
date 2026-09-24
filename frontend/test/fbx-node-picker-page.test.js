import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pagePath = resolve(process.cwd(), 'src/pages/fbx-node-picker/index.html');
const entryPath = resolve(process.cwd(), 'src/fbx-node-picker/main.js');

describe('FBX node picker page entry', () => {
  it('is owned by the frontend source tree and loads a module entry', () => {
    const html = readFileSync(pagePath, 'utf8');
    const entry = readFileSync(entryPath, 'utf8');

    expect(html).toContain('src="../../fbx-node-picker/main.js"');
    expect(html).not.toContain('/static/vendor/');
    expect(html).not.toContain('/static/dist/shared/theme.js');
    expect(html).not.toContain('<style>');
    expect(entry).toContain("import * as THREE from 'three'");
    expect(entry).toContain("from 'three/addons/controls/OrbitControls.js'");
    expect(entry).toContain("import './page.css'");
    expect(entry).not.toContain('window.THREE');
    expect(entry).not.toContain('row.onclick');
    expect(entry).toContain("row.addEventListener('click'");
  });
});
