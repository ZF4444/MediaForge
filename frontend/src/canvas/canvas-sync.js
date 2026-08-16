// M16 拆分：画布多端协作合并系统。
// 从 static/js/canvas.js 原样剪切，未改动任何函数签名/内部逻辑，
// 只做了纯粹的位置搬移。
//
// 为什么这里不用 ES module 的 export/import（跟 M1-M15 同一个原因）：
// canvas.html 依赖经典 <script> 的全局作用域语义（顶层声明自动
// 挂到共享脚本作用域），57 处内联 onclick="xxx()" 都依赖这一点。
// 所以这里同样只做"物理文件拆分"：canvas-sync.js 保持经典脚本语法，
// 通过 <script src="canvas-sync.js"> 排在 workflow-transfer.js 之后、
// canvas-render.js 之前加载。
//
// 本文件包含：applyMergedServerCanvas / mergeSmartNodeLists /
//   mergeSmartConnections / mergeSmartNode / mergeSmartImageLists /
//   smartNodeInFlight / mergeReloadCanvasNow / scheduleCanvasMergeReload /
//   handleCanvasUpdatedMessage / startCanvasMetaPoll
// —— 多端协作场景下，服务器广播 canvas_updated 之后，如何把远端画布数据
// 和本地当前编辑状态合并（本地正在生成/排队的节点以本地为准，图片取
// 并集，避免互相冲掉对方的生成结果）。
//
// 依赖的外部全局（刻意留在 static/js/canvas.js / main.js 里，
// 通过共享脚本作用域访问，未随本文件迁移）：
//   状态变量：nodes（画布节点数组，本文件内会直接重新赋值 nodes = ...，
//     和 M2 loop-node.js 里 selectedId = ... 同一个道理，经典脚本才能
//     支持这种重新赋值，ES module 具名导入是只读绑定）
//   状态变量：canvas, canvasId, dragState, selectionState（画布/交互状态，
//     本文件只读，不写）
//   同步状态：smartClientId（客户端 id 常量）、canvasSyncInFlight（保存
//     是否正在进行）、canvasSyncTimer、canvasMetaPollTimer（定时器句柄）
//     —— 这几个和 scheduleSave/saveCanvas（也在 main.js 里）共享读写，
//     属于跨函数可变状态耦合，和 state.js 的顾虑一样，暂不迁移，留在
//     main.js，本文件通过共享脚本作用域读写它们。
//   渲染/恢复函数：render, resumeSmartPendingTasks
//     （M7/main.js 里的节点渲染与任务恢复逻辑）
//   节点规范化：normalizeLegacySmartNode（M3 已拆到 node-model.js）
//   连线图层：refreshConnectionLayer（如果存在则调用，可选依赖）
//   待处理任务判断：smartPendingTasks（main.js 里的任务查询函数）
//
// 反过来，main.js 里仍保留的以下函数会调用本文件里的函数
// （通过共享脚本作用域，未做任何改动）：
//   connectAssetLibrarySyncSocket 的 WebSocket onmessage 回调调用
//     handleCanvasUpdatedMessage（这个 WebSocket 同时处理
//     asset_library_updated 和 canvas_updated 两种消息，是共享入口，
//     不能拆，原因同 M9 asset-library.js 的说明）
//   loadCanvas 调用 startCanvasMetaPoll
//   saveCanvas 的 409 冲突处理分支调用 applyMergedServerCanvas
//
// 刻意排除（留在 main.js，属于其他模块的范畴）：
//   connectAssetLibrarySyncSocket —— 单个共享 WebSocket，同时分发
//     asset_library_updated（资产库）和 canvas_updated（本文件）两类
//     消息，物理上无法拆分成单一职责模块，留在 main.js。
function mergeSmartImageLists(localImgs, remoteImgs){
    const out = [];
    const seen = new Set();
    (localImgs || []).forEach(img => {
        const u = img && img.url;
        if(u && seen.has(u)) return;
        if(u) seen.add(u);
        out.push(img);
    });
    (remoteImgs || []).forEach(img => {
        const u = img && img.url;
        if(!u || seen.has(u)) return;
        seen.add(u);
        out.push(img);
    });
    return out;
}
function smartNodeInFlight(node){
    return Boolean(node && (node.running || node.pending || node.queued || smartPendingTasks(node).length));
}
function mergeSmartNode(local, remote){
    // 本地正在生成/排队的节点完全以本地为准，只把对方可能多出来的图并进来，绝不被对方旧状态冲掉
    if(smartNodeInFlight(local)){
        return {...local, images:mergeSmartImageLists(local.images, remote.images)};
    }
    // 否则以对方（最新保存方）的布局/标题/设置为基底，但图片取并集——双方生成结果都不丢
    return {...remote, images:mergeSmartImageLists(local.images, remote.images)};
}
function mergeSmartNodeLists(localNodes, remoteNodes){
    const localById = new Map((localNodes || []).map(n => [n.id, n]));
    const remoteById = new Map((remoteNodes || []).map(n => [n.id, n]));
    const order = [];
    const seen = new Set();
    (localNodes || []).forEach(n => { if(!seen.has(n.id)){ seen.add(n.id); order.push(n.id); } });
    (remoteNodes || []).forEach(n => { if(!seen.has(n.id)){ seen.add(n.id); order.push(n.id); } });
    return order.map(id => {
        const local = localById.get(id);
        const remote = remoteById.get(id);
        if(local && !remote) return local;     // 仅本地存在：保留（我新建的节点；对方删了也宁可复活也不丢结果）
        if(remote && !local) return remote;     // 仅对方存在：加入对方新建的节点
        return mergeSmartNode(local, remote);
    }).filter(Boolean);
}
function mergeSmartConnections(localConns, remoteConns, nodeIds){
    const out = [];
    const seen = new Set();
    [...(localConns || []), ...(remoteConns || [])].forEach(c => {
        if(!c || !nodeIds.has(c.from) || !nodeIds.has(c.to)) return;
        const key = `${c.from}->${c.to}:${c.kind || 'flow'}`;
        if(seen.has(key)) return;
        seen.add(key);
        out.push(c);
    });
    return out;
}
function applyMergedServerCanvas(serverCanvas){
    if(!serverCanvas || !canvas) return false;
    const remoteNodes = (Array.isArray(serverCanvas.nodes) ? serverCanvas.nodes : []).map(normalizeLegacySmartNode).filter(Boolean);
    const mergedNodes = mergeSmartNodeLists(nodes, remoteNodes);
    const nodeIds = new Set(mergedNodes.map(n => n.id));
    nodes = mergedNodes;
    canvas.connections = mergeSmartConnections(canvas.connections, serverCanvas.connections, nodeIds);
    canvas.updated_at = Number(serverCanvas.updated_at || canvas.updated_at || 0);
    if(canvas.title !== serverCanvas.title && serverCanvas.title){
        canvas.title = serverCanvas.title;
        const titleEl = document.getElementById('canvasTitle');
        if(titleEl) titleEl.textContent = canvas.title;
    }
    render();
    if(typeof refreshConnectionLayer === 'function') refreshConnectionLayer();
    resumeSmartPendingTasks();
    return true;
}
async function mergeReloadCanvasNow(){
    if(!canvasId) return;
    if(dragState || selectionState){
        // 用户正在拖拽/框选，稍后再合并，别打断操作
        scheduleCanvasMergeReload(600);
        return;
    }
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}`);
        if(!res.ok) return;
        const data = await res.json();
        if(data && data.canvas) applyMergedServerCanvas(data.canvas);
    } catch(e) {}
}
function scheduleCanvasMergeReload(delay=200){
    clearTimeout(canvasSyncTimer);
    canvasSyncTimer = setTimeout(() => { mergeReloadCanvasNow(); }, delay);
}
function handleCanvasUpdatedMessage(data={}){
    if(!data || data.type !== 'canvas_updated') return;
    if(!canvasId || data.canvas_id !== canvasId) return;
    if(data.client_id && data.client_id === smartClientId) return; // 自己发的，忽略
    if(canvasSyncInFlight) return; // 我正在保存，保存完成/409 合并会处理
    const remoteUpdatedAt = Number(data.updated_at || 0);
    if(remoteUpdatedAt && remoteUpdatedAt <= Number(canvas?.updated_at || 0)) return;
    scheduleCanvasMergeReload(200);
}
function startCanvasMetaPoll(){
    // WS / iframe 转发不可靠时的兜底：定期看服务器 updated_at 是否变新，变新就合并拉取
    if(canvasMetaPollTimer) return;
    canvasMetaPollTimer = setInterval(async () => {
        if(!canvasId || !canvas) return;
        if(canvasSyncInFlight || dragState || selectionState) return;
        try {
            const res = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}/meta`);
            if(!res.ok) return;
            const meta = await res.json();
            if(Number(meta.updated_at || 0) > Number(canvas.updated_at || 0)) mergeReloadCanvasNow();
        } catch(e) {}
    }, 8000);
}
