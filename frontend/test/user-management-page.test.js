import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('lucide/dist/esm/lucide.mjs', () => ({ createIcons: vi.fn() }));
const directory = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('../src/user-management/user-directory.js', () => ({ initUserDirectory: () => directory }));

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

  it('refreshes the user directory when the users view opens', async () => {
    directory.refresh.mockClear();
    const elements = new Map();
    const tab = { dataset: { tab: 'users' }, classList: { toggle: vi.fn() }, addEventListener: vi.fn() };
    vi.stubGlobal('document', {
      getElementById: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      querySelectorAll: selector => selector === '.tab' ? [tab] : [],
      querySelector: () => null,
    });
    vi.stubGlobal('location', { hash: '#users' });
    vi.stubGlobal('history', { replaceState: vi.fn() });
    await import('../src/user-management/main.js');
    expect(directory.refresh).toHaveBeenCalledOnce();
    tab.addEventListener.mock.calls[0][1]();
    expect(directory.refresh).toHaveBeenCalledTimes(2);
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
