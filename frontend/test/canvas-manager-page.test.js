import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('lucide/dist/esm/lucide.mjs', () => ({ createIcons: vi.fn() }));

function element() {
  return {
    value: '', textContent: '', innerHTML: '', listeners: {}, dataset: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    setAttribute: vi.fn(), removeAttribute: vi.fn(),
    querySelectorAll: () => [],
  };
}

describe('canvas manager page module', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('loads and safely renders canvases through the shared API client', async () => {
    const ids = ['canvasList', 'canvasCount', 'createForm', 'canvasTitleInput', 'refreshBtn', 'importBtn', 'importInput', 'canvasSearch', 'canvasSort'];
    const elements = new Map(ids.map(id => [id, element()]));
    vi.stubGlobal('document', {
      getElementById: id => elements.get(id),
      addEventListener: vi.fn(),
    });
    vi.stubGlobal('window', { alert: vi.fn() });
    vi.stubGlobal('location', { href: '' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ canvases: [
        { id: 'c-1', title: '<script>alert(1)</script>', updated_at: 2 },
        { id: 'c-2', title: 'Landscape', updated_at: 1 },
      ] }),
    }));

    await import('../src/canvas-manager/main.js');

    await vi.waitFor(() => expect(elements.get('canvasCount').textContent).toBe('2'));
    expect(fetch).toHaveBeenCalledWith('/api/canvases', {});
    expect(elements.get('canvasList').innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(elements.get('canvasList').innerHTML).not.toContain('<script>alert(1)</script>');
  });

  it('keeps the legacy page URL while loading styles and behavior as modules', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('../src/pages/canvas-manager/index.html', import.meta.url), 'utf8');

    expect(html).toContain('../../styles/canvas-manager.css');
    expect(html).toContain('../../canvas-manager/main.js');
    expect(html).not.toContain('<style>');
    expect(html).not.toContain('onclick=');
    expect(html).not.toContain('/static/vendor/js/lucide.js');
    expect(html).not.toContain('/static/dist/shared/theme.js');
  });
});
