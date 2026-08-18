// 从 static/js/canvas.js 剪切出的连线（connection）数据与渲染逻辑（M4 拆分批次）。
// 剪切时未改动任何函数签名/内部逻辑，只做了纯粹的位置搬移。
//
// 为什么这里不用 ES module 的 export/import（跟 M1 utils.js / M2 loop-node.js /
// M3 node-layout.js、node-model.js 同一个原因）：canvas.js 依赖经典
// <script> 的全局作用域语义，static/canvas.html 里 57 处内联
// onclick="xxx()" 都依赖这一点。所以这里同样只做"物理文件拆分"：
// connections.js 保持经典脚本语法，通过 <script src="connections.js">
// 排在 node-model.js 之后、main.js 之前加载。
//
// 本文件包含两类东西：
//   1. 连线数据操作：addConnection / connectInputNode / disconnectConnection /
//      outgoingConnectionsFor / outgoingInputConnectionsFor /
//      connectionMidpoint / insertionConnectionForNode
//   2. 连线渲染与端口拖拽交互：connectionGeometry / renderConnections /
//      updateConnectionGeometryInPlace / refreshConnectionLayer /
//      requestRefreshConnectionLayer / bindConnectionEvents /
//      ensurePortDragPathElement / clearPortDragVisual / updatePortDragVisual /
//      handlePortDrop / openPortDropMenu / closePortDropMenu /
//      drawPortDropMenuLine / handlePortDropMenuSelect
//
// 顺带迁移的模块局部状态（原来就紧邻 openPortDropMenu 等函数声明，只在这个
// 连线菜单功能内部使用，未在文件其它地方被引用，随函数一起搬过来）：
//   portDropMenuDrag, portDropMenuScreenPoint
//
// 依赖的外部全局（都还留在 static/js/canvas.js / main.js 里，
// 通过共享全局作用域访问，未随本文件迁移）：
//   DOM 元素：shell, world, portDropMenu
//   状态变量：nodes, canvas, dragState, portDragState, loopInsertPreview,
//     connectionLayerRefreshQueued, lastConnectionLayerRefreshAt
//     （这几个是跨多个功能域共享的全局状态，比如 portDragState 还被
//     bindNodeEvents/鼠标移动处理等 canvas-render.js 范畴的代码读写，
//     不能只归给连线模块，留在 main.js）
//   工具函数（M1 已拆到 utils.js）：escapeAttr, refreshIcons
//   布局计算（M3 已拆到 node-layout.js）：nodeRect, imageLayout, mediaNodeDefaultScale
//   循环节点（M2 已拆到 loop-node.js）：fitSmartLoopNode, createLoopNode
//   节点模型（M3 已拆到 node-model.js）：createPromptNode
//   节点操作：pushUndo, commitPendingUndo, discardPendingUndo, render,
//     scheduleSave, screenToWorld
//   分组/类型判断：isSmartGroupNode, isSmartImageNode, isHistoryGroupNode,
//     smartGroupImageRefs, smartGroupCompactMembers, demoteHistoryGroupNode
//   级联运行相关：cascadeConnectionKeys, smartCascadeEdgeState（级联调度
//     范畴，留在 main.js，未来拆 cascade-run.js 时再处理）
//   创建生成节点：createGenerationNodeByKind（内部会调用 updateComposer()
//     同步 composer UI 状态，M3 阶段就已决定不拆进 node-model.js，这里
//     同样保持调用它作为全局）

function connectionGeometry(fromNode, toNode, isHistory){
    const fr = nodeRect(fromNode), tr = nodeRect(toNode);
    const fx = isHistory ? fr.x + fr.width / 2 : fr.x + fr.width;
    const fy = isHistory ? fr.y + fr.height : fr.y + fr.height / 2;
    const tx = isHistory ? tr.x + tr.width / 2 : tr.x;
    const ty = isHistory ? tr.y : tr.y + tr.height / 2;
    const dx = Math.max(50, Math.abs(tx - fx) * 0.45);
    const dy = Math.max(36, Math.abs(ty - fy) * 0.45);
    const curve = isHistory
        ? `M${fx} ${fy} C ${fx} ${fy+dy}, ${tx} ${ty-dy}, ${tx} ${ty}`
        : `M${fx} ${fy} C ${fx+dx} ${fy}, ${tx-dx} ${ty}, ${tx} ${ty}`;
    const mx = (fx + tx) / 2, my = (fy + ty) / 2;
    return {fx, fy, tx, ty, curve, mx, my};
}
function renderConnections(){
    const conns = (canvas?.connections || []).map((conn, index) => ({...conn, index})).filter(c => nodes.some(n => n.id === c.from) && nodes.some(n => n.id === c.to));
    const cascadeKeys = cascadeConnectionKeys();
    const paths = conns.map(conn => {
        const fromNode = nodes.find(n => n.id === conn.from);
        const toNode = nodes.find(n => n.id === conn.to);
        const kind = conn.kind || 'flow';
        const isHistory = kind === 'history';
        const isInsertPreview = loopInsertPreview?.index === conn.index;
        const edgeKey = `${conn.from}->${conn.to}`;
        const cascadeState = smartCascadeEdgeState(edgeKey);
        const isCascade = !isHistory && (cascadeKeys.has(edgeKey) || Boolean(cascadeState) || isInsertPreview);
        // 目标节点正在生成（图像节点用 pending，提示词节点用 running）时，入边显示流动动画。
        const isPendingLine = Boolean((toNode.pending || toNode.running) && !isCascade);
        const {fx, fy, tx, ty, curve, mx, my} = connectionGeometry(fromNode, toNode, isHistory);
        const cls = [
            isPendingLine ? 'conn-pending' : '',
            isCascade ? 'conn-cascade' : '',
            isCascade && cascadeState === 'done' ? 'conn-cascade-done' : '',
            isCascade && Boolean(cascadeState) && cascadeState !== 'done' ? 'conn-cascade-wait' : '',
            isCascade && cascadeState === 'active' ? 'conn-cascade-active' : '',
            isHistory ? 'conn-history' : ''
        ].filter(Boolean).join(' ');
        const color = isCascade ? '#16a34a' : isHistory ? 'rgba(100,116,139,0.46)' : kind === 'input' ? 'rgba(100,116,139,0.62)' : 'rgba(148,163,184,0.62)';
        const opacity = isPendingLine ? '.82' : '1';
        const width = kind === 'input' ? '1.9' : '1.6';
        return `<g class="conn-group" data-conn-geo data-from="${escapeAttr(conn.from)}" data-to="${escapeAttr(conn.to)}" data-history="${isHistory ? '1' : ''}"><path class="${cls}" d="${curve}" stroke="${color}" stroke-width="${width}" fill="none" opacity="${opacity}"></path><path class="conn-hit" data-conn-index="${conn.index}" d="${curve}" stroke="transparent" stroke-width="28" fill="none"></path><circle class="conn-endpoint" cx="${tx}" cy="${ty}" r="3.5" fill="${color}" opacity=".66"></circle><g class="conn-cut" data-conn-index="${conn.index}" transform="translate(${mx} ${my})"><circle r="16" fill="var(--card)" stroke="${color}" stroke-width="2.8"></circle><path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke="${color}" stroke-width="3" stroke-linecap="round"></path></g></g>`;
    }).join('');
    return `<svg class="connection-layer" width="6000" height="4000" viewBox="0 0 6000 4000" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}
function updateConnectionGeometryInPlace(){
    const svg = world.querySelector('svg.connection-layer');
    if(!svg) return;
    svg.querySelectorAll('g[data-conn-geo]').forEach(group => {
        const fromNode = nodes.find(n => n.id === group.dataset.from);
        const toNode = nodes.find(n => n.id === group.dataset.to);
        if(!fromNode || !toNode) return;
        const {tx, ty, curve, mx, my} = connectionGeometry(fromNode, toNode, group.dataset.history === '1');
        group.querySelectorAll(':scope > path').forEach(p => p.setAttribute('d', curve));
        const endpoint = group.querySelector(':scope > circle.conn-endpoint');
        if(endpoint){ endpoint.setAttribute('cx', tx); endpoint.setAttribute('cy', ty); }
        const cut = group.querySelector(':scope > g.conn-cut');
        if(cut) cut.setAttribute('transform', `translate(${mx} ${my})`);
    });
}
function refreshConnectionLayer(){
    const oldSvg = world.querySelector('svg.connection-layer');
    if(!oldSvg) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = renderConnections().trim();
    const nextSvg = tpl.content.firstElementChild;
    if(nextSvg) oldSvg.replaceWith(nextSvg);
    bindConnectionEvents();
}
function requestRefreshConnectionLayer(){
    // 拖动过程中：只做轻量的原地几何更新，每帧一次，避免重建 SVG 与重绑事件导致掉帧。
    if(dragState){
        if(connectionLayerRefreshQueued) return;
        connectionLayerRefreshQueued = true;
        requestAnimationFrame(() => {
            connectionLayerRefreshQueued = false;
            updateConnectionGeometryInPlace();
        });
        return;
    }
    if(connectionLayerRefreshQueued) return;
    connectionLayerRefreshQueued = true;
    requestAnimationFrame(() => {
        connectionLayerRefreshQueued = false;
        lastConnectionLayerRefreshAt = performance.now();
        refreshConnectionLayer();
    });
}
function bindConnectionEvents(connectionElements=world.querySelectorAll('[data-conn-index]')){
    connectionElements.forEach(el => {
        el.addEventListener('mousedown', e => {
            if(e.button !== 0) return;
            e.stopPropagation();
        });
        if(el.classList.contains('conn-hit')){
            el.addEventListener('click', e => e.stopPropagation());
            el.addEventListener('dblclick', e => {
                e.preventDefault(); e.stopPropagation();
                disconnectConnection(Number(el.dataset.connIndex));
            });
            return;
        }
        el.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            const index = Number(el.dataset.connIndex);
            disconnectConnection(index);
        });
    });
}
function ensurePortDragPathElement(){
    const svg = world.querySelector('svg.connection-layer');
    if(!svg) return null;
    let path = svg.querySelector('path.port-drag-temp');
    if(!path){
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'port-drag-temp conn-pending');
        path.setAttribute('stroke', 'rgba(100,116,139,0.92)');
        path.setAttribute('stroke-width', '1.9');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);
    }
    return path;
}
function clearPortDragVisual(){
    world.querySelector('path.port-drag-temp')?.remove();
    world.querySelectorAll('.node-port.is-active').forEach(el => el.classList.remove('is-active'));
    world.querySelectorAll('.image-node.port-hover').forEach(el => el.classList.remove('port-hover'));
}
function updatePortDragVisual(){
    if(!portDragState) return;
    const fromNode = nodes.find(n => n.id === portDragState.fromId);
    if(!fromNode) return;
    const fr = nodeRect(fromNode);
    const isOut = portDragState.fromPort === 'out';
    const fx = isOut ? fr.x + fr.width : fr.x;
    const fy = fr.y + fr.height / 2;
    const tx = portDragState.currentWorld.x;
    const ty = portDragState.currentWorld.y;
    const dx = Math.max(50, Math.abs(tx - fx) * 0.45);
    const sign = isOut ? 1 : -1;
    const path = ensurePortDragPathElement();
    if(path) path.setAttribute('d', `M${fx} ${fy} C ${fx + dx * sign} ${fy}, ${tx - dx * sign} ${ty}, ${tx} ${ty}`);
    world.querySelectorAll('.node-port.is-active').forEach(el => el.classList.remove('is-active'));
    world.querySelectorAll('.image-node.port-hover').forEach(el => el.classList.remove('port-hover'));
    if(portDragState.hoverTargetId){
        const targetNodeEl = world.querySelector(`.image-node[data-id="${portDragState.hoverTargetId}"]`);
        targetNodeEl?.classList.add('port-hover');
        targetNodeEl?.querySelector(`.node-port[data-port="${portDragState.hoverPort}"]`)?.classList.add('is-active');
    }
}
function handlePortDrop(drag, e){
    const {targetId, targetPort, hit} = (() => {
        const hitEl = document.elementFromPoint(e.clientX, e.clientY);
        const portEl = hitEl?.closest?.('.node-port');
        const nodeEl = portEl?.closest?.('.image-node') || hitEl?.closest?.('.image-node');
        let id = '', port = '';
        if(nodeEl && nodeEl.dataset.id && nodeEl.dataset.id !== drag.fromId){
            id = nodeEl.dataset.id;
            if(portEl){
                port = portEl.dataset.port;
            } else {
                const rect = nodeEl.getBoundingClientRect();
                port = (e.clientX - rect.left) < rect.width / 2 ? 'in' : 'out';
            }
        }
        return {targetId:id, targetPort:port, hit:hitEl};
    })();
    if(targetId){
        const compatible = (drag.fromPort === 'out' && targetPort === 'in') || (drag.fromPort === 'in' && targetPort === 'out');
        if(!compatible){ clearPortDragVisual(); discardPendingUndo(); render(); return; }
        const fromId = drag.fromPort === 'out' ? drag.fromId : targetId;
        const toId = drag.fromPort === 'out' ? targetId : drag.fromId;
        if(connectInputNode(fromId, toId)){
            clearPortDragVisual();
            commitPendingUndo();
            render();
            scheduleSave();
        } else {
            clearPortDragVisual();
            discardPendingUndo();
            render();
        }
        return;
    }
    if(!drag.moved){ clearPortDragVisual(); discardPendingUndo(); render(); return; }
    if(hit?.closest?.('.composer,.asset-panel,.asset-toggle,.canvas-log-toggle,.canvas-shortcut-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.canvas-minimap')){
        clearPortDragVisual(); discardPendingUndo(); render(); return;
    }
    // 弹出节点类型选择菜单，保留连线视觉
    discardPendingUndo();
    render();
    openPortDropMenu(e, drag);
}
let portDropMenuDrag = null;
let portDropMenuScreenPoint = null;
function openPortDropMenu(event, drag){
    if(!portDropMenu) return;
    portDropMenuDrag = drag;
    portDropMenuScreenPoint = {clientX: event.clientX, clientY: event.clientY};
    const w = 280, h = 260;
    const left = Math.max(14, Math.min(window.innerWidth - w - 14, event.clientX + 12));
    const top = Math.max(14, Math.min(window.innerHeight - h - 14, event.clientY - 20));
    portDropMenu.style.left = `${left}px`;
    portDropMenu.style.top = `${top}px`;
    portDropMenu.removeAttribute('hidden');
    refreshIcons();
    // 重新绘制从源节点到鼠标释放位置的连线
    drawPortDropMenuLine();
}
function closePortDropMenu(){
    portDropMenu?.setAttribute('hidden', '');
    portDropMenuDrag = null;
    portDropMenuScreenPoint = null;
    clearPortDragVisual();
}
function drawPortDropMenuLine(){
    if(!portDropMenuDrag || !portDropMenuScreenPoint) return;
    const fromNode = nodes.find(n => n.id === portDropMenuDrag.fromId);
    if(!fromNode) return;
    const fr = nodeRect(fromNode);
    const isOut = portDropMenuDrag.fromPort === 'out';
    const fx = isOut ? fr.x + fr.width : fr.x;
    const fy = fr.y + fr.height / 2;
    const tp = screenToWorld(portDropMenuScreenPoint);
    const tx = tp.x;
    const ty = tp.y;
    const dx = Math.max(50, Math.abs(tx - fx) * 0.45);
    const sign = isOut ? 1 : -1;
    const path = ensurePortDragPathElement();
    if(path) path.setAttribute('d', `M${fx} ${fy} C ${fx + dx * sign} ${fy}, ${tx - dx * sign} ${ty}, ${tx} ${ty}`);
}
function handlePortDropMenuSelect(nodeType){
    if(!portDropMenuDrag || !portDropMenuScreenPoint) return;
    const drag = portDropMenuDrag;
    const p = screenToWorld(portDropMenuScreenPoint);
    closePortDropMenu();

    pushUndo();
    // 新节点用于承接拉线的端口（与拖拽起点端口相反）应该正好落在鼠标释放的位置，
    // 而不是把整个节点的中心/左上角对齐到释放点。
    const isOut = drag.fromPort === 'out'; // 新节点通过 in 端口（左侧中点）连接
    let newNode;
    if(nodeType === 'text'){
        const w = 316, h = 194;
        const x = isOut ? p.x : p.x - w;
        const y = p.y - h / 2;
        // 节点和连线必须作为同一次画布变更提交，避免创建节点时的
        // 自动渲染/保存先于 connectInputNode() 执行而留下孤立文本节点。
        newNode = createPromptNode(x, y, {skipUndo:true, select:true, deferRender:true, deferSave:true});
    } else if(nodeType === 'loop'){
        const w = 340, h = 168;
        const x = isOut ? p.x : p.x - w;
        const y = p.y - h / 2;
        newNode = createLoopNode(x, y, {skipUndo:true, select:true});
    } else {
        const layout = imageLayout([], mediaNodeDefaultScale({type:'smart-image', images:[]}), {type:'smart-image', images:[]});
        const centerX = isOut ? p.x + layout.width / 2 : p.x - layout.width / 2;
        newNode = createGenerationNodeByKind(nodeType, {x:centerX, y:p.y}, {select:true, skipUndo:true});
    }
    const fromId = drag.fromPort === 'out' ? drag.fromId : newNode.id;
    const toId = drag.fromPort === 'out' ? newNode.id : drag.fromId;
    connectInputNode(fromId, toId);
    render();
    scheduleSave();
}
function disconnectConnection(index){
    if(!canvas || !Array.isArray(canvas.connections)) return;
    const conn = canvas.connections[index];
    if(!conn) return;
    pushUndo();
    canvas.connections.splice(index, 1);
    const toNode = nodes.find(n => n.id === conn.to);
    if(toNode && Array.isArray(toNode.inputNodeIds)){
        toNode.inputNodeIds = toNode.inputNodeIds.filter(id => id !== conn.from);
    }
    if((conn.kind || 'flow') === 'history'){
        const group = nodes.find(n => n.id === conn.to && isHistoryGroupNode(n) && n.historyFor === conn.from);
        demoteHistoryGroupNode(group);
    }
    render();
    scheduleSave();
}
function connectionMidpoint(conn){
    const fromNode = nodes.find(n => n.id === conn?.from);
    const toNode = nodes.find(n => n.id === conn?.to);
    if(!fromNode || !toNode) return null;
    const fr = nodeRect(fromNode), tr = nodeRect(toNode);
    if((conn.kind || 'flow') === 'history'){
        return {x:(fr.x + fr.width / 2 + tr.x + tr.width / 2) / 2, y:(fr.y + fr.height + tr.y) / 2};
    }
    return {x:(fr.x + fr.width + tr.x) / 2, y:(fr.y + fr.height / 2 + tr.y + tr.height / 2) / 2};
}
function insertionConnectionForNode(node){
    if(!node || node.type !== 'smart-loop' || !canvas?.connections?.length) return null;
    const r = nodeRect(node);
    const cx = (Number(r.x) || 0) + (Number(r.width) || 0) / 2;
    const cy = (Number(r.y) || 0) + (Number(r.height) || 0) / 2;
    let best = null;
    (canvas.connections || []).forEach((conn, index) => {
        const kind = conn.kind || 'flow';
        if(!['input','flow'].includes(kind)) return;
        if(conn.from === node.id || conn.to === node.id) return;
        const fromNode = nodes.find(n => n.id === conn.from);
        const toNode = nodes.find(n => n.id === conn.to);
        if(!fromNode || !toNode || isHistoryGroupNode(fromNode) || isHistoryGroupNode(toNode)) return;
        const mid = connectionMidpoint(conn);
        if(!mid) return;
        const score = Math.hypot(cx - mid.x, cy - mid.y);
        if(score > 96) return;
        if(!best || score < best.score) best = {conn, index, score};
    });
    return best;
}
function addConnection(fromId, toId, kind='flow'){
    if(!fromId || !toId || fromId === toId) return;
    canvas.connections = canvas.connections || [];
    if(canvas.connections.some(c => c.from === fromId && c.to === toId && (c.kind || 'flow') === kind)) return;
    canvas.connections.push({from:fromId, to:toId, kind});
}
function nodeHasVideoInputMedia(node){
    if(!node) return false;
    if(String(node.outputKind || '').toLowerCase() === 'video') return true;
    return (node.images || []).some(item => {
        if(String(item?.kind || '').toLowerCase() === 'video') return true;
        return typeof mediaKindForItem === 'function' && mediaKindForItem(item) === 'video';
    });
}
function connectInputNode(fromId, toId){
    const from = nodes.find(n => n.id === fromId);
    const to = nodes.find(n => n.id === toId);
    if(!from || !to || from.id === to.id) return false;
    if(to.genKind === 'image' && nodeHasVideoInputMedia(from)){
        toast('图片生成节点不支持视频输入');
        return false;
    }
    if(to.type === 'smart-loop'){
        // 智能分组按其成员内容识别：含图片则可作图片输入，含提示词/循环则可作提示词输入。
        const groupHasImage = isSmartGroupNode(from) && smartGroupImageRefs(from).length > 0;
        const groupHasPrompt = isSmartGroupNode(from) && smartGroupCompactMembers(from).some(m => m.type === 'smart-prompt' || (m.type === 'smart-loop' && m.showPrompt));
        const looksImage = isSmartImageNode(from) || (from.type === 'smart-loop' && from.imageInput) || groupHasImage;
        const looksPrompt = from.type === 'smart-prompt' || (from.type === 'smart-loop' && from.showPrompt) || groupHasPrompt;
        if(looksImage && !to.imageInput) to.imageInput = true;
        if(looksPrompt && !to.showPrompt) to.showPrompt = true;
        if(looksImage || looksPrompt) fitSmartLoopNode(to);
        const canImage = Boolean(to.imageInput) && looksImage;
        const canPrompt = Boolean(to.showPrompt) && looksPrompt;
        if(!canImage && !canPrompt) return false;
    }
    to.inputNodeIds = Array.from(new Set([...(to.inputNodeIds || []), from.id]));
    addConnection(from.id, to.id, 'input');
    return true;
}
function outgoingConnectionsFor(node, kinds=['input']){
    if(!node) return [];
    const allowed = new Set(kinds);
    return (canvas?.connections || []).filter(conn => conn.from === node.id && allowed.has(conn.kind || 'flow'));
}
function outgoingInputConnectionsFor(node){
    return outgoingConnectionsFor(node, ['input']);
}
