import {
  listManagedUsers, listOrganizations, assignUserType, assignUserOrganization,
  createOrganization, renameOrganization, deleteOrganization, deleteManagedUser,
} from '../services/user-management.js';

const DEFAULT = 'new-user';
const $ = id => document.getElementById(id);
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
export function initUserDirectory() {
  const state = { users: [], types: {}, userTypes: {}, orgs: [], org: '*', selected: new Set(), pending: new Set(), loading: false, loaded: false, busy: false, action: null, orgBusy: false };
  const typeOf = user => state.userTypes[user.user_id] || DEFAULT;
  const filtered = () => {
    const query = $('directorySearch').value.trim().toLocaleLowerCase();
    const type = $('directoryTypeFilter').value;
    return state.users.filter(user =>
      `${user.username || ''} ${user.user_id}`.toLocaleLowerCase().includes(query)
      && (!type || typeOf(user) === type)
      && (state.org === '*' || (user.org_id || '') === state.org));
  };
  function status(text, error = false) {
    $('directoryStatus').textContent = text;
    $('directoryStatus').classList.toggle('ud-error', error);
  }
  function options(select, items, first) {
    const previous = select.value;
    select.replaceChildren();
    if (first) select.append(new Option(first, ''));
    items.forEach(([value, text]) => select.append(new Option(text, value)));
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  }
  function renderFilters() {
    const types = Object.entries(state.types).map(([id, type]) => [id, type.name || id]);
    options($('directoryTypeFilter'), types, '全部用户类型');
    options($('directoryBulkType'), types, '选择用户类型');
  }
  function renderOrgs() {
    const box = $('directoryOrgs'); box.replaceChildren();
    const entries = [['*', '全部用户', state.users.length], ['', '未分配组织', state.users.filter(user => !user.org_id).length], ...state.orgs.map(org => [org.id, org.name, state.users.filter(user => user.org_id === org.id).length])];
    entries.forEach(([id, name, count]) => {
      const button = node('button', 'directory-org' + (id === state.org ? ' is-selected' : ''));
      button.type = 'button'; button.disabled = state.busy || !!state.pending.size || state.loading; button.setAttribute('aria-pressed', String(id === state.org));
      button.append(node('span', 'directory-org-name', name), node('span', 'directory-org-count', count));
      button.addEventListener('click', () => { state.org = id; clearSelection(); renderOrgs(); renderRows(); });
      box.append(button);
    });
    const list = $('directoryOrgList'); list.replaceChildren();
    state.orgs.forEach(org => {
      const row = node('div', 'ud-org-row'); const copy = node('div');
      copy.append(node('strong', '', org.name), node('small', 'ud-muted', `${state.users.filter(user => user.org_id === org.id).length} 位成员`));
      const actions = node('div', 'ud-org-actions');
      const rename = node('button', 'ud-link', '重命名'); rename.type = 'button'; rename.disabled = state.orgBusy;
      rename.setAttribute('aria-label', `重命名组织 ${org.name}`); rename.addEventListener('click', () => openAction('rename-org', org));
      const remove = node('button', 'ud-link ud-danger', '删除'); remove.type = 'button'; remove.disabled = state.orgBusy;
      remove.setAttribute('aria-label', `删除组织 ${org.name}`); remove.addEventListener('click', () => openAction('delete-org', org));
      actions.append(rename, remove); row.append(copy, actions); list.append(row);
    });
    if (!state.orgs.length) list.append(node('p', 'ud-empty', '暂无组织。创建一个组织，开始管理团队归属。'));
  }
  function updateSelection() {
    const locked = state.busy || !!state.pending.size || state.loading;
    $('directorySearch').disabled = locked; $('directoryTypeFilter').disabled = locked;
    $('manageOrgs').disabled = locked;
    document.querySelectorAll('.directory-org').forEach(button => { button.disabled = locked; });
    const visible = filtered();
    $('selectVisibleUsers').checked = !!visible.length && visible.every(user => state.selected.has(user.user_id));
    $('selectVisibleUsers').indeterminate = ! $('selectVisibleUsers').checked && visible.some(user => state.selected.has(user.user_id));
    $('selectVisibleUsers').disabled = !visible.length || state.busy || !!state.pending.size || state.loading;
    $('directoryBulk').hidden = !state.selected.size;
    $('directorySelection').textContent = `已选择 ${state.selected.size} 位用户`;
    $('applyBulkType').disabled = !state.selected.size || !$('directoryBulkType').value || state.busy || !!state.pending.size || state.loading;
    $('clearSelection').disabled = state.busy;
    $('directoryBulkType').disabled = state.busy;
  }
  function clearSelection() { state.selected.clear(); updateSelection(); }
  function renderRows() {
    const users = filtered(); const body = $('directoryRows'); body.replaceChildren();
    $('userCount').textContent = `${state.users.length} 位用户`;
    $('directoryResultCount').textContent = `${users.length} 位用户`;
    users.forEach(user => {
      const id = user.user_id; const pending = state.pending.has(id);
      const disabled = !!state.pending.size || state.busy || state.loading;
      const row = node('tr'); row.dataset.userId = id; row.setAttribute('aria-busy', String(pending));
      const checkCell = node('td', 'select-cell'); const check = node('input'); check.type = 'checkbox';
      check.checked = state.selected.has(id); check.disabled = disabled;
      check.setAttribute('aria-label', `选择用户 ${user.username || id}`);
      check.addEventListener('change', () => { if (check.checked) state.selected.add(id); else state.selected.delete(id); updateSelection(); }); checkCell.append(check);
      const identity = node('td', 'ud-identity'); const avatar = node('span', 'ud-avatar', (user.username || id).slice(0, 1).toLocaleUpperCase()); avatar.setAttribute('aria-hidden', 'true');
      const copy = node('div'); copy.append(node('strong', '', user.username || id), node('small', '', id));
      if (pending) copy.append(node('small', 'ud-saving', '正在保存…'));
      identity.append(avatar, copy);
      const typeCell = node('td'); typeCell.dataset.label = '用户类型';
      const type = node('select', 'ud-select'); type.dataset.userType = id;
      type.setAttribute('aria-label', `${user.username || id} 的用户类型`);
      options(type, Object.entries(state.types).map(([key, value]) => [key, value.name || key]));
      type.value = typeOf(user); type.disabled = disabled;
      type.addEventListener('change', () => updateUser(user, 'type', type.value)); typeCell.append(type);
      const orgCell = node('td'); orgCell.dataset.label = '所属组织';
      const org = node('select', 'ud-select'); org.dataset.userOrg = id; org.setAttribute('aria-label', `${user.username || id} 的所属组织`);
      options(org, state.orgs.map(item => [item.id, item.name]), '未分配组织'); org.value = user.org_id || ''; org.disabled = disabled || state.orgBusy;
      org.addEventListener('change', () => updateUser(user, 'org', org.value || null)); orgCell.append(org);
      const actionCell = node('td', 'operation-cell'); const remove = node('button', 'ud-link ud-danger', '删除'); remove.type = 'button'; remove.disabled = disabled;
      remove.setAttribute('aria-label', `删除用户 ${user.username || id}`); remove.addEventListener('click', () => openAction('delete-user', user)); actionCell.append(remove);
      row.append(checkCell, identity, typeCell, orgCell, actionCell); body.append(row);
    });
    if (!users.length) {
      const row = node('tr'); const cell = node('td', 'ud-empty', state.loading ? '正在加载用户…' : !state.loaded ? '暂未读取到用户，请点击重试。' : state.users.length ? '没有匹配的用户，试试调整搜索或筛选条件。' : '暂无注册用户。');
      cell.colSpan = 5; row.append(cell); body.append(row);
    }
    updateSelection();
  }
  async function refresh() {
    if (state.loading || state.pending.size || state.busy || state.orgBusy) return;
    state.loading = true; $('refreshUsers').disabled = true; status('正在刷新…'); renderRows();
    try {
      const [data, organizations] = await Promise.all([listManagedUsers(), listOrganizations()]);
      state.users = data.users || []; state.types = data.types || {}; state.userTypes = data.user_types || {}; state.orgs = organizations.organizations || [];
      state.loaded = true;
      if (state.org !== '*' && state.org !== '' && !state.orgs.some(org => org.id === state.org)) state.org = '*';
      state.selected = new Set([...state.selected].filter(id => state.users.some(user => user.user_id === id)));
      $('directoryError').hidden = true; renderFilters(); renderOrgs(); status('列表已更新');
    } catch (error) {
      $('directoryError').hidden = false; $('directoryErrorText').textContent = `列表加载失败：${error.message}`; status('加载失败，可重试', true);
    } finally { state.loading = false; $('refreshUsers').disabled = false; renderRows(); }
  }
  async function updateUser(user, field, value) {
    if (state.pending.size || state.busy || state.loading) return;
    state.pending.add(user.user_id); renderRows(); status('正在保存…');
    try {
      if (field === 'type') { const data = await assignUserType(user.user_id, value); state.userTypes[user.user_id] = data.user_type || value; }
      else { await assignUserOrganization(user.user_id, value); user.org_id = value; }
      status(`${user.username || user.user_id} 的${field === 'type' ? '用户类型' : '组织归属'}已更新`);
    } catch (error) { status(`保存失败：${error.message}。已恢复原设置，请重试。`, true); }
    finally { state.pending.delete(user.user_id); renderRows(); renderOrgs(); }
  }
  async function bulkAssign() {
    const type = $('directoryBulkType').value;
    if (!type || !state.selected.size || state.busy || state.pending.size || state.loading) return;
    const ids = [...state.selected]; state.busy = true; renderRows(); let completed = 0; const failed = [];
    for (const id of ids) {
      status(`正在分配用户类型 ${completed + failed.length + 1} / ${ids.length}…`);
      try { const data = await assignUserType(id, type); state.userTypes[id] = data.user_type || type; completed++; state.selected.delete(id); }
      catch { failed.push(id); }
    }
    state.busy = false; renderRows();
    status(failed.length ? `已更新 ${completed} 位用户，${failed.length} 位失败。失败用户已保留选择，可重试。` : `已为 ${completed} 位用户更新类型`, !!failed.length);
  }
  function openAction(kind, item) {
    if (state.busy || state.pending.size || state.loading || state.orgBusy) return;
    state.action = { kind, item };
    const name = item.name || item.username || item.user_id;
    $('directoryActionEyebrow').textContent = kind === 'delete-user' ? '用户账户' : '组织管理';
    $('directoryActionTitle').textContent = kind === 'rename-org' ? '重命名组织' : `删除${kind === 'delete-user' ? '用户' : '组织'}“${name}”？`;
    $('directoryActionDescription').textContent = kind === 'rename-org' ? '组织成员与预算不受影响。' : kind === 'delete-user' ? '该用户将无法继续登录，历史用量记录会保留。此操作无法撤销。' : '成员将解除组织归属，用户账户不会被删除。此操作无法撤销。';
    $('directoryRenameField').hidden = kind !== 'rename-org'; $('directoryRenameInput').required = kind === 'rename-org'; $('directoryRenameInput').value = item.name || '';
    $('directoryActionError').textContent = ''; $('confirmDirectoryAction').textContent = kind === 'rename-org' ? '保存名称' : '确认删除';
    $('confirmDirectoryAction').classList.toggle('ud-destructive', kind !== 'rename-org');
    $('directoryActionDialog').showModal();
    (kind === 'rename-org' ? $('directoryRenameInput') : $('cancelDirectoryAction')).focus();
  }
  async function performAction(event) {
    event.preventDefault(); if (!state.action || state.busy || state.orgBusy) return;
    const { kind, item } = state.action; const name = $('directoryRenameInput').value.trim();
    if (kind === 'rename-org' && !name) { $('directoryActionError').textContent = '请输入组织名称。'; return; }
    state.busy = true; $('confirmDirectoryAction').disabled = true; $('cancelDirectoryAction').disabled = true;
    $('directoryActionError').textContent = '正在处理…'; renderRows();
    try {
      if (kind === 'delete-user') {
        await deleteManagedUser(item.user_id); state.users = state.users.filter(user => user.user_id !== item.user_id); state.selected.delete(item.user_id); delete state.userTypes[item.user_id];
      } else if (kind === 'delete-org') {
        await deleteOrganization(item.id); state.orgs = state.orgs.filter(org => org.id !== item.id); state.users.forEach(user => { if (user.org_id === item.id) user.org_id = null; }); if (state.org === item.id) state.org = '*';
      } else { await renameOrganization(item.id, name); item.name = name; }
      $('directoryActionDialog').close(); status(kind === 'delete-user' ? '用户已删除' : kind === 'delete-org' ? '组织已删除，成员已解除归属' : '组织名称已更新');
    } catch (error) { $('directoryActionError').textContent = `操作失败：${error.message}。请重试。`; }
    finally { state.busy = false; $('confirmDirectoryAction').disabled = false; $('cancelDirectoryAction').disabled = false; renderRows(); renderOrgs(); }
  }
  $('directorySearch').addEventListener('input', () => { clearSelection(); renderRows(); });
  $('directoryTypeFilter').addEventListener('change', () => { clearSelection(); renderRows(); });
  $('refreshUsers').addEventListener('click', refresh); $('retryUsers').addEventListener('click', refresh);
  $('selectVisibleUsers').addEventListener('change', event => { filtered().forEach(user => { if (event.target.checked) state.selected.add(user.user_id); else state.selected.delete(user.user_id); }); renderRows(); });
  $('clearSelection').addEventListener('click', () => { clearSelection(); renderRows(); });
  $('directoryBulkType').addEventListener('change', updateSelection); $('applyBulkType').addEventListener('click', bulkAssign);
  $('manageOrgs').addEventListener('click', () => { $('directoryOrgStatus').textContent = ''; $('organizationsDialog').showModal(); });
  $('closeOrganizations').addEventListener('click', () => $('organizationsDialog').close());
  $('directoryOrgForm').addEventListener('submit', async event => {
    event.preventDefault(); const name = $('directoryOrgName').value.trim();
    if (!name || state.orgBusy || state.busy || state.pending.size) return;
    state.orgBusy = true; $('createDirectoryOrg').disabled = true; $('directoryOrgStatus').textContent = '正在创建…'; renderOrgs(); renderRows();
    try {
      const data = await createOrganization(name);
      if (data.organization?.id) state.orgs.push(data.organization);
      else { const organizations = await listOrganizations(); state.orgs = organizations.organizations || []; }
      $('directoryOrgName').value = ''; $('directoryOrgStatus').textContent = '组织已创建';
    } catch (error) { $('directoryOrgStatus').textContent = `创建失败：${error.message}。请重试。`; }
    finally { state.orgBusy = false; $('createDirectoryOrg').disabled = false; renderOrgs(); renderRows(); }
  });
  $('cancelDirectoryAction').addEventListener('click', () => $('directoryActionDialog').close());
  $('directoryActionDialog').addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });
  $('directoryActionForm').addEventListener('submit', performAction);
  window.addEventListener('focus', () => { if (document.querySelector('[data-view="users"].active') && !$('directoryActionDialog').open && !$('organizationsDialog').open) refresh(); });
  return { refresh };
}
