import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteWorkflowSource,
  listWorkflowSources,
  setWorkflowSourceEnabled,
} from '../src/services/workflow-settings.js';

afterEach(() => vi.unstubAllGlobals());

function response(data, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => data };
}

describe('workflow settings service', () => {
  it('loads ComfyUI workflows and configured resources independently', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ workflows: [{ name: 'local.json' }] }))
      .mockResolvedValueOnce(response({ resources: [{ id: 'rh-1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listWorkflowSources()).resolves.toEqual({
      workflows: [{ name: 'local.json' }],
      resources: [{ id: 'rh-1' }],
      failed: [],
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/workflows', '/api/ai/configuration',
    ]);
  });

  it('deletes a ComfyUI workflow using an encoded name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal('fetch', fetchMock);

    await deleteWorkflowSource({ source: 'comfyui', id: 'folder/a b.json' });

    expect(fetchMock).toHaveBeenCalledWith('/api/workflows/folder%2Fa%20b.json', {
      method: 'DELETE',
    });
  });

  it('updates only the selected resource enabled state', async () => {
    const configuration = {
      connections: [],
      resources: [
        { id: 'target', enabled: true },
        { id: 'other', enabled: true },
      ],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(configuration))
      .mockResolvedValueOnce(response({ ...configuration, resources: [
        { id: 'target', enabled: false },
        { id: 'other', enabled: true },
      ] }));
    vi.stubGlobal('fetch', fetchMock);

    await setWorkflowSourceEnabled({ source: 'runninghub', resourceId: 'target' }, false);

    expect(JSON.parse(fetchMock.mock.calls[1][1].body).resources).toEqual([
      { id: 'target', enabled: false },
      { id: 'other', enabled: true },
    ]);
  });

  it('updates a ComfyUI resource through the shared configuration endpoint', async () => {
    const configuration = {
      connections: [{ id: 'keep', protocol: 'comfyui' }],
      resources: [{ id: 'cloud', kind: 'comfyui_workflow', enabled: true }],
      version: 3,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(configuration))
      .mockResolvedValueOnce(response({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await setWorkflowSourceEnabled({ source: 'comfyui_resource', resourceId: 'cloud' }, false);

    expect(fetchMock.mock.calls[1][0]).toBe('/api/ai/configuration');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      ...configuration,
      resources: [{ id: 'cloud', kind: 'comfyui_workflow', enabled: false }],
    });
  });

  it('removes only the selected resource', async () => {
    const configuration = {
      resources: [{ id: 'target' }, { id: 'other' }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(configuration))
      .mockResolvedValueOnce(response({ resources: [{ id: 'other' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteWorkflowSource({ source: 'comfyui_resource', resourceId: 'target' });

    expect(JSON.parse(fetchMock.mock.calls[1][1].body).resources).toEqual([{ id: 'other' }]);
  });
});
