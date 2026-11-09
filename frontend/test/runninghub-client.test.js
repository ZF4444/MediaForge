import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiJson = vi.fn();
vi.mock('../src/services/http.js', () => ({ apiJson: (...args) => apiJson(...args) }));

const { default: RunningHubClient } = await import('../src/shared/runninghub-client.js');

describe('RunningHubClient.resolveTarget', () => {
  beforeEach(() => apiJson.mockReset());

  it('resolves a resource whose enabled switch is off, so non-canvas pages keep working', async () => {
    apiJson.mockResolvedValue({
      resources: [
        { id: 'res-off', connection_id: 'conn-1', kind: 'runninghub_app', enabled: false, settings: { app_id: 'app-1' } },
      ],
    });

    await expect(RunningHubClient.resolveTarget('app-1')).resolves.toEqual({
      connection_id: 'conn-1',
      resource_id: 'res-off',
    });
  });

  it('reports a missing resource without calling it "enabled"', async () => {
    apiJson.mockResolvedValue({ resources: [] });

    await expect(RunningHubClient.resolveTarget('app-x')).rejects.toThrow('未找到 RunningHub 应用资源：app-x');
  });
});
