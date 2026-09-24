import { createIcons, ArrowUp, Camera, Cloud, Download, MoveHorizontal, MoveVertical, RotateCcw, Save, TextQuote, X, Zap, ZoomIn } from 'lucide';
import '@tailwindcss/browser';
import { angleControl, updateCloudProgress } from './module.js';
import { applyAngleLanguage, t } from './i18n.js';
import RunningHubClient from '../shared/runninghub-client.js';
import StudioImagePreview from '../shared/image-preview.js';
import HistoryBulkManager from '../shared/history-bulk-manager.js';
import { listHistory } from '../services/history.js';
import '../styles/angle.css';

function applyStoredTheme() {
    let theme = 'dark';
    try {
        theme = localStorage.getItem('studio_theme') || localStorage.getItem('canvas_theme') || theme;
    } catch {}
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('studio-theme-dark', dark);
    document.documentElement.classList.toggle('theme-dark', dark);
}

applyStoredTheme();

const angleIcons = { ArrowUp, Camera, Cloud, Download, MoveHorizontal, MoveVertical, RotateCcw, Save, TextQuote, X, Zap, ZoomIn };
        const renderIcons = root => createIcons({ icons: angleIcons, root });

renderIcons();
        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('fileInput');
        document.querySelectorAll('[data-angle-reset]').forEach(button => {
            button.addEventListener('click', () => angleControl.reset(button.dataset.angleReset));
        });
        document.querySelectorAll('[data-angle-input]').forEach(input => {
            input.addEventListener('input', () => angleControl.syncInput(input.dataset.angleInput));
        });
        document.getElementById('genBtn')?.addEventListener('click', handleGenerate);
        document.getElementById('outputImg')?.addEventListener('click', zoomImage);
        document.getElementById('lightbox')?.addEventListener('click', handleOutsideClick);
        document.querySelector('[data-angle-action="close-lightbox"]')?.addEventListener('click', closeLightbox);
        document.querySelector('[data-angle-action="download-lightbox"]')?.addEventListener('click', downloadLightboxImage);
        dropzone?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', event => handleFile(event.target.files[0]));
        function tr(key){ return t(key); }
        function applyLanguage(){
            applyAngleLanguage();
            document.title = tr('nav.angle');
            const btnText = document.getElementById('btnText');
            if(btnText && !document.getElementById('genBtn')?.disabled) btnText.textContent = tr('studio.generateAngle');
        }
        applyLanguage();
        
        // --- RunningHub Qwen-Edit-2511 Multiple-Angles LoRA ---
        const RH_WEBAPP_ID = '2062489144189865985';

        function generateUUID() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                try { return crypto.randomUUID(); } catch (e) { }
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        const CLIENT_ID = localStorage.getItem("client_id") || generateUUID();
        localStorage.setItem("client_id", CLIENT_ID);

        let uploadedFile = null; // Store raw file for cloud upload
        let currentResult = null;
        let allHistory = [];
        let currentIndex = 0;
        const PAGE_SIZE = 30;

        const previewImg = document.getElementById('previewImg');
        const promptInput = document.getElementById('promptInput');

        // Drag and Drop
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('border-black', 'bg-gray-50');
        });
        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('border-black', 'bg-gray-50');
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('border-black', 'bg-gray-50');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFile(e.dataTransfer.files[0]);
            }
        });

        // Paste support
        let isHovering = false;
        dropzone.addEventListener('mouseenter', () => isHovering = true);
        dropzone.addEventListener('mouseleave', () => isHovering = false);
        window.addEventListener('paste', (e) => {
            if (!isHovering) return;
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let item of items) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    handleFile(file);
                    break;
                }
            }
        });

        async function handleFile(file) {
            if (!file) return;
            uploadedFile = file; // Store for cloud usage
            const btn = document.getElementById('genBtn');
            const btnText = document.getElementById('btnText');

            btn.disabled = true;
            btnText.innerText = tr('studio.uploading');

            const reader = new FileReader();
            reader.addEventListener('load', (e) => {
                previewImg.src = e.target.result;
                previewImg.classList.remove('hidden');
                document.getElementById('uploadContent').classList.add('opacity-0');
                document.getElementById('changeOverlay').classList.replace('hidden', 'flex');

                // Automatically apply to 3D scene
                angleControl.update3DTexture(e.target.result);
            }, {once:true});
            reader.readAsDataURL(file);

            btn.disabled = false;
            btnText.innerText = tr('studio.generateAngle');
        }

        async function runRunningHubTask() {
            if (!uploadedFile) throw new Error("Please upload an image first");

            updateCloudProgress({ status: "Uploading...", progress: 0, total: 100 });
            const target = await RunningHubClient.resolveTarget(RH_WEBAPP_ID);
            const fileName = await RunningHubClient.uploadFile(uploadedFile, uploadedFile.name || 'angle-source.png', target);
            updateCloudProgress({ status: "Queueing...", progress: 0, total: 100 });
            const taskId = await RunningHubClient.submitTask({
                ...target,
                webappId: RH_WEBAPP_ID,
                nodeInfoList: [
                    { nodeId: "13", fieldName: "image", fieldValue: fileName, description: "image" },
                    { nodeId: "68", fieldName: "value", fieldValue: promptInput.value, description: "value" }
                ],
                instanceType: "default"
            });
            const data = await RunningHubClient.pollTask(taskId, {
                ...target,
                onUpdate(task) {
                    if (task.status === 'RUNNING') updateCloudProgress({ status: "Generating...", progress: 60, total: 100 });
                }
            });
            const urls = data.urls || [];
            if (!urls.length) throw new Error("RunningHub outputs empty");
            return { images: urls };
        }

        async function handleGenerate() {
            if (!uploadedFile) {
                const dropzone = document.getElementById('dropzone');
                dropzone.style.transition = "0.2s";
                dropzone.style.borderColor = "#ef4444";
                dropzone.style.transform = "scale(0.98)";
                setTimeout(() => {
                    dropzone.style.borderColor = "";
                    dropzone.style.transform = "scale(1)";
                }, 300);
                return;
            }

            // Allow manual prompt even if angle not applied, but require prompt input
            if (!promptInput.value.trim()) {
                promptInput.style.transition = "0.2s";
                promptInput.style.borderColor = "#ef4444";
                setTimeout(() => {
                    promptInput.style.borderColor = "";
                }, 300);
                return;
            }

            const btn = document.getElementById('genBtn');
            const btnText = document.getElementById('btnText');

            btn.disabled = true;
            btn.style.backgroundColor = '#333';
            btn.innerHTML = `<i data-lucide="zap" class="w-4 h-4 text-yellow-400 fill-yellow-400 animate-pulse"></i><span class="tracking-[0.4em] text-[11px] uppercase">${tr('studio.processing')}</span>`;
            renderIcons();

            document.getElementById('emptyState').classList.add('hidden');
            document.getElementById('outputImg').classList.add('hidden');
            document.getElementById('loadingState').classList.remove('hidden');

            try {
                // Reset progress bar
                document.getElementById('cloud-progress-container').classList.add('hidden');
                document.getElementById('cloud-progress-bar').style.width = '0%';
                document.getElementById('cloud-percent').innerText = '0%';

                const data = await runRunningHubTask();

                currentResult = data;
                const outputImg = document.getElementById('outputImg');
                const downloadBtn = document.getElementById('downloadBtn');

                outputImg.src = data.images[0];
                outputImg.classList.remove('hidden');
                document.getElementById('loadingState').classList.add('hidden');

                downloadBtn.href = data.images[0];
                downloadBtn.classList.remove('hidden');
                downloadBtn.download = `Angle-${Date.now()}.png`;

                btn.style.backgroundColor = '';
                btn.innerHTML = `<i data-lucide="zap" class="w-4 h-4 text-yellow-400"></i><span id="btnText">${tr('studio.generateAngle')}</span>`;
                btn.disabled = false;
                renderIcons();

                // Add to history
                renderImageCard({
                    images: data.images,
                    prompt: promptInput.value,
                    timestamp: Date.now(),
                    is_cloud: true
                }, true);

            } catch (err) {
                console.error(err);
                btn.style.backgroundColor = '';
                btn.innerHTML = `<i data-lucide="zap" class="w-4 h-4 text-yellow-400"></i><span id="btnText">Generation Failed</span>`;
                renderIcons();
                document.getElementById('loadingState').classList.add('hidden');
                document.getElementById('emptyState').classList.remove('hidden');
                btn.disabled = false;
                if (!err.silent) {
                    alert(err.message);
                }
            }
        }

        // History Management
        function renderImageCard(data, isNew = false) {
            const masonry = document.getElementById('masonry');
            const imgUrl = data.images ? data.images[0] : '';
            if (!imgUrl) return;

            const card = document.createElement('div');
            card.dataset.historyTs = data.timestamp;
            card.className = "masonry-item relative group cursor-pointer";

            card.addEventListener('click', () => {
                if (document.body.classList.contains('history-bulk-selecting')) return;
                openLightbox(imgUrl);
            });
            
            // RunningHub Badge
            const isCloud = data.is_cloud || (imgUrl && imgUrl.includes('runninghub'));
            const badgeHtml = isCloud ? `
                <div class="absolute top-3 left-3 z-10">
                    <img src="/static/images/RunningHub-B.png" class="h-4 w-auto object-contain bg-white/90 rounded-full p-0.5 shadow-sm">
                </div>
            ` : '';

            card.innerHTML = `
                <img src="${imgUrl}" class="w-full h-full object-cover block transform group-hover:scale-105 transition-transform duration-[1.5s]">
                ${badgeHtml}
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 p-6 flex flex-col justify-end pointer-events-none">
                    <p class="text-white text-[10px] font-bold uppercase tracking-widest line-clamp-2">${data.prompt || "Angle Control"}</p>
                </div>
            `;

            if (isNew) masonry.prepend(card);
            else masonry.appendChild(card);
        }

        function loadNextPage() {
            const batch = allHistory.slice(currentIndex, currentIndex + PAGE_SIZE);
            if (batch.length === 0) {
                const el = document.getElementById('loadMoreTrigger');
                if (el) el.innerText = "End of Archive";
                return;
            }
            batch.forEach(item => renderImageCard(item, false));
            currentIndex += PAGE_SIZE;
        }

        async function loadHistory() {
            try {
                const history = await listHistory('angle');
                if (history && Array.isArray(history)) {
                    allHistory = history;
                    document.getElementById('masonry').innerHTML = '';
                    currentIndex = 0;
                    loadNextPage();
                }
            } catch (e) { console.error(e); }
        }

        // Lightbox
        let lightboxPreview = null;
        function ensureLightboxPreview(){
            if(!lightboxPreview && StudioImagePreview){
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
            if(lightboxPreview) lightboxPreview.reset();
            img.src = url;

            const lb = document.getElementById('lightbox');
            lb.classList.replace('hidden', 'flex');
            frame.classList.remove('hidden');
            document.body.style.overflow = 'hidden';

            const updateRes = () => {
                if (img.naturalWidth) {
                    resPill.innerText = `${img.naturalWidth} x ${img.naturalHeight}`;
                    resPill.style.opacity = '1';
                }
            };

            img.addEventListener('load', updateRes, {once:true});
            if (img.complete) updateRes();
        }

        function closeLightbox() {
            if(lightboxPreview) lightboxPreview.reset();
            const lb = document.getElementById('lightbox');
            lb.classList.replace('flex', 'hidden');
            document.body.style.overflow = 'auto';
        }

        function handleOutsideClick(e) {
            if (e.target.id === 'lightbox') closeLightbox();
        }

        function downloadLightboxImage() {
            const imgUrl = document.getElementById('lightboxImg').src;
            const link = document.createElement('a');
            link.href = imgUrl;
            link.download = `Angle-Master-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        function zoomImage() {
            if (currentResult && currentResult.images && currentResult.images[0]) {
                openLightbox(currentResult.images[0]);
            }
        }

        // Init
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && allHistory.length > 0) {
                loadNextPage();
            }
        }, { threshold: 0.1 });

        applyLanguage();
        loadHistory();
        HistoryBulkManager?.attach({masonry:'#masonry'});
        observer.observe(document.getElementById('loadMoreTrigger'));

        // WebSocket for real-time updates (optional but good for multi-tab sync)
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/stats?client_id=${CLIENT_ID}`;
        const socket = new WebSocket(wsUrl);
        socket.onopen = () => {
            setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) socket.send("ping");
            }, 30000);
        };
