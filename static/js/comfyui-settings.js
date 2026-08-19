function tr(key){ return window.StudioI18n ? window.StudioI18n.t(key) : key; }
function tf(key, vars={}){
    return Object.entries(vars).reduce((text, [k,v]) => text.replaceAll(`{${k}}`, v), tr(key));
}
function refreshLanguageView(){
    document.title = tr('comfy.title');
    renderList();
    renderEditor();
    renderPreview();
    renderWorkspaceView();
    refreshIcons();
}
function applyLanguage(){
    if(window.StudioI18n) window.StudioI18n.apply();
    refreshLanguageView();
}
function refreshIcons(){ if(window.lucide) lucide.createIcons(); }

const TYPES = [
    { v:'text', zh:'文本', en:'Text' },
    { v:'textarea', zh:'多行文本', en:'Textarea' },
    { v:'number', zh:'数字', en:'Number' },
    { v:'slider', zh:'滑块', en:'Slider' },
    { v:'dropdown', zh:'下拉框', en:'Dropdown' },
    { v:'image', zh:'图片', en:'Image' },
    { v:'video', zh:'视频', en:'Video' },
    { v:'audio', zh:'音频', en:'Audio' },
    { v:'boolean', zh:'开关', en:'Switch' },
];
const comfySettingsQuery = new URLSearchParams(window.location.search);
const singleWorkflowName = comfySettingsQuery.get('workflow') || '';
const isSingleWorkflowMode = Boolean(singleWorkflowName);
if(isSingleWorkflowMode) document.body.classList.add('single-workflow-mode');
function currentLang(){ return window.StudioI18n?.lang?.() === 'en' ? 'en' : 'zh'; }
function typeLabel(type){
    const item = TYPES.find(t => t.v === type);
    return item ? item[currentLang()] : type;
}

// ComfyUI 节点类型 → 中文 + 图标 + 颜色分类
const NODE_INFO = {
    'KSampler':              { label:'采样器',        icon:'⚙', cat:'sampler' },
    'KSamplerAdvanced':      { label:'采样器（高级）',icon:'⚙', cat:'sampler' },
    'SamplerCustom':         { label:'自定义采样',    icon:'⚙', cat:'sampler' },
    'CheckpointLoaderSimple':{ label:'主模型加载',    icon:'📦', cat:'loader' },
    'UNETLoader':            { label:'UNet 加载',     icon:'📦', cat:'loader' },
    'VAELoader':             { label:'VAE 加载',      icon:'📦', cat:'loader' },
    'CLIPLoader':            { label:'CLIP 加载',     icon:'📦', cat:'loader' },
    'DualCLIPLoader':        { label:'双 CLIP 加载',  icon:'📦', cat:'loader' },
    'LoraLoader':            { label:'LoRA 加载',     icon:'⚡', cat:'lora' },
    'LoraLoaderModelOnly':   { label:'LoRA 加载（仅模型）', icon:'⚡', cat:'lora' },
    'CLIPTextEncode':        { label:'提示词编码',    icon:'✎', cat:'prompt' },
    'CLIPTextEncodeFlux':    { label:'Flux 提示词',   icon:'✎', cat:'prompt' },
    'ConditioningCombine':   { label:'条件合并',      icon:'⊕', cat:'prompt' },
    'ConditioningConcat':    { label:'条件拼接',      icon:'⊕', cat:'prompt' },
    'VAEDecode':             { label:'VAE 解码',      icon:'◐', cat:'vae' },
    'VAEEncode':             { label:'VAE 编码',      icon:'◑', cat:'vae' },
    'LoadImage':             { label:'图片加载',      icon:'🖼', cat:'image' },
    'SaveImage':             { label:'图片保存',      icon:'💾', cat:'output' },
    'PreviewImage':          { label:'图片预览',      icon:'👁', cat:'output' },
    'ImageScale':            { label:'图片缩放',      icon:'⇆', cat:'image' },
    'EmptyLatentImage':      { label:'空白潜空间',    icon:'▦', cat:'latent' },
    'LatentUpscaleBy':       { label:'潜空间放大',    icon:'↗', cat:'latent' },
    'ControlNetApply':       { label:'ControlNet',    icon:'⇨', cat:'controlnet' },
    'ControlNetLoader':      { label:'ControlNet 加载',icon:'📦', cat:'loader' },
    'PrimitiveNode':         { label:'常量',          icon:'•', cat:'misc' },
    'Note':                  { label:'备注',          icon:'≡', cat:'misc' },
};

// 常见输入字段 → 中文友好名
const INPUT_LABELS = {
    'text': '提示词文本',
    'prompt': '提示词',
    'positive': '正向条件',
    'negative': '负向条件',
    'seed': '随机种子',
    'noise_seed': '噪声种子',
    'steps': '采样步数',
    'cfg': 'CFG 引导系数',
    'sampler_name': '采样方法',
    'scheduler': '调度器',
    'denoise': '重绘强度',
    'width': '宽度',
    'height': '高度',
    'batch_size': '批量大小',
    'megapixels': '百万像素',
    'strength_model': '模型强度',
    'strength_clip': 'CLIP 强度',
    'lora_name': 'LoRA 模型',
    'ckpt_name': '主模型',
    'vae_name': 'VAE 模型',
    'clip_name': 'CLIP 模型',
    'clip_name1': 'CLIP 模型 1',
    'clip_name2': 'CLIP 模型 2',
    'unet_name': 'UNet 模型',
    'control_net_name': 'ControlNet 模型',
    'image': '图片',
    'images': '图片',
    'mask': '蒙版',
    'latent': '潜空间',
    'value': '数值',
    'string': '字符串',
    'strength': '强度',
    'guidance': '引导系数',
    'resolution': '分辨率',
    'filename_prefix': '文件名前缀',
    'upscale_method': '放大方式',
    'crop': '裁剪方式',
};

function nodeLabel(node){
    if(node._meta?.title) return node._meta.title;
    return NODE_INFO[node.class_type]?.label || node.class_type || '未命名';
}
function nodeSub(node){
    const info = NODE_INFO[node.class_type];
    if(info && node._meta?.title) return info.label + ' · ' + node.class_type;
    return node.class_type || '';
}
function nodeIcon(node){
    return NODE_INFO[node.class_type]?.icon || '◆';
}
function inputLabel(name){
    return INPUT_LABELS[name] || name;
}

let workflows = [];
let selectedName = '';
let currentWorkflow = null;     // 原始 JSON
let currentConfig = null;       // { title, fields:[...] }
let isBuiltin = false;
let previewValues = {};         // field_id -> 发给后端的值（图片：comfy 文件名）
let previewRandomActive = {};   // field_id -> 筛子运行时是否激活；未设置时默认激活
let previewImageUrls = {};      // field_id -> 浏览器可显示的本地 URL（仅图片字段）
let runResult = null;           // url 或 null
let workspaceMode = 'graph';
let miniView = { k: 1, x: 0, y: 0 };
let miniCards = {};
let miniTestNodes = [];
let miniDrag = null;

const statusEl = document.getElementById('status');
const listEl = document.getElementById('workflowList');
const workflowTitleInput = document.getElementById('workflowTitleInput');
const subEl = document.getElementById('editorSub');
const deleteBtn = document.getElementById('deleteBtn');
const saveBtn = document.getElementById('saveBtn');
const nodeListEl = document.getElementById('nodeList');
const previewCard = document.getElementById('previewContent');
const miniCanvasHost = document.getElementById('miniCanvasHost');

function setStatus(text){ statusEl.textContent = text || ''; }
function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return escapeHtml(s); }
function fieldKind(f){
    if(['image','video','audio'].includes(f.type)) return f.type;
    const key = `${f.input || ''} ${f.name || ''}`.toLowerCase();
    if(f.type === 'textarea' || /prompt|text|提示词|正向|负向/.test(key)) return 'prompt';
    return 'setting';
}
function isMediaField(f){ return ['image','video','audio'].includes(fieldKind(f)); }
function mediaFieldLabel(kind, count){
    const labels = currentLang() === 'en'
        ? {image:'Images', video:'Videos', audio:'Audio'}
        : {image:'图片', video:'视频', audio:'音频'};
    return `${labels[kind] || kind} ${count}`;
}
function mediaAccept(kind){
    if(kind === 'video') return 'video/*';
    if(kind === 'audio') return 'audio/*';
    return 'image/*';
}
function mediaUploadText(kind){
    if(kind === 'video') return tr('comfy.clickUploadVideo');
    if(kind === 'audio') return tr('comfy.clickUploadAudio');
    return tr('comfy.clickUploadImage');
}
function mediaUploadFailedText(kind){
    if(kind === 'video') return tr('comfy.videoUploadFailed');
    if(kind === 'audio') return tr('comfy.audioUploadFailed');
    return tr('comfy.imageUploadFailed');
}
function mediaPreviewHtml(kind, url, name='', compact=false){
    const safeUrl = escapeAttr(url || '');
    const safeName = escapeHtml(name || typeLabel(kind));
    if(!url) return mediaUploadText(kind);
    if(kind === 'video') return `<video src="${safeUrl}" muted preload="metadata" playsinline controls></video>`;
    if(kind === 'audio') return `<div class="media-file-chip"><i data-lucide="file-audio" class="${compact ? 'w-5 h-5' : 'w-6 h-6'}"></i><span class="media-file-name">${safeName}</span><audio src="${safeUrl}" controls preload="metadata"></audio></div>`;
    return `<img src="${safeUrl}">`;
}
// [comfyui-settings 迁移] defaultMiniCards/defaultMiniTestNodes 已拆分到
// frontend/src/comfyui-settings/mini-canvas.js。

// —— ComfyUI 后端地址管理 ——
// ComfyUI 服务地址在 API 设置页维护；工作流页只负责工作流本身。

async function loadList(){
    try {
        if(isSingleWorkflowMode){
            workflows = [{name:singleWorkflowName, title:singleWorkflowName.replace(/\.json$/i,'')}];
            await selectWorkflow(singleWorkflowName);
            return;
        }
        const data = await fetch('/api/workflows').then(r=>r.json());
        workflows = data.workflows || [];
        renderList();
        // 自动加载：当前没选中 或 之前选中的已不存在 → 选第一个
        const stillExists = selectedName && workflows.some(w => w.name === selectedName);
        if(!stillExists && workflows.length){
            await selectWorkflow(workflows[0].name);
        }
    } catch(e){ setStatus(tr('comfy.loadFailed')); console.error(e); }
}
// iframe 在 index.html 里通过 switchUI 显示，首次显示时可能 DOMContentLoaded 已经过去；
// 添加一个 pageshow 监听确保进入页面时一定刷新
window.addEventListener('pageshow', () => {
    if(!currentWorkflow && workflows.length === 0) loadList();
});

function renderList(){
    if(!listEl) return;
    if(isSingleWorkflowMode){ listEl.innerHTML = ''; return; }
    listEl.innerHTML = workflows.map(w => `
        <button class="workflow-card ${w.name===selectedName?'active':''}" type="button" onclick="selectWorkflow('${escapeHtml(w.name)}')">
            <span class="workflow-icon"><i data-lucide="${w.builtin?'package':'file-json-2'}" class="w-3.5 h-3.5"></i></span>
            <span class="min-w-0" style="flex:1">
                <div class="workflow-name">${escapeHtml(w.title)}</div>
                <div class="workflow-meta">${tf('comfy.fieldCount', {count:w.field_count})}</div>
            </span>
            ${w.builtin?`<span class="builtin-badge">${tr('comfy.builtin')}</span>`:''}
        </button>
    `).join('');
    refreshIcons();
}

async function selectWorkflow(name){
    selectedName = name;
    renderList();
    try {
        setStatus(tr('comfy.loading'));
        const data = await fetch(`/api/workflows/${encodeURIComponent(name)}`).then(r=>r.json());
        currentWorkflow = data.workflow;
        currentConfig = data.config || { title:name.replace('.json',''), fields:[] };
        if(!currentConfig.fields) currentConfig.fields = [];
        if(!currentConfig.mini_cards) currentConfig.mini_cards = {};
        isBuiltin = !!data.builtin;
        miniCards = {...defaultMiniCards(), ...currentConfig.mini_cards};
        currentConfig.mini_cards = miniCards;
        // 释放上一次的图片 blob URL
        Object.values(previewImageUrls).forEach(u => { try { URL.revokeObjectURL(u); } catch(e){} });
        previewImageUrls = {};
        previewValues = {};
        currentConfig.fields.forEach(f => {
            if(f.default !== undefined && f.default !== null) previewValues[f.id] = f.default;
        });
        previewRandomActive = {};
        runResult = null;
        graphView = { k: 1, x: 0, y: 0 };
        miniView = { k: 1, x: 0, y: 0 };
        miniTestNodes = defaultMiniTestNodes();
        renderEditor();
        renderPreview();
        // 新工作流加载后自动适配窗口
        setTimeout(() => graphFit(), 50);
        setStatus('');
    } catch(e){ setStatus(tr('comfy.openFailed')); console.error(e); }
}

// [comfyui-settings 迁移] fieldFor/makeFieldId/toggleField/refreshPopupBody/guessType/
// updateField 已拆分到 frontend/src/comfyui-settings/field-editor.js。

function updateWorkflowTitle(value){
    if(!currentConfig) return;
    currentConfig.title = value;
    const item = workflows.find(w => w.name === selectedName);
    if(item) item.title = value || selectedName.replace('.json','');
    if(!isSingleWorkflowMode) renderList();
}

function setWorkspaceMode(mode){
    workspaceMode = mode === 'canvas' ? 'canvas' : 'graph';
    document.getElementById('workspaceGraphTab')?.classList.toggle('active', workspaceMode === 'graph');
    document.getElementById('workspaceCanvasTab')?.classList.toggle('active', workspaceMode === 'canvas');
    renderWorkspaceView();
}

function renderEditor(){
    if(!currentWorkflow){
        if(deleteBtn) deleteBtn.style.display = 'none';
        saveBtn.style.display = 'none';
        nodeListEl.innerHTML = '';
        document.getElementById('graphCard').style.display = 'none';
        document.getElementById('nodesToggle').style.display = 'none';
        if(miniCanvasHost) miniCanvasHost.style.display = 'none';
        return;
    }
    document.getElementById('nodesToggle').style.display = workspaceMode === 'graph' ? 'flex' : 'none';
    workflowTitleInput.value = currentConfig.title || selectedName.replace('.json','');
    subEl.textContent = tf('comfy.nodeStats', {nodes:Object.keys(currentWorkflow).length, fields:currentConfig.fields.length}) + (isBuiltin ? ` · ${tr('comfy.builtin')}` : '');
    if(deleteBtn) deleteBtn.style.display = isBuiltin ? 'none' : 'inline-flex';
    saveBtn.style.display = 'inline-flex';

    renderGraph();
    renderWorkspaceView();

    const nodes = Object.entries(currentWorkflow).sort((a,b)=>{
        const aNum = parseInt(a[0],10), bNum = parseInt(b[0],10);
        if(!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a[0].localeCompare(b[0]);
    });

    nodeListEl.innerHTML = nodes.map(([nodeId, node])=>{
        const inputs = Object.entries(node.inputs || {}).filter(([k,v])=>{
            return !(Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number');
        });
        const exposedCount = inputs.filter(([k])=>fieldFor(nodeId,k)).length;
        const expanded = exposedCount > 0;
        const icon = nodeIcon(node);
        return `
            <div class="node-card ${expanded?'expanded':''}" id="node-card-${escapeAttr(nodeId)}" data-node-id="${escapeAttr(nodeId)}">
                <div class="node-card-head" onclick="this.parentElement.classList.toggle('expanded')">
                    <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1">
                        <span style="font-size:20px;line-height:1;flex:0 0 auto">${icon}</span>
                        <div style="min-width:0">
                            <div class="node-class">${escapeHtml(nodeLabel(node))}</div>
                            <div class="node-id">${escapeHtml(nodeSub(node))} · #${escapeHtml(nodeId)} · ${tf('comfy.configurableCount', {count:inputs.length})}</div>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex:0 0 auto">
                        <div class="node-stats">${exposedCount > 0 ? tf('comfy.exposedCount', {count:exposedCount}) : ''}</div>
                        <i data-lucide="chevron-down" class="w-4 h-4 node-chev"></i>
                    </div>
                </div>
                <div class="node-inputs">
                    ${inputs.map(([key, value])=>renderInputRow(nodeId, key, value)).join('') || `<div style="color:var(--faint);font-size:11px;text-align:center;padding:14px">${tr('comfy.noConfigInputs')}</div>`}
                </div>
            </div>
        `;
    }).join('');
    refreshIcons();
}

// 计算节点拓扑层级（按从入度 0 的源节点向下游传播）
// [comfyui-settings 迁移] computeLayers/renderGraph/updateZoomPill/applyGraphTransform/
// graphZoom/graphFit/attachPanZoom/openNodePopup/closeNodePopup/toggleNodeList 已拆分到
// frontend/src/comfyui-settings/node-graph-editor.js。

// Esc 关闭浮窗
document.addEventListener('keydown', e => {
    if(e.key === 'Escape' && popupNodeId) closeNodePopup();
    if(e.key === 'Escape') closeImagePreview();
});

// [comfyui-settings 迁移] renderInputRow/renderExtras/updateDropdownOption/
// addDropdownOption/removeDropdownOption 已拆分到
// frontend/src/comfyui-settings/field-editor.js。

// --- 右侧实时预览 ---
// [comfyui-settings 迁移] setPreviewValue/randomValueForField/fieldSupportsRandom/
// isPreviewRandomActive/randomButtonHtml/togglePreviewRandom/applyActiveRandomValues/
// openImagePreview/closeImagePreview/renderPreview/renderPreviewField 已拆分到
// frontend/src/comfyui-settings/preview-panel.js。

// [comfyui-settings 迁移] miniCardStyle/miniLine 已拆分到
// frontend/src/comfyui-settings/mini-canvas.js。

function renderWorkspaceView(){
    const graphWrap = document.querySelector('.graph-svg-wrap');
    const nodesToggle = document.getElementById('nodesToggle');
    document.getElementById('workspaceGraphTab')?.classList.toggle('active', workspaceMode === 'graph');
    document.getElementById('workspaceCanvasTab')?.classList.toggle('active', workspaceMode === 'canvas');
    if(!currentWorkflow){
        if(graphWrap) graphWrap.style.display = 'none';
        if(miniCanvasHost) miniCanvasHost.style.display = 'none';
        return;
    }
    if(workspaceMode === 'canvas'){
        if(graphWrap) graphWrap.style.display = 'none';
        if(nodesToggle) nodesToggle.style.display = 'none';
        renderMiniCanvasPreview(miniCanvasHost, true);
    } else {
        if(graphWrap) graphWrap.style.display = 'block';
        if(miniCanvasHost) miniCanvasHost.style.display = 'none';
        if(nodesToggle) nodesToggle.style.display = 'flex';
    }
}

// [comfyui-settings 迁移] renderMiniCanvasPreview/renderMiniField/miniDeleteButton/
// miniLineBetween/addMiniNode/removeMiniNode/updateMiniNode/pickMiniImage/bindMiniCanvas
// 已拆分到 frontend/src/comfyui-settings/mini-canvas.js。

async function pickImage(fieldId){
    const input = document.createElement('input');
    input.type = 'file';
    const field = currentConfig.fields.find(f => f.id === fieldId);
    const kind = fieldKind(field || {type:'image'});
    input.accept = mediaAccept(kind);
    input.onchange = async () => {
        const file = input.files[0];
        if(!file) return;
        // 先用本地 blob URL 立即显示缩略图
        if(previewImageUrls[fieldId]) URL.revokeObjectURL(previewImageUrls[fieldId]);
        previewImageUrls[fieldId] = URL.createObjectURL(file);
        renderPreview();
        // 再上传到 ComfyUI 拿到 comfy_name 作为运行时的实际值
        const form = new FormData();
        form.append('files', file);
        try {
            const data = await fetch('/api/upload', { method:'POST', body:form }).then(r=>r.json());
            const filename = data.files?.[0]?.comfy_name || data.files?.[0]?.filename || file.name;
            previewValues[fieldId] = filename;
        } catch(e){ alert(mediaUploadFailedText(kind)); }
    };
    input.click();
}

async function onRun(){
    if(!selectedName || !currentConfig) return;
    const btn = document.getElementById('runBtn');
    if(btn){ btn.disabled = true; btn.querySelector('span').textContent = tr('comfy.runningTest'); }
    setStatus(tr('comfy.runningTest'));
    try {
        const baseFields = workspaceMode === 'canvas' ? fieldsFromMiniCanvas() : {...previewValues};
        const runFields = applyActiveRandomValues(baseFields);
        const res = await fetch(`/api/workflows/${encodeURIComponent(selectedName)}/run`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ fields:runFields, config:currentConfig, client_id:'workflow-test' })
        });
        if(!res.ok) throw new Error((await res.json()).detail || tr('comfy.runFailed'));
        const data = await res.json();
        runResult = data.images?.[0] || null;
        renderPreview();
        renderWorkspaceView();
        setStatus(tr('comfy.runSuccess'));
    } catch(e){
        alert(e.message || tr('comfy.runFailed'));
        setStatus(tr('comfy.runFailed'));
    } finally {
        if(btn){ btn.disabled = false; btn.querySelector('span').textContent = tr('comfy.runTest'); }
    }
}

function fieldsFromMiniCanvas(){
    const fields = {...previewValues};
    const mediaKinds = ['image','video','audio'];
    const promptFields = currentConfig.fields.filter(f => fieldKind(f) === 'prompt');
    const prompt = miniTestNodes.filter(n => n.type === 'prompt').map(n => n.text || '').filter(Boolean).join('\n\n');
    mediaKinds.forEach(kind => {
        const mediaFields = currentConfig.fields.filter(f => fieldKind(f) === kind);
        const mediaNodes = miniTestNodes.filter(n => n.type === kind && n.value);
        mediaFields.forEach((f, i) => {
            fields[f.id] = mediaNodes[i]?.value || fields[f.id] || '';
        });
    });
    promptFields.forEach(f => {
        fields[f.id] = prompt || fields[f.id] || '';
    });
    return fields;
}

async function onUpload(event){
    const file = event.target.files[0];
    if(!file) return;
    event.target.value = '';
    try {
        const text = await file.text();
        let workflow;
        try { workflow = JSON.parse(text); }
        catch { alert(tr('comfy.invalidJson')); return; }
        const baseName = file.name.replace(/\.json$/i, '');
        const inputName = prompt(tr('comfy.namePrompt'), baseName);
        if(!inputName) return;
        const data = await fetch('/api/workflows', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ name:inputName, workflow })
        });
        const result = await data.json();
        if(!data.ok) throw new Error(result.detail || tr('comfy.uploadFailed'));
        await loadList();
        selectWorkflow(result.name);
        setStatus(tr('comfy.uploaded') + result.name);
        new BroadcastChannel('studio-api').postMessage({ type: 'workflows-changed' });
    } catch(e){ alert(e.message || tr('comfy.uploadFailed')); }
}

async function onSave(){
    if(!selectedName || !currentConfig) return;
    // 校验
    for(const f of currentConfig.fields){
        if(!f.name || !f.name.trim()){
            alert(tf('comfy.saveMissingName', {field:f.input})); return;
        }
    }
    setStatus(tr('comfy.saving'));
    try {
        const res = await fetch(`/api/workflows/${encodeURIComponent(selectedName)}/config`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(currentConfig)
        });
        if(!res.ok) throw new Error((await res.json()).detail || tr('comfy.saveFailed'));
        setStatus(tr('comfy.saved'));
        await loadList();
        new BroadcastChannel('studio-api').postMessage({ type: 'workflows-changed' });
    } catch(e){ alert(e.message || tr('comfy.saveFailed')); setStatus(tr('comfy.saveFailed')); }
}

async function onDelete(){
    if(!selectedName || isBuiltin) return;
    if(!confirm(tf('comfy.deleteConfirm', {name: currentConfig.title || selectedName}))) return;
    try {
        const res = await fetch(`/api/workflows/${encodeURIComponent(selectedName)}`, { method:'DELETE' });
        if(!res.ok) throw new Error((await res.json()).detail || tr('comfy.deleteFailed'));
        selectedName = '';
        currentWorkflow = null;
        currentConfig = null;
        renderEditor();
        renderPreview();
        renderWorkspaceView();
        await loadList();
        new BroadcastChannel('studio-api').postMessage({ type: 'workflows-changed' });
    } catch(e){ alert(e.message || tr('comfy.deleteFailed')); }
}

window.addEventListener('message', event => {
    if(event.data?.type === 'studio-theme' && window.StudioTheme) window.StudioTheme.set(event.data.theme);
    if(event.data?.type === 'studio-lang' && window.StudioI18n) window.StudioI18n.set(event.data.lang);
});
window.addEventListener('studio-lang-change', refreshLanguageView);

document.addEventListener('DOMContentLoaded', () => {
    refreshIcons();
    if(window.StudioI18n) StudioI18n.apply();
    loadList();
});
