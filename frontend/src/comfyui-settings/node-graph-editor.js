// comfyui-settings 页面 —— 工作流节点图编辑器子系统（拆分自 static/js/comfyui-settings.js）。
//
// 范围：主编辑区的节点关系图渲染与交互——按依赖关系分层布局
// （computeLayers）、SVG 节点图渲染（renderGraph）、缩放/平移
// （graphZoom/graphFit/applyGraphTransform/updateZoomPill/
// attachPanZoom，鼠标滚轮缩放 + 拖拽平移）、点击节点弹出参数编辑弹层
// （openNodePopup/closeNodePopup）、节点列表侧栏收起展开
// （toggleNodeList）。这是"图编辑模式"（workspaceMode === 'graph'）
// 下的核心可视化组件，跟"画布测试模式"下的 mini-canvas.js 是并列的
// 两种工作区视图。
//
// 经典 <script>，非 ES module，原因同 comfy-instances.js。
//
// 依赖 main.js 保留的核心状态和函数：currentWorkflow/currentConfig
// （当前编辑的工作流数据）、graphView/graphContentSize/panState/
// popupNodeId（图编辑器的可变交互状态）、nodeLabel/nodeSub/nodeIcon/
// inputLabel（节点展示文本，跟随 NODE_INFO/INPUT_LABELS 常量）、
// fieldFor/toggleField/refreshPopupBody（拆分到 field-editor.js 的
// 函数，跨模块调用）、renderPreview/renderWorkspaceView（跨模块回调，
// 弹层里的操作需要触发预览面板刷新）、escapeHtml/escapeAttr/tr/tf/
// setStatus/refreshIcons（通用工具）。

function computeLayers(){
    const ids = Object.keys(currentWorkflow);
    const incoming = {};   // nodeId -> Set of upstream nodeIds
    const outgoing = {};
    ids.forEach(id => { incoming[id] = new Set(); outgoing[id] = new Set(); });
    ids.forEach(id => {
        const inputs = currentWorkflow[id].inputs || {};
        Object.values(inputs).forEach(v => {
            if(Array.isArray(v) && v.length === 2 && typeof v[0] === 'string'){
                if(currentWorkflow[v[0]]){
                    incoming[id].add(v[0]);
                    outgoing[v[0]].add(id);
                }
            }
        });
    });
    const layer = {};
    const visited = new Set();
    function dfs(id, lv){
        if(visited.has(id)) return;
        if((layer[id] || 0) < lv) layer[id] = lv;
        else layer[id] = layer[id] || lv;
        visited.add(id);
        outgoing[id].forEach(child => dfs(child, lv + 1));
    }
    // 从无上游的节点开始
    ids.forEach(id => { if(incoming[id].size === 0) dfs(id, 0); });
    // 处理可能漏掉的环 / 孤立节点
    ids.forEach(id => { if(!(id in layer)) layer[id] = 0; });
    // 按层级分桶
    const buckets = {};
    ids.forEach(id => {
        const lv = layer[id];
        (buckets[lv] = buckets[lv] || []).push(id);
    });
    return { layer, buckets, incoming };
}

function renderGraph(){
    const svg = document.getElementById('graphSvg');
    if(!currentWorkflow || !Object.keys(currentWorkflow).length){
        document.getElementById('graphCard').style.display = 'none';
        return;
    }
    document.getElementById('graphCard').style.display = 'block';
    const { layer, buckets, incoming } = computeLayers();
    const NODE_W = 130, NODE_H = 50, X_GAP = 36, Y_GAP = 14;
    const positions = {};
    const sortedLevels = Object.keys(buckets).map(Number).sort((a,b)=>a-b);
    let maxRows = 0;
    sortedLevels.forEach(lv => {
        const ids = buckets[lv].sort((a,b)=>parseInt(a,10)-parseInt(b,10));
        ids.forEach((id, idx) => {
            positions[id] = { x: lv * (NODE_W + X_GAP) + 16, y: idx * (NODE_H + Y_GAP) + 16 };
        });
        maxRows = Math.max(maxRows, ids.length);
    });
    const totalW = (sortedLevels.length) * (NODE_W + X_GAP) + 16;
    const totalH = maxRows * (NODE_H + Y_GAP) + 16;

    // 连线
    const edgesHtml = [];
    Object.keys(currentWorkflow).forEach(toId => {
        const inputs = currentWorkflow[toId].inputs || {};
        const seen = new Set();
        Object.values(inputs).forEach(v => {
            if(Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && positions[v[0]]){
                if(seen.has(v[0])) return;
                seen.add(v[0]);
                const from = positions[v[0]];
                const to = positions[toId];
                const x1 = from.x + NODE_W, y1 = from.y + NODE_H/2;
                const x2 = to.x, y2 = to.y + NODE_H/2;
                const cx = (x1 + x2) / 2;
                edgesHtml.push(`<path class="gedge" d="M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}"></path>`);
            }
        });
    });

    // 节点
    const nodesHtml = Object.entries(currentWorkflow).map(([id, node]) => {
        const pos = positions[id];
        const label = nodeLabel(node);
        const sub = node.class_type || '';
        const exposedCount = currentConfig.fields.filter(f => f.node === id).length;
        const exposedClass = exposedCount > 0 ? 'has-exposed' : '';
        const cat = NODE_INFO[node.class_type]?.cat || 'misc';
        const icon = nodeIcon(node);
        const truncLabel = label.length > 12 ? label.slice(0,12) + '…' : label;
        const truncSub = sub.length > 16 ? sub.slice(0,16) + '…' : sub;
        return `
            <g class="gnode cat-${cat} ${exposedClass}" data-node-id="${escapeAttr(id)}" transform="translate(${pos.x},${pos.y})" onclick="openNodePopup('${escapeAttr(id)}', this)">
                <rect width="${NODE_W}" height="${NODE_H}" rx="8"></rect>
                <text class="gn-icon" x="10" y="20" font-size="14">${icon}</text>
                <text class="gn-title" x="28" y="20">${escapeHtml(truncLabel)}</text>
                <text class="gn-sub" x="28" y="35">${escapeHtml(truncSub)}</text>
                <text class="gn-sub" x="${NODE_W - 8}" y="20" text-anchor="end">#${escapeHtml(id)}</text>
                ${exposedCount > 0 ? `<text class="gbadge" x="${NODE_W - 8}" y="42" text-anchor="end">${tf('comfy.usedCount', {count:exposedCount})}</text>` : ''}
            </g>
        `;
    }).join('');

    graphContentSize = { w: totalW, h: totalH };
    svg.innerHTML = `<g id="graphViewport" transform="translate(${graphView.x},${graphView.y}) scale(${graphView.k})">${edgesHtml.join('')}${nodesHtml}</g>`;
    // 设置 SVG 自身尺寸（占满容器）
    const wrap = svg.parentElement;
    svg.setAttribute('viewBox', `0 0 ${wrap.clientWidth} ${wrap.clientHeight}`);
    attachPanZoom(svg, wrap);
    updateZoomPill();
}

// 缩放/平移状态
let graphView = { k: 1, x: 0, y: 0 };
let graphContentSize = { w: 0, h: 0 };
let panState = null;

function updateZoomPill(){
    const pill = document.getElementById('zoomPill');
    if(pill) pill.textContent = Math.round(graphView.k * 100) + '%';
}
function applyGraphTransform(){
    const vp = document.getElementById('graphViewport');
    if(vp) vp.setAttribute('transform', `translate(${graphView.x},${graphView.y}) scale(${graphView.k})`);
    updateZoomPill();
}
function graphZoom(dir){
    const factor = dir > 0 ? 1.2 : 1/1.2;
    const newK = Math.max(0.2, Math.min(3, graphView.k * factor));
    // 围绕容器中心缩放
    const wrap = document.querySelector('.graph-svg-wrap');
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    graphView.x = cx - (cx - graphView.x) * (newK / graphView.k);
    graphView.y = cy - (cy - graphView.y) * (newK / graphView.k);
    graphView.k = newK;
    applyGraphTransform();
}
function graphFit(){
    const wrap = document.querySelector('.graph-svg-wrap');
    if(!graphContentSize.w || !wrap) return;
    const pad = 20;
    const kx = (wrap.clientWidth - pad*2) / graphContentSize.w;
    const ky = (wrap.clientHeight - pad*2) / graphContentSize.h;
    const k = Math.max(0.2, Math.min(2, Math.min(kx, ky)));
    graphView.k = k;
    graphView.x = (wrap.clientWidth - graphContentSize.w * k) / 2;
    graphView.y = (wrap.clientHeight - graphContentSize.h * k) / 2;
    applyGraphTransform();
}
function attachPanZoom(svg, wrap){
    if(svg.dataset.panZoomBound) return;
    svg.dataset.panZoomBound = '1';
    // 滚轮缩放（围绕鼠标位置）
    wrap.addEventListener('wheel', e => {
        if(e.target.closest('.popup-panel')) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
        const newK = Math.max(0.2, Math.min(3, graphView.k * factor));
        const rect = wrap.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        graphView.x = mx - (mx - graphView.x) * (newK / graphView.k);
        graphView.y = my - (my - graphView.y) * (newK / graphView.k);
        graphView.k = newK;
        applyGraphTransform();
    }, { passive: false });
    // 鼠标拖动（空白区域）
    svg.addEventListener('mousedown', e => {
        // 只在点击空白处（不是节点 g）才平移
        if(e.target.closest('.gnode')) return;
        e.preventDefault();
        panState = { sx: e.clientX, sy: e.clientY, ox: graphView.x, oy: graphView.y };
        wrap.classList.add('is-panning');
    });
    window.addEventListener('mousemove', e => {
        if(!panState) return;
        graphView.x = panState.ox + (e.clientX - panState.sx);
        graphView.y = panState.oy + (e.clientY - panState.sy);
        applyGraphTransform();
    });
    window.addEventListener('mouseup', () => {
        if(panState){ panState = null; wrap.classList.remove('is-panning'); }
    });
}
let popupNodeId = null;

function openNodePopup(nodeId, gEl){
    popupNodeId = nodeId;
    document.querySelectorAll('.gnode').forEach(g => g.classList.toggle('is-active', g.dataset.nodeId === nodeId));
    const node = currentWorkflow[nodeId];
    if(!node) return;
    const popup = document.getElementById('nodePopup');
    const backdrop = document.getElementById('popupBackdrop');
    const inputs = Object.entries(node.inputs || {}).filter(([k,v]) => {
        return !(Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number');
    });
    const icon = nodeIcon(node);
    const label = nodeLabel(node);
    const sub = nodeSub(node);
    popup.innerHTML = `
        <div class="popup-head">
            <span class="popup-icon">${icon}</span>
            <div style="min-width:0;flex:1">
                <div class="popup-title">${escapeHtml(label)}</div>
                <div class="popup-sub">${escapeHtml(sub)} · #${escapeHtml(nodeId)}</div>
            </div>
            <div class="popup-close" onclick="closeNodePopup()"><i data-lucide="x" class="w-4 h-4"></i></div>
        </div>
        <div class="popup-body">
            ${inputs.length === 0
                ? `<div class="popup-empty">${tr('comfy.noConfigFields')}</div>`
                : inputs.map(([key, value]) => renderInputRow(nodeId, key, value)).join('')}
        </div>
    `;
    // 定位：尽量贴在节点右侧；若超出则放左侧；若上下放不下则居中
    const wrap = document.querySelector('.graph-svg-wrap');
    const wrapRect = wrap.getBoundingClientRect();
    const gRect = gEl.getBoundingClientRect();
    const POP_W = 380;
    const POP_H_MAX = Math.min(wrap.clientHeight - 40, window.innerHeight * 0.7);
    backdrop.style.display = 'block';
    popup.style.display = 'flex';
    popup.style.maxHeight = POP_H_MAX + 'px';
    // 相对 wrap 的坐标（含滚动）
    let left = gRect.right - wrapRect.left + wrap.scrollLeft + 12;
    // 不够位置就放左侧
    if(left + POP_W > wrap.scrollLeft + wrap.clientWidth - 8){
        left = gRect.left - wrapRect.left + wrap.scrollLeft - POP_W - 12;
    }
    if(left < wrap.scrollLeft + 8) left = wrap.scrollLeft + 8;
    let top = gRect.top - wrapRect.top + wrap.scrollTop;
    // 防止溢出底部
    const maxTop = wrap.scrollTop + wrap.clientHeight - POP_H_MAX - 8;
    if(top > maxTop) top = Math.max(wrap.scrollTop + 8, maxTop);
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.onwheel = e => e.stopPropagation();
    popup.querySelector('.popup-body')?.addEventListener('wheel', e => e.stopPropagation(), { passive:true });
    refreshIcons();
}

function closeNodePopup(){
    popupNodeId = null;
    document.querySelectorAll('.gnode').forEach(g => g.classList.remove('is-active'));
    document.getElementById('nodePopup').style.display = 'none';
    document.getElementById('popupBackdrop').style.display = 'none';
}

function toggleNodeList(){
    const list = document.getElementById('nodeList');
    const txt = document.getElementById('nodesToggleText');
    const hidden = list.classList.toggle('hidden');
    txt.textContent = hidden ? tr('comfy.showNodeList') : tr('comfy.hideNodeList');
}
