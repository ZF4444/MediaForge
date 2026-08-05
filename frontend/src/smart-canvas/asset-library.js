// 从 static/js/smart-canvas.js 剪切出的资产库逻辑（M9 拆分批次）。
// 剪切时未改动任何函数签名/内部逻辑，只做了纯粹的位置搬移。
//
// 为什么这里不用 ES module 的 export/import（跟 M1-M8 同一个原因）：
// smart-canvas.js 依赖经典 <script> 的全局作用域语义，
// static/smart-canvas.html 里 57 处内联 onclick="xxx()" 都依赖这一点。
// 所以这里同样只做"物理文件拆分"：asset-library.js 保持经典脚本语法，通过
// <script src="asset-library.js"> 排在 image-editor.js 之后、main.js 之前
// 加载。
//
// 本文件覆盖资产库面板（#assetPanel）的全部功能，物理上分四段非连续区间
// （中间被节点右键菜单/节点快捷键栏/canvas 多人协作合并同步等无关代码
// 隔开，拆分时按"实际调用关系"分段切出、拼接进同一个新文件，拼接顺序
// 跟原文件一致）：
//   1. 资产库/分类数据访问：assetCategories / assetLibraries /
//      activeAssetLibrary / activeAssetCategory / assetCategoriesForLibrary
//   2. "保存到资产库"弹窗：renderNodeAssetSaveModal /
//      closeNodeAssetSaveModal / openNodeAssetSaveModal /
//      selectedAssetSaveItems / openSelectionAssetSaveModal /
//      saveFileToAssetLibrarySelection
//   3. 资产库加载：loadAssetLibrary
//   4. 资产库渲染/交互/远程同步响应：setAssetLibraryFromResponse /
//      toggleAssetLibrary / assetCategoryForMention / assetMediaKind /
//      assetThumbHtml / renderAssetLibrary / openAssetNameDialog /
//      positionAssetHoverPreview / showAssetHoverPreview /
//      hideAssetHoverPreview / beginAssetInlineRename / bindAssetItemEvents /
//      addFileToAssetLibrary / canvasImageDragPayload
//
// 明确排除、留在 main.js 的内容（按"实际调用关系"而非物理位置判断，
// 与 M3-M8 采用的判定原则一致）：
//   - nodeShortcutTargetFor / triggerNodeShortcutAction /
//     bindNodeContextMenuEvents / triggerNodeContextAction 等：物理上紧邻
//     "保存到资产库"弹窗前后，但是节点右键菜单/快捷键栏的通用调度函数，
//     只是其中一个分支会调用 openNodeAssetSaveModal，本身横跨下载/
//     取消分组/全屏预览/图片编辑器等一堆跟资产库无关的动作。
//   - connectAssetLibrarySyncSocket：名字像资产库同步，但实际是
//     smart-canvas 多人协作用的唯一 WebSocket 连接，onmessage 里同时
//     分发 asset_library_updated（资产库同步，调用本文件的
//     handleAssetLibraryUpdatedMessage）和 canvas_updated（canvas 文档
//     多人合并同步，调用 main.js 里的 handleCanvasUpdatedMessage）两类
//     消息，是共享基础设施，不能整体搬进本文件。
//   - handleCanvasUpdatedMessage / startCanvasMetaPoll /
//     scheduleCanvasMergeReload / mergeReloadCanvasNow /
//     applyMergedServerCanvas / mergeSmartConnections /
//     mergeSmartNodeLists / mergeSmartNode / smartNodeInFlight /
//     mergeSmartImageLists：物理上夹在 loadAssetLibrary 和
//     setAssetLibraryFromResponse 之间，但是 canvas 文档本身的多人协作
//     合并逻辑（节点/连线的本地-远程合并策略），跟资产库是完全不同的
//     两个子系统，只是碰巧物理上写在了一起。
//   - smartClientId（模块级常量，多人协作用的客户端 id）：被
//     connectAssetLibrarySyncSocket/saveCanvas/cascade-run.js 的
//     runQueuedSmartComfyGenerate 等多处引用，是跨文件共享的全局状态，
//     物理上紧邻 loadAssetLibrary 之后声明，留在 main.js。

function assetCategories(type='image'){
    const library = activeAssetLibrary();
    return (library?.categories || assetLibrary.categories || []).filter(cat => (cat.type || 'image') === type);
}
function assetLibraries(){
    return Array.isArray(assetLibrary.libraries) && assetLibrary.libraries.length ? assetLibrary.libraries : [{id:'default', name:'默认资产库', categories:assetLibrary.categories || []}];
}
function activeAssetLibrary(){
    const libs = assetLibraries();
    return libs.find(lib => lib.id === activeAssetLibraryId) || libs[0] || null;
}
function activeAssetCategory(){
    const cats = assetCategories('image');
    if(!cats.length) return null;
    return cats.find(cat => cat.id === activeAssetCategoryId) || cats[0];
}
function assetCategoriesForLibrary(libraryId='', type='image'){
    const lib = assetLibraries().find(entry => entry.id === libraryId) || null;
    return (lib?.categories || []).filter(cat => (cat.type || 'image') === type);
}

function renderNodeAssetSaveModal(){
    if(!nodeAssetSaveModal || !nodeAssetSaveLibraries || !nodeAssetSaveFolders || !nodeAssetSaveName || !nodeAssetSaveConfirm) return;
    const libs = assetLibraries();
    if(!nodeAssetSaveState.libraryId || !libs.some(lib => lib.id === nodeAssetSaveState.libraryId)){
        nodeAssetSaveState.libraryId = activeAssetLibraryId || libs[0]?.id || '';
    }
    const folders = assetCategoriesForLibrary(nodeAssetSaveState.libraryId, 'image');
    if(!nodeAssetSaveState.categoryId || !folders.some(cat => cat.id === nodeAssetSaveState.categoryId)){
        nodeAssetSaveState.categoryId = folders[0]?.id || '';
    }
    nodeAssetSaveLibraries.innerHTML = libs.map(lib => `<button class="node-asset-save-library ${lib.id === nodeAssetSaveState.libraryId ? 'active' : ''}" type="button" data-node-asset-library="${escapeAttr(lib.id)}">${escapeHtml(lib.name || '资产库')}</button>`).join('');
    nodeAssetSaveFolders.innerHTML = folders.length ? folders.map(cat => {
        const count = Array.isArray(cat.items) ? cat.items.length : 0;
        return `<button class="node-asset-save-folder ${cat.id === nodeAssetSaveState.categoryId ? 'active' : ''}" type="button" data-node-asset-folder="${escapeAttr(cat.id)}">
            <span class="node-asset-save-folder-main">
                <i data-lucide="folder"></i>
                <span class="node-asset-save-folder-text">
                    <span class="node-asset-save-folder-name">${escapeHtml(cat.name || '未命名文件夹')}</span>
                    <span class="node-asset-save-folder-meta">${count} 项</span>
                </span>
            </span>
            <span class="node-asset-save-folder-check"><i data-lucide="check"></i></span>
        </button>`;
    }).join('') : `<div class="node-asset-save-empty">当前资产库还没有文件夹，先新建一个文件夹再保存。</div>`;
    const batchItems = Array.isArray(nodeAssetSaveState.items) ? nodeAssetSaveState.items : [];
    const isBatch = batchItems.length > 1;
    const useOriginalNames = Boolean(nodeAssetSaveState.useOriginalNames);
    const nameField = nodeAssetSaveName.closest('.node-asset-save-field');
    if(nameField){
        const hideNameField = isBatch || useOriginalNames;
        nameField.hidden = hideNameField;
        nameField.style.display = hideNameField ? 'none' : '';
    }
    nodeAssetSaveName.value = nodeAssetSaveState.name || '';
    nodeAssetSaveConfirm.textContent = isBatch ? `保存 ${batchItems.length} 项` : '保存';
    nodeAssetSaveConfirm.disabled = !(batchItems.length || nodeAssetSaveState.fileId) || !nodeAssetSaveState.categoryId;
    refreshIcons();
}
function closeNodeAssetSaveModal(){
    if(!nodeAssetSaveModal) return;
    nodeAssetSaveState = {open:false, fileId:'', name:'', items:[], useOriginalNames:false, libraryId:'', categoryId:''};
    nodeAssetSaveModal.classList.remove('open');
    nodeAssetSaveModal.hidden = true;
}
async function openNodeAssetSaveModal(node=selectedNode()){
    const target = nodeShortcutTargetFor(node);
    if(!target?.image?.file_id) throw new Error('当前节点没有 file_id，无法保存到资产库');
    await loadAssetLibrary();
    nodeAssetSaveState = {
        open:true,
        fileId:target.image.file_id,
        name:String(target.image.name || target.ownerNode?.title || 'asset').trim(),
        items:[{fileId:target.image.file_id, name:String(target.image.name || target.ownerNode?.title || 'asset').trim()}],
        useOriginalNames:false,
        libraryId:activeAssetLibraryId || assetLibraries()[0]?.id || '',
        categoryId:activeAssetCategoryId || activeAssetCategory()?.id || ''
    };
    renderNodeAssetSaveModal();
    nodeAssetSaveModal.hidden = false;
    nodeAssetSaveModal.classList.add('open');
    nodeAssetSaveName?.focus();
    nodeAssetSaveName?.select();
}
function selectedAssetSaveItems(){
    const seen = new Set();
    return selectedNodeIds().flatMap(id => {
        const node = nodes.find(entry => entry.id === id);
        return node ? imagesForNode(node) : [];
    }).filter(item => {
        const fileId = String(item?.file_id || '').trim();
        if(!fileId || seen.has(fileId)) return false;
        seen.add(fileId);
        return true;
    }).map(item => ({
        fileId:item.file_id,
        name:String(item.name || item.ownerNode?.title || 'asset').trim()
    }));
}
async function openSelectionAssetSaveModal(){
    const items = selectedAssetSaveItems();
    if(!items.length) throw new Error('选中节点没有可加入资产库的素材');
    await loadAssetLibrary();
    nodeAssetSaveState = {
        open:true,
        fileId:items[0].fileId,
        name:items[0].name,
        items,
        useOriginalNames:true,
        libraryId:activeAssetLibraryId || assetLibraries()[0]?.id || '',
        categoryId:activeAssetCategoryId || activeAssetCategory()?.id || ''
    };
    renderNodeAssetSaveModal();
    nodeAssetSaveModal.hidden = false;
    nodeAssetSaveModal.classList.add('open');
}
async function saveFileToAssetLibrarySelection(fileId, name='', libraryId='', categoryId='', options={}){
    if(!fileId) throw new Error('缺少 file_id，无法保存到资产库');
    if(!libraryId || !categoryId) throw new Error('请选择资产库文件夹');
    const data = await fetch('/api/asset-library/items', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({library_id:libraryId, category_id:categoryId, file_id:fileId, name})
    }).then(async r => {
        if(!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || tr('smart.assetAddFail'));
        return r.json();
    });
    activeAssetLibraryId = libraryId;
    activeAssetCategoryId = categoryId;
    setAssetLibraryFromResponse(data);
    if(!options.silent) toast(tr('smart.assetSaved'));
    return data;
}

async function loadAssetLibrary(){
    try {
        const data = await fetch('/api/asset-library').then(r => r.json());
        setAssetLibraryFromResponse(data, {render:false});
        renderAssetLibrary();
    } catch(e) {
        toast(tr('smart.assetLoadFail'));
    }
}

function setAssetLibraryFromResponse(data, options={}){
    assetLibrary = data.library || assetLibrary;
    assetLibraryUpdatedAt = Number(assetLibrary.updated_at || assetLibraryUpdatedAt || 0);
    const libs = assetLibraries();
    if(!activeAssetLibraryId) activeAssetLibraryId = assetLibrary.active_library_id || libs[0]?.id || '';
    if(activeAssetLibraryId && !libs.some(lib => lib.id === activeAssetLibraryId)) activeAssetLibraryId = libs[0]?.id || '';
    const cats = assetCategories('image');
    if(activeAssetCategoryId && !cats.some(cat => cat.id === activeAssetCategoryId)) activeAssetCategoryId = '';
    if(!activeAssetCategoryId) activeAssetCategoryId = activeAssetCategory()?.id || '';
    if(mentionAssetCategoryId && !cats.some(cat => cat.id === mentionAssetCategoryId)) mentionAssetCategoryId = '';
    if(!mentionAssetCategoryId) mentionAssetCategoryId = activeAssetCategoryId;
    if(options.render !== false) {
        renderAssetLibrary();
        if(mentionPicker?.classList?.contains('open') && mentionSource === 'asset') renderMentionPicker('asset');
    }
    if(nodeAssetSaveState.open) renderNodeAssetSaveModal();
}
function toggleAssetLibrary(open=!assetLibraryOpen){
    if(!assetPanel || !assetToggle) return;
    assetLibraryOpen = !!open;
    assetPanel.classList.toggle('open', assetLibraryOpen);
    assetToggle?.classList.toggle('active', assetLibraryOpen);
    if(assetLibraryOpen) loadAssetLibrary();
    render();
}
function assetCategoryForMention(){
    const cats = assetCategories('image');
    if(!cats.length) return null;
    return cats.find(cat => cat.id === mentionAssetCategoryId)
        || cats.find(cat => cat.id === activeAssetCategoryId)
        || cats.find(cat => (cat.items || []).length)
        || cats[0];
}
function assetMediaKind(item){
    if(!item) return 'image';
    if(item.kind === 'video' || item.type === 'video') return 'video';
    if(item.kind === 'audio' || item.type === 'audio') return 'audio';
    const url = String(item.url || item.thumbnail || '').toLowerCase().split('?')[0];
    const name = String(item.name || '').toLowerCase();
    if(/\.(mp4|webm|mov|m4v|avi|mkv)$/.test(url) || /\.(mp4|webm|mov|m4v|avi|mkv)$/.test(name)) return 'video';
    if(/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(url) || /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(name)) return 'audio';
    return 'image';
}
function assetThumbHtml(item){
    const url = escapeAttr(item.url || '');
    const thumb = escapeAttr(item.thumbnail || item.thumb || item.preview || item.url || '');
    const kind = assetMediaKind(item);
    if(kind === 'video'){
        return `<div class="asset-thumb-wrap"><video class="asset-thumb" src="${url}" data-url="${url}" muted preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video><span class="asset-video-badge"><i data-lucide="film"></i>VIDEO</span></div>`;
    }
    if(kind === 'audio'){
        return `<div class="asset-thumb-wrap media-thumb audio-thumb asset-thumb"><i data-lucide="file-audio"></i><span>${escapeHtml(item.name || 'Audio')}</span></div>`;
    }
    return `<img class="asset-thumb" src="${thumb}" alt="">`;
}
function renderAssetLibrary(){
    if(!assetPanel || !assetGrid || !assetCategorySelect) return;
    document.querySelectorAll('[data-asset-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.assetTab === assetTab));
    const libs = assetLibraries();
    if(!activeAssetLibraryId || !libs.some(lib => lib.id === activeAssetLibraryId)) activeAssetLibraryId = libs[0]?.id || '';
    if(assetLibrarySelect){
        assetLibrarySelect.innerHTML = libs.map(lib => `<option value="${escapeHtml(lib.id)}" ${lib.id === activeAssetLibraryId ? 'selected' : ''}>${escapeHtml(lib.name || '资产库')}</option>`).join('');
    }
    const imageMode = assetTab === 'image';
    assetImageControls.style.display = imageMode ? 'block' : 'none';
    assetDropZone.style.display = imageMode ? 'flex' : 'none';
    assetGrid.style.display = imageMode ? 'grid' : 'none';
    workflowEmpty.style.display = imageMode ? 'none' : 'flex';
    if(!imageMode){ refreshIcons(); return; }
    const cats = assetCategories('image');
    if(!cats.some(cat => cat.id === activeAssetCategoryId)) activeAssetCategoryId = cats[0]?.id || '';
    assetCategorySelect.innerHTML = cats.map(cat => `<option value="${escapeHtml(cat.id)}" ${cat.id === activeAssetCategoryId ? 'selected' : ''}>${escapeHtml(cat.name || tr('smart.assetFolder'))}</option>`).join('');
    const cat = activeAssetCategory();
    const items = cat?.items || [];
    assetGrid.innerHTML = items.length ? items.map(item => `
        <div class="asset-item" draggable="true" data-asset-id="${escapeHtml(item.id)}" data-file-id="${escapeHtml(item.file_id || '')}" data-url="${escapeHtml(item.url)}" data-name="${escapeHtml(item.name || 'asset')}" data-kind="${escapeHtml(assetMediaKind(item))}">
            ${assetThumbHtml(item)}
            <div class="asset-meta">
                <span class="asset-name" title="${escapeHtml(item.name || '')}">${escapeHtml(item.name || 'asset')}</span>
                <button class="asset-mini-btn" type="button" data-rename-asset="${escapeHtml(item.id)}" title="${escapeHtml(tr('smart.assetRename'))}"><i data-lucide="pencil"></i></button>
                <button class="asset-mini-btn" type="button" data-delete-asset="${escapeHtml(item.id)}" title="${escapeHtml(tr('common.delete'))}"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
    `).join('') : `<div class="asset-empty">${escapeHtml(tr('smart.assetEmpty'))}</div>`;
    bindAssetItemEvents();
    refreshIcons();
}
function openAssetNameDialog({title='', value='', placeholder='', cancelValue='', multiline=false }={}){
    if(!assetDialogBackdrop || !assetDialogInput || !assetDialogOk || !assetDialogCancel) return Promise.resolve(cancelValue);
    return new Promise(resolve => {
        assetDialogTitle.textContent = title || tr('smart.assetRename');
        assetDialogInput.value = value || '';
        assetDialogInput.placeholder = placeholder || '';
        assetDialogInput.classList.toggle('is-multiline', Boolean(multiline));
        assetDialogInput.rows = multiline ? 5 : 1;
        assetDialogBackdrop.hidden = false;
        assetDialogBackdrop.classList.add('open');
        assetDialogInput.focus();
        assetDialogInput.select();
        const cleanup = result => {
            assetDialogBackdrop.classList.remove('open');
            assetDialogBackdrop.hidden = true;
            assetDialogOk.onclick = null;
            assetDialogCancel.onclick = null;
            assetDialogInput.onkeydown = null;
            assetDialogBackdrop.onmousedown = null;
            assetDialogInput.classList.remove('is-multiline');
            assetDialogInput.rows = 1;
            resolve(result);
        };
        assetDialogOk.onclick = () => cleanup(assetDialogInput.value.trim());
        assetDialogCancel.onclick = () => cleanup(cancelValue);
        assetDialogInput.onkeydown = event => {
            if(event.key === 'Enter' && !multiline) cleanup(assetDialogInput.value.trim());
            if(event.key === 'Enter' && multiline && (event.ctrlKey || event.metaKey)) cleanup(assetDialogInput.value.trim());
            if(event.key === 'Escape') cleanup(cancelValue);
        };
        assetDialogBackdrop.onmousedown = event => {
            if(event.target === assetDialogBackdrop) cleanup(cancelValue);
        };
    });
}
function positionAssetHoverPreview(event){
    if(!assetHoverPreview || assetHoverPreview.hidden || assetHoverPreview.style.display === 'none') return;
    const pad = 14;
    const w = assetHoverPreview.offsetWidth || 260;
    const h = assetHoverPreview.offsetHeight || 300;
    let left = event.clientX - w - 16;
    if(left < pad) left = event.clientX + 16;
    left = Math.max(pad, Math.min(window.innerWidth - w - pad, left));
    const top = Math.max(pad, Math.min(window.innerHeight - h - pad, event.clientY + 12));
    assetHoverPreview.style.left = `${left}px`;
    assetHoverPreview.style.top = `${top}px`;
}
function showAssetHoverPreview(event, item){
    if(!assetHoverPreview || !item?.url) return;
    let media = assetHoverPreview.querySelector('img,video');
    const name = assetHoverPreview.querySelector('.asset-hover-name');
    const kind = assetMediaKind(item);
    if(kind === 'video' && media?.tagName?.toLowerCase() !== 'video'){
        media?.replaceWith(document.createElement('video'));
        media = assetHoverPreview.querySelector('video');
    } else if(kind !== 'video' && media?.tagName?.toLowerCase() !== 'img'){
        media?.replaceWith(document.createElement('img'));
        media = assetHoverPreview.querySelector('img');
    }
    if(kind === 'video'){
        media.muted = true;
        media.loop = true;
        media.playsInline = true;
        media.preload = 'metadata';
        media.controls = false;
        media.disablePictureInPicture = true;
        media.setAttribute('disablepictureinpicture', '');
        media.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback');
        media.src = item.url;
        media.play?.().catch(() => {});
    } else {
        media.src = item.url;
        media.alt = 'asset preview';
    }
    name.textContent = item.name || 'asset';
    assetHoverPreview.hidden = false;
    assetHoverPreview.style.display = 'block';
    positionAssetHoverPreview(event);
}
function hideAssetHoverPreview(){
    if(!assetHoverPreview) return;
    assetHoverPreview.style.display = 'none';
    assetHoverPreview.hidden = true;
    const media = assetHoverPreview.querySelector('img,video');
    media?.pause?.();
    media?.removeAttribute('src');
    media?.load?.();
}
function beginAssetInlineRename(assetId){
    const item = (activeAssetCategory()?.items || []).find(x => x.id === assetId);
    const card = [...assetGrid.querySelectorAll('.asset-item')].find(el => el.dataset.assetId === assetId);
    const nameEl = card?.querySelector('.asset-name');
    if(!item || !card || !nameEl || card.querySelector('.asset-rename-input')) return;
    hideAssetHoverPreview();
    const previousName = item.name || 'asset';
    const input = document.createElement('input');
    input.className = 'asset-rename-input';
    input.type = 'text';
    input.value = previousName;
    input.setAttribute('aria-label', tr('smart.assetRename'));
    card.draggable = false;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const restore = () => {
        if(input.isConnected) input.replaceWith(nameEl);
        card.draggable = true;
    };
    const finish = async save => {
        if(done) return;
        done = true;
        const name = input.value.trim();
        if(!save || !name || name === previousName){
            restore();
            return;
        }
        input.disabled = true;
        try {
            const data = await fetch(`/api/asset-library/items/${encodeURIComponent(assetId)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})}).then(r => r.json());
            setAssetLibraryFromResponse(data);
        } catch(err){
            restore();
            toast(err.message || tr('smart.assetAddFail'));
        }
    };
    input.addEventListener('keydown', event => {
        event.stopPropagation();
        if(event.key === 'Enter'){
            event.preventDefault();
            finish(true);
        } else if(event.key === 'Escape'){
            event.preventDefault();
            finish(false);
        }
    });
    input.addEventListener('pointerdown', event => event.stopPropagation());
    input.addEventListener('mousedown', event => event.stopPropagation());
    input.addEventListener('click', event => event.stopPropagation());
    input.addEventListener('blur', () => finish(true));
}
function bindAssetItemEvents(){
    assetGrid.querySelectorAll('.asset-item').forEach(el => {
        const thumb = el.querySelector('.asset-thumb');
        thumb?.addEventListener('mouseenter', e => showAssetHoverPreview(e, {url:el.dataset.url, name:el.dataset.name, kind:el.dataset.kind}));
        thumb?.addEventListener('mousemove', e => positionAssetHoverPreview(e));
        thumb?.addEventListener('mouseleave', hideAssetHoverPreview);
        el.addEventListener('dragstart', e => {
            hideAssetHoverPreview();
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('application/x-smart-asset', JSON.stringify({file_id:el.dataset.fileId || '', url:el.dataset.url, name:el.dataset.name, kind:el.dataset.kind}));
            e.dataTransfer.setData('text/plain', el.dataset.url || '');
        });
    });
    assetGrid.querySelectorAll('[data-rename-asset]').forEach(btn => {
        btn.onclick = async e => {
            e.preventDefault(); e.stopPropagation();
            beginAssetInlineRename(btn.dataset.renameAsset);
        };
    });
    assetGrid.querySelectorAll('[data-delete-asset]').forEach(btn => {
        btn.onclick = async e => {
            e.preventDefault(); e.stopPropagation();
            btn.disabled = true;
            try {
                const data = await fetch(`/api/asset-library/items/${encodeURIComponent(btn.dataset.deleteAsset)}`, {method:'DELETE'}).then(r => r.json());
                setAssetLibraryFromResponse(data);
            } catch(err){
                btn.disabled = false;
                toast(err.message || tr('smart.assetAddFail'));
            }
        };
    });
}
async function addFileToAssetLibrary(fileId, name=''){
    const cat = activeAssetCategory();
    if(!cat){ toast(tr('smart.assetNoFolder')); return; }
    await saveFileToAssetLibrarySelection(fileId, name, activeAssetLibraryId, cat.id);
}
function canvasImageDragPayload(node, index=0){
    const img = node?.images?.[index];
    if(!img?.url) return null;
    return {
        file_id: img.file_id || '',
        url: img.url,
        name: img.name || node.title || 'image',
        kind: img.kind || assetMediaKind(img) || 'image'
    };
}
