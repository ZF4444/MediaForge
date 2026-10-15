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

describe('structured API errors', () => {
  it('shows the budget message and preserves its structured payload', async () => {
    const data = { detail: { error_code: 'usage_budget_exceeded', message: '个人本月 USD 预算已用尽，无法继续提交任务。', contact_admin: true } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => data }));
    const error = await apiJson('/api/canvas-video').catch(error => error);
    expect(error.message).toBe(data.detail.message);
    expect(error.data).toEqual(data);
    expect(error.status).toBe(429);
  });

  it('formats validation errors as readable text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: [{ msg: '模型不能为空' }] }) }));
    await expect(apiJson('/api/example')).rejects.toThrow('模型不能为空');
  });
});

it('formats structured errors consistently for text, blob, stream and form requests', async () => {
  const { apiText, apiBlob, apiStream, apiForm } = await import('../src/services/http.js');
  const data = { detail: { message: '存储空间不足', error_code: 'storage_quota_exceeded' } };
  for (const request of [apiText, apiBlob, apiStream, url => apiForm(url, {})]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 413, text: async () => JSON.stringify(data), json: async () => data }));
    const error = await request('/api/example').catch(error => error);
    expect(error.message).toBe('存储空间不足');
    expect(error.status).toBe(413);
    expect(error.data).toEqual(data);
  }
});


describe('model permission notifications', () => {
  afterEach(() => { delete globalThis.__MediaForgeRuntimeServices.showModelPermissionDialog; vi.restoreAllMocks(); });

  it('opens the permission dialog for JSON, stream and form failures and preserves rejection', async () => {
    const { apiStream, apiForm, notifyModelAccessDenied } = await import('../src/services/http.js');
    const showDialog = vi.fn();
    globalThis.__MediaForgeRuntimeServices.showModelPermissionDialog = showDialog;
    const data = { detail: '没有权限使用该模型，请联系管理员开放。' };
    for (const request of [apiJson, apiStream, url => apiForm(url, {})]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => data, text: async () => JSON.stringify(data) }));
      const error = await request('/api/generate').catch(error => error);
      expect(error.status).toBe(403);
      expect(error.modelAccessDeniedNotified).toBe(true);
      notifyModelAccessDenied(error);
    }
    expect(showDialog).toHaveBeenCalledTimes(3);
    expect(showDialog).toHaveBeenCalledWith({ message: data.detail });
  });

  it('does not treat other permission or upstream errors as model authorization failures', async () => {
    const { notifyModelAccessDenied } = await import('../src/services/http.js');
    const showDialog = vi.fn();
    globalThis.__MediaForgeRuntimeServices.showModelPermissionDialog = showDialog;
    expect(notifyModelAccessDenied(Object.assign(new Error('无权访问该画布'), {status:403}))).toBe(false);
    expect(notifyModelAccessDenied(Object.assign(new Error('没有权限使用该模型'), {status:500}))).toBe(false);
    expect(showDialog).not.toHaveBeenCalled();
  });
});
