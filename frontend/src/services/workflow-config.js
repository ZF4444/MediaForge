import { apiJson } from './http.js';

export function getWorkflow(id) {
  return apiJson(`/api/workflows/${encodeURIComponent(id)}`);
}

export function workflowCoverPreviewUrl(fileId) {
  return fileId ? `/api/files/${encodeURIComponent(fileId)}/preview` : '';
}

export function saveWorkflowConfig(id, config) {
  return apiJson(`/api/workflows/${encodeURIComponent(id)}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export function getAiConfiguration() {
  return apiJson('/api/ai/configuration');
}

export function saveAiConfiguration(config) {
  return apiJson('/api/ai/configuration', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export function uploadWorkflowCover(file) {
  const body = new FormData();
  body.append('files', file);
  return apiJson('/api/local-assets/upload', { method: 'POST', body });
}

export function createWorkflow(name, workflow) {
  return apiJson('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, workflow }),
  });
}
