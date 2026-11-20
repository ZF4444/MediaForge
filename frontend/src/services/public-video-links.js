import { apiJson } from './http.js';

// The internal management site may use HTTP on a LAN IP, where randomUUID is
// unavailable. getRandomValues still supplies a cryptographic request key.
const requestKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)),
  value => value.toString(16).padStart(2, '0')).join('');

const send = (url, method, payload) => apiJson(url, {
  method, credentials: 'same-origin', cache: 'no-store',
  headers: { 'Content-Type': 'application/json', 'X-MediaForge-Request': '1' },
  body: payload === undefined ? undefined : JSON.stringify(payload),
});

export const listLinks = (offset = 0, state = '') => apiJson(`/api/public-video-grants?offset=${offset}&limit=30&state=${encodeURIComponent(state)}`, { cache: 'no-store' });
export const bindSource = payload => send('/api/public-video-sources', 'POST', payload);
export const issueLink = (source, rotate = false, ttl = 1800) => send(`/api/public-video-sources/${encodeURIComponent(source)}/grants`, 'POST', {
  idempotency_key: requestKey(), rotate, ttl_seconds: ttl,
});
export const revokeLink = id => send(`/api/public-video-grants/${encodeURIComponent(id)}/revoke`, 'POST');
export const listPolicies = ({ offset = 0, limit = 30, scope = '', enabled = '', q = '' } = {}) => {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (scope) params.set('scope', scope);
  if (enabled === 'true' || enabled === 'false') params.set('enabled', enabled);
  if (q) params.set('q', q);
  return apiJson(`/api/admin/public-video-policy?${params}`, { cache: 'no-store' });
};
export const savePolicy = payload => send('/api/admin/public-video-policy', 'PUT', payload);
export const revokeScope = payload => send('/api/admin/public-video-grants/revoke-batch', 'POST', payload);
