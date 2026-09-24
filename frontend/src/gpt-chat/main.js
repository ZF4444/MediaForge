        import { createIcons, Boxes, Check, ChevronUp, Clock3, File, MessagesSquare, Paperclip, Plus, Ruler, Send, SlidersHorizontal, X } from 'lucide';
        import { applyTranslations, t } from './i18n.js';
        import { initializePageTheme } from '../shared/theme-runtime.js';
        import { apiJson, apiStream, apiForm } from '../services/http.js';
        initializePageTheme();
        const chatIcons = { Boxes, Check, ChevronUp, Clock3, File, MessagesSquare, Paperclip, Plus, Ruler, Send, SlidersHorizontal, X };
        const lucide = { createIcons: root => createIcons({ icons: chatIcons, root }) };
        lucide.createIcons();
        function tr(key){ return t(key); }
        function defaultTitle(){ return tr('chat.newConversation'); }
        function setChatTitle(title){
            document.getElementById('chatTitle').textContent = title || defaultTitle();
        }
        function applyLanguage(){
            applyTranslations();
            document.title = tr('chat.title');
            if(!currentConversation?.title || currentConversation.title === '新对话' || currentConversation.title === 'New Chat') setChatTitle('');
            renderThreads();
        }
        /* Refresh text after local data is rendered. */
        function refreshChatLanguageView(){
            applyTranslations();
            document.title = tr('chat.title');
            if(!currentConversation?.title || currentConversation.title === '新对话' || currentConversation.title === 'New Chat') setChatTitle('');
            renderThreads();
        }
        window.addEventListener('resize', () => {
            if(document.getElementById('modelPicker')?.classList.contains('open')) positionModelPicker();
            if(document.getElementById('resolutionPicker')?.classList.contains('open')) positionResolutionPicker();
        });
        function uuid(){
            if(crypto?.randomUUID) return crypto.randomUUID();
            return 'u-' + Math.random().toString(16).slice(2) + Date.now();
        }

        const USER_KEY = 'gpt_chat_browser_user';
        const CHAT_SETTINGS_KEY = 'gpt_chat_settings_v1';
        const CHAT_LAST_CONVERSATION_KEY = 'gpt_chat_last_conversation_v1';
        const CHAT_ATTACHMENT_MAX = 20;
        const CHAT_SIZE_MODE_VERSION = 2;
        const userId = localStorage.getItem(USER_KEY) || uuid();
        localStorage.setItem(USER_KEY, userId);

        function readChatSettings(){
            try {
                const raw = localStorage.getItem(CHAT_SETTINGS_KEY);
                const parsed = raw ? JSON.parse(raw) : {};
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch(e) {
                return {};
            }
        }

        function isObject(value){
            return value && typeof value === 'object' && !Array.isArray(value);
        }

        const savedChatSettings = readChatSettings();
        let conversations = [];
        let currentConversation = null;
        applyLanguage();
        let mode = 'agent';
        let chatConnectionId = savedChatSettings.chatConnectionId || '';
        let msModel = savedChatSettings.msModel || '';
        let activeChatModel = savedChatSettings.activeChatModel || '';
        let imageConnectionId = savedChatSettings.imageConnectionId || '';
        let activeImageModel = savedChatSettings.activeImageModel || '';
        let systemPrompt = String(savedChatSettings.systemPrompt || '').trim();
        let aiConnections = [];
        let aiResources = {connections:[], models:[], resources:[]};
        let chatConnectionModels = isObject(savedChatSettings.chatConnectionModels) ? savedChatSettings.chatConnectionModels : {};
        let chatRatio = ['square','portrait','portrait43','landscape43','landscape','story','wide'].includes(savedChatSettings.chatRatio) ? savedChatSettings.chatRatio : 'square';
        let chatResolution = savedChatSettings.chatSizeModeVersion === CHAT_SIZE_MODE_VERSION && ['auto','1k','2k','4k','custom'].includes(savedChatSettings.chatResolution) ? savedChatSettings.chatResolution : 'auto';
        let chatPresetResolution = ['1k','2k','4k'].includes(savedChatSettings.chatPresetResolution) ? savedChatSettings.chatPresetResolution : (chatResolution === 'custom' ? '1k' : chatResolution);
        let chatCustomSize = normalizeChatCustomSize(savedChatSettings.chatCustomSize || '') || '1024x1024';
        let modelPickerScope = savedChatSettings.modelPickerScope === 'image' ? 'image' : 'chat';
        let modelPickerHome = null;
        let resolutionPickerHome = null;
        let refs = [];
        let config = { chat_model: 'gpt-5.5', image_model: 'gpt-image-2', ms_chat_models: [] };

        const SIZE_OPTIONS = {
            square: [['1024x1024','1k'], ['1536x1536','2k'], ['2048x2048','4k']],
            portrait: [['720x1080','1k'], ['1024x1536','2k'], ['1365x2048','4k']],
            portrait43: [['1008x1344','1k'], ['1536x2048','2k'], ['2448x3264','4k']],
            landscape43: [['1344x1008','1k'], ['2048x1536','2k'], ['3264x2448','4k']],
            landscape: [['1080x720','1k'], ['1536x1024','2k'], ['2048x1365','4k']],
            story: [['720x1280','1k'], ['1080x1920','2k'], ['1440x2560','4k']],
            wide: [['1280x720','1k'], ['1920x1080','2k'], ['2560x1440','4k']]
        };
        const CHAT_RATIO_VALUES = {
            square:'1:1',
            portrait:'2:3',
            landscape:'3:2',
            portrait43:'3:4',
            landscape43:'4:3',
            story:'9:16',
            wide:'16:9'
        };

        const headers = () => ({'Content-Type':'application/json', 'X-User-ID':userId});

        function stableTarget(connectionId, model, kind='chat'){
            const connection = (aiResources.connections || []).find(item =>
                item.enabled !== false && (item.id === connectionId || item.runtime_id === connectionId || item.settings?.runtime_id === connectionId)
            );
            const models = (aiResources.models || []).filter(item => item.enabled !== false && item.kind === kind && (!connection || item.connection_id === connection.id));
            const selected = models.find(item => item.upstream_model === model || item.alias === model) || models[0];
            return {connection_id: selected?.connection_id || connection?.id || '', model_id: selected?.id || '', resource_id: ''};
        }

        function stableImageTarget(){
            return stableTarget(imageConnectionId, activeImageModel, 'image');
        }

        function rememberConversation(id){
            try {
                if(id) localStorage.setItem(CHAT_LAST_CONVERSATION_KEY, id);
                else localStorage.removeItem(CHAT_LAST_CONVERSATION_KEY);
            } catch(e) {}
        }

        function rememberedConversation(){
            try { return localStorage.getItem(CHAT_LAST_CONVERSATION_KEY) || ''; }
            catch(e) { return ''; }
        }

        function saveChatSettings(){
            try {
                localStorage.setItem(CHAT_SETTINGS_KEY, JSON.stringify({
                    mode,
                    chatConnectionId,
                    msModel,
                    activeChatModel,
                    imageConnectionId,
                    activeImageModel,
                    systemPrompt,
                    chatConnectionModels,
                    chatRatio,
                    chatResolution,
                    chatPresetResolution,
                    chatCustomSize,
                    modelPickerScope,
                    chatSizeModeVersion: CHAT_SIZE_MODE_VERSION
                }));
            } catch(e) {}
        }

        function syncSystemPromptUI(){
            const input = document.getElementById('systemPromptInput');
            if(input) input.value = systemPrompt || '';
        }

        function toggleSystemPrompt(force){
            const pop = document.getElementById('systemPromptPopover');
            if(!pop) return;
            const shouldOpen = typeof force === 'boolean' ? force : !pop.classList.contains('open');
            pop.classList.toggle('open', shouldOpen);
            if(shouldOpen){
                toggleHistory(false);
                syncSystemPromptUI();
                lucide.createIcons();
            }
        }

        function saveSystemPromptFromUI(){
            const input = document.getElementById('systemPromptInput');
            systemPrompt = String(input?.value || '').trim();
            saveChatSettings();
            toggleSystemPrompt(false);
        }

        function clearSystemPrompt(){
            systemPrompt = '';
            const input = document.getElementById('systemPromptInput');
            if(input) input.value = '';
            saveChatSettings();
        }

        function currentSystemPrompt(){
            const pop = document.getElementById('systemPromptPopover');
            const input = document.getElementById('systemPromptInput');
            const value = pop?.classList.contains('open') && input ? input.value : systemPrompt;
            return String(value || '').trim();
        }

        function uniqueModels(list){
            const seen = new Set();
            return (list || []).map(item => String(item || '').trim()).filter(item => item && !seen.has(item) && seen.add(item));
        }
        function chatConnections(){
            const list = (aiConnections || []).filter(p => p.enabled !== false && (p.chat_models || []).length);
            if(config.ms_chat_models?.length && !list.some(p => p.id === 'modelscope')) list.push({id:'modelscope', name:'ModelScope', chat_models:config.ms_chat_models, image_models:[]});
            return list.length ? list : [{id:'comfly', name:'API', chat_models:[config.chat_model || 'gpt-4o-mini'], image_models:[config.image_model || 'gpt-image-2']}];
        }
        function imageConnections(){
            const list = (aiConnections || []).filter(p => p.enabled !== false && (p.image_models || []).length);
            return list.length ? list : [{id:'comfly', name:'API', image_models:[config.image_model || 'gpt-image-2'], chat_models:[config.chat_model || 'gpt-4o-mini']}];
        }
        function connectionById(id, kind='chat'){
            const list = kind === 'image' ? imageConnections() : chatConnections();
            return list.find(p => p.id === id) || list[0];
        }
        function activePickerKind(){
            return mode === 'image' ? 'image' : (mode === 'agent' ? modelPickerScope : 'chat');
        }
        function currentConnectionId(kind=activePickerKind()){
            return kind === 'image' ? imageConnectionId : chatConnectionId;
        }
        function modelListForCurrent(kind=activePickerKind()){
            const item = connectionById(currentConnectionId(kind), kind);
            return uniqueModels(kind === 'image' ? item.image_models : item.chat_models);
        }
        function currentModel(kind=activePickerKind()){
            return kind === 'image' ? activeImageModel : activeChatModel;
        }
        function connectionNameById(id, kind=activePickerKind()){
            const item = connectionById(id, kind);
            return item?.name || item?.id || 'API';
        }
        function shortModelName(value){
            return String(value || '').split('/').pop().split(':')[0] || 'Model';
        }
        function renderProviderControls(){
            const kind = activePickerKind();
            const connections = kind === 'image' ? imageConnections() : chatConnections();
            const cid = currentConnectionId(kind);
            if(!connections.some(p => p.id === cid)) {
                if(kind === 'image') imageConnectionId = connections[0]?.id || '';
                else chatConnectionId = connections[0]?.id || '';
            }
            const models = modelListForCurrent(kind);
            if(kind === 'image' && !models.includes(activeImageModel)) activeImageModel = models[0] || config.image_model;
            if(kind !== 'image' && !models.includes(activeChatModel)) activeChatModel = chatConnectionModels[chatConnectionId] && models.includes(chatConnectionModels[chatConnectionId]) ? chatConnectionModels[chatConnectionId] : (models[0] || config.chat_model);
            renderModelPicker();
        }

        function validateSavedProviderState(){
            const chatProviderList = chatConnections();
            chatConnectionId = chatProviderList.some(p => p.id === chatConnectionId) ? chatConnectionId : (chatProviderList[0]?.id || '');
            const chatModels = uniqueModels(connectionById(chatConnectionId, 'chat')?.chat_models || []);
            const rememberedChatModel = chatConnectionModels[chatConnectionId];
            activeChatModel = chatModels.includes(activeChatModel)
                ? activeChatModel
                : (chatModels.includes(rememberedChatModel) ? rememberedChatModel : (chatModels[0] || config.chat_model));
            chatConnectionModels[chatConnectionId] = activeChatModel;
            if(config.ms_chat_models?.length && msModel && !config.ms_chat_models.includes(msModel)) msModel = config.ms_chat_models[0];
            if(config.ms_chat_models?.length && chatConnectionId === 'modelscope') activeChatModel = msModel || config.ms_chat_models[0];

            const imageProviderList = imageConnections();
            imageConnectionId = imageProviderList.some(p => p.id === imageConnectionId) ? imageConnectionId : (imageProviderList[0]?.id || '');
            const imageModels = uniqueModels(connectionById(imageConnectionId, 'image')?.image_models || []);
            activeImageModel = imageModels.includes(activeImageModel) ? activeImageModel : (imageModels[0] || config.image_model);
            if(mode !== 'agent' && mode !== 'chat' && mode !== 'image') mode = 'chat';
            if(mode === 'chat') modelPickerScope = 'chat';
            if(mode === 'image') modelPickerScope = 'image';
        }

        async function loadConfig(){
            try {
                const stable = await apiJson('/api/ai/configuration');
                aiResources = stable;
                const byConnection = new Map((stable.connections || []).map(c => [c.id, c]));
                aiConnections = [...byConnection.values()].map(c => ({...c, id:c.id, connection_id:c.id,
                    chat_models:(stable.models || []).filter(m => m.connection_id === c.id && m.kind === 'chat' && m.enabled !== false).map(m => m.upstream_model),
                    image_models:(stable.models || []).filter(m => m.connection_id === c.id && m.kind === 'image' && m.enabled !== false).map(m => m.upstream_model),
                    video_models:(stable.models || []).filter(m => m.connection_id === c.id && m.kind === 'video' && m.enabled !== false).map(m => m.upstream_model),
                    rh_apps:(stable.resources || []).filter(r => r.connection_id === c.id && r.kind === 'runninghub_app' && r.enabled !== false).map(r => ({...r.settings, id:r.id, name:r.name}))
                }));
                const data = {chat_models:aiConnections.flatMap(p => p.chat_models), image_models:aiConnections.flatMap(p => p.image_models), video_models:aiConnections.flatMap(p => p.video_models)};
                config = { ...config, ...data };
                config.chat_model = (config.chat_models || []).find(m => m === 'gpt-5.5') || config.chat_model || 'gpt-5.5';
                config.image_model = config.image_model || ((config.image_models || [])[0]) || 'gpt-image-2';
                validateSavedProviderState();
                setMode(mode, false);
                updateModelLabel();
                saveChatSettings();
            } catch(e) {}
        }
        try {
            const apiChannel = new BroadcastChannel('studio-api');
            apiChannel.addEventListener('message', async (e) => {
                if(e.data?.type === 'ai-configuration-changed'){
                    await loadConfig();
                    renderProviderControls();
                    updateModelLabel();
                }
            });
        } catch(e) {}

        function setConnection(p, kind=activePickerKind()) {
            if(kind === 'image') imageConnectionId = p;
            else chatConnectionId = p;
            const models = modelListForCurrent(kind);
            if(kind === 'image') activeImageModel = models[0] || activeImageModel;
            else {
                activeChatModel = chatConnectionModels[chatConnectionId] && models.includes(chatConnectionModels[chatConnectionId]) ? chatConnectionModels[chatConnectionId] : (models[0] || activeChatModel);
            }
            renderProviderControls();
            updateModelLabel();
            saveChatSettings();
        }
        function setActiveModel(model, kind=activePickerKind()){
            if(kind === 'image') activeImageModel = model;
            else {
                activeChatModel = model;
                chatConnectionModels[chatConnectionId] = model;
            }
            renderProviderControls();
            updateModelLabel();
            saveChatSettings();
        }

        function toggleModelPicker(force){
            const picker = document.getElementById('modelPicker');
            const pop = document.getElementById('modelPickerPopover');
            const shouldOpen = typeof force === 'boolean' ? force : !picker.classList.contains('open');
            picker.classList.toggle('open', shouldOpen);
            pop?.classList.toggle('open', shouldOpen);
            if(shouldOpen) {
                toggleResolutionPicker(false);
                if(pop && pop.parentElement !== document.body) {
                    modelPickerHome = picker;
                    document.body.appendChild(pop);
                }
                if(mode === 'image') modelPickerScope = 'image';
                if(mode === 'chat') modelPickerScope = 'chat';
                renderModelPicker();
                positionModelPicker();
                lucide.createIcons();
            } else if(pop && modelPickerHome && pop.parentElement === document.body) {
                modelPickerHome.appendChild(pop);
            }
        }

        function positionModelPicker(){
            const btn = document.getElementById('modelPickerBtn');
            const pop = document.getElementById('modelPickerPopover');
            if(!btn || !pop) return;
            const rect = btn.getBoundingClientRect();
            const viewportW = (window.visualViewport?.width || window.innerWidth);
            const viewportH = (window.visualViewport?.height || window.innerHeight);
            const width = Math.min(380, Math.max(300, viewportW - 32));
            const maxHeight = Math.min(390, viewportH - 24);
            const left = Math.min(Math.max(16, rect.left), Math.max(16, viewportW - width - 16));
            pop.style.setProperty('--model-picker-left', `${Math.round(left)}px`);
            // Start below the trigger so the first measurement reflects the real
            // content height instead of the configured max-height.
            pop.style.setProperty('--model-picker-top', `${Math.round(rect.bottom + 8)}px`);
            pop.style.setProperty('--model-picker-width', `${Math.round(width)}px`);
            pop.style.setProperty('--model-picker-max-height', `${Math.round(maxHeight)}px`);
            requestAnimationFrame(() => {
                const box = pop.getBoundingClientRect();
                const nextLeft = box.right > viewportW - 12 ? (left - (box.right - viewportW + 12)) : left;
                const belowTop = rect.bottom + 8;
                const nextTop = belowTop + box.height <= viewportH - 12
                    ? belowTop
                    : rect.top - box.height - 8;
                pop.style.setProperty('--model-picker-left', `${Math.round(Math.max(12, nextLeft))}px`);
                pop.style.setProperty('--model-picker-top', `${Math.round(Math.max(12, nextTop))}px`);
            });
        }
        function toggleResolutionPicker(force){
            const picker = document.getElementById('resolutionPicker');
            const pop = document.getElementById('resolutionPickerPopover');
            if(!picker) return;
            const shouldOpen = typeof force === 'boolean' ? force : !picker.classList.contains('open');
            picker.classList.toggle('open', shouldOpen);
            pop?.classList.toggle('open', shouldOpen);
            if(shouldOpen){
                toggleModelPicker(false);
                if(pop && pop.parentElement !== document.body){
                    resolutionPickerHome = picker;
                    document.body.appendChild(pop);
                }
                updateChatResolutionUI();
                positionResolutionPicker();
                lucide.createIcons();
            } else if(pop && resolutionPickerHome && pop.parentElement === document.body){
                resolutionPickerHome.appendChild(pop);
            }
        }

        function positionResolutionPicker(){
            const btn = document.getElementById('resolutionPickerBtn');
            const pop = document.getElementById('resolutionPickerPopover');
            if(!btn || !pop) return;
            const rect = btn.getBoundingClientRect();
            const viewportW = (window.visualViewport?.width || window.innerWidth);
            const viewportH = (window.visualViewport?.height || window.innerHeight);
            const desiredWidth = chatResolution === 'auto' ? 300 : (chatResolution === 'custom' ? 340 : 420);
            const width = Math.min(desiredWidth, Math.max(260, viewportW - 32));
            const safeX = 12;
            const safeTop = 12;
            const safeBottom = 18;
            const gap = 10;
            const left = Math.min(Math.max(safeX, rect.left + rect.width / 2 - width / 2), Math.max(safeX, viewportW - width - safeX));
            const availableAbove = Math.max(96, rect.top - safeTop - gap);
            const initialHeight = Math.min(chatResolution === 'auto' ? 220 : 390, availableAbove, viewportH - safeTop - safeBottom);
            const initialTop = Math.max(safeTop, rect.top - initialHeight - gap);
            pop.style.setProperty('--resolution-picker-left', `${Math.round(left)}px`);
            pop.style.setProperty('--resolution-picker-top', `${Math.round(initialTop)}px`);
            pop.style.setProperty('--resolution-picker-width', `${Math.round(width)}px`);
            pop.style.setProperty('--resolution-picker-max-height', `${Math.round(initialHeight)}px`);
            pop.style.setProperty('--resolution-picker-list-height', '320px');
            requestAnimationFrame(() => {
                const naturalHeight = Math.ceil(pop.scrollHeight || pop.getBoundingClientRect().height || 160);
                const maxHeight = Math.max(96, Math.min(naturalHeight, availableAbove, viewportH - safeTop - safeBottom));
                const headHeight = Math.ceil(pop.querySelector('.resolution-picker-head')?.getBoundingClientRect().height || 50);
                const listHeight = Math.max(58, maxHeight - headHeight - 20);
                const top = Math.max(safeTop, rect.top - maxHeight - gap);
                pop.style.setProperty('--resolution-picker-max-height', `${Math.round(maxHeight)}px`);
                pop.style.setProperty('--resolution-picker-list-height', `${Math.round(listHeight)}px`);
                pop.style.setProperty('--resolution-picker-top', `${Math.round(top)}px`);
                const box = pop.getBoundingClientRect();
                const nextLeft = box.right > viewportW - 12 ? (left - (box.right - viewportW + 12)) : left;
                const overlap = box.bottom - (rect.top - 8);
                const nextTop = overlap > 0 ? (top - overlap - 2) : top;
                pop.style.setProperty('--resolution-picker-left', `${Math.round(Math.max(12, nextLeft))}px`);
                pop.style.setProperty('--resolution-picker-top', `${Math.round(Math.max(12, nextTop))}px`);
            });
        }

        function setModelPickerScope(kind){
            modelPickerScope = kind === 'image' ? 'image' : 'chat';
            renderProviderControls();
            updateModelLabel();
            saveChatSettings();
        }

        function renderModelPicker(){
            const kind = activePickerKind();
            const picker = document.getElementById('modelPicker');
            const scope = document.getElementById('modelPickerScope');
            const providerList = document.getElementById('modelConnectionList');
            const modelList = document.getElementById('modelList');
            const providerLabel = document.getElementById('modelPickerProvider');
            const modelLabel = document.getElementById('modelPickerModel');
            const title = document.getElementById('modelPickerTitle');
            if(!picker || !scope || !providerList || !modelList) return;
            const currentPid = currentConnectionId(kind);
            const currentMdl = currentModel(kind);
            providerLabel.textContent = connectionNameById(currentPid, kind);
            if(mode === 'agent') {
                modelLabel.textContent = `${shortModelName(activeChatModel)} + ${shortModelName(activeImageModel)}`;
            } else {
                modelLabel.textContent = shortModelName(currentMdl);
            }
            title.textContent = mode === 'agent' ? 'Agent 模型' : (kind === 'image' ? '生图模型' : '对话模型');
            scope.innerHTML = mode === 'agent'
                ? `<button class="${kind === 'chat' ? 'active' : ''}" data-model-scope="chat">对话</button><button class="${kind === 'image' ? 'active' : ''}" data-model-scope="image">图像</button>`
                : '';
            scope.style.display = mode === 'agent' ? 'flex' : 'none';
            const providers = kind === 'image' ? imageConnections() : chatConnections();
            providerList.innerHTML = providers.length
                ? providers.map(p => `<button class="model-picker-option ${p.id === currentPid ? 'active' : ''}" data-provider-id="${escapeHtml(p.id)}" data-picker-kind="${kind}"><span>${escapeHtml(p.name || p.id)}</span>${p.id === currentPid ? '<i data-lucide="check"></i>' : ''}</button>`).join('')
                : `<div class="model-picker-empty">暂无平台</div>`;
            const models = modelListForCurrent(kind);
            modelList.innerHTML = models.length
                ? models.map(m => `<button class="model-picker-option ${m === currentMdl ? 'active' : ''}" data-model-id="${escapeHtml(m)}" data-picker-kind="${kind}"><span>${escapeHtml(shortModelName(m))}</span>${m === currentMdl ? '<i data-lucide="check"></i>' : ''}</button>`).join('')
                : `<div class="model-picker-empty">暂无模型</div>`;
            lucide.createIcons();
        }

        async function loadConversations(){
            const data = await apiJson('/api/conversations', {headers:{'X-User-ID':userId}});
            conversations = data.conversations || [];
            renderThreads();
            if(!currentConversation) {
                const rememberedId = rememberedConversation();
                const target = (rememberedId && conversations.find(item => item.id === rememberedId)) || conversations[0];
                if(target) await openConversation(target.id);
            }
            if(!currentConversation) renderMessages([]);
        }

        function renderThreads(){
            const list = document.getElementById('threadList');
            list.innerHTML = '';
            if(!conversations.length){
                list.innerHTML = `<div class="px-3 py-8 text-center text-[11px] font-bold text-gray-300 uppercase tracking-widest">${tr('chat.noHistory')}</div>`;
                return;
            }
            conversations.forEach(item => {
                const row = document.createElement('div');
                row.className = 'thread-row';
                const btn = document.createElement('button');
                btn.className = `thread-item ${currentConversation?.id === item.id ? 'active' : ''}`;
                btn.dataset.conversationId = item.id;
                btn.innerHTML = `<div class="text-sm font-bold truncate">${escapeHtml(item.title || defaultTitle())}</div><div class="text-[11px] opacity-50 truncate mt-1">${escapeHtml(item.last_message || '')}</div>`;
                const del = document.createElement('button');
                del.className = 'thread-delete';
                del.dataset.deleteConversationId = item.id;
                del.title = tr('chat.deleteTitle');
                del.innerHTML = '<i data-lucide="x" class="w-3.5 h-3.5"></i>';
                row.appendChild(btn);
                row.appendChild(del);
                list.appendChild(row);
            });
            lucide.createIcons();
        }

        async function newConversation(){
            const data = await apiJson('/api/conversations', {method:'POST', headers:headers(), body:JSON.stringify({title:'新对话'})});
            currentConversation = data.conversation;
            rememberConversation(currentConversation.id);
            setChatTitle(currentConversation.title);
            await loadConversations();
            renderMessages([]);
            toggleHistory(false);
        }

        async function openConversation(id, closePanel=false){
            const data = await apiJson(`/api/conversations/${id}`, {headers:{'X-User-ID':userId}});
            currentConversation = data.conversation;
            rememberConversation(currentConversation.id);
            setChatTitle(currentConversation.title);
            renderThreads();
            renderMessages(currentConversation.messages || []);
            if(closePanel) toggleHistory(false);
        }

        async function deleteConversation(id, event){
            event.stopPropagation();
            if(!confirm(tr('chat.deleteConfirm'))) return;
            await apiJson(`/api/conversations/${id}`, {method:'DELETE', headers:{'X-User-ID':userId}});
            const deletedCurrent = currentConversation?.id === id;
            if(deletedCurrent){ currentConversation = null; rememberConversation(''); setChatTitle(''); renderMessages([]); }
            await loadConversations();
            if(deletedCurrent && conversations[0]) await openConversation(conversations[0].id);
        }

        function toggleHistory(force){
            const pop = document.getElementById('historyPopover');
            const shouldOpen = typeof force === 'boolean' ? force : !pop.classList.contains('open');
            pop.classList.toggle('open', shouldOpen);
            if(shouldOpen) lucide.createIcons();
        }

        document.addEventListener('click', (event) => {
            const picker = document.getElementById('modelPicker');
            const popover = document.getElementById('modelPickerPopover');
            if(picker?.classList.contains('open') && !picker.contains(event.target) && !popover?.contains(event.target)) toggleModelPicker(false);
            const resolutionPicker = document.getElementById('resolutionPicker');
            const resolutionPopover = document.getElementById('resolutionPickerPopover');
            if(resolutionPicker?.classList.contains('open') && !resolutionPicker.contains(event.target) && !resolutionPopover?.contains(event.target)) toggleResolutionPicker(false);
            if(window.innerWidth > 900) return;
            const rail = document.getElementById('historyPopover');
            const actions = document.querySelector('.top-actions');
            if(rail?.classList.contains('open') && !rail.contains(event.target) && actions && !actions.contains(event.target)) toggleHistory(false);
        });

        function setMode(next, persist = true){
            mode = next;
            if(next === 'chat') modelPickerScope = 'chat';
            if(next === 'image') modelPickerScope = 'image';
            toggleModelPicker(false);
            toggleResolutionPicker(false);
            document.getElementById('chatModeBtn')?.classList.toggle('active', next === 'chat');
            document.getElementById('agentModeBtn')?.classList.toggle('active', next === 'agent');
            document.getElementById('imageModeBtn')?.classList.toggle('active', next === 'image');
            document.getElementById('imageControls')?.classList.toggle('hidden', next === 'chat');
            renderProviderControls();
            updateModelLabel();
            if(persist) saveChatSettings();
        }

        function updateModelLabel(){
            let label = '';
            if (mode === 'image') {
                label = activeImageModel || config.image_model || 'Image';
            } else if (mode === 'agent') {
                const chatLabel = chatConnectionId === 'modelscope'
                    ? (msModel || (config.ms_chat_models?.[0]) || 'ModelScope').split('/').pop().split(':')[0]
                    : (activeChatModel || config.chat_model || 'Chat');
                const imageLabel = (activeImageModel || config.image_model || 'Image').split('/').pop().split(':')[0];
                label = `Agent · ${chatLabel} + ${imageLabel}`;
            } else if (chatConnectionId === 'modelscope') {
                label = msModel || (config.ms_chat_models?.[0]) || 'ModelScope';
                // Shorten the display label
                label = label.split('/').pop().split(':')[0];
            } else {
                label = activeChatModel || config.chat_model || 'Chat';
            }
            const labelEl = document.getElementById('modelLabel');
            if(labelEl) labelEl.textContent = label;
        }

        function setChatRatio(next, preferredSize = ''){
            chatRatio = next;
            ['square','portrait','portrait43','landscape43','landscape','story','wide'].forEach(item => {
                document.getElementById(`chat-ratio-${item}`)?.classList.toggle('active', item === next);
            });
            if(preferredSize){
                const match = SIZE_OPTIONS[next]?.find(([value]) => value === preferredSize);
                if(match) chatPresetResolution = match[1];
            }
            if(chatResolution !== 'auto' && chatResolution !== 'custom') chatResolution = chatPresetResolution;
            updateChatResolutionUI();
            saveChatSettings();
        }

        function normalizeChatCustomSize(value){
            const match = String(value || '').trim().match(/^([1-9]\d{2,3})\s*[xX×*]\s*([1-9]\d{2,3})$/);
            if(!match) return '';
            const w = Math.round(Number(match[1]));
            const h = Math.round(Number(match[2]));
            if(w < 256 || h < 256 || w > 8192 || h > 8192) return '';
            return `${w}x${h}`;
        }

        function chatSizeForResolution(label = chatResolution){
            if(label === 'auto') return '1024x1024';
            if(label === 'custom') return normalizeChatCustomSize(chatCustomSize) || '1024x1024';
            const options = SIZE_OPTIONS[chatRatio] || SIZE_OPTIONS.square;
            const match = options.find(([, item]) => item === label) || options[0];
            return match[0];
        }

        function setChatResolution(next){
            const normalized = ['auto','1k','2k','4k','custom'].includes(next) ? next : 'auto';
            if(['1k','2k','4k'].includes(normalized)) chatPresetResolution = normalized;
            chatResolution = normalized;
            updateChatResolutionUI();
            saveChatSettings();
        }

        function setResolutionPickerScope(scope){
            if(scope === 'auto') {
                chatResolution = 'auto';
                updateChatResolutionUI();
                saveChatSettings();
            } else if(scope === 'custom') {
                setChatResolution('custom');
            } else {
                chatResolution = chatPresetResolution || '1k';
                if(chatResolution === 'auto') chatResolution = '1k';
                chatPresetResolution = chatResolution;
                updateChatResolutionUI();
                saveChatSettings();
            }
        }

        function selectBuiltInRatio(next){
            setChatRatio(next);
        }

        function selectResolutionPreset(next){
            setChatResolution(next);
        }

        function applyCustomResolution(){
            const width = document.getElementById('customResolutionWidth')?.value || '';
            const height = document.getElementById('customResolutionHeight')?.value || '';
            const hint = document.getElementById('customResolutionHint');
            const normalized = normalizeChatCustomSize(`${width}x${height}`);
            if(!normalized){
                if(hint){ hint.textContent = '请输入 256-8192 之间的有效宽度和高度'; hint.classList.add('error'); }
                return;
            }
            chatCustomSize = normalized;
            if(hint){ hint.textContent = '已应用自定义分辨率'; hint.classList.remove('error'); }
            setResolutionPickerScope('custom');
        }

        function updateChatResolutionUI(){
            const typeEl = document.getElementById('resolutionPickerType');
            const valueEl = document.getElementById('resolutionPickerValue');
            const hint = document.getElementById('customResolutionHint');
            const autoScopeBtn = document.getElementById('resolutionScopeAuto');
            const presetScopeBtn = document.getElementById('resolutionScopePreset');
            const customScopeBtn = document.getElementById('resolutionScopeCustom');
            const autoPane = document.getElementById('resolutionAutoPane');
            const presetPane = document.getElementById('resolutionPresetPane');
            const customPane = document.getElementById('resolutionCustomPane');
            const picker = document.getElementById('resolutionPicker');
            if(!['1k','2k','4k'].includes(chatPresetResolution)) chatPresetResolution = '1k';
            const custom = normalizeChatCustomSize(chatCustomSize) || '1024x1024';
            if(chatCustomSize !== custom) chatCustomSize = custom;
            const currentSize = chatSizeForResolution();
            const ratioLabels = { square:'1:1', portrait:'2:3', portrait43:'3:4', landscape43:'4:3', landscape:'3:2', story:'9:16', wide:'16:9' };
            const ratioLabel = ratioLabels[chatRatio] || '1:1';
            const builtInLabel = `${ratioLabel} · ${chatPresetResolution.toUpperCase()} · ${chatSizeForResolution(chatPresetResolution)}`;
            const isAuto = chatResolution === 'auto';
            const isCustom = chatResolution === 'custom';
            if(typeEl) typeEl.textContent = '尺寸';
            if(valueEl) valueEl.textContent = isAuto ? '自动' : (isCustom ? `自定义 · ${currentSize}` : builtInLabel);
            if(picker){
                picker.classList.toggle('auto-mode', isAuto);
                picker.classList.toggle('custom-mode', isCustom);
            }
            if(autoScopeBtn) autoScopeBtn.classList.toggle('active', isAuto);
            if(presetScopeBtn) presetScopeBtn.classList.toggle('active', !isAuto && !isCustom);
            if(customScopeBtn) customScopeBtn.classList.toggle('active', isCustom);
            if(autoPane) autoPane.classList.toggle('hidden', !isAuto);
            if(presetPane) presetPane.classList.toggle('hidden', isAuto || isCustom);
            if(customPane) customPane.classList.toggle('hidden', !isCustom);
            ['1k','2k','4k'].forEach(label => {
                const btn = document.querySelector(`.resolution-picker-option[data-resolution="${label}"]`);
                const sizeEl = document.getElementById(`resolutionPreset${label}`);
                if(btn) btn.classList.toggle('active', !isAuto && !isCustom && chatPresetResolution === label);
                if(sizeEl) sizeEl.textContent = chatSizeForResolution(label);
            });
            ['square','portrait','portrait43','landscape43','landscape','story','wide'].forEach(label => {
                const btn = document.getElementById(`chat-ratio-${label}`);
                if(btn) btn.classList.toggle('active', !isAuto && !isCustom && chatRatio === label);
            });
            const [w, h] = custom.split('x');
            const widthInput = document.getElementById('customResolutionWidth');
            const heightInput = document.getElementById('customResolutionHeight');
            if(widthInput && widthInput.value !== w) widthInput.value = w;
            if(heightInput && heightInput.value !== h) heightInput.value = h;
            if(hint && !hint.classList.contains('error')) hint.textContent = '输入 256-8192 之间的宽度和高度';
            if(document.getElementById('resolutionPicker')?.classList.contains('open')) {
                requestAnimationFrame(positionResolutionPicker);
            }
            lucide.createIcons();
        }

        function currentChatSize(){
            return chatSizeForResolution();
        }

        function currentChatAspectRatio(){
            return chatResolution === 'custom' ? '' : (CHAT_RATIO_VALUES[chatRatio] || '1:1');
        }

        function chatResolutionForRequest(message, requestedSize){
            if(['1k','2k','4k'].includes(chatResolution)) return chatResolution;
            const text = String(message || '');
            if(/4\s*k|4K|超清|超高分辨率/i.test(text)) return '4k';
            if(/2\s*k|2K|高清|高分辨率/i.test(text)) return '2k';
            const edge = Math.max(...String(requestedSize || '').split(/[xX×*]/).map(n => Number(n) || 0));
            if(edge >= 2800) return '4k';
            if(edge >= 1600) return '2k';
            return '1k';
        }

        function chatSizeFromPrompt(message, fallbackSize = currentChatSize()){
            const text = String(message || '');
            const direct = text.match(/(^|[^\d])([1-9]\d{2,4})\s*[xX×*]\s*([1-9]\d{2,4})(?!\d)/);
            if(direct) {
                const w = Number(direct[2]);
                const h = Number(direct[3]);
                if(w >= 256 && h >= 256) return `${w}x${h}`;
            }
            const normalized = text.replace(/[：﹕∶]/g, ':').replace(/比/g, ':').replace(/[／/]/g, ':');
            const match = normalized.match(/(^|[^\d])(1|2|3|4|9|16)\s*:\s*(1|2|3|4|9|16)(?!\d)/);
            if(!match) return fallbackSize;
            const ratio = `${Number(match[2])}:${Number(match[3])}`;
            const ratioMap = { '1:1':'square', '2:3':'portrait', '3:2':'landscape', '3:4':'portrait43', '4:3':'landscape43', '9:16':'story', '16:9':'wide' };
            const key = ratioMap[ratio];
            if(!key) return fallbackSize;
            const wants4k = /4\s*k|4K|超清|超高分辨率/i.test(text);
            const wants2k = /2\s*k|2K|高清|高分辨率/i.test(text);
            if(chatResolution === 'custom' && !wants4k && !wants2k) return fallbackSize;
            const fallbackEdge = Math.max(...String(fallbackSize || '').split(/[xX×*]/).map(n => Number(n) || 0));
            const targetLabel = wants4k ? '4k' : (wants2k ? '2k' : (chatResolution === 'auto' ? '1k' : (fallbackEdge >= 2400 ? '4k' : (fallbackEdge >= 1500 ? '2k' : '1k'))));
            return (SIZE_OPTIONS[key] || SIZE_OPTIONS.square).find(([, label]) => label === targetLabel)?.[0] || fallbackSize;
        }

        function renderMessages(messages){
            const box = document.getElementById('messages');
            box.innerHTML = '';
            if(!messages.length){
                box.innerHTML = `<div class="empty-state"><i data-lucide="messages-square"></i><div class="empty-state-text">${tr('chat.ready')}</div></div>`;
                lucide.createIcons();
                return;
            }
            messages.forEach(addMessageBubble);
            scrollBottom();
        }

        function addMessageBubble(msg){
            const box = document.getElementById('messages');
            const row = document.createElement('div');
            row.className = `bubble-row ${msg.role === 'user' ? 'user' : 'assistant'}`;
            const bubble = document.createElement('div');
            bubble.className = `bubble ${msg.role === 'user' ? 'user' : 'assistant'}`;
            const imageUrls = Array.isArray(msg.image_urls) && msg.image_urls.length ? msg.image_urls : (msg.image_url ? [msg.image_url] : []);
            if(imageUrls.length) bubble.classList.add('image-bubble');
            const text = document.createElement('div');
            text.textContent = msg.type === 'image' ? (msg.agent_reply || tr('chat.generated')) : (msg.content || '');
            text.className = 'bubble-text';
            bubble.appendChild(text);
            if(msg.attachments?.length){
                const thumbs = document.createElement('div');
                thumbs.className = 'thumbs';
                msg.attachments.forEach(ref => {
                    const thumb = renderAttachmentThumb(ref);
                    thumbs.appendChild(thumb);
                });
                bubble.appendChild(thumbs);
            }
            if(imageUrls.length){
                const grid = document.createElement('div');
                grid.className = `generated-grid count-${Math.min(imageUrls.length, 4)}`;
                imageUrls.forEach(url => {
                    const img = document.createElement('img');
                    img.className = 'generated';
                    img.src = url;
                    img.addEventListener('click', () => openImagePreview(url));
                    grid.appendChild(img);
                });
                bubble.appendChild(grid);
            }
            // Show model badge for assistant messages
            if(msg.role === 'assistant' && msg.model){
                const badge = document.createElement('div');
                const modelShort = msg.model.split('/').pop().split(':')[0];
                const isMs = msg.model.includes('/') && !msg.model.includes('gpt');
                badge.style.cssText = `margin-top:8px;font-size:9px;font-weight:700;opacity:.45;letter-spacing:.06em;`;
                badge.textContent = modelShort;
                bubble.appendChild(badge);
            }
            row.appendChild(bubble);
            box.appendChild(row);
            lucide.createIcons();
            return {row, bubble, text};
        }

        function openImagePreview(url){
            const modal = document.getElementById('imagePreviewModal');
            const img = document.getElementById('imagePreviewImg');
            if(!modal || !img || !url) return;
            img.src = url;
            modal.classList.add('open');
            lucide.createIcons();
        }

        function closeImagePreview(){
            const modal = document.getElementById('imagePreviewModal');
            const img = document.getElementById('imagePreviewImg');
            modal?.classList.remove('open');
            if(img) img.src = '';
        }

        function isImageRef(ref){
            const kind = String(ref?.kind || '').toLowerCase();
            const mime = String(ref?.mime || '').toLowerCase();
            const url = String(ref?.url || '').toLowerCase();
            return kind === 'image' || mime.startsWith('image/') || url.startsWith('/api/files/') || /\.(png|jpe?g|webp|gif|bmp|tiff?)(\?|#|$)/.test(url);
        }

        function attachmentName(ref){
            return ref?.name || (ref?.url || '').split('/').pop() || '附件';
        }

        function renderAttachmentThumb(ref){
            if(isImageRef(ref)){
                const img = document.createElement('img');
                img.className = 'thumb';
                img.src = ref.url;
                img.title = attachmentName(ref);
                img.addEventListener('click', () => openImagePreview(ref.url));
                return img;
            }
            const node = document.createElement('div');
            node.className = 'thumb file-thumb';
            node.title = attachmentName(ref);
            node.innerHTML = `<i data-lucide="file"></i><span class="thumb-name">${escapeHtml(attachmentName(ref))}</span>`;
            return node;
        }

        function renderRefChip(ref, i){
            if(isImageRef(ref)){
                return `<div class="ref-chip"><img src="${escapeHtml(ref.url)}" title="${escapeHtml(attachmentName(ref))}"><button data-remove-ref="${i}">×</button></div>`;
            }
            return `<div class="ref-chip file"><i data-lucide="file"></i><span class="ref-file-name" title="${escapeHtml(attachmentName(ref))}">${escapeHtml(attachmentName(ref))}</span><button data-remove-ref="${i}">×</button></div>`;
        }

        async function uploadFiles(files){
            if(!files?.length) return;
            const available = Math.max(0, CHAT_ATTACHMENT_MAX - refs.length);
            if(!available) return;
            const form = new FormData();
            [...files].slice(0, available).forEach(file => form.append('files', file));
            try {
                const data = await apiForm('/api/ai/upload', form);
                refs.push(...(data.files || []));
                renderRefs();
            } catch(e) {
                alert(e.message || '上传失败');
            }
        }

        function renderRefs(){
            const strip = document.getElementById('refStrip');
            strip.innerHTML = refs.map((ref,i) => renderRefChip(ref, i)).join('');
            lucide.createIcons();
            updateComposerOverflow();
        }

        function removeRef(i){ refs.splice(i,1); renderRefs(); }

        document.getElementById('messageInput').addEventListener('input', event => autoGrow(event.currentTarget));
        document.getElementById('messageInput').addEventListener('keydown', handleKey);
        document.getElementById('attachmentInput').addEventListener('change', event => {
            uploadFiles(event.currentTarget.files);
            event.currentTarget.value = '';
        });
        document.getElementById('sendBtn').addEventListener('click', sendMessage);
        document.getElementById('imagePreviewModal').addEventListener('click', event => {
            if (event.target === event.currentTarget) closeImagePreview();
        });
        document.getElementById('imagePreviewImg').addEventListener('click', event => event.stopPropagation());

        document.addEventListener('click', event => {
            const target = event.target.closest('button, [data-action]');
            if (!target) return;
            const conversationId = target.dataset.conversationId;
            const deleteConversationId = target.dataset.deleteConversationId;
            if (conversationId) return openConversation(conversationId, true);
            if (deleteConversationId) return deleteConversation(deleteConversationId, event);
            const action = target.dataset.action;
            if (target.closest('#systemPromptPopover, #modelPickerPopover, #resolutionPickerPopover')) event.stopPropagation();
            if (action === 'new-conversation') newConversation();
            else if (action === 'toggle-system-prompt') toggleSystemPrompt();
            else if (action === 'close-system-prompt') toggleSystemPrompt(false);
            else if (action === 'clear-system-prompt') clearSystemPrompt();
            else if (action === 'save-system-prompt') saveSystemPromptFromUI();
            else if (action === 'toggle-history') toggleHistory();
            else if (action === 'close-history') toggleHistory(false);
            else if (action === 'upload-files') document.getElementById('attachmentInput')?.click();
            else if (action === 'toggle-model-picker') toggleModelPicker();
            else if (action === 'toggle-resolution-picker') toggleResolutionPicker();
            else if (action === 'apply-custom-resolution') applyCustomResolution();
            else if (action === 'close-image-preview') closeImagePreview();
            else if (target.dataset.resolutionScope) setResolutionPickerScope(target.dataset.resolutionScope);
            else if (target.dataset.chatRatio) selectBuiltInRatio(target.dataset.chatRatio);
            else if (target.dataset.resolution) selectResolutionPreset(target.dataset.resolution);
            else if (target.dataset.modelScope) setModelPickerScope(target.dataset.modelScope);
            else if (target.dataset.providerId) setConnection(target.dataset.providerId, target.dataset.pickerKind);
            else if (target.dataset.modelId) {
                setActiveModel(target.dataset.modelId, target.dataset.pickerKind);
                toggleModelPicker(false);
            } else if (target.dataset.removeRef != null) removeRef(Number(target.dataset.removeRef));
        });

        window.addEventListener('paste', e => {
            const files = [...(e.clipboardData?.items || [])].filter(x => x.kind === 'file').map(x => x.getAsFile()).filter(Boolean);
            if(files.length) uploadFiles(files);
        });

        const composerBody = document.getElementById('composerBody');
        composerBody.addEventListener('dragover', e => {
            if(!hasUploadFiles(e.dataTransfer?.items)) return;
            e.preventDefault();
            composerBody.classList.add('drag-over');
        });
        composerBody.addEventListener('dragleave', e => {
            if(!composerBody.contains(e.relatedTarget)) composerBody.classList.remove('drag-over');
        });
        composerBody.addEventListener('drop', e => {
            if(!hasUploadFiles(e.dataTransfer?.items)) return;
            e.preventDefault();
            composerBody.classList.remove('drag-over');
            const files = [...(e.dataTransfer?.files || [])];
            uploadFiles(files);
        });

        function hasUploadFiles(items){ return [...(items || [])].some(item => item.kind === 'file'); }
        function updateComposerOverflow(){
            const body = document.getElementById('composerBody');
            if(!body) return;
            body.classList.toggle('has-overflow', body.scrollHeight > body.clientHeight + 2);
        }
        function autoGrow(el){ el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 150) + 'px'; updateComposerOverflow(); }
        function handleKey(e){ if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } }
        window.addEventListener('keydown', e => {
            if(e.key === 'Escape') closeImagePreview();
        });

        async function sendMessage(){
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            if(!message) return;
            const btn = document.getElementById('sendBtn');
            btn.disabled = true;
            const requestedSize = chatSizeFromPrompt(message);
            const pendingRefs = refs.slice();
            refs = [];
            renderRefs();
            input.value = '';
            autoGrow(input);
            if(!currentConversation){
                currentConversation = {id:'', title:'新对话', messages:[]};
                document.getElementById('messages').innerHTML = '';
            }
            addMessageBubble({role:'user', content:message, attachments:pendingRefs});
            const useStreaming = mode === 'chat';
            const pendingText = mode === 'image' ? tr('chat.generatingImage') : (useStreaming ? '' : (mode === 'agent' ? tr('chat.agentWorking') : ''));
            const assistantBubble = addMessageBubble({role:'assistant', content: pendingText});
            if(useStreaming || mode === 'agent') assistantBubble.bubble.classList.add('streaming');
            scrollBottom();
            try {
                const requestResolution = chatResolutionForRequest(message, requestedSize);
                const requestAspectRatio = currentChatAspectRatio();
                if(useStreaming) {
                    await streamChatMessage(message, pendingRefs, assistantBubble);
                } else if(mode === 'chat') {
                    const data = await apiJson('/api/chat', {
                        method:'POST',
                        headers:headers(),
                        body:JSON.stringify({
                            conversation_id: currentConversation.id || '',
                            message,
                            system_prompt: currentSystemPrompt(),
                            mode:'chat',
                            size: requestedSize,
                            aspect_ratio: requestAspectRatio,
                            resolution: requestResolution,
                            reference_images: pendingRefs,
                            ...stableTarget(chatConnectionId, activeChatModel || config.chat_model, 'chat'),
                        })
                    });
                    currentConversation = data.conversation;
                    rememberConversation(currentConversation.id);
                    setChatTitle(currentConversation.title);
                    renderMessages(currentConversation.messages || []);
                    await loadConversations();
                } else if(mode === 'agent') {
                    const data = await apiJson('/api/chat/agent', {
                        method:'POST',
                        headers:headers(),
                        body:JSON.stringify({
                            conversation_id: currentConversation.id || '',
                            message,
                            system_prompt: currentSystemPrompt(),
                            mode:'agent',
                            size: requestedSize,
                            aspect_ratio: requestAspectRatio,
                            resolution: requestResolution,
                            image_model_id: stableImageTarget().model_id,
                            image_connection_id: stableImageTarget().connection_id,
                            image_resource_id: stableImageTarget().resource_id,
                            reference_images: pendingRefs,
                            ...stableTarget(chatConnectionId, activeChatModel || config.chat_model, 'chat'),
                        })
                    });
                    currentConversation = data.conversation;
                    rememberConversation(currentConversation.id);
                    setChatTitle(currentConversation.title);
                    renderMessages(currentConversation.messages || []);
                    await loadConversations();
                } else {
                    const data = await apiJson('/api/chat', {
                        method:'POST',
                        headers:headers(),
                        body:JSON.stringify({
                            conversation_id: currentConversation.id || '',
                            message,
                            system_prompt: currentSystemPrompt(),
                            mode,
                            size: requestedSize,
                            aspect_ratio: requestAspectRatio,
                            resolution: requestResolution,
                            image_model_id: stableImageTarget().model_id,
                            reference_images: pendingRefs,
                            ...stableImageTarget(),
                        })
                    });
                    currentConversation = data.conversation;
                    rememberConversation(currentConversation.id);
                    setChatTitle(currentConversation.title);
                    renderMessages(currentConversation.messages || []);
                    await loadConversations();
                }
            } catch(err) {
                renderMessages([...(currentConversation.messages || []), {role:'assistant', content:err.message || tr('chat.requestFailed')}]);
            } finally {
                btn.disabled = false;
                scrollBottom();
            }
        }

        async function streamChatMessage(message, pendingRefs, assistantBubble){
            const currentConnection = chatConnectionId;
            const currentMsModel = chatConnectionId === 'modelscope' ? (msModel || activeChatModel || (config.ms_chat_models?.[0] || '')) : '';
            const currentChatModel = activeChatModel || config.chat_model;

            const res = await apiStream('/api/chat/stream', {
                method:'POST',
                headers:headers(),
                body:JSON.stringify({
                    conversation_id: currentConversation.id || '',
                    message,
                    system_prompt: currentSystemPrompt(),
                    mode:'chat',
                    ...stableTarget(currentConnection, currentChatModel, 'chat'),
                    reference_images: pendingRefs
                })
            });
            if(!res.ok) throw new Error((await res.json()).detail || tr('chat.requestFailed'));
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullText = '';
            while(true){
                const {value, done} = await reader.read();
                if(done) break;
                buffer += decoder.decode(value, {stream:true});
                const events = buffer.split('\n\n');
                buffer = events.pop() || '';
                for(const eventText of events){
                    const line = eventText.split('\n').find(item => item.startsWith('data:'));
                    if(!line) continue;
                    const event = JSON.parse(line.slice(5).trim());
                    if(event.type === 'meta'){
                        currentConversation = event.conversation;
                        rememberConversation(currentConversation.id);
                        setChatTitle(currentConversation.title);
                    }
                    if(event.type === 'delta'){
                        fullText += event.delta || '';
                        assistantBubble.text.textContent = fullText;
                        scrollBottom();
                    }
                    if(event.type === 'error') throw new Error(event.detail || tr('chat.requestFailed'));
                    if(event.type === 'done'){
                        assistantBubble.bubble.classList.remove('streaming');
                        currentConversation = event.conversation;
                        rememberConversation(currentConversation.id);
                        setChatTitle(currentConversation.title);
                        renderMessages(currentConversation.messages || []);
                        await loadConversations();
                    }
                }
            }
            assistantBubble.bubble.classList.remove('streaming');
        }

        function scrollBottom(){ requestAnimationFrame(() => { const box = document.getElementById('messages'); box.scrollTop = box.scrollHeight; }); }
        function escapeHtml(str){ return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }

        async function initializeChat(){
            applyTranslations();
            applyLanguage();
            syncSystemPromptUI();
            setChatRatio(chatRatio);
            setChatResolution(chatResolution);
            await loadConfig();
            await loadConversations();
            updateComposerOverflow();
        }

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeChat, { once: true });
        else initializeChat();
