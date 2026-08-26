// comfyui-settings 页面 —— "画布测试"迷你节点图子系统（拆分自 static/js/comfyui-settings.js）。
//
// 范围："画布测试"模式（workspaceMode === 'canvas'）下的迷你交互式
// 节点图——跟 node-graph-editor.js 展示同一份工作流数据，但这里是给
// 用户摆放"提示词卡片"/"媒体卡片"、手动连线来快速试跑工作流，而不是
// 编辑工作流本身的字段配置。默认卡片/测试节点初始化
// （defaultMiniCards/defaultMiniTestNodes）、卡片位置样式计算
// （miniCardStyle）、连线渲染（miniLine/miniLineBetween）、整个迷你
// 画布渲染入口（renderMiniCanvasPreview）、单个迷你字段渲染
// （renderMiniField）、节点增删改（addMiniNode/removeMiniNode/
// updateMiniNode）、节点删除按钮（miniDeleteButton）、迷你画布里选图片
// （pickMiniImage）、迷你画布的拖拽绑定（bindMiniCanvas，节点卡片可以
// 拖拽移动位置）。
//
// 经典 <script>，非 ES module，原因同 comfy-instances.js。
//
// 依赖 main.js 保留的核心状态和函数：currentConfig/miniView/miniCards/
// miniTestNodes/miniDrag（迷你画布的全部可变状态）、fieldKind/
// isMediaField/mediaAccept/mediaUploadText/mediaUploadFailedText/
// mediaPreviewHtml（通用字段类型/媒体展示工具，跨子系统共用）、
// renderWorkspaceView（main.js 保留的工作区视图切换入口，本模块的
// renderMiniCanvasPreview 只负责渲染画布本身，切换逻辑留在 main.js）、
// escapeHtml/escapeAttr/tr/tf（通用工具）。

function defaultMiniCards(){
    return {
        prompt:{ x:24, y:30 },
        image:{ x:24, y:210 },
        custom:{ x:280, y:78 },
        output:{ x:540, y:120 }
    };
}
function defaultMiniTestNodes(){
    return [
        { id:'prompt_1', type:'prompt', x:36, y:96, text:'' },
        { id:'image_1', type:'image', x:36, y:286, url:'', value:'' },
        { id:'comfy_1', type:'comfy', x:330, y:150 },
        { id:'output_1', type:'output', x:670, y:190 }
    ];
}
function miniCardStyle(key){
    const p = miniCards[key] || defaultMiniCards()[key] || {x:0,y:0};
    return `left:${p.x}px;top:${p.y}px`;
}

function miniLine(aKey, bKey){
    const a = miniCards[aKey] || defaultMiniCards()[aKey];
    const b = miniCards[bKey] || defaultMiniCards()[bKey];
    const x1 = a.x + 210, y1 = a.y + 70, x2 = b.x, y2 = b.y + 70;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx*dx + dy*dy);
    const deg = Math.atan2(dy, dx) * 180 / Math.PI;
    return `<div class="mini-line" style="left:${x1}px;top:${y1}px;width:${len}px;transform:rotate(${deg}deg)"></div>`;
}
function renderMiniCanvasPreview(target = previewCard, large = false){
    if(!target) return;
    const promptFields = currentConfig.fields.filter(f => fieldKind(f) === 'prompt');
    const imageFields = currentConfig.fields.filter(f => fieldKind(f) === 'image');
    const videoFields = currentConfig.fields.filter(f => fieldKind(f) === 'video');
    const audioFields = currentConfig.fields.filter(f => fieldKind(f) === 'audio');
    const settingFields = currentConfig.fields.filter(f => fieldKind(f) === 'setting');
    const prompts = miniTestNodes.filter(n => n.type === 'prompt');
    const mediaNodes = miniTestNodes.filter(n => ['image','video','audio'].includes(n.type));
    const comfy = miniTestNodes.find(n => n.type === 'comfy') || defaultMiniTestNodes().find(n => n.type === 'comfy');
    const output = miniTestNodes.find(n => n.type === 'output') || defaultMiniTestNodes().find(n => n.type === 'output');
    const resultHtml = runResult
        ? `<div class="mini-result"><img src="${escapeAttr(runResult)}" onclick="openImagePreview('${escapeAttr(runResult)}')"><div class="run-status">${tr('comfy.runSuccess')}</div></div>`
        : `<div class="preview-empty" style="padding:18px 10px">${tr('comfy.resultHere')}</div>`;
    target.style.display = 'block';
    target.innerHTML = `
        <div id="miniCanvas" class="mini-canvas ${large ? 'large' : ''}">
            <div class="mini-toolbar">
                <button class="mini-tool" type="button" onclick="addMiniNode('prompt')"><i data-lucide="text-cursor-input" class="w-3.5 h-3.5"></i>${tr('comfy.addPrompt')}</button>
                <button class="mini-tool" type="button" onclick="addMiniNode('image')"><i data-lucide="image-plus" class="w-3.5 h-3.5"></i>${tr('comfy.addImage')}</button>
                <button class="mini-tool" type="button" onclick="addMiniNode('video')"><i data-lucide="file-video" class="w-3.5 h-3.5"></i>${typeLabel('video')}</button>
                <button class="mini-tool" type="button" onclick="addMiniNode('audio')"><i data-lucide="file-audio" class="w-3.5 h-3.5"></i>${typeLabel('audio')}</button>
            </div>
            <div id="miniWorld" class="mini-world" style="transform:translate(${miniView.x}px,${miniView.y}px) scale(${miniView.k})">
                ${[...prompts, ...mediaNodes].map(n => miniLineBetween(n, comfy)).join('')}
                ${miniLineBetween(comfy, output)}
                ${prompts.map((n,i) => `
                    <div class="mini-card" data-node="${n.id}" style="left:${n.x}px;top:${n.y}px">
                        <span class="mini-port out"></span>
                        <div class="mini-card-head"><i data-lucide="text-cursor-input" class="w-3.5 h-3.5"></i><span class="mini-node-title">${tr('comfy.promptNode')} ${i+1}</span>${miniDeleteButton(n)}</div>
                        <div class="mini-card-body"><textarea class="mini-textarea" oninput="updateMiniNode('${n.id}','text',this.value)" placeholder="${escapeAttr(tr('comfy.promptPlaceholder'))}">${escapeHtml(n.text || '')}</textarea></div>
                    </div>`).join('')}
                ${mediaNodes.map((n,i) => `
                    <div class="mini-card" data-node="${n.id}" style="left:${n.x}px;top:${n.y}px">
                        <span class="mini-port out"></span>
                        <div class="mini-card-head"><i data-lucide="${n.type === 'video' ? 'file-video' : n.type === 'audio' ? 'file-audio' : 'image'}" class="w-3.5 h-3.5"></i><span class="mini-node-title">${typeLabel(n.type)} ${i+1}</span>${miniDeleteButton(n)}</div>
                        <div class="mini-card-body"><div class="mini-image-drop" onclick="pickMiniImage('${n.id}')">${mediaPreviewHtml(n.type, n.url, n.name || n.value, true)}</div></div>
                    </div>`).join('')}
                <div class="mini-card comfy-card" data-node="${comfy.id}" style="left:${comfy.x}px;top:${comfy.y}px">
                    <span class="mini-port in"></span><span class="mini-port out"></span>
                    <div class="mini-card-head"><i data-lucide="workflow" class="w-3.5 h-3.5"></i><span class="mini-node-title">${escapeHtml(currentConfig.title || selectedName.replace('.json',''))} · ${tr('canvas.comfyCustom')}</span></div>
                    <div class="mini-card-body">
                        <div class="text-[10px] font-black uppercase" style="color:var(--faint)">${tr('comfy.inputs')}</div>
                        <div class="preview-empty" style="padding:10px;font-size:11px;text-align:left">
                            ${mediaFieldLabel('image', imageFields.length)} · ${mediaFieldLabel('video', videoFields.length)} · ${mediaFieldLabel('audio', audioFields.length)} · ${promptFields.length ? tr('comfy.acceptsPrompt') : tr('comfy.noPromptField')}
                        </div>
                        <div class="mini-settings-list">
                            ${settingFields.length ? settingFields.map(f => renderMiniField(f)).join('') : `<div class="preview-empty" style="padding:16px 10px">${tr('comfy.otherParamsHere')}</div>`}
                        </div>
                        <button id="runBtn" class="run-btn mini-run" type="button" onclick="onRun()">
                            <i data-lucide="play" class="w-4 h-4"></i><span>${tr('comfy.runTest')}</span>
                        </button>
                    </div>
                </div>
                <div class="mini-card" data-node="${output.id}" style="left:${output.x}px;top:${output.y}px">
                    <span class="mini-port in"></span>
                    <div class="mini-card-head"><i data-lucide="circle-dot" class="w-3.5 h-3.5"></i><span>${tr('comfy.output')}</span></div>
                    <div class="mini-card-body">${resultHtml}</div>
                </div>
            </div>
        </div>
    `;
    bindMiniCanvas();
    refreshIcons();
}

function renderMiniField(f){
    const label = `<div class="pfield-label">${escapeHtml(f.name || f.input)}</div>`;
    const v = previewValues[f.id] ?? f.default ?? (f.type==='boolean'?false:(f.type==='number'||f.type==='slider'?0:''));
    if(isMediaField(f)){
        const displayUrl = previewImageUrls[f.id] || (typeof v === 'string' && /^(\/|https?:|blob:|data:)/.test(v) ? v : '');
        return `<div class="pfield">${label}<div class="mini-image-drop" onclick="pickImage('${f.id}')">${mediaPreviewHtml(fieldKind(f), displayUrl, v, true)}</div></div>`;
    }
    if(fieldKind(f) === 'prompt'){
        return `<div class="pfield">${label}<textarea class="mini-textarea" oninput="setPreviewValue('${f.id}',this.value)">${escapeHtml(v)}</textarea></div>`;
    }
    if(f.type === 'number'){
        const randomBtn = randomButtonHtml(f);
        return `<div class="pfield">${label}<div class="pfield-random-row" style="${randomBtn ? '' : 'grid-template-columns:1fr'}"><input class="mini-input" type="number" value="${escapeAttr(v)}" oninput="setPreviewValue('${f.id}',parseFloat(this.value)||0)">${randomBtn}</div></div>`;
    }
    if(f.type === 'slider'){
        const min = f.min ?? 0, max = f.max ?? 10, step = f.step ?? 1;
        return `<div class="pfield">${label}<div class="pfield-random-row" style="grid-template-columns:1fr"><div class="pfield-slider">
            <input type="range" min="${min}" max="${max}" step="${step}" value="${escapeAttr(v)}" oninput="setPreviewValue('${f.id}',parseFloat(this.value))">
            <span class="pfield-slider-val" data-slider-val="${f.id}">${v}</span>
        </div></div></div>`;
    }
    if(f.type === 'dropdown'){
        const opts = (f.options || []).map(o => `<option value="${escapeAttr(o)}" ${String(v)===String(o)?'selected':''}>${escapeHtml(o)}</option>`).join('');
        return `<div class="pfield">${label}<select class="pfield-select" onchange="setPreviewValue('${f.id}',this.value)">${opts || `<option value="">${tr('comfy.noOptions')}</option>`}</select></div>`;
    }
    if(f.type === 'boolean'){
        return `<div class="pfield">${label}<div class="pfield-bool"><div class="pfield-bool-track ${v?'on':''}" onclick="setPreviewValue('${f.id}',!${!!v});this.classList.toggle('on')"><div class="pfield-bool-thumb"></div></div></div></div>`;
    }
    return `<div class="pfield">${label}<input class="mini-input" type="text" value="${escapeAttr(v)}" oninput="setPreviewValue('${f.id}',this.value)"></div>`;
}

function miniDeleteButton(node){
    return ['prompt','image'].includes(node.type) ? `<button class="mini-delete" type="button" onclick="removeMiniNode('${node.id}')" title="${escapeAttr(tr('common.delete'))}"><i data-lucide="x" class="w-3 h-3"></i></button>` : '';
}

function miniLineBetween(a, b){
    if(!a || !b) return '';
    const x1 = a.x + 230, y1 = a.y + 72, x2 = b.x, y2 = b.y + 72;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx*dx + dy*dy);
    const deg = Math.atan2(dy, dx) * 180 / Math.PI;
    return `<div class="mini-line" style="left:${x1}px;top:${y1}px;width:${len}px;transform:rotate(${deg}deg)"></div>`;
}

function addMiniNode(type){
    const count = miniTestNodes.filter(n => n.type === type).length;
    miniTestNodes.push({
        id:`${type}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
        type,
        x:42 + count * 26,
        y:type === 'prompt' ? 86 + count * 170 : 286 + count * 170,
        text:'',
        url:'',
        value:''
    });
    renderWorkspaceView();
}

function removeMiniNode(id){
    miniTestNodes = miniTestNodes.filter(n => n.id !== id);
    renderWorkspaceView();
}

function updateMiniNode(id, key, value){
    const node = miniTestNodes.find(n => n.id === id);
    if(node) node[key] = value;
}

async function pickMiniImage(nodeId){
    const input = document.createElement('input');
    input.type = 'file';
    const node = miniTestNodes.find(n => n.id === nodeId);
    input.accept = mediaAccept(node?.type || 'image');
    input.onchange = async () => {
        const file = input.files[0];
        if(!file) return;
        if(!node) return;
        if(node.url && node.url.startsWith('blob:')) URL.revokeObjectURL(node.url);
        node.url = URL.createObjectURL(file);
        node.name = file.name;
        renderWorkspaceView();
        const form = new FormData();
        form.append('files', file);
        try {
            const data = await fetch('/api/upload', { method:'POST', body:form }).then(r=>r.json());
            node.value = data.files?.[0]?.comfy_name || data.files?.[0]?.filename || file.name;
        } catch(e){ alert(mediaUploadFailedText(node.type)); }
    };
    input.click();
}

function bindMiniCanvas(){
    const canvas = document.getElementById('miniCanvas');
    const world = document.getElementById('miniWorld');
    if(!canvas || !world) return;
    const sync = () => { world.style.transform = `translate(${miniView.x}px,${miniView.y}px) scale(${miniView.k})`; };
    canvas.onwheel = e => {
        e.preventDefault();
        const old = miniView.k;
        const next = Math.max(0.45, Math.min(1.8, old * (e.deltaY > 0 ? 0.9 : 1.1)));
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        miniView.x = mx - (mx - miniView.x) * (next / old);
        miniView.y = my - (my - miniView.y) * (next / old);
        miniView.k = next;
        sync();
    };
    canvas.onmousedown = e => {
        if(e.target.closest('textarea,input,select,button,.mini-image-drop')) return;
        const card = e.target.closest('.mini-card');
        if(card && e.target.closest('.mini-card-head')){
            const id = card.dataset.node || card.dataset.card;
            const node = miniTestNodes.find(n => n.id === id);
            const pos = node || miniCards[id] || defaultMiniCards()[id];
            miniDrag = { type:'card', id, sx:e.clientX, sy:e.clientY, ox:pos.x, oy:pos.y };
        } else {
            miniDrag = { type:'pan', sx:e.clientX, sy:e.clientY, ox:miniView.x, oy:miniView.y };
            canvas.classList.add('is-panning');
        }
    };
    window.onmousemove = e => {
        if(!miniDrag) return;
        if(miniDrag.type === 'pan'){
            miniView.x = miniDrag.ox + e.clientX - miniDrag.sx;
            miniView.y = miniDrag.oy + e.clientY - miniDrag.sy;
            sync();
        } else {
            const dx = (e.clientX - miniDrag.sx) / miniView.k;
            const dy = (e.clientY - miniDrag.sy) / miniView.k;
            const node = miniTestNodes.find(n => n.id === miniDrag.id);
            if(node){
                node.x = miniDrag.ox + dx;
                node.y = miniDrag.oy + dy;
            } else {
                miniCards[miniDrag.id] = { x: miniDrag.ox + dx, y: miniDrag.oy + dy };
                currentConfig.mini_cards = miniCards;
            }
            const card = world.querySelector(`[data-node="${miniDrag.id}"],[data-card="${miniDrag.id}"]`);
            if(card){
                const p = node || miniCards[miniDrag.id];
                card.style.left = `${p.x}px`;
                card.style.top = `${p.y}px`;
            }
        }
    };
    window.onmouseup = () => {
        if(miniDrag?.type === 'pan') canvas.classList.remove('is-panning');
        const shouldRefresh = miniDrag?.type === 'card';
        miniDrag = null;
        if(shouldRefresh) renderWorkspaceView();
    };
}
