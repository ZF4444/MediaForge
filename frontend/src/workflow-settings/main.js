import {
    deleteWorkflowSource,
    listWorkflowSources,
    setWorkflowSourceEnabled,
} from '../services/workflow-settings.js';
import { createIcons, Inbox, Plus, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide';
import '../styles/theme.css';
import '../styles/workflow-settings.css';
import { applyStoredTheme } from '../shared/theme-bootstrap.js';
import { confirmDialog, showToast } from '../components/wf-feedback.js';

applyStoredTheme();

const workflowIcons = { Inbox, Plus, RefreshCw, Search, Trash2, TriangleAlert };

const workflowList = document.getElementById('workflowList');
const workflowCount = document.getElementById('workflowCount');
const noticeEl = document.getElementById('workflowNotice');
const searchInput = document.getElementById('workflowSearch');
const refreshBtn = document.getElementById('refreshWorkflowsBtn');

const state = { items: [], query: '', source: 'all', status: 'all', phase: 'loading', failed: [] };

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const savedMeta = () => { try { return JSON.parse(localStorage.getItem('workflow_settings_meta') || '{}'); } catch { return {}; } };
const mediaFor = (source, id, persisted) => persisted === 'video' || persisted === 'image'
    ? persisted : (savedMeta()[`${source}:${id}`]?.media || 'image');
const coverFor = (source, id, persisted) => {
    const cover = persisted && typeof persisted === 'object' ? persisted : savedMeta()[`${source}:${id}`]?.cover;
    if(!cover || typeof cover !== 'object') return {};
    if(cover.url) return cover;
    return cover.file_id ? {...cover, url:`/api/files/${encodeURIComponent(cover.file_id)}/preview`} : {};
};
const isRunningHub = item => item.source === 'runninghub';
const sourceLabel = item => isRunningHub(item) ? 'RH 应用' : 'ComfyUI';
const itemKey = item => `${item.source}:${item.id}`;

/* ---------- data ---------- */

function buildItems({ workflows, resources }) {
    const comfyItems = workflows.map(item => ({source:'comfyui', id:item.name, title:item.title || item.name, description:'本地 ComfyUI 工作流', media:mediaFor('comfyui', item.name, item.media), cover:coverFor('comfyui', item.name, item.cover), enabled:item.enabled !== false}));
    const rhItems = resources.filter(item => item.kind === 'runninghub_app' && item.settings?.app_id).map(item => ({source:'runninghub', id:item.settings.app_id, resourceId:item.id, title:item.settings?.title || item.name || `RH 应用 ${String(item.settings.app_id).slice(-6)}`, description:item.settings?.note || 'RunningHub AI 应用', media:mediaFor('runninghub', item.settings.app_id, item.settings?.media), cover:coverFor('runninghub', item.settings.app_id, item.settings?.cover), enabled:item.enabled !== false}));
    const aiComfyItems = resources.filter(item => item.kind === 'comfyui_workflow').map(item => ({source:'comfyui_resource', id:item.id, resourceId:item.id, title:item.settings?.title || item.name, description:item.settings?.note || 'ComfyUI 工作流', media:mediaFor('comfyui_resource', item.id, item.settings?.media), cover:coverFor('comfyui_resource', item.id, item.settings?.cover), enabled:item.enabled !== false}));
    return [...comfyItems, ...aiComfyItems, ...rhItems].filter(item => item.id);
}

// Resource-backed writes are read-modify-write on the shared AI configuration,
// so two overlapping toggles would overwrite each other. Run every write in order.
let writeQueue = Promise.resolve();
function enqueueWrite(task) {
    const run = writeQueue.then(task);
    writeQueue = run.catch(() => {});
    return run;
}

function notifyWorkflowsChanged() {
    try {
        const channel = new BroadcastChannel('studio-api');
        channel.postMessage({ type: 'workflows-changed' });
        channel.close();
    } catch { /* BroadcastChannel is optional */ }
}

async function loadWorkflows({ silent = false } = {}) {
    if (!silent || !state.items.length) state.phase = 'loading';
    refreshBtn.classList.add('is-spinning');
    refreshBtn.disabled = true;
    render();
    try {
        const sources = await listWorkflowSources();
        state.failed = sources.failed || [];
        state.items = buildItems(sources);
        state.phase = state.failed.length >= 2 ? 'error' : 'ready';
    } catch {
        state.failed = ['comfyui', 'resources'];
        state.phase = 'error';
    } finally {
        refreshBtn.classList.remove('is-spinning');
        refreshBtn.disabled = false;
    }
    render();
}

/* ---------- rendering ---------- */

function visibleItems() {
    const q = state.query.trim().toLowerCase();
    return state.items.filter(item => {
        if (state.source === 'comfyui' && isRunningHub(item)) return false;
        if (state.source === 'runninghub' && !isRunningHub(item)) return false;
        if (state.status === 'on' && !item.enabled) return false;
        if (state.status === 'off' && item.enabled) return false;
        return !q || `${item.title} ${item.description} ${item.id}`.toLowerCase().includes(q);
    });
}

function cardHtml(item) {
    const monogram = isRunningHub(item) ? 'RH' : 'C';
    const meta = `${sourceLabel(item)} · ${item.media === 'video' ? '视频' : '图片'}`;
    return `<article class="workflow-row wf-card${item.enabled ? '' : ' is-disabled'}" data-key="${esc(itemKey(item))}" data-source="${esc(item.source)}" data-id="${esc(item.id)}" data-resource-id="${esc(item.resourceId || '')}">
        <button class="workflow-row-main" type="button" aria-label="配置 ${esc(item.title)}">
            <span class="wf-cover"><span class="wf-cover-mark">${monogram}</span></span>
            <span class="workflow-row-copy">
                <strong>${esc(item.title)}</strong>
                <small>${esc(item.description)}</small>
                <span class="wf-card-meta">${esc(meta)}</span>
            </span>
        </button>
        <div class="workflow-row-control">
            <span class="workflow-status"><i class="wf-dot"></i><span class="wf-status-text"></span></span>
            <button class="workflow-switch" type="button" role="switch" aria-checked="${item.enabled ? 'true' : 'false'}"><span></span></button>
            <button class="workflow-delete" type="button" title="删除工作流" aria-label="删除 ${esc(item.title)}"><i data-lucide="trash-2"></i></button>
        </div>
    </article>`;
}

function syncRow(item) {
    const row = item.el;
    if (!row?.isConnected) return;
    const toggle = row.querySelector('.workflow-switch');
    row.classList.toggle('is-disabled', !item.enabled);
    row.classList.toggle('is-pending', Boolean(item.pending));
    toggle.setAttribute('aria-checked', item.enabled ? 'true' : 'false');
    toggle.setAttribute('aria-label', `${item.enabled ? '停用' : '启用'} ${item.title}`);
    row.querySelector('.wf-status-text').textContent = item.enabled ? '已启用' : '已停用';
}

function stateBlock(icon, title, message, actions = '') {
    return `<div class="wf-state"><i data-lucide="${icon}"></i><strong>${esc(title)}</strong><p>${esc(message)}</p>${actions}</div>`;
}

function renderNotice() {
    const partial = state.phase === 'ready' && state.failed.length;
    noticeEl.hidden = !partial;
    if (!partial) return;
    const names = state.failed.map(name => name === 'comfyui' ? '本地 ComfyUI 工作流' : 'RH 应用与云端工作流');
    noticeEl.innerHTML = `<i data-lucide="triangle-alert"></i><span>${esc(names.join('、'))}读取失败，列表可能不完整。</span><button class="wf-link" type="button" data-action="retry">重试</button>`;
}

function updateSummary(shown) {
    const total = state.items.length;
    const on = state.items.filter(item => item.enabled).length;
    document.querySelector('[data-count="all"]').textContent = total ? String(total) : '';
    document.querySelector('[data-count="on"]').textContent = total ? String(on) : '';
    document.querySelector('[data-count="off"]').textContent = total ? String(total - on) : '';
    workflowCount.textContent = shown === total ? `${total} 个工作流` : `显示 ${shown} / ${total} 个`;
}

function render() {
    document.querySelectorAll('[data-filter-group]').forEach(group => {
        group.querySelectorAll('.wf-chip').forEach(chip => chip.setAttribute('aria-pressed', String(chip.dataset.value === state[group.dataset.filterGroup])));
    });
    workflowList.setAttribute('aria-busy', String(state.phase === 'loading'));
    renderNotice();

    if (state.phase === 'loading') {
        workflowList.className = 'workflow-grid';
        workflowList.innerHTML = Array.from({ length: 6 }, () => '<div class="wf-card wf-skeleton" aria-hidden="true"><div class="wf-cover"></div><div class="wf-skeleton-line"></div><div class="wf-skeleton-line short"></div></div>').join('');
        workflowCount.textContent = '正在读取…';
    } else if (state.phase === 'error') {
        workflowList.className = 'workflow-grid is-empty';
        workflowList.innerHTML = stateBlock('triangle-alert', '工作流读取失败', '请检查网络或登录状态后重试。', '<button class="wf-btn wf-btn-primary" type="button" data-action="retry">重新读取</button>');
        workflowCount.textContent = '';
    } else {
        const items = visibleItems();
        updateSummary(items.length);
        if (!state.items.length) {
            workflowList.className = 'workflow-grid is-empty';
            workflowList.innerHTML = stateBlock('inbox', '还没有工作流', '上传 ComfyUI 工作流，或添加 RunningHub 应用后即可在画布中使用。', '<button class="wf-btn wf-btn-primary" type="button" data-action="create">新建工作流</button>');
        } else if (!items.length) {
            workflowList.className = 'workflow-grid is-empty';
            workflowList.innerHTML = stateBlock('search', '没有匹配的工作流', '换个关键词，或清除筛选条件。', '<button class="wf-btn wf-btn-secondary" type="button" data-action="clear-filters">清除筛选</button>');
        } else {
            workflowList.className = 'workflow-grid';
            workflowList.innerHTML = items.map(cardHtml).join('');
            workflowList.querySelectorAll('.workflow-row').forEach(row => {
                const item = state.items.find(value => itemKey(value) === row.dataset.key);
                if (!item) return;
                item.el = row;
                if (item.cover?.url) {
                    const cover = row.querySelector('.wf-cover');
                    cover.style.backgroundImage = `url("${String(item.cover.url).replace(/"/g, '%22')}")`;
                    cover.classList.add('has-image');
                }
                syncRow(item);
            });
        }
    }
    createIcons({ icons: workflowIcons });
}

/* ---------- actions ---------- */

function openConfig(source = 'comfyui', id = '', title = '', resourceId = '') {
    const query = new URLSearchParams({ source });
    if (id) query.set('id', id);
    if (resourceId) query.set('resourceId', resourceId);
    if (title) query.set('title', title);
    window.location.href = `/static/workflow-config.html?${query}`;
}

async function toggleItem(item) {
    if (item.pending) return;
    const next = !item.enabled;
    item.pending = true;
    item.enabled = next; // optimistic: the switch moves immediately
    syncRow(item);
    try {
        await enqueueWrite(() => setWorkflowSourceEnabled(item, next));
        notifyWorkflowsChanged();
        showToast(`已${next ? '启用' : '停用'}「${item.title}」`, { kind: 'success' });
    } catch (error) {
        item.enabled = !next;
        showToast(error.message || '保存启用状态失败，已恢复原状态', { kind: 'error' });
    } finally {
        item.pending = false;
        syncRow(item);
        updateSummary(visibleItems().length);
    }
}

async function deleteItem(item) {
    const choice = await confirmDialog({
        title: `删除「${item.title}」？`,
        message: item.source === 'comfyui' ? '该工作流文件及其字段配置将被永久删除，无法恢复。' : '该应用将从资源配置中移除，无法恢复。',
        confirmText: '删除',
        tone: 'danger',
    });
    if (choice !== 'confirm') return;
    item.el?.classList.add('is-pending');
    try {
        await enqueueWrite(() => deleteWorkflowSource(item));
        const meta = savedMeta();
        delete meta[itemKey(item)];
        try { localStorage.setItem('workflow_settings_meta', JSON.stringify(meta)); } catch { /* storage may be unavailable */ }
        state.items = state.items.filter(value => value !== item);
        item.el?.classList.add('is-removing');
        setTimeout(render, 200);
        notifyWorkflowsChanged();
        showToast(`已删除「${item.title}」`, { kind: 'success' });
    } catch (error) {
        item.el?.classList.remove('is-pending');
        showToast(error.message || '删除工作流失败', { kind: 'error' });
    }
}

function clearFilters() {
    Object.assign(state, { query: '', source: 'all', status: 'all' });
    searchInput.value = '';
    render();
}

/* ---------- events ---------- */

workflowList.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'retry') return loadWorkflows();
    if (action === 'create') return openConfig();
    if (action === 'clear-filters') return clearFilters();
    const row = event.target.closest('.workflow-row');
    const item = row && state.items.find(value => itemKey(value) === row.dataset.key);
    if (!item) return;
    if (event.target.closest('.workflow-switch')) return toggleItem(item);
    if (event.target.closest('.workflow-delete')) return deleteItem(item);
    if (event.target.closest('.workflow-row-main')) openConfig(item.source, item.id, item.title, item.resourceId);
});
noticeEl.addEventListener('click', event => { if (event.target.closest('[data-action="retry"]')) loadWorkflows({ silent: true }); });
document.querySelectorAll('[data-filter-group]').forEach(group => group.addEventListener('click', event => {
    const chip = event.target.closest('.wf-chip');
    if (!chip) return;
    state[group.dataset.filterGroup] = chip.dataset.value;
    render();
}));
searchInput.addEventListener('input', () => { state.query = searchInput.value; render(); });
searchInput.addEventListener('keydown', event => {
    if (event.key === 'Escape' && searchInput.value) { event.preventDefault(); searchInput.value = ''; state.query = ''; render(); }
});
document.addEventListener('keydown', event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) { event.preventDefault(); searchInput.focus(); }
});
document.getElementById('newWorkflowBtn').addEventListener('click', () => openConfig());
refreshBtn.addEventListener('click', () => loadWorkflows({ silent: true }));
// Returning from the config page via the back/forward cache would otherwise show stale switches.
window.addEventListener('pageshow', event => { if (event.persisted) loadWorkflows({ silent: true }); });

createIcons({ icons: workflowIcons });
loadWorkflows();
