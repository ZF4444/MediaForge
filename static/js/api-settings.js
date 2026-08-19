const apiSettingsQuery = new URLSearchParams(window.location.search);
const isRunningHubAppsPage = apiSettingsQuery.get('mode') === 'runninghub-apps';
const isEmbeddedApiSettings = apiSettingsQuery.get('embedded') === '1';
if(isRunningHubAppsPage) document.body.classList.add('runninghub-apps-page');
if(isEmbeddedApiSettings) document.body.classList.add('embedded-api-settings');

let providers = [];
let providersVersion = null;
let selectedId = '';
let selectedModel = { providerId:'', kind:'', name:'', index:-1 };
const expandedModelKinds = new Set(['image', 'chat', 'video']);
const providerList = document.getElementById('providerList');
const editorTitle = document.getElementById('editorTitle');
const statusEl = document.getElementById('status');
const nameInput = document.getElementById('nameInput');
const idInput = document.getElementById('idInput');
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
const VOLCENGINE_DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const VOLCENGINE_DEFAULT_PROJECT_NAME = 'default';
const VOLCENGINE_DEFAULT_REGION = 'cn-beijing';
const RH_DEFAULT_BASE_URL = 'https://www.runninghub.cn';
const EXAMPLE_BASE_URL = 'https://api.example.com/v1';
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
function deriveIdFromName(name, existingId){
    if(existingId) return existingId;
    let id = normalizeId(name) || `api-${Math.random().toString(36).slice(2, 8)}`;
    let candidate = id, index = 2;
    while(providers.some(item => item.id === candidate)) candidate = `${id}-${index++}`;
    return candidate;
}
function updateIdPreview(){
    const item = provider();
    const idPreview = document.getElementById('idPreview');
    if(!item || !idPreview) return;
    if(['comfyui', 'runninghub', 'volcengine'].includes(item.id)){
        idPreview.textContent = item.id;
        return;
    }
    idPreview.textContent = deriveIdFromName(nameInput.value, item.id);
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
function allModelEntries(){
    return visibleProviders().filter(item => !['runninghub','comfyui'].includes(item.id)).flatMap(providerModels);
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
function isFixedProvider(itemOrId){
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId?.id;
    return id === 'comfyui' || id === 'runninghub' || id === 'volcengine';
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
    const oldId = item.id;
    const isBuiltin = item.id === 'comfyui' || item.id === 'runninghub' || item.id === 'volcengine';
    // 内置和自定义平台的 ID 都保持稳定；新建时若没有 ID 才生成一次。
    const nextId = isBuiltin ? item.id : deriveIdFromName(nameInput.value, item.id);
    item.id = nextId;
    if(oldId !== item.id) selectedId = item.id;
    item.name = nameInput.value.trim() || item.id;
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
    const order = ['volcengine', 'runninghub', 'comfyui'];
    return visibleProviders().sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        if(ai === -1 && bi === -1) return 0;
        if(ai === -1) return 1;
        if(bi === -1) return -1;
        return ai - bi;
    });
}
function providerDragAttrs(item){
    if(isFixedProvider(item)) return '';
    const id = escapeAttr(item.id);
    return ` draggable="true" data-provider-id="${id}" ondragstart="handleProviderDragStart(event,'${id}')" ondragover="handleProviderDragOver(event,'${id}')" ondrop="handleProviderDrop(event,'${id}')" ondragend="handleProviderDragEnd()"`;
}
function renderProviderList(){
    const specialCards = sortedProviders().filter(item => ['runninghub','comfyui'].includes(item.id)).map(item => {
        const active = item.id === selectedId ? 'active' : '';
        const stateClass = item.enabled === false ? 'is-disabled' : (item.has_key ? 'has-key' : 'missing-key');
        if(item.id === 'runninghub'){
            return `
                <button class="provider-card provider-card-banner ${active} ${stateClass}" type="button" onclick="selectProvider('${escapeHtml(item.id)}')">
                    <span class="provider-banner-inner">
                        <span class="provider-logo-wrap">
                            <img src="/static/images/RunningHub-B.png" alt="RunningHub" class="runninghub-icon ms-icon-light">
                            <img src="/static/images/RunningHub-W.png" alt="RunningHub" class="runninghub-icon ms-icon-dark">
                            <span class="provider-logo-fallback">RunningHub</span>
                        </span>
                        <span class="provider-protocol-pill">RH</span>
                    </span>
                </button>
            `;
        }
        if(item.id === 'comfyui'){
            return `
                <button class="provider-card provider-card-banner ${active} ${stateClass}" type="button" onclick="selectProvider('${escapeHtml(item.id)}')">
                    <span class="provider-banner-inner">
                        <span class="provider-logo-wrap"><span class="comfyui-wordmark">ComfyUI</span></span>
                        <span class="provider-protocol-pill">Local</span>
                    </span>
                </button>
            `;
        }
        return '';
    }).join('');
    const entries = allModelEntries();
    const modelGroups = ['image', 'chat', 'video'].map(kind => {
        const models = entries.filter(model => model.kind === kind);
        const expanded = expandedModelKinds.has(kind);
        return `<section class="model-kind-group ${expanded ? 'expanded' : ''}">
            <button class="model-kind-head" type="button" onclick="toggleModelKind('${kind}')">
                <span class="model-kind-title"><i data-lucide="${modelKindIcon(kind)}" class="w-3.5 h-3.5"></i><span>${escapeHtml(modelKindLabel(kind))}</span></span>
                <span class="model-kind-count">${models.length}</span>
                <i data-lucide="chevron-down" class="model-kind-caret"></i>
            </button>
            <div class="model-kind-items">${models.map(model => {
                const item = providers.find(providerItem => providerItem.id === model.providerId);
                const activeModel = selectedModel.providerId === model.providerId && selectedModel.kind === model.kind && selectedModel.index === model.index;
                const alias = item?.model_aliases?.[model.name] || '';
                const source = `${item?.name || model.providerId} · ${protocolLabel(model.protocol)}`;
                return `<button class="provider-model-card ${activeModel ? 'active' : ''}" type="button" onclick="selectModel('${escapeAttr(model.providerId)}','${model.kind}',${model.index})">
                    <span class="provider-model-icon"><i data-lucide="${modelKindIcon(model.kind)}" class="w-3.5 h-3.5"></i></span>
                    <span class="provider-model-info"><span class="provider-model-name">${escapeHtml(alias || model.label)}</span><span class="provider-model-meta">${escapeHtml(source)}${model.hasKey ? ' · 已配置 Key' : ' · 未配置 Key'}</span></span>
                    <span class="provider-status-dot"></span>
                </button>`;
            }).join('') || `<div class="provider-model-empty">暂无${escapeHtml(modelKindLabel(kind))}</div>`}
                <button class="model-kind-add" type="button" onclick="addModel('${kind}')"><i data-lucide="plus" class="w-3.5 h-3.5"></i><span>添加模型</span></button>
            </div>
        </section>`;
    }).join('');
    providerList.innerHTML = specialCards + modelGroups;
    refreshIcons();
}
function toggleModelKind(kind){
    if(expandedModelKinds.has(kind)) expandedModelKinds.delete(kind);
    else expandedModelKinds.add(kind);
    renderProviderList();
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
    if(isModelFirstProvider(item) && selectedRef){
        editorTitle.textContent = item.model_aliases?.[selectedRef.name] || selectedRef.name || '未命名模型';
    } else {
        editorTitle.textContent = item.name || item.id;
    }
    const enabledToggle = document.getElementById('enabledToggle');
    if(enabledToggle) enabledToggle.checked = item.enabled !== false;
    nameInput.value = item.name || '';
    idInput.value = item.id || '';
    updateIdPreview();
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
        editorSub.textContent = isComfyui ? '管理工作流运行所使用的 ComfyUI 后端地址。' : isModelFirstProvider(item) ? '配置当前模型及其协议连接参数。' : tr('api.editorSub');
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
    if(deleteBtn) deleteBtn.style.display = isModelFirstProvider(item) || isFixedProvider(item) ? 'none' : 'inline-flex';
    const deleteModelBtn = document.getElementById('deleteModelBtn');
    if(deleteModelBtn) deleteModelBtn.style.display = isModelFirstProvider(item) && !isRunningHubAppsPage && Boolean(selectedRef) ? 'inline-flex' : 'none';
    if(enabledToggle) enabledToggle.disabled = isComfyui;
    const enabledToggleWrap = enabledToggle?.closest('.provider-enable-toggle');
    if(enabledToggleWrap) enabledToggleWrap.hidden = isModelFirstProvider(item);
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
    if(modelGrid && isModelFirstProvider(item)) modelGrid.hidden = true;
    document.querySelectorAll('.model-list').forEach(list => list.closest('.block').hidden = isComfyui || isRunningHub);
    renderModels('image');
    renderModels('chat');
    renderModels('video');
    renderProviderList();
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
function modelProtocolSelectHtml(kind, index, model, item){
    if(kind === 'video' || !providerSupportsModelProtocol(item)) return '';
    const map = (item.model_protocols && typeof item.model_protocols === 'object') ? item.model_protocols : {};
    const current = String(map[String(model || '').trim()] || '').toLowerCase();
    const opt = (val, label) => `<option value="${val}" ${current === val ? 'selected' : ''}>${label}</option>`;
    return `<select class="model-protocol-select" title="当前模型使用的 API协议" onchange="updateModelProtocol('${kind}', ${index}, this.value)">
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
        <div class="model-row${showProtocol ? ' has-protocol' : ''}" draggable="true" data-kind="${kind}" data-index="${index}" ondragstart="handleModelDragStart(event,'${kind}',${index})" ondragover="handleModelDragOver(event,'${kind}',${index})" ondrop="handleModelDrop(event,'${kind}',${index})" ondragend="handleModelDragEnd(event)">
            <span class="model-drag-handle"><i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i></span>
            <input value="${escapeAttr(model)}" readonly title="模型 ID">
            <input class="model-alias-input" value="${escapeAttr(alias)}" oninput="updateModelAlias('${kind}', ${index}, this.value)" placeholder="别名（选填）" title="画布中显示的名称">
            ${modelProtocolSelectHtml(kind, index, model, item)}
            ${showPrices(model) ? `<div class="model-price-fields"><label>入 <input type="number" min="0" step="0.0001" value="${escapeAttr(price.input_per_million ?? '')}" oninput="updateOmnilojoModelPrice('${kind}', ${index}, 'input_per_million', this.value)" title="输入 USD / 100 万 token"></label><label>出 <input type="number" min="0" step="0.0001" value="${escapeAttr(price.output_per_million ?? '')}" oninput="updateOmnilojoModelPrice('${kind}', ${index}, 'output_per_million', this.value)" title="输出 USD / 100 万 token"></label></div>` : ''}
            <button class="icon-btn" type="button" onclick="removeModel('${kind}', ${index})" title="删除"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
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
    addModel('chat');
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
        item = {id:'api-openai', name:'OpenAI', base_url:'', protocol:'openai', image_generation_endpoint:'', image_edit_endpoint:'', enabled:true, primary:false, image_models:[], chat_models:[], video_models:[], has_key:false, key_preview:''};
        let suffix = 2;
        while(providers.some(candidate => candidate.id === item.id)) item.id = `api-openai-${suffix++}`;
        providers.push(item);
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
        const data = await fetch('/api/providers').then(r => r.json());
        providers = (data.providers || []);
        providersVersion = Number.isInteger(data.version) ? data.version : null;
        const firstModel = allModelEntries()[0];
        selectedId = isRunningHubAppsPage
            ? providers.find(item => item.id === 'runninghub')?.id || ''
            : firstModel?.providerId || sortedProviders()[0]?.id || '';
        selectedModel = firstModel ? {providerId:firstModel.providerId, kind:firstModel.kind, index:firstModel.index, name:firstModel.name} : {providerId:'', kind:'', name:'', index:-1};
        renderEditor();
        setStatus('');
    } catch(err) {
        setStatus(tr('api.loadFailed'));
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
        if(providersVersion === null){
            await loadProviders();
            throw new Error('Provider configuration version is unavailable; reload before saving.');
        }
        const res = await fetch('/api/providers', {
            method:'PUT',
            headers:{'Content-Type':'application/json', 'If-Match':String(providersVersion)},
            body:JSON.stringify(providers.map(item => ({
                id:item.id,
                name:item.name,
                base_url:item.base_url,
                protocol:item.id === 'runninghub' ? 'runninghub' : item.id === 'volcengine' ? 'volcengine' : (item.protocol || 'openai'),
                image_generation_endpoint:item.image_generation_endpoint || '',
                image_edit_endpoint:item.image_edit_endpoint || '',
                enabled:item.enabled !== false,
                primary:false,
                image_models:item.id === 'runninghub' ? [] : (item.image_models || []),
                chat_models:item.id === 'runninghub' ? [] : (item.chat_models || []),
                video_models:item.id === 'runninghub' ? [] : (item.video_models || []),
                model_protocols:item.id === 'runninghub' ? {} : ((item.model_protocols && typeof item.model_protocols === 'object') ? item.model_protocols : {}),
                model_aliases:item.id === 'runninghub' ? {} : ((item.model_aliases && typeof item.model_aliases === 'object') ? item.model_aliases : {}),
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
    if(nameInput) nameInput.addEventListener('input', updateIdPreview);
    if(protocolInput) protocolInput.addEventListener('change', updateProtocolFromInput);
    [keyInput, rhFreeKeyInput].forEach(input => {
        if(input) input.addEventListener('input', refreshProviderOnboarding);
    });
    selectedModelAliasInput?.addEventListener('input', event => updateSelectedModelAlias(event.target.value));
    selectedModelProtocol?.addEventListener('change', event => updateSelectedModelProtocol(event.target.value));
    selectedModelInputPrice?.addEventListener('input', event => updateSelectedModelPrice('input_per_million', event.target.value));
    selectedModelOutputPrice?.addEventListener('input', event => updateSelectedModelPrice('output_per_million', event.target.value));
};
