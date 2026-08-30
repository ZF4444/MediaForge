const apiSettingsQuery = new URLSearchParams(window.location.search);
const isRunningHubAppsPage = apiSettingsQuery.get('mode') === 'runninghub-apps';
const isEmbeddedApiSettings = apiSettingsQuery.get('embedded') === '1';
if(isRunningHubAppsPage) document.body.classList.add('runninghub-apps-page');
if(isEmbeddedApiSettings) document.body.classList.add('embedded-api-settings');

let providers = [];
let providersVersion = null;
let selectedId = '';
let selectedModel = { providerId:'', kind:'', name:'', index:-1 };
const providerList = document.getElementById('providerList');
const editorTitle = document.getElementById('editorTitle');
const statusEl = document.getElementById('status');
// Kept as a hidden compatibility hook for embedded settings scripts. Provider
// names are deprecated and this value is never rendered or submitted.
const nameInput = document.getElementById('nameInput');
const idInput = document.getElementById('idInput');
const connectionProviderField = document.getElementById('connectionProviderField');
const connectionProviderSelect = document.getElementById('connectionProviderSelect');
const baseInput = document.getElementById('baseInput');
const protocolInput = document.getElementById('protocolInput');
const keyInput = document.getElementById('keyInput');
const keyHint = document.getElementById('keyHint');
const rhFreeKeyInput = document.getElementById('rhFreeKeyInput');
const rhFreeKeyHint = document.getElementById('rhFreeKeyHint');
const volcArkKeyHint = document.getElementById('volcArkKeyHint');
const volcAkInput = document.getElementById('volcAkInput');
const volcSkInput = document.getElementById('volcSkInput');
const volcAssetKeyHint = document.getElementById('volcAssetKeyHint');
const volcProjectInput = document.getElementById('volcProjectInput');
const volcRegionInput = document.getElementById('volcRegionInput');
const runninghubConfigBlock = document.getElementById('runninghubConfigBlock');
const rhPasteInput = document.getElementById('rhPasteInput');
const rhAppsList = document.getElementById('rhAppsList');
const rhAppsCount = document.getElementById('rhAppsCount');
const settingsContent = document.getElementById('settingsContent');
const providerOnboardingCard = document.getElementById('providerOnboardingCard');
const rhWorkflowEditorOverlay = document.getElementById('rhWorkflowEditorOverlay');
const rhWorkflowEditorTitle = document.getElementById('rhWorkflowEditorTitle');
const rhWorkflowEditorSub = document.getElementById('rhWorkflowEditorSub');
const rhWorkflowSaveBtn = document.getElementById('rhWorkflowSaveBtn');
const rhWorkflowEditName = document.getElementById('rhWorkflowEditName');
const rhWorkflowEditNote = document.getElementById('rhWorkflowEditNote');
const rhWorkflowEditorSummary = document.getElementById('rhWorkflowEditorSummary');
const rhWorkflowEditorNodeList = document.getElementById('rhWorkflowEditorNodeList');
const rhWorkflowEditorGraphWrap = document.getElementById('rhWorkflowEditorGraphWrap');
const imageModelList = document.getElementById('imageModelList');
const chatModelList = document.getElementById('chatModelList');
const videoModelList = document.getElementById('videoModelList');
const modelConfigBlock = document.getElementById('modelConfigBlock');
const selectedModelInput = document.getElementById('selectedModelInput');
const selectedModelIdField = document.getElementById('selectedModelIdField');
const selectedModelAliasInput = document.getElementById('selectedModelAliasInput');
const selectedModelProtocol = document.getElementById('selectedModelProtocol');
const selectedModelProtocolField = document.getElementById('selectedModelProtocolField');
const selectedModelPriceFields = document.getElementById('selectedModelPriceFields');
const selectedModelInputPrice = document.getElementById('selectedModelInputPrice');
const selectedModelOutputPrice = document.getElementById('selectedModelOutputPrice');
const parameterSchemaBlock = document.getElementById('parameterSchemaBlock');
const parameterSchemaEditor = document.getElementById('parameterSchemaEditor');
const parameterSchemaImport = document.getElementById('parameterSchemaImport');
const VOLCENGINE_DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const VOLCENGINE_DEFAULT_PROJECT_NAME = 'default';
const VOLCENGINE_DEFAULT_REGION = 'cn-beijing';
const RH_DEFAULT_BASE_URL = 'https://www.runninghub.cn';
const EXAMPLE_BASE_URL = 'https://api.example.com/v1';
let canvasSchemaDefinitions = {image:{fields:[]}, video:{fields:[]}};
const SCHEMA_OVERRIDE_KEYS = new Set(['id','name','default','options','option_labels','min','max','step']);
const ONBOARDING_GUIDES = {
    runninghub:{
        titleKey:'api.rhOnboardingTitle',
        descKey:'api.rhOnboardingDesc',
        primaryLabelKey:'api.rhGetKeyCn',
        secondaryLabelKey:'api.rhGetKeyGlobal',
        primaryUrl:'https://www.runninghub.cn/enterprise-api/consumerApi?inviteCode=rh-v1331',
        secondaryUrl:'https://www.runninghub.ai/enterprise-api/consumerApi?inviteCode=rh-v1331'
    }
};
let rhWorkflowEditorState = { open:false, index:-1, entry:null, config:null, expanded:{}, activeNodeId:'', graph:{ k:1, x:0, y:0, w:0, h:0 }, pan:null, bound:false, previewParams:{}, previewRunning:false, previewStatus:'', previewOutputs:[] };
let providerDragId = '';
function normalizeRhEntries(values){
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map(raw => {
        const id = String(raw?.id || raw?.appId || '').trim();
        if(!id || seen.has(id)) return null;
        seen.add(id);
        return {...raw, id, appId:id, title:String(raw?.title || raw?.name || `AI 应用 ${id.slice(-6)}`), note:String(raw?.note || raw?.description || ''), enabled:raw?.enabled !== false};
    }).filter(Boolean);
}
function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
function tr(key){ return window.StudioI18n ? window.StudioI18n.t(key) : key; }
function trf(key, vars={}){
    let text = tr(key);
    Object.entries(vars).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, String(value ?? ''));
    });
    return text;
}
function setStatus(text){ statusEl.textContent = text || ''; }
function broadcastStudioApiChange(type='providers-changed'){
    const message = { type, updated_at:Date.now() };
    try { new BroadcastChannel('studio-api').postMessage(message); } catch(e) {}
    try { window.parent?.postMessage(message, '*'); } catch(e) {}
    try { window.top?.postMessage(message, '*'); } catch(e) {}
}
function normalizeId(value){
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-').slice(0, 40);
}
function provider(){
    return visibleProviders().find(item => item.id === selectedId) || visibleProviders()[0] || providers[0];
}
function isProviderTemporarilyHidden(item){
    if(isRunningHubAppsPage) return item?.id !== 'runninghub';
    return false;
}
function visibleProviders(){
    return (providers || []).filter(item => !isProviderTemporarilyHidden(item));
}
function modelKindLabel(kind){ return kind === 'image' ? '生图模型' : kind === 'video' ? '视频模型' : '聊天模型'; }
function modelKindIcon(kind){ return kind === 'image' ? 'image' : kind === 'video' ? 'film' : 'message-square'; }
function modelProtocol(item, name){
    const override = String(item?.model_protocols?.[String(name || '').trim()] || '').toLowerCase();
    return override || String(item?.protocol || 'openai').toLowerCase();
}
function activeModelProtocol(item){
    const ref = selectedModelRef();
    return ref && ref.item.id === item?.id ? modelProtocol(item, ref.name) : String(item?.protocol || 'openai').toLowerCase();
}
function providerModels(item){
    const result = [];
    [['image','image_models'],['chat','chat_models'],['video','video_models']].forEach(([kind,key]) => {
        (item?.[key] || []).forEach((name, index) => {
            const modelName = String(name || '').trim();
            result.push({providerId:item.id, kind, index, name:modelName, label:modelName || '未命名模型', protocol:modelProtocol(item, modelName), hasKey:Boolean(item.has_key)});
        });
    });
    return result;
}
function protocolLabel(protocol){
    return ({openai:'OpenAI', gemini:'Gemini', omnilojo:'Omnilojo', volcengine:'Volcengine', runninghub:'RunningHub'})[protocol] || String(protocol || 'OpenAI').toUpperCase();
}
function selectedModelRef(){
    const item = providers.find(p => p.id === selectedModel.providerId);
    if(!item) return null;
    const key = selectedModel.kind === 'image' ? 'image_models' : selectedModel.kind === 'video' ? 'video_models' : 'chat_models';
    const index = Number.isInteger(selectedModel.index) && selectedModel.index >= 0 && selectedModel.index < (item[key] || []).length
        ? selectedModel.index
        : (item[key] || []).findIndex(name => String(name || '').trim() === selectedModel.name);
    const name = index < 0 ? '' : String(item[key][index] || '').trim();
    return index < 0 || !name ? null : {item, key, index, name};
}
function connectionProviderCandidates(currentId=''){
    return visibleProviders().filter(item => isModelFirstProvider(item) && (item.enabled !== false || item.id === currentId));
}
function renderConnectionProviderSelect(ref){
    if(!connectionProviderField || !connectionProviderSelect) return;
    const visible = Boolean(ref) && !isRunningHubAppsPage;
    connectionProviderField.hidden = !visible;
    if(!visible) return;
    connectionProviderSelect.innerHTML = connectionProviderCandidates(ref.item.id).map(item =>
        `<option value="${escapeAttr(item.id)}" ${item.id === ref.item.id ? 'selected' : ''}>${escapeHtml(item.id)}</option>`
    ).join('');
}
function isFixedProvider(itemOrId){
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    return id === 'comfyui' || id === 'runninghub';
}
function isModelFirstProvider(itemOrId){
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    return id !== 'runninghub' && id !== 'comfyui';
}
function unique(values){
    const seen = new Set();
    return values.map(v => String(v || '').trim()).filter(v => v && !seen.has(v) && seen.add(v));
}
function rhFreeKeyHintText(item){
    return item?.has_key ? `${tr('api.rhKeySaved')}${item.key_env || 'API/.env'} ${item.key_preview || ''}` : tr('api.rhNoKey');
}
function volcengineArkKeyHintText(item){
    return item?.has_key ? `方舟 API Key 已保存：${item.key_env || 'API/.env'} ${item.key_preview || ''}` : '还没有保存方舟 API Key。';
}
function volcengineAssetKeyHintText(item){
    const ak = item?.has_volcengine_access_key ? `AK 已保存：${item.volcengine_access_key_env || 'API/.env'} ${item.volcengine_access_key_preview || ''}` : 'AK 未保存';
    const sk = item?.has_volcengine_secret_key ? `SK 已保存：${item.volcengine_secret_key_env || 'API/.env'} ${item.volcengine_secret_key_preview || ''}` : 'SK 未保存';
    return `${ak} · ${sk}`;
}
// [api-settings 迁移] isNewUserProvider / renderProviderOnboarding / applyProviderOnboardingDefaults / refreshProviderOnboarding 已拆分到 frontend/src/api-settings/provider-onboarding.js。
function syncEditor(){
    const item = provider();
    if(!item) return;
    // Provider ID is the stable identity; display names are deprecated.
    const nextId = item.id;
    item.id = nextId;
    const selectedProtocol = item.id === 'runninghub' ? 'runninghub' : item.id === 'volcengine' ? 'volcengine' : (item.protocol || 'openai');
    item.base_url = baseInput.value.trim();
    // 固定平台不从协议下拉读取
    item.protocol = selectedProtocol;
    item.image_generation_endpoint = '';
    item.image_edit_endpoint = '';
    item.rh_apps = normalizeRhEntries(item.rh_apps || [], 'app');
    const key = keyInput.value.trim();
    if(key) item.api_key = key;
    if(item.id === 'runninghub'){
        const freeKey = rhFreeKeyInput?.value.trim() || '';
        if(freeKey) item.api_key = freeKey;
    }
    if(item.id === 'volcengine'){
        const ak = volcAkInput?.value.trim() || '';
        const sk = volcSkInput?.value.trim() || '';
        if(ak) item.volcengine_access_key_id = ak;
        if(sk) item.volcengine_secret_access_key = sk;
        item.volcengine_project_name = (volcProjectInput?.value.trim() || VOLCENGINE_DEFAULT_PROJECT_NAME);
        item.volcengine_region = (volcRegionInput?.value.trim() || VOLCENGINE_DEFAULT_REGION);
    }
}
function updateProtocolFromInput(){
    const item = provider();
    if(!item || !protocolInput || isFixedProvider(item)) return;
    const value = activeModelProtocol(item);
    item.protocol = ['openai', 'gemini', 'omnilojo'].includes(value) ? value : 'openai';
    clearVerifyResult();
    // 不在 change 事件中整页重绘。重绘会从旧的 Provider 快照回填 select，
    // 导致 Omnilojo 刚被选中又显示成 OpenAI。
    renderModels('image');
    renderModels('chat');
    renderModels('video');
}
function isVolcengineProvider(item){
    return String(item?.protocol || '').toLowerCase() === 'volcengine';
}
function sortedProviders(){
    const fixedOrder = {runninghub: 0, comfyui: 1};
    return [...visibleProviders()].sort((a, b) => {
        const ai = fixedOrder[a.id], bi = fixedOrder[b.id];
        if(ai !== undefined || bi !== undefined) return (ai ?? 99) - (bi ?? 99);
        return String(a.id || '').localeCompare(String(b.id || ''), undefined, {numeric:true, sensitivity:'base'});
    });
}
function providerDragAttrs(item){
    if(isFixedProvider(item)) return '';
    const id = escapeAttr(item.id);
    return ` draggable="true" data-provider-id="${id}" ondragstart="handleProviderDragStart(event,'${id}')" ondragover="handleProviderDragOver(event,'${id}')" ondrop="handleProviderDrop(event,'${id}')" ondragend="handleProviderDragEnd()"`;
}
function renderProviderList(){
    providerList.innerHTML = sortedProviders().map(item => {
        const active = item.id === selectedId ? 'active' : '';
        const stateClass = item.enabled === false ? 'is-disabled' : (item.has_key ? 'has-key' : 'missing-key');
        const fixed = isFixedProvider(item);
        const count = (item.image_models || []).length + (item.chat_models || []).length + (item.video_models || []).length;
        const detail = item.id === 'runninghub' ? 'AI 应用' : item.id === 'comfyui' ? '本地工作流' : `${count} 个模型`;
        const protocol = item.id === 'runninghub' ? 'RunningHub' : item.id === 'comfyui' ? 'Local' : protocolLabel(item.protocol);
        return `<button class="provider-card provider-card-sortable ${active} ${stateClass}" type="button" onclick="selectProvider('${escapeAttr(item.id)}')" ${providerDragAttrs(item)}>
            <span class="provider-drag-handle">${fixed ? '' : '<i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i>'}</span>
            <span class="provider-mark"><i data-lucide="${item.id === 'runninghub' ? 'sparkles' : item.id === 'comfyui' ? 'box' : item.id === 'volcengine' ? 'flame' : 'plug-zap'}" class="w-3.5 h-3.5"></i></span>
            <span class="provider-info"><span class="provider-name">${escapeHtml(item.id)}</span><span class="provider-meta">${escapeHtml(detail)}</span></span>
            <span class="provider-protocol-badge">${escapeHtml(protocol)}</span>
            <span class="provider-status-dot ${item.enabled === false ? 'disabled' : ''}"></span>
        </button>`;
    }).join('');
    refreshIcons();
}
function handleProviderDragStart(event, id){
    const item = providers.find(provider => provider.id === id);
    if(!item || isFixedProvider(item)){
        event.preventDefault();
        return;
    }
    providerDragId = id;
    event.currentTarget.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
}
function handleProviderDragOver(event, id){
    if(!providerDragId || providerDragId === id || isFixedProvider(id)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    providerList?.querySelectorAll('.provider-card-drop-target').forEach(el => el.classList.remove('provider-card-drop-target'));
    event.currentTarget.classList.add('provider-card-drop-target');
}
function handleProviderDrop(event, targetId){
    event.preventDefault();
    providerList?.querySelectorAll('.provider-card-drop-target').forEach(el => el.classList.remove('provider-card-drop-target'));
    const sourceId = providerDragId || event.dataTransfer.getData('text/plain');
    providerDragId = '';
    if(!sourceId || sourceId === targetId || isFixedProvider(sourceId) || isFixedProvider(targetId)) return;
    const sourceIndex = providers.findIndex(item => item.id === sourceId);
    const targetIndex = providers.findIndex(item => item.id === targetId);
    if(sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = providers.splice(sourceIndex, 1);
    const adjustedTargetIndex = providers.findIndex(item => item.id === targetId);
    providers.splice(adjustedTargetIndex, 0, moved);
    renderProviderList();
    saveProviders();
}
function handleProviderDragEnd(){
    providerDragId = '';
    providerList?.querySelectorAll('.is-dragging,.provider-card-drop-target').forEach(el => {
        el.classList.remove('is-dragging', 'provider-card-drop-target');
    });
}
function renderEditor(){
    const item = provider();
    if(!item) return;
    const selectedRef = selectedModelRef();
    if(selectedModelIdField) selectedModelIdField.hidden = !selectedRef;
    if(selectedModelProtocolField) selectedModelProtocolField.hidden = !selectedRef;
    editorTitle.textContent = item.id;
    const enabledToggle = document.getElementById('enabledToggle');
    if(enabledToggle) enabledToggle.checked = item.enabled !== false;
    idInput.value = item.id || '';
    clearVerifyResult();
    baseInput.placeholder = EXAMPLE_BASE_URL;
    baseInput.value = item.base_url || '';
    if(protocolInput) protocolInput.value = activeModelProtocol(item);
    keyInput.value = '';
    keyInput.placeholder = item.has_key ? `${tr('api.keepCurrentKey')} ${item.key_preview || ''}` : tr('api.enterKey');
    keyHint.textContent = item.has_key ? `${tr('api.keySaved')}${item.key_env || 'API/.env'}` : tr('api.noKey');
    const isRunningHub = item.id === 'runninghub';
    const isVolcengine = item.id === 'volcengine' || activeModelProtocol(item) === 'volcengine';
    const isStandaloneVolcengine = item.id === 'volcengine';
    const isComfyui = item.id === 'comfyui';
    const isOmnilojo = activeModelProtocol(item) === 'omnilojo';
    renderConnectionProviderSelect(selectedRef);
    if(parameterSchemaBlock) parameterSchemaBlock.hidden = isRunningHub || isComfyui || !selectedRef || !['image', 'video'].includes(selectedRef.key === 'image_models' ? 'image' : selectedRef.key === 'video_models' ? 'video' : 'chat');
    renderParameterSchemaEditor();
    renderSelectedModelConfig(item, selectedRef);
    if(isRunningHub){
        if(rhFreeKeyInput){
            rhFreeKeyInput.value = '';
            rhFreeKeyInput.placeholder = item.has_key ? `${tr('api.rhKeepKey')} ${item.key_preview || ''}` : tr('api.rhEnterKey');
        }
        if(rhFreeKeyHint) rhFreeKeyHint.textContent = rhFreeKeyHintText(item);
    }
    if(isVolcengine){
        item.base_url = item.base_url || VOLCENGINE_DEFAULT_BASE_URL;
        item.protocol = 'volcengine';
        item.volcengine_project_name = item.volcengine_project_name || VOLCENGINE_DEFAULT_PROJECT_NAME;
        item.volcengine_region = item.volcengine_region || VOLCENGINE_DEFAULT_REGION;
        keyInput.placeholder = item.has_key ? `保持当前方舟 API Key ${item.key_preview || ''}` : '输入方舟 API Key';
        keyHint.textContent = volcengineArkKeyHintText(item);
        if(volcArkKeyHint) volcArkKeyHint.textContent = volcengineArkKeyHintText(item);
        if(volcAkInput){
            volcAkInput.value = '';
            volcAkInput.placeholder = item.has_volcengine_access_key ? `保持当前 AK ${item.volcengine_access_key_preview || ''}` : 'Access Key ID';
        }
        if(volcSkInput){
            volcSkInput.value = '';
            volcSkInput.placeholder = item.has_volcengine_secret_key ? `保持当前 SK ${item.volcengine_secret_key_preview || ''}` : 'Secret Access Key';
        }
        if(volcAssetKeyHint) volcAssetKeyHint.textContent = volcengineAssetKeyHintText(item);
        if(volcProjectInput) volcProjectInput.value = item.volcengine_project_name || VOLCENGINE_DEFAULT_PROJECT_NAME;
        if(volcRegionInput) volcRegionInput.value = item.volcengine_region || VOLCENGINE_DEFAULT_REGION;
    }
    if(isOmnilojo){
    }
    document.body.classList.toggle('show-runninghub', isRunningHub);
    document.body.classList.toggle('show-volcengine', isVolcengine);
    document.body.classList.toggle('show-volcengine-standalone', isStandaloneVolcengine);
    document.body.classList.toggle('show-comfyui', isComfyui);
    renderProviderOnboarding(item);
    const editorSub = document.querySelector('#settingsContent .editor-sub');
    if(editorSub){
        editorSub.textContent = isComfyui ? '管理工作流运行所使用的 ComfyUI 后端地址。' : isModelFirstProvider(item) ? '先配置平台连接，再管理并选择该平台的模型。' : tr('api.editorSub');
    }
    if(providerOnboardingCard && isComfyui) providerOnboardingCard.hidden = true;
    const showRunningHubApps = isRunningHub && isRunningHubAppsPage;
    if(runninghubConfigBlock){
        runninghubConfigBlock.hidden = !showRunningHubApps;
        runninghubConfigBlock.style.display = showRunningHubApps ? 'flex' : 'none';
    }
    if(!showRunningHubApps){
        if(rhPasteInput) rhPasteInput.value = '';
        if(rhAppsList) rhAppsList.innerHTML = '';
        if(rhAppsCount) rhAppsCount.textContent = '0';
    }
    const deleteBtn = document.getElementById('deleteBtn');
    if(deleteBtn) deleteBtn.style.display = isFixedProvider(item) ? 'none' : 'inline-flex';
    const deleteModelBtn = document.getElementById('deleteModelBtn');
    if(deleteModelBtn) deleteModelBtn.style.display = isModelFirstProvider(item) && !isRunningHubAppsPage && Boolean(selectedRef) ? 'inline-flex' : 'none';
    if(enabledToggle) enabledToggle.disabled = isComfyui;
    const enabledToggleWrap = enabledToggle?.closest('.provider-enable-toggle');
    if(enabledToggleWrap) enabledToggleWrap.hidden = isComfyui;
    const contentActions = document.querySelector('.content-actions');
    if(contentActions) contentActions.hidden = isComfyui;
    const providerBasicBlock = document.getElementById('providerBasicBlock');
    if(providerBasicBlock) providerBasicBlock.hidden = isComfyui || isRunningHubAppsPage;
    const providerIdentityField = document.getElementById('providerIdentityField');
    if(providerIdentityField) providerIdentityField.hidden = isModelFirstProvider(item);
    const providerBasicTitle = document.getElementById('providerBasicTitle');
    const providerBasicDesc = document.getElementById('providerBasicDesc');
    if(providerBasicTitle) providerBasicTitle.textContent = isModelFirstProvider(item) ? '连接配置' : '基本信息';
    if(providerBasicDesc) providerBasicDesc.textContent = isModelFirstProvider(item) ? 'API协议、请求地址和 API Key' : (isComfyui ? '管理工作流运行所使用的 ComfyUI 后端地址。' : '平台显示名、唯一 ID 和请求地址');
    const comfyBackendBlock = document.getElementById('comfyBackendBlock');
    if(comfyBackendBlock) comfyBackendBlock.hidden = !isComfyui;
    const modelsHead = document.getElementById('modelsHead');
    if(modelsHead) modelsHead.hidden = isComfyui || isRunningHub;
    const modelGrid = document.querySelector('.model-grid');
    if(modelGrid) modelGrid.hidden = isComfyui || isRunningHub;
    if(modelConfigBlock){
        const hideModelConfig = !isModelFirstProvider(item) || isRunningHubAppsPage || !selectedRef;
        modelConfigBlock.hidden = hideModelConfig;
        modelConfigBlock.style.display = hideModelConfig ? 'none' : '';
    }
    document.querySelectorAll('.model-list').forEach(list => list.closest('.block').hidden = isComfyui || isRunningHub);
    renderModels('image');
    renderModels('chat');
    renderModels('video');
    renderProviderList();
}
function parameterSchemaKind(){
    const ref = selectedModelRef();
    return ref?.key === 'video_models' ? 'video' : 'image';
}
function schemaScope(item, create=false){
    const ref = selectedModelRef();
    if(!item || !ref || !['image_models', 'video_models'].includes(ref.key)) return null;
    if(!item.parameter_schema || typeof item.parameter_schema !== 'object' || Array.isArray(item.parameter_schema)){
        if(!create) return null;
        item.parameter_schema = {};
    }
    const schema = item.parameter_schema;
    const kind = parameterSchemaKind();
    if(!schema.models && create) schema.models = {};
    if(!schema.models?.[ref.name] && create) schema.models[ref.name] = {};
    const modelSchema = schema.models?.[ref.name];
    if(!modelSchema) return null;
    if(!modelSchema[kind] && create) modelSchema[kind] = {fields:[]};
    return modelSchema[kind] || null;
}
function schemaFields(item){ return Array.isArray(schemaScope(item)?.fields) ? schemaScope(item).fields : []; }
function schemaDefinitions(kind=parameterSchemaKind()){
    return (canvasSchemaDefinitions?.[kind]?.fields || []).filter(field => field?.ui?.configurable !== false);
}
function schemaOverride(field){
    return Object.fromEntries(Object.entries(field || {}).filter(([key]) => SCHEMA_OVERRIDE_KEYS.has(key)));
}
function normalizeParameterSchema(item){
    const schema = item?.parameter_schema;
    if(!schema || typeof schema !== 'object') return;
    delete schema.image;
    delete schema.video;
    if(schema.models && typeof schema.models === 'object'){
        Object.keys(schema.models).forEach(model => {
            ['image','video'].forEach(kind => {
                const supported = new Set(schemaDefinitions(kind).map(field => field.id));
                const fields = schema.models[model]?.[kind]?.fields;
                if(Array.isArray(fields)) schema.models[model][kind].fields = fields
                    .filter(field => supported.has(field?.id))
                    .map(schemaOverride);
                if(!Array.isArray(schema.models[model]?.[kind]?.fields) || !schema.models[model][kind].fields.length) delete schema.models[model][kind];
            });
            if(!Object.keys(schema.models[model] || {}).length) delete schema.models[model];
        });
        if(!Object.keys(schema.models).length) delete schema.models;
    }
}
function schemaPreset(fieldId){ return schemaDefinitions().find(field => field.id === fieldId); }
function schemaField(fieldId){ return schemaFields(provider()).find(field => field?.id === fieldId); }
function schemaFieldValue(field, preset){ return {...(preset || {}), ...(field || {})}; }
function renderParameterSchemaEditor(){
    const item = provider();
    const ref = selectedModelRef();
    if(!parameterSchemaEditor || !item || !ref || !['image_models', 'video_models'].includes(ref.key)) return;
    const kind = parameterSchemaKind();
    const overrides = schemaFields(item);
    const presets = schemaDefinitions(kind);
    const fields = presets.map(field => ({preset:field, field:overrides.find(item => item?.id === field.id)}));
    parameterSchemaEditor.innerHTML = `
        <div class="schema-model-note"><i data-lucide="${kind === 'video' ? 'film' : 'image'}" class="w-3.5 h-3.5"></i><span>当前模型：${escapeHtml(ref.name)} · ${kind === 'video' ? '视频生成参数' : '图片生成参数'}</span></div>
        <div class="schema-field-list">${fields.map(({preset, field}) => renderParameterSchemaField(preset, field)).join('')}</div>`;
    refreshIcons();
}
function renderParameterSchemaField(preset, field){
    const value = schemaFieldValue(field, preset);
    const enabled = Boolean(field);
    const fieldId = String(value.id || '');
    const options = Array.isArray(value.options) ? value.options.join(', ') : '';
    const optionLabels = Array.isArray(value.option_labels) ? value.option_labels.join(', ') : options;
    const disabled = enabled ? '' : 'disabled';
    const type = value.type || 'text';
    const isBoolean = type === 'boolean';
    const hasOptions = Array.isArray(value.options) && value.options.length > 0;
    const hasRange = ['number','slider'].includes(type);
    return `<section class="schema-field-card ${enabled ? 'enabled' : ''}">
        <div class="schema-field-head">
            <label class="schema-enable"><input type="checkbox" ${enabled ? 'checked' : ''} onchange="toggleParameterSchemaField('${escapeAttr(fieldId)}',this.checked)"><span class="check-box"></span><strong>${escapeHtml(value.label || value.name || fieldId)}</strong></label>
            <span class="schema-inherit">${enabled ? '已覆盖' : '使用系统默认'}</span>
        </div>
        <div class="schema-field-grid">
            <label><span>字段 ID</span><input type="text" value="${escapeAttr(fieldId)}" readonly ${disabled}></label>
            <label><span>显示名称</span><input type="text" value="${escapeAttr(value.name || value.label || '')}" ${disabled} onchange="updateParameterSchemaField('${escapeAttr(fieldId)}','name',this.value)"></label>
            <label><span>类型</span><input type="text" value="${escapeAttr(type)}" readonly ${disabled}></label>
            ${isBoolean ? `<label class="schema-default-toggle"><span>默认值</span><select ${disabled} onchange="updateParameterSchemaField('${escapeAttr(fieldId)}','default',this.value === 'true')"><option value="false" ${value.default === false ? 'selected' : ''}>关闭</option><option value="true" ${value.default === true ? 'selected' : ''}>开启</option></select></label>` : `<label><span>默认值</span><input type="${hasRange ? 'number' : 'text'}" value="${escapeAttr(value.default ?? '')}" ${disabled} onchange="updateParameterSchemaField('${escapeAttr(fieldId)}','default',this.value)"></label>`}
            ${hasOptions ? `<label class="schema-wide"><span>可选值（逗号分隔）</span><input type="text" value="${escapeAttr(options)}" ${disabled} onchange="updateParameterSchemaField('${escapeAttr(fieldId)}','options',this.value)"></label>` : ''}
            ${hasOptions ? `<label class="schema-wide"><span>选项显示名称（逗号分隔）</span><input type="text" value="${escapeAttr(optionLabels)}" ${disabled} onchange="updateParameterSchemaField('${escapeAttr(fieldId)}','option_labels',this.value)"></label>` : ''}
            ${hasRange ? `<label><span>最小值</span><input type="number" value="${escapeAttr(value.min ?? '')}" ${disabled} onchange="updateParameterSchemaField('${escapeAttr(fieldId)}','min',this.value)"></label><label><span>最大值</span><input type="number" value="${escapeAttr(value.max ?? '')}" ${disabled} onchange="updateParameterSchemaField('${escapeAttr(fieldId)}','max',this.value)"></label><label><span>步长</span><input type="number" value="${escapeAttr(value.step ?? '')}" ${disabled} onchange="updateParameterSchemaField('${escapeAttr(fieldId)}','step',this.value)"></label>` : ''}
        </div>
    </section>`;
}
function toggleParameterSchemaField(fieldId, enabled){
    const item = provider();
    if(!item) return;
    const fields = schemaScope(item, enabled)?.fields;
    if(!fields) return;
    const index = fields.findIndex(field => field?.id === fieldId);
    if(enabled && index < 0) fields.push({id:fieldId});
    if(!enabled && index >= 0) fields.splice(index, 1);
    normalizeParameterSchema(item);
    renderParameterSchemaEditor();
    setStatus('参数 Schema 已更新，点击保存生效');
}
function updateParameterSchemaField(fieldId, key, rawValue){
    const item = provider();
    if(!item || !fieldId) return;
    const fields = schemaScope(item, true).fields;
    const field = fields.find(entry => entry?.id === fieldId);
    if(!field) return;
    const preset = schemaPreset(fieldId);
    if(!preset) return;
    if(key === 'options') {
        field.options = String(rawValue || '').split(',').map(value => value.trim()).filter(Boolean).map(value => preset.type === 'number' && !Number.isNaN(Number(value)) ? Number(value) : value);
        if(Array.isArray(field.option_labels)){
            field.option_labels = field.options.map((value, index) => field.option_labels[index] || String(value));
        }
    } else if(key === 'option_labels') {
        field.option_labels = String(rawValue || '').split(',').map(value => value.trim());
    } else if(['min','max','step'].includes(key)) {
        if(rawValue === '') delete field[key];
        else field[key] = Number(rawValue);
    } else if(key === 'default' && preset.type === 'number') {
        field.default = rawValue === '' ? '' : Number(rawValue);
    } else field[key] = rawValue;
    renderParameterSchemaEditor();
    setStatus('参数 Schema 已更新，点击保存生效');
}
function exportParameterSchema(){
    const item = provider();
    const ref = selectedModelRef();
    const scope = schemaScope(item);
    if(!item || !ref) return;
    const blob = new Blob([JSON.stringify(scope || {fields:[]}, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${item.id || 'provider'}-${ref.name}-parameter-schema.json`;
    link.click();
    URL.revokeObjectURL(url);
}
function importParameterSchema(event){
    const file = event?.target?.files?.[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const schema = JSON.parse(String(reader.result || ''));
            if(!schema || Array.isArray(schema) || typeof schema !== 'object' || !Array.isArray(schema.fields)) throw new Error('JSON 必须是包含 fields 数组的模型参数 Schema。');
            const item = provider();
            const scope = schemaScope(item, true);
            if(!scope) return;
            const check = await fetch('/api/canvas/parameter-schema/validate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({parameter_schema:{models:{[selectedModel.name]:{[parameterSchemaKind()]:schema}}}})});
            const checked = await check.json();
            if(!check.ok) throw new Error(checked.detail || '参数 Schema 未通过后端校验');
            scope.fields = checked.parameter_schema?.models?.[selectedModel.name]?.[parameterSchemaKind()]?.fields || [];
            normalizeParameterSchema(item);
            renderParameterSchemaEditor();
            setStatus('参数 Schema 已导入，点击保存生效');
        } catch(err) { alert(`导入失败：${err.message || '无效的 JSON 文件'}`); }
        if(parameterSchemaImport) parameterSchemaImport.value = '';
    };
    reader.readAsText(file);
}
function resetParameterSchema(){
    const item = provider();
    const ref = selectedModelRef();
    if(!item || !ref || !confirm(`重置模型“${ref.name}”的画布参数覆盖？系统默认值不会被删除。`)) return;
    const kind = parameterSchemaKind();
    if(item.parameter_schema?.models?.[ref.name]) delete item.parameter_schema.models[ref.name][kind];
    normalizeParameterSchema(item);
    renderParameterSchemaEditor();
    setStatus('参数 Schema 覆盖已重置，点击保存生效');
}
function renderSelectedModelConfig(item, ref){
    if(!modelConfigBlock || !ref || !isModelFirstProvider(item)) return;
    const model = ref.name;
    const aliases = item.model_aliases || {};
    const price = item.omnilojo_model_prices?.[model] || {};
    selectedModelInput.value = item[ref.key][ref.index] || '';
    selectedModelAliasInput.value = aliases[model] || '';
    if(selectedModelProtocol) selectedModelProtocol.value = modelProtocol(item, model);
    // 价格是模型维度的成本配置，不依赖请求协议；切换协议后仍应可编辑。
    selectedModelPriceFields.hidden = false;
    selectedModelInputPrice.value = price.input_per_million ?? '';
    selectedModelOutputPrice.value = price.output_per_million ?? '';
}
function selectModel(providerId, kind, index){
    syncEditor();
    const item = providers.find(p => p.id === providerId);
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    if(!item || typeof item[key]?.[index] === 'undefined') return;
    selectedId = providerId;
    selectedModel = {providerId, kind, index, name:String(item[key][index] || '').trim()};
    renderEditor();
}
function updateSelectedModelName(value){
    const ref = selectedModelRef();
    if(!ref) return;
    updateModel(selectedModel.kind, ref.index, value);
    selectedModel.name = String(value || '').trim();
    renderProviderList();
}
function updateSelectedModelAlias(value){
    const ref = selectedModelRef();
    if(!ref) return;
    updateModelAlias(selectedModel.kind, ref.index, value);
    renderProviderList();
}
function updateSelectedModelProtocol(value){
    const ref = selectedModelRef();
    if(!ref) return;
    updateModelProtocol(ref.key === 'image_models' ? 'image' : ref.key === 'video_models' ? 'video' : 'chat', ref.index, value);
    renderProviderList();
}
function updateSelectedModelPrice(field, value){
    const ref = selectedModelRef();
    if(!ref) return;
    updateOmnilojoModelPrice(selectedModel.kind, ref.index, field, value);
}
function moveModelScopedSchema(source, target, model, kind){
    if(!['image','video'].includes(kind)) return;
    const sourceScope = source.parameter_schema?.models?.[model]?.[kind];
    if(!sourceScope) return;
    target.parameter_schema = target.parameter_schema && typeof target.parameter_schema === 'object' ? target.parameter_schema : {};
    target.parameter_schema.models = target.parameter_schema.models && typeof target.parameter_schema.models === 'object' ? target.parameter_schema.models : {};
    target.parameter_schema.models[model] = target.parameter_schema.models[model] && typeof target.parameter_schema.models[model] === 'object' ? target.parameter_schema.models[model] : {};
    if(!target.parameter_schema.models[model][kind]) target.parameter_schema.models[model][kind] = sourceScope;
    delete source.parameter_schema.models[model][kind];
    normalizeParameterSchema(source);
    normalizeParameterSchema(target);
}
function migrateSelectedModelProvider(targetId){
    syncEditor();
    const ref = selectedModelRef();
    const source = ref?.item;
    const target = providers.find(item => item.id === targetId);
    if(!ref || !source || !target || source.id === target.id){ renderConnectionProviderSelect(ref); return; }
    if(!isModelFirstProvider(target)){
        alert('只能迁移到普通 API 或火山引擎 Provider。');
        renderConnectionProviderSelect(ref);
        return;
    }
    const model = ref.name;
    const targetModels = Array.isArray(target[ref.key]) ? target[ref.key] : (target[ref.key] = []);
    const duplicateIndex = targetModels.findIndex(name => String(name || '').trim() === model);
    if(duplicateIndex >= 0 && !confirm(`目标 Provider 已包含模型“${model}”。继续会合并到已有模型，是否继续？`)){
        renderConnectionProviderSelect(ref);
        return;
    }
    const protocol = source.model_protocols?.[model];
    const alias = source.model_aliases?.[model];
    const price = source.omnilojo_model_prices?.[model];
    source[ref.key].splice(ref.index, 1);
    const nextIndex = duplicateIndex >= 0 ? duplicateIndex : targetModels.push(model) - 1;
    if(protocol && !target.model_protocols?.[model]){
        target.model_protocols = target.model_protocols || {};
        target.model_protocols[model] = protocol;
    }
    if(alias && !target.model_aliases?.[model]){
        target.model_aliases = target.model_aliases || {};
        target.model_aliases[model] = alias;
    }
    if(price && !target.omnilojo_model_prices?.[model]){
        target.omnilojo_model_prices = target.omnilojo_model_prices || {};
        target.omnilojo_model_prices[model] = price;
    }
    if(!modelProtocolStillUsed(source, model)) delete source.model_protocols?.[model];
    if(!providerModels(source).some(entry => entry.name === model)) {
        delete source.model_aliases?.[model];
        delete source.omnilojo_model_prices?.[model];
    }
    moveModelScopedSchema(source, target, model, ref.kind);
    selectedId = target.id;
    selectedModel = {providerId:target.id, kind:ref.kind, index:nextIndex, name:model};
    renderEditor();
    setStatus(`已将模型 ${model} 迁移到 ${target.id}，点击保存生效`);
}
async function deleteSelectedModel(){
    const ref = selectedModelRef();
    if(!ref) return;
    if(!confirm(`确认删除模型“${ref.name || '未命名模型'}”？`)) return;
    ref.item[ref.key].splice(ref.index, 1);
    selectedModel = {providerId:'', kind:'', name:'', index:-1};
    const first = providerModels(ref.item)[0];
    if(first){ selectedId = ref.item.id; selectedModel = {providerId:ref.item.id, kind:first.kind, index:first.index, name:first.name}; }
    renderEditor();
    const saved = await saveProviders();
    if(!saved){
        await loadProviders();
        setStatus('删除模型失败，已恢复服务器配置');
    }
}
function showVerifyResult(html){ const el = document.getElementById('verifyResult'); if(el){ el.style.display = 'block'; el.innerHTML = html; } }
function clearVerifyResult(){ const el = document.getElementById('verifyResult'); if(el){ el.style.display = 'none'; el.innerHTML = ''; } }
function prettyJson(value){
    try { return JSON.stringify(value, null, 2); } catch(_) { return String(value || ''); }
}
function currentProviderApiKey(item){
    if(item?.id === 'runninghub'){
        return rhFreeKeyInput?.value.trim() || '';
    }
    return keyInput.value.trim();
}
function isManualProtocol(protocol){
    return ['gemini', 'volcengine', 'omnilojo'].includes(String(protocol || '').toLowerCase());
}
function applyDetectedProtocol(protocol){
    const item = provider();
    const detected = String(protocol || '').toLowerCase();
    if(!item || isFixedProvider(item) || !['openai', 'gemini', 'omnilojo'].includes(detected)) return false;
    const selectedRef = selectedModelRef();
    if(selectedRef){
        updateModelProtocol(selectedRef.kind, selectedRef.index, detected);
        renderSelectedModelConfig(item, selectedRef);
        renderProviderList();
        return true;
    }
    if(!protocolInput) return false;
    if(String(protocolInput.value || '').toLowerCase() === detected && String(item.protocol || '').toLowerCase() === detected) return false;
    protocolInput.value = detected;
    item.protocol = detected;
    item.base_url = baseInput?.value.trim() || item.base_url || '';
    if(detected === 'volcengine'){
        item.volcengine_project_name = item.volcengine_project_name || VOLCENGINE_DEFAULT_PROJECT_NAME;
        item.volcengine_region = item.volcengine_region || VOLCENGINE_DEFAULT_REGION;
    }
    protocolInput.dispatchEvent(new Event('change'));
    return true;
}

async function probeAsync(){
    const item = provider();
    if(!item) return;
    const btn = document.getElementById('probeAsyncBtn');
    const baseUrl = baseInput.value.trim();
    if(!baseUrl){ alert('请先填写请求地址'); return; }
    if(btn){ btn.disabled = true; btn.querySelector('span').textContent = '检测中...'; }
    showVerifyResult(`<span style="color:var(--muted);font-size:11px;font-weight:700">正在检测协议类型...</span>`);
    try {
        const apiKey = currentProviderApiKey(item);
        const currentProtocol = activeModelProtocol(item);
        const data = await fetch('/api/providers/probe-async', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ base_url: baseUrl, api_key: apiKey, provider_id: item.id, protocol: currentProtocol })
        }).then(async r => {
            if(!r.ok) throw new Error((await r.json()).detail || '请求失败');
            return r.json();
        });
        const detectedProtocol = String(data.protocol || '').toLowerCase();
        const isOpenAiCompat = data.ok === true && detectedProtocol === 'openai';
        const keepManualProtocol = isManualProtocol(currentProtocol);
        if(protocolInput && !keepManualProtocol){
            applyDetectedProtocol(detectedProtocol || 'openai');
        }
        const rawJson = JSON.stringify(data.raw, null, 2);
        const probeMessage = String(data.message || '');
        const hideTasksEndpointTip = probeMessage.includes('/v1/tasks/');
        const color = (isOpenAiCompat || data.ok === true) ? '#15803d' : data.ok === null ? '#b45309' : '#64748b';
        const icon = (isOpenAiCompat || data.ok === true) ? '✓' : '⚠';
        const proto = detectedProtocol === 'volcengine'
            ? '方舟/Ark 任务协议'
            : detectedProtocol === 'openai'
                    ? 'OpenAI 兼容'
                    : keepManualProtocol
                    ? (currentProtocol === 'gemini' ? 'Gemini' : currentProtocol.toUpperCase())
                    : 'OpenAI 兼容';
        showVerifyResult(`
            ${hideTasksEndpointTip ? '' : `<div style="font-size:11px;font-weight:800;color:${color}">${icon} ${escapeHtml(probeMessage)}</div>`}
            <div style="font-size:11px;color:var(--muted);font-weight:700;margin-top:2px">${keepManualProtocol ? '协议已验证为' : '协议已自动设置为'}：<strong style="color:var(--text)">${proto}</strong></div>
            <details style="margin-top:6px">
                <summary style="font-size:10.5px;color:var(--muted);cursor:pointer;font-weight:700;user-select:none">▸ 查看原始响应 (HTTP ${data.status_code})</summary>
                <pre style="margin-top:6px;padding:10px 12px;border-radius:10px;background:var(--soft);border:1px solid var(--line-2);font-size:10.5px;font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all;color:var(--text);max-height:200px;overflow:auto">${escapeHtml(rawJson)}</pre>
            </details>`);
    } catch(e){
        const keepManualProtocol = isManualProtocol(activeModelProtocol(item));
        if(protocolInput && !keepManualProtocol){ protocolInput.value = 'openai'; protocolInput.dispatchEvent(new Event('change')); }
        const suffix = keepManualProtocol ? '，已保留当前手动选择的协议' : '，协议已设为 OpenAI 兼容';
        showVerifyResult(`<div style="font-size:11px;font-weight:800;color:#b45309">⚠ ${escapeHtml(e.message || String(e))}${suffix}</div>`);
    } finally {
        if(btn){ btn.disabled = false; btn.querySelector('span').textContent = '验证协议'; refreshIcons(); }
    }
}

async function testConnection(){
    const item = provider();
    if(!item) return;
    const btn = document.getElementById('testUrlBtn');
    const baseUrl = baseInput.value.trim();
    if(!baseUrl){ alert('请先填写请求地址'); return; }
    if(btn){ btn.disabled = true; btn.querySelector('span').textContent = tr('api.testingUrl') || '验证中...'; }
    showVerifyResult(`<span style="color:var(--muted);font-size:11px;font-weight:700">验证中...</span>`);
    try {
        const apiKey = currentProviderApiKey(item);
        const data = await fetch('/api/providers/test-connection', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ base_url: baseUrl, api_key: apiKey, provider_id: item.id, protocol: activeModelProtocol(item) })
        }).then(async r => {
            if(!r.ok) throw new Error((await r.json()).detail || (tr('api.urlInvalid') || '验证失败'));
            return r.json();
        });
        if(data.ok){
            const detectedProtocol = String(data.protocol || '').toLowerCase();
            if(detectedProtocol && !isManualProtocol(activeModelProtocol(item)) && detectedProtocol !== activeModelProtocol(item)){
                applyDetectedProtocol(detectedProtocol);
            }
            // 存入 picker 状态并启用「选择模型」按钮，但不自动弹出
            lastFetchedAll = data.all || [];
            lastFetchedProviderId = item.id;
            lastFetchedSuggestion = {
                image: new Set(data.image_models || []),
                chat: new Set(data.chat_models || []),
                video: new Set(data.video_models || []),
            };
            const openBtn = document.getElementById('openPickerBtn');
            if(openBtn){ openBtn.disabled = false; openBtn.style.opacity = '1'; }
            const isVolcengineNow = detectedProtocol === 'volcengine' || isVolcengineProvider(item);
            const volcengineNote = isVolcengineNow
                ? `<div style="margin-top:6px;color:#92400e;font-size:11px;font-weight:700">${detectedProtocol === 'volcengine' ? '已自动识别为方舟/Ark 任务协议。' : ''}火山协议提示：模型列表只代表可见模型，聊天模型建议填写你在方舟控制台创建的 <code>ep-...</code> 推理接入点。</div>`
                : '';
            showVerifyResult(`<span style="color:#15803d;font-size:11px;font-weight:800">✓ 地址验证通过 · 找到 ${data.model_count} 个模型</span>${volcengineNote}`);
        } else {
            showVerifyResult(`
                <div style="font-size:11px;font-weight:800;color:#b45309">⚠ 地址验证未通过 (HTTP ${data.status})</div>
                <div style="font-size:11px;color:var(--muted);font-weight:600;margin-top:3px">${escapeHtml((data.message || '').slice(0,200))}</div>`);
        }
    } catch(e){
        showVerifyResult(`<div style="font-size:11px;font-weight:800;color:#b45309">⚠ ${escapeHtml(e.message || String(e))}</div>`);
    } finally {
        if(btn){ btn.disabled = false; btn.querySelector('span').textContent = tr('api.testUrl') || '验证地址'; }
    }
}
let lastFetchedAll = [];          // 全部模型 id 列表
let lastFetchedSuggestion = null; // 后端自动分类建议
let lastFetchedProviderId = '';
let pickerTargetKind = '';

async function fetchModels(){
    const item = provider();
    if(!item) return;
    syncEditor();
    const btn = document.getElementById('fetchModelsBtn');
    const baseUrl = baseInput.value.trim();
    const apiKey = currentProviderApiKey(item);
    if(!baseUrl){ alert('请先填写请求地址'); return; }
    if(btn){ btn.disabled = true; btn.querySelector('span').textContent = tr('api.fetchingModels') || '拉取中...'; }
    setStatus(tr('api.fetchingModels') || '正在从上游拉取模型列表...');
    try {
        const data = await fetch('/api/providers/fetch-models', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({base_url:baseUrl, api_key:apiKey, provider_id:item.id, protocol:activeModelProtocol(item)})
        }).then(async r => {
            if(!r.ok) throw new Error((await r.json()).detail || (tr('api.urlInvalid') || '拉取失败'));
            return r.json();
        });
        lastFetchedAll = data.all || [];
        lastFetchedProviderId = item.id;
        lastFetchedSuggestion = {
            image: new Set(data.image_models || []),
            chat: new Set(data.chat_models || []),
            video: new Set(data.video_models || []),
        };
        const detectedProtocol = String(data.protocol || '').toLowerCase();
        if(detectedProtocol && !isManualProtocol(activeModelProtocol(item)) && detectedProtocol !== activeModelProtocol(item)){
            applyDetectedProtocol(detectedProtocol);
        }
        // 启用「选择模型」按钮，并 statusbar 显示已拉取数量
        const openBtn = document.getElementById('openPickerBtn');
        if(openBtn){ openBtn.disabled = false; openBtn.style.opacity = '1'; }
        const extra = (detectedProtocol === 'volcengine' || isVolcengineProvider(item)) ? ' · 已识别方舟协议，火山聊天建议改填 ep-... 接入点' : '';
        setStatus(`已拉取 ${data.total} 个模型 · 选择一个模型添加${extra}`);
        openModelPicker();
    } catch(e){
        alert('拉取失败：' + (e.message || e));
        setStatus('拉取失败');
    } finally {
        if(btn){ btn.disabled = false; btn.querySelector('span').textContent = tr('api.fetchModels') || '拉取模型'; }
    }
}

// —— 模型选择器浮层 ——
// 每个模型只归一类（根据用户已配置 或 关键字猜测）；勾选 = 纳入该分类
let pickerState = { category: {}, selected: {} };
let pickerVisibleIds = [];
function openModelPicker(kind=''){
    const item = provider();
    if(!item || !lastFetchedAll.length){ alert('没有拉取到模型'); return; }
    if(lastFetchedProviderId && lastFetchedProviderId !== item.id){ alert('请先拉取当前连接的模型列表'); return; }
    pickerTargetKind = kind || '';
    const allIds = new Set(lastFetchedAll);
    pickerState = { category: {}, selected: {} };
    allIds.forEach(id => {
        let cat;
        if(lastFetchedSuggestion?.image?.has(id)) cat = 'image';
        else if(lastFetchedSuggestion?.video?.has(id)) cat = 'video';
        else cat = 'chat';
        pickerState.category[id] = cat;
        pickerState.selected[id] = false;
    });
    // 默认 tab 切回「全部」
    document.querySelectorAll('.picker-cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === 'all'));
    document.getElementById('modelPickerOverlay').style.display = 'flex';
    renderModelPicker();
}
function closeModelPicker(){ document.getElementById('modelPickerOverlay').style.display = 'none'; }
function renderModelPicker(){
    const filter = (document.getElementById('pickerFilter')?.value || '').toLowerCase();
    const currentTab = document.querySelector('.picker-cat-tab.active')?.dataset.cat || 'all';
    const ids = Object.keys(pickerState.category).sort();
    // 各分类总数 / 已选数
    const totals = { all: ids.length, image:0, chat:0, video:0 };
    const selecteds = { all:0, image:0, chat:0, video:0 };
    ids.forEach(id => {
        const cat = pickerState.category[id];
        totals[cat]++;
        if(pickerState.selected[id]){ selecteds[cat]++; selecteds.all++; }
    });
    // 过滤显示
    const list = ids.filter(id => {
        if(filter && !id.toLowerCase().includes(filter)) return false;
        if(currentTab === 'all') return true;
        return pickerState.category[id] === currentTab;
    });
    pickerVisibleIds = list;
    document.getElementById('pickerCount').textContent = `共 ${totals.all} 个模型 · 当前显示 ${list.length} 个`;
    document.querySelectorAll('.picker-cat-tab').forEach(tab => {
        const cat = tab.dataset.cat;
        tab.querySelector('.cat-count').textContent = `${selecteds[cat]}/${totals[cat]}`;
    });
    // 列表
    const html = list.map((id, index) => {
        const checked = pickerState.selected[id];
        return `
            <div class="picker-row ${checked?'has-sel':''}" onclick="togglePickerRowByIndex(${index})">
                <div class="picker-checkbox ${checked?'checked':''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="picker-model-name" title="${escapeAttr(id)}">${escapeHtml(id)}</div>
            </div>
        `;
    }).join('');
    document.getElementById('pickerList').innerHTML = html || `<div style="padding:32px;text-align:center;color:var(--faint);font-size:12px">无匹配</div>`;
    const selectedModelEl = document.getElementById('pickerSelectedModel');
    const selectedId = Object.keys(pickerState.selected).find(id => pickerState.selected[id]);
    if(selectedModelEl){
        selectedModelEl.textContent = selectedId ? `${selectedId}${pickerTargetKind ? ` · ${modelKindLabel(pickerTargetKind)}` : ''}` : '未选择';
        selectedModelEl.classList.toggle('picker-sum-chip-empty', !selectedId);
    }
}
function togglePickerRow(id){
    Object.keys(pickerState.selected).forEach(key => { pickerState.selected[key] = key === id; });
    renderModelPicker();
}
function togglePickerRowByIndex(index){
    const id = pickerVisibleIds[index];
    if(typeof id !== 'string') return;
    togglePickerRow(id);
}
function selectPickerCat(cat){
    document.querySelectorAll('.picker-cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
    renderModelPicker();
}
function applyModelPicker(){
    const item = provider(); if(!item) return;
    const model = Object.keys(pickerState.selected).find(id => pickerState.selected[id]);
    if(!model){ alert('请选择一个模型'); return; }
    const kind = pickerTargetKind || pickerState.category[model] || 'chat';
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    item[key] = unique((item[key] || []).filter((value, index) => !(index === selectedModel.index && !String(value || '').trim())));
    item[key] = unique([...item[key], model]);
    selectedId = item.id;
    selectedModel = {providerId:item.id, kind, index:item[key].indexOf(model), name:model};
    renderEditor();
    setStatus(`已添加模型 ${model}，点保存生效`);
    closeModelPicker();
}
async function saveKeyOnly(){
    const item = provider();
    if(!item) return;
    const key = keyInput.value.trim();
    if(!key){ alert(tr('api.enterKeyAlert') || '请输入 Key'); return; }
    item.api_key = key;
    const ok = await saveProviders();
    if(ok) keyInput.value = '';
}
async function clearKeyOnly(){
    const item = provider();
    if(!item) return;
    if(!item.has_key && !keyInput.value){ return; }
    if(!confirm(tr('api.confirmClearKey') || '确认清除当前 Key？')) return;
    item._clearKey = true;
    const ok = await saveProviders();
    if(ok) keyInput.value = '';
}
const FIXED_PROTOCOL_PROVIDER_IDS = new Set(['volcengine', 'runninghub']);
function providerSupportsModelProtocol(item){
    return Boolean(item) && !FIXED_PROTOCOL_PROVIDER_IDS.has(item.id);
}
function modelEnabled(item, model){
    return item?.model_enabled?.[String(model || '').trim()] !== false;
}
function modelProtocolSelectHtml(kind, index, model, item){
    if(kind === 'video' || !providerSupportsModelProtocol(item)) return '';
    const map = (item.model_protocols && typeof item.model_protocols === 'object') ? item.model_protocols : {};
    const current = String(map[String(model || '').trim()] || '').toLowerCase();
    const opt = (val, label) => `<option value="${val}" ${current === val ? 'selected' : ''}>${label}</option>`;
    return `<select class="model-protocol-select" title="当前模型使用的 API协议" onclick="event.stopPropagation()" onchange="updateModelProtocol('${kind}', ${index}, this.value)">
        <option value="" ${current === '' ? 'selected' : ''}>默认</option>
        ${opt('openai', 'OpenAI')}
        ${opt('gemini', 'Gemini')}
        ${opt('omnilojo', 'Omnilojo')}
    </select>`;
}
function renderModels(kind){
    const item = provider();
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    const list = kind === 'image' ? imageModelList : kind === 'video' ? videoModelList : chatModelList;
    const models = item?.[key] || [];
    if(!models.length){
        list.innerHTML = `<div class="empty">${tr('api.noModels')}</div>`;
        return;
    }
    const aliases = item?.model_aliases || {};
    const showProtocol = kind !== 'video' && providerSupportsModelProtocol(item);
    const showPrices = model => modelProtocol(item, model) === 'omnilojo';
    const prices = item?.omnilojo_model_prices || {};
    list.innerHTML = models.map((model, index) => {
        const alias = aliases[model] || '';
        const price = prices[String(model || '').trim()] || {};
        return `
        <div class="model-row${showProtocol ? ' has-protocol' : ''}${selectedModel.providerId === item?.id && selectedModel.kind === kind && selectedModel.index === index ? ' selected' : ''}" draggable="true" data-kind="${kind}" data-index="${index}" onclick="selectModel('${escapeAttr(item?.id || '')}','${kind}',${index})" ondragstart="handleModelDragStart(event,'${kind}',${index})" ondragover="handleModelDragOver(event,'${kind}',${index})" ondrop="handleModelDrop(event,'${kind}',${index})" ondragend="handleModelDragEnd(event)">
            <span class="model-drag-handle"><i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i></span>
            <input value="${escapeAttr(model)}" readonly title="模型 ID" onclick="event.stopPropagation()">
            <input class="model-alias-input" value="${escapeAttr(alias)}" onclick="event.stopPropagation()" oninput="updateModelAlias('${kind}', ${index}, this.value)" placeholder="别名（选填）" title="画布中显示的名称">
            <label class="model-enabled-toggle" title="${modelEnabled(item, model) ? '已启用' : '已停用'}" onclick="event.stopPropagation()"><input type="checkbox" ${modelEnabled(item, model) ? 'checked' : ''} onchange="toggleModelEnabled('${kind}', ${index}, this.checked)"><span>启用</span></label>
            ${modelProtocolSelectHtml(kind, index, model, item)}
            ${showPrices(model) ? `<div class="model-price-fields"><label>入 <input type="number" min="0" step="0.0001" value="${escapeAttr(price.input_per_million ?? '')}" onclick="event.stopPropagation()" oninput="updateOmnilojoModelPrice('${kind}', ${index}, 'input_per_million', this.value)" title="输入 USD / 100 万 token"></label><label>出 <input type="number" min="0" step="0.0001" value="${escapeAttr(price.output_per_million ?? '')}" onclick="event.stopPropagation()" oninput="updateOmnilojoModelPrice('${kind}', ${index}, 'output_per_million', this.value)" title="输出 USD / 100 万 token"></label></div>` : ''}
            <button class="icon-btn" type="button" onclick="event.stopPropagation();removeModel('${kind}', ${index})" title="删除"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
    `;}).join('');
    refreshIcons();
}
function selectProvider(id){
    if(isProviderTemporarilyHidden(providers.find(item => item.id === id))) return;
    syncEditor();
    selectedId = id;
    selectedModel = {providerId:'', kind:'', name:'', index:-1};
    renderEditor();
}
function addProvider(){
    let suffix = 1;
    let id = 'custom-api';
    while(providers.some(item => item.id === id)) id = `custom-api-${++suffix}`;
    providers.push({
        id, name:id, base_url:'', protocol:'openai', image_generation_endpoint:'', image_edit_endpoint:'',
        enabled:true, primary:false, image_models:[], chat_models:[], video_models:[],
        model_enabled:{}, model_protocols:{}, model_aliases:{}, parameter_schema:{}, rh_apps:[], has_key:false, key_preview:''
    });
    selectedId = id;
    selectedModel = {providerId:'', kind:'', name:'', index:-1};
    renderEditor();
    setStatus(`已添加平台 ${id}，填写连接配置后点击保存`);
}
function deleteProvider(){
    const item = provider();
    if(!item) return;
    if(isFixedProvider(item)){ alert(tr('api.defaultNoDelete') || '默认平台不能删除'); return; }
    if(providers.length <= 1){ alert(tr('api.keepOne')); return; }
    providers = providers.filter(p => p.id !== item.id);
    selectedId = providers[0]?.id || '';
    renderEditor();
    saveProviders();
}
async function saveRhKeyOnly(){
    const item = provider();
    if(!item || item.id !== 'runninghub') return;
    const input = rhFreeKeyInput;
    const key = input?.value.trim() || '';
    if(!key){ alert('请输入 Key'); return; }
    syncEditor();
    const ok = await saveProviders();
    if(ok && input) input.value = '';
}
async function clearRhKeyOnly(){
    const item = provider();
    if(!item || item.id !== 'runninghub') return;
    if(!confirm(tr('api.confirmClearKey') || '确认清除当前 Key？')) return;
    item._clearKey = true;
    const ok = await saveProviders();
    if(ok && rhFreeKeyInput) rhFreeKeyInput.value = '';
}
async function saveVolcengineAssetKeys(){
    const item = provider();
    if(!item || item.id !== 'volcengine') return;
    const ak = volcAkInput?.value.trim() || '';
    const sk = volcSkInput?.value.trim() || '';
    if(!ak && !sk){ alert('请输入火山素材库 AK 或 SK'); return; }
    syncEditor();
    const ok = await saveProviders();
    if(ok){
        if(volcAkInput) volcAkInput.value = '';
        if(volcSkInput) volcSkInput.value = '';
    }
}
async function clearVolcengineAssetKeys(){
    const item = provider();
    if(!item || item.id !== 'volcengine') return;
    if(!confirm('确认清除火山素材库 AK/SK？')) return;
    item._clearVolcengineAccessKey = true;
    item._clearVolcengineSecretKey = true;
    const ok = await saveProviders();
    if(ok){
        if(volcAkInput) volcAkInput.value = '';
        if(volcSkInput) volcSkInput.value = '';
    }
}
function addModel(kind){
    let item = provider();
    if(!item || ['runninghub','comfyui'].includes(item.id)) item = visibleProviders().find(candidate => !['runninghub','comfyui'].includes(candidate.id));
    if(!item){
        addProvider();
        item = provider();
    }
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    item[key] = [...(item[key] || []), ''];
    selectedId = item.id;
    selectedModel = {providerId:item.id, kind, index:item[key].length - 1, name:''};
    renderEditor();
}
function modelProtocolStillUsed(item, name){
    if(!item || !name) return false;
    const lists = ['image_models', 'chat_models', 'video_models'];
    return lists.some(k => Array.isArray(item[k]) && item[k].includes(name));
}
function updateModel(kind, index, value){
    const item = provider();
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    const oldName = String(item[key][index] || '').trim();
    const newName = String(value || '').trim();
    item[key][index] = value;
    // 重命名时迁移该模型的协议覆盖
    if(item.model_protocols && typeof item.model_protocols === 'object' && oldName && oldName !== newName){
        if(Object.prototype.hasOwnProperty.call(item.model_protocols, oldName)){
            const proto = item.model_protocols[oldName];
            // 旧名称在其他列表里不再使用时才删除旧键
            const stillUsedElsewhere = (() => {
                const lists = ['image_models', 'chat_models', 'video_models'];
                return lists.some(k => Array.isArray(item[k]) && item[k].some((m, i) => !(k === key && i === index) && String(m || '').trim() === oldName));
            })();
            if(!stillUsedElsewhere) delete item.model_protocols[oldName];
            if(newName) item.model_protocols[newName] = proto;
        }
    }
    // 重命名时迁移别名
    if(item.model_aliases && typeof item.model_aliases === 'object' && oldName && oldName !== newName){
        if(Object.prototype.hasOwnProperty.call(item.model_aliases, oldName)){
            const alias = item.model_aliases[oldName];
            delete item.model_aliases[oldName];
            if(newName) item.model_aliases[newName] = alias;
        }
    }
    if(item.omnilojo_model_prices && typeof item.omnilojo_model_prices === 'object' && oldName && oldName !== newName && Object.prototype.hasOwnProperty.call(item.omnilojo_model_prices, oldName)){
        const price = item.omnilojo_model_prices[oldName];
        delete item.omnilojo_model_prices[oldName];
        if(newName) item.omnilojo_model_prices[newName] = price;
    }
}
function updateOmnilojoModelPrice(kind, index, field, value){
    const item = provider();
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    const model = String(item[key]?.[index] || '').trim();
    if(!model) return;
    if(!item.omnilojo_model_prices || typeof item.omnilojo_model_prices !== 'object') item.omnilojo_model_prices = {};
    const current = item.omnilojo_model_prices[model] || {};
    const parsed = Number(value);
    item.omnilojo_model_prices[model] = {...current, [field]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0};
}
function updateModelAlias(kind, index, value){
    const item = provider();
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    const model = String(item[key]?.[index] || '').trim();
    if(!model) return;
    if(!item.model_aliases || typeof item.model_aliases !== 'object') item.model_aliases = {};
    const alias = String(value || '').trim();
    if(alias) item.model_aliases[model] = alias;
    else delete item.model_aliases[model];
}
function toggleModelEnabled(kind, index, enabled){
    const item = provider();
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    const model = String(item?.[key]?.[index] || '').trim();
    if(!item || !model) return;
    item.model_enabled = item.model_enabled && typeof item.model_enabled === 'object' ? item.model_enabled : {};
    item.model_enabled[model] = Boolean(enabled);
    renderModels(kind);
    setStatus(`${enabled ? '已启用' : '已停用'}模型 ${model}，点击保存生效`);
}
function updateModelProtocol(kind, index, value){
    const item = provider();
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    const name = String(item[key]?.[index] || '').trim();
    if(!name) return;
    if(!item.model_protocols || typeof item.model_protocols !== 'object') item.model_protocols = {};
    const proto = String(value || '').trim().toLowerCase();
    if(proto === 'openai' || proto === 'gemini' || proto === 'omnilojo'){
        item.model_protocols[name] = proto;
    } else {
        delete item.model_protocols[name];
    }
}
function removeModel(kind, index){
    const item = provider();
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    const removed = String(item[key][index] || '').trim();
    item[key].splice(index, 1);
    // 清理不再使用的协议覆盖
    if(removed && item.model_protocols && typeof item.model_protocols === 'object' && !modelProtocolStillUsed(item, removed)){
        delete item.model_protocols[removed];
    }
    if(removed && item.omnilojo_model_prices && typeof item.omnilojo_model_prices === 'object' && !modelProtocolStillUsed(item, removed)) delete item.omnilojo_model_prices[removed];
    if(removed && item.parameter_schema?.models && !modelProtocolStillUsed(item, removed)) delete item.parameter_schema.models[removed];
    renderModels(kind);
}
let modelDragState = null;
function handleModelDragStart(event, kind, index){
    modelDragState = { kind, index };
    event.currentTarget.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', index);
}
function handleModelDragOver(event, kind, index){
    if(!modelDragState || modelDragState.kind !== kind || modelDragState.index === index) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const list = kind === 'image' ? imageModelList : kind === 'video' ? videoModelList : chatModelList;
    list.querySelectorAll('.model-drop-target').forEach(el => el.classList.remove('model-drop-target'));
    event.currentTarget.classList.add('model-drop-target');
}
function handleModelDrop(event, kind, index){
    event.preventDefault();
    const list = kind === 'image' ? imageModelList : kind === 'video' ? videoModelList : chatModelList;
    list.querySelectorAll('.model-drop-target').forEach(el => el.classList.remove('model-drop-target'));
    if(!modelDragState || modelDragState.kind !== kind || modelDragState.index === index) return;
    const item = provider();
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    const arr = item[key];
    const [moved] = arr.splice(modelDragState.index, 1);
    arr.splice(index, 0, moved);
    modelDragState = null;
    renderModels(kind);
    saveProviders();
}
function handleModelDragEnd(event){
    modelDragState = null;
    event.currentTarget.classList.remove('is-dragging');
    document.querySelectorAll('.model-drop-target').forEach(el => el.classList.remove('model-drop-target'));
}
async function loadProviders(){
    setStatus(tr('api.loading'));
    try {
        const [providerResponse, definitionResponse] = await Promise.all([
            fetch('/api/providers'), fetch('/api/canvas/parameter-schema/definitions')
        ]);
        const data = await providerResponse.json();
        if(!providerResponse.ok) throw new Error(data.detail || tr('api.loadFailed'));
        const definitions = await definitionResponse.json();
        if(!definitionResponse.ok) throw new Error(definitions.detail || '参数 Schema 定义加载失败');
        canvasSchemaDefinitions = definitions.schemas || canvasSchemaDefinitions;
        providers = (data.providers || []);
        providersVersion = Number.isInteger(data.version) ? data.version : null;
        selectedId = isRunningHubAppsPage
            ? providers.find(item => item.id === 'runninghub')?.id || ''
            : sortedProviders()[0]?.id || '';
        selectedModel = {providerId:'', kind:'', name:'', index:-1};
        renderEditor();
        setStatus('');
    } catch(err) {
        setStatus(tr('api.loadFailed'));
    }
}
async function validateProviderParameterSchemas(){
    for(const item of providers){
        if(item.id === 'runninghub' || item.id === 'comfyui') continue;
        const response = await fetch('/api/canvas/parameter-schema/validate', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({parameter_schema:item.parameter_schema || {}})
        });
        const data = await response.json();
        if(!response.ok) throw new Error(`${item.id || 'Provider'}：${data.detail || '参数 Schema 未通过后端校验'}`);
        item.parameter_schema = data.parameter_schema || {};
    }
}
async function saveProviders(){
    syncEditor();
    providers.forEach(item => {
        item.id = normalizeId(item.id);
        item.protocol = item.id === 'runninghub'
            ? 'runninghub'
            : item.id === 'volcengine'
            ? 'volcengine'
            : ['openai', 'gemini', 'omnilojo'].includes(String(item.protocol || '').toLowerCase()) ? String(item.protocol).toLowerCase() : 'openai';
        item.image_generation_endpoint = '';
        item.image_edit_endpoint = '';
        item.image_models = item.id === 'runninghub' ? [] : unique(item.image_models || []);
        item.chat_models = item.id === 'runninghub' ? [] : unique(item.chat_models || []);
        item.video_models = item.id === 'runninghub' ? [] : unique(item.video_models || []);
        item.rh_apps = normalizeRhEntries(item.rh_apps || [], 'app');
    });
    if(new Set(providers.map(item => item.id)).size !== providers.length){
        alert(tr('api.duplicateId'));
        return false;
    }
    setStatus(tr('api.saving'));
    try {
        await validateProviderParameterSchemas();
        if(providersVersion === null){
            await loadProviders();
            throw new Error('Provider configuration version is unavailable; reload before saving.');
        }
        const res = await fetch('/api/providers', {
            method:'PUT',
            headers:{'Content-Type':'application/json', 'If-Match':String(providersVersion)},
            body:JSON.stringify(providers.map(item => ({
                id:item.id,
                base_url:item.base_url,
                protocol:item.id === 'runninghub' ? 'runninghub' : item.id === 'volcengine' ? 'volcengine' : (item.protocol || 'openai'),
                image_generation_endpoint:item.image_generation_endpoint || '',
                image_edit_endpoint:item.image_edit_endpoint || '',
                enabled:item.enabled !== false,
                primary:false,
                image_models:item.id === 'runninghub' ? [] : (item.image_models || []),
                chat_models:item.id === 'runninghub' ? [] : (item.chat_models || []),
                video_models:item.id === 'runninghub' ? [] : (item.video_models || []),
                model_enabled:item.id === 'runninghub' ? {} : ((item.model_enabled && typeof item.model_enabled === 'object') ? item.model_enabled : {}),
                model_protocols:item.id === 'runninghub' ? {} : ((item.model_protocols && typeof item.model_protocols === 'object') ? item.model_protocols : {}),
                model_aliases:item.id === 'runninghub' ? {} : ((item.model_aliases && typeof item.model_aliases === 'object') ? item.model_aliases : {}),
                parameter_schema:item.id === 'runninghub' ? {} : ((item.parameter_schema && typeof item.parameter_schema === 'object') ? item.parameter_schema : {}),
                omnilojo_model_prices:(item.omnilojo_model_prices && typeof item.omnilojo_model_prices === 'object') ? item.omnilojo_model_prices : {},
                rh_apps:item.id === 'runninghub' ? (item.rh_apps || []) : [],
                volcengine_project_name:item.id === 'volcengine' ? (item.volcengine_project_name || VOLCENGINE_DEFAULT_PROJECT_NAME) : '',
                volcengine_region:item.id === 'volcengine' ? (item.volcengine_region || VOLCENGINE_DEFAULT_REGION) : '',
                volcengine_access_key_id:item.volcengine_access_key_id || undefined,
                volcengine_secret_access_key:item.volcengine_secret_access_key || undefined,
                api_key:item.api_key || undefined,
                clear_key:item._clearKey === true,
                omnilojo_management_token:item.omnilojo_management_token || undefined,
                clear_omnilojo_management_token:item._clearOmnilojoManagementToken === true,
                omnilojo_usage_scope:item.omnilojo_usage_scope || 'token',
                omnilojo_admin_user_id:item.omnilojo_admin_user_id || '',
                omnilojo_quota_per_usd:item.omnilojo_quota_per_usd || 500000,
                clear_volcengine_access_key_id:item._clearVolcengineAccessKey === true,
                clear_volcengine_secret_access_key:item._clearVolcengineSecretKey === true
            })))
        });
        if(!res.ok) throw new Error((await res.json()).detail || tr('api.saveFailed'));
        const data = await res.json();
        providers = data.providers || providers;
        providersVersion = Number.isInteger(data.version) ? data.version : providersVersion;
        providers.forEach(item => {
            delete item.api_key;
            delete item.omnilojo_management_token;
            delete item._clearOmnilojoManagementToken;
            delete item.volcengine_access_key_id;
            delete item.volcengine_secret_access_key;
            delete item._clearKey;
            delete item._clearVolcengineAccessKey;
            delete item._clearVolcengineSecretKey;
        });
        selectedId = provider()?.id || providers[0]?.id || '';
        renderEditor();
        setStatus(tr('api.saved'));
        broadcastStudioApiChange('providers-changed');
        return true;
    } catch(err) {
        setStatus(err.message || tr('api.saveFailed'));
        return false;
    }
}
function escapeHtml(str){
    return String(str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function escapeAttr(str){ return escapeHtml(str).replace(/`/g, '&#96;'); }
window.addEventListener('message', event => {
    if(event.data?.type === 'studio-theme' && window.StudioTheme) window.StudioTheme.set(event.data.theme);
    if(event.data?.type === 'studio-lang' && window.StudioI18n) {
        window.StudioI18n.set(event.data.lang);
        renderEditor();
    }
});
rhWorkflowEditorOverlay?.addEventListener('mousedown', event => {
    if(event.target === rhWorkflowEditorOverlay) closeRhWorkflowEditor();
});
window.addEventListener('studio-lang-change', () => {
    renderEditor();
});
window.onload = () => {
    if(window.StudioTheme) window.StudioTheme.apply();
    if(window.StudioI18n) window.StudioI18n.apply();
    if(isRunningHubAppsPage){
        const title = document.querySelector('.page-head .title');
        const subtitle = document.querySelector('.page-head .sub');
        if(title) title.textContent = 'RH应用';
        if(subtitle) subtitle.textContent = '管理可用于画布的 RunningHub AI 应用。';
    }
    loadProviders();
    if(protocolInput) protocolInput.addEventListener('change', updateProtocolFromInput);
    [keyInput, rhFreeKeyInput].forEach(input => {
        if(input) input.addEventListener('input', refreshProviderOnboarding);
    });
    selectedModelAliasInput?.addEventListener('input', event => updateSelectedModelAlias(event.target.value));
    selectedModelProtocol?.addEventListener('change', event => updateSelectedModelProtocol(event.target.value));
    selectedModelInputPrice?.addEventListener('input', event => updateSelectedModelPrice('input_per_million', event.target.value));
    selectedModelOutputPrice?.addEventListener('input', event => updateSelectedModelPrice('output_per_million', event.target.value));
};
