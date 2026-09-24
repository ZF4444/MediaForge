import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assignUserOrganization,
  assignUserType,
  createOrganization,
  deleteManagedUser,
  deleteOrganization,
  listManagedUsers,
  listOrganizations,
  listUserSessions,
  loadUsage,
  renameOrganization,
  saveNewUserDefaultBudget,
  saveOrganizationBudget,
  saveUserBudget,
} from '../src/services/user-management.js';

afterEach(() => vi.unstubAllGlobals());

function response(data, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => data };
}

describe('user management service', () => {
  it('loads users, organizations, and sessions through the JSON client', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ users: [] }))
      .mockResolvedValueOnce(response({ organizations: [] }))
      .mockResolvedValueOnce(response({ sessions: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await listManagedUsers();
    await listOrganizations();
    await listUserSessions();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/access-control/users', '/api/organizations', '/api/access-control/sessions',
    ]);
  });

  it('encodes user and organization ids and sends the expected JSON payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ user_type: 'member' }));
    vi.stubGlobal('fetch', fetchMock);

    await createOrganization('Research');
    await renameOrganization('org/a', 'Research 2');
    await deleteOrganization('org/a');
    await assignUserOrganization('user/7', null);
    await assignUserType('user/7', 'member');
    await deleteManagedUser('user/7');

    expect(fetchMock.mock.calls).toEqual([
      ['/api/organizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"Research"}' }],
      ['/api/organizations/org%2Fa', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"name":"Research 2"}' }],
      ['/api/organizations/org%2Fa', { method: 'DELETE' }],
      ['/api/access-control/users/user%2F7/org', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"org_id":null}' }],
      ['/api/access-control/users/user%2F7/type', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"type_id":"member"}' }],
      ['/api/access-control/users/user%2F7', { method: 'DELETE' }],
    ]);
  });

  it('loads usage sources independently and keeps RunningHub as the required source', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ records: [{ id: 'rh' }] }))
      .mockResolvedValueOnce(response({ detail: 'temporarily unavailable' }, false, 503))
      .mockResolvedValueOnce(response({ monthly_budget_usd: 12, enabled: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadUsage('2026-09')).resolves.toEqual({
      usage: { records: [{ id: 'rh' }], omnilojo: { records: [] } },
      defaultBudget: { monthly_budget_usd: 12, enabled: true },
      omnilojoError: 'temporarily unavailable',
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/usage/runninghub?month=2026-09',
      '/api/usage/omnilojo?month=2026-09',
      '/api/settings/new-user-budget',
    ]);
  });

  it('rejects usage when the required RunningHub source fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({ detail: 'forbidden' }, false, 403))
      .mockResolvedValueOnce(response({ records: [] }))
      .mockResolvedValueOnce(response({})));

    await expect(loadUsage('2026-09')).rejects.toThrow('forbidden');
  });

  it('writes organization, user, and default budgets with explicit enabled flags', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await saveOrganizationBudget('org/1', 25, true);
    await saveUserBudget('user/1', 3.5, false);
    await saveNewUserDefaultBudget(2, true);

    expect(fetchMock.mock.calls).toEqual([
      ['/api/organizations/org%2F1/budget', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"monthly_budget_cny":25,"enabled":true}' }],
      ['/api/users/user%2F1/budget', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"monthly_budget_usd":3.5,"enabled":false}' }],
      ['/api/settings/new-user-budget', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"monthly_budget_usd":2,"enabled":true}' }],
    ]);
  });
});
