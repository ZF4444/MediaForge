import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const elements = () => {
  const makeElement = () => ({
    value: '',
    textContent: '',
    className: '',
    disabled: false,
    listeners: {},
    classList: { add: vi.fn() },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    focus: vi.fn(),
  });
  const byId = new Map(['authForm', 'username', 'msg', 'submitBtn', 'tabLogin'].map(id => [id, makeElement()]));
  vi.stubGlobal('document', {
    documentElement: { classList: { add: vi.fn() } },
    getElementById: id => byId.get(id),
  });
  vi.stubGlobal('localStorage', { getItem: () => 'light' });
  return byId;
};

describe('login page module', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('uses the Vite page entry and frontend-owned styles', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/pages/login/index.html'), 'utf8');
    const entry = readFileSync(resolve(process.cwd(), 'src/pages/login/main.js'), 'utf8');

    expect(html).toContain('<script type="module" src="../../pages/login/main.js"></script>');
    expect(html).not.toContain('/static/dist/styles/');
    expect(entry).toContain("import '../../styles/login.css'");
  });

  it('requires a username before sending the login request', async () => {
    const byId = elements();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await import('../src/pages/login/main.js');
    await byId.get('authForm').listeners.submit({ preventDefault: vi.fn() });

    expect(byId.get('msg').textContent).toBe('请输入用户名。');
    expect(byId.get('username').focus).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the normalized username and navigates after success', async () => {
    const byId = elements();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { location: { href: '/login' } });
    byId.get('username').value = '  zhangsan  ';

    await import('../src/pages/login/main.js');
    await byId.get('authForm').listeners.submit({ preventDefault: vi.fn() });

    expect(fetchMock).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'zhangsan' }),
    });
    expect(window.location.href).toBe('/');
    expect(byId.get('submitBtn').disabled).toBe(false);
  });
});
