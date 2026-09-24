import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function element() {
  return {
    value: '', textContent: '', innerHTML: '', className: '', style: {}, disabled: false,
    children: [], listeners: {}, dataset: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    appendChild(child) { this.children.push(child); },
    querySelectorAll: () => [],
    classList: { toggle: vi.fn() },
  };
}

describe('access control page module', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('loads user types and page permissions using the shared response service', async () => {
    const ids = ['acStatus', 'acTypeList', 'acUserList', 'acPages', 'acDetailEmpty', 'acDetail', 'acTypeName', 'acDetailTitle', 'acDeleteTypeBtn', 'acMain', 'acForbidden', 'acSaveBtn', 'acAddTypeBtn'];
    const elements = new Map(ids.map(id => [id, element()]));
    const defaultType = element();
    defaultType.value = 'new-user';
    const bulk = element();
    bulk.dataset = { val: 'all' };
    vi.stubGlobal('document', {
      readyState: 'complete',
      getElementById: id => elements.get(id) || element(),
      querySelectorAll: selector => selector === '[data-bulk]' ? [bulk] : [],
      createElement: () => element(),
    });
    vi.stubGlobal('window', { prompt: vi.fn(), confirm: vi.fn() });
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

    expect(fetch).toHaveBeenCalledWith('/api/access-control/config', { credentials: 'same-origin' });
    await vi.waitFor(() => expect(elements.get('acMain').classList.toggle).toHaveBeenCalledWith('ac-hidden', false));
    expect(elements.get('acTypeList').children[0].children[1].textContent).toBe('默认用户');
    expect(elements.get('acUserList').children[0].children[0].children[0].textContent).toBe('<alice>');
    expect(elements.get('acPages').children[0].children[1].textContent).toBe('<画布>');
  });

  it('uses the legacy HTML URL with page-owned CSS and module entry', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('../src/pages/access-control/index.html', import.meta.url), 'utf8');

    expect(html).toContain('./page.css');
    expect(html).toContain('../../access-control/main.js');
    expect(html).not.toContain('<style>');
    expect(html).not.toContain('/static/vendor/js/lucide.js');
    expect(html).not.toContain('/static/dist/shared/theme.js');
    expect(html).not.toMatch(/\sstyle=/i);
  });
});
