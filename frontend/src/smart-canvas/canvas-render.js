// 从 static/js/smart-canvas.js 剪切出的核心渲染/节点事件绑定逻辑（M7 拆分批次）。
// 剪切时未改动任何函数签名/内部逻辑，只做了纯粹的位置搬移。
//
// 为什么这里不用 ES module 的 export/import（跟 M1-M6 同一个原因）：
// smart-canvas.js 依赖经典 <script> 的全局作用域语义，
// static/smart-canvas.html 里 57 处内联 onclick="xxx()" 都依赖这一点。
// 所以这里同样只做"物理文件拆分"：canvas-render.js 保持经典脚本语法，通过
// <script src="canvas-render.js"> 排在 upload.js 之后、main.js 之前加载。
//
// 本文件包含两类东西：
//   1. 节点卡片 HTML 构建：smartGroupBodyHtml / jimengPendingBodyHtml /
//      smartRecoverableImageTask / imageTaskRecoverBodyHtml / nodeBodyHtml
//   2. 主渲染循环与节点事件绑定：formatRunDuration / nodeRunElapsedMs /
//      runTimePillHtml / hideRunTimerForNode / refreshRunTimerPills /
//      render / measureSmartNodeImages / pickMediaForSmartNode /
//      bindNodeEvents / rectOverlapNode / dragConnectTargetFor /
//      canAutoConnectDraggedNode / restoreDraggedNodePosition
//
// 这是整个 smart-canvas.js 中耦合度最高的模块：render()/bindNodeEvents() 直接
// 读写几乎所有全局状态（nodes/viewport/selectedId/selectedIds/selectedImage/
// dragState/portDragState/smartLoopContext 等），并调用其余全部模块导出的函数。
//
// 明确排除、留在 main.js 或其它模块的内容（按"实际调用关系"而非物理位置判断，
// 与 M3-M6 采用的判定原则一致）：
//   - bindPromptNodeControls / bindScrollableText（物理上紧邻，
//     但只服务于 smart-prompt 节点，属于未来 prompt-node.js 的范围）
//   - window.onmousemove / window.onmouseup（全局鼠标事件总线，横跨拖拽/
//     平移/裁剪/全景图/资产库等所有模块的交互状态，且是匿名函数赋值，
//     不是具名函数声明；本次不动，留在 main.js，避免过早耦合到还不存在的
//     image-editor.js / asset-library.js 的拆分边界）
//   - deleteNode / clearNodeMediaBeforeDelete / deleteNodeFromButton
//     （节点生命周期管理，非渲染/事件绑定核心，留待后续评估）

function smartGroupBodyHtml(node){
    const groupThumbLayout = smartGroupThumbLayout(node);
    const refThumbs = groupThumbLayout?.refs || [];
    const members = smartGroupMembers(node);
    const counts = members.reduce((acc, member) => {
        if(member.type === 'smart-prompt') acc.prompt += 1;
        else if(member.type === 'smart-loop') acc.loop += 1;
        return acc;
    }, {prompt:0, media:refThumbs.length, loop:0});
    const summary = [
        counts.prompt ? `${counts.prompt} 提示词` : '',
        counts.media ? `${counts.media} 图片` : '',
        counts.loop ? `${counts.loop} 循环` : ''
    ].filter(Boolean).join(' · ') || '双击或拖入图片';
    if(refThumbs.length){
        const totalThumbs = Math.max(1, Number(groupThumbLayout?.rows || 1) * Number(groupThumbLayout?.cols || 1));
        if(totalThumbs === 1 && refThumbs.length === 1){
            const ref = refThumbs[0];
            const innerW = Math.max(24, Number(groupThumbLayout.innerW || groupThumbLayout.width || SMART_GROUP_DEFAULT_WIDTH));
            const innerH = Math.max(24, Number(groupThumbLayout.innerH || groupThumbLayout.height || SMART_GROUP_DEFAULT_HEIGHT));
            return `<div class="smart-group-card has-thumbs">
                <div class="smart-group-summary"><i data-lucide="group"></i><span>${escapeHtml(summary)}</span></div>
                <div class="image-wrap smart-group-single-thumb ${selectedImage.nodeId === ref.nodeId && Number(selectedImage.index) === Number(ref.index) ? 'image-selected' : ''}" data-ref-node-id="${escapeAttr(ref.nodeId)}" data-ref-image-index="${ref.index}" data-image-index="${ref.index}" data-media-signature="${escapeAttr(`${mediaKindForItem(ref.item)}:${ref.item?.url || ''}`)}" style="--node-img-w:${innerW}px;--node-img-h:${innerH}px">${singleMediaHtml(ref.item, innerW, innerH)}${imageResolutionBadgeHtml(ref.item)}</div>
            </div>`;
        }
        return `<div class="smart-group-card has-thumbs">
            <div class="smart-group-summary"><i data-lucide="group"></i><span>${escapeHtml(summary)}</span></div>
            <div class="thumb-grid smart-group-thumb-grid" style="--thumb-cols:${groupThumbLayout.cols}; --thumb-size:${groupThumbLayout.thumb}px">${refThumbs.map(ref => {
                return `<div class="thumb-item ${selectedImage.nodeId === ref.nodeId && Number(selectedImage.index) === Number(ref.index) ? 'image-selected' : ''}" data-ref-node-id="${escapeAttr(ref.nodeId)}" data-ref-image-index="${ref.index}" data-image-index="${ref.index}" data-media-signature="${escapeAttr(`${mediaKindForItem(ref.item)}:${ref.item?.url || ''}`)}">${thumbMediaHtml(ref.item)}${imageResolutionBadgeHtml(ref.item)}</div>`;
            }).join('')}</div>
        </div>`;
    }
    return `<div class="smart-group-card">
        <div class="smart-group-summary"><i data-lucide="group"></i><span>${escapeHtml(summary)}</span></div>
        ${members.length ? '' : `<div class="smart-group-empty"><i data-lucide="plus"></i><span>拖入图片自动收进分组</span></div>`}
    </div>`;
}
function nodeBodyHtml(node, layout){
    if(node.type === 'smart-group') return smartGroupBodyHtml(node);
    if(node.type === 'smart-prompt') return promptNodeBodyHtml(node);
    if(node.type === 'smart-loop') return smartLoopBodyHtml(node);
    const imgs = (node.images || []).map(imageForDisplay);
    if(node.jimengPending && node.jimengPending.submitId && imgs.length === 0){
        return jimengPendingBodyHtml(node, layout);
    }
    const recoverTask = smartRecoverableImageTask(node);
    if(recoverTask && imgs.length === 0){
        return imageTaskRecoverBodyHtml(node, recoverTask, layout);
    }
    if(node.queued && imgs.length === 0 && !node.pending){
        return `<div class="loading-cell single queued" style="width:${layout.width}px;height:${layout.height}px"></div>`;
    }
    if(node.pending && imgs.length === 0){
        const count = Math.max(1, Number(node.pending) || 1);
        if(count <= 1 || node.pendingCandidatePool) return `<div class="loading-cell single" style="width:${layout.width}px;height:${layout.height}px"></div>`;
        const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
        const rows = Math.ceil(count / cols);
        return `<div class="loading-skeleton" style="grid-template-columns:repeat(${cols}, 1fr);grid-template-rows:repeat(${rows}, 1fr);width:${layout.width}px;height:${layout.height}px;padding:8px;box-sizing:border-box">${Array.from({length:count}).map(() => `<div class="loading-cell"></div>`).join('')}</div>`;
    }
    if(imgs.length > 1) return `<div class="thumb-grid" style="--thumb-cols:${layout.cols}; --thumb-size:${layout.thumb}px">${imgs.map((img, i) => `<div class="thumb-item ${selectedImage.nodeId === node.id && selectedImage.index === i ? 'image-selected' : ''}" data-image-index="${i}" data-media-signature="${escapeAttr(`${mediaKindForItem(img)}:${img?.url || ''}`)}">${thumbMediaHtml(img)}${imageResolutionBadgeHtml(img)}</div>`).join('')}</div>`;
    if(imgs[0]) return `<div class="image-wrap ${candidatePanelNodeId === node.id ? 'candidate-open' : ''} ${selectedImage.nodeId === node.id && selectedImage.index === 0 ? 'image-selected' : ''}" data-image-index="0" data-media-signature="${escapeAttr(`${mediaKindForItem(imgs[0])}:${imgs[0]?.url || ''}`)}" style="--node-img-w:${layout.width}px;--node-img-h:${layout.height}px">${singleMediaHtml(imgs[0], layout.width, layout.height)}${imageResolutionBadgeHtml(imgs[0])}${candidateOverlayHtml(node, layout)}</div>`;
    return `<div class="node-drop">
        <button class="generation-node-trigger" type="button" data-upload-action="files" title="${escapeHtml(genKindLabel(node))}">
            <span class="generation-node-main"><i data-lucide="${genKindIcon(node)}"></i></span>
            <span class="generation-node-title">${escapeHtml(genKindLabel(node))}</span>
            <span class="generation-node-sub">拖拽 / 粘贴 / 点击上传</span>
        </button>
    </div>`;
}
function jimengPendingBodyHtml(node, layout){
    const jp = node.jimengPending || {};
    const querying = Boolean(jp.querying);
    const queueText = jimengQueueText(jp.queueInfo);
    return `<div class="jimeng-pending-cell loading-cell single" style="width:${layout.width}px;height:${layout.height}px">
        <div class="jimeng-pending-overlay">
            <div class="jimeng-pending-spinner"><i data-lucide="loader-2"></i></div>
            <div class="jimeng-pending-text">${escapeHtml(queueText)}</div>
            <div class="jimeng-pending-sub">任务未丢失，可继续等待或手动查询</div>
            <button class="jimeng-pending-query" type="button" data-jimeng-query="${escapeAttr(node.id)}" ${querying ? 'disabled' : ''}><i data-lucide="${querying ? 'loader-2' : 'refresh-cw'}"></i><span>${querying ? '查询中…' : '查询结果'}</span></button>
        </div>
    </div>`;
}
function smartRecoverableImageTask(node){
    return smartPendingTasks(node).find(task => task.failed && task.recoverTaskId) || null;
}
function imageTaskRecoverBodyHtml(node, task, layout){
    const querying = Boolean(task.querying);
    const failedCount = smartPendingTasks(node).filter(item => item.failed && item.recoverTaskId).length;
    const title = querying ? '查询中' : '任务未丢失';
    const sub = failedCount > 1 ? `还有 ${failedCount} 个任务可查询` : `任务 ID：${task.recoverTaskId || ''}`;
    return `<div class="jimeng-pending-cell loading-cell single" style="width:${layout.width}px;height:${layout.height}px">
        <div class="jimeng-pending-overlay">
            <div class="jimeng-pending-spinner"><i data-lucide="${querying ? 'loader-2' : 'refresh-cw'}"></i></div>
            <div class="jimeng-pending-text">${escapeHtml(title)}</div>
            <div class="jimeng-pending-sub">${escapeHtml(sub)}</div>
            <button class="jimeng-pending-query" type="button" data-image-task-query="${escapeAttr(node.id)}" data-task-id="${escapeAttr(task.taskId)}" ${querying ? 'disabled' : ''}><i data-lucide="${querying ? 'loader-2' : 'refresh-cw'}"></i><span>${querying ? '查询中…' : '查询结果'}</span></button>
        </div>
    </div>`;
}
// M1 拆分：nowMs 已迁移到 frontend/src/smart-canvas/utils.js。
function formatRunDuration(ms){
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return min ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}s`;
}
function nodeRunElapsedMs(node){
    if(!node) return 0;
    if(node.runFinishedAt && node.runStartedAt) return Number(node.runElapsedMs) || (Number(node.runFinishedAt) - Number(node.runStartedAt));
    if(node.runStartedAt) return nowMs() - Number(node.runStartedAt);
    return 0;
}
function runTimePillHtml(node){
    if(!node || node.runTimerHidden || node.type === 'smart-prompt') return '';
    const running = Boolean(node.pending || node.running || node.jimengPending);
    if(!running && !node.runFinishedAt) return '';
    const cls = running ? '' : ' done';
    return `<span class="run-time-pill${cls}" data-run-timer="${escapeHtml(node.id)}">${formatRunDuration(nodeRunElapsedMs(node))}</span>`;
}
function hideRunTimerForNode(node){
    if(!node || node.runTimerHidden || node.pending || node.running || node.jimengPending || !node.runFinishedAt) return false;
    node.runTimerHidden = true;
    scheduleSave();
    return true;
}
function refreshRunTimerPills(){
    const active = nodes.some(n => n.type !== 'smart-prompt' && !n.runTimerHidden && (n.pending || n.running || n.jimengPending || n.runFinishedAt));
    document.querySelectorAll('[data-run-timer]').forEach(el => {
        const node = nodes.find(n => n.id === el.dataset.runTimer);
        if(!node || node.runTimerHidden || node.type === 'smart-prompt') {
            el.remove();
            return;
        }
        el.textContent = formatRunDuration(nodeRunElapsedMs(node));
        el.classList.toggle('done', Boolean(!node.pending && !node.running && !node.jimengPending && node.runFinishedAt));
    });
    if(active && !runTimerInterval) runTimerInterval = setInterval(refreshRunTimerPills, 1000);
    if(!active && runTimerInterval){ clearInterval(runTimerInterval); runTimerInterval = null; }
}
function render(){
    const mediaStates = captureMediaPlaybackStates();
    const reusableNodes = new Map();
    world.querySelectorAll('.image-node').forEach(el => {
        const node = nodes.find(n => n.id === el.dataset.id);
        if(smartNodeHasLiveMedia(node)) reusableNodes.set(node.id, el);
    });
    let migratedCandidates = false;
    const nodeHtmlEntries = nodes.map(node => {
        if(migrateGeneratedImagesToCandidatePool(node)) migratedCandidates = true;
        const imgs = node.images || [];
        const title = node.type === 'smart-group' ? (node.title || '智能分组') : node.type === 'smart-prompt' ? 'Prompt' : node.type === 'smart-loop' ? 'Loop' : (imgs.length > 1 ? 'Group' : imgs.length ? 'Image' : escapeHtml(genKindLabel(node)));
        const scale = nodeScale(node);
        const layout = imageLayout(imgs, scale, node);
        const isPrompt = node.type === 'smart-prompt';
        const isLoop = node.type === 'smart-loop';
        const isSmartGroup = node.type === 'smart-group';
        const isCompactMember = isSmartGroupCompactMember(node);
        const isImageNode = node.type === 'smart-image' || !node.type;
        const isJimengPending = Boolean(node.jimengPending && node.jimengPending.submitId && imgs.length === 0);
        const isQueued = Boolean(node.queued && imgs.length === 0 && !node.pending && !isJimengPending);
        const isEmpty = isImageNode && imgs.length === 0 && !node.pending && !isQueued && !isJimengPending;
        const isHistory = isHistoryGroupNode(node);
        const isGroup = isImageNode && imgs.length > 1;
        const isPending = ((node.pending || isQueued || isJimengPending) && imgs.length === 0);
        const body = nodeBodyHtml(node, layout);
        const hint = isSmartGroup ? '拖入图片、提示词或循环节点' : isPending ? escapeHtml(tr('smart.hintPending')) : (imgs.length > 1 ? escapeHtml(tr('smart.hintMulti')) : imgs.length ? escapeHtml(tr('smart.hintSingle')) : escapeHtml(node.genKind === 'video' ? '支持视频 / 音频，也可直接文生视频' : node.genKind === 'workflow' ? '支持图片 / 视频 / 音频，ComfyUI 工作流生成' : '支持图片 / 视频 / 音频，也可直接文生图'));
        const floatingActions = candidateControlHtml(node);
        const html = `<div class="image-node ${isEmpty ? 'empty-node' : ''} ${isGroup ? 'group-node' : ''} ${isHistory ? 'history-group-node' : ''} ${isPrompt ? 'prompt-smart-node' : ''} ${isLoop ? 'loop-smart-node' : ''} ${isSmartGroup ? 'smart-group-node' : ''} ${isCompactMember ? 'smart-group-member-node' : ''} ${candidatePanelNodeId === node.id ? 'candidate-panel-open-node' : ''} ${isNodeSelected(node.id) ? 'selected' : ''} ${(dragState?.groupIds?.includes(node.id) || dragState?.id === node.id) ? 'dragging' : ''} ${node.running ? 'node-running' : ''} ${isPending ? 'node-pending' : ''}" data-id="${escapeHtml(node.id)}" style="left:${node.x || 0}px;top:${node.y || 0}px;width:${layout.width}px;height:${layout.height}px">
            <div class="node-head"><div class="node-title">${title}</div></div>
            ${!isEmpty && floatingActions ? `<div class="floating-node-actions">${floatingActions}</div>` : ''}
            ${runTimePillHtml(node)}
            <div class="node-body">${body}</div>
            ${expandedCandidateGridHtml(node)}
            <div class="node-hint">${hint}</div>
            <div class="node-port port-in" data-port="in" title="input"></div>
            <div class="node-port port-out" data-port="out" title="output"></div>
        </div>`;
        return {node, html};
    });
    const tpl = document.createElement('template');
    tpl.innerHTML = nodeHtmlEntries.map(entry => entry.html).join('');
    const renderedNodeEls = new Map();
    nodeHtmlEntries.forEach(entry => {
        const fresh = tpl.content.querySelector(`.image-node[data-id="${CSS.escape(entry.node.id)}"]`);
        if(fresh) renderedNodeEls.set(entry.node.id, fresh);
    });
    const keepEls = new Set();
    reusableNodes.forEach(el => keepEls.add(el));
    [...world.childNodes].forEach(child => {
        if(!keepEls.has(child)) child.remove();
    });
    world.insertAdjacentHTML('beforeend', renderConnections());
    nodeHtmlEntries.forEach(entry => {
        const fresh = renderedNodeEls.get(entry.node.id);
        if(!fresh) return;
        world.appendChild(fresh);
        const reusable = reusableNodes.get(entry.node.id);
        if(reusable){
            transplantSmartMediaElements(reusable, fresh);
            if(reusable !== fresh) reusable.remove();
        }
    });
    restoreMediaPlaybackStates(mediaStates);
    bindNodeEvents();
    bindConnectionEvents();
    updateComposer();
    updatePromptComposer();
    requestRenderMinimap();
    if(window.lucide) lucide.createIcons();
    measureSmartNodeImages();
    refreshRunTimerPills();
    updateSelectionActions();
    return;
    world.innerHTML = '';
    world.insertAdjacentHTML('beforeend', renderConnections());
    const nodesHtml = nodes.map(node => {
        const imgs = node.images || [];
        const title = node.type === 'smart-prompt' ? 'Prompt' : node.type === 'smart-loop' ? 'Loop' : (imgs.length > 1 ? 'Group' : 'Image');
        const scale = nodeScale(node);
        const layout = imageLayout(imgs, scale, node);
        const isPrompt = node.type === 'smart-prompt';
        const isLoop = node.type === 'smart-loop';
        const isImageNode = node.type === 'smart-image' || !node.type;
        const isQueued = Boolean(node.queued && imgs.length === 0 && !node.pending);
        const isEmpty = isImageNode && imgs.length === 0 && !node.pending && !isQueued;
        const isGroup = isImageNode && imgs.length > 1;
        const isPending = (node.pending || isQueued) && imgs.length === 0;
        const body = nodeBodyHtml(node, layout);
        const deleteBtn = `<button class="mini-x node-delete" type="button" title="${escapeHtml(tr('smart.deleteNode'))}"><i data-lucide="trash-2"></i></button>`;
        return `<div class="image-node ${isEmpty ? 'empty-node' : ''} ${isGroup ? 'group-node' : ''} ${isPrompt ? 'prompt-smart-node' : ''} ${isLoop ? 'loop-smart-node' : ''} ${isNodeSelected(node.id) ? 'selected' : ''} ${(dragState?.groupIds?.includes(node.id) || dragState?.id === node.id) ? 'dragging' : ''} ${node.running ? 'node-running' : ''} ${isPending ? 'node-pending' : ''}" data-id="${escapeHtml(node.id)}" style="left:${node.x || 0}px;top:${node.y || 0}px;width:${layout.width}px;height:${layout.height}px">
            <div class="node-head"><div class="node-title">${title}</div><div class="node-actions">${deleteBtn}</div></div>
            ${!isEmpty ? `<div class="floating-node-actions"><button class="mini-x node-delete" type="button" title="${escapeHtml(tr('smart.deleteNode'))}"><i data-lucide="trash-2"></i></button></div>` : ''}
            ${runTimePillHtml(node)}
            <div class="node-body">${body}</div>
            <div class="node-hint">${isPending ? escapeHtml(tr('smart.hintPending')) : (imgs.length > 1 ? escapeHtml(tr('smart.hintMulti')) : imgs.length ? escapeHtml(tr('smart.hintSingle')) : escapeHtml(tr('smart.hintEmpty')))}</div>
            <div class="node-port port-in" data-port="in" title="输入"></div>
            <div class="node-port port-out" data-port="out" title="输出"></div>
        </div>`;
    }).join('');
    world.insertAdjacentHTML('beforeend', nodesHtml);
    bindNodeEvents();
    bindConnectionEvents();
    updateComposer();
    updatePromptComposer();
    renderMinimap();
    if(window.lucide) lucide.createIcons();
    measureSmartNodeImages();
    refreshRunTimerPills();
    if(migratedCandidates) scheduleSave();
}
function measureSmartNodeImages(){
    world.querySelectorAll('.image-node img,.image-node video').forEach(imgEl => {
        const candidatePanel = imgEl.closest('.candidate-panel');
        const nodeEl = imgEl.closest('.image-node');
        const itemEl = imgEl.closest('[data-image-index]');
        const node = nodes.find(n => n.id === nodeEl?.dataset.id);
        const candidateIndex = Number(candidatePanel?.dataset.candidateIndex ?? -1);
        const index = Number(itemEl?.dataset.imageIndex ?? 0);
        const candidatePool = candidatePanel ? nodeCandidateImages(node) : [];
        const image = candidatePanel ? candidatePool[candidateIndex] : node?.images?.[index];
        const isVideo = imgEl.tagName?.toLowerCase() === 'video';
        if(imgEl.tagName?.toLowerCase() === 'img' && image?.url) bindImageProxyFallback(imgEl, image);
        if(!node || !image || (!isVideo && imageResolutionLabel(image))) return;
        const apply = () => {
            const w = imgEl.naturalWidth || imgEl.videoWidth || 0;
            const h = imgEl.naturalHeight || imgEl.videoHeight || 0;
            if(w <= 0 || h <= 0) return;
            const currentW = Number(image.natural_w || image.width || image.w || 0);
            const currentH = Number(image.natural_h || image.height || image.h || 0);
            if(currentW === w && currentH === h) return;
            if(!isVideo && imageResolutionLabel(image)) return;
            image.natural_w = w;
            image.natural_h = h;
            if(candidatePanel) syncCandidateImageDimensions(node, image, w, h);
            applyThumbDisplaySizeToElement(itemEl, image, Math.max(itemEl?.clientWidth || 0, itemEl?.clientHeight || 0));
            render();
            scheduleSave();
        };
        if(isVideo){
            if(imgEl.readyState >= 1) apply();
            else imgEl.addEventListener('loadedmetadata', apply, {once:true});
        } else if(imgEl.complete) apply();
        else imgEl.addEventListener('load', apply, {once:true});
    });
}

function pickMediaForSmartNode(nodeId){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*';
    input.multiple = true;
    input.onchange = () => {
        if(input.files?.length) handleFiles(input.files, nodeId);
        input.remove();
    };
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.click();
}
function bindNodeEvents(){
    world.querySelectorAll('.image-node').forEach(el => {
        const id = el.dataset.id;
        const nodeForControls = nodes.find(n => n.id === id);
        if(nodeForControls?.type === 'smart-prompt') bindPromptNodeControls(el, nodeForControls);
        if(nodeForControls?.type === 'smart-loop') bindLoopNodeControls(el, nodeForControls);
        // Native <video controls> can swallow click events without bubbling, so use a
        // capture-phase mousedown on the whole node to reliably select it and (re)open
        // the composer even when the press lands on the video's own control surface.
        el.addEventListener('mousedown', e => {
            if(Date.now() < suppressNodeClickUntil) return;
            if(e.button !== 0) return;
            if(!e.target.closest('video')) return;
            const node = nodes.find(n => n.id === id);
            if(!node) return;
            // Preserve an existing multi-selection (e.g. after a box-select) so dragging
            // still moves the whole group; only collapse to single-select otherwise.
            if(!selectedIds.includes(id)){
                selectedId = id;
                selectedIds = [];
                selectedImage = {nodeId:'', index:-1};
                suppressComposerForCandidateNodeId = '';
                if(smartCascadeAnyRunning()) smartCascadeSilentSelection = false;
                syncSelectionUi();
            }
            updateComposer();
        }, true);
        el.onclick = e => {
            e.stopPropagation();
            if(Date.now() < suppressNodeClickUntil) return;
            const node = nodes.find(n => n.id === id);
            hideRunTimerForNode(node);
            selectedId = id;
            selectedIds = [];
            selectedImage = {nodeId:'', index:-1};
            suppressComposerForCandidateNodeId = '';
        if(smartCascadeAnyRunning()) smartCascadeSilentSelection = false;
            render();
        };
        el.ondblclick = e => {
            e.stopPropagation();
            if(nodeForControls?.type === 'smart-group' && !e.target.closest('.thumb-item,.image-wrap,.mini-x,.node-port')){
                openCreateMenu(e);
            }
        };
        const uploadTrigger = el.querySelector('.generation-node-main');
        uploadTrigger?.addEventListener('mousedown', e => {
            if(e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
        }, true);
        uploadTrigger?.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            hideRunTimerForNode(nodes.find(n => n.id === id));
            selectedId = id;
            selectedIds = [];
            selectedImage = {nodeId:'', index:-1};
            suppressComposerForCandidateNodeId = '';
            pendingGroupUploadPoint = null;
            uploadTargetId = id;
            syncSelectionUi();
            updateComposer();
            pickMediaForSmartNode(id);
        });
        el.querySelectorAll('[data-candidate-toggle]').forEach(btn => {
            btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); }, true);
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                const node = nodes.find(n => n.id === id);
                const count = candidateCountForNode(node);
                if(count <= 1) return;
                selectedId = id;
                selectedIds = [];
                selectedImage = {nodeId:'', index:-1};
                suppressComposerForCandidateNodeId = id;
                if(candidatePanelNodeId === id){
                    closeCandidatePanel();
                } else {
                    candidatePanelNodeId = id;
                    candidatePanelIndex = Math.max(0, Math.min(count - 1, Number(node?.candidateIndex) || 0));
                    candidatePanelAttentionNodeId = id;
                }
                render();
                candidatePanelAttentionNodeId = '';
            });
        });
        el.querySelectorAll('[data-candidate-panel]').forEach(panel => {
            panel.addEventListener('dblclick', e => {
                if(e.target.closest('button')) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                clearImageClickTimer();
                suppressImageClickUntil = Date.now() + 260;
                const candidateIndex = Number(panel.dataset.candidateIndex) || 0;
                selectedIds = [];
                openImagePreview(id, candidateIndex, {source:'candidates'});
            });
        });
        el.querySelectorAll('[data-candidate-prev],[data-candidate-next]').forEach(btn => {
            btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); }, true);
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                const node = nodes.find(n => n.id === id);
                const count = candidateCountForNode(node);
                if(count <= 1) return;
                const delta = btn.dataset.candidatePrev ? -1 : 1;
                candidatePanelNodeId = id;
                candidatePanelIndex = (candidatePreviewIndexForNode(node, count) + delta + count) % count;
                suppressComposerForCandidateNodeId = id;
                render();
            });
        });
        el.querySelectorAll('[data-candidate-set-main]').forEach(btn => {
            btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); }, true);
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                const node = nodes.find(n => n.id === id);
                const count = candidateCountForNode(node);
                if(count <= 1) return;
                pushUndo();
                candidatePanelIndex = candidatePreviewIndexForNode(node, count);
                setNodeMainCandidate(node, candidatePanelIndex);
                selectedId = id;
                selectedIds = [];
                selectedImage = {nodeId:'', index:-1};
                closeCandidatePanel({suppressComposer:false});
                suppressComposerForCandidateNodeId = '';
                render();
                scheduleSave();
            });
        });
        el.querySelectorAll('[data-candidate-expand]').forEach(btn => {
            btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); }, true);
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                if(expandedCandidateNodeIds.has(id)) expandedCandidateNodeIds.delete(id);
                else expandedCandidateNodeIds.add(id);
                render();
            });
        });
        el.querySelectorAll('[data-candidate-grid-item]').forEach(item => {
            item.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); }, true);
            item.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                const node = nodes.find(n => n.id === id);
                if(!node) return;
                pushUndo();
                setNodeMainCandidate(node, Number(item.dataset.candidateGridItem) || 0);
                render();
                scheduleSave();
            });
        });
        el.querySelectorAll('[data-jimeng-query]').forEach(btn => {
            btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); }, true);
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                queryJimengNow(btn.dataset.jimengQuery);
            });
        });
        el.querySelectorAll('[data-image-task-query]').forEach(btn => {
            btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); }, true);
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                querySmartImageTaskNow(btn.dataset.imageTaskQuery, btn.dataset.taskId);
            });
        });
        el.querySelectorAll('.thumb-item,.image-wrap').forEach(item => {
            const refNodeId = item.dataset.refNodeId || id;
            const refIndex = Number(item.dataset.refImageIndex ?? item.dataset.imageIndex ?? 0);
            const refNode = nodes.find(n => n.id === refNodeId);
            const dragPayload = canvasImageDragPayload(refNode, refIndex);
            item.setAttribute('draggable', dragPayload?.file_id ? 'true' : 'false');
            item.addEventListener('dragstart', e => {
                const latestNode = nodes.find(n => n.id === refNodeId);
                const latestPayload = canvasImageDragPayload(latestNode, refIndex);
                if(!latestPayload?.file_id){
                    e.preventDefault();
                    return;
                }
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('application/x-smart-canvas-image', JSON.stringify(latestPayload));
                e.dataTransfer.setData('text/plain', latestPayload.url || '');
            });
            const hasVideoPreview = Boolean(item.querySelector('[data-video-preview-container="1"]'));
            if(hasVideoPreview){
                item.addEventListener('mouseenter', () => {
                    activateCanvasVideoPreview(item);
                });
                item.addEventListener('mouseleave', () => {
                    deactivateCanvasVideoPreview(item);
                });
            }
            item.addEventListener('mousedown', e => {
                if(isCandidatePanelInteractionTarget(e.target)) return;
                if(e.button !== 0) return;
                if(e.detail < 2) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                clearImageClickTimer();
                suppressImageClickUntil = Date.now() + 260;
                const refNodeId = item.dataset.refNodeId || id;
                const refIndex = Number(item.dataset.refImageIndex ?? item.dataset.imageIndex ?? 0);
                selectedId = id;
                selectedIds = [];
                selectedImage = {nodeId:refNodeId, index:refIndex};
                openImagePreview(refNodeId, refIndex);
            }, true);
            item.addEventListener('click', e => {
                if(isCandidatePanelInteractionTarget(e.target)) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if(Date.now() < suppressImageClickUntil) return;
                const imageIndex = Number(item.dataset.imageIndex || 0);
                const refNodeId = item.dataset.refNodeId || id;
                const refIndex = Number(item.dataset.refImageIndex ?? item.dataset.imageIndex ?? 0);
                if(e.detail >= 2){
                    clearImageClickTimer();
                    suppressImageClickUntil = Date.now() + 260;
                    selectedId = id;
                    selectedIds = [];
                    selectedImage = {nodeId:refNodeId, index:refIndex};
                    openImagePreview(refNodeId, refIndex);
                    return;
                }
                clearImageClickTimer();
                imageClickTimer = setTimeout(() => {
                    imageClickTimer = null;
                const owner = nodes.find(n => n.id === id);
                hideRunTimerForNode(owner);
                const isGroupOwner = (owner?.images || []).length > 1 || isSmartGroupNode(owner);
                const isUploadOnlyOwner = isUploadedImageOnlyNode(owner);
                selectedId = id;
                selectedIds = [];
                // 分组节点：单击具体图片时选中该图片（出现按图片的快捷栏）；
                // 非分组的上传单图节点仍保持节点级（不穿透）。
                selectedImage = isGroupOwner
                    ? {nodeId:refNodeId, index:refIndex}
                    : (isUploadOnlyOwner
                        ? {nodeId:'', index:-1}
                        : {nodeId:id, index:imageIndex});
                    suppressComposerForCandidateNodeId = '';
                    if(smartCascadeAnyRunning()) smartCascadeSilentSelection = false;
                    syncSelectionUi();
                    updateComposer();
                }, 220);
            });
        item.addEventListener('dblclick', e => {
            if(isCandidatePanelInteractionTarget(e.target)) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            clearImageClickTimer();
            suppressImageClickUntil = Date.now() + 260;
            const refNodeId = item.dataset.refNodeId || id;
            const refIndex = Number(item.dataset.refImageIndex ?? item.dataset.imageIndex ?? 0);
            selectedId = id;
            selectedIds = [];
            selectedImage = {nodeId:refNodeId, index:refIndex};
            openImagePreview(refNodeId, refIndex);
        }, true);
        });
        el.querySelectorAll('.thumb-item').forEach(item => {
            item.addEventListener('mousedown', e => {
                if(e.button !== 0 || e.target.closest('.mini-x')) return;
                if(e.detail >= 2) return;
                if(item.dataset.refNodeId && item.dataset.refNodeId !== id) return;
                const node = nodes.find(n => n.id === id);
                if(!node || (node.images || []).length <= 1) return;
                e.preventDefault(); e.stopPropagation();
                thumbDragState = {nodeId:id, imgIndex:Number(item.dataset.imageIndex || 0), startX:e.clientX, startY:e.clientY, detached:false};
                capturePendingUndo();
            });
        });
        const beginNodeDrag = e => {
            const isMultiSelected = selectedIds.length > 1 && selectedIds.includes(id);
            // Allow starting a group drag even when the press lands on a thumb-item/video
            // (native <video controls> can swallow the click), as long as this node is
            // part of an existing multi-selection — otherwise thumb-item clicks are
            // reserved for image reordering / preview interactions.
            if(e.button !== 0 || (!isMultiSelected && e.target.closest('.mini-x, .thumb-item, .node-port, select, input, button'))) return;
            if(isMultiSelected && e.target.closest('.mini-x, .node-port, select, input, button')) return;
            if(e.target.closest('.prompt-node-pill, textarea:not(.prompt-node-text)')) return;
            e.preventDefault(); e.stopPropagation();
            window.getSelection?.()?.removeAllRanges?.();
            if(document.activeElement?.blur) document.activeElement.blur();
            let node = nodes.find(n => n.id === id);
            if(!node) return;
            if(e.altKey) node = duplicateForAltDrag(node);
            const dragIds = selectedIds.includes(node.id) ? selectedIds.slice() : [node.id];
            const group = dragIds.map(dragId => {
                const n = nodes.find(x => x.id === dragId);
                return n ? {id:n.id, ox:Number(n.x) || 0, oy:Number(n.y) || 0} : null;
            }).filter(Boolean);
            dragState = {id:node.id, startX:e.clientX, startY:e.clientY, ox:node.x || 0, oy:node.y || 0, group, groupIds:group.map(item => item.id), ctrlGroup:Boolean(e.ctrlKey)};
            document.body.classList.add('smart-node-drag');
            capturePendingUndo();
        };
        el.querySelectorAll('.node-port').forEach(port => {
            port.addEventListener('mousedown', e => {
                if(e.button !== 0) return;
                e.preventDefault(); e.stopPropagation();
                const portType = port.dataset.port;
                const p = screenToWorld(e);
                portDragState = {
                    fromId:id,
                    fromPort:portType,
                    currentWorld:p,
                    hoverTargetId:'',
                    hoverPort:'',
                    moved:false
                };
                shell.classList.add('port-dragging');
                capturePendingUndo();
                ensurePortDragPathElement();
                updatePortDragVisual();
            });
            port.addEventListener('click', e => { e.stopPropagation(); });
            port.addEventListener('dblclick', e => { e.stopPropagation(); });
        });
        el.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();
            openNodeContextMenu(id, e);
        });
        el.onmousedown = beginNodeDrag;
        el.ondragover = e => setSmartDropCopyEffect(e);
        el.ondrop = async e => {
            e.preventDefault();
            e.stopPropagation();
            const payload = await resolveSmartImageDropPayload(e.dataTransfer);
            if(payload.type === 'none') return;
            await handleSmartImageDropPayload(payload, id);
        };
    });
}
function rectOverlapNode(draggedId, x, y, w, h, excludeIds=[]){
    const cx = x + w/2, cy = y + h/2;
    const excluded = new Set([draggedId, ...(excludeIds || [])]);
    for(const n of nodes){
        if(excluded.has(n.id)) continue;
        const r = nodeRect(n);
        if(cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height) return n;
    }
    return null;
}
function dragConnectTargetFor(sourceNode, point=lastMouseWorld){
    if(!sourceNode || (dragState?.group || []).length > 1) return null;
    if(['smart-prompt', 'smart-loop'].includes(sourceNode.type) && point){
        return rectOverlapNode(sourceNode.id, point.x - 1, point.y - 1, 2, 2, dragState?.groupIds || []);
    }
    const r = nodeRect(sourceNode);
    return rectOverlapNode(sourceNode.id, r.x, r.y, r.width, r.height, dragState?.groupIds || []);
}
function canAutoConnectDraggedNode(sourceNode, targetNode){
    if(!sourceNode || !targetNode || sourceNode.id === targetNode.id) return false;
    if(isHistoryGroupNode(sourceNode) || isHistoryGroupNode(targetNode)) return false;
    if(isSmartImageNode(sourceNode)) return isSmartImageNode(targetNode) || targetNode.type === 'smart-loop' || targetNode.type === 'smart-prompt';
    if(sourceNode.type === 'smart-prompt') return isSmartImageNode(targetNode) || targetNode.type === 'smart-loop' || targetNode.type === 'smart-prompt';
    if(sourceNode.type === 'smart-loop') return isSmartImageNode(targetNode);
    if(sourceNode.type === 'smart-group') return isSmartImageNode(targetNode) || targetNode.type === 'smart-loop';
    return false;
}
function restoreDraggedNodePosition(){
    if(!dragState) return;
    (dragState.group || [{id:dragState.id, ox:dragState.ox, oy:dragState.oy}]).forEach(item => {
        const n = nodes.find(x => x.id === item.id);
        if(n){
            n.x = item.ox;
            n.y = item.oy;
        }
    });
}
