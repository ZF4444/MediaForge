import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('lucide/dist/esm/lucide.mjs', () => ({ createIcons: vi.fn() }));

function element(data = {}) {
  return {
    ...data,
    value: '', checked: false, textContent: '', innerHTML: '', listeners: {}, dataset: {},
    classList: { toggle: vi.fn() },
    addEventListener(type, callback) { this.listeners[type] = callback; },
  };
}

describe('user management page module', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('uses the legacy page URL and a module stylesheet/entry without inline styles', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('../src/pages/user-management/index.html', import.meta.url), 'utf8');

    expect(html).toContain('<link rel="stylesheet" href="./page.css">');
    expect(html).toContain('../../user-management/main.js');
    expect(html).not.toContain('<style>');
    expect(html).not.toContain('/static/vendor/js/lucide.js');
    expect(html).not.toContain('/static/dist/shared/theme.js');
    expect(html).not.toMatch(/\sstyle=/i);
  });

  it('delegates user-type changes through the shared API client', async () => {
    const ids = ['userTable', 'orgList', 'budgetGrid', 'personalBudgetGrid', 'search', 'orgForm', 'usageMonth', 'syncOmnilojo', 'newUserBudgetSave', 'refreshSessions', 'onlineOnly', 'userCount', 'userTable', 'orgList', 'status', 'orgStatus'];
    const elements = new Map(ids.map(id => [id, element()]));
    const tabs = [{ dataset: { tab: 'users' }, classList: { toggle: vi.fn() }, addEventListener: vi.fn() }];
    const views = [{ dataset: { view: 'users' }, classList: { toggle: vi.fn() } }];
    vi.stubGlobal('document', {
      getElementById: id => elements.get(id) || element(),
      querySelectorAll: selector => selector === '.tab' ? tabs : selector === '.view' ? views : [],
      querySelector: () => null,
    });
    vi.stubGlobal('location', { hash: '#users' });
    vi.stubGlobal('history', { replaceState: vi.fn() });
    vi.stubGlobal('CSS', { escape: value => value });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ organizations: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ users: [], types: {}, user_types: {} }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user_type: 'member' }) }));

    await import('../src/user-management/main.js');
    const event = { target: { matches: selector => selector === '[data-user-type]', dataset: { userType: 'u-7' }, value: 'member' } };
    elements.get('userTable').listeners.change(event);

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/access-control/users/u-7/type', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type_id: 'member' }),
      });
      expect(elements.get('status').textContent).toBe('用户类型已更新');
    });
  });

  it('keeps user management API endpoints in its service module', async () => {
    const { readFile } = await import('node:fs/promises');
    const [entry, service] = await Promise.all([
      readFile(new URL('../src/user-management/main.js', import.meta.url), 'utf8'),
      readFile(new URL('../src/services/user-management.js', import.meta.url), 'utf8'),
    ]);

    expect(entry).toContain("from '../services/user-management.js'");
    expect(entry).not.toContain("'/api/");
    expect(entry).not.toContain('apiJson(');
    expect(entry).not.toContain('apiResponse(');
    expect(service).toContain("'/api/access-control/users'");
    expect(service).toContain("'/api/organizations'");
    expect(service).toContain('loadUsage');
  });
});
