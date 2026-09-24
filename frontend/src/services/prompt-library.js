import { apiJson } from './http.js';

export const loadPromptLibraries = () => apiJson('/api/prompt-libraries', { allowErrorResponse: true });
export const loadLegacyPromptTemplates = () => apiJson('/api/canvas/prompt-templates', { allowErrorResponse: true });
export const savePromptLibraryItem = payload => apiJson('/api/prompt-libraries/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
export const updatePromptLibraryItem = (id, payload) => apiJson(`/api/prompt-libraries/items/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
export const deletePromptLibraryItem = id => apiJson(`/api/prompt-libraries/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const savePromptCategory = payload => apiJson('/api/prompt-libraries/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
export const updatePromptCategory = (id, payload) => apiJson(`/api/prompt-libraries/categories/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
export const deletePromptCategory = id => apiJson(`/api/prompt-libraries/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
