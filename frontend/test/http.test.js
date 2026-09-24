import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiJson, apiResponse } from '../src/services/http.js';

describe('apiJson', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns decoded JSON for successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ value: 42 }),
    }));

    await expect(apiJson('/api/example')).resolves.toEqual({ value: 42 });
    expect(fetch).toHaveBeenCalledWith('/api/example', {});
  });

  it('surfaces server detail for failed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: '权限不足' }),
    }));

    await expect(apiJson('/api/example')).rejects.toThrow('权限不足');
  });

  it('uses a stable fallback when an error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => { throw new Error('invalid json'); },
    }));

    await expect(apiJson('/api/example', { method: 'POST' })).rejects.toThrow('操作失败');
  });

  it('does not forward the response policy flag to fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: '验证未通过' }),
    }));

    await expect(apiJson('/api/example', { method: 'POST', allowErrorResponse: true })).resolves.toEqual({ detail: '验证未通过' });
    expect(fetch).toHaveBeenCalledWith('/api/example', { method: 'POST' });
  });

  it('returns status and payload when callers need optional failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: '上游暂不可用' }),
    }));

    await expect(apiResponse('/api/example')).resolves.toEqual({
      ok: false,
      status: 503,
      data: { detail: '上游暂不可用' },
    });
  });
});
