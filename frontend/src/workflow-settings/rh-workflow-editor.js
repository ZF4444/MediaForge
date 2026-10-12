// 工作流设置页的 RunningHub 工作流编辑器子系统。
//
// 范围：RunningHub AI 应用配置的整套编辑体验——粘贴 /run/ai-app/... 链接创建
// 卡片、卡片缩略图上传、工作流字段拉取与归一化（normalizeRhWorkflowField /
// normalizeFetchedRhAppField 等）、字段编辑弹层（openRhAppFieldPopover）、
// 画布节点映射预览（renderRhMappedPreview 及其字段控件渲染）、"测试运行"
// 整套提交/轮询/取结果逻辑（testRhMappedPreview）、编辑器滚动位置保持
// （captureRhEditorScrollState/restoreRhEditorScrollState，用于重渲染后
// 保持用户的滚动位置和已展开的弹层，避免每次编辑一个字段就跳到顶部）。
//
// 经典 <script>，非 ES module：跟画布重构方法论一致（见
// frontend/README.md）。api-settings.html 有 40 处内联 onclick/onchange
// 依赖 window 全局函数（本模块的 toggleRhWorkflowEditorField/
// updateRhWorkflowEditorField/openRhAppFieldPopover/pickRhThumbnail/
// removeRhEntry/openRhAppEditor 等都被内联事件属性直接引用），经典脚本
// 顶层函数声明自动挂到 window，ES module 的具名 import 是只读绑定，两者
// 语义不兼容，所以保持经典脚本写法。
//
// 状态变量 rhWorkflowEditorState（工作流编辑器的全部可变状态：是否打开、
// 当前编辑的应用条目、拉取到的字段配置、预览参数等）刻意留在 main.js，
// 本模块的函数直接读写这个共享变量——跟画布 M1-M22 建立的模式一致：
// classic script 顶层 let 声明处于所有 <script> 标签共享的顶层作用域，
// 跨文件读写不需要改成 getter/setter。同样留在 main.js 的还有：
// runningHubState()/runningHubApps/selectedId（资源编辑状态）、saveRunningHubResources()
// （保存整个供应商列表到后端）、escapeHtml/escapeAttr/refreshIcons/
// setStatus/broadcastStudioApiChange（通用工具函数，被几乎所有模块共用）。
//
// 依赖的 DOM 元素（rhWorkflowEditorOverlay/rhWorkflowEditorTitle/
// rhWorkflowEditorSub/rhWorkflowSaveBtn/rhWorkflowEditName/
// rhWorkflowEditNote/rhWorkflowEditorSummary/rhWorkflowEditorNodeList/
// rhWorkflowEditorGraphWrap/rhAppsList/rhAppsCount/rhPasteInput）同样是
// main.js 顶部 const 声明的共享 DOM 引用，不重复声明。

function rhRuntimeApiJson(url, options = {}){
    const apiJson = globalThis.__MediaForgeRuntimeServices?.apiJson;
    if(apiJson) return apiJson(url, options);
    return fetch(url, options).then(async response => {
        const data = await response.json().catch(() => ({}));
        if(!response.ok) throw new Error(data.detail || data.error || '请求失败');
        return data;
    });
}
function rhRuntimeApiForm(url, formData, options = {}){
    const apiForm = globalThis.__MediaForgeRuntimeServices?.apiForm;
    if(apiForm) return apiForm(url, formData, options);
    return rhRuntimeApiJson(url, {...options, method:options.method || 'POST', body:formData});
}

function rhEditorSideScrollEl(){
    return rhWorkflowEditorNodeList?.closest?.('.rh-workflow-editor-side') || rhWorkflowEditorNodeList;
}
function captureRhEditorScrollState(){
    const pop = document.getElementById('rhNodePopover');
    const popBody = pop?.querySelector?.('.rh-popover-body');
    const side = rhEditorSideScrollEl();
    return {
        sideTop:side?.scrollTop || 0,
        nodeListTop:rhWorkflowEditorNodeList?.scrollTop || 0,
        graphTop:rhWorkflowEditorGraphWrap?.scrollTop || 0,
        popNodeId:pop?.dataset?.nodeId || '',
        popFieldKey:pop?.dataset?.fieldKey || '',
        popBodyTop:popBody?.scrollTop || 0
    };
}
function restoreRhEditorScrollState(state){
    if(!state) return;
    const restore = () => {
        const side = rhEditorSideScrollEl();
        if(side) side.scrollTop = state.sideTop || 0;
        if(rhWorkflowEditorNodeList) rhWorkflowEditorNodeList.scrollTop = state.nodeListTop || 0;
        if(rhWorkflowEditorGraphWrap) rhWorkflowEditorGraphWrap.scrollTop = state.graphTop || 0;
        const pop = document.getElementById('rhNodePopover');
        const samePopover = pop && (
            (state.popNodeId && pop.dataset.nodeId === state.popNodeId) ||
            (state.popFieldKey && pop.dataset.fieldKey === state.popFieldKey)
        );
        if(samePopover){
            const popBody = pop.querySelector('.rh-popover-body');
            if(popBody) popBody.scrollTop = state.popBodyTop || 0;
        }
    };
    requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
    });
}
function withRhEditorScrollPreserved(callback){
    const scrollState = captureRhEditorScrollState();
    const result = callback();
    restoreRhEditorScrollState(scrollState);
    return result;
}
function findRhAppFieldCard(key){
    return Array.from(document.querySelectorAll('.rh-field-row')).find(el => el.dataset.fieldKey === String(key || ''));
}
function normalizeRhEntries(values, kind){
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map(raw => {
        const parsed = parseRunningHubRunRef(raw?.app_id || raw?.webappId || raw?.appId || raw?.id || '');
        const id = String(parsed?.id || raw?.app_id || raw?.webappId || raw?.appId || raw?.id || '').trim();
        if(!id || seen.has(id)) return null;
        seen.add(id);
        const fallback = `AI 应用 ${id.slice(-6)}`;
        const entry = {
            id,
            app_id:id,
            title:String(raw?.title || raw?.name || fallback).trim(),
            note:String(raw?.note || raw?.description || '').trim(),
            thumbnail:String(raw?.thumbnail || '').trim(),
            enabled:raw?.enabled !== false
        };
        // Keep the database resource identity while normalizing the editable
        // entry; the embedded editor uses it to update/create the right row.
        if(raw?._resource_id) entry._resource_id = String(raw._resource_id);
        if(raw?.cover && typeof raw.cover === 'object') entry.cover = {...raw.cover};
        if(raw?.media === 'video') entry.media = 'video';
        if(raw?.sourceAppId) entry.sourceAppId = String(raw.sourceAppId);
        if(raw?.hidden === true) entry.hidden = true;
        if(Array.isArray(raw?.fields)) entry.fields = raw.fields.map(normalizeRhWorkflowField);
        if(raw?.raw && typeof raw.raw === 'object') entry.raw = raw.raw;
        const updatedAt = Number(raw?.updatedAt || 0);
        if(updatedAt > 0) entry.updatedAt = updatedAt;
        entry.appId = id;
        entry.webappId = id;
        return entry;
    }).filter(Boolean);
}
function parseRunningHubRunRef(value){
    const text = String(value || '').trim();
    const match = text.match(/\/run\/ai-app\/([0-9A-Za-z_-]+)/i);
    if(match) return { type:'app', id:match[1] };
    const numeric = text.match(/^[0-9]{8,}$/);
    if(numeric) return { type:'app', id:text };
    return null;
}
function rhWorkflowFieldKey(field){
    return `${field?.nodeId || ''}::${field?.fieldName || ''}`;
}
function rhWorkflowFieldKind(field){
    const type = String(field?.fieldType || '').toUpperCase();
    if(['IMAGE','VIDEO','AUDIO','BOOLEAN','NUMBER','FLOAT','INT','INTEGER','TEXT','PROMPT','SLIDER','SELECT'].includes(type)){
        if(type === 'FLOAT' || type === 'INT' || type === 'INTEGER') return 'NUMBER';
        return type;
    }
    const key = `${field?.fieldName || ''} ${field?.fieldValue || ''}`.toLowerCase();
    if(/image|img|mask|png|jpg|jpeg|webp/.test(key)) return 'IMAGE';
    if(/video|mp4|webm|mov/.test(key)) return 'VIDEO';
    if(/audio|wav|mp3|voice|sound/.test(key)) return 'AUDIO';
    if(/true|false/.test(key)) return 'BOOLEAN';
    if(/^-?\d+(\.\d+)?$/.test(String(field?.fieldValue || '').trim())) return 'NUMBER';
    return 'TEXT';
}
function rhWorkflowFieldTypeLabel(type){
    return ({
        TEXT:'文本',
        PROMPT:'提示词',
        NUMBER:'数字',
        SLIDER:'滑块',
        BOOLEAN:'开关',
        SELECT:'下拉',
        IMAGE:'图片',
        VIDEO:'视频',
        AUDIO:'音频'
    })[String(type || '').toUpperCase()] || type;
}
var RH_EDITOR_KNOWN_FIELD_OPTIONS = {
    sampler_name:['euler','euler_ancestral','heun','dpm_2','dpm_2_ancestral','lms','dpmpp_2m','dpmpp_sde','ddim','uni_pc'],
    sampler:['euler','euler_ancestral','heun','dpm_2','dpm_2_ancestral','lms','dpmpp_2m','dpmpp_sde','ddim','uni_pc'],
    scheduler:['normal','karras','exponential','sgm_uniform','simple','ddim_uniform','beta'],
    ratio:['1:1','16:9','9:16','21:9','9:21','4:3','3:4','4:5','5:4','3:2','2:3'],
    aspectRatio:['1:1','16:9','9:16','4:3','3:4','4:5','5:4','3:2','2:3'],
    resolution:['512','768','1024','1280','1536','2048','1k','2k','4k'],
    size:['512','768','1024','1280','1536','2048'],
    ckpt_name:[],
    unet_name:[],
    lora_name:[]
};
function rhKnownOptionsForField(field){
    const name = String(field?.fieldName || '').trim();
    if(!name) return [];
    if(RH_EDITOR_KNOWN_FIELD_OPTIONS[name]) return RH_EDITOR_KNOWN_FIELD_OPTIONS[name].map(String);
    const hit = Object.keys(RH_EDITOR_KNOWN_FIELD_OPTIONS).find(key => key.toLowerCase() === name.toLowerCase());
    return hit ? RH_EDITOR_KNOWN_FIELD_OPTIONS[hit].map(String) : [];
}
function normalizeRhWorkflowField(field){
    const options = Array.isArray(field?.options)
        ? field.options.map(option => String(option ?? '').trim()).filter(Boolean)
        : String(field?.options || '').split(/\r?\n|,/).map(option => option.trim()).filter(Boolean);
    const knownOptions = options.length ? options : rhKnownOptionsForField(field);
    const fieldType = String(field?.fieldType || rhWorkflowFieldKind(field));
    const normalizedType = fieldType.toUpperCase();
    const savedSource = field?.sourceFromUpstream;
    return {
        id:String(field?.id || rhWorkflowFieldKey(field)),
        nodeId:String(field?.nodeId || ''),
        fieldName:String(field?.fieldName || ''),
        fieldValue:field?.fieldValue == null ? '' : String(field.fieldValue),
        fieldType:knownOptions.length && !['IMAGE','VIDEO','AUDIO','PROMPT','SLIDER'].includes(normalizedType) ? 'SELECT' : fieldType,
        label:String(field?.label || field?.fieldName || ''),
        enabled:field?.enabled === true,
        sourceFromUpstream:savedSource === undefined ? false : savedSource !== false,
        group:String(field?.group || ''),
        note:String(field?.note || ''),
        options:knownOptions,
        random_enabled:field?.random_enabled === true,
        min:field?.min ?? '',
        max:field?.max ?? '',
        step:field?.step ?? '',
        imageOrder:Number(field?.imageOrder || field?.image_order || 0) || 0,
        required:field?.required === true
    };
}
function normalizeFetchedRhWorkflowField(field){
    return {...normalizeRhWorkflowField(field), enabled:false};
}
function rhWorkflowGroupKey(field){
    return `${field?.nodeId || ''}::${field?.group || ''}`;
}
function rhEditorSortedFields(fields){
    return [...(fields || [])].sort((a, b) => {
        const ak = rhWorkflowFieldKind(a);
        const bk = rhWorkflowFieldKind(b);
        if(ak === 'IMAGE' && bk === 'IMAGE'){
            const ao = Number(a.imageOrder) || 9999;
            const bo = Number(b.imageOrder) || 9999;
            if(ao !== bo) return ao - bo;
        }
        if(ak === 'IMAGE' && bk !== 'IMAGE') return -1;
        if(ak !== 'IMAGE' && bk === 'IMAGE') return 1;
        return String(a.nodeId || '').localeCompare(String(b.nodeId || ''), undefined, {numeric:true}) || String(a.fieldName || '').localeCompare(String(b.fieldName || ''));
    });
}
function ensureRunningHubLists(item){
    if(!item) return;
    const normalized = normalizeRhEntries(item.rh_apps || [], 'app');
    // runningHubState() exposes the shared array through a lightweight view.
    // Keep that array's identity so callers updating the view update global state.
    if(Array.isArray(item.rh_apps)){
        item.rh_apps.splice(0, item.rh_apps.length, ...normalized);
    }else{
        item.rh_apps = normalized;
    }
}
function handleRhPasteInput(value){
    const parsed = parseRunningHubRunRef(value);
    if(parsed) setStatus('已识别 RunningHub 路径，点击右侧创建卡片');
}
function createRhEntryFromPaste(){
    const item = runningHubState();
    if(!item || item.id !== 'runninghub') return;
    const parsed = parseRunningHubRunRef(rhPasteInput?.value || '');
    if(!parsed){ setStatus('请粘贴 /run/ai-app/...'); return; }
    ensureRunningHubLists(item);
    const exists = item.rh_apps.some(entry => entry.id === parsed.id);
    if(!exists){
        item.rh_apps.unshift({
            id:parsed.id,
            appId:parsed.id,
            title:`AI 应用 ${parsed.id.slice(-6)}`,
            note:'',
            thumbnail:'',
            enabled:true
        });
    }
    if(rhPasteInput) rhPasteInput.value = '';
    renderRunningHubCards();
    setStatus(exists ? '这个 RunningHub 项目已经存在' : '已创建 RunningHub 卡片');
}
function updateRhEntry(kind, index, prop, value){
    const item = runningHubState();
    if(!item || item.id !== 'runninghub') return;
    ensureRunningHubLists(item);
    if(!item.rh_apps[index]) return;
    item.rh_apps[index][prop] = value;
    if(prop === 'title') setStatus('名称已修改，点保存生效');
    if(prop === 'note') setStatus('备注已修改，点保存生效');
}
function removeRhEntry(kind, index){
    const item = runningHubState();
    if(!item || item.id !== 'runninghub') return;
    ensureRunningHubLists(item);
    item.rh_apps.splice(index, 1);
    renderRunningHubCards();
}
function readFileAsDataUrl(file){
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(String(reader.result || '')), {once:true});
        reader.addEventListener('error', () => reject(reader.error || new Error('读取图片失败')), {once:true});
        reader.readAsDataURL(file);
    });
}
function loadImageForThumbnail(src){
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.addEventListener('load', () => resolve(img), {once:true});
        img.addEventListener('error', () => reject(new Error('图片解析失败')), {once:true});
        img.src = src;
    });
}
async function createRhThumbnailDataUrl(file){
    const original = await readFileAsDataUrl(file);
    try {
        const img = await loadImageForThumbnail(original);
        const maxSide = 360;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width || 1, img.naturalHeight || img.height || 1));
        const width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
        const height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.78);
    } catch(e) {
        return original;
    }
}
function pickRhThumbnail(kind, index){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if(!file) return;
        try {
            const thumbnail = await createRhThumbnailDataUrl(file);
            updateRhEntry(kind, index, 'thumbnail', thumbnail);
            renderRunningHubCards();
            setStatus('缩略图已更新，点保存生效');
        } catch(e) {
            rhNotice(e.message || '上传缩略图失败', 'error');
        }
    });
    input.click();
}
async function openRhAppEditor(index){
    const item = runningHubState();
    if(!item || item.id !== 'runninghub') return;
    ensureRunningHubLists(item);
    let entry = item.rh_apps[index];
    if(!entry) return;
    if(!entry._resource_id){
        const appId = String(entry.id || entry.appId || entry.webappId || '');
        const resource = (aiConfiguration.resources || []).find(r => r.kind === 'runninghub_app' && String(r.settings?.app_id || '') === appId);
        if(resource) entry = {...entry, _resource_id:resource.id};
        item.rh_apps[index] = entry;
    }
    rhWorkflowEditorState = { open:true, index, resourceId:entry._resource_id || '', entry, config:null, expanded:{}, activeNodeId:'app', graph:{ k:1, x:0, y:0, w:0, h:0 }, pan:null, bound:false, previewParams:{}, previewRunning:false, previewStatus:'', previewOutputs:[], activeFieldKey:'', fieldQuery:'', fieldKindFilter:'all', onlyEnabled:false, rightTab:'config' };
    if(rhWorkflowEditorOverlay) rhWorkflowEditorOverlay.classList.add('open');
    renderRhWorkflowEditorLoading('正在加载应用参数...');
    refreshIcons();
    try {
        await loadRhAppEditorConfig(entry);
    } catch(e) {
        renderRhWorkflowEditorLoading(e.message || '应用参数加载失败');
    }
}
function closeRhWorkflowEditor(){
    if(rhWorkflowEditorOverlay) rhWorkflowEditorOverlay.classList.remove('open');
    rhWorkflowEditorState.open = false;
}
function renderRhWorkflowEditorLoading(text){
    if(rhWorkflowEditorTitle) rhWorkflowEditorTitle.textContent = rhWorkflowEditorState.entry?.title || 'RunningHub AI 应用';
    if(rhWorkflowEditName) rhWorkflowEditName.value = rhWorkflowEditorState.entry?.title || '';
    if(rhWorkflowEditNote) rhWorkflowEditNote.value = rhWorkflowEditorState.entry?.note || '';
    if(rhWorkflowEditorSub) rhWorkflowEditorSub.textContent = `/run/ai-app/${rhWorkflowEditorState.entry?.appId || rhWorkflowEditorState.entry?.id || ''}`;
    if(rhWorkflowEditorSummary) rhWorkflowEditorSummary.innerHTML = `<div class="rh-editor-empty">${escapeHtml(text)}</div>`;
    if(rhWorkflowEditorNodeList) rhWorkflowEditorNodeList.innerHTML = '';
    if(rhWorkflowEditorGraphWrap) {
        rhWorkflowEditorGraphWrap.classList.add('rh-app-field-wrap');
        rhWorkflowEditorGraphWrap.innerHTML = `<div class="rh-editor-empty">${escapeHtml(text)}</div>`;
    }
}
function normalizeRhAppConfig(entry){
    const appId = String(entry?.id || entry?.appId || entry?.webappId || '').trim();
    return {
        appId,
        title:String(entry?.title || `AI 应用 ${appId.slice(-6)}` || appId),
        description:String(entry?.note || ''),
        fields:(Array.isArray(entry?.fields) ? entry.fields : []).map(normalizeRhWorkflowField),
        raw:entry?.raw || {},
        sourceAppId:String(entry?.sourceAppId || entry?.raw?.sourceAppId || '').trim()
    };
}
function rhAppFieldSourceList(raw){
    const data = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
    const candidates = [
        data?.nodeInfoList,
        data?.fields,
        data?.inputs,
        data?.inputList,
        data?.formItems,
        data?.forms,
        data?.params,
        data?.parameters,
        data?.apiParams,
        data?.config?.fields,
        data?.webapp?.fields,
        data?.webapp?.inputs
    ];
    for(const candidate of candidates){
        if(Array.isArray(candidate) && candidate.length) return candidate;
        if(candidate && typeof candidate === 'object' && Object.keys(candidate).length){
            return Object.entries(candidate).map(([key, value]) => ({fieldName:key, fieldValue:value}));
        }
    }
    return [];
}
function normalizeFetchedRhAppField(field, index=0){
    const name = field?.fieldName || field?.inputName || field?.name || field?.key || field?.paramName || field?.id || `field_${index + 1}`;
    const nodeId = field?.nodeId || field?.node_id || field?.groupId || 'app';
    let value = field?.fieldValue;
    if(value === undefined) value = field?.defaultValue;
    if(value === undefined) value = field?.value;
    if(value === undefined) value = field?.default;
    if(value === undefined || value === null) value = '';
    if(typeof value === 'object') value = JSON.stringify(value);
    const options = extractRhEditorFieldOptions(field);
    return normalizeRhWorkflowField({
        id:field?.id || `${nodeId}::${name}`,
        nodeId,
        fieldName:name,
        fieldValue:value,
        fieldType:field?.fieldType || field?.type || field?.valueType || (options.length ? 'SELECT' : ''),
        label:field?.label || field?.title || field?.name || name,
        enabled:true,
        group:field?.group || field?.category || field?.title || 'AI 应用参数',
        note:field?.note || field?.description || '',
        options,
        min:field?.min ?? '',
        max:field?.max ?? '',
        step:field?.step ?? ''
    });
}
function extractRhEditorFieldOptions(field){
    const candidates = [field?.options, field?.optionList, field?.values, field?.enum, field?.choices, field?.items, field?.list, field?.selectOptions, field?.fieldData];
    for(const candidate of candidates){
        if(!Array.isArray(candidate) || !candidate.length) continue;
        return candidate.map(item => {
            if(item && typeof item === 'object') return item.value ?? item.label ?? item.name ?? item.title;
            return item;
        }).filter(item => item !== undefined && item !== null).map(String);
    }
    const known = rhKnownOptionsForField(field);
    if(known.length) return known;
    return [];
}
async function loadRhAppEditorConfig(entry){
    const config = normalizeRhAppConfig(entry);
    rhWorkflowEditorState.config = config;
    // Reuse saved fields only when their persisted RH payload identifies the
    // same application. Legacy records could retain fields from a different
    // app while their top-level id was later edited, which otherwise made the
    // detail page display another app's parameters indefinitely.
    const requestedId = String(entry?.id || entry?.appId || entry?.webappId || '').trim();
    const rawId = String(entry?.raw?.webappId || entry?.raw?.appId || entry?.raw?.id || '').trim();
    const sourceAppId = String(entry?.sourceAppId || entry?.raw?.sourceAppId || '').trim();
    const hasConflictingRawId = Boolean((rawId || sourceAppId) && requestedId && (rawId || sourceAppId) !== requestedId);
    if(!config.fields.length || hasConflictingRawId) await fetchRhAppEditor(false);
    else renderRhWorkflowEditor();
    return rhWorkflowEditorState.config;
}
async function fetchRhAppEditor(force=false){
    const state = rhWorkflowEditorState;
    const entry = state.entry;
    const appId = String(entry?.appId || entry?.id || '').trim();
    if(!appId) throw new Error('appId 为空');
    if(force) renderRhWorkflowEditorLoading('正在重新拉取...');
    const data = await rhRuntimeApiJson(`/api/runninghub/app-info?webappId=${encodeURIComponent(appId)}`);
    if(data.success === false) throw new Error(data.detail || '拉取应用参数失败');
    const fields = rhAppFieldSourceList(data).map(normalizeFetchedRhAppField);
    const platformTitle = String(data.data?.webappName || data.data?.name || data.data?.title || data.webappName || data.name || data.title || '').trim();
    const fallbackTitle = `AI 应用 ${appId.slice(-6)}`;
    state.config = {
        appId,
        // Explicit open/re-fetch actions use the current upstream platform title.
        title:platformTitle || fallbackTitle,
        description:rhWorkflowEditNote?.value.trim() || entry.note || '',
        fields,
        raw:data.data || data,
        sourceAppId:appId
    };
    entry.title = state.config.title;
    window.parent !== window && window.parent.postMessage({type:'workflow-title', title:state.config.title}, location.origin);
    state.graph = { k:1, x:0, y:0, w:0, h:0 };
    renderRhWorkflowEditor();
    return state.config;
}
function updateRhWorkflowEditorMeta(prop, value){
    const config = rhWorkflowEditorState.config;
    if(!config) return;
    if(prop === 'title') {
        config.title = value;
        // Keep the embedding workflow-config page in sync so its metadata
        // save cannot overwrite a freshly edited title with the original one.
        if(window.parent && window.parent !== window && typeof window.parent.postMessage === 'function'){
            window.parent.postMessage({type:'workflow-title', title:value}, location.origin);
        }
    }
    if(prop === 'description') config.description = value;
    withRhEditorScrollPreserved(() => renderRhMappedPreview());
}
// The field detail is an in-page panel next to the field list (not a floating
// window). "Closing" it just clears the selection back to the empty hint.
function renderRhFieldDetailEmpty(){
    const panel = document.getElementById('rhNodePopover');
    if(!panel) return;
    delete panel.dataset.fieldKey;
    panel.classList.add('is-empty');
    panel.innerHTML = '<div class="rh-detail-empty"><i data-lucide="mouse-pointer-click" class="w-5 h-5"></i><strong>选择一个参数</strong><span>点击左侧列表中的参数，在这里设置它在画布上的显示方式。用右侧的开关决定是否暴露。</span></div>';
    refreshIcons();
}
function closeRhNodePopover(){
    rhWorkflowEditorState.activeFieldKey = '';
    document.querySelectorAll('.rh-field-row.is-active').forEach(el => { el.classList.remove('is-active'); el.setAttribute('aria-pressed', 'false'); });
    renderRhFieldDetailEmpty();
}
function toggleRhWorkflowEditorField(key){
    const config = rhWorkflowEditorState.config;
    if(!config) return;
    withRhEditorScrollPreserved(() => {
        config.fields = (config.fields || []).map(field => {
            if(rhWorkflowFieldKey(field) !== key) return field;
            return {...field, enabled: field.enabled !== true};
        });
        rhNotifyFieldsChanged();
        refreshRhFieldList();
        renderRhMappedPreview();
        // Keep the open detail in sync (its "expose" switch) without changing the selection.
        if(rhWorkflowEditorState.activeFieldKey === key) openRhAppFieldPopover(key);
    });
}
function updateRhWorkflowEditorField(key, prop, value){
    const config = rhWorkflowEditorState.config;
    if(!config) return;
    config.fields = (config.fields || []).map(field => {
        if(rhWorkflowFieldKey(field) !== key) return field;
        let nextValue = value;
        if(prop === 'imageOrder') nextValue = value === null || value === '' ? 0 : Math.max(1, Math.floor(Number(value)) || 1);
        else if(prop === 'required') nextValue = Boolean(value);
        else if(prop === 'options') nextValue = String(value || '').split(/\r?\n/).map(option => option.trim()).filter(Boolean);
        return {...field, [prop]: nextValue};
    });
    rhNotifyFieldsChanged();
    if(prop === 'random_enabled' || prop === 'fieldType' || prop === 'required'){
        // These change which controls the detail shows, so rebuild it.
        withRhEditorScrollPreserved(() => {
            refreshRhFieldList();
            renderRhMappedPreview();
            openRhAppFieldPopover(key);
        });
        return;
    }
    // Text edits: keep the focused input untouched; refresh only the list label and preview.
    if(prop === 'label'){
        const field = config.fields.find(item => rhWorkflowFieldKey(item) === key);
        const head = document.querySelector('#rhNodePopover .rh-popover-head strong');
        if(head && field) head.textContent = field.label || field.fieldName;
        refreshRhFieldList();
    }
    renderRhMappedPreview();
}
function setRhWorkflowSaveButtonState(state, text){
    if(!rhWorkflowSaveBtn) return;
    const label = rhWorkflowSaveBtn.querySelector('span');
    rhWorkflowSaveBtn.classList.toggle('is-saved', state === 'saved');
    rhWorkflowSaveBtn.disabled = state === 'saving';
    if(label) label.textContent = text || (state === 'saved' ? '已保存' : state === 'saving' ? '保存中...' : '保存');
    const icon = rhWorkflowSaveBtn.querySelector('i');
    if(icon) icon.setAttribute('data-lucide', state === 'saved' ? 'check' : 'save');
    refreshIcons();
}
function rhWorkflowParameterExportPayload(config){
    const source = config || {};
    return {
        format:'mediaforge-rh-parameters',
        version:1,
        appId:String(source.appId || ''),
        title:String(source.title || ''),
        description:String(source.description ?? source.note ?? ''),
        fields:(Array.isArray(source.fields) ? source.fields : []).map(normalizeRhWorkflowField)
    };
}
function parseRhWorkflowParameterImport(value){
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const fields = Array.isArray(parsed) ? parsed : parsed?.fields;
    if(!Array.isArray(fields)) throw new Error('JSON 必须包含 fields 数组');
    if(fields.some(field => !field || typeof field !== 'object' || !String(field.fieldName || '').trim())){
        throw new Error('参数字段必须包含 fieldName');
    }
    return {
        fields:fields.map(normalizeRhWorkflowField),
        title:Array.isArray(parsed) ? '' : String(parsed?.title || '').trim(),
        description:Array.isArray(parsed) ? '' : String(parsed?.description ?? parsed?.note ?? '').trim()
    };
}
function exportRhWorkflowJson(){
    const config = rhWorkflowEditorState.config;
    if(!config){ rhNotice('请先加载应用参数', 'error'); return false; }
    const payload = JSON.stringify(rhWorkflowParameterExportPayload(config), null, 2);
    const blob = new Blob([payload], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${String(config.title || config.appId || 'rh-parameters').replace(/[\\/:*?"<>|]+/g, '_')}-parameters.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus('参数 JSON 已导出');
    rhNotice('参数 JSON 已导出', 'success');
    return true;
}
function importRhWorkflowJson(file){
    if(!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
        try {
            const config = rhWorkflowEditorState.config;
            if(!config) throw new Error('请先加载应用参数');
            const imported = parseRhWorkflowParameterImport(String(reader.result || ''));
            config.fields = imported.fields;
            config.description = imported.description;
            if(rhWorkflowEditNote) rhWorkflowEditNote.value = imported.description;
            if(imported.title){
                config.title = imported.title;
                if(rhWorkflowEditName) rhWorkflowEditName.value = imported.title;
                updateRhWorkflowEditorMeta('title', imported.title);
            }
            rhWorkflowEditorState.previewParams = {};
            renderRhWorkflowEditor();
            setStatus('参数 JSON 已导入，点击保存生效');
            rhNotifyFieldsChanged();
            rhNotice(`已导入 ${imported.fields.length} 个参数，保存后生效`, 'success');
        } catch(error) {
            setStatus(`导入失败：${error.message || 'JSON 格式无效'}`);
            rhNotice(error.message || '参数 JSON 导入失败', 'error');
        }
    }, {once:true});
    reader.addEventListener('error', () => {
        setStatus('导入失败：无法读取文件');
        rhNotice('参数 JSON 导入失败：无法读取文件', 'error');
    }, {once:true});
    reader.readAsText(file);
}
async function saveRhWorkflowEditor(){
    const state = rhWorkflowEditorState;
    const config = state.config;
    if(!config){ rhNotice('请先加载应用参数', 'error'); return false; }
    setRhWorkflowSaveButtonState('saving', '保存中...');
    config.title = rhWorkflowEditName?.value.trim() || config.title || config.appId;
    config.description = rhWorkflowEditNote?.value.trim() || config.description || '';
    // A programmatic save can run without an input event; publish the final
    // title before the outer page persists its workflow metadata.
    if(window.parent && window.parent !== window && typeof window.parent.postMessage === 'function'){
        window.parent.postMessage({type:'workflow-title', title:config.title}, location.origin);
    }
    try {
        const item = runningHubState();
        if(item?.id === 'runninghub'){
            const entry = item.rh_apps?.find(app => app._resource_id === state.resourceId);
            if(!entry) throw new Error('工作流资源已变更，请重新打开');
            entry.title = config.title || entry.title;
            entry.note = config.description || '';
            entry.fields = (config.fields || []).map(normalizeRhWorkflowField);
            entry.raw = config.raw || {};
            entry.sourceAppId = config.sourceAppId || config.appId;
            renderRunningHubCards();
            await saveRunningHubResources();
        }
        setStatus('应用参数配置已保存');
        setRhWorkflowSaveButtonState('saved', '已保存');
        setTimeout(() => setRhWorkflowSaveButtonState('idle', '保存'), 1600);
            broadcastStudioApiChange('resources-changed');
        renderRhWorkflowEditor();
        return true;
    } catch(err) {
        setRhWorkflowSaveButtonState('idle', '保存');
        // Embedded: the parent page reports the error inline (no blocking dialog).
        if(rhWorkflowEmbedded) throw err;
        rhNotice(err.message || '保存失败', 'error');
        return false;
    }
}
function renderRhWorkflowEditor(){
    const config = rhWorkflowEditorState.config;
    if(!config){ renderRhWorkflowEditorLoading('应用参数未加载'); return; }
    if(rhWorkflowEditorTitle) rhWorkflowEditorTitle.textContent = config.title || 'RunningHub AI 应用';
    if(rhWorkflowEditorSub) rhWorkflowEditorSub.textContent = `/run/ai-app/${config.appId}`;
    if(rhWorkflowEditName) rhWorkflowEditName.value = config.title || '';
    if(rhWorkflowEditNote) rhWorkflowEditNote.value = config.description || '';
    renderRhMappedPreview();
    renderRhEditorSourcePane();
    refreshIcons();
}
function renderRhMappedPreview(){
    const config = rhWorkflowEditorState.config;
    if(!config) return;
    renderRhWorkflowEditorSummary();
    const pane = document.getElementById('rhPreviewPane');
    if(pane){
        // Preserve typing focus in preview inputs across re-renders of this pane.
        pane.innerHTML = renderRhMappedPreviewHtml(config);
    }
    // The old left-column preview form is gone; keep the node list host empty.
    if(rhWorkflowEditorNodeList) rhWorkflowEditorNodeList.innerHTML = '';
    refreshIcons();
}
function renderRhMappedPreviewHtml(config){
    const enabledFields = rhEditorSortedFields((config.fields || []).filter(field => field.enabled === true));
    const title = config.title || 'RunningHub AI 应用';
    let imageCount = 0;
    let videoCount = 0;
    let audioCount = 0;
    let settingCount = 0;
    enabledFields.forEach(field => {
        const kind = rhWorkflowFieldKind(field);
        if(kind === 'IMAGE') imageCount += 1;
        else if(kind === 'VIDEO') videoCount += 1;
        else if(kind === 'AUDIO') audioCount += 1;
        else settingCount += 1;
    });
    const fieldsHtml = enabledFields.length
        ? enabledFields.map(field => renderRhPreviewControl(field)).join('')
        : `<div class="rh-preview-empty">在左侧启用参数后，这里会显示它们在画布节点上的样子</div>`;
    const statusHtml = rhWorkflowEditorState.previewStatus
        ? `<div class="rh-preview-status">${escapeHtml(rhWorkflowEditorState.previewStatus)}</div>`
        : '';
    const outputsHtml = (rhWorkflowEditorState.previewOutputs || []).length
        ? `<div class="rh-preview-output-list">${rhWorkflowEditorState.previewOutputs.map(url => renderRhPreviewOutput(url)).join('')}</div>`
        : '';
    return `
        <div class="rh-mapped-card">
            <div class="rh-mapped-head">
                <div class="rh-mapped-icon"><i data-lucide="sparkles" class="w-4 h-4"></i></div>
                <div>
                    <div class="rh-mapped-title">${escapeHtml(title)}</div>
                    <div class="rh-mapped-sub">/run/ai-app/${escapeHtml(config.appId || '')}</div>
                </div>
            </div>
            <div class="rh-mapped-stats">
                <span>图片 ${imageCount}</span>
                <span>视频 ${videoCount}</span>
                <span>音频 ${audioCount}</span>
                <span>参数 ${settingCount}</span>
            </div>
            <div class="rh-preview-fields">${fieldsHtml}</div>
            <button class="rh-preview-run ${rhWorkflowEditorState.previewRunning ? 'running' : ''}" type="button" data-action="testRhMappedPreview" ${rhWorkflowEditorState.previewRunning ? 'disabled' : ''}><i data-lucide="${rhWorkflowEditorState.previewRunning ? 'loader-2' : 'play'}" class="w-3.5 h-3.5 ${rhWorkflowEditorState.previewRunning ? 'spin-icon' : ''}"></i><span>${rhWorkflowEditorState.previewRunning ? '测试中...' : '测试'}</span></button>
            ${statusHtml}
            ${outputsHtml}
        </div>
    `;
}
function renderRhPreviewOutput(url){
    const safe = escapeAttr(url || '');
    if(/\.(mp4|webm|mov|m4v)(\?|$)/i.test(safe)) return `<video src="${safe}" controls muted playsinline preload="metadata"></video>`;
    if(/\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(safe)) return `<audio src="${safe}" controls preload="metadata"></audio>`;
    return `<img src="${safe}" alt="">`;
}
function renderRhPreviewControl(field){
    const key = rhWorkflowFieldKey(field);
    const label = escapeHtml(field.label || field.fieldName);
    const kind = rhWorkflowFieldKind(field);
    const previewState = rhWorkflowEditorState.previewParams[key] || {};
    const randomActive = field.random_enabled === true && previewState.randomActive !== false;
    const value = previewState.value ?? field.fieldValue ?? '';
    const options = Array.isArray(field.options) ? field.options : [];
    if(['IMAGE','VIDEO','AUDIO'].includes(kind)){
        const icon = kind === 'VIDEO' ? 'file-video' : kind === 'AUDIO' ? 'file-audio' : 'image';
        const media = previewState.url
            ? renderRhPreviewMedia(previewState.url, kind, previewState.name || value)
            : `<i data-lucide="${icon}" class="w-5 h-5"></i><span>点击上传</span>`;
        return `<div class="rh-preview-field"><div class="rh-preview-label">${label}</div><button class="rh-preview-media ${previewState.url ? 'has-media' : ''}" type="button" data-action="pickRhPreviewMedia" data-action-args='${escapeAttr(JSON.stringify([key, kind]))}'>${media}</button></div>`;
    }
    if(kind === 'BOOLEAN'){
        const on = String(value).toLowerCase() === 'true';
        return `<div class="rh-preview-field"><div class="rh-preview-label">${label}</div><div class="rh-preview-switch ${on ? 'on' : ''}" data-action="updateRhPreviewValue" data-action-args='${escapeAttr(JSON.stringify([key, !on]))}'><span></span></div></div>`;
    }
    if(kind === 'SLIDER'){
        const min = Number.isFinite(Number(field.min)) ? Number(field.min) : 0;
        const max = Number.isFinite(Number(field.max)) && Number(field.max) > min ? Number(field.max) : 1;
        const step = Number.isFinite(Number(field.step)) && Number(field.step) > 0 ? Number(field.step) : 0.01;
        const numericValue = Number.isFinite(Number(value)) ? Number(value) : min;
        return `<div class="rh-preview-field"><div class="rh-preview-label"><span>${label}</span><span class="rh-preview-slider-val">${escapeHtml(numericValue)}</span></div><input class="rh-preview-slider" type="range" min="${escapeAttr(min)}" max="${escapeAttr(max)}" step="${escapeAttr(step)}" value="${escapeAttr(numericValue)}" data-action="updateRhPreviewValue" data-action-args='${escapeAttr(JSON.stringify([key]))}' data-action-value="true" data-action-value-type="float"></div>`;
    }
    if(kind === 'PROMPT'){
        return `<div class="rh-preview-field"><div class="rh-preview-label">${label}</div><textarea data-action="updateRhPreviewValue" data-action-args='${escapeAttr(JSON.stringify([key]))}' data-action-value="true">${escapeHtml(value)}</textarea></div>`;
    }
    if(options.length || kind === 'SELECT'){
        return `<div class="rh-preview-field"><div class="rh-preview-label">${label}</div><select disabled>${(options.length ? options : [value || '选项']).map(option => `<option>${escapeHtml(option)}</option>`).join('')}</select></div>`;
    }
    const randomButton = kind === 'NUMBER' && field.random_enabled
        ? `<button class="random-btn rh-preview-random-btn ${randomActive ? 'active' : ''}" type="button" data-action="toggleRhPreviewRandom" data-action-arg="${escapeAttr(key)}" title="${randomActive ? '使用随机数' : '使用固定数'}"><i data-lucide="dice-5" class="w-4 h-4"></i></button>`
        : '';
    const readonly = randomActive ? 'disabled' : '';
    return `<div class="rh-preview-field"><div class="rh-preview-label">${label}</div><div class="rh-preview-random-row" style="${randomButton ? '' : 'grid-template-columns:1fr'}"><input ${readonly} type="${kind === 'NUMBER' ? 'number' : 'text'}" value="${escapeAttr(value)}" placeholder="${kind === 'NUMBER' && randomActive ? '随机数' : ''}" data-action="updateRhPreviewValue" data-action-args='${escapeAttr(JSON.stringify([key]))}' data-action-value="true" data-action-value-type="${kind === 'NUMBER' ? 'float' : 'text'}">${randomButton}</div></div>`;
}
function renderRhPreviewMedia(url, kind, name=''){
    const safe = escapeAttr(url || '');
    if(kind === 'VIDEO') return `<video src="${safe}" muted preload="metadata" playsinline controls></video>`;
    if(kind === 'AUDIO') return `<span class="rh-preview-audio"><i data-lucide="file-audio" class="w-5 h-5"></i>${escapeHtml(name || '音频')}</span><audio src="${safe}" controls preload="metadata"></audio>`;
    return `<img src="${safe}" alt="">`;
}
function mediaAcceptForRhKind(kind){
    if(kind === 'VIDEO') return 'video/*';
    if(kind === 'AUDIO') return 'audio/*';
    return 'image/*';
}
async function pickRhPreviewMedia(key, kind){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = mediaAcceptForRhKind(kind);
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if(!file) return;
        const localUrl = URL.createObjectURL(file);
        rhWorkflowEditorState.previewParams[key] = {...(rhWorkflowEditorState.previewParams[key] || {}), url:localUrl, name:file.name, uploading:true};
        renderRhMappedPreview();
        const form = new FormData();
        form.append('files', file);
        try {
            const data = await MediaForgeUpload.upload(form);
            const uploaded = data.files?.[0];
            rhWorkflowEditorState.previewParams[key] = {
                ...(rhWorkflowEditorState.previewParams[key] || {}),
                url:uploaded?.url || localUrl,
                name:uploaded?.name || file.name,
                kind:uploaded?.kind || kind.toLowerCase(),
                uploading:false
            };
            withRhEditorScrollPreserved(() => renderRhMappedPreview());
        } catch(err) {
            rhWorkflowEditorState.previewParams[key] = {...(rhWorkflowEditorState.previewParams[key] || {}), uploading:false};
            withRhEditorScrollPreserved(() => renderRhMappedPreview());
            rhNotice(err.message || '上传失败', 'error');
        }
    });
    input.click();
}
function toggleRhPreviewRandom(key){
    const state = rhWorkflowEditorState.previewParams[key] || {};
    const field = (rhWorkflowEditorState.config?.fields || []).find(item => rhWorkflowFieldKey(item) === key);
    rhWorkflowEditorState.previewParams[key] = {
        ...state,
        value:state.value ?? field?.fieldValue ?? '',
        randomActive:state.randomActive === false
    };
    withRhEditorScrollPreserved(() => renderRhMappedPreview());
}
function updateRhPreviewValue(key, value){
    const state = rhWorkflowEditorState.previewParams[key] || {};
    rhWorkflowEditorState.previewParams[key] = {...state, value, randomActive:false};
}
function rhPreviewRandomValue(field){
    const isFloat = Number(field.step) > 0 && Number(field.step) < 1;
    let min = Number.isFinite(Number(field.min)) ? Number(field.min) : null;
    let max = Number.isFinite(Number(field.max)) ? Number(field.max) : null;
    const name = `${field.fieldName || ''} ${field.label || ''}`.toLowerCase();
    const looksSeed = name.includes('seed') || name.includes('noise') || name.includes('随机') || name.includes('种子');
    if(min === null) min = looksSeed ? 1 : 0;
    if(max === null || max <= min) max = looksSeed ? 1000000000000000 : 999999;
    const value = min + Math.random() * (max - min);
    if(isFloat){
        const precision = Math.min(8, Math.max(1, String(field.step).split('.')[1]?.length || 2));
        return Number(value.toFixed(precision));
    }
    return Math.floor(value);
}
async function rhPreviewUploadValueIfNeeded(value){
    const text = String(value || '').trim();
    if(!text) return '';
    if(!/^https?:\/\//i.test(text) && !text.startsWith('/output/') && !text.startsWith('/assets/')) return text;
    const data = await rhRuntimeApiJson('/api/runninghub/upload-asset', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({url:text, connection_id:rhWorkflowEditorState.connectionId || '', resource_id:rhWorkflowEditorState.resourceId || ''})
    });
    if(data.success === false) throw new Error(data.detail || data.error || 'RunningHub 素材上传失败');
    return data.data?.fileName || text;
}
// Mirrors the canvas request: every parameter is sent. Exposed ones use the value
// entered in the preview; parameters not exposed on the canvas use their saved default.
async function buildRhPreviewNodeInfoList(){
    const config = rhWorkflowEditorState.config;
    const fields = rhEditorSortedFields(config?.fields || []);
    const result = [];
    for(const field of fields){
        if(!field?.fieldName) continue;
        const key = rhWorkflowFieldKey(field);
        const kind = rhWorkflowFieldKind(field);
        const exposed = field.enabled === true;
        const preview = exposed ? (rhWorkflowEditorState.previewParams[key] || {}) : {};
        let value = preview.value ?? field.fieldValue ?? '';
        if(['IMAGE','VIDEO','AUDIO'].includes(kind)){
            value = await rhPreviewUploadValueIfNeeded(preview.url || value);
        } else if(exposed && kind === 'NUMBER' && field.random_enabled === true && preview.randomActive !== false) {
            value = rhPreviewRandomValue(field);
        } else if(['NUMBER','SLIDER'].includes(kind) && String(value ?? '').trim() !== '' && !Number.isNaN(Number(value))) {
            value = Number(value);
        }
        if(typeof value === 'string' && /[\r\n]/.test(value)) value = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || '';
        result.push({nodeId:field.nodeId, fieldName:field.fieldName, fieldValue:value});
    }
    return result;
}
async function testRhMappedPreview(){
    const config = rhWorkflowEditorState.config;
    if(!config || rhWorkflowEditorState.previewRunning) return;
    rhWorkflowEditorState.previewRunning = true;
    rhWorkflowEditorState.previewStatus = '正在提交 RunningHub 任务...';
    rhWorkflowEditorState.previewOutputs = [];
    renderRhMappedPreview();
    try {
        const nodeInfoList = await buildRhPreviewNodeInfoList();
        const body = {webappId:String(config.appId || '').trim(), nodeInfoList};
        if(!body.webappId) throw new Error('webappId 为空');
        const submit = await rhRuntimeApiJson('/api/runninghub/submit', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(body)
        });
        if(submit.success === false) throw new Error(submit.detail || submit.error || 'RunningHub 提交失败');
        const submitData = submit.data || submit;
        const taskId = submitData.taskId;
        if(!taskId) throw new Error('RunningHub 没有返回 taskId');
        rhWorkflowEditorState.previewStatus = `任务已提交：${taskId}`;
        renderRhMappedPreview();
        let result = null;
        for(let i = 0; i < 720; i++){
            await new Promise(resolve => setTimeout(resolve, 2500));
            const response = await rhRuntimeApiJson(`/api/runninghub/query?taskId=${encodeURIComponent(taskId)}`);
            if(response.success === false) throw new Error(response.detail || response.error || 'RunningHub 查询失败');
            const data = response.data || response;
            if(data.status === 'SUCCESS'){
                result = data;
                break;
            }
            if(data.status === 'FAILED') throw new Error(data.failReason || 'RunningHub 任务失败');
            rhWorkflowEditorState.previewStatus = data.status === 'QUEUED' ? '排队中...' : '运行中...';
            renderRhMappedPreview();
        }
        if(!result) throw new Error('RunningHub 任务超时');
        const outputs = result.urls || [];
        if(!outputs.length) throw new Error('RunningHub 没有返回产物');
        rhWorkflowEditorState.previewOutputs = outputs;
        rhWorkflowEditorState.previewStatus = '测试完成';
        setStatus('RunningHub 测试完成');
    } catch(err) {
        rhWorkflowEditorState.previewStatus = err.message || String(err);
        setStatus(rhWorkflowEditorState.previewStatus);
        rhNotice(rhWorkflowEditorState.previewStatus, 'error');
    } finally {
        rhWorkflowEditorState.previewRunning = false;
        renderRhMappedPreview();
    }
}
function renderRhEditorSourcePane(){
    renderRhAppFieldCards();
}
// ---- Field list / detail (in-page, no floating window) -------------------
// UI-only state lives on rhWorkflowEditorState: fieldQuery, fieldKindFilter,
// onlyEnabled, rightTab ('config' | 'preview').
var RH_KIND_FILTERS = [
    {value:'all', label:'全部'},
    {value:'MEDIA', label:'媒体', kinds:['IMAGE','VIDEO','AUDIO']},
    {value:'TEXT', label:'文本', kinds:['TEXT','PROMPT']},
    {value:'PARAM', label:'参数', kinds:['NUMBER','SLIDER','SELECT','BOOLEAN']}
];
var RH_KIND_ICON = {IMAGE:'image', VIDEO:'video', AUDIO:'music', PROMPT:'message-square-text', TEXT:'type', NUMBER:'hash', SLIDER:'sliders-horizontal', SELECT:'list', BOOLEAN:'toggle-right'};
function rhFieldMatchesFilter(field){
    const state = rhWorkflowEditorState;
    if(state.onlyEnabled && field.enabled !== true) return false;
    const filter = RH_KIND_FILTERS.find(item => item.value === (state.fieldKindFilter || 'all'));
    if(filter?.kinds && !filter.kinds.includes(rhWorkflowFieldKind(field))) return false;
    const q = String(state.fieldQuery || '').trim().toLowerCase();
    if(!q) return true;
    return `${field.label} ${field.fieldName} ${field.nodeId} ${field.note}`.toLowerCase().includes(q);
}
function rhVisibleFields(){
    return (rhWorkflowEditorState.config?.fields || []).filter(rhFieldMatchesFilter);
}
function renderRhWorkflowEditorSummary(){
    const config = rhWorkflowEditorState.config;
    if(!config || !rhWorkflowEditorSummary) return;
    const fields = config.fields || [];
    const enabled = fields.filter(field => field.enabled === true);
    const count = kinds => enabled.filter(field => kinds.includes(rhWorkflowFieldKind(field))).length;
    rhWorkflowEditorSummary.innerHTML = `
        <div class="rh-stat rh-stat-main"><strong>${enabled.length}<small> / ${fields.length}</small></strong><span>已暴露到画布</span></div>
        <div class="rh-stat"><strong>${count(['IMAGE','VIDEO','AUDIO'])}</strong><span>媒体输入</span></div>
        <div class="rh-stat"><strong>${count(['TEXT','PROMPT'])}</strong><span>文本</span></div>
        <div class="rh-stat"><strong>${enabled.length - count(['IMAGE','VIDEO','AUDIO','TEXT','PROMPT'])}</strong><span>参数</span></div>
    `;
}
function renderRhFieldPicker(field){
    const key = rhWorkflowFieldKey(field);
    const kind = rhWorkflowFieldKind(field);
    const on = field.enabled === true;
    const active = rhWorkflowEditorState.activeFieldKey === key;
    return `
        <div class="rh-field-row ${on ? 'is-on' : 'is-off'} ${active ? 'is-active' : ''}" data-field-key="${escapeAttr(key)}" role="button" tabindex="0" aria-pressed="${active}" data-action="openRhAppFieldPopover" data-action-arg="${escapeAttr(key)}">
            <span class="rh-field-icon kind-${kind.toLowerCase()}"><i data-lucide="${RH_KIND_ICON[kind] || 'type'}" class="w-4 h-4"></i></span>
            <span class="rh-field-main">
                <strong>${escapeHtml(field.label || field.fieldName)}</strong>
                <small>${escapeHtml(field.fieldName)} · ${escapeHtml(rhWorkflowFieldTypeLabel(kind))}</small>
            </span>
            <button class="rh-switch" type="button" role="switch" aria-checked="${on}" aria-label="${on ? '取消暴露' : '暴露到画布'} ${escapeAttr(field.label || field.fieldName)}" data-stop-propagation data-action="toggleRhWorkflowEditorField" data-action-arg="${escapeAttr(key)}"><span></span></button>
        </div>`;
}
function renderRhFieldToolbar(){
    const state = rhWorkflowEditorState;
    const fields = state.config?.fields || [];
    const visible = rhVisibleFields();
    const onCount = fields.filter(field => field.enabled === true).length;
    const allVisibleOn = visible.length > 0 && visible.every(field => field.enabled === true);
    return `
        <div class="rh-toolbar">
            <label class="rh-search"><i data-lucide="search" class="w-4 h-4"></i><input id="rhFieldSearch" type="search" value="${escapeAttr(state.fieldQuery || '')}" placeholder="搜索参数名称" aria-label="搜索参数" autocomplete="off" spellcheck="false" data-action="setRhFieldQuery"></label>
            <div class="rh-chips" role="group" aria-label="按类型筛选">
                ${RH_KIND_FILTERS.map(item => `<button type="button" class="rh-chip" aria-pressed="${(state.fieldKindFilter || 'all') === item.value}" data-action="setRhFieldKindFilter" data-action-arg="${item.value}">${item.label}</button>`).join('')}
                <button type="button" class="rh-chip" aria-pressed="${state.onlyEnabled === true}" data-action="toggleRhOnlyEnabled">仅已启用 <span class="rh-chip-count">${onCount}</span></button>
            </div>
            <div class="rh-bulk">
                <button type="button" class="rh-link" data-action="setRhVisibleFieldsEnabled" data-action-arg="${allVisibleOn ? 'false' : 'true'}" ${visible.length ? '' : 'disabled'}>${allVisibleOn ? '取消全选' : '全选'}${(state.fieldQuery || state.fieldKindFilter && state.fieldKindFilter !== 'all' || state.onlyEnabled) ? '当前结果' : ''}</button>
            </div>
        </div>`;
}
function renderRhFieldList(){
    const visible = rhVisibleFields();
    if(!(rhWorkflowEditorState.config?.fields || []).length) return '<div class="rh-editor-empty">没有拉取到应用参数。可点击右上角「重新拉取」，或导入参数 JSON。</div>';
    if(!visible.length) return '<div class="rh-editor-empty">没有匹配的参数。<button type="button" class="rh-link" data-action="clearRhFieldFilters">清除筛选</button></div>';
    return `<div class="rh-field-list">${rhEditorSortedFields(visible).map(renderRhFieldPicker).join('')}</div>`;
}
function renderRhAppFieldCards(){
    const config = rhWorkflowEditorState.config;
    if(!rhWorkflowEditorGraphWrap || !config) return;
    rhWorkflowEditorGraphWrap.classList.add('rh-app-field-wrap');
    const tab = rhWorkflowEditorState.rightTab === 'preview' ? 'preview' : 'config';
    rhWorkflowEditorGraphWrap.innerHTML = `
        <div class="rh-app-layout">
            <section class="rh-fields-pane" aria-label="参数列表">
                <div id="rhFieldToolbar">${renderRhFieldToolbar()}</div>
                <div id="rhFieldListHost">${renderRhFieldList()}</div>
            </section>
            <aside class="rh-side-pane">
                <div class="rh-tabs" role="tablist">
                    <button type="button" role="tab" class="rh-tab" aria-selected="${tab === 'config'}" data-action="setRhRightTab" data-action-arg="config">参数配置</button>
                    <button type="button" role="tab" class="rh-tab" aria-selected="${tab === 'preview'}" data-action="setRhRightTab" data-action-arg="preview">画布效果与测试</button>
                </div>
                <div id="rhNodePopover" class="rh-app-detail is-empty" ${tab === 'config' ? '' : 'hidden'} aria-live="polite"></div>
                <div id="rhPreviewPane" class="rh-preview-pane" ${tab === 'preview' ? '' : 'hidden'}></div>
            </aside>
        </div>
    `;
    const activeKey = rhWorkflowEditorState.activeFieldKey;
    if(activeKey && (config.fields || []).some(field => rhWorkflowFieldKey(field) === activeKey)) openRhAppFieldPopover(activeKey);
    else renderRhFieldDetailEmpty();
    renderRhMappedPreview();
    refreshIcons();
}
// Re-render the list and the toolbar controls, but never replace the search
// <input> itself: swapping it out mid-typing drops focus and the next keystrokes.
function refreshRhFieldList(){
    const toolbar = document.getElementById('rhFieldToolbar');
    const host = document.getElementById('rhFieldListHost');
    if(!toolbar || !host) return;
    const search = toolbar.querySelector('#rhFieldSearch');
    if(search){
        if(search.value !== (rhWorkflowEditorState.fieldQuery || '')) search.value = rhWorkflowEditorState.fieldQuery || '';
        const holder = document.createElement('div');
        holder.innerHTML = renderRhFieldToolbar();
        // swap only the chips + bulk controls, keep the existing search box
        toolbar.querySelector('.rh-chips').replaceWith(holder.querySelector('.rh-chips'));
        toolbar.querySelector('.rh-bulk').replaceWith(holder.querySelector('.rh-bulk'));
    } else {
        toolbar.innerHTML = renderRhFieldToolbar();
    }
    host.innerHTML = renderRhFieldList();
    renderRhWorkflowEditorSummary();
    refreshIcons();
}
function setRhFieldQuery(value){ rhWorkflowEditorState.fieldQuery = String(value || ''); refreshRhFieldList(); }
function setRhFieldKindFilter(value){ rhWorkflowEditorState.fieldKindFilter = String(value || 'all'); refreshRhFieldList(); }
function toggleRhOnlyEnabled(){ rhWorkflowEditorState.onlyEnabled = rhWorkflowEditorState.onlyEnabled !== true; refreshRhFieldList(); }
function clearRhFieldFilters(){
    Object.assign(rhWorkflowEditorState, {fieldQuery:'', fieldKindFilter:'all', onlyEnabled:false});
    refreshRhFieldList();
}
function setRhVisibleFieldsEnabled(enabled){
    const config = rhWorkflowEditorState.config;
    if(!config) return;
    const keys = new Set(rhVisibleFields().map(rhWorkflowFieldKey));
    if(!keys.size) return;
    config.fields = config.fields.map(field => keys.has(rhWorkflowFieldKey(field)) ? {...field, enabled:enabled === true} : field);
    rhNotifyFieldsChanged();
    refreshRhFieldList();
    renderRhMappedPreview();
    const active = rhWorkflowEditorState.activeFieldKey;
    if(active) openRhAppFieldPopover(active);
    rhNotice(`已${enabled === true ? '暴露' : '取消暴露'} ${keys.size} 个参数`, 'success');
}
function setRhRightTab(tab){
    rhWorkflowEditorState.rightTab = tab === 'preview' ? 'preview' : 'config';
    document.querySelectorAll('.rh-tab').forEach(el => el.setAttribute('aria-selected', String(el.dataset.actionArg === rhWorkflowEditorState.rightTab)));
    const detail = document.getElementById('rhNodePopover');
    const preview = document.getElementById('rhPreviewPane');
    if(detail) detail.hidden = rhWorkflowEditorState.rightTab !== 'config';
    if(preview) preview.hidden = rhWorkflowEditorState.rightTab !== 'preview';
}
function rhNotifyFieldsChanged(){
    // The embedding page treats edits inside the iframe as "unsaved".
    try { window.parent?.postMessage({type:'workflow-dirty'}, location.origin); } catch(e) { /* standalone */ }
}

// Inline, non-blocking feedback (replaces window.alert).
var rhNoticeTimer = 0;
function rhNotice(text, kind='info'){
    const el = document.getElementById('rhEditorNotice');
    if(!el){ setStatus(text); return; }
    el.textContent = text || '';
    el.dataset.kind = kind;
    el.hidden = !text;
    clearTimeout(rhNoticeTimer);
    if(text && kind !== 'error') rhNoticeTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function rhFieldHint(kind){
    return ({
        IMAGE:'画布上显示为图片上传位，按「图片顺序」依次接收上游图片。',
        VIDEO:'画布上显示为视频上传位。',
        AUDIO:'画布上显示为音频上传位。',
        PROMPT:'画布上显示为多行提示词输入框。',
        TEXT:'画布上显示为单行文本输入。',
        NUMBER:'画布上显示为数字输入，可开启随机数。',
        SLIDER:'画布上显示为滑块，需设置最小/最大/步长。',
        SELECT:'画布上显示为下拉框，选项每行一个。',
        BOOLEAN:'画布上显示为开关。'
    })[kind] || '';
}
function renderRhWorkflowEditorField(field){
    const key = rhWorkflowFieldKey(field);
    const type = rhWorkflowFieldKind(field);
    const on = field.enabled === true;
    const isMedia = ['IMAGE','VIDEO','AUDIO'].includes(type);
    const optionsText = Array.isArray(field.options) ? field.options.join('\n') : '';
    const argsOf = prop => escapeAttr(JSON.stringify([key, prop]));
    const input = (prop, value, attrs='') => `data-action="updateRhWorkflowEditorField" data-action-args='${argsOf(prop)}' data-action-value="true" ${attrs}`;
    const num = (prop, label, value) => `<label class="rh-mini"><span>${label}</span><input type="number" value="${escapeAttr(value ?? '')}" ${input(prop, value, 'data-action-value-type="float"')}></label>`;
    const showRange = ['NUMBER','SLIDER'].includes(type);
    const showOptions = type === 'SELECT';
    const showRandom = type === 'NUMBER';
    return `
        <div class="rh-detail-section rh-detail-expose">
            <div>
                <strong>暴露到画布</strong>
                <small>${on ? '已暴露，用户可在画布节点上修改' : '未暴露：画布上不显示，运行时发送下方默认值'}</small>
            </div>
            <button class="rh-switch" type="button" role="switch" aria-checked="${on}" aria-label="暴露到画布" data-action="toggleRhWorkflowEditorField" data-action-arg="${escapeAttr(key)}"><span></span></button>
        </div>
        <div class="rh-detail-fields ${on ? '' : 'is-dim'}">
            <label class="rh-field"><span>显示名称</span><input type="text" value="${escapeAttr(field.label || '')}" placeholder="${escapeAttr(field.fieldName)}" ${input('label')}></label>
            <label class="rh-field"><span>控件类型</span>
                <select ${input('fieldType')}>
                    ${['TEXT','PROMPT','NUMBER','SLIDER','BOOLEAN','SELECT','IMAGE','VIDEO','AUDIO'].map(option => `<option value="${option}" ${type === option ? 'selected' : ''}>${rhWorkflowFieldTypeLabel(option)}</option>`).join('')}
                </select>
                <small class="rh-hint">${escapeHtml(rhFieldHint(type))}</small>
            </label>
            ${isMedia ? `<div class="rh-grid-2">
                <label class="rh-mini"><span>图片顺序</span><input type="number" min="1" step="1" value="${escapeAttr(field.imageOrder || '')}" placeholder="自动" ${input('imageOrder', field.imageOrder, 'data-action-value-type="number"')}></label>
                <div class="rh-mini"><span>必填</span><button class="rh-switch" type="button" role="switch" aria-checked="${field.required === true}" aria-label="必填" data-action="updateRhWorkflowEditorField" data-action-args='${escapeAttr(JSON.stringify([key, 'required', field.required !== true]))}'><span></span></button></div>
            </div>` : ''}
            ${showOptions ? `<label class="rh-field"><span>下拉选项</span><textarea rows="4" placeholder="每行一个，例如 1024x1024" ${input('options')}>${escapeHtml(optionsText)}</textarea></label>` : ''}
            ${showRange ? `<div class="rh-grid-3">${num('min','最小值',field.min)}${num('max','最大值',field.max)}${num('step','步长',field.step)}</div>` : ''}
            ${showRandom ? `<div class="rh-detail-inline"><div><strong>随机数</strong><small>每次运行自动生成范围内的随机值</small></div><button class="rh-switch" type="button" role="switch" aria-checked="${field.random_enabled === true}" aria-label="随机数" data-action="updateRhWorkflowEditorField" data-action-args='${escapeAttr(JSON.stringify([key, 'random_enabled', field.random_enabled !== true]))}'><span></span></button></div>` : ''}
            <label class="rh-field"><span>默认值</span><input type="text" value="${escapeAttr(field.fieldValue)}" ${input('fieldValue')}><small class="rh-hint">${on ? '用户未修改时使用此值。' : '参数未暴露时，运行会直接发送此值。'}</small></label>
            <div class="rh-meta-line"><span>节点 ${escapeHtml(field.nodeId || '—')}</span><span>字段 ${escapeHtml(field.fieldName)}</span></div>
        </div>`;
}
function openRhAppFieldPopover(key){
    const config = rhWorkflowEditorState.config;
    const field = (config?.fields || []).find(item => rhWorkflowFieldKey(item) === key);
    const panel = document.getElementById('rhNodePopover');
    if(!field || !panel) return;
    rhWorkflowEditorState.activeFieldKey = String(key || '');
    document.querySelectorAll('.rh-field-row').forEach(el => {
        const on = el.dataset.fieldKey === String(key || '');
        el.classList.toggle('is-active', on);
        el.setAttribute('aria-pressed', String(on));
    });
    panel.dataset.fieldKey = String(key || '');
    panel.classList.remove('is-empty');
    // Selecting a field while looking at the preview tab switches back to its settings.
    if(rhWorkflowEditorState.rightTab === 'preview') setRhRightTab('config');
    panel.innerHTML = `
        <div class="rh-popover-head">
            <div><strong>${escapeHtml(field.label || field.fieldName)}</strong><span>${escapeHtml(field.fieldName)}</span></div>
            <button type="button" data-action="closeRhNodePopover" aria-label="取消选择"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
        </div>
        <div class="rh-popover-body">${renderRhWorkflowEditorField(field)}</div>
    `;
    refreshIcons();
}

function renderRunningHubCards(){
    const item = runningHubState();
    if(!item || item.id !== 'runninghub'){
        if(rhAppsList) rhAppsList.innerHTML = '';
        return;
    }
    ensureRunningHubLists(item);
    const apps = item.rh_apps.map((entry, index) => ({...entry, _rhIndex:index})).filter(entry => entry?.hidden !== true);
    if(rhAppsCount) rhAppsCount.textContent = apps.length;
    renderRhEntryList(rhAppsList, apps, 'app');
    refreshIcons();
}
function renderRhEntryThumbnail(kind, entry){
    const icon = 'sparkles';
    const thumbnail = String(entry?.thumbnail || '').trim();
    if(!thumbnail) return `<i data-lucide="${icon}" class="w-5 h-5"></i>`;
    return `<img src="${escapeAttr(thumbnail)}" alt="">`;
}
function renderRhEntryList(target, list, kind){
    if(!target) return;
    if(!list.length){
        target.innerHTML = `<div class="rh-empty">粘贴 /run/ai-app/... 后点击创建 AI 应用卡片</div>`;
        return;
    }
    target.innerHTML = list.map((entry, index) => `
        <div class="rh-config-card">
            <button class="rh-thumb" type="button" data-action="pickRhThumbnail" data-action-args='${escapeAttr(JSON.stringify([kind, entry._rhIndex ?? index]))}' title="上传缩略图">
                ${renderRhEntryThumbnail(kind, entry)}
            </button>
            <div class="rh-card-main">
                <label class="rh-card-title-field">
                    <span>名称</span>
                    <input type="text" value="${escapeAttr(entry.title || '')}" data-action="updateRhEntry" data-action-args='${escapeAttr(JSON.stringify([kind, entry._rhIndex ?? index, 'title']))}' data-action-value="true" placeholder="AI 应用名称">
                </label>
                <div class="rh-id-line"><i data-lucide="hash" class="w-3 h-3"></i><span>/run/ai-app/${escapeHtml(entry.id)}</span></div>
                <label class="model-enabled-toggle" data-stop-propagation><input type="checkbox" ${entry.enabled !== false ? 'checked' : ''} data-action="updateRhEntry" data-action-args='${escapeAttr(JSON.stringify([kind, entry._rhIndex ?? index, 'enabled']))}' data-action-value="true"><span>启用</span></label>
                <textarea data-action="updateRhEntry" data-action-args='${escapeAttr(JSON.stringify([kind, entry._rhIndex ?? index, 'note']))}' data-action-value="true" placeholder="备注、用途、参数说明">${escapeHtml(entry.note || '')}</textarea>
            </div>
            <div class="rh-card-actions">
                <button class="rh-card-action" type="button" data-action="openRhAppEditor" data-action-arg="${entry._rhIndex ?? index}" title="编辑应用参数"><i data-lucide="settings-2" class="w-3.5 h-3.5"></i></button>
                <button class="rh-card-action danger" type="button" data-action="removeRhEntry" data-action-args='${escapeAttr(JSON.stringify([kind, entry._rhIndex ?? index]))}' title="删除"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </div>
        </div>
    `).join('');
}

window.dispatchEvent(new Event('rh-workflow-editor-ready'));
