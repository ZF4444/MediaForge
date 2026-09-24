import {
    assignUserOrganization as requestAssignUserOrganization,
    assignUserType as requestAssignUserType,
    createOrganization as requestCreateOrganization,
    deleteManagedUser as requestDeleteManagedUser,
    deleteOrganization as requestDeleteOrganization,
    listManagedUsers as requestListManagedUsers,
    listOrganizations as requestListOrganizations,
    listUserSessions as requestListUserSessions,
    loadUsage as requestLoadUsage,
    renameOrganization as requestRenameOrganization,
    saveNewUserDefaultBudget as requestSaveNewUserDefaultBudget,
    saveOrganizationBudget as requestSaveOrganizationBudget,
    saveUserBudget as requestSaveUserBudget,
} from '../services/user-management.js';
import { createIcons } from 'lucide/dist/esm/lucide.mjs';
import Users from 'lucide/dist/esm/icons/users.mjs';
import ShieldCheck from 'lucide/dist/esm/icons/shield-check.mjs';
import Database from 'lucide/dist/esm/icons/database.mjs';
import MonitorSmartphone from 'lucide/dist/esm/icons/monitor-smartphone.mjs';
import ChartNoAxesColumn from 'lucide/dist/esm/icons/chart-no-axes-column.mjs';
import WalletCards from 'lucide/dist/esm/icons/wallet-cards.mjs';
import Plus from 'lucide/dist/esm/icons/plus.mjs';
import RefreshCw from 'lucide/dist/esm/icons/refresh-cw.mjs';
import Trash from 'lucide/dist/esm/icons/trash.mjs';
import Pencil from 'lucide/dist/esm/icons/pencil.mjs';
import Check from 'lucide/dist/esm/icons/check.mjs';
import { applyStoredTheme } from '../shared/theme-bootstrap.js';

applyStoredTheme();

(() => {
    const pageIcons = {users:Users,shieldCheck:ShieldCheck,database:Database,monitorSmartphone:MonitorSmartphone,chartNoAxesColumn:ChartNoAxesColumn,'chart-no-axes-column':ChartNoAxesColumn,walletCards:WalletCards,plus:Plus,refreshCw:RefreshCw,refreshCW:RefreshCw,refresh:RefreshCw,trash:Trash,trash2:Trash,'trash-2':Trash,pencil:Pencil,check:Check};
    const renderIcons = () => createIcons({icons:pageIcons});
    const state = { users: [], orgs: [], types: {}, userTypes: {}, query: '', usage: null };
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    function orgName(orgId){
        const org = state.orgs.find(o => o.id === orgId);
        return org ? org.name : '';
    }
    function renderUsers(){
        const q = state.query.trim().toLowerCase();
        const users = q ? state.users.filter(u => `${u.username || ''} ${u.user_id || ''}`.toLowerCase().includes(q)) : state.users;
        document.getElementById('userCount').textContent = `${state.users.length} 位用户`;
        const orgOptions = state.orgs.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
        const typeOptions = Object.entries(state.types).map(([id, type]) => `<option value="${esc(id)}">${esc(type.name || id)}</option>`).join('');
        document.getElementById('userTable').innerHTML = `<div class="row header"><div>用户</div><div>用户 ID</div><div>账号类型</div><div>组织</div><div>操作</div></div>${users.map(u => {
            const orgSelect = `<select class="org-select" data-user="${esc(u.user_id)}"><option value="">未分配</option>${orgOptions}</select>`;
            const typeSelect = `<select class="org-select" data-user-type="${esc(u.user_id)}">${typeOptions}</select>`;
            const deleteButton = `<button type="button" class="user-delete" data-user-delete="${esc(u.user_id)}" title="删除用户"><i data-lucide="trash-2"></i></button>`;
            return `<div class="row"><div class="user">${esc(u.username || u.user_id)}</div><div class="id">${esc(u.user_id)}</div><div>${typeSelect}</div><div>${orgSelect}</div><div>${deleteButton}</div></div>`;
        }).join('') || '<div class="empty">没有匹配的用户</div>'}`;
        document.querySelectorAll('[data-user-type]').forEach(sel => {
            sel.value = state.userTypes[sel.dataset.userType] || 'new-user';
        });
        document.querySelectorAll('.org-select[data-user]').forEach(sel => {
            const user = state.users.find(u => u.user_id === sel.dataset.user);
            sel.value = (user && user.org_id) || '';
        });
        renderIcons();
    }
    function renderOrgs(){
        document.getElementById('orgList').innerHTML = state.orgs.length ? state.orgs.map(o => `
            <div class="org-chip" data-org="${esc(o.id)}">
                <span class="org-chip-name">${esc(o.name)}</span>
                <span class="org-chip-count">${o.member_count} 人</span>
                <span class="org-chip-actions">
                    <button type="button" class="org-chip-btn" data-action="rename" title="重命名"><i data-lucide="pencil"></i></button>
                    <button type="button" class="org-chip-btn" data-action="delete" title="删除"><i data-lucide="trash-2"></i></button>
                </span>
            </div>`).join('') : '<div class="org-empty">还没有组织，创建一个用于分组管理用户。</div>';
        renderIcons();
    }
    async function loadUsers(){
        try { const d = await requestListManagedUsers(); state.users = d.users || []; state.types = d.types || {}; state.userTypes = d.user_types || {}; document.getElementById('status').textContent = ''; renderUsers(); }
        catch(e){ document.getElementById('status').textContent = e.message || '加载失败'; }
    }
    async function loadOrgs(){
        try { const d = await requestListOrganizations(); state.orgs = d.organizations || []; renderOrgs(); renderUsers(); }
        catch(e){ document.getElementById('orgStatus').textContent = e.message || '加载失败'; }
    }
    async function createOrg(name){
        const status = document.getElementById('orgStatus');
        status.textContent = '创建中...';
        try {
            await requestCreateOrganization(name);
            status.textContent = '已创建';
            await loadOrgs();
        } catch(e){ status.textContent = e.message || '创建失败'; }
    }
    async function renameOrg(orgId){
        const current = orgName(orgId);
        const next = window.prompt('重命名组织', current);
        if(next == null) return;
        const trimmed = next.trim();
        if(!trimmed || trimmed === current) return;
        const status = document.getElementById('orgStatus');
        try {
            await requestRenameOrganization(orgId, trimmed);
            await loadOrgs();
        } catch(e){ status.textContent = e.message || '重命名失败'; }
    }
    async function deleteOrg(orgId){
        const name = orgName(orgId);
        if(!window.confirm(`删除组织「${name}」？成员将解除归属，不会被删除。`)) return;
        const status = document.getElementById('orgStatus');
        try {
            await requestDeleteOrganization(orgId);
            await Promise.all([loadOrgs(), loadUsers()]);
        } catch(e){ status.textContent = e.message || '删除失败'; }
    }
    async function assignUserOrg(userId, orgId){
        const status = document.getElementById('status');
        try {
            await requestAssignUserOrganization(userId, orgId);
            await Promise.all([loadUsers(), loadOrgs()]);
        } catch(e){ status.textContent = e.message || '分配失败'; }
    }
    async function assignUserType(userId, typeId){
        const status = document.getElementById('status');
        try {
            const d = await requestAssignUserType(userId, typeId);
            state.userTypes[userId] = d.user_type;
            status.textContent = '用户类型已更新';
        } catch(e){ status.textContent = e.message || '分配失败'; await loadUsers(); }
    }
    async function deleteUser(userId){
        const user = state.users.find(item => item.user_id === userId);
        const name = user?.username || userId;
        if(!window.confirm(`删除用户「${name}」？该用户将无法继续登录，历史用量记录会保留。`)) return;
        const status = document.getElementById('status');
        status.textContent = '删除中...';
        try {
            await requestDeleteManagedUser(userId);
            await Promise.all([loadUsers(), loadOrgs()]);
            status.textContent = '用户已删除';
        } catch(e){ status.textContent = e.message || '删除失败'; }
    }
    const money = value => `$${Number(value || 0).toFixed(4)}`;
    const moneyUsd = value => `$${Number(value || 0).toFixed(4)}`;
    const dateTime = value => value ? new Date(Number(value)).toLocaleString('zh-CN', {hour12:false}) : '—';
    function renderUsage(){
        const data = state.usage;
        const usageTable = document.getElementById('usageTable');
        const usageSummary = document.getElementById('usageSummary');
        if(!data){ usageSummary.innerHTML = ''; usageTable.innerHTML = ''; return; }
        const organizations = data.organizations || [];
        const users = data.user_budgets || [];
        usageSummary.innerHTML = `<section class="usage-summary"><h3 class="usage-summary-title">组织汇总</h3><div class="usage-summary-table"><div class="usage-summary-line header"><div>组织</div><div>消耗</div><div>RunningHub 用量</div><div>任务数</div></div>${organizations.map(org => `<div class="usage-summary-line"><div><strong>${esc(org.name)}</strong></div><div>${moneyUsd(org.spent_cny)}</div><div>${Number(org.consume_coins || 0).toFixed(2)} RH币</div><div>${Number(org.task_count || 0)}</div></div>`).join('') || '<div class="usage-empty">暂无组织消耗记录</div>'}</div></section><section class="usage-summary"><h3 class="usage-summary-title">个人汇总</h3><div class="usage-summary-table"><div class="usage-summary-line personal header"><div>用户</div><div>消耗</div><div>组织</div></div>${users.map(user => `<div class="usage-summary-line personal"><div><strong>${esc(user.username || user.user_id)}</strong><div class="usage-summary-note">${esc(user.user_id)}</div></div><div>${moneyUsd(user.spent_usd)}</div><div>${esc(user.organization_name || '未分配')}</div></div>`).join('') || '<div class="usage-empty">暂无个人消耗记录</div>'}</div></section>`;
        const rhRecords = (data.records || []).map(item => ({...item, source:'RunningHub', reference:item.upstream_task_id, units:`${Number(item.consume_coins || 0).toFixed(2)} RH币`, timestamp:item.completed_at || item.submitted_at}));
        const omniRecords = (data.omnilojo?.records || []).map(item => ({...item, source:'Omnilojo', reference:item.request_id || item.upstream_request_id || item.upstream_log_id, status:'succeeded', units:`输入 ${Number(item.prompt_tokens || 0)} / 输出 ${Number(item.completion_tokens || 0)} token`, timestamp:item.created_at}));
        const records = [...rhRecords, ...omniRecords].sort((a,b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
        usageTable.innerHTML = `<div class="usage-line header"><div>用户 / 来源</div><div>连接 / 模型 / 资源</div><div>组织</div><div>状态</div><div>费用</div><div>用量</div><div>时间</div></div>${records.map(item => `<div class="usage-line"><div><strong>${esc(item.username || item.user_id || '未分配')}</strong><div class="usage-task">${esc(item.source)} · ${esc(item.reference || '')}</div></div><div><strong>${esc(item.connection_name || '未指定连接')}</strong><div class="usage-task">模型：${esc(item.model_name || item.model || '—')}${item.model_id ? ` · ${esc(item.model_id)}` : ''}</div>${item.resource_name || item.resource_id ? `<div class="usage-task">资源：${esc(item.resource_name || item.resource_id)}</div>` : ''}</div><div>${esc(item.organization_name || '未分配')}</div><div class="usage-status ${esc(item.status)}">${esc(item.status)}</div><div>${item.source === 'Omnilojo' ? moneyUsd(item.cost_usd) : money(item.total_money_cny)}</div><div>${esc(item.units)}</div><div>${dateTime(item.timestamp)}</div></div>`).join('') || '<div class="usage-empty">这个月还没有使用记录</div>'}`;
    }
    function renderBudgets(){
        const data = state.usage;
        const budgetGrid = document.getElementById('budgetGrid');
        const personalBudgetGrid = document.getElementById('personalBudgetGrid');
        if(!data){ budgetGrid.innerHTML = ''; personalBudgetGrid.innerHTML = ''; return; }
        budgetGrid.innerHTML = (data.organizations || []).map(org => {
            const budget = Number(org.monthly_budget_cny || 0);
            const spent = Number(org.spent_cny || 0);
            const pct = budget > 0 ? Math.min(100, spent / budget * 100) : 0;
            const over = budget > 0 && spent >= budget;
            return `<article class="budget-row"><div class="budget-head"><span class="budget-name">${esc(org.name)}</span><span class="budget-state">${org.budget_enabled ? '预算已启用' : '未启用预算'}</span></div><div class="budget-money">${money(spent)}</div><div class="budget-meta">预算 ${budget ? money(budget) : '未设置'} · ${Number(org.consume_coins || 0).toFixed(2)} RH币 · ${org.task_count} 个任务</div><div class="budget-progress ${over ? 'over' : ''}"><i style="width:${pct}%"></i></div><div class="budget-edit"><input type="number" min="0" step="0.0001" value="${budget || ''}" placeholder="月度预算（USD）" data-budget-input="${esc(org.id)}"><label class="budget-toggle"><input type="checkbox" data-budget-enabled="${esc(org.id)}" ${org.budget_enabled ? 'checked' : ''}>启用</label><button class="budget-save" type="button" data-budget-save="${esc(org.id)}" title="保存预算"><i data-lucide="check"></i></button></div></article>`;
        }).join('') || '<div class="usage-empty">暂无组织</div>';
        personalBudgetGrid.innerHTML = (data.user_budgets || []).map(user => {
            const budget = Number(user.monthly_budget_usd || 0);
            const spent = Number(user.spent_usd || 0);
            const pct = budget > 0 ? Math.min(100, spent / budget * 100) : 0;
            const over = budget > 0 && spent >= budget;
            return `<article class="budget-row"><div class="budget-head"><span class="budget-name">${esc(user.username || user.user_id)}</span><span class="budget-state">${user.budget_enabled ? '预算已启用' : '未启用预算'}</span></div><div class="budget-money">${money(spent)}</div><div class="budget-meta">${esc(user.organization_name || '未分配')} · 预算 ${budget ? money(budget) : '未设置'}</div><div class="budget-progress ${over ? 'over' : ''}"><i style="width:${pct}%"></i></div><div class="budget-edit"><input type="number" min="0" step="0.0001" value="${budget || ''}" placeholder="月度预算（USD）" data-user-budget-input="${esc(user.user_id)}"><label class="budget-toggle"><input type="checkbox" data-user-budget-enabled="${esc(user.user_id)}" ${user.budget_enabled ? 'checked' : ''}>启用</label><button class="budget-save" type="button" data-user-budget-save="${esc(user.user_id)}" title="保存预算"><i data-lucide="check"></i></button></div></article>`;
        }).join('') || '<div class="usage-empty">暂无用户</div>';
        renderIcons();
    }
    async function loadUsage(){
        const month = document.getElementById('usageMonth').value;
        const status = document.getElementById('usageStatus');
        status.textContent = '加载中...';
        try { const result = await requestLoadUsage(month); if(result.defaultBudget){ document.getElementById('newUserBudgetInput').value = Number(result.defaultBudget.monthly_budget_usd || 0) || ''; document.getElementById('newUserBudgetEnabled').checked = result.defaultBudget.enabled !== false; } state.usage = result.usage; status.textContent = result.omnilojoError ? `Omnilojo 统计不可用：${result.omnilojoError}` : '所有费用按 USD 结算'; const budgetStatus = document.getElementById('budgetStatus'); if(budgetStatus) budgetStatus.textContent = result.omnilojoError ? '部分统计不可用' : '所有预算按 USD 设置'; renderUsage(); renderBudgets(); }
        catch(e){ status.textContent = e.message || '加载失败'; }
    }
    async function saveBudget(orgId){
        const input = document.querySelector(`[data-budget-input="${CSS.escape(orgId)}"]`);
        const enabled = document.querySelector(`[data-budget-enabled="${CSS.escape(orgId)}"]`);
        const status = document.getElementById('budgetStatus');
        const amount = Number(input?.value || 0);
        if(!Number.isFinite(amount) || amount < 0){ status.textContent = '预算金额必须为非负数'; return; }
        try { await requestSaveOrganizationBudget(orgId, amount, enabled?.checked); await loadUsage(); }
        catch(e){ status.textContent = e.message || '保存失败'; }
    }
    async function saveUserBudget(userId){
        const input = document.querySelector(`[data-user-budget-input="${CSS.escape(userId)}"]`);
        const enabled = document.querySelector(`[data-user-budget-enabled="${CSS.escape(userId)}"]`);
        const status = document.getElementById('budgetStatus');
        const amount = Number(input?.value || 0);
        if(!Number.isFinite(amount) || amount < 0){ status.textContent = '预算金额必须为非负数'; return; }
        try { await requestSaveUserBudget(userId, amount, enabled?.checked); await loadUsage(); }
        catch(e){ status.textContent = e.message || '保存失败'; }
    }
    async function saveNewUserBudget(){
        const amount = Number(document.getElementById('newUserBudgetInput').value || 0);
        const enabled = document.getElementById('newUserBudgetEnabled').checked;
        const status = document.getElementById('budgetStatus');
        if(!Number.isFinite(amount) || amount < 0){ status.textContent = '预算金额必须为非负数'; return; }
        try { await requestSaveNewUserDefaultBudget(amount, enabled); status.textContent = '新用户默认预算已保存'; }
        catch(e){ status.textContent = e.message || '保存失败'; }
    }
    function renderSessions(){
        const rows = (state.sessions || []).filter(item => !document.getElementById('onlineOnly').checked || item.online);
        const table = document.getElementById('sessionTable');
        table.innerHTML = `<div class="session-row header"><div>用户</div><div>状态</div><div>最后活动</div><div>登录时间</div><div>有效期至</div></div>${rows.map(item => `<div class="session-row"><div><div class="session-user">${esc(item.username)}${item.is_current ? '<span class="session-current">当前会话</span>' : ''}</div><div class="session-id">${esc(item.user_id)} · ${esc(item.session_id)}</div></div><div><span class="session-status ${item.online ? 'online' : ''}">${item.online ? '在线' : '离线'}</span></div><div>${dateTime(item.last_seen)}</div><div>${dateTime(item.created_at)}</div><div class="session-muted">${dateTime(item.expires_at)}</div></div>`).join('') || '<div class="empty">暂无登录会话</div>'}`;
        renderIcons();
    }
    async function loadSessions(){
        const status = document.getElementById('sessionStatus');
        status.textContent = '加载中...';
        try { const d = await requestListUserSessions(); state.sessions = d.sessions || []; status.textContent = `${d.online_count || 0} 位在线用户 · 最近 ${d.online_window_minutes || 5} 分钟有活动`; renderSessions(); }
        catch(e){ status.textContent = e.message || '加载失败'; document.getElementById('sessionTable').innerHTML = '<div class="empty">会话数据暂时不可用</div>'; }
    }
    function activate(name){
        document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === name));
        document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.dataset.view === name));
        const frame = document.querySelector(`[data-view="${name}"] iframe[data-src]`);
        if(frame && !frame.src) frame.src = frame.dataset.src;
        if(name === 'usage' || name === 'budgets') loadUsage();
        if(name === 'sessions') loadSessions();
        history.replaceState(null, '', `#${name}`);
    }
    document.querySelectorAll('.tab').forEach(el => el.addEventListener('click', () => activate(el.dataset.tab)));
    document.getElementById('userTable').addEventListener('change', event => {
        const target = event.target;
        if (target.matches('[data-user-type]')) assignUserType(target.dataset.userType, target.value);
        else if (target.matches('.org-select[data-user]')) assignUserOrg(target.dataset.user, target.value || null);
    });
    document.getElementById('userTable').addEventListener('click', event => {
        const button = event.target.closest('[data-user-delete]');
        if (button) deleteUser(button.dataset.userDelete);
    });
    document.getElementById('orgList').addEventListener('click', event => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const orgId = button.closest('.org-chip')?.dataset.org;
        if (button.dataset.action === 'rename') renameOrg(orgId);
        if (button.dataset.action === 'delete') deleteOrg(orgId);
    });
    document.getElementById('budgetGrid').addEventListener('click', event => {
        const button = event.target.closest('[data-budget-save]');
        if (button) saveBudget(button.dataset.budgetSave);
    });
    document.getElementById('personalBudgetGrid').addEventListener('click', event => {
        const button = event.target.closest('[data-user-budget-save]');
        if (button) saveUserBudget(button.dataset.userBudgetSave);
    });
    document.getElementById('search').addEventListener('input', e => { state.query = e.target.value || ''; renderUsers(); });
    document.getElementById('orgForm').addEventListener('submit', e => {
        e.preventDefault();
        const input = document.getElementById('orgNameInput');
        const name = (input.value || '').trim();
        if(!name) return;
        input.value = '';
        createOrg(name);
    });
    document.getElementById('usageMonth').value = new Date().toISOString().slice(0, 7);
    document.getElementById('usageMonth').addEventListener('change', loadUsage);
    document.getElementById('syncOmnilojo').addEventListener('click', loadUsage);
    document.getElementById('newUserBudgetSave').addEventListener('click', saveNewUserBudget);
    document.getElementById('refreshSessions').addEventListener('click', loadSessions);
    document.getElementById('onlineOnly').addEventListener('change', renderSessions);
    const initial = ['users','access','quota','sessions','usage','budgets'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'users';
    activate(initial); loadOrgs(); loadUsers(); renderIcons();
})();
