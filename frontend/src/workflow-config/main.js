import { updateWorkflowResource } from '../services/ai-configuration.js';
import {
    createWorkflow,
    getAiConfiguration,
    getWorkflow,
    saveWorkflowConfig,
    uploadWorkflowCover,
    workflowCoverPreviewUrl,
} from '../services/workflow-config.js';
import { mountWorkflowCoverPicker } from '../components/workflow-cover-picker.js';
import { confirmDialog, showToast } from '../components/wf-feedback.js';
import { applyStoredTheme } from '../shared/theme-bootstrap.js';

applyStoredTheme();

const LIST_URL = '/static/workflow-settings.html';
const query = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const sourceSelect = $('workflowSource');
const frame = $('workflowConfigFrame');
const frameLoading = $('frameLoading');
const frameEmpty = $('frameEmpty');
const title = $('configTitle');
const hint = $('configHint');
const comfyUpload = $('comfyUploadMeta');
const rhIdMeta = $('rhUrlMeta');
const fileInput = $('workflowUploadInput');
const rhAppId = $('rhAppUrlInput');
const coverInput = $('workflowCoverInput');
const coverPicker = $('workflowCoverPicker');
const removeCoverBtn = $('removeWorkflowCoverBtn');
const saveBtn = $('saveMetaBtn');
const dirtyBadge = $('dirtyBadge');
const enabledMeta = $('enabledMeta');
const enabledLabel = $('enabledLabel');
const enabledSwitch = $('workflowEnabledSwitch');

let current = {
    source: ['runninghub', 'comfyui_resource'].includes(query.get('source')) ? query.get('source') : 'comfyui',
    id: query.get('id') || '',
    resourceId: query.get('resourceId') || '',
    title: query.get('title') || '',
    media: 'image',
    cover: {},
    enabled: true,
};

// Dirty tracking. The outer metadata (media / cover / enabled) is compared with
// a snapshot taken when the data was loaded or last saved. The embedded editor
// keeps its state in its own page, so edits made there are detected from user
// events inside the iframe instead.
const snapshot = () => JSON.stringify({ media: current.media, cover: current.cover || {}, enabled: current.enabled });
let baseline = snapshot();
let frameDirty = false;
let frameResizeObserver = null;
let saving = false;
const isDirty = () => frameDirty || snapshot() !== baseline;

const metas = () => {
    try { return JSON.parse(localStorage.getItem('workflow_settings_meta') || '{}'); }
    catch { return {}; }
};
function validCover(value){
    return value && typeof value === 'object' && (value.url || value.file_id) ? value : {};
}
function coverUrl(cover=current.cover){
    if(cover?.url) return cover.url;
    return workflowCoverPreviewUrl(cover?.file_id);
}

/* ---------- chrome ---------- */

function setHint(text, kind=''){
    hint.textContent = text;
    hint.classList.toggle('is-error', kind === 'error');
    hint.classList.toggle('is-success', kind === 'success');
}
function renderChrome(){
    title.textContent = current.title || current.id || (current.source === 'runninghub' ? '新建 RH 应用' : '新建工作流');
    document.title = `${title.textContent} · 工作流配置`;
    dirtyBadge.hidden = !isDirty();
    saveBtn.disabled = saving;
    saveBtn.textContent = saving ? '保存中…' : '保存';
    enabledMeta.hidden = !current.id;
    enabledSwitch.setAttribute('aria-checked', String(current.enabled));
    enabledLabel.textContent = current.enabled ? '已启用' : '已停用';
    // A saved workflow belongs to one backend; switching source only makes sense for a new one.
    sourceSelect.disabled = Boolean(current.id);
    sourceSelect.title = current.id ? '已有工作流的来源不可更改' : '';
    document.querySelectorAll('[data-media]').forEach(button => {
        const active = button.dataset.media === current.media;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
}
function markFrameDirty(){
    if(frameDirty) return;
    frameDirty = true;
    renderChrome();
}

const coverPickerControl = mountWorkflowCoverPicker({
    root: coverPicker,
    input: coverInput,
    removeButton: removeCoverBtn,
    initialCover: current.cover,
    resolveUrl: coverUrl,
    upload: async file => {
        const payload = await uploadWorkflowCover(file);
        if(!payload.files?.[0]) throw Error('封面上传失败');
        const item = payload.files[0];
        return {url:item.url || '', file_id:item.file_id || '', kind:'image', name:item.name || file.name};
    },
    onChange: ({cover, error}) => {
        if(error){ setHint(error.message || '封面上传失败', 'error'); return; }
        current.cover = cover;
        setHint(cover?.url || cover?.file_id ? '封面已更新，保存后生效。' : '封面已移除，保存后生效。');
        if(current.id) syncFrame();
        renderChrome();
    },
});

/* ---------- persistence ---------- */

function persist(){
    const all = metas();
    all[`${current.source}:${current.id}`] = {media: current.media, cover: current.cover, enabled: current.enabled};
    try { localStorage.setItem('workflow_settings_meta', JSON.stringify(all)); } catch { /* storage may be unavailable */ }
}
function syncFrame(persistValue=false){
    frame.contentWindow?.postMessage({type:'workflow-media', media:current.media, persist:persistValue}, location.origin);
    frame.contentWindow?.postMessage({type:'workflow-cover', cover:current.cover || {}}, location.origin);
}
async function persistBackend(){
    if(!current.id) return;
    if(current.source === 'comfyui'){
        const data = await getWorkflow(current.id);
        await saveWorkflowConfig(current.id, {
            ...data.config,
            title:current.title || data.config?.title || '',
            media:current.media,
            cover:current.cover,
            enabled:current.enabled,
        });
        return;
    }
    await updateWorkflowResource(current.resourceId, {
        enabled:current.enabled,
        settings:{title:current.title, media:current.media, cover:validCover(current.cover)},
    });
}
async function saveEmbeddedConfig(){
    if(!current.id) return;
    if(current.source === 'runninghub') frame.contentWindow?.setRhWorkflowMedia?.(current.media);
    else syncFrame(false);
    const save = current.source === 'comfyui' ? frame.contentWindow?.onSave : frame.contentWindow?.saveRhWorkflowEditor;
    if(typeof save !== 'function') throw Error('配置页尚未加载完成，请稍后再试');
    const saved = await save();
    if(saved === false) throw Error('保存工作流配置失败');
}
/** Save everything; resolves true on success. Errors are reported inline. */
async function saveAll(){
    if(saving) return false;
    if(!current.id){ setHint('请先上传工作流文件或填写 RH 应用 ID，再保存。', 'error'); return false; }
    saving = true;
    setHint('正在保存…');
    renderChrome();
    try {
        persist();
        await saveEmbeddedConfig();
        await persistBackend();
        baseline = snapshot();
        frameDirty = false;
        try { const channel = new BroadcastChannel('studio-api'); channel.postMessage({type:'workflows-changed'}); channel.close(); } catch { /* optional */ }
        setHint('设置已保存', 'success');
        showToast('设置已保存', {kind:'success'});
        return true;
    } catch(error) {
        setHint(error.message || '保存失败，请重试', 'error');
        return false;
    } finally {
        saving = false;
        renderChrome();
    }
}

/* ---------- leaving ---------- */

/** Returns true when it is fine to navigate away / replace the current workflow. */
async function confirmDiscard({leave=false} = {}){
    if(!isDirty()) return true;
    const choice = await confirmDialog({
        title: '有未保存的修改',
        message: leave ? '保存后再返回列表，或放弃这些修改。' : '继续将放弃当前未保存的修改。',
        confirmText: leave ? '保存并返回' : '放弃修改并继续',
        extraText: leave ? '放弃修改' : '',
        cancelText: '继续编辑',
        tone: leave ? 'default' : 'danger',
    });
    if(choice === 'cancel') return false;
    if(choice === 'confirm' && leave) return saveAll();
    return true;
}
async function goBack(){
    if(!await confirmDiscard({leave:true})) return;
    allowUnload = true;
    location.href = LIST_URL;
}
let allowUnload = false;
window.addEventListener('beforeunload', event => {
    if(allowUnload || !isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
});

/* ---------- loading ---------- */

function setMedia(value, {user=false} = {}){
    current.media = value === 'video' ? 'video' : 'image';
    if(current.id) syncFrame();
    if(user) setHint('媒体类型已更改，保存后生效。');
    renderChrome();
}
function frameSource(){
    if(current.source === 'runninghub'){
        return current.id
            ? `?embedded=1&appId=${encodeURIComponent(current.id)}&resourceId=${encodeURIComponent(current.resourceId || '')}&title=${encodeURIComponent(current.title || '')}`
            : '?embedded=1';
    }
    return `?embedded=1&workflow=${encodeURIComponent(current.id)}`;
}
function load(){
    sourceSelect.value = current.source;
    comfyUpload.hidden = current.source !== 'comfyui';
    rhIdMeta.hidden = current.source !== 'runninghub';
    setHint(current.source === 'runninghub'
        ? (current.id ? '调整参数与封面，保存后即可在画布中使用。' : '输入 RH 应用 ID 后打开，再配置参数和封面。')
        : (current.id ? '配置节点字段与封面，保存后即可在画布中使用。' : '先上传 ComfyUI 工作流 JSON，再配置节点字段。'));
    rhAppId.value = current.source === 'runninghub' ? current.id : '';
    coverPickerControl.setCover(current.cover);
    renderChrome();
    // Nothing to configure yet (new workflow, no file / app id): do not load the
    // embedded editor, otherwise it auto-selects some other existing workflow.
    const hasTarget = Boolean(current.id);
    frameEmpty.hidden = hasTarget;
    $('frameEmptyText').textContent = current.source === 'runninghub'
        ? '在上方输入 RH 应用 ID 并点击"打开应用"，参数配置会显示在这里。'
        : '在上方上传 ComfyUI 工作流 JSON，节点与参数配置会显示在这里。';
    if(!hasTarget){
        frameResizeObserver?.disconnect();
        frameLoading.hidden = true;
        frame.hidden = true;
        frame.src = 'about:blank';
        return;
    }
    frame.hidden = false;
    // Keep the iframe laid out while loading (display:none would give the
    // embedded graph a 0x0 viewport and break its fit-to-window); just fade it.
    frameLoading.hidden = false;
    frame.classList.add('is-loading');
    frame.src = `/static/${current.source === 'runninghub' ? 'rh-workflow-settings.html' : 'comfyui-settings.html'}${frameSource()}`;
}

// Events inside the embedded editor that change saved configuration. Inputs in
// the test-run / preview areas are excluded so trying a workflow is not "dirty".
const PREVIEW_AREA = '#previewCard, #miniCanvasHost, .pfield, [class*="rh-preview"], .mini-canvas';
const MUTATING_ACTIONS = new Set(['toggleField', 'addDropdownOption', 'removeDropdownOption', 'toggleRhWorkflowEditorField', 'removeRhEntry']);
function watchFrame(doc){
    const onEdit = event => { if(!event.target.closest?.(PREVIEW_AREA)) markFrameDirty(); };
    doc.addEventListener('input', onEdit, true);
    doc.addEventListener('change', onEdit, true);
    doc.addEventListener('click', event => {
        const action = event.target.closest?.('[data-action]')?.dataset.action;
        if(MUTATING_ACTIONS.has(action)) markFrameDirty();
    }, true);
    doc.addEventListener('keydown', onShortcut);
}
// Size the iframe to its content so the editor is part of this page and only
// the outer page scrolls (no nested scroll area / "window" look).
function autosizeFrame(doc){
    frameResizeObserver?.disconnect();
    const body = doc.body;
    if(!body || typeof ResizeObserver !== 'function') return;
    const apply = () => {
        const height = Math.ceil(body.getBoundingClientRect().height);
        if(height > 0 && Math.abs(height - frame.offsetHeight) > 1) frame.style.height = `${height}px`;
    };
    frameResizeObserver = new ResizeObserver(apply);
    frameResizeObserver.observe(body);
    apply();
}
frame.addEventListener('load', () => {
    if(!frame.src || frame.src === 'about:blank') return;
    frameLoading.hidden = true;
    frame.classList.remove('is-loading');
    try {
        if(frame.contentDocument){ watchFrame(frame.contentDocument); autosizeFrame(frame.contentDocument); }
    } catch { /* cross-origin: fall back to metadata-only tracking, fixed height */ }
    syncFrame();
});

/* ---------- events ---------- */

function onShortcut(event){
    if((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's'){
        event.preventDefault();
        saveAll();
    }
}
document.addEventListener('keydown', onShortcut);
saveBtn.addEventListener('click', () => { saveAll(); });
$('backToListBtn').addEventListener('click', goBack);
document.querySelectorAll('[data-media]').forEach(button => button.addEventListener('click', () => {
    if(button.dataset.media !== current.media) setMedia(button.dataset.media, {user:true});
}));
enabledSwitch.addEventListener('click', () => {
    current.enabled = !current.enabled;
    setHint(`${current.enabled ? '已启用' : '已停用'}，保存后生效。`);
    renderChrome();
});
sourceSelect.addEventListener('change', () => {
    current = {source:sourceSelect.value, id:'', resourceId:'', title:'', media:'image', cover:{}, enabled:true};
    baseline = snapshot();
    frameDirty = false;
    load();
});
$('openRhUrlBtn').addEventListener('click', async () => {
    const appId = rhAppId.value.trim();
    if(!/^[\w-]{6,}$/.test(appId)){ setHint('请输入有效的 RH 应用 ID（至少 6 位字母、数字或连字符）。', 'error'); rhAppId.focus(); return; }
    if(appId === current.id) return;
    if(!await confirmDiscard()) return;
    current = {source:'runninghub', id:appId, resourceId:`legacy:runninghub:runninghub_app:${encodeURIComponent(appId)}`, title:'', media:current.media, cover:current.cover, enabled:true};
    baseline = JSON.stringify({media:'image', cover:{}, enabled:true});
    frameDirty = false;
    load();
});
rhAppId.addEventListener('keydown', event => { if(event.key === 'Enter'){ event.preventDefault(); $('openRhUrlBtn').click(); } });
fileInput.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if(!file) return;
    try {
        const workflow = JSON.parse(await file.text());
        const name = file.name.replace(/\.json$/i, '') || 'workflow';
        const data = await createWorkflow(name, workflow);
        current = {source:'comfyui', id:data.name || `${name}.json`, resourceId:'', title:'', media:current.media, cover:current.cover, enabled:true};
        baseline = JSON.stringify({media:'image', cover:{}, enabled:true});
        frameDirty = false;
        load();
        setHint('工作流已上传，请继续配置节点字段和封面，完成后保存。', 'success');
    } catch(error) {
        setHint(error instanceof SyntaxError ? '文件不是有效的 JSON，请导出 ComfyUI 的 API 格式工作流。' : (error.message || '上传失败'), 'error');
    }
});

// The editor reports title edits so a later metadata save cannot overwrite them.
window.addEventListener('message', event => {
    if(event.origin === location.origin && event.data?.type === 'workflow-dirty'){ markFrameDirty(); return; }
    if(event.data?.type !== 'workflow-title') return;
    current.title = String(event.data.title || '');
    renderChrome();
});

(async () => {
    try {
        if(!current.id) return;
        if(current.source === 'comfyui'){
            const data = await getWorkflow(current.id);
            current.title = data.config?.title || current.title;
            current.media = data.config?.media === 'video' ? 'video' : 'image';
            current.cover = validCover(data.config?.cover);
            current.enabled = data.config?.enabled !== false;
        } else {
            const data = await getAiConfiguration();
            const app = (data.resources || []).find(item => item.kind === 'runninghub_app' && item.id === current.resourceId);
            current.media = app?.settings?.media === 'video' ? 'video' : 'image';
            current.cover = validCover(app?.settings?.cover);
            if(!Object.keys(current.cover).length) current.cover = validCover(metas()[`${current.source}:${current.id}`]?.cover);
            current.enabled = app?.enabled !== false;
        }
    } catch {
        const stored = metas()[`${current.source}:${current.id}`] || {};
        current.media = stored.media === 'video' ? 'video' : 'image';
        current.cover = validCover(stored.cover);
        current.enabled = stored.enabled !== false;
        setHint('无法读取已保存的配置，当前显示的是本地缓存。', 'error');
    } finally {
        baseline = snapshot();
        const message = hint.classList.contains('is-error') ? hint.textContent : '';
        load();
        if(message) setHint(message, 'error');
    }
})();
