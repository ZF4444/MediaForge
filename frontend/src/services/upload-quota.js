import { createIcons, Database, X } from 'lucide';
import { apiJson, apiForm } from './http.js';

const DIALOG_ID = 'storageQuotaExceededDialog';
const icons = { Database, X };

function formatGb(bytes) {
  if (bytes == null || bytes === '') return '--';
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return '--';
  return (size / (1024 ** 3)).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

async function quotaSnapshot(data) {
  const snapshot = { ...(data || {}) };
  const hasUsed = snapshot.used_bytes != null && snapshot.used_bytes !== '' && Number.isFinite(Number(snapshot.used_bytes));
  if (Number(snapshot.quota_bytes) > 0 && hasUsed) return snapshot;
  try {
    const usage = await apiJson('/api/storage/usage');
    if (!(Number(snapshot.quota_bytes) > 0)) snapshot.quota_bytes = usage?.quota_bytes;
    if (!hasUsed) snapshot.used_bytes = usage?.used_bytes;
  } catch {}
  return snapshot;
}

function ensureStyles() {
  if (document.getElementById('storageQuotaDialogStyles')) return;
  const style = document.createElement('style');
  style.id = 'storageQuotaDialogStyles';
  style.textContent = `
    .storage-quota-dialog-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.46);backdrop-filter:blur(8px)}
    .storage-quota-dialog{width:min(440px,calc(100vw - 32px));overflow:hidden;border:1px solid rgba(148,163,184,.3);border-radius:8px;background:var(--surface,#fff);color:var(--text,#172033);box-shadow:0 24px 70px rgba(15,23,42,.28)}
    .storage-quota-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px 12px}
    .storage-quota-dialog-title{font-size:17px;font-weight:750}.storage-quota-dialog-close{display:grid;width:34px;height:34px;flex:0 0 34px;place-items:center;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer}
    .storage-quota-dialog-close:hover{background:rgba(148,163,184,.16)}.storage-quota-dialog-close svg{width:18px;height:18px}
    .storage-quota-dialog-message{padding:4px 20px 22px;font-size:14px;line-height:1.7;color:var(--muted,#586174)}
    .storage-quota-dialog-actions{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid rgba(148,163,184,.22);background:rgba(148,163,184,.06)}
    .storage-quota-dialog-btn{display:inline-flex;min-height:38px;align-items:center;justify-content:center;gap:7px;padding:0 14px;border:1px solid rgba(148,163,184,.38);border-radius:6px;background:transparent;color:inherit;font-size:13px;font-weight:700;cursor:pointer}
    .storage-quota-dialog-btn.primary{border-color:#2563eb;background:#2563eb;color:#fff}.storage-quota-dialog-btn svg{width:16px;height:16px}
    .theme-dark .storage-quota-dialog,body.theme-dark .storage-quota-dialog{background:#111827;color:#f8fafc}
    .theme-dark .storage-quota-dialog-message,body.theme-dark .storage-quota-dialog-message{color:#cbd5e1}
  `;
  document.head.appendChild(style);
}

function closeDialog() {
  document.getElementById(DIALOG_ID)?.remove();
}

export function openStorageManagement() {
  closeDialog();
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'studio-open-asset-storage' }, location.origin);
    return;
  }
  window.location.href = '/static/storage-manager.html';
}

function createDialog(title, message, actions) {
  ensureStyles();
  closeDialog();
  const overlay = document.createElement('div');
  overlay.id = DIALOG_ID;
  overlay.className = 'storage-quota-dialog-overlay';
  overlay.setAttribute('role', 'presentation');
  overlay.innerHTML = `
    <section class="storage-quota-dialog" role="dialog" aria-modal="true" aria-labelledby="storageQuotaDialogTitle">
      <div class="storage-quota-dialog-head">
        <div id="storageQuotaDialogTitle" class="storage-quota-dialog-title">${title}</div>
        <button class="storage-quota-dialog-close" type="button" data-quota-close aria-label="关闭" title="关闭"><i data-lucide="x"></i></button>
      </div>
      <div class="storage-quota-dialog-message">${message}</div>
      <div class="storage-quota-dialog-actions">${actions}</div>
    </section>`;
  overlay.addEventListener('click', event => {
    if (event.target === overlay || event.target.closest('[data-quota-close]')) closeDialog();
    if (event.target.closest('[data-quota-manage]')) openStorageManagement();
  });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeDialog();
  });
  document.body.appendChild(overlay);
  createIcons({ icons, root: overlay });
  overlay.querySelector('[data-quota-close], [data-quota-manage]')?.focus();
}

export function showQuotaDialog(data) {
  const quotaGb = formatGb(data?.quota_bytes);
  const usedGb = formatGb(data?.used_bytes);
  createDialog('存储空间不足', `
    存储空间不足: 存储空间 ${quotaGb}GB, 已使用了 ${usedGb}GB<br>
    可前往空间管理，在条件筛选中勾选“仅未被画布、对话或素材库引用”，删除符合条件的文件<br>
    如果无引用的文件较少，可以删除无用的画布或画布中的节点，然后再勾选无引用的文件删除。
  `, `
    <button class="storage-quota-dialog-btn" type="button" data-quota-close>关闭</button>
    <button class="storage-quota-dialog-btn primary" type="button" data-quota-manage><i data-lucide="database"></i><span>前往空间管理</span></button>
  `);
}

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = String(value || '');
  return node.innerHTML;
}

export function showBudgetDialog(data) {
  const message = escapeHtml(data?.message || data?.detail || '本月使用预算已用尽，暂时无法继续执行任务。');
  createDialog('预算不足', `${message}<br>请联系管理员(@飞帆)增加预算或调整预算配置。`, `
    <button class="storage-quota-dialog-btn primary" type="button" data-quota-close>我知道了</button>
  `);
}

export async function upload(form, onProgress) {
  if (typeof onProgress !== 'function') {
    let data = {};
    try { data = await apiForm('/api/ai/upload', form); }
    catch (error) {
      if (error.status !== 413) throw error;
      data = error.data || {};
      showQuotaDialog(await quotaSnapshot(data));
      return { files: [], quota_exceeded: true };
    }
    return data;
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/ai/upload');
    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    });
    xhr.addEventListener('load', async () => {
      const text = xhr.responseText || '';
      let data = {};
      try { data = text ? JSON.parse(text) : {}; }
      catch { data = { detail: text }; }
      if (xhr.status === 413) {
        const quotaError = new Error(data?.detail || data?.message || '上传失败');
        quotaError.status = xhr.status;
        quotaError.data = data;
        showQuotaDialog(await quotaSnapshot(data));
        resolve({ files: [], quota_exceeded: true });
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(data?.detail || data?.message || '上传失败'));
        return;
      }
      resolve(data);
    });
    xhr.addEventListener('error', () => reject(new Error('上传失败')));
    xhr.send(form);
  });
}

export const MediaForgeUpload = { upload, showQuotaDialog, showBudgetDialog, openStorageManagement };
