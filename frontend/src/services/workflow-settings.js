import { apiJson } from './http.js';

const workflowUrl = name => `/api/workflows/${encodeURIComponent(name)}`;

export async function listWorkflowSources() {
  // The two sources load independently; `failed` tells the page which one is
  // missing so it can warn instead of silently showing a partial list.
  const failed = [];
  const [comfy, configuration] = await Promise.all([
    apiJson('/api/workflows').catch(() => { failed.push('comfyui'); return { workflows: [] }; }),
    apiJson('/api/ai/configuration').catch(() => { failed.push('resources'); return { resources: [] }; }),
  ]);
  return {
    workflows: comfy.workflows || [],
    resources: configuration.resources || [],
    failed,
  };
}

async function updateResources(transform) {
  const configuration = await apiJson('/api/ai/configuration');
  const resources = transform(configuration.resources || []);
  return apiJson('/api/ai/configuration', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...configuration, resources }),
  });
}

export async function deleteWorkflowSource(item) {
  if (item.source === 'comfyui') {
    return apiJson(workflowUrl(item.id), { method: 'DELETE' });
  }

  return updateResources(resources =>
    resources.filter(resource => resource.id !== item.resourceId),
  );
}

export async function setWorkflowSourceEnabled(item, enabled) {
  if (item.source === 'comfyui') {
    const current = await apiJson(workflowUrl(item.id));
    return apiJson(`${workflowUrl(item.id)}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...current.config, enabled }),
    });
  }

  return updateResources(resources =>
    resources.map(resource =>
      resource.id === item.resourceId ? { ...resource, enabled } : resource,
    ),
  );
}
