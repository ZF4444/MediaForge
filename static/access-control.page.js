/* 访问控制管理页逻辑。仅 admin 可用；后端 config 接口对非 admin 返回 403。 */
(function () {
  'use strict';

  var DEFAULT_ID = '__default__';   // 虚拟条目：新用户默认配置

  var state = {
    allPages: [],
    allNodes: [],
    users: [],          // [{user_id, username}]
    config: {},         // { user_id: {pages:[], nodes:[]} }
    default: null,      // {pages:[], nodes:[]} 或 null（null = 新用户全开）
    selected: null,     // 当前选中的 user_id 或 DEFAULT_ID
    draftPages: new Set(),
    draftNodes: new Set(),
  };

  function $(id) { return document.getElementById(id); }
  function allPageIds() { return state.allPages.map(function (p) { return p.id; }); }
  function allNodeIds() { return state.allNodes.map(function (n) { return n.id; }); }

  function setStatus(msg, kind) {
    var el = $('acStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'ac-status' + (kind ? ' ' + kind : '');
  }

  async function fetchJSON(url, options) {
    var resp = await fetch(url, Object.assign({ credentials: 'same-origin' }, options || {}));
    if (resp.status === 403) { var e = new Error('forbidden'); e.code = 403; throw e; }
    if (!resp.ok) { var er = new Error('http ' + resp.status); er.code = resp.status; throw er; }
    return resp.json();
  }

  function isRestricted(uid) {
    return Object.prototype.hasOwnProperty.call(state.config, uid);
  }

  // 未单独配置的用户实际生效的来源标签
  function fallbackBadge() {
    return state.default ? '默认' : '全部';
  }

  function makeItem(id, name, badgeText, badgeClass) {
    var item = document.createElement('div');
    item.className = 'ac-user-item' + (state.selected === id ? ' active' : '');
    var label = document.createElement('span');
    label.textContent = name;
    var badge = document.createElement('span');
    badge.className = 'ac-user-badge' + (badgeClass ? ' ' + badgeClass : '');
    badge.textContent = badgeText;
    item.appendChild(label);
    item.appendChild(badge);
    item.addEventListener('click', function () { selectUser(id); });
    return item;
  }

  function renderUsers() {
    var list = $('acUserList');
    list.innerHTML = '';

    // 顶部固定：默认（新用户）配置条目
    list.appendChild(makeItem(
      DEFAULT_ID,
      '默认（新用户）',
      state.default ? '已设置' : '未设置',
      state.default ? 'restricted' : ''
    ));

    var divider = document.createElement('div');
    divider.style.cssText = 'height:1px;background:var(--border,#e5e7eb);margin:8px 2px;';
    list.appendChild(divider);

    if (!state.users.length) {
      var empty = document.createElement('div');
      empty.className = 'ac-empty';
      empty.textContent = '暂无其他注册用户。';
      list.appendChild(empty);
      return;
    }
    state.users.forEach(function (u) {
      var restricted = isRestricted(u.user_id);
      var name = u.username && u.username !== u.user_id ? (u.username + ' (' + u.user_id + ')') : u.user_id;
      list.appendChild(makeItem(
        u.user_id,
        name,
        restricted ? '已限制' : fallbackBadge(),
        restricted ? 'restricted' : ''
      ));
    });
  }

  function buildChecks(containerId, allItems, draftSet) {
    var box = $(containerId);
    box.innerHTML = '';
    allItems.forEach(function (it) {
      var checked = draftSet.has(it.id);
      var lab = document.createElement('label');
      lab.className = 'ac-check' + (checked ? ' checked' : '');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      input.value = it.id;
      input.addEventListener('change', function () {
        if (input.checked) draftSet.add(it.id); else draftSet.delete(it.id);
        lab.classList.toggle('checked', input.checked);
      });
      var span = document.createElement('span');
      span.textContent = it.label;
      lab.appendChild(input);
      lab.appendChild(span);
      box.appendChild(lab);
    });
  }

  function selectUser(id) {
    state.selected = id;
    var src;
    if (id === DEFAULT_ID) {
      // 默认配置：已设置则用之，否则预填全部
      src = state.default || { pages: allPageIds(), nodes: allNodeIds() };
    } else {
      var cfg = state.config[id];
      // 已单独配置 => 用其列表；否则预填「当前默认」或全部，便于在此基础上调整
      src = cfg || state.default || { pages: allPageIds(), nodes: allNodeIds() };
    }
    state.draftPages = new Set(src.pages || []);
    state.draftNodes = new Set(src.nodes || []);

    $('acDetailEmpty').style.display = 'none';
    $('acDetail').style.display = '';
    $('acDetailTitle').textContent = id === DEFAULT_ID ? '默认（新用户）配置' : '用户配置';
    // 仅默认条目显示「清除默认」按钮
    $('acClearDefaultWrap').style.display = id === DEFAULT_ID ? '' : 'none';

    renderUsers();
    buildChecks('acPages', state.allPages, state.draftPages);
    buildChecks('acNodes', state.allNodes, state.draftNodes);
    setStatus('');
  }

  function applyBulk(kind, val) {
    var all = kind === 'pages' ? state.allPages : state.allNodes;
    var set = kind === 'pages' ? state.draftPages : state.draftNodes;
    set.clear();
    if (val === 'all') all.forEach(function (it) { set.add(it.id); });
    buildChecks(kind === 'pages' ? 'acPages' : 'acNodes', all, set);
  }

  // 组装并发送完整配置（默认 + 全部用户）。editingDefaultCleared=true 表示本次清除默认。
  async function persist(editingDefaultCleared) {
    var btn = $('acSaveBtn');
    btn.disabled = true;
    setStatus('保存中...');

    // 把当前草稿写回到内存状态（取决于正在编辑谁）
    if (state.selected === DEFAULT_ID) {
      state.default = editingDefaultCleared ? null : {
        pages: Array.from(state.draftPages),
        nodes: Array.from(state.draftNodes),
      };
    } else if (state.selected) {
      state.config[state.selected] = {
        pages: Array.from(state.draftPages),
        nodes: Array.from(state.draftNodes),
      };
    }

    var usersPayload = {};
    Object.keys(state.config).forEach(function (uid) {
      usersPayload[uid] = {
        pages: (state.config[uid].pages || []).slice(),
        nodes: (state.config[uid].nodes || []).slice(),
      };
    });

    var body = { users: usersPayload, default: state.default };
    try {
      var res = await fetchJSON('/api/access-control/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      state.config = res.config || {};
      state.default = res.default || null;
      renderUsers();
      // 重新同步当前编辑项的草稿（清除默认后回到全部预填）
      if (state.selected) selectUser(state.selected);
      setStatus('已保存。', 'ok');
    } catch (e) {
      setStatus(e.code === 403 ? '无权限。' : '保存失败：' + e.message, 'err');
    } finally {
      btn.disabled = false;
    }
  }

  async function init() {
    try {
      var data = await fetchJSON('/api/access-control/config');
      state.allPages = data.all_pages || [];
      state.allNodes = data.all_nodes || [];
      state.users = data.users || [];
      state.config = data.config || {};
      state.default = data.default || null;
      $('acMain').style.display = '';
      renderUsers();
    } catch (e) {
      if (e.code === 403) {
        $('acMain').style.display = 'none';
        $('acForbidden').style.display = '';
      } else {
        setStatus('加载失败：' + e.message, 'err');
      }
      return;
    }

    document.querySelectorAll('.ac-mini-btn[data-bulk]').forEach(function (b) {
      b.addEventListener('click', function () { applyBulk(b.dataset.bulk, b.dataset.val); });
    });
    $('acSaveBtn').addEventListener('click', function () { persist(false); });
    var clearBtn = $('acClearDefaultBtn');
    if (clearBtn) clearBtn.addEventListener('click', function () { persist(true); });

    try { if (window.lucide) window.lucide.createIcons(); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
