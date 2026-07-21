(function () {
    const DIALOG_ID = 'storageQuotaExceededDialog';
    const REQUESTED_TAB_KEY = 'asset_manager_requested_tab';

    function formatGb(bytes) {
        const value = Math.max(0, Number(bytes || 0)) / (1024 * 1024 * 1024);
        return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    }

    function ensureStyles() {
        if (document.getElementById('storageQuotaDialogStyles')) return;
        const style = document.createElement('style');
        style.id = 'storageQuotaDialogStyles';
        style.textContent = `
            .storage-quota-dialog-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.46);backdrop-filter:blur(8px)}
            .storage-quota-dialog{width:min(440px,calc(100vw - 32px));overflow:hidden;border:1px solid rgba(148,163,184,.3);border-radius:8px;background:var(--surface,#fff);color:var(--text,#172033);box-shadow:0 24px 70px rgba(15,23,42,.28)}
            .storage-quota-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px 12px}
            .storage-quota-dialog-title{font-size:17px;font-weight:750}
            .storage-quota-dialog-close{display:grid;width:34px;height:34px;flex:0 0 34px;place-items:center;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer}
            .storage-quota-dialog-close:hover{background:rgba(148,163,184,.16)}
            .storage-quota-dialog-close svg{width:18px;height:18px}
            .storage-quota-dialog-message{padding:4px 20px 22px;font-size:14px;line-height:1.7;color:var(--muted,#586174)}
            .storage-quota-dialog-actions{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid rgba(148,163,184,.22);background:rgba(148,163,184,.06)}
            .storage-quota-dialog-btn{display:inline-flex;min-height:38px;align-items:center;justify-content:center;gap:7px;padding:0 14px;border:1px solid rgba(148,163,184,.38);border-radius:6px;background:transparent;color:inherit;font-size:13px;font-weight:700;cursor:pointer}
            .storage-quota-dialog-btn.primary{border-color:#2563eb;background:#2563eb;color:#fff}
            .storage-quota-dialog-btn svg{width:16px;height:16px}
            .theme-dark .storage-quota-dialog,body.theme-dark .storage-quota-dialog{background:#111827;color:#f8fafc}
            .theme-dark .storage-quota-dialog-message,body.theme-dark .storage-quota-dialog-message{color:#cbd5e1}
        `;
        document.head.appendChild(style);
    }

    function closeDialog() {
        document.getElementById(DIALOG_ID)?.remove();
    }

    function openStorageManagement() {
        closeDialog();
        try { localStorage.setItem(REQUESTED_TAB_KEY, 'storage'); } catch (_) {}
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({type: 'studio-open-asset-storage'}, location.origin);
            return;
        }
        window.location.href = '/static/asset-manager.html?tab=storage';
    }

    function showQuotaDialog(data) {
        ensureStyles();
        closeDialog();
        const quotaGb = formatGb(data?.quota_bytes);
        const usedGb = formatGb(data?.used_bytes);
        const overlay = document.createElement('div');
        overlay.id = DIALOG_ID;
        overlay.className = 'storage-quota-dialog-overlay';
        overlay.setAttribute('role', 'presentation');
        overlay.innerHTML = `
            <section class="storage-quota-dialog" role="dialog" aria-modal="true" aria-labelledby="storageQuotaDialogTitle">
                <div class="storage-quota-dialog-head">
                    <div id="storageQuotaDialogTitle" class="storage-quota-dialog-title">存储空间不足</div>
                    <button class="storage-quota-dialog-close" type="button" data-quota-close aria-label="关闭" title="关闭"><i data-lucide="x"></i></button>
                </div>
                <div class="storage-quota-dialog-message">存储空间不足: 存储空间 ${quotaGb}GB, 已使用了 ${usedGb}GB</div>
                <div class="storage-quota-dialog-actions">
                    <button class="storage-quota-dialog-btn" type="button" data-quota-close>关闭</button>
                    <button class="storage-quota-dialog-btn primary" type="button" data-quota-manage><i data-lucide="database"></i><span>前往空间管理</span></button>
                </div>
            </section>
        `;
        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.closest('[data-quota-close]')) closeDialog();
            if (event.target.closest('[data-quota-manage]')) openStorageManagement();
        });
        overlay.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeDialog();
        });
        document.body.appendChild(overlay);
        window.lucide?.createIcons?.();
        overlay.querySelector('[data-quota-manage]')?.focus();
    }

    async function upload(form) {
        const response = await fetch('/api/ai/upload', {method: 'POST', body: form});
        const text = await response.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; }
        catch (_) { data = {detail: text}; }
        if (response.status === 413 && data?.error === 'storage_quota_exceeded') {
            showQuotaDialog(data);
            return {files: [], quota_exceeded: true};
        }
        if (!response.ok) throw new Error(data?.detail || data?.message || '上传失败');
        return data;
    }

    window.MediaForgeUpload = {upload, showQuotaDialog, openStorageManagement};
})();
