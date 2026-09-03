// 从 frontend/src/canvas/main.js 剪切出的循环节点（smart-loop）专属逻辑（M2 拆分批次）。
// 剪切时未改动任何函数签名/内部逻辑，只做了纯粹的位置搬移。
//
// 为什么这里不用 ES module 的 export/import（跟 M1 的 utils.js 同一个原因）：
//   canvas.js 依赖经典 <script> 的全局作用域语义（顶层声明自动挂到
//   window），static/canvas.html 里 57 处内联 onclick="xxx()" 都依赖
//   这一点。这里的函数里也有对 nodes/selectedId 等全局状态的直接读取和
//   重新赋值（例如 createLoopNode 里的 `selectedId = node.id`），这些赋值
//   要维持原有语义，必须让 loop-node.js 和 canvas.js 共享同一个
//   全局作用域（经典脚本），而不能用 ES module 的具名 import（那是只读
//   绑定，重新赋值会直接报运行时错误——这也是 state.js 至今没有拆分出来
//   的原因，见 frontend/README.md）。
//
//   所以这一步同样只做"物理文件拆分"：loop-node.js 保持经典脚本语法，
//   通过 <script src="loop-node.js"> 排在 main.js 之前加载，main.js 里
//   剩余代码对这些函数的调用方式完全不变。
//
// 依赖的外部全局（都还留在 frontend/src/canvas/main.js / main.js 里，
// 通过共享全局作用域访问，未随本文件迁移）：
//   状态变量：nodes, selectedId, canvas, smartLoopContext
//   工具函数（M1 已拆到 utils.js，同样是经典脚本挂全局）：
//     tr, trf, uid, escapeHtml
//   节点/连线/布局相关：pushUndo, render, scheduleSave, addConnection,
//     connectInputNode, nodeRect, imageLayout, cloneSmartNode,
//     stripImageGenerationMeta, mediaKindForUrls, isVideoMediaItem,
//     inputNodesFor, imagesForNode, smartGroupCompactMembers,
//     smartNodeInputThumbsHtml, bindScrollableText, splitSmartPromptItems
//   级联运行相关：smartCascadeRunForLoop, smartCascadeIsLoopRunning,
//     smartCascadeStopText, requestSmartCascadeStop, runSmartCascadeFromLoop,
//     refsForDirectLoopRound（这几个属于级联调度/run-state 范畴，留在
//     main.js，未来拆 cascade-run.js 时再处理）
//   常量：MEDIA_NODE_DEFAULT_SCALE, MEDIA_GROUP_DEFAULT_SCALE
//
// 反过来，main.js 里仍保留的以下函数会调用本文件里的循环节点函数
// （通过共享全局作用域，未做任何改动）：
//   outputImagesForNode / selfReferenceImagesForNode / textForNode /
//   promptInputNodesFor / inputPromptTextFor —— 这几个是处理
//   smart-prompt/smart-group/smart-loop 三种节点类型的通用抽象函数，
//   不是循环节点专属逻辑，所以没有跟着搬过来。
//   runClonedLoopChain / showDirectLoopRoundPreview / directLoopRunTargets /
//   isDirectLoopTargetRun / finishLoopTargetPreviewState —— 这几个深度
//   耦合级联执行的 runState/runPath 调度逻辑，属于未来 cascade-run.js
//   的范畴，本次不动。

function smartLoopCount(node){
    // 次数不再手动设置：有图片输入时按"输入素材总数 / 批次大小"（向上取整）自动计算；
    // 纯提示词循环（没有图片输入）则按变量提示词字段数量自动计算。
    if(node?.imageInput){
        const total = smartLoopTotalInputImages(node).length;
        const batchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
        if(total > 0) return Math.max(1, Math.min(100, Math.ceil(total / batchSize)));
        return 1;
    }
    if(node?.showPrompt){
        const fieldCount = smartLoopActivePromptFieldValues(node).length;
        if(fieldCount > 0) return Math.max(1, Math.min(100, fieldCount));
    }
    return Math.max(1, Math.min(100, Number(node?.count || 1) || 1));
}
function smartLoopWidth(node){
    return 340;
}
function smartLoopHeight(node){
    let h = 168;
    if(node?.imageInput) h += 72;
    if(node?.showPrompt) {
        const promptCount = Math.max(1, smartLoopPromptFieldValues(node).length);
        h += 94 + promptCount * 58 + smartLoopUpstreamPromptPreviewHeight(node);
    }
    h += smartNodeInputThumbsHeight(smartLoopPreviewImages(node));
    return h;
}
function fitSmartLoopNode(node){
    if(!node || node.type !== 'smart-loop') return;
    node.w = smartLoopWidth(node);
    node.h = smartLoopHeight(node);
}
function createLoopNode(x, y, options={}){
    if(!options.skipUndo) pushUndo();
    const node = {id:uid('loop'), type:'smart-loop', x, y, w:340, h:168, title:'Loop', count:1, mode:'serial', showPrompt:false, imageInput:false, loopStart:1, imageBatchSize:1, variablePrompt:'', created_at:Date.now()};
    nodes.push(node);
    if(options.select !== false) selectedId = node.id;
    render();
    scheduleSave();
    return node;
}
function loopNumberControlHtml({label, value, key, min=1, max=100, quick=[1,2,3,4,5,6,8,10]}){
    const v = Math.max(min, Math.min(max, Number(value) || min));
    return `<div class="loop-number-control">
        <button class="loop-smart-control loop-number-trigger" type="button"><span>${escapeHtml(label)}</span><strong>${v}</strong></button>
        <div class="loop-number-popover">
            <div class="loop-number-grid">
                ${quick.map(n => `<button type="button" class="loop-smart-control loop-number-cell ${n === v ? 'active' : ''}" data-loop-number="${escapeHtml(key)}" data-loop-value="${n}">${n}</button>`).join('')}
            </div>
            <label class="loop-number-custom">
                <span>${escapeHtml(tr('common.custom'))}</span>
                <input class="loop-smart-control loop-number-input" type="number" min="${min}" max="${max}" step="1" data-loop-number-input="${escapeHtml(key)}" value="${v}">
            </label>
        </div>
    </div>`;
}
function smartLoopTokenLabel(token){
    if(token === '《计数》' || token === '[计数]') return tr('canvas.counterToken');
    return token;
}
function smartLoopTokenChipHtml(token){
    return `<span class="loop-smart-token-chip" contenteditable="false" data-token="${escapeHtml(token)}"><span>${escapeHtml(smartLoopTokenLabel(token))}</span><button type="button" aria-label="${escapeHtml(tr('common.delete'))}" title="${escapeHtml(tr('common.delete'))}">×</button></span>`;
}
function smartLoopVariableHtml(text){
    return String(text || '').split(/(《计数》|\[计数\])/g).map(part => {
        if(part === '《计数》' || part === '[计数]') return smartLoopTokenChipHtml('《计数》');
        return escapeHtml(part);
    }).join('');
}
function smartLoopEditorText(editor){
    const walk = node => {
        if(node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
        if(node.nodeType !== Node.ELEMENT_NODE) return '';
        if(node.classList?.contains('loop-smart-token-chip')) return node.dataset.token || '';
        if(node.tagName === 'BR') return '\n';
        return [...node.childNodes].map(walk).join('');
    };
    return [...(editor?.childNodes || [])].map(walk).join('').replace(/\u00a0/g, ' ');
}
function insertSmartLoopToken(editor, token){
    if(!editor) return;
    editor.focus();
    const chipWrap = document.createElement('span');
    chipWrap.innerHTML = smartLoopTokenChipHtml(token);
    const chip = chipWrap.firstElementChild;
    const spacer = document.createTextNode(' ');
    const sel = window.getSelection();
    if(sel && sel.rangeCount && editor.contains(sel.anchorNode)){
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(spacer);
        range.insertNode(chip);
        range.setStartAfter(spacer);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        editor.appendChild(chip);
        editor.appendChild(spacer);
    }
}
function smartLoopBodyHtml(node){
    node.mode = node.mode === 'parallel' ? 'parallel' : 'serial';
    node.loopStart = 1;
    node.imageBatchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
    node.showPrompt = Boolean(node.showPrompt);
    node.imageInput = Boolean(node.imageInput);
    node.count = smartLoopCount(node);
    const imageCount = smartLoopInputImages(node, {index:node.loopStart}).length;
    const loopThumbs = smartNodeInputThumbsHtml(smartLoopPreviewImages(node));
    const promptItems = smartLoopInputPromptItems(node);
    const promptFields = smartLoopPromptFieldValues(node);
    const visiblePromptFields = promptFields.length ? promptFields : [''];
    const promptHint = promptItems.length
        ? trf('smart.loopPromptHintFound', {n:promptItems.length})
        : tr('smart.loopPromptHintVariable');
    const currentUpstreamPrompt = smartLoopSelectedInputPrompt(node, {index:node.loopStart});
    const defaultPrompt = tr('smart.loopDefaultPrompt') || '现在生成第《计数》张卖点图片';
    const loopRunState = smartCascadeRunForLoop(node.id);
    const loopRunning = Boolean(loopRunState);
    const loopStopping = Boolean(loopRunState?.stopRequested);
    return `<div class="loop-smart-card ${node.imageInput ? 'has-image' : ''} ${node.showPrompt ? 'has-prompt' : ''}">
        <div class="loop-smart-row loop-smart-top">
            <div class="loop-smart-seg">
                <button type="button" class="loop-smart-control ${node.mode !== 'parallel' ? 'active' : ''}" data-loop-mode="serial">${escapeHtml(tr('canvas.loopSerial'))}</button>
                <button type="button" class="loop-smart-control ${node.mode === 'parallel' ? 'active' : ''}" data-loop-mode="parallel" title="${escapeHtml(tr('smart.loopParallelTip'))}">${escapeHtml(tr('canvas.loopParallel'))}</button>
            </div>
        </div>
        <div class="loop-smart-row">
            <button class="loop-smart-control loop-smart-toggle ${node.imageInput ? 'active' : ''}" type="button" data-loop-toggle="image"><i data-lucide="image"></i><span>${escapeHtml(tr('canvas.loopImageToggle'))}</span></button>
            <button class="loop-smart-control loop-smart-toggle ${node.showPrompt ? 'active' : ''}" type="button" data-loop-toggle="prompt"><i data-lucide="text-cursor-input"></i><span>${escapeHtml(tr('canvas.loopPromptToggle'))}</span></button>
        </div>
        ${node.imageInput ? `<div class="loop-smart-panel">
            ${loopThumbs}
            <div class="loop-smart-mini">
                ${loopNumberControlHtml({label:tr('canvas.loopBatchSize'), value:node.imageBatchSize, key:'imageBatchSize', max:100, quick:[1,2,3,4,5,6,8,10]})}
            </div>
            <div class="loop-smart-note">${imageCount ? escapeHtml(trf('canvas.loopImageWillOutput', {n:imageCount})) : escapeHtml(tr('canvas.loopImageEmpty'))}</div>
        </div>` : ''}
        ${node.showPrompt ? `<div class="loop-smart-panel prompt-panel">
            ${currentUpstreamPrompt ? `<div class="loop-smart-upstream">
                <div class="loop-smart-upstream-label">${escapeHtml(promptHint)}</div>
                <div class="loop-smart-upstream-text">${escapeHtml(currentUpstreamPrompt)}</div>
            </div>` : ''}
            <div class="loop-smart-prompt-list">
                ${visiblePromptFields.map((value, index) => `<div class="loop-smart-prompt-item">
                    <div class="loop-smart-prompt-index">${index + 1}</div>
                    <div class="loop-smart-control loop-smart-text" contenteditable="true" data-loop-prompt-index="${index}" data-placeholder="${escapeHtml(tr('canvas.loopVariablePlaceholder'))}">${smartLoopVariableHtml(value || (index === 0 && !promptFields.length ? defaultPrompt : ''))}</div>
                    <button class="loop-smart-control loop-smart-icon-btn" type="button" data-loop-prompt-delete="${index}" ${visiblePromptFields.length <= 1 ? 'disabled' : ''} title="${escapeHtml(tr('common.delete'))}" aria-label="${escapeHtml(tr('common.delete'))}">×</button>
                </div>`).join('')}
            </div>
            <div class="loop-smart-row loop-smart-prompt-actions">
                <button class="loop-smart-control loop-smart-token loop-smart-counter-token" type="button" data-loop-token="《计数》">${escapeHtml(tr('canvas.counterToken'))}</button>
                <span class="loop-smart-note">${escapeHtml(promptHint)}</span>
                <button class="loop-smart-control loop-smart-add-prompt" type="button" data-loop-prompt-add="1" title="新增" aria-label="新增"><i data-lucide="plus"></i></button>
            </div>
        </div>` : ''}
        <div class="loop-smart-footer">
            <div class="loop-smart-count-hint">${escapeHtml(trf('canvas.loopCountAuto', {n:node.count}))}</div>
            <button class="loop-smart-control loop-smart-run ${loopRunning ? 'is-stop' : ''}" type="button" data-loop-run="${escapeHtml(node.id)}" ${loopStopping ? 'disabled' : ''}><i data-lucide="${loopRunning ? 'square' : 'workflow'}"></i><span>${escapeHtml(loopRunning ? smartCascadeStopText(loopStopping) : tr('smart.loopRunAll'))}</span></button>
        </div>
    </div>`;
}
function bindLoopNodeControls(el, node){
    el.querySelectorAll('.loop-smart-control').forEach(control => {
        control.addEventListener('mousedown', e => e.stopPropagation());
        control.addEventListener('click', e => e.stopPropagation());
        control.addEventListener('dblclick', e => e.stopPropagation());
    });
    const loopNumberBounds = () => ({min:1, max:100});
    const normalizeLoopNumber = (key, rawValue) => {
        const bounds = loopNumberBounds(key);
        return Math.max(bounds.min, Math.min(bounds.max, Number(rawValue) || bounds.min));
    };
    const syncLoopNumberUi = (source, key, value) => {
        const control = source?.closest?.('.loop-number-control');
        if(!control) return;
        const display = control.querySelector('.loop-number-trigger strong');
        if(display) display.textContent = value;
        control.querySelectorAll('[data-loop-value]').forEach(cell => {
            cell.classList.toggle('active', Number(cell.dataset.loopValue) === value);
        });
    };
    const setLoopNumber = (key, rawValue, rerender=true, source=null) => {
        const value = normalizeLoopNumber(key, rawValue);
        if(key === 'imageBatchSize') node.imageBatchSize = value;
        scheduleSave();
        if(rerender) render();
        else syncLoopNumberUi(source, key, value);
    };
    el.querySelectorAll('[data-loop-number]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            setLoopNumber(btn.dataset.loopNumber, btn.dataset.loopValue, true);
        };
    });
    el.querySelectorAll('[data-loop-number-input]').forEach(input => {
        input.oninput = e => {
            e.stopPropagation();
            setLoopNumber(input.dataset.loopNumberInput, input.value, false, input);
        };
        input.onchange = e => {
            e.stopPropagation();
            setLoopNumber(input.dataset.loopNumberInput, input.value, true);
        };
    });
    el.querySelectorAll('[data-loop-mode]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            node.mode = btn.dataset.loopMode === 'parallel' ? 'parallel' : 'serial';
            render();
            scheduleSave();
        };
    });
    el.querySelectorAll('[data-loop-toggle]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            if(btn.dataset.loopToggle === 'image') node.imageInput = !node.imageInput;
            if(btn.dataset.loopToggle === 'prompt') {
                node.showPrompt = !node.showPrompt;
                if(node.showPrompt && !smartLoopActivePromptFieldValues(node).length) setSmartLoopPromptFieldValues(node, [tr('smart.loopDefaultPrompt') || '现在生成第《计数》张卖点图片']);
            }
            fitSmartLoopNode(node);
            render();
            scheduleSave();
        };
    });
    const syncPromptFieldsFromDom = () => {
        const values = [...el.querySelectorAll('[data-loop-prompt-index]')]
            .sort((a, b) => Number(a.dataset.loopPromptIndex) - Number(b.dataset.loopPromptIndex))
            .map(input => smartLoopEditorText(input));
        setSmartLoopPromptFieldValues(node, values);
    };
    let activePromptEditor = null;
    el.querySelectorAll('.loop-smart-text').forEach(text => {
        bindScrollableText(text);
        text.onfocus = () => { activePromptEditor = text; };
        text.oninput = () => { syncPromptFieldsFromDom(); scheduleSave(); };
        text.addEventListener('click', e => {
            const remove = e.target.closest?.('.loop-smart-token-chip button');
            if(!remove) return;
            e.preventDefault();
            e.stopPropagation();
            remove.closest('.loop-smart-token-chip')?.remove();
            syncPromptFieldsFromDom();
            scheduleSave();
        });
    });
    el.querySelectorAll('[data-loop-prompt-add]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            syncPromptFieldsFromDom();
            const values = smartLoopPromptFieldValues(node);
            setSmartLoopPromptFieldValues(node, [...values, '']);
            fitSmartLoopNode(node);
            render();
            scheduleSave();
        };
    });
    el.querySelectorAll('[data-loop-prompt-delete]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            syncPromptFieldsFromDom();
            const removeIndex = Number(btn.dataset.loopPromptDelete);
            const values = smartLoopPromptFieldValues(node);
            if(values.length <= 1) return;
            values.splice(removeIndex, 1);
            setSmartLoopPromptFieldValues(node, values);
            fitSmartLoopNode(node);
            render();
            scheduleSave();
        };
    });
    const firstText = el.querySelector('.loop-smart-text');
    const targetPromptEditor = () => activePromptEditor && el.contains(activePromptEditor) ? activePromptEditor : firstText;
    el.querySelectorAll('[data-loop-token]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const text = targetPromptEditor();
            if(!text) return;
            const token = btn.dataset.loopToken || '《计数》';
            insertSmartLoopToken(text, token);
            syncPromptFieldsFromDom();
            scheduleSave();
        };
    });
    el.querySelectorAll('[data-loop-run]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const loopId = btn.dataset.loopRun || node.id;
            if(smartCascadeIsLoopRunning(loopId)){
                requestSmartCascadeStop(loopId);
                return;
            }
            runSmartCascadeFromLoop(loopId);
        };
    });
}
function insertLoopNodeIntoConnection(loopNode, hit){
    if(!loopNode || loopNode.type !== 'smart-loop' || !hit?.conn) return false;
    const conn = hit.conn;
    const kind = conn.kind || 'flow';
    canvas.connections = (canvas.connections || []).filter((c, index) => index !== hit.index);
    nodes.forEach(n => {
        if(Array.isArray(n.inputNodeIds)) n.inputNodeIds = n.inputNodeIds.filter(id => !(n.id === conn.to && id === conn.from));
    });
    addConnection(conn.from, loopNode.id, kind === 'flow' ? 'flow' : 'input');
    connectInputNode(loopNode.id, conn.to);
    return true;
}
function smartLoopPromptFieldValues(node){
    const fields = Array.isArray(node?.variablePrompts)
        ? node.variablePrompts.map(text => String(text || '').trim())
        : [];
    if(fields.length) return fields;
    return splitSmartPromptItems(node?.variablePrompt || '');
}
function smartLoopActivePromptFieldValues(node){
    return smartLoopPromptFieldValues(node).filter(Boolean);
}
function setSmartLoopPromptFieldValues(node, values){
    if(!node || node.type !== 'smart-loop') return;
    const fields = (values || []).map(text => String(text || '').trim());
    node.variablePrompts = fields.length ? fields : [''];
    node.variablePrompt = fields.filter(Boolean).join('\n');
}
function smartLoopPromptFieldText(node, fieldIndex){
    const values = smartLoopPromptFieldValues(node);
    return values[fieldIndex] || '';
}
function smartLoopSelectedLocalPrompt(node, ctx=smartLoopContext){
    const values = smartLoopActivePromptFieldValues(node);
    if(!values.length) return '';
    const startBase = Math.max(1, Number(node?.loopStart) || 1);
    const index = Math.max(1, Number(ctx?.index || startBase) || startBase);
    return values[(index - 1) % values.length] || '';
}
function smartLoopUpstreamPromptPreviewHeight(node){
    return smartLoopInputPromptItems(node).length ? 78 : 0;
}
const smartLoopPromptVisiting = new Set();
function smartLoopInputPromptItems(node){
    if(!node?.showPrompt || smartLoopPromptVisiting.has(node.id)) return [];
    smartLoopPromptVisiting.add(node.id);
    try {
        return inputNodesFor(node).flatMap(input => {
            if(input.type === 'smart-prompt') return String(input.text || '').trim() ? [String(input.text || '').trim()] : [];
            if(input.type === 'smart-loop') {
                const text = smartLoopPrompt(input);
                return text ? [text] : [];
            }
            if(input.type === 'smart-group') {
                // 智能分组作为输入：收集其成员里的提示词/循环文本。
                return smartGroupCompactMembers(input).flatMap(member => {
                    if(member.type === 'smart-prompt') return String(member.text || '').trim() ? [String(member.text || '').trim()] : [];
                    if(member.type === 'smart-loop') { const t = smartLoopPrompt(member); return t ? [t] : []; }
                    return [];
                });
            }
            return [];
        }).filter(Boolean);
    } finally {
        smartLoopPromptVisiting.delete(node.id);
    }
}
function smartLoopSelectedInputPrompt(node, ctx=smartLoopContext){
    const items = smartLoopInputPromptItems(node);
    if(!items.length) return '';
    const startBase = Math.max(1, Number(node?.loopStart) || 1);
    const index = Math.max(1, Number(ctx?.index || startBase) || startBase);
    return items[(index - 1) % items.length] || '';
}
function smartLoopPrompt(node, ctx=smartLoopContext){
    if(!node?.showPrompt) return '';
    const count = smartLoopCount(node);
    const startBase = Math.max(1, Number(node.loopStart) || 1);
    const index = Math.max(1, Number(ctx?.index || startBase) || startBase);
    const total = Math.max(1, Number(ctx?.total || count) || count);
    const selected = smartLoopSelectedInputPrompt(node, ctx);
    const localPrompt = smartLoopSelectedLocalPrompt(node, ctx);
    const combined = [selected, localPrompt].map(text => String(text || '').trim()).filter(Boolean).join('\n\n');
    return String(combined || '')
        .replaceAll('《计数》', String(index))
        .replaceAll('[计数]', String(index))
        .replaceAll(`[${tr('canvas.counterToken')}]`, String(index))
        .replaceAll('《总数》', String(total))
        .replaceAll('[总数]', String(total))
        .replaceAll('《进度》', `${index}/${total}`)
        .replaceAll('[进度]', `${index}/${total}`)
        .trim();
}
function smartLoopTotalInputImages(node){
    if(!node?.imageInput) return [];
    return inputNodesFor(node).flatMap(input => {
        if(input?.type === 'smart-loop') return smartLoopTotalInputImages(input);
        return imagesForNode(input);
    }).filter(img => img?.url);
}
function smartLoopInputImages(node, ctx=smartLoopContext){
    if(!node?.imageInput) return [];
    const refs = inputNodesFor(node).flatMap(input => {
        if(input?.type === 'smart-loop') return smartLoopInputImages(input, ctx);
        return imagesForNode(input);
    }).filter(img => img?.url);
    if(!refs.length) return [];
    const startBase = Math.max(1, Number(node.loopStart) || 1);
    const batchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
    const currentIndex = Math.max(1, Number(ctx?.index || startBase) || startBase);
    return refs.slice(Math.max(0, currentIndex - 1), Math.max(0, currentIndex - 1) + batchSize)
        .map((img, i) => ({...img, name:img.name || trf('canvas.loopImageLabel', {n:currentIndex + i})}));
}
function smartLoopPreviewImages(node){
    if(!node?.imageInput) return [];
    return inputNodesFor(node).flatMap(input => {
        if(input?.type === 'smart-loop') return smartLoopInputImages(input, {index:Number(node.loopStart) || 1});
        return imagesForNode(input);
    }).filter(img => img?.url);
}
function upstreamLoopPromptNodesFor(node){
    return promptInputNodesFor(node).filter(input => input?.type === 'smart-loop' && input.showPrompt);
}
function collectLoopChainSubgraph(rootNode, graph){
    if(!rootNode?.id) return {nodes:[], edges:[]};
    const nodeIds = new Set();
    const edges = [];
    const seenEdge = new Set();
    const walk = id => {
        if(nodeIds.has(id)) return;
        nodeIds.add(id);
        (graph.children.get(id) || []).forEach(target => {
            if(!target?.id || target.type === 'smart-loop') return; // 不含循环节点
            const key = `${id}->${target.id}`;
            if(!seenEdge.has(key)){ seenEdge.add(key); edges.push({from:id, to:target.id}); }
            walk(target.id);
        });
    };
    walk(rootNode.id);
    const chainNodes = [...nodeIds].map(id => nodes.find(n => n.id === id)).filter(Boolean);
    return {nodes:chainNodes, edges};
}
// 为某一轮克隆一条完整链路：深拷贝链路节点(新id)，重映射内部连线，按轮次偏移位置，
// 再创建一个装当前轮素材的图片节点，连到克隆链路的根节点。
// columnsPerRow：并行模式下每行最多放几条链路（即 parallelLimit），达到上限后换行向下；
// 串行模式固定传 1，效果与之前一致（每一轮都单独另起一行）。
function cloneLoopChainForRound(subgraph, rootNode, loopNode, loopIndex, endIndex, roundOffset, columnsPerRow=1){
    // 素材节点（装当前轮输入图，可能是多图分组）在克隆链路之前算好，因为它的高度
    // 会随批次大小(imageBatchSize)变化，且可能比链路里任何节点都高。
    const roundRefs = refsForDirectLoopRound(loopNode, loopIndex, endIndex).filter(ref => ref?.url);
    // 保留尺寸元数据，避免新建的循环素材节点在图片加载前退回 260x180。
    // 这也使预布局与最终节点使用同一批实际素材，避免非 4:3 输入图导致链路错位。
    const materialImages = roundRefs.map((ref, i) => stripImageGenerationMeta({
        file_id:ref.file_id || '',
        url:ref.url,
        name:ref.name || trf('canvas.loopImageLabel', {n:loopIndex + i}),
        kind:ref.kind || (isVideoMediaItem(ref) ? 'video' : 'image'),
        natural_w:Number(ref.natural_w || ref.width || ref.w || 0),
        natural_h:Number(ref.natural_h || ref.height || ref.h || 0)
    })).filter(img => img.url);
    const materialImageCount = materialImages.length;
    const materialLayout = materialImageCount
        ? imageLayout(materialImages, materialImageCount > 1 ? MEDIA_GROUP_DEFAULT_SCALE : MEDIA_NODE_DEFAULT_SCALE, {type:'smart-image', images:materialImages})
        : null;
    const materialWidth = Math.round(materialLayout?.width || 0);
    const materialHeight = Math.round(materialLayout?.height || 0);
    // 行高取整条链路中最高的节点、以及本轮素材节点两者的最大值（而不是只看根节点），
    // 避免链路内存在比根节点更高的节点（如多图组、循环节点等），或素材节点因批次
    // 图片数量变化而变高时，各轮克隆在 Y 轴上互相重叠。
    const chainMaxHeight = subgraph.nodes.reduce((max, node) => Math.max(max, Number(nodeRect(node).height) || 0), Number(nodeRect(rootNode).height) || 180);
    const rowGap = Math.max(chainMaxHeight, materialHeight) + 140;
    // 列宽：素材节点宽度 + 素材到根节点的固定间距 + 链路本身从根节点到最右侧节点的跨度。
    const materialGap = Math.max(300, materialWidth + 80);
    const chainRightEdge = subgraph.nodes.reduce((max, node) => {
        const rect = nodeRect(node);
        return Math.max(max, (Number(rect.x) || 0) + (Number(rect.width) || 0));
    }, (Number(rootNode.x) || 0) + (Number(nodeRect(rootNode).width) || 0));
    const chainSpan = chainRightEdge - ((Number(rootNode.x) || 0) - materialGap);
    const colGap = chainSpan + 80;
    const cols = Math.max(1, Number(columnsPerRow) || 1);
    const col = roundOffset % cols;
    const row = Math.floor(roundOffset / cols);
    const dx = col * colGap;
    const dy = (row + 1) * rowGap; // 原链路在上，克隆链路依次向下排列；同一行内向右并排
    const idMap = new Map();
    const clones = subgraph.nodes.map(node => {
        const clone = cloneSmartNode(node, dx, dy);
        idMap.set(node.id, clone.id);
        // 克隆的生成节点需要重新生成：清空既有结果与运行痕迹。
        clone.images = [];
        clone.candidateImages = [];
        clone.candidateIndex = 0;
        clone.pending = 0;
        clone.queued = false;
        clone.running = false;
        delete clone.pendingTasks;
        delete clone.pendingCandidatePool;
        delete clone.runPrompt;
        delete clone.runModelPrompt;
        delete clone.runPromptRefs;
        delete clone.runInputRefs;
        delete clone.runAt;
        delete clone.sourceNodeId;
        clone.loopCloneRound = loopIndex;
        clone.loopCloneSourceId = loopNode?.id || '';
        return clone;
    });
    clones.forEach(clone => {
        // 仅保留链路内部的上游引用；指向链路外（如循环节点）的引用去掉。
        if(Array.isArray(clone.inputNodeIds)){
            clone.inputNodeIds = clone.inputNodeIds.map(id => idMap.get(id)).filter(Boolean);
        }
        if(clone.sourceNodeId) clone.sourceNodeId = idMap.get(clone.sourceNodeId) || '';
    });
    nodes.push(...clones);
    // 重映射内部连线。
    subgraph.edges.forEach(edge => {
        const from = idMap.get(edge.from);
        const to = idMap.get(edge.to);
        if(from && to) addConnection(from, to, 'flow');
    });
    const clonedRoot = nodes.find(n => n.id === idMap.get(rootNode.id));
    // 素材节点：装当前轮的输入图，直接连到克隆根节点。
    let materialNode = null;
    if(roundRefs.length && clonedRoot){
        const matRect = nodeRect(rootNode);
        materialNode = {
            id:uid('smart'),
            type:'smart-image',
            x:(Number(clonedRoot.x) || 0) - Math.max(300, (Number(matRect.width) || 260) + 80),
            y:(Number(clonedRoot.y) || 0),
            title:materialImages.length > 1 ? 'Group' : 'Image',
            images:materialImages,
            scale:materialImages.length > 1 ? MEDIA_GROUP_DEFAULT_SCALE : MEDIA_NODE_DEFAULT_SCALE,
            outputKind:mediaKindForUrls(materialImages, materialImages.some(isVideoMediaItem) ? 'video' : 'image'),
            created_at:Date.now()
        };
        nodes.push(materialNode);
        connectInputNode(materialNode.id, clonedRoot.id);
    }
    return {idMap, clones, clonedRoot, materialNode};
}
