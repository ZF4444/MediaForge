import { apiJson, apiResponse } from './http.js';

const jsonOptions = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const listManagedUsers = () => apiJson('/api/access-control/users');
export const listOrganizations = () => apiJson('/api/organizations');

export const createOrganization = name =>
  apiJson('/api/organizations', jsonOptions('POST', { name }));

export const renameOrganization = (id, name) =>
  apiJson(`/api/organizations/${encodeURIComponent(id)}`, jsonOptions('PUT', { name }));

export const deleteOrganization = id =>
  apiJson(`/api/organizations/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const assignUserOrganization = (userId, orgId) =>
  apiJson(
    `/api/access-control/users/${encodeURIComponent(userId)}/org`,
    jsonOptions('PUT', { org_id: orgId }),
  );

export const assignUserType = (userId, typeId) =>
  apiJson(
    `/api/access-control/users/${encodeURIComponent(userId)}/type`,
    jsonOptions('PUT', { type_id: typeId }),
  );

export const deleteManagedUser = userId =>
  apiJson(`/api/access-control/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });

export async function loadUsage(month) {
  const [runningHub, omnilojo, defaults] = await Promise.all([
    apiResponse(`/api/usage/runninghub?month=${encodeURIComponent(month)}`),
    apiResponse(`/api/usage/omnilojo?month=${encodeURIComponent(month)}`),
    apiResponse('/api/settings/new-user-budget'),
  ]);
  if (!runningHub.ok) throw new Error(runningHub.data.detail || '加载失败');

  return {
    usage: {
      ...runningHub.data,
      omnilojo: omnilojo.ok ? omnilojo.data : { records: [] },
    },
    defaultBudget: defaults.ok ? defaults.data : null,
    omnilojoError: omnilojo.ok
      ? ''
      : omnilojo.data.detail || `接口错误（HTTP ${omnilojo.status}）`,
  };
}

export const saveOrganizationBudget = (orgId, monthlyBudgetCny, enabled) =>
  apiJson(
    `/api/organizations/${encodeURIComponent(orgId)}/budget`,
    jsonOptions('PUT', { monthly_budget_cny: monthlyBudgetCny, enabled: Boolean(enabled) }),
  );

export const saveUserBudget = (userId, monthlyBudgetUsd, enabled) =>
  apiJson(
    `/api/users/${encodeURIComponent(userId)}/budget`,
    jsonOptions('PUT', { monthly_budget_usd: monthlyBudgetUsd, enabled: Boolean(enabled) }),
  );

export const saveNewUserDefaultBudget = (monthlyBudgetUsd, enabled) =>
  apiJson(
    '/api/settings/new-user-budget',
    jsonOptions('PUT', { monthly_budget_usd: monthlyBudgetUsd, enabled: Boolean(enabled) }),
  );

export const listUserSessions = () => apiJson('/api/access-control/sessions');
