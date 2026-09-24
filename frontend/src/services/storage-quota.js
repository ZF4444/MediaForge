import { apiJson } from './http.js';

export function loadStorageQuota() {
  return apiJson('/api/storage/config');
}

export function saveStorageQuota(payload) {
  return apiJson('/api/storage/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
