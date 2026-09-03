// 从 frontend/src/canvas/main.js 剪切出的工作流导入导出逻辑（M15 拆分批次）。
// 剪切时未改动任何函数签名/内部逻辑，只做了纯粹的位置搬移。
//
// 为什么这里不用 ES module 的 export/import（跟 M1-M14 同一个原因）：
// canvas.js 依赖经典 <script> 的全局作用域语义，
// static/canvas.html 里 57 处内联 onclick="xxx()" 都依赖这一点。
// 所以这里同样只做"物理文件拆分"：workflow-transfer.js 保持经典脚本
// 语法，通过 <script src="workflow-transfer.js"> 排在 node-context-ui.js
// 之后、canvas-render.js 之前加载。
//
// 本文件覆盖"工作流导入导出"弹窗的全部逻辑（原文件 531-732 行区间，
// 约200行）——把当前选中的节点/连线打包导出为 JSON 或带资源的 zip
// 模板包，或反过来把模板包导入追加到当前画布：
//   1. API 错误信息提取（本文件专属，不是 upload.js/M6 那套通用配额
//      基础设施 smartResponseErrorMessage）：apiErrorMessage/
//      responseErrorMessage
//   2. 下载与文件命名：downloadBlob/canvasWorkflowFilename
//   3. 序列化/反序列化：serializableSmartNode（清空运行态字段，只留
//      可复用的节点配置）/selectedCanvasWorkflowPayload（打包当前选中
//      节点+内部连线）/normalizeImportedCanvasWorkflow（兼容三种可能的
//      导入 JSON 结构：数组/{nodes,connections}/{workflow:{...}}）
//   4. 弹窗生命周期：openCanvasWorkflowTransferModal/
//      closeCanvasWorkflowTransferModal/updateCanvasWorkflowTransferMeta
//   5. 导出/导入动作：exportSelectedCanvasWorkflow（纯 JSON 或带资源的
//      zip 包，调用 /api/canvas-workflows/export）/
//      insertCanvasWorkflowIntoCanvas（把导入的节点重新分配 id、平移到
//      视口中心、重建连线映射后插入画布）/importCanvasWorkflowFile
//      （上传模板文件，调用 /api/canvas-workflows/import）
//
// 明确排除、留在 main.js 的内容：
//   - cloneSmartSettings/settingsForStorage/isApiLikeEngine/
//     mediaItemForStorage 等（物理上紧邻本文件开头）：通用的设置/
//     存储序列化工具函数，被 cascade-run.js/candidate-pool.js 等多个
//     模块广泛调用，不是工作流导入导出专属逻辑。
//   - smartSettingsModeKey 及其后的"最近使用设置"记忆系统（物理上
//     紧邻本文件结尾）：跟工作流导入导出是完全不同的两个子系统，只是
//     碰巧物理上写在了一起。

function apiErrorMessage(data, fallback='请求失败'){
    if(!data) return fallback;
    if(typeof data === 'string') return data || fallback;
    const detail = data.detail ?? data.error ?? data.message;
    if(typeof detail === 'string') return detail || fallback;
    if(Array.isArray(detail)){
        const messages = detail.map(item => {
            if(typeof item === 'string') return item;
            const loc = Array.isArray(item?.loc) ? item.loc.filter(x => x !== 'body').join('.') : '';
            const msg = item?.msg || item?.message || JSON.stringify(item);
            return loc ? `${loc}: ${msg}` : msg;
        }).filter(Boolean);
        return messages.join('\n') || fallback;
    }
    if(detail && typeof detail === 'object') return detail.message || detail.msg || JSON.stringify(detail);
    try {
        return JSON.stringify(data);
    } catch(e) {
        return fallback;
    }
}
async function responseErrorMessage(response, fallback='请求失败'){
    try {
        const data = await response.clone().json();
        return apiErrorMessage(data, fallback);
    } catch(e) {
        try {
            const text = await response.text();
            return text || fallback;
        } catch(_) {
            return fallback;
        }
    }
}
function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'canvas-workflow.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
}
function canvasWorkflowFilename(ext='json'){
    const title = (canvas?.title || document.getElementById('smartTitle')?.textContent || 'canvas').trim();
    const safe = title.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '-').slice(0, 48) || 'canvas';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    return `${safe}-workflow-${stamp}.${ext}`;
}
function serializableSmartNode(node){
    const base = JSON.parse(JSON.stringify(node || {}));
    const copy = normalizeLegacySmartNode(base) || {};
    if(Array.isArray(copy.images)) copy.images = copy.images.map(mediaItemForStorage).filter(Boolean);
    if(Array.isArray(copy.candidateImages)) copy.candidateImages = copy.candidateImages.map(mediaItemForStorage).filter(Boolean);
    if(copy.runSettings) copy.runSettings = settingsForStorage(copy.runSettings);
    copy.running = false;
    copy.pending = 0;
    copy.queued = false;
    delete copy.pendingTasks;
    delete copy.pendingCandidatePool;
    delete copy._rerunPreviousImages;
    delete copy._dom;
    return copy;
}
function selectedCanvasWorkflowPayload(){
    const ids = selectedNodeIds();
    const idSet = new Set(ids);
    const selectedNodes = nodes.filter(node => idSet.has(node.id)).map(serializableSmartNode);
    const selectedSet = new Set(selectedNodes.map(node => node.id));
    const selectedConnections = (canvas?.connections || [])
        .filter(conn => selectedSet.has(conn.from) && selectedSet.has(conn.to))
        .map(conn => JSON.parse(JSON.stringify(conn)));
    return {
        format:'infinite-canvas-workflow',
        version:1,
        canvas_type:'smart',
        exported_at:Date.now(),
        nodes:selectedNodes,
        connections:selectedConnections
    };
}
function normalizeImportedCanvasWorkflow(data){
    if(Array.isArray(data)) return {nodes:data, connections:[]};
    if(Array.isArray(data?.nodes)) return {nodes:data.nodes, connections:Array.isArray(data.connections) ? data.connections : []};
    if(Array.isArray(data?.workflow?.nodes)) return {nodes:data.workflow.nodes, connections:Array.isArray(data.workflow.connections) ? data.workflow.connections : []};
    return {nodes:[], connections:[]};
}
function openCanvasWorkflowTransferModal(){
    if(!canvas){ toast('请先打开画布'); return; }
    toggleAssetLibrary(false);
    updateCanvasWorkflowTransferMeta();
    if(canvasWorkflowTransferModal) canvasWorkflowTransferModal.hidden = false;
    canvasWorkflowTransferModal?.classList.add('open');
    canvasWorkflowToggle?.classList.add('active');
    refreshIcons();
}
function closeCanvasWorkflowTransferModal(){
    canvasWorkflowTransferModal?.classList.remove('open');
    if(canvasWorkflowTransferModal) canvasWorkflowTransferModal.hidden = true;
    canvasWorkflowToggle?.classList.remove('active');
    canvasWorkflowImportDropZone?.classList.remove('drag-over');
}
function updateCanvasWorkflowTransferMeta(){
    const payload = selectedCanvasWorkflowPayload();
    const nodeCount = payload.nodes.length;
    const connCount = payload.connections.length;
    canvasWorkflowExportMeta?.classList.remove('busy', 'success');
    if(canvasWorkflowExportMeta) canvasWorkflowExportMeta.textContent = nodeCount ? `已选择 ${nodeCount} 个节点，${connCount} 条连线` : '未选择节点，请先选中要导出的组件';
    if(canvasWorkflowTransferSub) canvasWorkflowTransferSub.textContent = nodeCount ? '导出当前选中内容，或把模板导入到当前画布' : '请先选中节点再导出；导入会追加到当前画布';
}
async function exportSelectedCanvasWorkflow(includeResources=false){
    if(!canvas) return;
    const payload = selectedCanvasWorkflowPayload();
    if(!payload.nodes.length){
        updateCanvasWorkflowTransferMeta();
        toast('未选择节点，请先选中要导出的组件');
        return;
    }
    try {
        if(!includeResources){
            downloadBlob(new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}), canvasWorkflowFilename('json'));
            toast('已导出画布模板 JSON');
            return;
        }
        if(canvasWorkflowExportMeta){
            canvasWorkflowExportMeta.classList.add('busy');
            canvasWorkflowExportMeta.textContent = '正在打包资源...';
        }
        const filename = canvasWorkflowFilename('zip');
        const res = await fetch('/api/canvas-workflows/export', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({...payload, include_resources:true, filename})
        });
        if(!res.ok) throw new Error(await responseErrorMessage(res, '导出模板失败'));
        downloadBlob(await res.blob(), filename);
        if(canvasWorkflowExportMeta){
            canvasWorkflowExportMeta.classList.remove('busy');
            canvasWorkflowExportMeta.classList.add('success');
            canvasWorkflowExportMeta.textContent = `已导出 ${payload.nodes.length} 个节点，包含可找到的本地资源`;
        }
        toast('已导出包含资源的画布模板包');
        setTimeout(() => {
            if(canvasWorkflowTransferModal?.classList.contains('open')) updateCanvasWorkflowTransferMeta();
        }, 1600);
    } catch(err) {
        canvasWorkflowExportMeta?.classList.remove('busy', 'success');
        toast(err.message || '导出模板失败');
    }
}
function insertCanvasWorkflowIntoCanvas(imported){
    const srcNodes = (imported.nodes || []).filter(Boolean);
    const srcConnections = (imported.connections || []).filter(Boolean);
    if(!canvas || !srcNodes.length) throw new Error('模板中没有可导入的节点');
    pushUndo();
    const minX = Math.min(...srcNodes.map(n => Number(n.x || 0)));
    const minY = Math.min(...srcNodes.map(n => Number(n.y || 0)));
    const target = viewportCenter();
    const dx = target.x - minX;
    const dy = target.y - minY;
    const idMap = new Map();
    const newNodes = srcNodes.map(source => {
        const copy = serializableSmartNode(source);
        const oldId = copy.id || uid(copy.type || 'smart');
        copy.id = uid(copy.type || 'smart');
        copy.x = Number(copy.x || 0) + dx;
        copy.y = Number(copy.y || 0) + dy;
        copy.created_at = copy.created_at || Date.now();
        idMap.set(oldId, copy.id);
        return normalizeLegacySmartNode(copy);
    }).filter(Boolean);
    const newConnections = srcConnections
        .map(conn => ({...JSON.parse(JSON.stringify(conn)), from:idMap.get(conn.from), to:idMap.get(conn.to)}))
        .filter(conn => conn.from && conn.to);
    nodes.push(...newNodes);
    canvas.connections = [...(canvas.connections || []), ...newConnections];
    selectedIds = newNodes.length > 1 ? newNodes.map(node => node.id) : [];
    selectedId = newNodes.length === 1 ? newNodes[0].id : '';
    selectedImage = {nodeId:'', index:-1};
    activeComposerSubject = null;
    render();
    scheduleSave();
    toast(`已导入 ${newNodes.length} 个节点`);
}
async function importCanvasWorkflowFile(file){
    if(!canvas || !file) return;
    try {
        if(canvasWorkflowTransferSub) canvasWorkflowTransferSub.textContent = '正在导入模板...';
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/canvas-workflows/import', {method:'POST', body:form});
        if(!res.ok) throw new Error(await responseErrorMessage(res, '导入模板失败'));
        const data = await res.json();
        insertCanvasWorkflowIntoCanvas(normalizeImportedCanvasWorkflow(data));
        closeCanvasWorkflowTransferModal();
    } catch(err) {
        if(canvasWorkflowTransferModal?.classList.contains('open')) updateCanvasWorkflowTransferMeta();
        toast(err.message || '导入模板失败');
    }
}
