// comfyui-settings 页面 —— 工作流字段配置编辑子系统（拆分自 static/js/comfyui-settings.js）。
//
// 范围：把工作流 JSON 里的某个节点输入"暴露"成一个可配置字段
// （toggleField，暴露后用户可以在预览面板里直接改这个值而不用改
// workflow JSON）、字段的类型/标签/取值范围等属性编辑
// （updateField/guessType，猜测字段的合理默认类型）、节点弹层里显示
// 的输入行渲染（renderInputRow）、字段的"额外设置"面板渲染
// （renderExtras，滑块范围/下拉选项等跟字段类型相关的额外配置）、
// 下拉框选项的增删改（addDropdownOption/updateDropdownOption/
// removeDropdownOption）、字段 id 生成规则（makeFieldId/fieldFor）、
// 弹层内容刷新（refreshPopupBody，跟 node-graph-editor.js 的
// openNodePopup 配合使用）。
//
// 经典 <script>，非 ES module，原因同 comfy-instances.js。
//
// 依赖 main.js 保留的核心状态和函数：currentConfig（字段配置数组
// currentConfig.fields 就是本模块主要操作的数据）、popupNodeId（当前
// 弹层对应的节点 id）、fieldKind/isMediaField/mediaFieldLabel（通用
// 字段类型判断工具，跨子系统共用）、renderPreview/renderWorkspaceView
// （字段配置变化后需要触发预览面板/工作区重新渲染）、escapeHtml/
// escapeAttr/tr/tf（通用工具）。

function fieldFor(node, input){
    return currentConfig.fields.find(f => f.node === node && f.input === input);
}
function makeFieldId(){ return 'f_' + Math.random().toString(36).slice(2,9); }

function toggleField(node, input){
    const existing = fieldFor(node, input);
    if(existing){
        currentConfig.fields = currentConfig.fields.filter(f => f !== existing);
        delete previewValues[existing.id];
        delete previewRandomActive[existing.id];
    } else {
        const nodeData = currentWorkflow[node];
        const rawValue = nodeData?.inputs?.[input];
        const type = guessType(rawValue, input);
        const f = {
            id: makeFieldId(),
            node, input,
            name: inputLabel(input),
            type,
            default: typeof rawValue === 'object' ? null : rawValue,
            options: [],
        };
        if(type === 'slider' || type === 'number') {
            if(typeof rawValue === 'number'){
                f.min = 0;
                f.max = Math.max(rawValue * 2, 10);
                f.step = rawValue > 0 && rawValue < 5 ? 0.1 : 1;
            }
            if(type === 'number') f.random_enabled = false;
        }
        currentConfig.fields.push(f);
        if(f.default !== undefined && f.default !== null) previewValues[f.id] = f.default;
    }
    renderEditor();
    renderPreview();
    // 浮窗打开时同步刷新浮窗内容
    if(popupNodeId === node) refreshPopupBody();
}

function refreshPopupBody(){
    if(!popupNodeId) return;
    const node = currentWorkflow[popupNodeId];
    if(!node) return;
    const popup = document.getElementById('nodePopup');
    const body = popup.querySelector('.popup-body');
    if(!body) return;
    const inputs = Object.entries(node.inputs || {}).filter(([k,v]) => {
        return !(Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number');
    });
    body.innerHTML = inputs.length === 0
        ? `<div class="popup-empty">${tr('comfy.noConfigFields')}</div>`
        : inputs.map(([key, value]) => renderInputRow(popupNodeId, key, value)).join('');
    refreshIcons();
}

function guessType(value, inputName){
    const lc = (inputName||'').toLowerCase();
    if(typeof value === 'boolean') return 'boolean';
    if(typeof value === 'number'){
        if(/strength|cfg|denoise/.test(lc)) return 'slider';
        return 'number';
    }
    if(typeof value === 'string'){
        if(/prompt|text|description/.test(lc) || (value && value.length > 60)) return 'textarea';
        if(/video|movie|mp4|webm|mov|m4v|vhs/.test(lc) || /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$)/i.test(value)) return 'video';
        if(/audio|sound|music|voice|wav|mp3/.test(lc) || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(value)) return 'audio';
        if(/image|img|mask|filename|file/.test(lc) || /\.(png|jpe?g|webp|gif|bmp|tiff?)(\?|$)/i.test(value)) return 'image';
        return 'text';
    }
    return 'text';
}

function updateField(fieldId, key, value){
    const f = currentConfig.fields.find(x => x.id === fieldId);
    if(!f) return;
    f[key] = value;
    if(key === 'type'){
        previewValues[fieldId] = (value === 'boolean') ? false : (value === 'number' || value === 'slider' ? 0 : '');
        f.random_enabled = value === 'number' ? !!f.random_enabled : false;
        delete previewRandomActive[fieldId];
    }
    if(key === 'random_enabled'){
        delete previewRandomActive[fieldId];
    }
    // 改名字 / 类型时不需要整页重渲染，浮窗自身刷新即可
    if(key === 'name' || key === 'min' || key === 'max' || key === 'step' || key === 'default' || key === 'options' || key === 'random_enabled'){
        renderPreview();
        if(workspaceMode === 'canvas') renderMiniCanvasPreview(miniCanvasHost, true);
        if(popupNodeId === f.node) refreshPopupBody();
        return;
    }
    renderEditor();
    renderPreview();
    if(popupNodeId === f.node) refreshPopupBody();
}
function renderInputRow(nodeId, inputKey, rawValue){
    const f = fieldFor(nodeId, inputKey);
    const active = !!f;
    const showExtras = active && (f.type === 'slider' || f.type === 'number' || f.type === 'dropdown');
    // 原始值类型徽章
    let valueBadge = '';
    const typeOf = typeof rawValue;
    if(typeOf === 'string'){
        const preview = rawValue.length > 50 ? rawValue.slice(0,50) + '…' : rawValue;
        valueBadge = `<span style="color:var(--muted);font-size:10.5px;font-weight:700">"</span><span style="color:var(--text);font-size:11px;font-weight:700">${escapeHtml(preview)}</span><span style="color:var(--muted);font-size:10.5px;font-weight:700">"</span>`;
    } else if(typeOf === 'number'){
        valueBadge = `<span style="color:#0369a1;font-size:11px;font-weight:800;font-variant-numeric:tabular-nums">${rawValue}</span>`;
    } else if(typeOf === 'boolean'){
        valueBadge = `<span style="color:${rawValue?'#15803d':'#b45309'};font-size:11px;font-weight:800">${rawValue?'✓ true':'✗ false'}</span>`;
    } else {
        valueBadge = `<span style="color:var(--faint);font-size:11px">${escapeHtml(String(rawValue))}</span>`;
    }
    const friendlyName = inputLabel(inputKey);
    const showOriginal = friendlyName !== inputKey;
    return `
        <div class="input-row ${active?'is-active':''} ${showExtras?'has-extras':''}">
            <div class="check-toggle ${active?'checked':''}" onclick="toggleField('${escapeAttr(nodeId)}','${escapeAttr(inputKey)}')">
                ${active ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}
            </div>
            <div class="input-info">
                <div class="input-key">${escapeHtml(friendlyName)}${showOriginal ? ` <span style="font-size:10px;font-weight:600;color:var(--faint);margin-left:4px">${escapeHtml(inputKey)}</span>` : ''}</div>
                <div class="input-orig">${tr('comfy.defaultValue')}${valueBadge}</div>
            </div>
            <input class="small-input" type="text" placeholder="${tr('comfy.displayName')}" value="${active?escapeAttr(f.name):escapeAttr(friendlyName)}" ${active?'':'disabled'} oninput="updateField('${active?f.id:''}','name',this.value)">
            <select class="small-select" ${active?'':'disabled'} onchange="updateField('${active?f.id:''}','type',this.value)">
                ${TYPES.map(t=>`<option value="${t.v}" ${active && f.type===t.v?'selected':''}>${typeLabel(t.v)}</option>`).join('')}
            </select>
            ${active ? renderExtras(f) : ''}
        </div>
    `;
}

function renderExtras(f){
    if(f.type === 'slider' || f.type === 'number'){
        const randomToggle = f.type === 'number'
            ? `<label class="random-toggle" onclick="event.stopPropagation()"><input type="checkbox" ${f.random_enabled === true ? 'checked' : ''} onchange="updateField('${f.id}','random_enabled',this.checked)">随机数</label>`
            : '';
        return `<div class="extras-row">
            <div class="extra-pair">min<input class="small-input" type="number" value="${f.min ?? ''}" oninput="updateField('${f.id}','min',this.value===''?null:parseFloat(this.value))"></div>
            <div class="extra-pair">max<input class="small-input" type="number" value="${f.max ?? ''}" oninput="updateField('${f.id}','max',this.value===''?null:parseFloat(this.value))"></div>
            <div class="extra-pair">step<input class="small-input" type="number" value="${f.step ?? ''}" oninput="updateField('${f.id}','step',this.value===''?null:parseFloat(this.value))"></div>
            <div class="extra-pair">${tr('comfy.defaultValue')}<input class="small-input" type="number" value="${f.default ?? ''}" oninput="updateField('${f.id}','default',this.value===''?null:parseFloat(this.value))"></div>
            ${randomToggle}
        </div>`;
    }
    if(f.type === 'dropdown'){
        const opts = f.options || [];
        const fid = escapeAttr(f.id);
        const rows = opts.map((o, i) => {
            const looksNumber = String(o).trim() !== '' && !isNaN(Number(o));
            const tag = looksNumber
                ? '<span class="opt-type-tag is-num">数字</span>'
                : '<span class="opt-type-tag">文本</span>';
            return `
                <div class="dropdown-opt-row">
                    <span class="opt-index">${i + 1}</span>
                    <input class="small-input" type="text" placeholder="选项 ${i + 1}" value="${escapeAttr(o)}"
                        onmousedown="event.stopPropagation()" onclick="event.stopPropagation()"
                        oninput="updateDropdownOption('${fid}', ${i}, this.value, this)">
                    ${tag}
                    <button class="opt-del" type="button" onclick="event.stopPropagation();removeDropdownOption('${fid}', ${i})" title="删除"><i data-lucide="x" class="w-3 h-3"></i></button>
                </div>
            `;
        }).join('');
        return `<div class="extras-row" style="flex-direction:column;align-items:stretch;gap:6px">
            <div style="font-size:11px;color:var(--muted);font-weight:700">
                下拉选项 <span style="color:var(--faint)">· 数字形式自动作为数值传给 ComfyUI</span>
            </div>
            ${rows}
            <button class="ghost-btn" type="button" onclick="event.stopPropagation();addDropdownOption('${fid}')" style="height:34px;padding:0 16px;font-size:12px;font-weight:800;align-self:flex-start;gap:6px"><i data-lucide="plus" class="w-3.5 h-3.5"></i><span>添加选项</span></button>
        </div>`;
    }
    return '';
}
function updateDropdownOption(fieldId, index, value, inputEl){
    const f = currentConfig.fields.find(x => x.id === fieldId); if(!f) return;
    f.options = f.options || [];
    f.options[index] = value;
    // 不重渲浮窗，只更新当前行右侧「数字/文本」标签
    if(inputEl){
        const tag = inputEl.parentElement?.querySelector('.opt-type-tag');
        if(tag){
            const looksNumber = String(value).trim() !== '' && !isNaN(Number(value));
            tag.classList.toggle('is-num', looksNumber);
            tag.textContent = looksNumber ? '数字' : '文本';
        }
    }
    renderPreview();  // 右侧预览的下拉选项实时同步
}
function addDropdownOption(fieldId){
    const f = currentConfig.fields.find(x => x.id === fieldId); if(!f) return;
    f.options = [...(f.options || []), ''];
    renderPreview();
    if(popupNodeId === f.node) refreshPopupBody();
}
function removeDropdownOption(fieldId, index){
    const f = currentConfig.fields.find(x => x.id === fieldId); if(!f) return;
    f.options = (f.options || []).filter((_, i) => i !== index);
    renderPreview();
    if(popupNodeId === f.node) refreshPopupBody();
}
