import { createIcons, Box, CheckCircle, Zap } from 'lucide';
import RunningHubClient from '../shared/runninghub-client.js';
import { listHistory, saveHistory } from '../services/history.js';
import StudioImagePreview from '../shared/image-preview.js';
import HistoryBulkManager from '../shared/history-bulk-manager.js';
import '../pages/gaussian/page.css';
import { applyStoredTheme } from '../shared/theme-bootstrap.js';

        applyStoredTheme();

        const gaussianIcons = { Box, CheckCircle, Zap };
        const renderIcons = root => createIcons({ icons: gaussianIcons, root });
        renderIcons();

        // ===== RunningHub「3D高斯泼溅修复」配置 =====
        const RH_WEBAPP_ID = "2062741736430063617";
        const RH_NODE_GAUSSIAN = "38";   // GaussianImage（查看器渲染图）
        const RH_NODE_SOURCE = "40";     // SourceImage（输入图）

        // 3D高斯泼溅生成 AI 应用
        const GEN_WEBAPP_ID = "2062753529172938753";
        const GEN_NODE_IMAGE = "18";     // 输入图

        const fileInput = document.getElementById('fileInput');
        const dropzone = document.getElementById('dropzone');
        const previewImg = document.getElementById('previewImg');
        const viewerFrame = document.getElementById('viewerFrame');

        let uploadedFile = null;     // 输入源图(File)
        let currentResult = null;
        let plyLoaded = false;       // 查看器是否已成功加载生成的 PLY（门控开始修复）

        // 生成进度条
        function updateGenProgress(data) {
            const container = document.getElementById('gen-progress-container');
            const statusText = document.getElementById('gen-status-text');
            const bar = document.getElementById('gen-progress-bar');
            const pct = document.getElementById('gen-percent');
            if (!container) return;
            container.classList.remove('hidden');
            if (data.status) statusText.innerText = data.status;
            if (typeof data.progress !== 'undefined') {
                const p = Math.min(100, Math.round(data.progress));
                bar.style.width = `${p}%`;
                pct.innerText = `${p}%`;
            }
        }

        // 进度条
        function updateCloudProgress(data) {
            const container = document.getElementById('cloud-progress-container');
            const statusText = document.getElementById('cloud-status-text');
            const progressBar = document.getElementById('cloud-progress-bar');
            const percentText = document.getElementById('cloud-percent');
            if (!container) return;
            container.classList.remove('hidden');
            if (data.status) statusText.innerText = data.status;
            if (typeof data.progress !== 'undefined') {
                const percent = Math.min(100, Math.round(data.progress));
                progressBar.style.width = `${percent}%`;
                percentText.innerText = `${percent}%`;
            }
        }

        // ===== 输入图上传（与角度控制一致）=====
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('border-black'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('border-black'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault(); dropzone.classList.remove('border-black');
            const f = e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) handleFile(f);
        });
        fileInput.addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) handleFile(f);
        });

        async function handleFile(file) {
            if (!file || !/^image\//.test(file.type)) return;
            uploadedFile = file;
            refreshLeaveGuard();

            const reader = new FileReader();
            reader.addEventListener('load', (e) => {
                previewImg.src = e.target.result;
                previewImg.classList.remove('hidden');
                document.getElementById('uploadContent').classList.add('opacity-0');
                document.getElementById('changeOverlay').classList.replace('hidden', 'flex');
                // 读取宽高 -> 通知查看器按其宽高 + FOV 计算 intrinsics
                const probe = new Image();
                probe.addEventListener('load', () => {
                    if (viewerFrame.contentWindow) {
                        viewerFrame.contentWindow.postMessage({
                            type: 'SET_SOURCE_INTRINSICS', width: probe.naturalWidth, height: probe.naturalHeight
                        }, '*');
                    }
                });
                probe.src = e.target.result;
            });
            reader.readAsDataURL(file);

        }

        // ===== 3D 高斯生成：输入图 -> 工作流 -> PLY URL -> 自动喂给查看器 =====
        async function handleGenerate() {
            if (!uploadedFile) {
                dropzone.style.transition = '0.2s';
                dropzone.style.borderColor = '#ef4444';
                setTimeout(() => { dropzone.style.borderColor = ''; }, 300);
                return;
            }
            const btn = document.getElementById('genGaussianBtn');
            const btnText = document.getElementById('genBtnText');
            btn.disabled = true;
            const original = btnText.innerText;
            btnText.innerText = 'Generating';
            // 生成新模型期间，先禁用开始修复
            plyLoaded = false;
            setRepairEnabled(false);
            document.getElementById('gen-progress-container').classList.add('hidden');
            document.getElementById('gen-progress-bar').style.width = '0%';
            document.getElementById('gen-percent').innerText = '0%';

            try {
                // 解析 RunningHub 目标资源（connection_id / resource_id），
                // 上传、提交、查询都必须携带，否则后端会拒绝素材上传。
                const genTarget = await RunningHubClient.resolveTarget(GEN_WEBAPP_ID);

                updateGenProgress({ status: '上传参考图...', progress: 10 });
                const imageFileName = await RunningHubClient.uploadFile(uploadedFile, uploadedFile.name || 'source.png', genTarget);

                updateGenProgress({ status: 'Queueing...', progress: 30 });
                const taskId = await RunningHubClient.submitTask({
                    webappId: GEN_WEBAPP_ID,
                    nodeInfoList: [
                        { nodeId: GEN_NODE_IMAGE, fieldName: 'image', fieldValue: imageFileName, description: 'image' }
                    ],
                    instanceType: 'default',
                    connection_id: genTarget.connection_id,
                    resource_id: genTarget.resource_id
                });

                const data = await RunningHubClient.pollTask(taskId, {
                    persistOutputs: false,
                    connection_id: genTarget.connection_id,
                    resource_id: genTarget.resource_id,
                    onUpdate(task) {
                        if (task.status === 'QUEUED') updateGenProgress({ status: 'Queueing...', progress: 45 });
                        else if (task.status === 'RUNNING') updateGenProgress({ status: 'Generating...', progress: 70 });
                    }
                });
                const urls = data.urls || [];
                let plyUrl = urls.find(u => /\.ply(\?|$)/i.test(u)) || urls[0];
                if (!plyUrl) throw new Error('生成输出为空');

                updateGenProgress({ status: '加载到查看器...', progress: 95 });
                // 把生成的 PLY URL 推送给查看器加载（成功后会回传 PLY_LOADED 解锁修复）
                if (viewerFrame.contentWindow) {
                    viewerFrame.contentWindow.postMessage({ type: 'LOAD_PLY_URL', url: plyUrl }, '*');
                }
                document.getElementById('genState').innerHTML =
                    '<i data-lucide="check-circle" class="w-12 h-12 mx-auto stroke-[1px] text-green-500"></i>' +
                    '<p class="text-[10px] font-bold uppercase tracking-[0.3em] mt-3">已生成，正在载入查看器…</p>';
                renderIcons();
            } catch (err) {
                console.error(err);
                updateGenProgress({ status: '失败', progress: 0 });
                if (!err.silent) alert(err.message);
            } finally {
                btn.disabled = false;
                btnText.innerText = original;
            }
        };

        // 启用/禁用「开始修复」按钮
        function setRepairEnabled(enabled) {
            const btn = document.getElementById('genBtn');
            if (btn) btn.disabled = !enabled;
        }

        // 向宿主声明/取消"离开本页需确认"守卫
        function setLeaveGuard(active) {
            try { window.parent.postMessage({ type: 'page-guard', page: 'gaussian', active: !!active }, '*'); } catch (e) {}
        }
        // 根据当前是否有内容自动更新守卫
        function refreshLeaveGuard() {
            setLeaveGuard(!!(uploadedFile || plyLoaded || currentResult));
        }

        // ===== 向查看器请求当前视角渲染图（GaussianImage）=====
        function requestViewerRender(timeout = 15000) {
            return new Promise((resolve, reject) => {
                if (!viewerFrame.contentWindow) { reject(new Error('查看器未就绪')); return; }
                const reqId = 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2);
                const onMsg = (event) => {
                    const m = event.data || {};
                    if (m.request_id !== reqId) return;
                    window.removeEventListener('message', onMsg);
                    clearTimeout(timer);
                    if (m.type === 'RENDER_RESULT' && m.image) resolve(m.image);
                    else reject(new Error(m.error || '渲染失败'));
                };
                const timer = setTimeout(() => { window.removeEventListener('message', onMsg); reject(new Error('渲染超时')); }, timeout);
                window.addEventListener('message', onMsg);
                viewerFrame.contentWindow.postMessage({ type: 'REQUEST_RENDER', request_id: reqId }, '*');
            });
        }

        // dataURL -> Blob
        function dataUrlToBlob(dataUrl) {
            const [head, b64] = dataUrl.split(',');
            const mime = (head.match(/data:(.*?);/) || [,'image/png'])[1];
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type: mime });
        }

        async function runRepairTask() {
            // 解析 RunningHub 目标资源（connection_id / resource_id），
            // 上传、提交、查询都必须携带，否则后端会拒绝素材上传。
            const repairTarget = await RunningHubClient.resolveTarget(RH_WEBAPP_ID);

            // 1. 输入源图 -> SourceImage fileName
            updateCloudProgress({ status: '上传参考图...', progress: 10 });
            const sourceFileName = await RunningHubClient.uploadFile(uploadedFile, uploadedFile.name || 'source.png', repairTarget);

            // 2. 查看器渲染图 -> GaussianImage fileName
            updateCloudProgress({ status: '渲染高斯视角...', progress: 25 });
            const renderDataUrl = await requestViewerRender();
            updateCloudProgress({ status: '上传渲染图...', progress: 40 });
            const gaussianFileName = await RunningHubClient.uploadFile(dataUrlToBlob(renderDataUrl), 'gaussian_render.png', repairTarget);

            // 3. 提交任务
            updateCloudProgress({ status: 'Queueing...', progress: 55 });
            const taskId = await RunningHubClient.submitTask({
                webappId: RH_WEBAPP_ID,
                nodeInfoList: [
                    { nodeId: RH_NODE_GAUSSIAN, fieldName: 'image', fieldValue: gaussianFileName, description: 'GaussianImage' },
                    { nodeId: RH_NODE_SOURCE, fieldName: 'image', fieldValue: sourceFileName, description: 'SourceImage' }
                ],
                instanceType: 'default',
                connection_id: repairTarget.connection_id,
                resource_id: repairTarget.resource_id
            });

                const data = await RunningHubClient.pollTask(taskId, {
                    persistOutputs: false,
                    connection_id: repairTarget.connection_id,
                    resource_id: repairTarget.resource_id,
                    onUpdate(task) {
                        if (task.status === 'QUEUED') updateCloudProgress({ status: 'Queueing...', progress: 60 });
                        else if (task.status === 'RUNNING') updateCloudProgress({ status: 'Generating...', progress: 80 });
                    }
                });
            const urls = data.urls || [];
            if (!urls.length) throw new Error('修复输出为空');
            updateCloudProgress({ status: 'Done', progress: 100 });
            return { images: urls };
        }

        async function handleRepair() {
            if (!uploadedFile) {
                dropzone.style.transition = '0.2s';
                dropzone.style.borderColor = '#ef4444';
                dropzone.style.transform = 'scale(0.98)';
                setTimeout(() => { dropzone.style.borderColor = ''; dropzone.style.transform = 'scale(1)'; }, 300);
                return;
            }
            if (!plyLoaded) { alert('请先点击「3D 高斯生成」并等待模型载入查看器'); return; }

            const btn = document.getElementById('genBtn');
            btn.disabled = true;
            btn.style.backgroundColor = '#333';
            btn.innerHTML = `<i data-lucide="zap" class="w-4 h-4 text-yellow-400 fill-yellow-400 animate-pulse"></i><span class="tracking-[0.4em] text-[11px] uppercase">Processing</span>`;
            renderIcons();

            document.getElementById('emptyState').classList.add('hidden');
            document.getElementById('outputImg').classList.add('hidden');
            document.getElementById('loadingState').classList.remove('hidden');
            document.getElementById('cloud-progress-container').classList.add('hidden');
            document.getElementById('cloud-progress-bar').style.width = '0%';
            document.getElementById('cloud-percent').innerText = '0%';

            try {
                const data = await runRepairTask();
                currentResult = data;
                refreshLeaveGuard();
                const outputImg = document.getElementById('outputImg');
                const downloadBtn = document.getElementById('downloadBtn');
                outputImg.src = data.images[0];
                outputImg.classList.remove('hidden');
                document.getElementById('loadingState').classList.add('hidden');
                downloadBtn.href = data.images[0];
                downloadBtn.classList.remove('hidden');
                downloadBtn.download = `Gaussian-Repair-${Date.now()}.png`;
                // 持久化到历史归档（type=gaussian），刷新后仍可见
                try {
                    await saveHistory({ images: data.images, type: 'gaussian', prompt: 'Gaussian Repair', is_cloud: true });
                } catch (e) { console.error('保存历史失败', e); }
                loadHistory();
            } catch (err) {
                console.error(err);
                document.getElementById('loadingState').classList.add('hidden');
                document.getElementById('emptyState').classList.remove('hidden');
                if (!err.silent) alert(err.message);
            } finally {
                btn.disabled = !plyLoaded;
                btn.style.backgroundColor = '';
                btn.innerHTML = `<i data-lucide="zap" id="btnIcon" class="w-4 h-4 text-yellow-400"></i><span id="btnText">生成新视角</span>`;
                renderIcons();
            }
        };

        // ===== 结果放大/灯箱 =====
        function zoomImage() { const img = document.getElementById('outputImg'); if (img.src) openLightbox(img.src); }

        // ===== 归档（沿用角度控制：type=gaussian）=====
        let allHistory = [];
        let currentIndex = 0;
        const PAGE_SIZE = 12;

        function renderImageCard(data, isNew = false) {
            const masonry = document.getElementById('masonry');
            const imgUrl = data.images ? data.images[0] : '';
            if (!imgUrl) return;
            const card = document.createElement('div');
            card.className = 'masonry-item relative group cursor-pointer';
            card.dataset.historyTs = data.timestamp;
            card.id = 'history-' + data.timestamp;
            card.addEventListener('click', () => {
                if (document.body.classList.contains('history-bulk-selecting')) return;
                openLightbox(imgUrl);
            });
            const isCloud = data.is_cloud || (imgUrl && imgUrl.includes('runninghub'));
            const badgeHtml = isCloud ? `<div class="absolute top-3 left-3 z-10"><img src="/static/images/RunningHub-B.png" class="h-4 w-auto object-contain bg-white/90 rounded-full p-0.5 shadow-sm"></div>` : '';
            card.innerHTML = `
                <img src="${imgUrl}" class="w-full h-full object-cover block transform group-hover:scale-105 transition-transform duration-[1.5s]">
                ${badgeHtml}`;
            if (isNew) masonry.prepend(card); else masonry.appendChild(card);
        }

        function loadNextPage() {
            const batch = allHistory.slice(currentIndex, currentIndex + PAGE_SIZE);
            if (!batch.length) return;
            batch.forEach(item => renderImageCard(item));
            currentIndex += PAGE_SIZE;
        }

        async function loadHistory() {
            try {
                const history = await listHistory('gaussian');
                if (Array.isArray(history)) {
                    allHistory = history;
                    document.getElementById('masonry').innerHTML = '';
                    currentIndex = 0;
                    loadNextPage();
                }
            } catch (e) { console.error(e); }
        }

        // ===== 灯箱 =====
        let lightboxPreview = null;
        function ensureLightboxPreview() {
            if (!lightboxPreview && StudioImagePreview) {
                lightboxPreview = StudioImagePreview.attach(document.getElementById('lightboxFrame'));
            }
            return lightboxPreview;
        }
        function openLightbox(url) {
            const frame = document.getElementById('lightboxFrame');
            const img = document.getElementById('lightboxImg');
            const resPill = document.getElementById('lightboxRes');
            resPill.style.opacity = '0';
            ensureLightboxPreview();
            if (lightboxPreview) lightboxPreview.reset();
            img.src = url;
            const lb = document.getElementById('lightbox');
            lb.classList.replace('hidden', 'flex');
            frame.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            const updateRes = () => { if (img.naturalWidth) { resPill.innerText = `${img.naturalWidth} x ${img.naturalHeight}`; resPill.style.opacity = '1'; } };
            img.addEventListener('load', updateRes, {once:true});
            if (img.complete) updateRes();
        }
        function closeLightbox() {
            if (lightboxPreview) lightboxPreview.reset();
            document.getElementById('lightbox').classList.replace('flex', 'hidden');
            document.body.style.overflow = 'auto';
        };
        function handleOutsideClick(e) { if (e.target.id === 'lightbox') closeLightbox(); }
        function downloadLightboxImage() {
            const img = document.getElementById('lightboxImg');
            if (!img.src) return;
            const a = document.createElement('a');
            a.href = img.src; a.download = `Gaussian-Repair-${Date.now()}.png`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }

        // ===== 监听查看器就绪 =====
        window.addEventListener('message', (event) => {
            const m = event.data || {};
            // 宿主询问能否离开本页
            if (m.type === 'page-leave-check' && m.from === 'gaussian') {
                const hadContent = !!(uploadedFile || plyLoaded || currentResult);
                if (hadContent) {
                    const ok = confirm('确定离开「高斯修复」页面吗？\n当前的上传图、生成模型与修复结果将被清空。');
                    if (!ok) return; // 用户取消：留在本页，不切换
                }
                // 允许离开：通知宿主切换到目标页，并重置本页
                resetPage();
                window.parent.postMessage({ type: 'page-leave-allow', from: 'gaussian', target: m.target }, '*');
                return;
            }
            // 兜底：宿主直接要求隐藏/重置（force 切换路径）
            if (m.type === 'page-hidden' && m.page === 'gaussian') { resetPage(); return; }
            if (m.type === 'PLY_LOADED') {
                plyLoaded = true;
                refreshLeaveGuard();
                setRepairEnabled(true);
                updateGenProgress({ status: '已载入查看器', progress: 100 });
                const genState = document.getElementById('genState');
                if (genState) {
                    genState.innerHTML =
                        '<i data-lucide="check-circle" class="w-12 h-12 mx-auto stroke-[1px] text-green-500"></i>' +
                        '<p class="text-[10px] font-bold uppercase tracking-[0.3em] mt-3">高斯模型已就绪，可开始修复</p>';
                    renderIcons();
                }
            }
            else if (m.type === 'PLY_LOAD_ERROR') {
                plyLoaded = false;
                setRepairEnabled(false);
                updateGenProgress({ status: '载入失败: ' + (m.error || ''), progress: 0 });
            }
        });

        // ===== 切出本页时重置 =====
        function resetPage() {
            // 状态变量
            uploadedFile = null;
            plyLoaded = false;
            currentResult = null;
            setLeaveGuard(false);

            // 01 输入图
            if (fileInput) fileInput.value = '';
            if (previewImg) { previewImg.removeAttribute('src'); previewImg.classList.add('hidden'); }
            const uploadContent = document.getElementById('uploadContent');
            if (uploadContent) uploadContent.classList.remove('opacity-0');
            const changeOverlay = document.getElementById('changeOverlay');
            if (changeOverlay) changeOverlay.classList.replace('flex', 'hidden');

            // 02 生成状态/进度 + 修复按钮
            const genState = document.getElementById('genState');
            if (genState) {
                genState.innerHTML =
                    '<i data-lucide="box" class="w-10 h-10 mx-auto stroke-[1px]"></i>' +
                    '<p class="text-[10px] font-bold uppercase tracking-[0.3em]">上传参考图后，点击生成 3D 高斯模型</p>';
            }
            const genProg = document.getElementById('gen-progress-container');
            if (genProg) genProg.classList.add('hidden');
            const genBar = document.getElementById('gen-progress-bar');
            if (genBar) genBar.style.width = '0%';
            const genPct = document.getElementById('gen-percent');
            if (genPct) genPct.innerText = '0%';
            const genBtnEl = document.getElementById('genGaussianBtn');
            if (genBtnEl) genBtnEl.disabled = false;
            setRepairEnabled(false);

            // 03 查看器：重载 iframe 清空已加载的 PLY
            if (viewerFrame) {
                viewerFrame.src = '/static/gaussian-viewer.html?embed=1';
            }

            // 04 结果预览
            const outputImg = document.getElementById('outputImg');
            if (outputImg) { outputImg.removeAttribute('src'); outputImg.classList.add('hidden'); }
            const downloadBtn = document.getElementById('downloadBtn');
            if (downloadBtn) downloadBtn.classList.add('hidden');
            const loadingState = document.getElementById('loadingState');
            if (loadingState) loadingState.classList.add('hidden');
            const emptyState = document.getElementById('emptyState');
            if (emptyState) emptyState.classList.remove('hidden');
            const cloudProg = document.getElementById('cloud-progress-container');
            if (cloudProg) cloudProg.classList.add('hidden');

            renderIcons();
        }

        // 初始化
        renderIcons();
        loadHistory();
        // 归档批量管理（管理 / 多选 / 删除），与角度控制页一致
        HistoryBulkManager?.attach({ masonry: '#masonry' });

        document.querySelector('[data-gaussian-action="generate"]')?.addEventListener('click', handleGenerate);
        document.querySelector('[data-gaussian-action="repair"]')?.addEventListener('click', handleRepair);
        document.querySelector('[data-gaussian-action="zoom-image"]')?.addEventListener('click', zoomImage);
        document.querySelector('[data-gaussian-action="outside-click"]')?.addEventListener('click', handleOutsideClick);
        document.querySelector('[data-gaussian-action="close-lightbox"]')?.addEventListener('click', closeLightbox);
        document.querySelector('[data-gaussian-action="download-lightbox"]')?.addEventListener('click', downloadLightboxImage);
import '@tailwindcss/browser';
