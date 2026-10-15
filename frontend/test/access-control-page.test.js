import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function element() {
  return {
    value: '', textContent: '', innerHTML: '', className: '', style: {}, disabled: false,
    children: [], listeners: {}, dataset: {}, hidden: true,
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute: vi.fn(),
    addEventListener(type, callback) { this.listeners[type] = callback; },
    appendChild(child) { this.children.push(child); },
    querySelectorAll: () => [],
    classList: { toggle: vi.fn() },
  };
}

describe('access control page module', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('loads user types and page permissions using the shared response service', async () => {
    vi.useFakeTimers();
    const elements = new Map();
    const getElement = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
    vi.stubGlobal('document', {
      readyState: 'complete',
      getElementById: getElement,
      querySelectorAll: () => [],
      createElement: () => element(),
    });
    vi.stubGlobal('window', { addEventListener: vi.fn(), setInterval: vi.fn() });
    vi.stubGlobal('Option', function (text, value) { return { textContent: text, value }; });
    document.addEventListener = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        all_pages: [{ id: 'canvas', label: '<画布>' }],
        users: [{ username: '<alice>', user_id: 'u-1' }],
      types: {
        'new-user': { name: '默认用户', pages: ['canvas'] },
        'sys-admin': { name: '系统管理员', pages: ['canvas'] },
      },
        user_types: { 'u-1': 'new-user' },
      }),
    }));

    await import('../src/access-control/main.js');

    expect(fetch).toHaveBeenCalledWith('/api/access-control/config', {});
    await vi.waitFor(() => expect(elements.get('workspace').hidden).toBe(false));
    expect(elements.get('typeTitle').textContent).toBe('默认用户');
    expect(elements.get('pageList').children[0].children[1].textContent).toBe('<画布>');
    expect(elements.get('saveButton').disabled).toBe(true);
  });

  it('uses the legacy HTML URL with page-owned CSS and module entry', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('../src/pages/access-control/index.html', import.meta.url), 'utf8');

    expect(html).toContain('./page.css');
    expect(html).not.toContain('用户分配');
    expect(html).not.toContain('membersView');
    expect(html).toContain('../../access-control/main.js');
    expect(html).not.toContain('<style>');
    expect(html).not.toContain('/static/vendor/js/lucide.js');
    expect(html).not.toContain('/static/dist/shared/theme.js');
    expect(html).not.toMatch(/\sstyle=/i);
  });
});
