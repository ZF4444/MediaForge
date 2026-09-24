import { afterEach, describe, expect, it, vi } from 'vitest';

describe('asset manager bootstrap service', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads required libraries and tolerates unavailable optional sources', async () => {
    const requests = [];
    vi.stubGlobal('fetch', vi.fn(async url => {
      requests.push(url);
      if (url === '/api/asset-library') return { ok: true, json: async () => ({ library: { libraries: ['assets'] } }) };
      if (url === '/api/prompt-libraries') return { ok: true, json: async () => ({ library: { libraries: ['prompts'] } }) };
      return { ok: false, json: async () => ({ detail: 'forbidden' }) };
    }));

    const { loadAssetManagerBootstrap } = await import('../src/services/asset-manager.js');
    const result = await loadAssetManagerBootstrap();

    expect(requests).toHaveLength(5);
    expect(result.assets.library.libraries).toEqual(['assets']);
    expect(result.prompts.library.libraries).toEqual(['prompts']);
    expect(result.configuration).toEqual({ connections: [], models: [] });
    expect(result.me).toEqual({ user_id: '', pages: [] });
    expect(result.usage).toEqual({ usage_by_category: [] });
  });
});
