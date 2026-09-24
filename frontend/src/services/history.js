import { apiJson } from './http.js';

export const listHistory = type => apiJson(`/api/history?type=${encodeURIComponent(type)}`);
export const saveHistory = payload => apiJson('/api/history/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
