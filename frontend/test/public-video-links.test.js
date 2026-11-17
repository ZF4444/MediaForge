import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindSource, issueLink, listLinks, revokeScope } from '../src/services/public-video-links.js';

afterEach(() => vi.unstubAllGlobals());

describe('public video management request boundaries', () => {
  it('sends explicit CSRF headers and fresh idempotency keys without persisting tokens', async () => {
    // Model HTTP access through a LAN IP: randomUUID is absent.
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    const requests = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ id: 'opaque-id' }) };
    }));
    await bindSource({ file_id: 'a', task_id: 't', provider_id: 'p' });
    await issueLink('a/b', true);
    await issueLink('a/b', true);
    await revokeScope({ scope: 'file', key: 'a' });
    for (const { options } of requests) {
      expect(options.headers['X-MediaForge-Request']).toBe('1');
      expect(options.credentials).toBe('same-origin');
      expect(options.cache).toBe('no-store');
    }
    expect(requests[1].url).toContain('a%2Fb');
    expect(JSON.parse(requests[1].options.body).rotate).toBe(true);
    expect(JSON.parse(requests[1].options.body).idempotency_key).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.parse(requests[1].options.body).idempotency_key).not.toBe(JSON.parse(requests[2].options.body).idempotency_key);
  });

  it('bounds list requests and preserves server authorization errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ detail: '没有外发链接管理权限' }) })));
    await expect(listLinks(30, 'revoked')).rejects.toThrow('没有外发链接管理权限');
    expect(fetch.mock.calls[0][0]).toBe('/api/public-video-grants?offset=30&limit=30&state=revoked');
  });
});
