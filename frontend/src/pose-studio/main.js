import { createIcons, icons } from 'lucide';
import '@tailwindcss/browser';
import { getAiConfiguration, uploadPoseFile, transferPose as requestPoseTransfer } from '../services/pose-studio.js';
import 'virtual:mediaforge-theme';
import '../styles/fonts.css';
import '../pages/pose-studio/page.css';

        const refreshIcons = (root = document) => createIcons({ icons, root });
        const readResponsePayload = async function(res){
            const text = await res.text();
            if(!text) return {};
            try { return JSON.parse(text); } catch(e) { return { detail:text }; }
        };

        const responseErrorMessage = function(prefix, url, res, payload){
            const detail = payload?.detail || payload?.message || res.statusText || '请求失败';
            return `${prefix} (${res.status} ${res.statusText || ''})：${detail}\n${url}`;
        };

        const fileInput = document.getElementById('fileInput');
        const dropzone = document.getElementById('dropzone');
        const previewImg = document.getElementById('previewImg');
        const poseFrame = document.getElementById('poseFrame');
        const posePreviewImg = document.getElementById('posePreviewImg');
        const posePreviewEmpty = document.getElementById('posePreviewEmpty');
        const outputPreviewImg = document.getElementById('outputPreviewImg');
        const outputPreviewEmpty = document.getElementById('outputPreviewEmpty');
        let uploadedFile = null;
        let hasClientModel = false;
        let inputMode = 'image';
        let currentPoseBlobUrls = [];
        let inputImageRef = null;
        let inputReferenceUploadPromise = null;
        let inputUploadToken = 0;
        let poseImageRef = null;
        let poseImageRefUploadPromise = null;
        let poseUploadToken = 0;
        let selectedProvider = 'comfly';
        let selectedModel = 'gpt-image-2';
        let aiConnections = [];
        let aiModelsByName = new Map();
        let models = { gpt:'gpt-image-2', nano:'nano-banana-pro' };
        let transferRatio = 'square';
        let transferResolution = '1k';
        const DEFAULT_TRANSFER_PROMPT = '将图1人物的姿势调整为图2的样式，保持图1人物一致性';
        const TRANSFER_SIZE_OPTIONS = {
            square: {
                label: '1:1 方图',
                sizes: { '1k':'1024x1024', '2k':'2048x2048', '4k':'3840x2160' }
            },
            portrait: {
                label: '2:3 竖图',
                sizes: { '1k':'1024x1536', '2k':'1360x2048', '4k':'2352x3520' }
            },
            portrait43: {
                label: '3:4 竖图',
                sizes: { '1k':'1008x1344', '2k':'1536x2048', '4k':'2448x3264' }
            },
            story: {
                label: '9:16 竖屏',
                sizes: { '1k':'720x1280', '2k':'1152x2048', '4k':'2160x3840' }
            },
            landscape: {
                label: '3:2 横图',
                sizes: { '1k':'1536x1024', '2k':'2048x1360', '4k':'3520x2352' }
            },
            landscape43: {
                label: '4:3 横图',
                sizes: { '1k':'1344x1008', '2k':'2048x1536', '4k':'3264x2448' }
            },
            wide: {
                label: '16:9 宽屏',
                sizes: { '1k':'1280x720', '2k':'2048x1152', '4k':'3840x2160' }
            }
        };
        const PROTOCOL_LABEL = {
            api:'API',
            volcengine:'火山',
            gemini:'Gemini'
        };

        function setStatus(text, icon = 'circle'){
            const el = document.getElementById('pageStatus');
            el.innerHTML = `<i data-lucide="${icon}" class="w-3 h-3"></i><span>${escapeHtml(text)}</span>`;
            refreshIcons();
        }
        function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
        function hasPoseImage(){
            return !!posePreviewImg?.getAttribute('src');
        }
        function setOutputPlaceholder(icon, text, spinning = false){
            if(!outputPreviewEmpty) return;
            outputPreviewEmpty.innerHTML = `<i data-lucide="${icon}" class="w-9 h-9 stroke-[1px] ${spinning ? 'animate-spin' : ''}"></i><p class="text-[10px] font-bold uppercase tracking-[0.26em]">${escapeHtml(text)}</p>`;
            refreshIcons();
        }
        function refreshTransferState(){
            const btn = document.getElementById('poseTransferBtn');
            const status = document.getElementById('poseTransferStatus');
            const ready = inputMode === 'image' && !!uploadedFile && hasPoseImage() && !!selectedModel;
            if(btn) btn.disabled = !ready;
            if(status) status.textContent = ready ? '已准备姿势迁移' : '等待输入图、姿势图和模型';
        }
        function setLeaveGuard(active){
            try { window.parent.postMessage({ type:'page-guard', page:'pose-studio', active:!!active }, '*'); } catch(e) {}
        }
        function refreshLeaveGuard(){ setLeaveGuard(!!(uploadedFile || hasClientModel)); }

        function uniqueModels(list){
            const seen = new Set();
            return (list || []).map(item => String(item || '').trim()).filter(item => item && !seen.has(item) && seen.add(item));
        }
        function imageProviders(){
            const list = (aiConnections || []).filter(p => p.enabled !== false && (
                (p.image_models || []).length
            )).filter(p => {
                const proto = String(p.protocol || '').toLowerCase();
                const pid = String(p.id || '').toLowerCase();
                return proto !== 'runninghub' && pid !== 'runninghub';
            });
            return list.length ? list : [{ id:'comfly', name:'Comfly', image_models:[models.gpt, models.nano] }];
        }
        function providerById(id){
            return imageProviders().find(p => p.id === id) || imageProviders()[0] || {};
        }
        function providerModels(id){
            return uniqueModels(providerById(id)?.image_models || [models.gpt]);
        }
        function providerProtocol(id){
            const p = providerById(id) || {};
            const proto = String(p.protocol || '').toLowerCase();
            const pid = String(p.id || '').toLowerCase();
            const base = String(p.base_url || '').toLowerCase();
            if(proto === 'volcengine' || pid === 'volcengine') return 'volcengine';
            if(proto === 'gemini') return 'gemini';
            return 'api';
        }
        function renderProviderControls(){
            const providerSelect = document.getElementById('providerSelect');
            const modelSelect = document.getElementById('modelSelect');
            if(!providerSelect || !modelSelect) return;
            const providers = imageProviders();
            if(!providers.some(p => p.id === selectedProvider)) selectedProvider = providers[0]?.id || 'comfly';
            providerSelect.innerHTML = providers.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === selectedProvider ? 'selected' : ''}>${escapeHtml(p.name || p.id)}</option>`).join('');
            const modelList = providerModels(selectedProvider);
            if(!modelList.includes(selectedModel)) selectedModel = modelList[0] || models.gpt;
            modelSelect.innerHTML = modelList.map(m => `<option value="${escapeHtml(m)}" ${m === selectedModel ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');
            const badge = document.getElementById('providerModeBadge');
            if(badge){
                const proto = providerProtocol(selectedProvider);
                badge.textContent = PROTOCOL_LABEL[proto] || 'API';
                badge.style.display = '';
            }
            refreshTransferState();
        }
        async function initModels(){
            try {
                const cfg = await getAiConfiguration();
                const imageModels = (cfg.models || []).filter(m => m.kind === 'image' && m.enabled !== false).map(m => m.upstream_model);
                models.nano = imageModels.find(m => String(m).toLowerCase().includes('nano')) || 'nano-banana-pro';
                models.gpt = imageModels.find(m => !String(m).toLowerCase().includes('nano')) || cfg.image_model || 'gpt-image-2';
                aiConnections = (cfg.connections || []).map(c => ({...c, id:c.id, connection_id:c.id,
                    image_models:(cfg.models || []).filter(m => m.connection_id === c.id && m.kind === 'image' && m.enabled !== false).map(m => m.upstream_model)}));
                aiModelsByName = new Map((cfg.models || []).filter(m => m.kind === 'image' && m.enabled !== false).map(m => [`${m.connection_id}::${m.upstream_model}`, m]));
            } catch(e) {
                aiConnections = [];
            }
            renderProviderControls();
        }
        function setProvider(next){
            selectedProvider = next || selectedProvider;
            renderProviderControls();
        }
        function setModel(next){
            selectedModel = next || '';
            refreshTransferState();
        }
        function setTransferResolution(next){
            transferResolution = next || '1k';
        }
        function setTransferRatio(next){
            transferRatio = next || 'square';
        }
        document.getElementById('providerSelect')?.addEventListener('change', event => setProvider(event.target.value));
        document.getElementById('modelSelect')?.addEventListener('change', event => setModel(event.target.value));
        document.getElementById('transferResolutionSelect')?.addEventListener('change', event => setTransferResolution(event.target.value));
        document.getElementById('transferRatioSelect')?.addEventListener('change', event => setTransferRatio(event.target.value));
        function transferOutputSize(){
            return TRANSFER_SIZE_OPTIONS[transferRatio]?.sizes?.[transferResolution]
                || TRANSFER_SIZE_OPTIONS.square.sizes['1k'];
        }
        async function refreshProvidersFromApiSettings(){
            await initModels();
        }
        let apiSyncTimer = null;
        function scheduleProviderRefresh(){
            clearTimeout(apiSyncTimer);
            apiSyncTimer = setTimeout(refreshProvidersFromApiSettings, 150);
        }
        try {
            const studioApiChannel = new BroadcastChannel('studio-api');
            studioApiChannel.addEventListener('message', () => scheduleProviderRefresh());
        } catch(e) {}
        document.addEventListener('visibilitychange', () => { if(!document.hidden) scheduleProviderRefresh(); });

        function fileToDataUrl(file){
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.addEventListener('load', () => resolve(String(reader.result || '')));
                reader.addEventListener('error', () => reject(reader.error || new Error('读取参考图失败')));
                reader.readAsDataURL(file);
            });
        }
        async function buildReferenceFromFile(file){
            const url = await fileToDataUrl(file);
            if(!url) throw new Error('参考图读取失败：未生成 data URL');
            return { url, name:file.name || 'source.png', role:'' };
        }
        async function buildReferenceFromDataUrl(dataUrl, filename){
            if(!dataUrl || !String(dataUrl).startsWith('data:image/')) throw new Error('姿势图生成失败：无效的 data URL');
            return { url:dataUrl, name:filename, role:'' };
        }
        function queueInputReferenceUpload(file){
            const token = ++inputUploadToken;
            inputImageRef = null;
            inputReferenceUploadPromise = buildReferenceFromFile(file).then(ref => {
                if(token === inputUploadToken) inputImageRef = ref;
                refreshTransferState();
                return ref;
            }).catch(err => {
                if(token === inputUploadToken) inputImageRef = null;
                console.error(err);
                refreshTransferState();
                return null;
            });
        }
        function queuePoseReferenceUpload(dataUrl){
            const token = ++poseUploadToken;
            poseImageRef = null;
            poseImageRefUploadPromise = buildReferenceFromDataUrl(dataUrl, `pose-${Date.now()}.png`).then(ref => {
                if(token === poseUploadToken) poseImageRef = ref;
                refreshTransferState();
                return ref;
            }).catch(err => {
                if(token === poseUploadToken) poseImageRef = null;
                console.error(err);
                refreshTransferState();
                return null;
            });
        }

        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('border-black'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('border-black'));
        dropzone.addEventListener('drop', e => {
            e.preventDefault();
            dropzone.classList.remove('border-black');
            const f = e.dataTransfer.files && e.dataTransfer.files[0];
            if(f) handleFile(f);
        });
        fileInput.addEventListener('change', e => {
            const f = e.target.files && e.target.files[0];
            if(f) handleFile(f);
        });

        function isFbxFile(file){
            return !!file && (/\.fbx$/i.test(file.name || '') || file.type === 'application/octet-stream' && /\.fbx$/i.test(file.name || ''));
        }

        async function applyRigResult(data, loadedMessage){
            hasClientModel = !!data.model_data;
            refreshLeaveGuard();
            document.getElementById('modelMeshInfo').textContent = `${data.vertices} verts / ${data.bones} bones`;
            document.getElementById('modelOutputInfo').textContent = loadedMessage || 'FBX Loaded';
            const download = document.getElementById('downloadModelBtn');
            const fbxUrl = data.fbx_url || data.url || '';
            if(fbxUrl){
                download.href = fbxUrl;
                download.download = data.filename || `pose-model-${Date.now()}.fbx`;
                download.classList.remove('hidden');
            } else {
                download.removeAttribute('href');
                download.classList.add('hidden');
            }
            document.getElementById('focusEditorBtn').classList.remove('hidden');
            const api = poseFrame.contentWindow?.__VNCCS_STANDALONE__;
            if(api?.loadGeneratedModelData && data.model_data) {
                await api.loadGeneratedModelData(data.model_data);
            }
        }

        function handleFile(file){
            if(!file) return;
            const fbx = isFbxFile(file);
            if(!fbx && !/^image\//.test(file.type)) return;
            uploadedFile = file;
            inputMode = fbx ? 'fbx' : 'image';
            hasClientModel = false;
            inputImageRef = null;
            inputReferenceUploadPromise = null;
            inputUploadToken++;
            refreshLeaveGuard();
            document.getElementById('generateModelBtn').disabled = false;
            document.getElementById('modelFileName').textContent = file.name || 'source image';
            document.getElementById('modelMeshInfo').textContent = '-';
            document.getElementById('modelOutputInfo').textContent = fbx ? 'Ready to load' : 'Ready';
            document.getElementById('downloadModelBtn').classList.add('hidden');
            document.getElementById('focusEditorBtn').classList.add('hidden');
            refreshTransferState();
            const btn = document.getElementById('generateModelBtn');
            btn.innerHTML = fbx
                ? '<i data-lucide="box" class="w-4 h-4 text-yellow-400"></i><span>加载模型</span>'
                : '<i data-lucide="cuboid" class="w-4 h-4 text-yellow-400"></i><span>生成模型</span>';
            if(fbx) {
                previewImg.removeAttribute('src');
                previewImg.classList.add('hidden');
                document.getElementById('uploadContent').classList.remove('opacity-0');
                document.getElementById('changeOverlay').classList.replace('hidden', 'flex');
                document.getElementById('modelState').innerHTML = '<i data-lucide="box" class="w-10 h-10 mx-auto stroke-[1px]"></i><p class="text-[10px] font-bold uppercase tracking-[0.3em]">FBX 已选择，可直接加载到姿态编辑器</p>';
                setStatus('FBX selected', 'box');
            } else {
                const reader = new FileReader();
                reader.addEventListener('load', e => {
                    previewImg.src = e.target.result;
                    previewImg.classList.remove('hidden');
                    document.getElementById('uploadContent').classList.add('opacity-0');
                    document.getElementById('changeOverlay').classList.replace('hidden', 'flex');
                });
                reader.readAsDataURL(file);
                queueInputReferenceUpload(file);
                document.getElementById('modelState').innerHTML = '<i data-lucide="box" class="w-10 h-10 mx-auto stroke-[1px]"></i><p class="text-[10px] font-bold uppercase tracking-[0.3em]">上传图像后生成含骨骼数据的 FBX 文件</p>';
                setStatus('Image loaded', 'image');
            }
            refreshIcons();
        }

        async function generateFbx(){
            if(!uploadedFile) return;
            const btn = document.getElementById('generateModelBtn');
            const modelState = document.getElementById('modelState');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 text-yellow-400 animate-spin"></i><span>Generating</span>';
            refreshIcons();
            modelState.innerHTML = inputMode === 'fbx'
                ? '<i data-lucide="loader-2" class="w-10 h-10 mx-auto stroke-[1px] animate-spin"></i><p class="text-[10px] font-bold uppercase tracking-[0.3em] mt-3">正在读取 FBX 骨骼模型...</p>'
                : '<i data-lucide="loader-2" class="w-10 h-10 mx-auto stroke-[1px] animate-spin"></i><p class="text-[10px] font-bold uppercase tracking-[0.3em] mt-3">正在生成 FBX 与骨骼模型...</p>';
            try {
                const fd = new FormData();
                fd.append('file', uploadedFile, uploadedFile.name || (inputMode === 'fbx' ? 'source.fbx' : 'source.png'));
                const endpoint = inputMode === 'fbx' ? '/api/pose-studio/upload-fbx' : '/api/pose-studio/generate-fbx';
                const data = await uploadPoseFile(uploadedFile, endpoint);
                if(data.success === false) throw new Error(data.detail || (inputMode === 'fbx' ? 'FBX 加载失败' : 'FBX 生成失败'));
                await applyRigResult(data, inputMode === 'fbx' ? 'FBX Loaded' : 'FBX Generated');
                modelState.innerHTML = inputMode === 'fbx'
                    ? '<i data-lucide="check-circle" class="w-12 h-12 mx-auto stroke-[1px] text-green-500"></i><p class="text-[10px] font-bold uppercase tracking-[0.3em] mt-3">FBX 已加载到姿态编辑器</p>'
                    : '<i data-lucide="check-circle" class="w-12 h-12 mx-auto stroke-[1px] text-green-500"></i><p class="text-[10px] font-bold uppercase tracking-[0.3em] mt-3">FBX 已生成，并已加载到姿态编辑器</p>';
                setStatus(inputMode === 'fbx' ? 'FBX loaded' : 'FBX generated', 'check-circle');
            } catch(err) {
                console.error(err);
                modelState.innerHTML = `<i data-lucide="alert-circle" class="w-12 h-12 mx-auto stroke-[1px] text-red-500"></i><p class="text-[10px] font-bold uppercase tracking-[0.3em] mt-3">${inputMode === 'fbx' ? '加载失败' : '生成失败'}</p>`;
                alert(err.message || (inputMode === 'fbx' ? 'FBX 加载失败' : 'FBX 生成失败'));
                setStatus('Generate failed', 'alert-circle');
            } finally {
                btn.disabled = false;
                btn.innerHTML = inputMode === 'fbx'
                    ? '<i data-lucide="box" class="w-4 h-4 text-yellow-400"></i><span>加载模型</span>'
                    : '<i data-lucide="cuboid" class="w-4 h-4 text-yellow-400"></i><span>生成模型</span>';
                refreshIcons();
            }
        }

        function focusPoseEditor(){
            document.getElementById('poseEditorSection').scrollIntoView({ behavior:'smooth', block:'start' });
            setStatus('Pose editor', 'move-3d');
        }

        function exportPose(){
            const api = poseFrame.contentWindow?.__VNCCS_STANDALONE__;
            if(!api) {
                alert('姿势编辑器尚未加载完成');
                return;
            }
            try {
                currentPoseBlobUrls.forEach(url => URL.revokeObjectURL(url));
                currentPoseBlobUrls = [];
                const poseJson = api.sync(true);
                const jsonBlob = new Blob([poseJson], { type:'application/json' });
                const jsonUrl = URL.createObjectURL(jsonBlob);
                currentPoseBlobUrls.push(jsonUrl);
                const jsonLink = document.getElementById('downloadPoseJson');
                jsonLink.href = jsonUrl;
                jsonLink.download = `pose-${Date.now()}.json`;
                jsonLink.classList.remove('hidden');

                const image = api.capture();
                if(image) {
                    const pngLink = document.getElementById('downloadPosePng');
                    pngLink.href = image;
                    pngLink.download = `pose-${Date.now()}.png`;
                    pngLink.classList.remove('hidden');
                    posePreviewImg.src = image;
                    posePreviewImg.classList.remove('hidden');
                    posePreviewEmpty.classList.add('hidden');
                    queuePoseReferenceUpload(image);
                }
                document.getElementById('poseExportStatus').textContent = '当前姿势已生成导出文件';
                refreshTransferState();
                setStatus('Pose exported', 'save');
            } catch(err) {
                console.error(err);
                alert(err.message || '导出姿势失败');
            }
        }

        async function transferPose(){
            const btn = document.getElementById('poseTransferBtn');
            const status = document.getElementById('poseTransferStatus');
            if(!uploadedFile) {
                alert('姿势迁移需要先上传人物输入图');
                return;
            }
            if(!hasPoseImage()) {
                alert('请先导出姿势图');
                return;
            }
            const prompt = (document.getElementById('poseTransferPrompt')?.value || DEFAULT_TRANSFER_PROMPT).trim();
            if(!prompt) {
                alert('请输入姿势迁移提示词');
                return;
            }
            try {
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 text-yellow-400 animate-spin"></i><span>迁移中</span>';
                outputPreviewImg.classList.add('hidden');
                outputPreviewEmpty.classList.remove('hidden');
                setOutputPlaceholder('loader-2', '正在姿势迁移', true);
                if(status) status.textContent = '正在上传参考图并生成输出图';
                setStatus('Transferring pose', 'loader-2');
                refreshIcons();

                const refs = [];
                let inputRef = inputImageRef;
                if(!inputRef && inputReferenceUploadPromise) inputRef = await inputReferenceUploadPromise;
                if(!inputRef) inputRef = await buildReferenceFromFile(uploadedFile);
                inputImageRef = inputRef;
                refs.push({ ...inputRef, role:'image' });
                let poseRef = poseImageRef;
                if(!poseRef && poseImageRefUploadPromise) poseRef = await poseImageRefUploadPromise;
                if(!poseRef) poseRef = await buildReferenceFromDataUrl(posePreviewImg.src, `pose-${Date.now()}.png`);
                poseImageRef = poseRef;
                refs.push({ ...poseRef, role:'image' });

                const body = {
                    prompt,
                    connection_id:providerById(selectedProvider).connection_id || selectedProvider,
                    model_id:aiModelsByName.get(`${providerById(selectedProvider).connection_id || selectedProvider}::${selectedModel}`)?.id || '',
                    model:selectedModel,
                    size:transferOutputSize(),
                    n:1,
                    reference_images:refs
                };
                if(providerProtocol(selectedProvider) === 'api') body.quality = 'auto';
                const data = await requestPoseTransfer(body);
                const image = data.images?.[0];
                if(!image) throw new Error('姿势迁移失败：接口未返回输出图');
                outputPreviewImg.src = image;
                outputPreviewImg.classList.remove('hidden');
                outputPreviewEmpty.classList.add('hidden');
                if(status) status.textContent = '姿势迁移完成';
                setStatus('Pose transferred', 'check-circle');
            } catch(err) {
                console.error(err);
                outputPreviewImg.classList.add('hidden');
                outputPreviewEmpty.classList.remove('hidden');
                setOutputPlaceholder('alert-circle', '姿势迁移失败');
                if(status) status.textContent = '姿势迁移失败';
                alert(err.message || '姿势迁移失败');
                setStatus('Transfer failed', 'alert-circle');
            } finally {
                btn.innerHTML = '<i data-lucide="wand-sparkles" class="w-4 h-4 text-yellow-400"></i><span>姿势迁移</span>';
                refreshTransferState();
                refreshIcons();
            }
        }

        document.addEventListener('click', event => {
            const action = event.target.closest('[data-pose-action]')?.dataset.poseAction;
            if(action === 'generate-fbx') generateFbx();
            else if(action === 'export') exportPose();
            else if(action === 'transfer') transferPose();
            else if(action === 'focus-editor') focusPoseEditor();
        });

        window.addEventListener('message', event => {
            const m = event.data || {};
            if(m.type === 'page-leave-check' && m.from === 'pose-studio') {
                const hadContent = !!(uploadedFile || hasClientModel);
                if(hadContent && !confirm('确定离开「姿势编辑」页面吗？\n当前上传图与 FBX 结果将被清空。')) return;
                resetPage();
                window.parent.postMessage({ type:'page-leave-allow', from:'pose-studio', target:m.target }, '*');
                return;
            }
            if(m.type === 'page-hidden' && m.page === 'pose-studio') resetPage();
        });

        function resetPage(){
            uploadedFile = null;
            hasClientModel = false;
            inputMode = 'image';
            inputImageRef = null;
            inputReferenceUploadPromise = null;
            inputUploadToken++;
            poseImageRef = null;
            poseImageRefUploadPromise = null;
            poseUploadToken++;
            setLeaveGuard(false);
            if(fileInput) fileInput.value = '';
            previewImg.removeAttribute('src');
            previewImg.classList.add('hidden');
            document.getElementById('uploadContent').classList.remove('opacity-0');
            document.getElementById('changeOverlay').classList.replace('flex', 'hidden');
            document.getElementById('generateModelBtn').disabled = true;
            document.getElementById('generateModelBtn').innerHTML = '<i data-lucide="cuboid" class="w-4 h-4 text-yellow-400"></i><span>生成模型</span>';
            document.getElementById('modelFileName').textContent = '-';
            document.getElementById('modelMeshInfo').textContent = '-';
            document.getElementById('modelOutputInfo').textContent = 'Waiting';
            document.getElementById('downloadModelBtn').classList.add('hidden');
            document.getElementById('focusEditorBtn').classList.add('hidden');
            document.getElementById('downloadPoseJson').classList.add('hidden');
            document.getElementById('downloadPosePng').classList.add('hidden');
            posePreviewImg.removeAttribute('src');
            posePreviewImg.classList.add('hidden');
            posePreviewEmpty.classList.remove('hidden');
            outputPreviewImg.removeAttribute('src');
            outputPreviewImg.classList.add('hidden');
            outputPreviewEmpty.classList.remove('hidden');
            setOutputPlaceholder('sparkles', '等待姿势迁移');
            const promptInput = document.getElementById('poseTransferPrompt');
            if(promptInput) promptInput.value = DEFAULT_TRANSFER_PROMPT;
            transferRatio = 'square';
            transferResolution = '1k';
            const ratioSelect = document.getElementById('transferRatioSelect');
            const resolutionSelect = document.getElementById('transferResolutionSelect');
            if(ratioSelect) ratioSelect.value = transferRatio;
            if(resolutionSelect) resolutionSelect.value = transferResolution;
            document.getElementById('poseExportStatus').textContent = '编辑器加载后可导出当前姿势';
            refreshTransferState();
            document.getElementById('modelState').innerHTML = '<i data-lucide="box" class="w-10 h-10 mx-auto stroke-[1px]"></i><p class="text-[10px] font-bold uppercase tracking-[0.3em]">上传图像生成 FBX，或直接上传 FBX 文件</p>';
            setStatus('Ready', 'circle');
            refreshIcons();
        }

        poseFrame.addEventListener('load', () => setStatus('Pose editor loaded', 'move-3d'));
        initModels();
        refreshIcons();
