const statusEl = document.getElementById('status');
const quotaEnabledEl = document.getElementById('quotaEnabled');
const defaultQuotaGbEl = document.getElementById('defaultQuotaGb');
const summaryUsersEl = document.getElementById('summaryUsers');
const summaryUsedEl = document.getElementById('summaryUsed');
const summaryDefaultEl = document.getElementById('summaryDefault');
const userTableEl = document.getElementById('userTable');
const searchInputEl = document.getElementById('searchInput');
const saveBtn = document.getElementById('saveBtn');
const refreshBtn = document.getElementById('refreshBtn');

let quotaConfig = {enabled:true, default_quota_bytes:null, users:{}};
let quotaUsers = [];
let quotaDrafts = {};
let searchQuery = '';

function setStatus(text='准备就绪'){ if(statusEl) statusEl.textContent = text || '准备就绪'; }
function escapeHtml(value=''){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
async function apiJson(url, options={}){
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.detail || data.message || '操作失败');
    return data;
}
function formatFileSize(bytes=0){
    const size = Number(bytes || 0);
    if(!size) return '0 B';
    const units = ['B','KB','MB','GB','TB'];
    const idx = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
    return `${(size / Math.pow(1024, idx)).toFixed(idx ? 1 : 0)} ${units[idx]}`;
}
function bytesToGb(value){
    const num = Number(value);
    if(!Number.isFinite(num) || num <= 0) return 0;
    return num / (1024 ** 3);
}
function formatGb(value){
    const gb = bytesToGb(value);
    if(!gb) return '';
    return String(Math.round(gb * 100) / 100);
}
function parseGbToBytes(value){
    const text = String(value ?? '').trim();
    if(!text) return null;
    const gb = Number(text);
    if(!Number.isFinite(gb) || gb < 0) return null;
    return Math.round(gb * (1024 ** 3));
}
function effectiveQuotaFor(user){
    return Number(user?.effective_quota_bytes || 0);
}
function draftValueFor(userId=''){
    if(quotaDrafts[userId] !== undefined) return quotaDrafts[userId];
    return formatGb((((quotaConfig || {}).users || {})[userId] || {}).quota_bytes);
}
function filteredUsers(){
    const q = String(searchQuery || '').trim().toLowerCase();
    if(!q) return quotaUsers.slice();
    return quotaUsers.filter(user => [user.user_id, user.username].join(' ').toLowerCase().includes(q));
}
function renderSummary(){
    const totalUsed = quotaUsers.reduce((sum, user) => sum + Number(user.used_bytes || 0), 0);
    if(summaryUsersEl) summaryUsersEl.textContent = String(quotaUsers.length);
    if(summaryUsedEl) summaryUsedEl.textContent = formatFileSize(totalUsed);
    if(summaryDefaultEl) summaryDefaultEl.textContent = quotaConfig?.default_quota_bytes ? `${formatGb(quotaConfig.default_quota_bytes)} GB` : '不限';
}
function renderUsers(){
    const users = filteredUsers();
    userTableEl.innerHTML = `
        <div class="row header">
            <div>用户</div>
            <div>已用空间</div>
            <div>生效配额</div>
            <div>用户配额</div>
            <div>快捷</div>
        </div>
        ${users.map(user => {
            const used = Number(user.used_bytes || 0);
            const quota = effectiveQuotaFor(user);
            const percent = quota > 0 ? Math.max(0, Math.min(100, used / quota * 100)) : 0;
            return `
                <div class="row">
                    <div>
                        <div class="user-name">${escapeHtml(user.username || user.user_id || '')}</div>
                        <div class="muted" style="margin-top:4px;">${escapeHtml(user.user_id || '')}</div>
                        <div class="used-bar"><span style="width:${percent.toFixed(1)}%"></span></div>
                    </div>
                    <div>${escapeHtml(formatFileSize(used))}</div>
                    <div>${quota > 0 ? `${escapeHtml(formatGb(quota))} GB` : '不限'}</div>
                    <div>
                        <div class="quota-input">
                            <input type="number" min="0" step="0.1" data-user-quota="${escapeHtml(user.user_id || '')}" value="${escapeHtml(draftValueFor(user.user_id || ''))}">
                            <span>GB</span>
                        </div>
                    </div>
                    <div class="quick-actions">
                        <button class="quick" type="button" data-quick-user="${escapeHtml(user.user_id || '')}" data-quick-gb="2">2</button>
                        <button class="quick" type="button" data-quick-user="${escapeHtml(user.user_id || '')}" data-quick-gb="5">5</button>
                        <button class="quick" type="button" data-quick-user="${escapeHtml(user.user_id || '')}" data-quick-gb="10">10</button>
                        <button class="quick" type="button" data-quick-user="${escapeHtml(user.user_id || '')}" data-quick-gb="">不限</button>
                    </div>
                </div>
            `;
        }).join('') || '<div class="row"><div>暂无用户</div></div>'}
    `;
}
function render(){
    if(quotaEnabledEl) quotaEnabledEl.checked = quotaConfig?.enabled !== false;
    if(defaultQuotaGbEl) defaultQuotaGbEl.value = formatGb(quotaConfig?.default_quota_bytes);
    renderSummary();
    renderUsers();
    if(window.lucide) lucide.createIcons();
}
async function loadConfig(){
    setStatus('加载中...');
    const data = await apiJson('/api/storage/config');
    quotaConfig = data.config || {enabled:true, default_quota_bytes:null, users:{}};
    quotaUsers = Array.isArray(data.users) ? data.users : [];
    quotaDrafts = {};
    render();
    setStatus('准备就绪');
}
async function saveConfig(){
    const users = {};
    quotaUsers.forEach(user => {
        const userId = String(user.user_id || '');
        users[userId] = {quota_bytes: parseGbToBytes(draftValueFor(userId))};
    });
    Object.keys((quotaConfig || {}).users || {}).forEach(userId => {
        if(users[userId] !== undefined) return;
        users[userId] = {quota_bytes: (((quotaConfig || {}).users || {})[userId] || {}).quota_bytes ?? null};
    });
    const payload = {
        enabled: !!quotaEnabledEl?.checked,
        default_quota_bytes: parseGbToBytes(defaultQuotaGbEl?.value || ''),
        users,
    };
    setStatus('保存中...');
    const data = await apiJson('/api/storage/config', {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),
    });
    quotaConfig = data.config || payload;
    quotaUsers = Array.isArray(data.users) ? data.users : quotaUsers;
    quotaDrafts = {};
    await loadConfig();
    setStatus('已保存');
}

userTableEl?.addEventListener('input', event => {
    const input = event.target.closest?.('[data-user-quota]');
    if(!input) return;
    quotaDrafts[input.dataset.userQuota || ''] = input.value || '';
});
document.addEventListener('click', event => {
    const quick = event.target.closest?.('[data-quick-user]');
    if(quick){
        const userId = quick.dataset.quickUser || '';
        const value = quick.dataset.quickGb ?? '';
        quotaDrafts[userId] = value;
        renderUsers();
        return;
    }
    const def = event.target.closest?.('[data-default-gb]');
    if(def && defaultQuotaGbEl){
        defaultQuotaGbEl.value = def.dataset.defaultGb ?? '';
    }
});
searchInputEl?.addEventListener('input', event => {
    searchQuery = event.target.value || '';
    renderUsers();
});
saveBtn?.addEventListener('click', () => saveConfig().catch(err => setStatus(err.message || '保存失败')));
refreshBtn?.addEventListener('click', () => loadConfig().catch(err => setStatus(err.message || '加载失败')));
document.addEventListener('DOMContentLoaded', () => loadConfig().catch(err => setStatus(err.message || '加载失败')));
