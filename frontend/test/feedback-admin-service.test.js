import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteFeedback, listFeedback, updateFeedback } from '../src/services/feedback-admin.js';

afterEach(() => vi.unstubAllGlobals());

describe('feedback admin service', () => {
  it('builds a filtered list request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [], total: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await listFeedback({ status: 'open', type: 'issue', query: 'shader test' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/feedback/admin?status=open&type=issue&q=shader+test&limit=100',
      { credentials: 'same-origin' },
    );
  });

  it('sends updates and deletes by encoded feedback id', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ item: { id: 'f/1' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await updateFeedback('f/1', { status: 'resolved', admin_note: 'done' });
    await deleteFeedback('f/1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/feedback/admin/f%2F1', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', admin_note: 'done' }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/feedback/admin/f%2F1', {
      credentials: 'same-origin',
      method: 'DELETE',
    });
  });

  it('preserves the forbidden status for the page permission state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'forbidden' }),
    }));

    await expect(listFeedback()).rejects.toMatchObject({ code: 403, message: 'forbidden' });
  });
});
