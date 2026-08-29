/* 权限管理：用户类型的页面权限与用户类型分配。 */
(function () {
  'use strict';
  var DEFAULT_TYPE_ID = 'new-user';
  var state = { allPages: [], users: [], types: {}, userTypes: {}, selected: null, draftPages: new Set() };
  function $(id) { return document.getElementById(id); }
  function typeEntries() { return Object.keys(state.types).map(function (id) { return { id: id, value: state.types[id] }; }); }
  function setStatus(message, kind) { var el = $('acStatus'); el.textContent = message || ''; el.className = 'ac-status' + (kind ? ' ' + kind : ''); }
  function markDirty(message) { setStatus(message || '有未保存的变更。'); }
  function fetchJSON(url, options) { return fetch(url, Object.assign({ credentials: 'same-origin' }, options || {})).then(function (res) { if (res.status === 403) { var forbidden = new Error('forbidden'); forbidden.code = 403; throw forbidden; } if (!res.ok) { var error = new Error('http ' + res.status); error.code = res.status; throw error; } return res.json(); }); }
  function commitSelected() { if (state.selected && state.types[state.selected]) state.types[state.selected] = { name: $('acTypeName').value.trim() || state.selected, pages: Array.from(state.draftPages) }; }
  function renderTypes() {
    var list = $('acTypeList'); list.innerHTML = '';
    typeEntries().forEach(function (entry) {
      var item = document.createElement('button'), dot = document.createElement('span'), name = document.createElement('span');
      item.type = 'button'; item.className = 'ac-type-item' + (state.selected === entry.id ? ' active' : ''); dot.className = 'ac-type-dot'; name.textContent = entry.value.name || entry.id;
      item.appendChild(dot); item.appendChild(name); item.addEventListener('click', function () { selectType(entry.id); }); list.appendChild(item);
    });
  }
  function renderUsers() {
    var list = $('acUserList'); list.innerHTML = '';
    if (!state.users.length) { var empty = document.createElement('tr'); empty.innerHTML = '<td class="ac-empty-row" colspan="2">暂无其他注册用户。</td>'; list.appendChild(empty); return; }
    state.users.forEach(function (user) {
      var row = document.createElement('tr'), userCell = document.createElement('td'), typeCell = document.createElement('td'), name = document.createElement('div'), id = document.createElement('div'), select = document.createElement('select');
      name.className = 'ac-user-name'; id.className = 'ac-user-id'; name.textContent = user.username || user.user_id; id.textContent = user.username && user.username !== user.user_id ? user.user_id : '';
      userCell.appendChild(name); if (id.textContent) userCell.appendChild(id); select.className = 'ac-type-select';
      typeEntries().forEach(function (entry) { var option = document.createElement('option'); option.value = entry.id; option.textContent = entry.value.name || entry.id; option.selected = (state.userTypes[user.user_id] || DEFAULT_TYPE_ID) === entry.id; select.appendChild(option); });
      select.addEventListener('change', function () { state.userTypes[user.user_id] = select.value; markDirty('有未保存的用户类型分配。'); });
      typeCell.appendChild(select); row.appendChild(userCell); row.appendChild(typeCell); list.appendChild(row);
    });
  }
  function buildChecks() {
    var box = $('acPages'); box.innerHTML = '';
    state.allPages.forEach(function (item) {
      var label = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span');
      label.className = 'ac-check' + (state.draftPages.has(item.id) ? ' checked' : ''); input.type = 'checkbox'; input.checked = state.draftPages.has(item.id);
      input.addEventListener('change', function () { if (input.checked) state.draftPages.add(item.id); else state.draftPages.delete(item.id); label.classList.toggle('checked', input.checked); markDirty(); });
      text.textContent = item.label; label.appendChild(input); label.appendChild(text); box.appendChild(label);
    });
  }
  function selectType(typeId) {
    commitSelected(); state.selected = typeId; var type = state.types[typeId]; if (!type) return;
    state.draftPages = new Set(type.pages || []); $('acDetailEmpty').style.display = 'none'; $('acDetail').style.display = ''; $('acTypeName').value = type.name || typeId; $('acDetailTitle').textContent = type.name || typeId; $('acDeleteTypeBtn').style.display = typeId === DEFAULT_TYPE_ID ? 'none' : ''; renderTypes(); buildChecks();
  }
  function applyBulk(value) { state.draftPages.clear(); if (value === 'all') state.allPages.forEach(function (item) { state.draftPages.add(item.id); }); buildChecks(); markDirty(); }
  function newType() {
    var name = window.prompt('用户类型名称'); if (!name || !name.trim()) return;
    var id = 'type-' + Date.now().toString(36); state.types[id] = { name: name.trim(), pages: [] }; selectType(id); renderUsers(); markDirty('已创建用户类型，请配置权限后保存。');
  }
  function deleteType() {
    var typeId = state.selected; if (!typeId || typeId === DEFAULT_TYPE_ID || !window.confirm('删除此用户类型？相关用户将改为“默认用户”。')) return;
    delete state.types[typeId]; Object.keys(state.userTypes).forEach(function (uid) { if (state.userTypes[uid] === typeId) state.userTypes[uid] = DEFAULT_TYPE_ID; }); state.selected = DEFAULT_TYPE_ID; selectType(DEFAULT_TYPE_ID); renderUsers(); markDirty('已删除用户类型，请保存变更。');
  }
  function persist() {
    commitSelected(); $('acSaveBtn').disabled = true; setStatus('保存中...');
    fetchJSON('/api/access-control/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ types: state.types, user_types: state.userTypes }) }).then(function (data) {
      state.types = data.types || {}; state.userTypes = data.user_types || {}; renderTypes(); renderUsers(); selectType(state.selected && state.types[state.selected] ? state.selected : DEFAULT_TYPE_ID); setStatus('已保存。', 'ok');
    }).catch(function (error) { setStatus(error.code === 403 ? '无权限。' : '保存失败：' + error.message, 'err'); }).finally(function () { $('acSaveBtn').disabled = false; });
  }
  function init() {
    document.querySelectorAll('[data-bulk]').forEach(function (button) { button.addEventListener('click', function () { applyBulk(button.dataset.val); }); });
    $('acAddTypeBtn').addEventListener('click', newType); $('acDeleteTypeBtn').addEventListener('click', deleteType); $('acSaveBtn').addEventListener('click', persist);
    $('acTypeName').addEventListener('input', function () { if (state.selected) { $('acDetailTitle').textContent = this.value.trim() || state.selected; markDirty(); } });
    fetchJSON('/api/access-control/config').then(function (data) {
      state.allPages = data.all_pages || []; state.users = data.users || []; state.types = data.types || {}; state.userTypes = data.user_types || {}; $('acMain').style.display = ''; renderTypes(); renderUsers(); selectType(state.types[DEFAULT_TYPE_ID] ? DEFAULT_TYPE_ID : typeEntries()[0].id);
    }).catch(function (error) { if (error.code === 403) $('acForbidden').style.display = ''; else setStatus('加载失败：' + error.message, 'err'); });
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
