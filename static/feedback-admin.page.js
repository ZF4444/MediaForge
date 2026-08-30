(function () {
  'use strict';

  var state = {
    items: [],
    total: 0,
    selectedId: null
  };

  var STATUS_LABELS = {
    open: '未处理',
    reviewing: '处理中',
    resolved: '已解决',
    ignored: '已关闭'
  };

  var TYPE_LABELS = {
    issue: '问题反馈',
    idea: '功能建议',
    question: '使用疑问',
    other: '其他'
  };

  function $(id) { return document.getElementById(id); }

  function setStatus(msg, kind) {
    var el = $('fbStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'fb-status' + (kind ? ' ' + kind : '');
  }

  async function fetchJSON(url, options) {
    var resp = await fetch(url, Object.assign({ credentials: 'same-origin' }, options || {}));
    if (resp.status === 403) { var e = new Error('forbidden'); e.code = 403; throw e; }
    var data = await resp.json().catch(function () { return {}; });
    if (!resp.ok) { var er = new Error(data.detail || ('HTTP ' + resp.status)); er.code = resp.status; throw er; }
    return data;
  }

  function fmtTime(ms) {
    if (!ms) return '-';
    try {
      return new Date(ms).toLocaleString('zh-CN', { hour12: false });
    } catch (e) {
      return '-';
    }
  }

  function brief(text) {
    text = String(text || '').trim();
    return text.length > 140 ? text.slice(0, 140) + '...' : text;
  }

  function selectedItem() {
    return state.items.find(function (it) { return it.id === state.selectedId; }) || null;
  }

  function renderList() {
    var list = $('fbList');
    list.innerHTML = '';
    if (!state.items.length) {
      var empty = document.createElement('div');
      empty.className = 'fb-empty';
      empty.textContent = '暂无反馈。';
      list.appendChild(empty);
      renderDetail();
      return;
    }

    state.items.forEach(function (item) {
      var node = document.createElement('div');
      node.className = 'fb-item' + (item.id === state.selectedId ? ' active' : '');
      node.addEventListener('click', function () {
        state.selectedId = item.id;
        renderList();
        renderDetail();
      });

      var row = document.createElement('div');
      row.className = 'fb-row';
      var meta = document.createElement('div');
      meta.className = 'fb-meta';
      meta.innerHTML = ''
        + '<span class="fb-badge ' + escapeHtml(item.status || 'open') + '">' + escapeHtml(STATUS_LABELS[item.status] || item.status || '未处理') + '</span>'
        + '<span class="fb-badge">' + escapeHtml(TYPE_LABELS[item.type] || item.type || '其他') + '</span>'
        + '<span>' + escapeHtml(item.username || item.user_id || '-') + '</span>'
        + '<span>' + escapeHtml(item.page || '-') + '</span>';
      var time = document.createElement('div');
      time.className = 'fb-meta';
      time.textContent = fmtTime(item.created_at);
      row.appendChild(meta);
      row.appendChild(time);

      var content = document.createElement('div');
      content.className = 'fb-content';
      content.textContent = brief(item.content);
      node.appendChild(row);
      node.appendChild(content);
      list.appendChild(node);
    });
  }

  function escapeHtml(raw) {
    return String(raw == null ? '' : raw)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderDetail() {
    var box = $('fbDetail');
    var item = selectedItem();
    if (!item) {
      box.innerHTML = '<div class="fb-empty">从左侧选择一条反馈。</div>';
      return;
    }
    box.innerHTML = ''
      + '<div class="fb-detail-title">反馈详情</div>'
      + '<div class="fb-kv">'
      + '<div class="fb-kv-label">用户</div><div>' + escapeHtml(item.username || item.user_id || '-') + '</div>'
      + '<div class="fb-kv-label">页面</div><div>' + escapeHtml(item.page || '-') + '</div>'
      + '<div class="fb-kv-label">类型</div><div>' + escapeHtml(TYPE_LABELS[item.type] || item.type || '-') + '</div>'
      + '<div class="fb-kv-label">状态</div><div>' + escapeHtml(STATUS_LABELS[item.status] || item.status || '-') + '</div>'
      + '<div class="fb-kv-label">创建</div><div>' + escapeHtml(fmtTime(item.created_at)) + '</div>'
      + '<div class="fb-kv-label">更新</div><div>' + escapeHtml(fmtTime(item.updated_at)) + '</div>'
      + '</div>'
      + '<div class="fb-detail-content">' + escapeHtml(item.content || '') + '</div>'
      + '<label class="fb-kv-label" for="fbAdminNote">处理备注</label>'
      + '<textarea id="fbAdminNote" class="fb-textarea" maxlength="1000">' + escapeHtml(item.admin_note || '') + '</textarea>'
      + '<div class="fb-actions">'
      + '<button class="fb-btn" type="button" data-status="open">未处理</button>'
      + '<button class="fb-btn" type="button" data-status="reviewing">处理中</button>'
      + '<button class="fb-btn" type="button" data-status="resolved">已解决</button>'
      + '<button class="fb-btn" type="button" data-status="ignored">关闭</button>'
      + '<button class="fb-btn primary" type="button" id="fbSaveNoteBtn">保存备注</button>'
      + '<button class="fb-btn danger" type="button" id="fbDeleteBtn">删除</button>'
      + '</div>'
      + '<div class="fb-kv" style="margin-top:14px">'
      + '<div class="fb-kv-label">浏览器</div><div style="word-break:break-word">' + escapeHtml(item.user_agent || '-') + '</div>'
      + '</div>';

    box.querySelectorAll('[data-status]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        updateSelected({ status: btn.dataset.status, admin_note: $('fbAdminNote').value });
      });
    });
    $('fbSaveNoteBtn').addEventListener('click', function () {
      updateSelected({ admin_note: $('fbAdminNote').value });
    });
    $('fbDeleteBtn').addEventListener('click', deleteSelected);
  }

  async function load() {
    setStatus('加载中...');
    var params = new URLSearchParams();
    if ($('fbStatusFilter').value) params.set('status', $('fbStatusFilter').value);
    if ($('fbTypeFilter').value) params.set('type', $('fbTypeFilter').value);
    if ($('fbSearch').value.trim()) params.set('q', $('fbSearch').value.trim());
    params.set('limit', '100');
    try {
      var data = await fetchJSON('/api/feedback/admin?' + params.toString());
      state.items = data.items || [];
      state.total = data.total || 0;
      if (!state.items.some(function (it) { return it.id === state.selectedId; })) {
        state.selectedId = state.items[0] ? state.items[0].id : null;
      }
      $('fbMain').style.display = '';
      $('fbForbidden').style.display = 'none';
      renderList();
      renderDetail();
      setStatus('共 ' + state.total + ' 条。', 'ok');
    } catch (e) {
      if (e.code === 403) {
        $('fbMain').style.display = 'none';
        $('fbForbidden').style.display = 'block';
        setStatus('');
      } else {
        setStatus('加载失败：' + e.message, 'err');
      }
    }
  }

  async function updateSelected(payload) {
    var item = selectedItem();
    if (!item) return;
    setStatus('保存中...');
    try {
      var data = await fetchJSON('/api/feedback/admin/' + encodeURIComponent(item.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var idx = state.items.findIndex(function (it) { return it.id === item.id; });
      if (idx >= 0) state.items[idx] = data.item;
      renderList();
      renderDetail();
      setStatus('已保存。', 'ok');
    } catch (e) {
      setStatus('保存失败：' + e.message, 'err');
    }
  }

  async function deleteSelected() {
    var item = selectedItem();
    if (!item) return;
    if (!window.confirm('确认删除这条反馈？')) return;
    setStatus('删除中...');
    try {
      await fetchJSON('/api/feedback/admin/' + encodeURIComponent(item.id), { method: 'DELETE' });
      state.items = state.items.filter(function (it) { return it.id !== item.id; });
      state.total = Math.max(0, state.total - 1);
      state.selectedId = state.items[0] ? state.items[0].id : null;
      renderList();
      renderDetail();
      setStatus('已删除。', 'ok');
    } catch (e) {
      setStatus('删除失败：' + e.message, 'err');
    }
  }

  function bind() {
    $('fbRefreshBtn').addEventListener('click', load);
    $('fbStatusFilter').addEventListener('change', load);
    $('fbTypeFilter').addEventListener('change', load);
    var timer = null;
    $('fbSearch').addEventListener('input', function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 250);
    });
  }

  function init() {
    bind();
    load();
    try { if (window.lucide) window.lucide.createIcons(); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
