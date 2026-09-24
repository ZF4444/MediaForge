/** Small JSON client shared by page entry points. */
export async function apiResponse(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function apiJson(url, options = {}) {
  const { allowErrorResponse, ...requestOptions } = options;
  const { ok, status, data } = await apiResponse(url, requestOptions);
  if (!ok && allowErrorResponse !== true) {
    const error = new Error(data.detail || data.message || '操作失败');
    error.status = status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function apiText(url, options = {}) {
  const { allowErrorResponse, ...requestOptions } = options;
  const response = await fetch(url, requestOptions);
  const text = await response.text();
  if (!response.ok && allowErrorResponse !== true) {
    let message = text || '操作失败';
    try { const data = JSON.parse(text); message = data.detail || data.message || message; } catch {}
    throw new Error(message);
  }
  return text;
}

export async function apiBlob(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error((await response.text()) || '操作失败');
  return response.blob();
}

export async function apiStream(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = new Error((await response.text()) || '操作失败');
    error.status = response.status;
    throw error;
  }
  return response;
}

export async function apiForm(url, formData, options = {}) {
  return apiJson(url, { ...options, method: options.method || 'POST', body: formData });
}

export async function apiConfirm(message) {
  return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false;
}

export async function apiPrompt(message, initial = '') {
  return typeof globalThis.prompt === 'function' ? globalThis.prompt(message, initial) : null;
}

export function openExternal(url, target = '_blank', features = 'noopener') {
  if (!url || typeof globalThis.open !== 'function') return null;
  return globalThis.open(url, target, features);
}

export const canvasApi = {
  load: id => apiJson(`/api/canvases/${encodeURIComponent(id)}`),
  create: payload => apiJson('/api/canvases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  usage: () => apiJson('/api/account/overview?limit=1'),
  storageUsage: () => apiJson('/api/storage/usage', { allowErrorResponse: true }),
  workflow: name => apiJson(`/api/workflows/${encodeURIComponent(name)}`),
  llm: payload => apiJson('/api/canvas-llm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  imageTask: id => apiJson(`/api/canvas-image-tasks/${encodeURIComponent(id)}`),
  comfyTask: id => apiJson(`/api/canvas-comfy-tasks/${encodeURIComponent(id)}`),
  imageTaskQuery: payload => apiJson('/api/image-task-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  assetLibrary: () => apiJson('/api/asset-library'),
  addAsset: payload => apiJson('/api/asset-library/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  renameAsset: (id, name) => apiJson(`/api/asset-library/items/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }),
  deleteAsset: id => apiJson(`/api/asset-library/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

import { registerRuntimeServices } from '../shared/runtime-services.js';
registerRuntimeServices({ apiJson, apiText, apiBlob, apiForm, apiStream, apiConfirm, apiPrompt, openExternal, canvasApi });
