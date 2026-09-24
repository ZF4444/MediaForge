import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function element() {
  return {
    value: '', textContent: '', innerHTML: '', className: '', style: {}, listeners: {}, dataset: {}, children: [],
    set innerHTML(value) { this._innerHTML = value; this.children = []; },
    get innerHTML() { return this._innerHTML || ''; },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    appendChild(child) { this.children.push(child); },
    querySelectorAll: () => [],
  };
}

describe('feedback admin page module', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('loads feedback records and renders user content as text', async () => {
    const ids = ['fbStatus', 'fbStatusFilter', 'fbTypeFilter', 'fbSearch', 'fbRefreshBtn', 'fbList', 'fbDetail', 'fbMain', 'fbForbidden'];
    const elements = new Map(ids.map(id => [id, element()]));
    vi.stubGlobal('document', {
      readyState: 'complete',
      getElementById: id => {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: () => element(),
    });
    vi.stubGlobal('window', { clearTimeout, setTimeout, confirm: vi.fn() });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ total: 1, items: [{
        id: 'f-1', username: '<alice>', user_id: 'u-1', content: '<img src=x onerror=alert(1)>',
        status: 'open', type: 'issue', created_at: 1, updated_at: 2, admin_note: '', user_agent: '<browser>',
      }] }),
    }));

    await import('../src/pages/feedback-admin/main.js');

    expect(fetch).toHaveBeenCalledWith('/api/feedback/admin?limit=100', { credentials: 'same-origin' });
    await vi.waitFor(() => expect(elements.get('fbStatus').textContent).toBe('共 1 条。'));
    expect(elements.get('fbList').children[0].children[0].children[0].innerHTML).toContain('&lt;alice&gt;');
    expect(elements.get('fbList').children[0].children[1].textContent).toBe('<img src=x onerror=alert(1)>');
    expect(elements.get('fbDetail').innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(elements.get('fbDetail').innerHTML).toContain('fb-user-agent-value');
  });

  it('uses a frontend page document, stylesheet, and module entry', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('../src/pages/feedback-admin/index.html', import.meta.url), 'utf8');
    const config = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');

    expect(html).toContain('/src/pages/feedback-admin/page.css');
    expect(html).toContain('/src/pages/feedback-admin/main.js');
    expect(html).not.toContain('<style>');
    expect(html).not.toContain('onclick=');
    expect(html).not.toContain('/static/vendor/js/lucide.js');
    expect(html).not.toContain('/static/dist/shared/theme.js');
    expect(config).toContain("page: 'feedback-admin', mainSrc: 'frontend/src/pages/feedback-admin/main.js'");
    expect(config).toContain("'feedback-admin'");
  });
});
