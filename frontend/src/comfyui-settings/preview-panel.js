// comfyui-settings 页面 —— 实时预览面板子系统（拆分自 static/js/comfyui-settings.js）。
//
// 范围：右侧"预览"面板的整套渲染和交互——每个已暴露字段的输入控件
// 渲染（renderPreviewField，按字段类型渲染文本框/滑块/下拉框/开关/
// 媒体上传按钮）、随机数字段支持（randomValueForField/
// fieldSupportsRandom/isPreviewRandomActive/togglePreviewRandom/
// applyActiveRandomValues/randomButtonHtml——数字类字段可以标记为
// "每次运行随机取值"，这里是随机开关状态和实际取随机值的逻辑）、
// 图片预览放大弹层（openImagePreview/closeImagePreview）、写入某个
// 字段的运行时取值（setPreviewValue）、整个预览面板的渲染入口
// （renderPreview）。
//
// 经典 <script>，非 ES module，原因同 comfy-instances.js。
//
// 依赖 main.js 保留的核心状态和函数：currentConfig/previewValues/
// previewRandomActive/previewImageUrls/runResult（预览面板的全部可变
// 状态）、fieldKind/isMediaField/mediaFieldLabel/mediaAccept/
// mediaUploadText/mediaUploadFailedText/mediaPreviewHtml（通用字段
// 类型/媒体展示工具，跨子系统共用）、pickImage（main.js 保留的媒体
// 文件选择入口，被 renderPreviewField 的上传按钮 onclick 引用）、
// escapeHtml/escapeAttr/tr/tf（通用工具）。

function setPreviewValue(fieldId, value){
    previewValues[fieldId] = value;
    // 更新滑块旁边的数值显示
    const valSpan = document.querySelector(`[data-slider-val="${fieldId}"]`);
    if(valSpan) valSpan.textContent = value;
}
function randomValueForField(f){
    const isFloat = Number(f.step) > 0 && Number(f.step) < 1;
    let min = Number.isFinite(Number(f.min)) ? Number(f.min) : null;
    let max = Number.isFinite(Number(f.max)) ? Number(f.max) : null;
    const name = `${f.input || ''} ${f.name || ''}`.toLowerCase();
    const looksSeed = name.includes('seed') || name.includes('noise') || name.includes('随机') || name.includes('噪');
    if(min === null) min = looksSeed ? 1 : 0;
    if(max === null || max <= min) max = looksSeed ? 1000000000000000 : 999999;
    let value = min + Math.random() * (max - min);
    if(isFloat){
        const precision = Math.min(8, Math.max(1, String(f.step).split('.')[1]?.length || 2));
        value = Number(value.toFixed(precision));
    } else {
        value = Math.floor(value);
    }
    return value;
}

function fieldSupportsRandom(f){
    return !!f && f.type === 'number' && f.random_enabled === true;
}

function isPreviewRandomActive(fieldId){
    return previewRandomActive[fieldId] !== false;
}

function randomButtonHtml(f){
    if(!fieldSupportsRandom(f)) return '';
    const active = isPreviewRandomActive(f.id);
    const title = active ? '随机已开启，点击关闭' : '随机已关闭，点击开启';
    return `<button class="random-btn ${active ? 'active' : ''}" type="button" onclick="togglePreviewRandom('${f.id}')" title="${title}"><i data-lucide="dice-5" class="w-4 h-4"></i></button>`;
}

function togglePreviewRandom(fieldId){
    const f = currentConfig?.fields?.find(x => x.id === fieldId);
    if(!fieldSupportsRandom(f)) return;
    previewRandomActive[fieldId] = !isPreviewRandomActive(fieldId);
    renderPreview();
    if(workspaceMode === 'canvas') renderMiniCanvasPreview(miniCanvasHost, true);
}

function applyActiveRandomValues(fields){
    const out = {...fields};
    currentConfig?.fields?.forEach(f => {
        if(fieldSupportsRandom(f) && isPreviewRandomActive(f.id)){
            const value = randomValueForField(f);
            out[f.id] = value;
            previewValues[f.id] = value;
        }
    });
    return out;
}

function openImagePreview(url){
    const box = document.getElementById('imageLightbox');
    const img = document.getElementById('imageLightboxImg');
    if(!box || !img || !url) return;
    img.src = url;
    box.classList.add('open');
}

function closeImagePreview(){
    const box = document.getElementById('imageLightbox');
    const img = document.getElementById('imageLightboxImg');
    if(box) box.classList.remove('open');
    if(img) img.src = '';
}

function renderPreview(){
    const fields = currentConfig?.fields || [];
    if(!fields.length){
        previewCard.innerHTML = `<div class="preview-empty">${tr('comfy.previewEmpty')}</div>`;
        return;
    }
    const fieldsHtml = fields.map(f => renderPreviewField(f)).join('');
    const resultHtml = runResult
        ? `<div class="run-result"><img src="${escapeAttr(runResult)}" onclick="openImagePreview('${escapeAttr(runResult)}')"><div class="run-status">${tr('comfy.runSuccess')}</div></div>`
        : '';
    const runButton = `<button id="runBtn" class="run-btn" type="button" onclick="onRun()">
            <i data-lucide="play" class="w-4 h-4"></i><span>${tr('comfy.runTest')}</span>
        </button>`;
    previewCard.innerHTML = `
        ${fieldsHtml}
        ${runButton}
        ${resultHtml}
    `;
    refreshIcons();
}

function renderPreviewField(f){
    const label = `<div class="pfield-label">${escapeHtml(f.name || f.input)}</div>`;
    const v = previewValues[f.id] ?? f.default ?? (f.type==='boolean'?false:(f.type==='number'||f.type==='slider'?0:''));
    if(fieldKind(f) === 'prompt'){
        return `<div class="pfield">${label}<textarea class="pfield-textarea" oninput="setPreviewValue('${f.id}',this.value)">${escapeHtml(v)}</textarea></div>`;
    }
    if(f.type === 'number'){
        const randomBtn = randomButtonHtml(f);
        return `<div class="pfield">${label}<div class="pfield-random-row" style="${randomBtn ? '' : 'grid-template-columns:1fr'}"><input class="pfield-input" type="number" value="${escapeAttr(v)}" oninput="setPreviewValue('${f.id}',parseFloat(this.value)||0)">${randomBtn}</div></div>`;
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
    if(isMediaField(f)){
        // 浏览器显示用本地 blob URL；如果没有就尝试用 /output/ 之类的可访问 URL；都没有显示占位文字
        const displayUrl = previewImageUrls[f.id] || (typeof v === 'string' && /^(\/|https?:|blob:|data:)/.test(v) ? v : '');
        return `<div class="pfield">${label}<div class="pfield-image-drop ${displayUrl?'has-image':''}" onclick="pickImage('${f.id}')">
            ${mediaPreviewHtml(fieldKind(f), displayUrl, v)}
        </div></div>`;
    }
    if(f.type === 'boolean'){
        return `<div class="pfield">${label}<div class="pfield-bool">
            <div class="pfield-bool-track ${v?'on':''}" onclick="setPreviewValue('${f.id}',!${!!v});this.classList.toggle('on')">
                <div class="pfield-bool-thumb"></div>
            </div>
        </div></div>`;
    }
    return `<div class="pfield">${label}<input class="pfield-input" type="text" value="${escapeAttr(v)}" oninput="setPreviewValue('${f.id}',this.value)"></div>`;
}
