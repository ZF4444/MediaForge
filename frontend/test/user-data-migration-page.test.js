import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function element() {
  return {
    value: '', checked: false, disabled: false, hidden: false, textContent: '', innerHTML: '', listeners: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
  };
}

describe('user data migration page module', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('looks up a source and renders an escaped canvas list', async () => {
    const elements = new Map(['username', 'lookup', 'status', 'list', 'confirm', 'check', 'execute'].map(id => [id, element()]));
    vi.stubGlobal('document', { getElementById: id => elements.get(id) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ source: { username: '<alice>', user_id: 'u-1' }, canvases: [{ title: '<canvas>', updated_at: 0 }] }),
    }));
    elements.get('username').value = 'alice';

    await import('../src/user-data-migration/main.js');
    await elements.get('lookup').listeners.click();

    expect(fetch).toHaveBeenCalledWith('/api/user-data-migration/source?username=alice', {});
    expect(elements.get('list').innerHTML).toContain('&lt;alice&gt;');
    expect(elements.get('list').innerHTML).toContain('&lt;canvas&gt;');
    expect(elements.get('confirm').hidden).toBe(false);
  });

  it('shows an alert after the migration completes', async () => {
    const elements = new Map(['username', 'lookup', 'status', 'list', 'confirm', 'check', 'execute'].map(id => [id, element()]));
    vi.stubGlobal('document', { getElementById: id => elements.get(id) });
    vi.stubGlobal('window', { confirm: vi.fn().mockReturnValue(true), alert: vi.fn() });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ source: { username: 'alice', user_id: 'u-1' }, canvases: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }));
    elements.get('username').value = 'alice';

    await import('../src/user-data-migration/main.js');
    await elements.get('lookup').listeners.click();
    await elements.get('execute').listeners.click();

    expect(window.alert).toHaveBeenCalledWith('迁移完成，账号 alice 已删除。');
    expect(elements.get('confirm').hidden).toBe(true);
  });
});
