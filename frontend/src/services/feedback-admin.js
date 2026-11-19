import { apiResponse } from './http.js';

class FeedbackAdminRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'FeedbackAdminRequestError';
    this.code = status;
  }
}

async function requestFeedbackJson(url, options) {
  const response = await apiResponse(url, {
    credentials: 'same-origin',
    ...options,
  });
  if (!response.ok) {
    const message = response.data.detail || `HTTP ${response.status}`;
    throw new FeedbackAdminRequestError(response.status, message);
  }
  return response.data;
}

export async function listFeedback({ status, type, query } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  if (query) params.set('q', query);
  params.set('limit', '100');
  return requestFeedbackJson(`/api/feedback/admin?${params.toString()}`);
}

export async function getPendingFeedbackCount() {
  const data = await requestFeedbackJson('/api/feedback/admin/pending-count');
  const count = Number(data && data.count);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

export async function updateFeedback(id, payload) {
  return requestFeedbackJson(`/api/feedback/admin/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteFeedback(id) {
  return requestFeedbackJson(`/api/feedback/admin/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
