import { apiJson } from './http.js';

export const getAiConfiguration = () => apiJson('/api/ai/configuration');

export function uploadPoseFile(file, endpoint) {
  const body = new FormData();
  body.append('file', file, file.name || 'source');
  return apiJson(endpoint, { method: 'POST', body });
}

export const transferPose = payload => apiJson('/api/online-image', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
});
