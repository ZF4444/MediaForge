export function errorMessage(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(errorMessage).filter(Boolean).join('；');
  if (value && typeof value === 'object') {
    return errorMessage(value.message) || errorMessage(value.msg) || errorMessage(value.detail);
  }
  return '';
}

// Only model authorization failures use this dialog; other 403 errors retain their context.
export function notifyModelAccessDenied(error) {
  const detail = error?.data?.detail ?? error?.data;
  const message = errorMessage(detail) || error?.message || '';
  const denied = detail?.error_code === 'model_access_denied'
    || /(?:没有权限使用该模型|无权使用.*模型|没有.*模型.*使用权限)/.test(message);
  if (!denied || (error.status != null && error.status !== 403)) return false;
  if (error.modelAccessDeniedNotified) return true;
  const showDialog = globalThis.__MediaForgeRuntimeServices?.showModelPermissionDialog;
  if (typeof showDialog !== 'function') return false;
  showDialog({ message });
  error.modelAccessDeniedNotified = true;
  return true;
}

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
    const error = new Error(errorMessage(data.detail) || errorMessage(data.message) || errorMessage(data.error) || '操作失败');
    error.status = status;
    error.data = data;
    notifyModelAccessDenied(error);
    throw error;
  }
  return data;
}

async function responseError(response) {
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  const error = new Error(data ? errorMessage(data.detail) || errorMessage(data.message) || errorMessage(data.error) || '操作失败' : text || '操作失败');
  error.status = response.status;
  error.data = data;
  notifyModelAccessDenied(error);
  return error;
}

export async function apiText(url, options = {}) {
  const { allowErrorResponse, ...requestOptions } = options;
  const response = await fetch(url, requestOptions);
  if (!response.ok && allowErrorResponse !== true) throw await responseError(response);
  return response.text();
}

export async function apiBlob(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw await responseError(response);
  return response.blob();
}

export async function apiStream(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw await responseError(response);
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
registerRuntimeServices({ notifyModelAccessDenied, apiJson, apiText, apiBlob, apiForm, apiStream, apiConfirm, apiPrompt, openExternal, canvasApi });
