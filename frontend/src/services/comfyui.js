import { apiJson } from './http.js';

export const listWorkflows = () => apiJson('/api/workflows');
export const getWorkflow = name => apiJson(`/api/workflows/${encodeURIComponent(name)}`);
export const deleteWorkflow = name => apiJson(`/api/workflows/${encodeURIComponent(name)}`, { method: 'DELETE' });
export const saveWorkflow = (name, workflow) => apiJson('/api/workflows', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, workflow }),
});
export const updateWorkflowConfig = (name, config) => apiJson(`/api/workflows/${encodeURIComponent(name)}/config`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
});
export const runWorkflow = (name, payload) => apiJson(`/api/workflows/${encodeURIComponent(name)}/run`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});
export const uploadWorkflowFile = file => {
  const form = new FormData(); form.append('file', file);
  return apiJson('/api/upload', { method: 'POST', body: form });
};
export const listComfyInstances = () => apiJson('/api/comfyui/instances');
export const saveComfyInstances = instances => apiJson('/api/comfyui/instances', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(instances),
});
