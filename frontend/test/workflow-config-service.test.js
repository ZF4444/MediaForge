import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.doUnmock('../src/services/http.js'));

describe('workflow config service', () => {
  it('encodes workflow ids and writes workflow config as JSON', async () => {
    vi.resetModules();
    const request = vi.fn().mockResolvedValue({ config: { title: 'A' } });
    vi.doMock('../src/services/http.js', () => ({ apiJson: request }));
    const { getWorkflow, saveWorkflowConfig } = await import('../src/services/workflow-config.js');

    await getWorkflow('folder/a b.json');
    await saveWorkflowConfig('folder/a b.json', { title: 'B' });

    expect(request).toHaveBeenNthCalledWith(1, '/api/workflows/folder%2Fa%20b.json');
    expect(request).toHaveBeenNthCalledWith(2, '/api/workflows/folder%2Fa%20b.json/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title":"B"}',
    });
  });

  it('builds an encoded cover preview URL', async () => {
    vi.resetModules();
    const { workflowCoverPreviewUrl } = await import('../src/services/workflow-config.js');
    expect(workflowCoverPreviewUrl('folder/file id')).toBe('/api/files/folder%2Ffile%20id/preview');
    expect(workflowCoverPreviewUrl('')).toBe('');
  });

  it('updates AI configuration and creates workflows with JSON bodies', async () => {
    vi.resetModules();
    const request = vi.fn().mockResolvedValue({});
    vi.doMock('../src/services/http.js', () => ({ apiJson: request }));
    const { getAiConfiguration, saveAiConfiguration, createWorkflow } = await import('../src/services/workflow-config.js');

    await getAiConfiguration();
    await saveAiConfiguration({ resources: [] });
    await createWorkflow('Demo', { nodes: [] });

    expect(request).toHaveBeenNthCalledWith(1, '/api/ai/configuration');
    expect(request).toHaveBeenNthCalledWith(2, '/api/ai/configuration', expect.objectContaining({
      method: 'PUT', body: '{"resources":[]}',
    }));
    expect(request).toHaveBeenNthCalledWith(3, '/api/workflows', expect.objectContaining({
      method: 'POST', body: '{"name":"Demo","workflow":{"nodes":[]}}',
    }));
  });

  it('uploads cover files as multipart form data', async () => {
    vi.resetModules();
    const request = vi.fn().mockResolvedValue({ files: [] });
    vi.doMock('../src/services/http.js', () => ({ apiJson: request }));
    const { uploadWorkflowCover } = await import('../src/services/workflow-config.js');
    const file = new File(['image'], 'cover.png', { type: 'image/png' });

    await uploadWorkflowCover(file);

    const [url, options] = request.mock.calls[0];
    expect(url).toBe('/api/local-assets/upload');
    expect(options.method).toBe('POST');
    expect(options.body.get('files')).toBe(file);
  });
});
