import { describe, expect, it, vi } from 'vitest';

describe('storage quota service', () => {
  it('loads configuration through the shared client', async () => {
    vi.resetModules();
    const request = vi.fn().mockResolvedValue({ config: {}, users: [] });
    vi.doMock('../src/services/http.js', () => ({ apiJson: request }));
    const { loadStorageQuota } = await import('../src/services/storage-quota.js');
    await loadStorageQuota();
    expect(request).toHaveBeenCalledWith('/api/storage/config');
  });

  it('saves configuration with a JSON PUT payload', async () => {
    vi.resetModules();
    const request = vi.fn().mockResolvedValue({ config: {}, users: [] });
    vi.doMock('../src/services/http.js', () => ({ apiJson: request }));
    const { saveStorageQuota } = await import('../src/services/storage-quota.js');
    await saveStorageQuota({ enabled: false, default_quota_bytes: null, users: {} });
    expect(request).toHaveBeenCalledWith('/api/storage/config', expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{"enabled":false,"default_quota_bytes":null,"users":{}}',
    }));
  });
});
