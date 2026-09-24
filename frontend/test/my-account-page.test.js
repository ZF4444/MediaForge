import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('lucide/dist/esm/lucide.mjs', () => ({ createIcons: vi.fn() }));

function element() {
  return {
    textContent: '', innerHTML: '', className: '', disabled: false, listeners: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    querySelector: () => ({ textContent: '' }),
  };
}

describe('my account page module', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('loads overview data via shared API and renders profile and activity', async () => {
    const elements = new Map(['period', 'profile', 'content', 'refresh', 'logout'].map(id => [id, element()]));
    vi.stubGlobal('document', { getElementById: id => elements.get(id) });
    vi.stubGlobal('location', { origin: 'https://studio.test' });
    vi.stubGlobal('parent', { postMessage: vi.fn() });
    vi.stubGlobal('window', { addEventListener: vi.fn(), top: { location: { href: '' } } });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        month: '2026-09', profile: { username: 'alice', user_id: 'u-1' },
        spending: { total_usd: 2, runninghub_usd: 1, omnilojo_usd: 1 },
        records: [{ source: 'image', reference: 'task-1', cost_usd: 2 }],
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ used_bytes: 2048, total_files: 1 }) }));

    await import('../src/my-account/main.js');
    await vi.waitFor(() => expect(elements.get('content').innerHTML).toContain('task-1'));

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/account/overview', {});
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/storage/usage', {});
    expect(elements.get('profile').innerHTML).toContain('alice');
    expect(elements.get('period').textContent).toBe('2026-09 账户概览');
  });
});
