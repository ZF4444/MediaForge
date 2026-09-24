import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function createElement() {
  return {
    value: '', checked: false, textContent: '', innerHTML: '', dataset: {}, listeners: {},
    classList: { toggle: vi.fn() },
    replaceWith: vi.fn(),
    addEventListener(type, callback) { this.listeners[type] = callback; },
  };
}

describe('storage quota page module', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('loads page behavior and styles from one frontend module entry', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/pages/storage-quota/index.html'), 'utf8');
    const source = readFileSync(resolve(process.cwd(), 'src/storage-quota/main.js'), 'utf8');

    expect(html).toContain('src="../../storage-quota/main.js"');
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toContain('theme.js');
    expect(source).toContain("import '../pages/storage-quota/page.css'");
  });

  it('loads quota data through the shared API client and renders the summary', async () => {
    const elements = new Map(['status', 'quotaEnabled', 'defaultQuotaGb', 'summaryUsers', 'summaryUsed', 'summaryDefault', 'userTable', 'searchInput', 'saveBtn', 'refreshBtn'].map(id => [id, createElement()]));
    vi.stubGlobal('document', {
      getElementById: id => elements.get(id),
      querySelectorAll: () => [],
      addEventListener: vi.fn(),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        config: { enabled: true, default_quota_bytes: 5 * 1024 ** 3, users: {} },
        users: [{ user_id: 'u-1', username: 'alice', used_bytes: 1024, effective_quota_bytes: 10 * 1024 ** 3 }],
      }),
    }));

    await import('../src/storage-quota/main.js');
    await vi.waitFor(() => expect(elements.get('summaryUsers').textContent).toBe('1'));

    expect(fetch).toHaveBeenCalledWith('/api/storage/config', {});
    expect(elements.get('summaryDefault').textContent).toBe('5 GB');
    expect(elements.get('userTable').innerHTML).toContain('alice');
    expect(elements.get('status').textContent).toBe('准备就绪');
  });
});
