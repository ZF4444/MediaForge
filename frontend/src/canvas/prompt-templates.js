// M17 拆分：提示词预设（prompt preset）+ 提示词模板库（prompt template）
// 管理系统。从 static/js/canvas.js 原样剪切，未改动任何函数签名/
// 内部逻辑，只做了纯粹的位置搬移。
//
// 为什么这里不用 ES module 的 export/import（跟 M1-M16 同一个原因）：
// canvas.html 依赖经典 <script> 的全局作用域语义，57 处内联
// onclick="xxx()" 都依赖这一点。所以这里同样只做"物理文件拆分"：
// prompt-templates.js 保持经典脚本语法，通过
// <script src="prompt-templates.js"> 排在 canvas-sync.js 之后、
// canvas-render.js 之前加载。
//
// 背景（M8 阶段的架构判断，这里重新确认并部分执行）：M8 拆 image-editor.js
// 时评估过提示词模板/composer 系统，发现"smart-prompt 节点自身逻辑"
// （promptNodeBodyHtml/bindPromptNodeControls/bindScrollableText，仍在
// main.js）和"提示词模板/预设/composer/@mention 大系统"是两个不同层次的
// 东西：后者是给图片节点生成流程用的共享基础设施，且深度耦合着约1400行
// 顶层匿名脚本（画布事件绑定/app 启动序列等）。M17 重新细分这个大系统，
// 发现"预设/模板库的加载、保存、渲染、增删改查"这部分（本文件）是一块
// 干净的、不含任何顶层匿名语句的连续区间（原文件 1314-1970 行），可以
// 先拆出来；而 @mention/输入引用图片收集/生成请求构建这些和
// buildPromptRequest/输入合成器强耦合的部分，仍然留在 main.js，作为
// 未来更高风险的拆分目标。
//
// 本文件包含（共45个函数）：
//   本地存储读写：loadPromptPresets/savePromptPresets/
//     loadPromptTemplateGroups/savePromptTemplateGroups/
//     loadPromptTemplateOverrides/savePromptTemplateOverrides
//   模板库加载与选择：loadPromptTemplates（从
//     /api/prompt-libraries 或旧版 /api/canvas/prompt-templates
//     兜底加载）/activePromptLibrary/renderPromptLibrarySelect
//   模板数据查询/格式化：promptTemplateItems/promptTemplateText/
//     promptTemplateName/promptTemplateScene/promptTemplateSearchText/
//     activePromptTemplateGroups/promptTemplateCategoryLabel/
//     promptTemplateSelectedItem/defaultPromptTemplateGroups
//   预设（个人保存的提示词）管理：currentPromptPreset/
//     defaultPromptPresetName/promptPresetPanelNode/
//     setPromptPresetStatus/resetPromptPresetDeleteState/
//     createPromptPresetFromNode/createPromptPresetFromComposer/
//     savePromptNodeAsPreset/renderPromptPresetPanel/
//     openPromptPresetPanel/closePromptPresetPanel
//   模板面板渲染与交互：promptTemplateScrollSnapshot/
//     restorePromptTemplateScroll/renderPromptTemplatePanel/
//     activePromptTemplateNodeId/syncComposerTemplateButton/
//     openPromptTemplatePanel/closePromptTemplatePanel/
//     applyPromptTemplateToNode/editPromptPresetForNode
//   模板 CRUD：saveCurrentPromptAsTemplate/createBlankPromptTemplate/
//     savePromptTemplateEdit/deletePromptTemplate/
//     createPromptTemplateGroup/renamePromptTemplateGroup/
//     deletePromptTemplateGroup
//
// 依赖的外部全局（刻意留在 static/js/canvas.js / main.js 里，
// 通过共享脚本作用域访问，未随本文件迁移）：
//   状态变量（本文件读写，main.js 里其它代码——主要是顶层匿名脚本里
//   模板面板的分类/搜索/编辑模式点击事件绑定——也会读写，属于跨函数
//   可变状态耦合，和 M16 canvas-sync.js 的 smartClientId 一样的道理，
//   状态本身不搬，只搬读写它们的函数）：
//     promptPresets, builtinPromptTemplates, promptLibraries,
//     activePromptLibraryId, promptTemplateGroups, promptTemplateOverrides,
//     promptTemplateCategory, promptTemplateSelectedId, promptTemplateEditing,
//     promptTemplateGroupEditMode, promptPresetDeleteArmed
//   核心选中状态（本文件的 openPromptTemplatePanel 会重新赋值，同
//     M2 loop-node.js 的 selectedId=... 一样的经典脚本共享作用域写法）：
//     selectedId, selectedIds, selectedImage
//   本地存储 key 常量：PROMPT_PRESETS_KEY, PROMPT_TEMPLATE_GROUPS_KEY,
//     PROMPT_TEMPLATE_OVERRIDES_KEY
//   DOM 元素常量（文件顶部 const，只读访问）：promptTemplateLibrarySelect,
//     promptPresetPanel, promptTemplatePanel, promptTemplateBody,
//     promptTemplateCats, promptTemplateSearch, promptPresetSelect,
//     promptPresetName, promptPresetText, promptPresetApply,
//     promptPresetDelete, promptPresetSave, promptPresetNew,
//     promptPresetStatus, composerTemplateBtn, promptInput, world, shell
//   状态变量：nodes（只读查找节点，未重新赋值）
//   通用工具：tr/trf（M1 已拆到 utils.js）、escapeHtml/escapeAttr（M1）、
//     uid（M1）、refreshIcons（M1）
//   通用函数：toast, selectedNode, render, scheduleSave, setPromptText,
//     promptPlainText, savePromptDraftForCurrent, renderInputThumbsRow
//     （均留在 main.js）
//
// 反过来，main.js 里仍保留的以下部分会调用本文件里的函数
// （通过共享脚本作用域，未做任何改动）：
//   promptNodeBodyHtml/bindPromptNodeControls（smart-prompt 节点自身
//     渲染逻辑）调用 activePromptTemplateNodeId/closePromptTemplatePanel/
//     editPromptPresetForNode
//   顶层匿名脚本里模板面板的分类 tab/搜索框/编辑模式切换/库选择器等
//     DOM 事件绑定，点击后直接重新赋值 promptTemplateCategory 等状态
//     变量，再调用 renderPromptTemplatePanel() 重新渲染（同 M10/M14 的
//     "简单函数调用触发重渲染"模式，不是 onmousemove 那种闭包内嵌状态机）
//   window.onload 启动序列调用 loadPromptPresets/loadPromptTemplateGroups/
//     loadPromptTemplateOverrides/loadPromptTemplates
//
// 刻意排除（留在 main.js，属于其他模块/未来更高风险拆分目标的范畴）：
//   promptNodeBodyHtml/bindPromptNodeControls/bindScrollableText ——
//     smart-prompt 节点自身的渲染与交互逻辑，物理上紧邻本文件之后，
//     但是不同的子系统（节点本身 vs 模板库管理）。
//   smartRuleTemplateItems/smartRuleTemplateOptions/smartRuleTemplateContent
//     —— 反推/扩写任务从专用提示词库读取规则的查询逻辑，已拆至
//     prompt-task-rules.js。
//   @mention 选择器/输入引用图片收集/buildPromptRequest 等和图片生成
//     composer 深度耦合、且和 ~1400 行顶层匿名脚本交织的部分——仍然
//     是未来更高风险的拆分目标，本次不动。
function loadPromptPresets(){
    try {
        const list = JSON.parse(localStorage.getItem(PROMPT_PRESETS_KEY) || '[]');
        promptPresets = Array.isArray(list) ? list.filter(p => p?.id && typeof p.text === 'string') : [];
    } catch(e) {
        promptPresets = [];
    }
}
function savePromptPresets(){
    localStorage.setItem(PROMPT_PRESETS_KEY, JSON.stringify(promptPresets));
}
function defaultPromptTemplateGroups(){
    return [
        {id:'view', name:tr('smart.tplCatView')},
        {id:'storyboard', name:tr('smart.tplCatStoryboard')},
        {id:'character', name:tr('smart.tplCatCharacter')},
        {id:'product', name:tr('smart.tplCatProduct')},
        {id:'lighting', name:tr('smart.tplCatLighting')},
        {id:'mine', name:tr('smart.tplCatMine')}
    ];
}
function loadPromptTemplateGroups(){
    try {
        const list = JSON.parse(localStorage.getItem(PROMPT_TEMPLATE_GROUPS_KEY) || '[]');
        const valid = Array.isArray(list) ? list.filter(g => g?.id && g?.name) : [];
        const defaults = defaultPromptTemplateGroups();
        promptTemplateGroups = defaults.map(group => valid.find(g => g.id === group.id) || group);
        valid.filter(g => !promptTemplateGroups.some(x => x.id === g.id)).forEach(g => promptTemplateGroups.push(g));
    } catch(e) {
        promptTemplateGroups = defaultPromptTemplateGroups();
    }
}
function savePromptTemplateGroups(){
    localStorage.setItem(PROMPT_TEMPLATE_GROUPS_KEY, JSON.stringify(promptTemplateGroups));
}
function loadPromptTemplateOverrides(){
    try {
        const data = JSON.parse(localStorage.getItem(PROMPT_TEMPLATE_OVERRIDES_KEY) || '{}');
        promptTemplateOverrides = {
            hiddenBuiltinIds:Array.isArray(data.hiddenBuiltinIds) ? data.hiddenBuiltinIds : [],
            editedBuiltins:data.editedBuiltins && typeof data.editedBuiltins === 'object' ? data.editedBuiltins : {}
        };
    } catch(e) {
        promptTemplateOverrides = {hiddenBuiltinIds:[], editedBuiltins:{}};
    }
}
function savePromptTemplateOverrides(){
    localStorage.setItem(PROMPT_TEMPLATE_OVERRIDES_KEY, JSON.stringify(promptTemplateOverrides));
}
async function loadPromptTemplates(){
    try {
        const data = await fetch('/api/prompt-libraries').then(r => r.ok ? r.json() : {library:{libraries:[]}});
        promptLibraries = Array.isArray(data.library?.libraries) ? data.library.libraries : [];
        if(!promptLibraries.length) {
            const fallback = await fetch('/api/canvas/prompt-templates').then(r => r.ok ? r.json() : {templates:[]});
            builtinPromptTemplates = Array.isArray(fallback.templates) ? fallback.templates.filter(t => t?.id && t?.positive) : [];
            promptLibraries = [{id:'system', name:'系统提示词库', readonly:true, items:builtinPromptTemplates}];
        } else {
            const system = promptLibraries.find(lib => lib.id === 'system') || promptLibraries[0];
            builtinPromptTemplates = Array.isArray(system?.items) ? system.items.filter(t => t?.id && t?.positive) : [];
        }
        if(!promptLibraries.some(lib => lib.id === activePromptLibraryId)) activePromptLibraryId = promptLibraries[0]?.id || 'system';
        renderPromptLibrarySelect();
    } catch(e) {
        builtinPromptTemplates = [];
        promptLibraries = [];
    }
}
function activePromptLibrary(){
    return promptLibraries.find(lib => lib.id === activePromptLibraryId) || promptLibraries[0] || {id:'system', name:'系统提示词库', readonly:true, items:builtinPromptTemplates};
}
function renderPromptLibrarySelect(){
    if(!promptTemplateLibrarySelect) return;
    promptTemplateLibrarySelect.innerHTML = promptLibraries.map(lib => `<option value="${escapeAttr(lib.id)}" ${lib.id === activePromptLibraryId ? 'selected' : ''}>${escapeHtml(lib.name || '提示词库')}</option>`).join('');
}
function promptTemplateItems(){
    const activeLibrary = activePromptLibrary();
    if(activeLibrary.id !== 'system'){
        return (activeLibrary.items || []).filter(t => t?.id && t?.positive).map(t => ({
            ...t,
            sourceId:t.id,
            builtin:false,
            remote:true,
            libraryId:activeLibrary.id
        }));
    }
    const hidden = new Set(promptTemplateOverrides.hiddenBuiltinIds || []);
    const builtins = builtinPromptTemplates
        .filter(t => !hidden.has(t.id))
        .map(t => ({...t, ...(promptTemplateOverrides.editedBuiltins?.[t.id] || {}), builtin:true}));
    const mine = promptPresets.map(p => ({
        id:`mine:${p.id}`,
        sourceId:p.id,
        name:p.name || tr('smart.promptPresetUnnamed'),
        category:p.category || 'mine',
        scene:'我的提示词预设',
        positive:p.text || '',
        negative:'',
        params:{},
        builtin:false
    }));
    return [...builtins, ...mine];
}
function promptTemplateText(template, mode='positive'){
    const positive = String(template?.positive || '').trim();
    if(mode === 'positive' || !template?.builtin) return positive;
    const negative = String(template?.negative || '').trim();
    const params = Object.entries(template?.params || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    return [positive, negative ? `Negative prompt:\n${negative}` : '', params ? `Params:\n${params}` : ''].filter(Boolean).join('\n\n');
}
function promptTemplateName(template){
    if(window.StudioI18n?.lang?.() === 'en' && template?.name_en) return template.name_en;
    return template?.name || '';
}
function promptTemplateScene(template){
    if(window.StudioI18n?.lang?.() === 'en' && template?.scene_en) return template.scene_en;
    return template?.scene || '';
}
function promptTemplateSearchText(template){
    return [
        template?.name,
        template?.name_en,
        template?.scene,
        template?.scene_en,
        template?.positive,
        template?.negative
    ].join(' ').toLowerCase();
}
function activePromptTemplateGroups(){
    const lib = activePromptLibrary();
    if(!lib || lib.id === 'system') return promptTemplateGroups;
    return Array.isArray(lib.categories) ? lib.categories.filter(c => c?.id && c?.name) : [];
}
function promptTemplateCategoryLabel(category){
    if(category === 'all') return tr('smart.tplAll');
    const lib = activePromptLibrary();
    if(lib && lib.id !== 'system'){
        return activePromptTemplateGroups().find(g => g.id === category)?.name || category;
    }
    const builtin = {
        view:tr('smart.tplCatView'),
        storyboard:tr('smart.tplCatStoryboard'),
        character:tr('smart.tplCatCharacter'),
        product:tr('smart.tplCatProduct'),
        lighting:tr('smart.tplCatLighting'),
        mine:tr('smart.tplCatMine')
    };
    return builtin[category] || promptTemplateGroups.find(g => g.id === category)?.name || category;
}
function promptTemplateSelectedItem(){
    return promptTemplateItems().find(item => item.id === promptTemplateSelectedId) || promptTemplateItems()[0] || null;
}
function currentPromptPreset(id){
    return promptPresets.find(p => p.id === id) || null;
}
function defaultPromptPresetName(text){
    return (String(text || '').trim().split(/\r?\n/)[0] || tr('smart.promptPresetDefault')).slice(0, 28);
}
function promptPresetPanelNode(){
    return nodes.find(n => n.id === promptPresetPanel?.dataset.nodeId) || null;
}
function setPromptPresetStatus(text='', tone=''){
    if(!promptPresetStatus) return;
    promptPresetStatus.textContent = text;
    promptPresetStatus.classList.toggle('warn', tone === 'warn');
    promptPresetStatus.classList.toggle('ok', tone === 'ok');
}
function resetPromptPresetDeleteState(){
    promptPresetDeleteArmed = false;
    if(promptPresetDelete){
        promptPresetDelete.textContent = tr('common.delete');
        promptPresetDelete.classList.remove('confirm-danger');
    }
}
function createPromptPresetFromNode(node, {openPanel=true, openTemplatePanel=false}={}){
    const text = String(node?.text || '').trim();
    if(!text){ toast(tr('smart.promptPresetEmpty')); return null; }
    const preset = {id:uid('preset'), name:defaultPromptPresetName(text), text, createdAt:Date.now(), updatedAt:Date.now()};
    promptPresets.unshift(preset);
    savePromptPresets();
    if(node) node.promptPresetId = preset.id;
    render();
    scheduleSave();
    if(openPanel) openPromptPresetPanel(node?.id || '', preset.id, {status:tr('smart.promptPresetSavedNew'), tone:'ok'});
    if(openTemplatePanel) {
        promptTemplateCategory = 'mine';
        promptTemplateSelectedId = `mine:${preset.id}`;
        promptTemplateEditing = true;
        openPromptTemplatePanel(node?.id || '', promptTemplateSelectedId);
    }
    return preset;
}
function createPromptPresetFromComposer(){
    const text = promptPlainText();
    if(!text){ toast(tr('smart.promptPresetEmpty')); return null; }
    const preset = {id:uid('preset'), name:defaultPromptPresetName(text), text, category:'mine', createdAt:Date.now(), updatedAt:Date.now()};
    promptPresets.unshift(preset);
    savePromptPresets();
    savePromptDraftForCurrent();
    scheduleSave();
    return preset;
}
function savePromptNodeAsPreset(node){
    createPromptPresetFromNode(node);
}
function renderPromptPresetPanel(selectedId='', message=''){
    if(!promptPresetSelect) return;
    resetPromptPresetDeleteState();
    promptPresetSelect.innerHTML = promptPresets.length
        ? promptPresets.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.name || tr('smart.promptPresetUnnamed'))}</option>`).join('')
        : `<option value="">${escapeHtml(tr('smart.promptPresetNone'))}</option>`;
    const preset = currentPromptPreset(selectedId) || promptPresets[0] || null;
    if(preset && promptPresetSelect.value !== preset.id) promptPresetSelect.value = preset.id;
    promptPresetName.value = preset?.name || '';
    promptPresetText.value = preset?.text || '';
    const hasPreset = Boolean(preset);
    const nodeHasText = Boolean(String(promptPresetPanelNode()?.text || '').trim());
    promptPresetApply.disabled = !hasPreset;
    promptPresetDelete.disabled = !hasPreset;
    promptPresetSave.disabled = !hasPreset;
    if(promptPresetNew) promptPresetNew.disabled = !nodeHasText;
    setPromptPresetStatus(message || (hasPreset ? tr('smart.promptPresetPanelHint') : tr('smart.promptPresetPanelEmpty')));
}
function openPromptPresetPanel(nodeId='', presetId='', options={}){
    if(!promptPresetPanel) return;
    promptPresetPanel.dataset.nodeId = nodeId || '';
    const node = nodes.find(n => n.id === nodeId);
    const preferred = presetId || node?.promptPresetId || promptPresets[0]?.id || '';
    renderPromptPresetPanel(preferred, options.status || '');
    if(options.tone) setPromptPresetStatus(options.status || '', options.tone);
    const nodeEl = nodeId ? world.querySelector(`.image-node[data-id="${CSS.escape(nodeId)}"]`) : null;
    const rect = nodeEl?.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const maxLeft = Math.max(18, shellRect.width - 410);
    const maxTop = Math.max(18, shellRect.height - 330);
    const left = rect ? Math.min(maxLeft, Math.max(18, rect.right - shellRect.left + 12)) : 80;
    const top = rect ? Math.min(maxTop, Math.max(18, rect.top - shellRect.top)) : 80;
    promptPresetPanel.style.left = `${left}px`;
    promptPresetPanel.style.top = `${top}px`;
    promptPresetPanel.classList.add('open');
    refreshIcons();
}
function closePromptPresetPanel(){
    promptPresetPanel?.classList.remove('open');
    resetPromptPresetDeleteState();
}
function promptTemplateScrollSnapshot(){
    if(!promptTemplatePanel) return null;
    return {
        panelTop:promptTemplatePanel.scrollTop || 0,
        tabLeft:promptTemplatePanel.querySelector('.prompt-template-tabs')?.scrollLeft || 0,
        listTop:promptTemplatePanel.querySelector('.prompt-template-list')?.scrollTop || 0,
        detailTop:promptTemplatePanel.querySelector('.prompt-template-preview-content')?.scrollTop || 0
    };
}
function restorePromptTemplateScroll(snapshot){
    if(!snapshot || !promptTemplatePanel) return;
    requestAnimationFrame(() => {
        promptTemplatePanel.scrollTop = snapshot.panelTop || 0;
        const tabs = promptTemplatePanel.querySelector('.prompt-template-tabs');
        const list = promptTemplatePanel.querySelector('.prompt-template-list');
        const detail = promptTemplatePanel.querySelector('.prompt-template-preview-content');
        if(tabs) tabs.scrollLeft = snapshot.tabLeft || 0;
        if(list) list.scrollTop = snapshot.listTop || 0;
        if(detail) detail.scrollTop = snapshot.detailTop || 0;
    });
}
function renderPromptTemplatePanel(options={}){
    if(!promptTemplatePanel || !promptTemplateBody || !promptTemplateCats) return;
    renderPromptLibrarySelect();
    const scrollSnapshot = options.preserveScroll === false ? null : promptTemplateScrollSnapshot();
    const query = String(promptTemplateSearch?.value || '').trim().toLowerCase();
    const allTemplates = promptTemplateItems();
    const activeGroups = activePromptTemplateGroups();
    const categories = [{id:'all', name:tr('smart.tplAll')}, ...activeGroups.map(group => ({...group, name:promptTemplateCategoryLabel(group.id)}))];
    const groupCounts = allTemplates.reduce((map, item) => {
        map[item.category || 'mine'] = (map[item.category || 'mine'] || 0) + 1;
        return map;
    }, {all:allTemplates.length});
    promptTemplateCats.innerHTML = promptTemplateGroupEditMode ? `
        <div class="prompt-template-group-panel">
            <div class="prompt-template-group-title">
                <div>
                    <strong>${escapeHtml(tr('smart.tplGroupManage'))}</strong>
                    <span>${escapeHtml(tr('smart.tplGroupHint'))}</span>
                </div>
                <div class="prompt-template-group-tools">
                    <button type="button" data-template-cat-new><i data-lucide="plus"></i><span>${escapeHtml(tr('smart.tplAdd'))}</span></button>
                    <button type="button" class="primary" data-template-group-edit><i data-lucide="check"></i><span>${escapeHtml(tr('smart.tplDone'))}</span></button>
                </div>
            </div>
            <div class="prompt-template-group-list">
                ${activeGroups.map(group => `
                    <div class="prompt-template-group-row ${['view','storyboard','character','product','lighting','mine'].includes(group.id) ? '' : 'has-delete'}">
                        <button type="button" class="group-name ${group.id === promptTemplateCategory ? 'active' : ''}" data-template-cat="${escapeHtml(group.id)}">
                            <span>${escapeHtml(promptTemplateCategoryLabel(group.id))}</span>
                            <small>${groupCounts[group.id] || 0}</small>
                        </button>
                        <button type="button" class="group-tool" data-template-cat-edit="${escapeHtml(group.id)}" title="${escapeAttr(tr('smart.tplRename'))}"><i data-lucide="pencil"></i></button>
                        ${['view','storyboard','character','product','lighting','mine'].includes(group.id) ? '' : `<button type="button" class="group-tool danger" data-template-cat-delete="${escapeHtml(group.id)}" title="${escapeAttr(tr('common.delete'))}"><i data-lucide="trash-2"></i></button>`}
                    </div>
                `).join('')}
            </div>
        </div>
    ` : `
        <div class="prompt-template-nav">
            <div class="prompt-template-tabs">
                ${categories.map(cat => `
                    <button type="button" class="${cat.id === promptTemplateCategory ? 'active' : ''}" data-template-cat="${escapeHtml(cat.id)}">
                        <span>${escapeHtml(cat.name)}</span>
                        <small>${groupCounts[cat.id] || 0}</small>
                    </button>
                `).join('')}
            </div>
            <button type="button" class="prompt-template-manage-groups" data-template-group-edit><i data-lucide="settings-2"></i><span>${escapeHtml(tr('smart.tplManageGroups'))}</span></button>
        </div>
    `;
    const items = allTemplates.filter(item => {
        if(promptTemplateCategory !== 'all' && item.category !== promptTemplateCategory) return false;
        if(!query) return true;
        return promptTemplateSearchText(item).includes(query);
    });
    if(items.length && !items.some(item => item.id === promptTemplateSelectedId)) promptTemplateSelectedId = items[0].id;
    const selected = items.find(item => item.id === promptTemplateSelectedId) || items[0] || null;
    const selectedPreset = selected?.builtin || selected?.remote
        ? {id:selected.id, name:selected.name || '', text:selected.positive || '', category:selected.category || 'storyboard', builtin:Boolean(selected.builtin)}
        : (selected ? currentPromptPreset(selected.sourceId) : null);
    const target = promptTemplatePanel.dataset.target || 'node';
    const node = nodes.find(n => n.id === promptTemplatePanel.dataset.nodeId);
    const activeLibrary = activePromptLibrary();
    const canEditCurrentLibrary = activeLibrary.id !== 'system' && !activeLibrary.readonly;
    const editMode = Boolean(promptTemplateEditing && selectedPreset);
    promptTemplateBody.innerHTML = `
        <div class="prompt-template-list">
            <div class="prompt-template-list-tools">
                <button type="button" data-template-save-current><i data-lucide="bookmark-plus"></i><span>${escapeHtml(tr('smart.tplSaveCurrent'))}</span></button>
                <button type="button" data-template-new><i data-lucide="file-plus-2"></i><span>${escapeHtml(tr('smart.tplNewTemplate'))}</span></button>
            </div>
            ${items.length ? items.map(item => `<button type="button" class="prompt-template-card ${item.id === selected?.id ? 'active' : ''}" data-template-id="${escapeHtml(item.id)}">
                <span class="prompt-template-card-top">
                    <span class="prompt-template-name">${escapeHtml(promptTemplateName(item))}</span>
                    <span class="prompt-template-source">${escapeHtml(item.builtin ? tr('smart.tplBuiltin') : tr('smart.tplMine'))}</span>
                </span>
                <span class="prompt-template-scene">${escapeHtml(promptTemplateScene(item) || item.positive || '')}</span>
                <span class="prompt-template-tag">${escapeHtml(promptTemplateCategoryLabel(item.category || 'mine'))}</span>
            </button>`).join('') : `<div class="prompt-template-list-empty">${escapeHtml(tr('smart.tplNoMatches'))}</div>`}
        </div>
        <div class="prompt-template-detail">
            ${selected ? `
                <div class="prompt-template-detail-head">
                    <div>
                        <strong>${escapeHtml(promptTemplateName(selected) || '')}</strong>
                        <span>${escapeHtml(promptTemplateCategoryLabel(selected.category || ''))} · ${escapeHtml(selected.builtin ? tr('smart.tplBuiltinTemplate') : tr('smart.tplMineTemplate'))}</span>
                    </div>
                    ${editMode ? '' : `
                        <div class="prompt-template-icon-actions">
                            <button type="button" ${selected?.builtin || !canEditCurrentLibrary ? 'disabled' : ''} data-template-edit title="${escapeAttr(tr('smart.tplEditTemplate'))}"><i data-lucide="pencil"></i><span>${escapeHtml(tr('common.edit'))}</span></button>
                            <button type="button" ${selected?.builtin || !canEditCurrentLibrary ? 'disabled' : ''} class="danger" data-template-delete title="${escapeAttr(tr('smart.tplDeleteTemplate'))}"><i data-lucide="trash-2"></i><span>${escapeHtml(tr('common.delete'))}</span></button>
                        </div>
                    `}
                </div>
            ${editMode ? `
                <div class="prompt-template-edit-fields">
                    <label>${escapeHtml(tr('smart.tplName'))}</label>
                    <input data-template-edit-name value="${escapeAttr(selectedPreset.name || '')}" placeholder="${escapeAttr(tr('smart.tplName'))}">
                    <label>${escapeHtml(tr('smart.tplGroup'))}</label>
                    <select data-template-edit-category>
                        ${activeGroups.map(group => `<option value="${escapeAttr(group.id)}" ${group.id === (selectedPreset.category || selected?.category || 'mine') ? 'selected' : ''}>${escapeHtml(promptTemplateCategoryLabel(group.id))}</option>`).join('')}
                    </select>
                    <label>${escapeHtml(tr('smart.tplContent'))}</label>
                    <textarea data-template-edit-text placeholder="${escapeAttr(tr('smart.tplContent'))}">${escapeHtml(selectedPreset.text || '')}</textarea>
                </div>
            ` : `
                <div class="prompt-template-preview-content">
                <div class="prompt-template-section">
                    <label>${escapeHtml(tr('smart.tplPositive'))}</label>
                    <p>${escapeHtml(selected?.positive || '')}</p>
                </div>
                ${selected?.negative ? `<div class="prompt-template-section">
                    <label>${escapeHtml(tr('smart.tplNegative'))}</label>
                    <p>${escapeHtml(selected.negative)}</p>
                </div>` : ''}
                ${Object.keys(selected?.params || {}).length ? `<div class="prompt-template-section">
                    <label>${escapeHtml(tr('smart.tplParams'))}</label>
                    <p>${escapeHtml(Object.entries(selected.params).map(([k,v]) => `${k}: ${v}`).join('\n'))}</p>
                </div>` : ''}
                </div>
            `}
            <div class="prompt-template-actions">
                ${editMode ? `
                    <button type="button" data-template-edit-cancel><i data-lucide="x"></i><span>${escapeHtml(tr('common.cancel'))}</span></button>
                    <button type="button" class="danger" data-template-delete><i data-lucide="trash-2"></i><span>${escapeHtml(tr('common.delete'))}</span></button>
                    <button type="button" class="primary" data-template-edit-save><i data-lucide="save"></i><span>${escapeHtml(tr('common.save'))}</span></button>
                ` : `
                    <button type="button" data-template-apply="positive"><i data-lucide="corner-down-left"></i><span>${escapeHtml(tr('smart.tplApplyPositive'))}</span></button>
                    <button type="button" class="primary" data-template-apply="full"><i data-lucide="wand-sparkles"></i><span>${escapeHtml(tr('smart.tplApplyFull'))}</span></button>
                `}
            </div>
            ` : `<div class="prompt-template-empty">${escapeHtml(tr('smart.tplPickOrCreate'))}</div>`}
        </div>
    `;
    refreshIcons();
    restorePromptTemplateScroll(scrollSnapshot);
}
function activePromptTemplateNodeId(){
    return promptTemplatePanel?.classList?.contains('open') && promptTemplatePanel.dataset.target !== 'composer' ? (promptTemplatePanel.dataset.nodeId || '') : '';
}
function syncComposerTemplateButton(){
    if(!composerTemplateBtn || !promptTemplatePanel) return;
    const active = promptTemplatePanel.classList.contains('open') && promptTemplatePanel.dataset.target === 'composer';
    composerTemplateBtn.classList.toggle('active', active);
    composerTemplateBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
}
function openPromptTemplatePanel(nodeId='', templateId='', options={}){
    if(!promptTemplatePanel) return;
    const target = options.target === 'composer' ? 'composer' : 'node';
    promptTemplatePanel.dataset.target = target;
    promptTemplatePanel.dataset.nodeId = nodeId || '';
    if(promptTemplatePanel.parentElement !== shell) shell.appendChild(promptTemplatePanel);
    if(templateId) promptTemplateSelectedId = templateId;
    if(!promptTemplateSelectedId) promptTemplateSelectedId = promptTemplateItems()[0]?.id || '';
    renderPromptTemplatePanel();
    promptTemplatePanel.classList.add('open');
    if(target === 'node' && nodeId){
        selectedId = nodeId;
        selectedIds = [];
        selectedImage = {nodeId:'', index:-1};
    }
    render();
    syncComposerTemplateButton();
    promptTemplateSearch?.focus();
}
function closePromptTemplatePanel(){
    promptTemplatePanel?.classList.remove('open');
    syncComposerTemplateButton();
    render();
}
function applyPromptTemplateToNode(mode='positive'){
    const template = promptTemplateItems().find(item => item.id === promptTemplateSelectedId);
    if(!template) return;
    if(promptTemplatePanel?.dataset.target === 'composer'){
        const text = promptTemplateText(template, mode);
        setPromptText(text);
        delete promptInput.dataset.preserveDraftOnce;
        savePromptDraftForCurrent();
        renderInputThumbsRow(selectedNode());
        closePromptTemplatePanel();
        scheduleSave();
        return;
    }
    const node = nodes.find(n => n.id === promptTemplatePanel?.dataset.nodeId);
    if(!node) return;
    node.text = promptTemplateText(template, mode);
    node.promptPresetId = template.builtin ? '' : template.sourceId || '';
    closePromptTemplatePanel();
    render();
    scheduleSave();
}
async function saveCurrentPromptAsTemplate(){
    const library = activePromptLibrary();
    if(library.id === 'system' || library.readonly){ toast('请选择可编辑的提示词库'); return; }
    const text = promptTemplatePanel?.dataset.target === 'composer'
        ? promptPlainText()
        : String(nodes.find(n => n.id === promptTemplatePanel?.dataset.nodeId)?.text || '').trim();
    if(!text){ toast(tr('smart.promptPresetEmpty')); return; }
    try {
        const data = await fetch('/api/prompt-libraries/items', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({library_id:library.id, name:defaultPromptPresetName(text), category:promptTemplateCategory === 'all' ? 'mine' : promptTemplateCategory, positive:text, scene:'我的提示词预设'})
        }).then(async r => {
            if(!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '保存失败');
            return r.json();
        });
        promptLibraries = data.library?.libraries || promptLibraries;
        activePromptLibraryId = library.id;
        promptTemplateCategory = data.item?.category || 'mine';
        promptTemplateSelectedId = data.item?.id || '';
        promptTemplateEditing = true;
        renderPromptTemplatePanel({preserveScroll:false});
    } catch(err) {
        toast(err.message || '保存失败');
    }
}
async function createBlankPromptTemplate(){
    const library = activePromptLibrary();
    if(library.id === 'system' || library.readonly){ toast('请选择可编辑的提示词库'); return; }
    const category = promptTemplateCategory && promptTemplateCategory !== 'all' ? promptTemplateCategory : 'mine';
    try {
        const data = await fetch('/api/prompt-libraries/items', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({library_id:library.id, name:tr('smart.tplNewTemplateName'), category, positive:'新提示词', scene:'我的提示词预设'})
        }).then(async r => {
            if(!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '创建失败');
            return r.json();
        });
        promptLibraries = data.library?.libraries || promptLibraries;
        activePromptLibraryId = library.id;
        promptTemplateCategory = category;
        promptTemplateSelectedId = data.item?.id || '';
        promptTemplateEditing = true;
        renderPromptTemplatePanel({preserveScroll:false});
    } catch(err) {
        toast(err.message || '创建失败');
    }
}
async function savePromptTemplateEdit(){
    const item = promptTemplateSelectedItem();
    if(!item) return;
    const name = promptTemplatePanel.querySelector('[data-template-edit-name]')?.value?.trim() || '';
    const text = promptTemplatePanel.querySelector('[data-template-edit-text]')?.value?.trim() || '';
    const category = promptTemplatePanel.querySelector('[data-template-edit-category]')?.value || 'mine';
    if(!name || !text){ toast(tr('smart.tplRequired')); return; }
    if(item.remote){
        try {
            const data = await fetch(`/api/prompt-libraries/items/${encodeURIComponent(item.id)}`, {
                method:'PATCH',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({library_id:item.libraryId || activePromptLibrary().id, name, category, positive:text, scene:item.scene || '', negative:item.negative || ''})
            }).then(async r => {
                if(!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '保存失败');
                return r.json();
            });
            promptLibraries = data.library?.libraries || promptLibraries;
            promptTemplateSelectedId = data.item?.id || item.id;
        } catch(err) {
            toast(err.message || '保存失败');
            return;
        }
    } else if(item.builtin){
        promptTemplateOverrides.editedBuiltins = promptTemplateOverrides.editedBuiltins || {};
        promptTemplateOverrides.editedBuiltins[item.id] = {
            ...(promptTemplateOverrides.editedBuiltins[item.id] || {}),
            name,
            positive:text,
            category
        };
        savePromptTemplateOverrides();
    } else {
        const preset = currentPromptPreset(item.sourceId);
        if(!preset) return;
        const idx = promptPresets.findIndex(p => p.id === preset.id);
        if(idx >= 0) promptPresets[idx] = {...promptPresets[idx], name, text, category, updatedAt:Date.now()};
        savePromptPresets();
        nodes.forEach(node => { if(node.promptPresetId === preset.id) node.text = text; });
    }
    promptTemplateEditing = false;
    renderPromptTemplatePanel();
    render();
    scheduleSave();
}
async function deletePromptTemplate(){
    const item = promptTemplateSelectedItem();
    if(!item) return;
    if(item.remote){
        try {
            const data = await fetch(`/api/prompt-libraries/items/${encodeURIComponent(item.id)}`, {method:'DELETE'}).then(async r => {
                if(!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '删除失败');
                return r.json();
            });
            promptLibraries = data.library?.libraries || promptLibraries;
        } catch(err) {
            toast(err.message || '删除失败');
            return;
        }
    } else if(item.builtin){
        promptTemplateOverrides.hiddenBuiltinIds = [...new Set([...(promptTemplateOverrides.hiddenBuiltinIds || []), item.id])];
        savePromptTemplateOverrides();
    } else {
        promptPresets = promptPresets.filter(p => p.id !== item.sourceId);
        nodes.forEach(node => { if(node.promptPresetId === item.sourceId) node.promptPresetId = ''; });
        savePromptPresets();
    }
    promptTemplateSelectedId = '';
    promptTemplateEditing = false;
    renderPromptTemplatePanel({preserveScroll:false});
    render();
    scheduleSave();
}
async function createPromptTemplateGroup(){
    const name = window.prompt(tr('smart.tplNewGroupPrompt'), tr('smart.tplNewGroupDefault'));
    if(!String(name || '').trim()) return;
    const lib = activePromptLibrary();
    if(lib && lib.id !== 'system'){
        try {
            const data = await fetch('/api/prompt-libraries/categories', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({name:String(name).trim().slice(0, 24), library_id:lib.id})
            }).then(async r => { if(!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '新增分组失败'); return r.json(); });
            promptLibraries = data.library?.libraries || promptLibraries;
            promptTemplateCategory = data.category?.id || promptTemplateCategory;
            renderPromptTemplatePanel({preserveScroll:false});
        } catch(err){ if(typeof setStatus === 'function') setStatus(err.message || '新增分组失败'); }
        return;
    }
    const group = {id:uid('tpl_group'), name:String(name).trim().slice(0, 24)};
    promptTemplateGroups.push(group);
    savePromptTemplateGroups();
    promptTemplateCategory = group.id;
    renderPromptTemplatePanel({preserveScroll:false});
}
async function renamePromptTemplateGroup(groupId){
    const lib = activePromptLibrary();
    const group = activePromptTemplateGroups().find(g => g.id === groupId);
    if(!group) return;
    const name = window.prompt(tr('smart.tplGroupNamePrompt'), group.name || '');
    if(!String(name || '').trim()) return;
    if(lib && lib.id !== 'system'){
        try {
            const data = await fetch(`/api/prompt-libraries/categories/${encodeURIComponent(groupId)}`, {
                method:'PATCH', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({name:String(name).trim().slice(0, 24), library_id:lib.id})
            }).then(async r => { if(!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '重命名失败'); return r.json(); });
            promptLibraries = data.library?.libraries || promptLibraries;
            renderPromptTemplatePanel();
        } catch(err){ if(typeof setStatus === 'function') setStatus(err.message || '重命名失败'); }
        return;
    }
    group.name = String(name).trim().slice(0, 24);
    savePromptTemplateGroups();
    renderPromptTemplatePanel();
}
async function deletePromptTemplateGroup(groupId){
    const lib = activePromptLibrary();
    if(lib && lib.id !== 'system'){
        if(!window.confirm(tr('smart.tplDeleteGroupConfirm'))) return;
        try {
            const data = await fetch(`/api/prompt-libraries/categories/${encodeURIComponent(groupId)}`, {method:'DELETE'})
                .then(async r => { if(!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '删除失败'); return r.json(); });
            promptLibraries = data.library?.libraries || promptLibraries;
            if(promptTemplateCategory === groupId) promptTemplateCategory = 'all';
            renderPromptTemplatePanel({preserveScroll:false});
        } catch(err){ if(typeof setStatus === 'function') setStatus(err.message || '删除失败'); }
        return;
    }
    if(['view','storyboard','character','product','lighting','mine'].includes(groupId)){
        renamePromptTemplateGroup(groupId);
        return;
    }
    if(!window.confirm(tr('smart.tplDeleteGroupConfirm'))) return;
    promptTemplateGroups = promptTemplateGroups.filter(g => g.id !== groupId);
    promptPresets = promptPresets.map(p => p.category === groupId ? {...p, category:'mine'} : p);
    Object.entries(promptTemplateOverrides.editedBuiltins || {}).forEach(([id, item]) => {
        if(item?.category === groupId) promptTemplateOverrides.editedBuiltins[id] = {...item, category:'mine'};
    });
    if(promptTemplateCategory === groupId) promptTemplateCategory = 'all';
    savePromptTemplateGroups();
    savePromptPresets();
    savePromptTemplateOverrides();
    renderPromptTemplatePanel({preserveScroll:false});
}
function editPromptPresetForNode(node){
    openPromptTemplatePanel(node?.id || '', node?.promptPresetId ? `mine:${node.promptPresetId}` : '');
}
