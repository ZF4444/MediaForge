// 从 static/js/canvas.js 剪切出的节点悬浮快捷栏 + 右键菜单逻辑
// （M14 拆分批次）。剪切时未改动任何函数签名/内部逻辑，只做了纯粹的
// 位置搬移。
//
// 为什么这里不用 ES module 的 export/import（跟 M1-M13 同一个原因）：
// canvas.js 依赖经典 <script> 的全局作用域语义，
// static/canvas.html 里 57 处内联 onclick="xxx()" 都依赖这一点。
// 所以这里同样只做"物理文件拆分"：node-context-ui.js 保持经典脚本
// 语法，通过 <script src="node-context-ui.js"> 排在 clipboard.js 之后、
// canvas-render.js 之前加载。
//
// 本文件覆盖两套互相独立但都跟"选中节点后弹出的操作面板"相关的 UI
// 子系统（原文件 2162-2483 行区间，约320行）：
//   1. 节点悬浮快捷栏（选中单个图片/媒体节点时，节点上方浮现的一排
//      快捷按钮：下载/加入资产/全屏/对比/编辑等）：
//      nodeShortcutTargetFor（找到当前应该操作的具体媒体引用）/
//      shouldShowNodeShortcutBar（判断当前是否该显示快捷栏，排除
//      拖拽中/多选/prompt与loop节点等场景）/nodeShortcutBarHtml/
//      positionNodeShortcutForNode（按节点在视口中的位置计算快捷栏
//      悬浮坐标）/bindNodeShortcutOverlayEvents/updateNodeShortcutBar/
//      triggerNodeShortcutAction（按钮点击后的动作分发：下载/加入
//      资产/全屏预览/对比/进入图片编辑器等）
//   2. 右键菜单（节点右键菜单 + 画布空白处右键菜单）：
//      closeNodeContextMenu/nodeContextMenuHtml/openNodeContextMenu/
//      canvasContextMenuHtml/openCanvasContextMenu/
//      triggerCanvasContextAction（新建生成节点/分组/撤销等画布级
//      动作）/openParentFeedback（跳到父页面的反馈入口，iframe 场景）/
//      triggerNodeContextAction（保存/下载/复制/粘贴/删除/反馈等
//      节点级动作）/bindNodeContextMenuEvents
//
// 这两套子系统本质上都是"选中态操作面板的动作分发器"，会调用几乎所有
// 其它已拆分模块的函数（asset-library.js 的 openNodeAssetSaveModal、
// clipboard.js 的 copySelectedNodes/pasteFromContextMenu、
// media-display.js 的 downloadPreviewFile/downloadGroupNodeImages、
// image-editor.js 的 openImagePreview/openImageEditor/
// compareSourcesForNode/refreshComparePanel、还有仍留在 main.js 的
// deleteNode/ungroupNode/createGenerationNodeByKind/performUndo 等），
// 这些调用全部是"classic <script> 共享全局作用域下的函数调用"，跟
// 谁先加载谁后加载无关，因此排在哪个位置都不影响正确性。

function nodeShortcutTargetFor(node=selectedNode()){
    if(!node) return null;
    const refs = imagesForNode(node).filter(item => item?.url);
    if(!refs.length) return null;
    let target = null;
    if(selectedImage.nodeId && selectedImage.index >= 0){
        target = refs.find(item => item.nodeId === selectedImage.nodeId && Number(item.imageIndex) === Number(selectedImage.index)) || null;
    }
    if(!target) target = refs[0];
    const targetNode = nodes.find(entry => entry.id === target.nodeId) || node;
    return {
        ownerNode: node,
        node: targetNode,
        image: target,
        index: Number(target.imageIndex || 0),
        kind: mediaKindForItem(target)
    };
}
function shouldShowNodeShortcutBar(node){
    if(!node || !isNodeSelected(node.id)) return false;
    if(selectedIds.length) return false;
    if(selectedId !== node.id) return false;
    if(node.type === 'smart-prompt' || node.type === 'smart-loop') return false;
    // 拖拽缩略图（拆图）时隐藏；拖动节点本身时保留，让快捷栏跟随移动。
    if(thumbDragState) return false;
    if(dragState){
        const draggingIds = (dragState.group || [{id:dragState.id}]).map(item => item.id);
        // 仅当拖动的正是当前单选节点、且不是多节点批量拖动时才保留。
        if(dragState.thumbDetached || draggingIds.length > 1 || dragState.id !== node.id) return false;
    }
    return Boolean(nodeShortcutTargetFor(node));
}
function nodeShortcutBarHtml(node){
    const target = nodeShortcutTargetFor(node);
    if(!shouldShowNodeShortcutBar(node) || !target) return '';
    // 分组节点：未选中具体图片时，只显示「下载全部 / 解组」；选中具体图片后走下方按图片的快捷栏。
    const hasSpecificImage = Boolean(selectedImage.nodeId && Number(selectedImage.index) >= 0);
    if(isGroupShortcutNode(node) && !hasSpecificImage){
        const groupItems = [
            {action:'download-all', icon:'download', label:'下载全部', disabled:false},
            {action:'ungroup', icon:'ungroup', label:'解组', disabled:false}
        ];
        return `<div class="node-shortcut-bar" data-node-shortcut-bar="${escapeAttr(node.id)}">
            ${groupItems.map(item => `<button class="node-shortcut-btn" type="button" data-node-shortcut="${item.action}" data-node-id="${escapeAttr(node.id)}" title="${escapeAttr(item.label)}" ${item.disabled ? 'disabled' : ''}>
                <i data-lucide="${item.icon}"></i><span>${escapeHtml(item.label)}</span>
            </button>`).join('')}
        </div>`;
    }
    const isImage = target.kind === 'image';
    const canCompare = isImage && compareSourcesForNode(target.node).length > 0;
    const items = [
        {action:'crop', icon:'crop', label:'裁剪', disabled:!isImage},
        {action:'outpaint', icon:'expand', label:'扩图', disabled:!isImage},
        {action:'mask', icon:'brush', label:'遮罩', disabled:!isImage},
        {action:'brush', icon:'paintbrush', label:'画笔', disabled:!isImage},
        {action:'grid', icon:'grid-3x3', label:'宫格切分', disabled:!isImage},
        {action:'compare', icon:'columns-2', label:'对比', disabled:!canCompare},
        {action:'save', icon:'library', label:'加入资产', disabled:!target.image?.file_id},
        {action:'download', icon:'download', label:'下载', disabled:false},
        {action:'fullscreen', icon:'maximize', label:'全屏', disabled:false}
    ];
    return `<div class="node-shortcut-bar" data-node-shortcut-bar="${escapeAttr(node.id)}">
        ${items.map(item => `<button class="node-shortcut-btn" type="button" data-node-shortcut="${item.action}" data-node-id="${escapeAttr(node.id)}" title="${escapeAttr(item.label)}" ${item.disabled ? 'disabled' : ''}>
            <i data-lucide="${item.icon}"></i><span>${escapeHtml(item.label)}</span>
        </button>`).join('')}
    </div>`;
}
function positionNodeShortcutForNode(node){
    if(!nodeShortcutOverlay || !node) return;
    const bar = nodeShortcutOverlay.querySelector('.node-shortcut-bar');
    if(!bar) return;
    const rect = nodeRect(node);
    const gap = 14;
    // 宽度按按钮数量自适应：每个按钮约 74px，加内边距与间距；再受视口宽度约束。
    const btnCount = bar.querySelectorAll('.node-shortcut-btn').length || 1;
    const perBtn = 74;
    const intrinsicW = btnCount * perBtn + (btnCount - 1) * 4 + 12;
    const maxW = Math.max(200, shell.clientWidth - 48);
    const cardW = Math.min(680, maxW, Math.max(150, intrinsicW));
    bar.style.setProperty('--shortcut-cols', String(btnCount));
    const centerX = viewport.x + (rect.x + rect.width / 2) * viewport.scale;
    const desiredLeft = centerX - cardW / 2;
    const minLeft = 24;
    const maxLeft = Math.max(minLeft, shell.clientWidth - cardW - 24);
    const left = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
    const top = viewport.y + rect.y * viewport.scale - 46 - gap;
    bar.style.width = `${cardW}px`;
    bar.style.left = `${Math.round(left)}px`;
    bar.style.top = `${Math.round(Math.max(12, top))}px`;
}
function bindNodeShortcutOverlayEvents(){
    if(!nodeShortcutOverlay || nodeShortcutOverlay.dataset.bound === '1') return;
    nodeShortcutOverlay.dataset.bound = '1';
    nodeShortcutOverlay.addEventListener('pointerdown', event => {
        const btn = event.target.closest?.('[data-node-shortcut]');
        if(!btn) return;
        event.preventDefault();
        event.stopPropagation();
    }, true);
    nodeShortcutOverlay.addEventListener('mousedown', event => {
        const btn = event.target.closest?.('[data-node-shortcut]');
        if(!btn) return;
        event.preventDefault();
        event.stopPropagation();
    }, true);
    nodeShortcutOverlay.addEventListener('click', event => {
        const btn = event.target.closest?.('[data-node-shortcut]');
        if(!btn) return;
        event.preventDefault();
        event.stopPropagation();
        triggerNodeShortcutAction(btn.dataset.nodeShortcut || '', btn.dataset.nodeId || '');
    });
}
function updateNodeShortcutBar(){
    if(!nodeShortcutOverlay) return;
    const node = selectedNode();
    if(!shouldShowNodeShortcutBar(node)){
        nodeShortcutOverlay.innerHTML = '';
        return;
    }
    nodeShortcutOverlay.innerHTML = nodeShortcutBarHtml(node);
    positionNodeShortcutForNode(node);
    if(window.lucide) lucide.createIcons();
}
function closeNodeContextMenu(){
    if(!nodeContextMenu) return;
    nodeContextMenu.hidden = true;
    nodeContextMenu.innerHTML = '';
    delete nodeContextMenu.dataset.nodeId;
    delete nodeContextMenu.dataset.canvasContext;
}
function nodeContextMenuHtml(node){
    const target = nodeShortcutTargetFor(node);
    const items = [
        {action:'save', icon:'library', label:'加入资产', disabled:!target?.image?.file_id},
        {action:'download', icon:'download', label:'下载', disabled:!target?.image?.url},
        {separator:true},
        {action:'copy', icon:'copy', label:'复制'},
        {action:'paste', icon:'clipboard', label:'粘贴', disabled:!nodeClipboard?.nodes?.length && !canReadSystemClipboard()},
        {separator:true},
        {action:'delete', icon:'trash-2', label:'删除', danger:true},
        {action:'feedback', icon:'message-square-warning', label:'反馈问题'}
    ];
    return items.map(item => item.separator
        ? '<div class="node-context-menu-separator" role="separator"></div>'
        : `<button class="node-context-menu-item ${item.danger ? 'danger' : ''}" type="button" role="menuitem" data-node-context-action="${item.action}" ${item.disabled ? 'disabled' : ''}><i data-lucide="${item.icon}"></i><span>${item.label}</span></button>`
    ).join('');
}
function openNodeContextMenu(nodeId, event){
    const node = nodes.find(entry => entry.id === nodeId);
    if(!node || !nodeContextMenu) return;
    const composerWasOpen = composer?.classList.contains('open');
    const shortcutsWereOpen = Boolean(nodeShortcutOverlay?.querySelector('.node-shortcut-bar'));
    document.activeElement?.blur?.();
    selectedId = node.id;
    selectedIds = [];
    const mediaItem = event.target.closest?.('[data-image-index]');
    selectedImage = mediaItem
        ? {nodeId:mediaItem.dataset.refNodeId || node.id, index:Number(mediaItem.dataset.refImageIndex ?? mediaItem.dataset.imageIndex ?? 0)}
        : {nodeId:'', index:-1};
    suppressComposerForCandidateNodeId = '';
    lastMouseWorld = screenToWorld(event);
    syncSelectionUi();
    if(composerWasOpen || shortcutsWereOpen){
        updateComposer();
        if(!composerWasOpen) composer?.classList.remove('open');
        if(!shortcutsWereOpen && nodeShortcutOverlay) nodeShortcutOverlay.innerHTML = '';
    }
    requestRenderMinimap();
    nodeContextMenu.dataset.nodeId = node.id;
    nodeContextMenu.innerHTML = nodeContextMenuHtml(node);
    nodeContextMenu.hidden = false;
    const shellRect = shell.getBoundingClientRect();
    const requestedX = event.clientX - shellRect.left;
    const requestedY = event.clientY - shellRect.top;
    const gap = 8;
    const maxX = Math.max(gap, shell.clientWidth - nodeContextMenu.offsetWidth - gap);
    const maxY = Math.max(gap, shell.clientHeight - nodeContextMenu.offsetHeight - gap);
    nodeContextMenu.style.left = `${Math.max(gap, Math.min(maxX, requestedX))}px`;
    nodeContextMenu.style.top = `${Math.max(gap, Math.min(maxY, requestedY))}px`;
    if(window.lucide) lucide.createIcons();
}
function canvasContextMenuHtml(){
    const items = [
        {action:'generation-image', icon:'image', label:'图片生成'},
        {action:'generation-video', icon:'play-square', label:'视频生成'},
        {action:'generation-workflow', icon:'workflow', label:'工作流生成'},
        {action:'group', icon:'group', label:'分组'},
        {action:'prompt', icon:'text-cursor-input', label:'提示词'},
        {action:'loop', icon:'repeat-2', label:'循环节点'},
        {separator:true},
        {action:'fit-view', icon:'scan', label:'适应视图'},
        {action:'paste', icon:'clipboard', label:'粘贴', disabled:!nodeClipboard?.nodes?.length && !canReadSystemClipboard()},
        {action:'undo', icon:'undo-2', label:'撤销', disabled:!undoStack.length}
    ];
    return items.map(item => item.separator
        ? '<div class="node-context-menu-separator" role="separator"></div>'
        : `<button class="node-context-menu-item" type="button" role="menuitem" data-canvas-context-action="${item.action}" ${item.disabled ? 'disabled' : ''}><i data-lucide="${item.icon}"></i><span>${item.label}</span></button>`
    ).join('');
}
function openCanvasContextMenu(event){
    if(!nodeContextMenu) return;
    closeCreateMenu();
    closePortDropMenu();
    closeNodeContextMenu();
    lastMouseWorld = screenToWorld(event);
    nodeContextMenu.dataset.canvasContext = '1';
    nodeContextMenu.innerHTML = canvasContextMenuHtml();
    nodeContextMenu.hidden = false;
    const shellRect = shell.getBoundingClientRect();
    const requestedX = event.clientX - shellRect.left;
    const requestedY = event.clientY - shellRect.top;
    const gap = 8;
    const maxX = Math.max(gap, shell.clientWidth - nodeContextMenu.offsetWidth - gap);
    const maxY = Math.max(gap, shell.clientHeight - nodeContextMenu.offsetHeight - gap);
    nodeContextMenu.style.left = `${Math.max(gap, Math.min(maxX, requestedX))}px`;
    nodeContextMenu.style.top = `${Math.max(gap, Math.min(maxY, requestedY))}px`;
    if(window.lucide) lucide.createIcons();
}
function triggerCanvasContextAction(action){
    const point = lastMouseWorld || viewportCenter();
    closeNodeContextMenu();
    if(action === 'generation-image') createGenerationNodeByKind('image', point);
    else if(action === 'generation-video') createGenerationNodeByKind('video', point);
    else if(action === 'generation-workflow') createGenerationNodeByKind('workflow', point);
    else if(action === 'group') createSmartGroupNode(point.x - 170, point.y - 110);
    else if(action === 'prompt') createPromptNode(point.x - 158, point.y - 97);
    else if(action === 'loop') createLoopNode(point.x - 135, point.y - 95);
    else if(action === 'fit-view') toggleZoomPreview();
    else if(action === 'paste') void pasteFromContextMenu();
    else if(action === 'undo') performUndo();
}
function openParentFeedback(){
    try {
        const button = window.parent?.document?.getElementById('feedbackOpenBtn');
        if(button){ button.click(); return; }
    } catch {}
    toast('当前页面未提供反馈入口');
}
function triggerNodeContextAction(action, nodeId){
    const node = nodes.find(entry => entry.id === nodeId);
    closeNodeContextMenu();
    if(!node && action !== 'paste' && action !== 'feedback') return;
    if(action === 'save'){
        openNodeAssetSaveModal(node).catch(err => showErrorModal(err.message || '保存到资产库失败', '保存到资产库失败'));
    } else if(action === 'download'){
        const target = nodeShortcutTargetFor(node);
        if(target?.image) downloadPreviewFile(target.image);
    } else if(action === 'copy'){
        copySelectedNodes();
    } else if(action === 'paste'){
        void pasteFromContextMenu();
    } else if(action === 'delete'){
        deleteNode(node.id);
    } else if(action === 'feedback'){
        openParentFeedback();
    }
}
function bindNodeContextMenuEvents(){
    if(!nodeContextMenu || nodeContextMenu.dataset.bound === '1') return;
    nodeContextMenu.dataset.bound = '1';
    nodeContextMenu.addEventListener('pointerdown', event => event.stopPropagation());
    nodeContextMenu.addEventListener('mousedown', event => event.stopPropagation());
    nodeContextMenu.addEventListener('click', event => {
        const button = event.target.closest('[data-node-context-action],[data-canvas-context-action]');
        if(!button || button.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        if(button.dataset.canvasContextAction){
            triggerCanvasContextAction(button.dataset.canvasContextAction);
        } else {
            triggerNodeContextAction(button.dataset.nodeContextAction, nodeContextMenu.dataset.nodeId || '');
        }
    });
    window.addEventListener('pointerdown', event => {
        if(!nodeContextMenu.hidden && !nodeContextMenu.contains(event.target)) closeNodeContextMenu();
    }, true);
    window.addEventListener('blur', closeNodeContextMenu);
    window.addEventListener('resize', closeNodeContextMenu);
    shell.addEventListener('wheel', closeNodeContextMenu, {passive:true});
}
// M9 拆分：renderNodeAssetSaveModal / closeNodeAssetSaveModal / openNodeAssetSaveModal /
// selectedAssetSaveItems / openSelectionAssetSaveModal /
// saveFileToAssetLibrarySelection 已迁移到
// frontend/src/canvas/asset-library.js（经典 <script>，非 ES module，
// 原因同 M1-M8）。
function triggerNodeShortcutAction(action, nodeId=''){
    const node = nodes.find(entry => entry.id === (nodeId || selectedId)) || selectedNode();
    const target = nodeShortcutTargetFor(node);
    if(!node || !target) return;
    if(action === 'download-all'){
        void downloadGroupNodeImages(node);
        return;
    }
    if(action === 'ungroup'){
        ungroupNode(node.id);
        return;
    }
    if(action === 'save'){
        openNodeAssetSaveModal(node).catch(err => showErrorModal(err.message || '保存到资产库失败', '保存到资产库失败'));
        return;
    }
    if(action === 'download'){
        downloadPreviewFile(target.image);
        return;
    }
    if(action === 'fullscreen'){
        openImagePreview(target.node.id, target.index);
        return;
    }
    if(action === 'compare'){
        if(target.kind !== 'image' || !compareSourcesForNode(target.node).length) return;
        openImagePreview(target.node.id, target.index);
        previewCompareOn = true;
        previewCompareIndex = 0;
        refreshComparePanel();
        return;
    }
    if(target.kind !== 'image') return;
    openImageEditor(target.node.id, target.index);
    setImageEditMode(action, true);
}
