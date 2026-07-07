(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function setStatus(msg, kind) {
    var el = $('baStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'ba-status' + (kind ? ' ' + kind : '');
  }

  async function fetchJSON(url, options) {
    var resp = await fetch(url, Object.assign({ credentials: 'same-origin' }, options || {}));
    if (resp.status === 403) { var e = new Error('forbidden'); e.code = 403; throw e; }
    var data = await resp.json().catch(function () { return {}; });
    if (!resp.ok) { var er = new Error(data.detail || ('HTTP ' + resp.status)); er.code = resp.status; throw er; }
    return data;
  }

  function escapeHtml(raw) {
    return String(raw == null ? '' : raw)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtTime(ms) {
    if (!ms) return '-';
    try {
      return new Date(ms).toLocaleString('zh-CN', { hour12: false });
    } catch (e) {
      return '-';
    }
  }

  function renderCurrent(announcement) {
    var box = $('baCurrent');
    var clearBtn = $('baClearBtn');
    if (!announcement) {
      box.innerHTML = '<div class="ba-current-empty">当前没有生效的公告。</div>';
      if (clearBtn) clearBtn.disabled = true;
      return;
    }
    box.innerHTML = ''
      + '<div class="ba-current-content">' + escapeHtml(announcement.content) + '</div>'
      + '<div class="ba-current-meta">发送人：' + escapeHtml(announcement.created_by || '-') + ' · 发送时间：' + escapeHtml(fmtTime(announcement.created_at)) + '</div>';
    if (clearBtn) clearBtn.disabled = false;
  }

  async function loadCurrent() {
    try {
      var data = await fetchJSON('/api/announcement/latest');
      $('baMain').style.display = '';
      $('baForbidden').style.display = 'none';
      renderCurrent(data.announcement || null);
    } catch (e) {
      if (e.code === 403) {
        $('baMain').style.display = 'none';
        $('baForbidden').style.display = 'block';
      }
    }
  }

  async function sendAnnouncement() {
    var textarea = $('baContent');
    var content = textarea.value.trim();
    if (!content) {
      setStatus('公告内容不能为空。', 'err');
      return;
    }
    var btn = $('baSendBtn');
    btn.disabled = true;
    setStatus('发送中...');
    try {
      var data = await fetchJSON('/api/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content })
      });
      renderCurrent(data.announcement || null);
      textarea.value = '';
      updateCount();
      setStatus('已发送，所有在线用户将收到弹窗通知。', 'ok');
    } catch (e) {
      if (e.code === 403) {
        $('baMain').style.display = 'none';
        $('baForbidden').style.display = 'block';
      } else {
        setStatus('发送失败：' + e.message, 'err');
      }
    } finally {
      btn.disabled = false;
    }
  }

  async function clearAnnouncement() {
    if (!window.confirm('确认清空当前公告？（不会撤回已弹出的窗口，仅影响之后新加载页面的用户）')) return;
    setStatus('清空中...');
    try {
      await fetchJSON('/api/announcement', { method: 'DELETE' });
      renderCurrent(null);
      setStatus('已清空。', 'ok');
    } catch (e) {
      setStatus('清空失败：' + e.message, 'err');
    }
  }

  function updateCount() {
    var textarea = $('baContent');
    var counter = $('baCount');
    if (textarea && counter) counter.textContent = String(textarea.value.length);
  }

  function bind() {
    $('baSendBtn').addEventListener('click', sendAnnouncement);
    $('baClearBtn').addEventListener('click', clearAnnouncement);
    $('baContent').addEventListener('input', updateCount);
  }

  function init() {
    bind();
    updateCount();
    loadCurrent();
    try { if (window.lucide) window.lucide.createIcons(); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
