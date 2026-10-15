import { apiJson } from '../services/http.js';
import { applyStoredTheme } from '../shared/theme-bootstrap.js';

applyStoredTheme();
const DEFAULT = 'new-user';
const ADMIN = 'sys-admin';
const $ = id => document.getElementById(id);
const state = { types: {}, userTypes: {}, users: [], pages: [], models: [], selected: DEFAULT, snapshot: '', saving: false, refreshing: false, loaded: false };
const clone = value => JSON.parse(JSON.stringify(value));
const payload = () => ({ types: state.types });
const dirty = () => state.loaded && JSON.stringify(payload()) !== state.snapshot;
const current = () => state.types[state.selected];
const admin = () => state.selected === ADMIN;
const matches = (value, query) => String(value).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
const memberType = user => state.types[state.userTypes[user.user_id]] ? state.userTypes[user.user_id] : DEFAULT;
const members = id => state.users.filter(user => memberType(user) === id).length;
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function status(message, error = false) {
  $('saveStatus').textContent = message;
  $('saveStatus').dataset.error = String(error);
}
function updateActions() {
  const invalid = Object.values(state.types).some(type => !type.name?.trim());
  $('saveButton').disabled = !dirty() || invalid || state.saving;
  $('resetButton').disabled = !dirty() || state.saving;
  $('saveButton').textContent = state.saving ? '保存中…' : '保存更改';
}
function changed() {
  status(dirty() ? '有未保存的更改' : '所有更改已保存');
  updateActions();
}
function renderTypes() {
  $('typeCount').textContent = Object.keys(state.types).length;
  const list = $('typeList'); list.replaceChildren();
  Object.entries(state.types).filter(([, type]) => matches(type.name, $('typeSearch').value)).forEach(([id, type]) => {
    const button = element('button', 'type-item' + (state.selected === id ? ' selected' : ''));
    button.type = 'button'; button.setAttribute('aria-pressed', String(state.selected === id));
    const symbol = element('span', 'type-symbol', id === ADMIN ? '◇' : id === DEFAULT ? '◎' : '◌');
    symbol.setAttribute('aria-hidden', 'true');
    const copy = element('span', 'type-copy');
    copy.append(element('strong', '', type.name || '未命名类型'), element('small', '', `${members(id)} 位用户${id === ADMIN || id === DEFAULT ? ' · 内置类型' : ''}`));
    button.append(symbol, copy); button.addEventListener('click', () => selectType(id)); list.append(button);
  });
  if (!list.children.length) list.append(element('p', 'empty', '没有匹配的用户类型'));
}
function updateSummary() {
  $('typeTitle').textContent = current().name || '未命名类型';
  $('typeSummary').textContent = `${members(state.selected)} 位用户使用此类型 · 权限调整将在保存后生效`;
  const pageTotal = admin() ? state.pages.length : state.pages.filter(item => current().pages.includes(item.id)).length;
  const modelTotal = admin() || current().models === null ? state.models.length : state.models.filter(item => current().models.includes(item.id)).length;
  $('pageCount').textContent = `${pageTotal} / ${state.pages.length}`;
  $('modelCount').textContent = `${modelTotal} / ${state.models.length}`;
}
function renderPermissions(group) {
  const isModels = group === 'models';
  const source = isModels ? state.models : state.pages;
  const box = $(isModels ? 'modelList' : 'pageList');
  const query = $(isModels ? 'modelSearch' : 'pageSearch').value;
  box.replaceChildren();
  const filtered = source.filter(item => matches(`${item.label} ${item.upstream_model || ''} ${item.connection_id || ''}`, query));
  filtered.forEach(item => {
    const label = element('label', 'permission-row');
    const input = element('input'); input.type = 'checkbox';
    input.checked = admin() || (isModels && current().models === null) || current()[group].includes(item.id);
    input.disabled = admin();
    const copy = element('span', '', item.label || item.id);
    if (isModels) copy.append(element('small', '', item.upstream_model || item.id));
    input.addEventListener('change', () => {
      if (isModels && current().models === null) current().models = state.models.map(model => model.id);
      const values = new Set(current()[group]);
      if (input.checked) values.add(item.id); else values.delete(item.id);
      current()[group] = [...values];
      $('allModels').checked = current().models === null;
      updateSummary(); changed();
    });
    label.append(input, copy); box.append(label);
  });
  if (!filtered.length) box.append(element('p', 'empty', source.length ? '没有匹配的结果，试试其他关键词。' : isModels ? '暂无模型。请先在 API 设置中添加模型。' : '暂无可配置页面。'));
}
function selectType(id) {
  state.selected = state.types[id] ? id : DEFAULT;
  $('typeName').value = current().name;
  $('typeName').disabled = admin();
  $('nameError').hidden = !!current().name?.trim();
  $('typeBadge').textContent = state.selected === ADMIN ? '系统管理员 · 内置类型' : state.selected === DEFAULT ? '默认用户 · 内置类型' : '自定义类型';
  $('deleteType').hidden = state.selected === ADMIN || state.selected === DEFAULT;
  $('adminNotice').hidden = !admin();
  $('allModels').checked = admin() || current().models === null;
  $('allModels').disabled = admin();
  document.querySelectorAll('[data-bulk]').forEach(button => { button.disabled = admin(); });
  renderTypes(); updateSummary(); renderPermissions('pages'); renderPermissions('models');
}
function normalizeTypes(types) {
  return Object.fromEntries(Object.entries(types).map(([id, type]) => [id, { ...type, pages: type.pages || [], models: type.models ?? null }]));
}
async function load() {
  $('loading').hidden = false; $('loadError').hidden = true;
  try {
    const data = await apiJson('/api/access-control/config');
    state.types = normalizeTypes(data.types || {}); state.userTypes = data.user_types || {};
    state.users = data.users || []; state.pages = data.all_pages || []; state.models = data.all_models || [];
    state.loaded = true; state.snapshot = JSON.stringify(payload());
    $('workspace').hidden = false; $('loading').hidden = true;
    selectType(state.selected); changed();
  } catch (error) {
    $('loading').hidden = true; $('loadError').hidden = false;
    $('loadErrorText').textContent = error.status === 403 ? '需要“用户管理”页面权限才能访问此页面。' : `配置加载失败：${error.message}`;
    status('未能加载配置', true);
  }
}
async function save() {
  if ($('saveButton').disabled) return;
  state.saving = true; updateActions(); status('正在保存更改…');
  // Keep editing available while the request runs; merge the response only if no newer edits exist.
  const submitted = clone(payload()); const serialized = JSON.stringify(submitted);
  try {
    const data = await apiJson('/api/access-control/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: serialized });
    const saved = { types: normalizeTypes(data.types || submitted.types) };
    state.userTypes = data.user_types || state.userTypes;
    if (JSON.stringify(payload()) === serialized) {
      state.types = saved.types;
      selectType(state.selected);
    }
    state.snapshot = JSON.stringify(saved); changed();
    if (dirty()) status('已保存，仍有新的更改待保存');
  } catch (error) { status(`保存失败：${error.message}。更改已保留，可重试。`, true); }
  finally { state.saving = false; updateActions(); }
}
async function refreshModels() {
  if (!state.loaded || state.refreshing || document.hidden) return;
  state.refreshing = true; $('refreshModels').disabled = true;
  try {
    const data = await apiJson('/api/access-control/models');
    const models = data.all_models || [];
    if (JSON.stringify(models) !== JSON.stringify(state.models)) {
      state.models = models; renderPermissions('models'); updateSummary();
    }
    $('syncStatus').textContent = '已同步 · 每 5 秒自动更新';
  } catch { $('syncStatus').textContent = '同步失败，将自动重试'; }
  finally { state.refreshing = false; $('refreshModels').disabled = false; }
}
function init() {
  document.querySelectorAll('[data-bulk]').forEach(button => button.addEventListener('click', () => {
    if (admin()) return;
    const group = button.dataset.bulk;
    current()[group] = button.dataset.value === 'all' ? (group === 'pages' ? state.pages : state.models).map(item => item.id) : [];
    $('allModels').checked = current().models === null;
    renderPermissions(group); updateSummary(); changed();
  }));
  $('typeSearch').addEventListener('input', renderTypes);
  $('pageSearch').addEventListener('input', () => renderPermissions('pages'));
  $('modelSearch').addEventListener('input', () => renderPermissions('models'));
  $('typeName').addEventListener('input', event => {
    current().name = event.target.value;
    $('nameError').hidden = !!current().name.trim();
    updateSummary(); renderTypes(); changed();
  });
  $('allModels').addEventListener('change', event => {
    current().models = event.target.checked ? null : state.models.map(item => item.id);
    renderPermissions('models'); updateSummary(); changed();
  });
  $('addType').addEventListener('click', () => { $('newTypeName').value = ''; $('typeDialog').showModal(); $('newTypeName').focus(); });
  $('cancelCreate').addEventListener('click', () => $('typeDialog').close());
  $('typeForm').addEventListener('submit', event => {
    event.preventDefault(); const name = $('newTypeName').value.trim(); if (!name) { $('newTypeName').setCustomValidity('请输入用户类型名称'); $('newTypeName').reportValidity(); return; }
    // randomUUID is unavailable on HTTP origins outside localhost.
    let id;
    do {
      const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      id = `type-${suffix}`;
    } while (state.types[id]);
    const defaults = state.types[DEFAULT];
    state.types[id] = { name, pages: [...defaults.pages], models: defaults.models === null ? null : [...defaults.models] };
    $('typeSearch').value = ''; $('typeDialog').close(); selectType(id); changed(); $('typeName').focus();
  });
  $('newTypeName').addEventListener('input', () => $('newTypeName').setCustomValidity(''));
  $('deleteType').addEventListener('click', () => {
    if (admin() || state.selected === DEFAULT) return;
    const id = state.selected; delete state.types[id];
    selectType(DEFAULT); changed(); status('已移除类型，成员将归入默认用户。保存前可撤销。');
  });
  $('resetButton').addEventListener('click', () => {
    if (state.saving) return;
    const saved = JSON.parse(state.snapshot); state.types = saved.types;
    selectType(state.selected); changed();
  });
  $('saveButton').addEventListener('click', save); $('retryButton').addEventListener('click', load); $('refreshModels').addEventListener('click', refreshModels);
  window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('focus', refreshModels); document.addEventListener('visibilitychange', refreshModels);
  load(); window.setInterval(refreshModels, 5000);
}
init();
