import { apiJson } from './http.js';

export function uploadFbx(file) {
  const form = new FormData(); form.append('file', file);
  return apiJson('/api/pose-studio/upload-fbx', { method: 'POST', body: form });
}
