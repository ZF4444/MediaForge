import { apiJson } from './http.js';

export function getAiConfiguration() {
  return apiJson('/api/ai/configuration');
}

export function saveAiConfiguration(configuration) {
  return apiJson('/api/ai/configuration', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(configuration),
  });
}
