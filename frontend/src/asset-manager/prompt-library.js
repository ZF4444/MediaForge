// asset-manager 页面 —— 提示词库管理子系统（拆分自 static/js/asset-manager.js）。
//
// 范围：提示词库/分类的读取（promptLibraries/isSystemPromptLibrary/
// activePromptLibrary/activePromptCategories/currentPromptItems/
// findPromptItem/selectedPrompt）、提示词管理主面板渲染
// （renderPromptManager，含库/分类树 + 列表）、提示词详情/编辑态渲染
// （renderPromptRow/renderPromptDetail）、提示词库/分类的创建/改名/
// 删除（createPromptLibrary/renamePromptLibrary/deletePromptLibrary/
// deletePromptCategory）、单条提示词的创建/编辑/删除
// （createPromptItem/savePromptCreate/editPromptItem/savePromptEdit/
// deletePromptItem/deleteSelectedPrompts）。
//
// isSystemPromptLibrary 判断是否是内置的系统提示词库（不可删除/改名，
// 见 promptCategoryLabel 的分类标签映射）。
//
// 经典 <script>，非 ES module，原因同 storage-manager.js。
//
// 依赖 main.js 保留的核心状态和函数：promptLibrary/activePromptLibraryId/
// activePromptCategory/selectedPromptId/selectedPromptIds/promptQuery/
// promptManageMode/promptEditMode/promptCreateMode/
// pendingDeletePromptId/promptTreeEdit/promptTreeFocus（提示词库子系统
// 的全部可变状态）、escapeHtml/escapeAttr/apiJson/setStatus/refreshIcons
// （通用工具）、render（主渲染入口）。

function promptLibraries(){
    const libs = Array.isArray(promptLibrary.libraries) ? promptLibrary.libraries.filter(Boolean) : [];
    if(!libs.length) return [{id:'system', name:'系统提示词库', system:true, items:[], categories:[]}];
    const system = libs.filter(lib => lib.id === 'system');
    const others = libs.filter(lib => lib.id !== 'system');
    return [...system, ...others];
}
function isSystemPromptLibrary(lib){
    return !lib || lib.id === 'system';
}
function activePromptLibrary(){
    const libs = promptLibraries();
    return libs.find(lib => lib.id === activePromptLibraryId) || libs[0] || null;
}
function activePromptCategories(){
    const lib = activePromptLibrary();
    const fromLib = Array.isArray(lib?.categories) ? lib.categories : [];
    if(fromLib.length) return fromLib;
    if(!isSystemPromptLibrary(lib)) return [];
    return [
        {id:'view', name:'视角'},
        {id:'storyboard', name:'分镜'},
        {id:'character', name:'角色'},
        {id:'product', name:'产品'},
        {id:'lighting', name:'光影'},
        {id:'custom', name:'我的'}
    ];
}
const PROMPT_BUILTIN_CATEGORY_IDS = new Set(['view','storyboard','character','product','lighting','custom']);
function promptCategoryLabel(category='custom'){
    const found = activePromptCategories().find(cat => cat.id === category);
    if(found?.name) return found.name;
    const map = {view:'视角', storyboard:'分镜', character:'角色', product:'产品', lighting:'光影', mine:'我的', custom:'我的'};
    return map[category] || category || '自定义';
}
function promptCountForCategory(category, lib=activePromptLibrary()){
    const items = lib?.items || [];
    if(category === 'all') return items.length;
    return items.filter(item => (item.category || 'custom') === category).length;
}
function currentPromptItems(){
    const lib = activePromptLibrary();
    const query = promptQuery.trim().toLowerCase();
    return (lib?.items || []).filter(item => {
        if(activePromptCategory !== 'all' && (item.category || 'custom') !== activePromptCategory) return false;
        if(!query) return true;
        return [item.name, item.scene, item.positive, item.negative, item.category].join(' ').toLowerCase().includes(query);
    });
}
function findPromptItem(id){
    for(const lib of promptLibraries()) for(const item of lib.items || []) if(item.id === id) return item;
    return null;
}
function selectedPrompt(){
    const items = currentPromptItems();
    return items.find(item => item.id === selectedPromptId) || items[0] || null;
}
function normalizePromptState(){
    const libs = promptLibraries();
    if(!activePromptLibraryId || !libs.some(lib => lib.id === activePromptLibraryId)) activePromptLibraryId = promptLibrary.active_library_id || libs[0]?.id || '';
    const cats = activePromptCategories();
    if(activePromptCategory !== 'all' && !cats.some(cat => cat.id === activePromptCategory)) activePromptCategory = 'all';
    const items = currentPromptItems();
    if(selectedPromptId && !items.some(item => item.id === selectedPromptId)) selectedPromptId = '';
    if(!selectedPromptId && items.length) selectedPromptId = items[0].id;
    selectedPromptIds = new Set([...selectedPromptIds].filter(id => findPromptItem(id)));
}
function renderPromptManager(){
    normalizePromptState();
    const libs = promptLibraries();
    const lib = activePromptLibrary();
    const readonly = Boolean(lib?.readonly);
    const cats = activePromptCategories();
    const items = currentPromptItems();
    const detail = promptCreateMode ? null : selectedPrompt();
    const promptEmptyText = (lib?.items || []).length
        ? '当前条件下没有提示词。可以切换分类或清空搜索条件。'
        : `${lib?.name || '当前提示词库'} 暂无提示词，点击「新增」添加。`;
    root.innerHTML = `
        <aside class="asset-panel asset-nav">
            <div class="panel-head">
                <div class="panel-title"><strong>提示词库</strong><span>可创建多个词库</span></div>
                <div class="panel-actions compact-actions">
                    <button class="asset-icon-btn" type="button" data-prompt-lib-new title="新建提示词库"><i data-lucide="plus"></i></button>
                </div>
            </div>
            <div class="nav-scroll">
                <div class="nav-tree">
                    ${libs.map(item => renderPromptTreeBranch(item)).join('')}
                </div>
            </div>
        </aside>
        <section class="asset-panel asset-content ${promptManageMode ? 'manage-on' : ''}">
            <div class="content-toolbar">
                <div class="content-heading">
                    <strong>${escapeHtml(lib?.name || '提示词库')}</strong>
                    <span>共 ${items.length} 条提示词</span>
                </div>
                <div class="asset-tools">
                    <label class="asset-search-wrap"><i data-lucide="search"></i><input id="promptSearch" class="asset-search" type="search" value="${escapeAttr(promptQuery)}" placeholder="搜索名称、说明或正文"></label>
                    <button class="asset-btn primary" type="button" data-prompt-new ${readonly ? 'disabled' : ''}><i data-lucide="file-plus-2"></i><span>新增</span></button>
                    <button class="asset-btn ${promptManageMode ? 'primary' : ''}" type="button" data-prompt-manage><i data-lucide="list-checks"></i><span>${promptManageMode ? '完成管理' : '批量管理'}</span></button>
                </div>
            </div>
            <div class="manage-tools">
                <span>已选择 ${selectedPromptIds.size} 条提示词，支持拖拽框选或逐个勾选。</span>
                <div class="asset-tools">
                    <button class="asset-btn" type="button" data-prompt-select-all ${items.length && !readonly ? '' : 'disabled'}><i data-lucide="check-square"></i><span>全选</span></button>
                    <button class="asset-btn" type="button" data-prompt-clear-selection ${selectedPromptIds.size ? '' : 'disabled'}><i data-lucide="square"></i><span>清空</span></button>
                    <button class="asset-btn danger ${pendingBatchDelete === 'prompt' ? 'detail-confirm' : ''}" type="button" data-prompt-delete-selected ${readonly || !selectedPromptIds.size ? 'disabled' : ''}><i data-lucide="trash-2"></i><span>${pendingBatchDelete === 'prompt' ? '确认删除' : '删除所选'}</span></button>
                </div>
            </div>
            <div class="content-scroll">
                ${items.length ? `<div class="prompt-list">${items.map(item => renderPromptRow(item, readonly)).join('')}</div>` : `<div class="empty-state">${escapeHtml(promptEmptyText)}</div>`}
            </div>
        </section>
        <aside class="asset-panel asset-detail">
            ${renderPromptDetail(detail, readonly)}
        </aside>
    `;
}
function renderPromptTreeBranch(lib){
    const isActiveLib = lib.id === activePromptLibraryId;
    const cats = Array.isArray(lib.categories) && lib.categories.length ? lib.categories : activePromptCategories();
    const libId = escapeAttr(lib.id);
    const readonly = Boolean(lib.readonly);
    const showLibActions = isActiveLib && promptTreeFocus === 'library';
    return `<div class="tree-branch ${isActiveLib ? 'expanded' : ''}">
        <button class="tree-row tree-parent ${isActiveLib ? 'contains-active' : ''} ${showLibActions ? 'active' : ''}" type="button" data-prompt-lib="${libId}">
            <span class="tree-row-icon"><i data-lucide="${lib.id === 'system' ? 'sparkles' : 'book-open'}"></i></span>
            <span class="tree-row-name">${escapeHtml(lib.name || '提示词库')}</span>
            <span class="tree-row-count">${(lib.items || []).length}</span>
        </button>
        ${showLibActions ? renderPromptTreeActionBar('library') : ''}
        <div class="tree-children">
            <button class="tree-row tree-child ${isActiveLib && activePromptCategory === 'all' && promptTreeFocus === 'category' ? 'active' : ''}" type="button" data-prompt-cat="all" data-prompt-cat-lib="${libId}">
                <span class="tree-elbow"></span>
                <span class="tree-row-icon"><i data-lucide="layout-list"></i></span>
                <span class="tree-row-name">全部提示词</span>
                <span class="tree-row-count">${promptCountForCategory('all', lib)}</span>
            </button>
            ${cats.map(cat => {
                const active = isActiveLib && cat.id === activePromptCategory && promptTreeFocus === 'category';
                return `<button class="tree-row tree-child ${active ? 'active' : ''}" type="button" data-prompt-cat="${escapeAttr(cat.id)}" data-prompt-cat-lib="${libId}">
                <span class="tree-elbow"></span>
                <span class="tree-row-icon"><i data-lucide="tag"></i></span>
                <span class="tree-row-name">${escapeHtml(cat.name || promptCategoryLabel(cat.id))}</span>
                <span class="tree-row-count">${promptCountForCategory(cat.id, lib)}</span>
            </button>${active ? renderPromptTreeActionBar('category') : ''}`;
            }).join('')}
        </div>
    </div>`;
}
function renderPromptTreeActionBar(kind){
    const editHtml = renderPromptTreeInlineEdit(kind);
    if(editHtml) return editHtml;
    if(kind === 'library'){
        const lib = activePromptLibrary();
        const isSystem = isSystemPromptLibrary(lib);
        const deleteKey = `prompt-lib:${lib?.id || ''}`;
        return `<div class="tree-action-bar library-actions">
            <button type="button" data-prompt-cat-new><i data-lucide="folder-plus"></i><span>新分组</span></button>
            <button type="button" data-prompt-lib-rename><i data-lucide="pencil"></i><span>重命名</span></button>
            ${isSystem ? '' : `<button type="button" class="danger ${pendingTreeDelete === deleteKey ? 'detail-confirm' : ''}" data-prompt-lib-delete><i data-lucide="trash-2"></i><span>${pendingTreeDelete === deleteKey ? '确认删除' : '删除库'}</span></button>`}
        </div>`;
    }
    if(activePromptCategory === 'all' || PROMPT_BUILTIN_CATEGORY_IDS.has(activePromptCategory)){
        return `<div class="tree-action-bar child-actions muted-actions"><span><i data-lucide="lock"></i>内置分组不可编辑</span></div>`;
    }
    const deleteKey = `prompt-cat:${activePromptCategory}`;
    return `<div class="tree-action-bar child-actions">
        <button type="button" data-prompt-cat-rename><i data-lucide="pencil"></i><span>重命名</span></button>
        <button type="button" class="danger ${pendingTreeDelete === deleteKey ? 'detail-confirm' : ''}" data-prompt-cat-delete><i data-lucide="trash-2"></i><span>${pendingTreeDelete === deleteKey ? '确认删除' : '删除'}</span></button>
    </div>`;
}
function renderPromptTreeInlineEdit(kind){
    if(!promptTreeEdit) return '';
    const expectedKinds = kind === 'library' ? ['library-new', 'library-rename', 'category-new'] : ['category-new', 'category-rename'];
    if(!expectedKinds.includes(promptTreeEdit.kind)) return '';
    const label = promptTreeEdit.label || '名称';
    return `<div class="tree-inline-edit ${kind === 'category' ? 'child-actions' : 'library-actions'}">
        <input id="promptTreeEditInput" type="text" value="${escapeAttr(promptTreeEdit.value || '')}" placeholder="${escapeAttr(label)}">
        <button type="button" class="primary" data-prompt-tree-edit-save><i data-lucide="check"></i><span>保存</span></button>
        <button type="button" data-prompt-tree-edit-cancel><i data-lucide="x"></i><span>取消</span></button>
    </div>`;
}
function renderPromptRow(item, readonly){
    return `<article class="prompt-row ${item.id === selectedPromptId ? 'active' : ''}" data-prompt-row="${escapeAttr(item.id)}">
        <input class="prompt-row-check" type="checkbox" data-prompt-check="${escapeAttr(item.id)}" ${selectedPromptIds.has(item.id) ? 'checked' : ''} ${readonly ? 'disabled' : ''}>
        <div class="prompt-row-main">
            <div class="prompt-row-title"><strong>${escapeHtml(item.name || '提示词')}</strong><span class="prompt-tag">${escapeHtml(promptCategoryLabel(item.category || 'custom'))}</span></div>
            <div class="prompt-row-scene">${escapeHtml(item.scene || '未填写用途说明')}</div>
            <div class="prompt-row-text">${escapeHtml(item.positive || '')}</div>
        </div>
    </article>`;
}
function renderPromptDetail(item, readonly){
    if(promptCreateMode && !readonly){
        return `
            <div class="panel-head">
                <div class="panel-title"><strong>新增提示词</strong><span>保存到当前提示词库</span></div>
                <div class="panel-actions">
                    <button class="asset-btn primary" type="button" data-prompt-create-save><i data-lucide="check"></i><span>保存</span></button>
                    <button class="asset-icon-btn" type="button" data-prompt-edit-cancel title="取消"><i data-lucide="x"></i></button>
                </div>
            </div>
            <div class="detail-scroll">
                <div class="inline-edit-form">
                    <label class="inline-edit-field"><span>名称</span><input id="promptEditName" type="text" value="" placeholder="提示词名称"></label>
                    <label class="inline-edit-field"><span>用途说明</span><textarea id="promptEditScene" placeholder="用途说明"></textarea></label>
                    <label class="inline-edit-field"><span>正向提示词</span><textarea id="promptEditPositive" placeholder="正向提示词"></textarea></label>
                    <label class="inline-edit-field"><span>负向提示词</span><textarea id="promptEditNegative" placeholder="负向提示词"></textarea></label>
                </div>
            </div>
        `;
    }
    if(!item) return `<div class="panel-head"><div class="panel-title"><strong>提示词预览</strong><span>选择一条提示词查看全文</span></div></div><div class="detail-scroll"><div class="detail-empty"><i data-lucide="text-cursor-input"></i><span>暂无可预览提示词</span></div></div>`;
    if(promptEditMode && item.id === selectedPromptId && !readonly){
        return `
            <div class="panel-head">
                <div class="panel-title"><strong>编辑提示词</strong><span>在当前库内保存</span></div>
                <div class="panel-actions">
                    <button class="asset-btn primary" type="button" data-prompt-edit-save="${escapeAttr(item.id)}"><i data-lucide="check"></i><span>保存</span></button>
                    <button class="asset-icon-btn" type="button" data-prompt-edit-cancel title="取消"><i data-lucide="x"></i></button>
                </div>
            </div>
            <div class="detail-scroll">
                <div class="inline-edit-form">
                    <label class="inline-edit-field"><span>名称</span><input id="promptEditName" type="text" value="${escapeAttr(item.name || '')}" placeholder="提示词名称"></label>
                    <label class="inline-edit-field"><span>用途说明</span><textarea id="promptEditScene" placeholder="用途说明">${escapeHtml(item.scene || '')}</textarea></label>
                    <label class="inline-edit-field"><span>正向提示词</span><textarea id="promptEditPositive" placeholder="正向提示词">${escapeHtml(item.positive || '')}</textarea></label>
                    <label class="inline-edit-field"><span>负向提示词</span><textarea id="promptEditNegative" placeholder="负向提示词">${escapeHtml(item.negative || '')}</textarea></label>
                </div>
            </div>
        `;
    }
    const params = item.params && typeof item.params === 'object' ? Object.entries(item.params) : [];
    return `
        <div class="panel-head">
            <div class="panel-title"><strong>提示词预览</strong><span>${escapeHtml(promptCategoryLabel(item.category || 'custom'))}</span></div>
            <div class="panel-actions">
                <button class="asset-icon-btn" type="button" data-prompt-edit-start="${escapeAttr(item.id)}" ${readonly ? 'disabled' : ''} title="编辑"><i data-lucide="pencil"></i></button>
                <button class="asset-icon-btn danger ${pendingDeletePromptId === item.id ? 'detail-confirm' : ''}" type="button" data-prompt-delete="${escapeAttr(item.id)}" ${readonly ? 'disabled' : ''} title="${pendingDeletePromptId === item.id ? '再次点击确认删除' : '删除'}"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
        <div class="detail-scroll">
            <div class="prompt-detail-head">
                <div class="prompt-detail-title">${escapeHtml(item.name || '提示词')}</div>
                <div class="prompt-detail-scene">${escapeHtml(item.scene || '未填写用途说明')}</div>
            </div>
            <section class="prompt-block">
                <div class="prompt-block-head"><span>正向提示词</span><span>${String(item.positive || '').length} 字符</span></div>
                <div class="prompt-block-body">${escapeHtml(item.positive || '未填写')}</div>
            </section>
            <section class="prompt-block">
                <div class="prompt-block-head"><span>负向提示词</span><span>${String(item.negative || '').length} 字符</span></div>
                <div class="prompt-block-body negative">${escapeHtml(item.negative || '未填写')}</div>
            </section>
            ${params.length ? `<div class="params-list">${params.map(([key, value]) => `<div class="param-row"><strong>${escapeHtml(key)}</strong><span>${escapeHtml(value)}</span></div>`).join('')}</div>` : ''}
        </div>
    `;
}
async function createPromptLibrary(){
    const name = window.prompt('提示词库名称', '新提示词库');
    if(!String(name || '').trim()) return;
    const data = await apiJson('/api/prompt-libraries', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
    promptLibrary = data.library || promptLibrary;
    activePromptLibraryId = data.prompt_library?.id || activePromptLibraryId;
    activePromptCategory = 'all';
    selectedPromptId = '';
    render();
}
async function savePromptTreeEdit(){
    if(!promptTreeEdit) return;
    const name = document.getElementById('promptTreeEditInput')?.value || '';
    if(!String(name || '').trim()){
        setStatus('名称不能为空');
        return;
    }
    let data = null;
    if(promptTreeEdit.kind === 'library-new'){
        data = await apiJson('/api/prompt-libraries', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
        promptLibrary = data.library || promptLibrary;
        activePromptLibraryId = data.prompt_library?.id || activePromptLibraryId;
        activePromptCategory = 'all';
        promptTreeFocus = 'library';
    } else if(promptTreeEdit.kind === 'library-rename'){
        const lib = activePromptLibrary();
        if(!lib) return;
        data = await apiJson(`/api/prompt-libraries/${encodeURIComponent(lib.id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
        promptLibrary = data.library || promptLibrary;
        promptTreeFocus = 'library';
    } else if(promptTreeEdit.kind === 'category-new'){
        const lib = activePromptLibrary();
        data = await apiJson('/api/prompt-libraries/categories', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib?.id || 'system', name})});
        promptLibrary = data.library || promptLibrary;
        activePromptCategory = data.category?.id || activePromptCategory;
        promptTreeFocus = 'category';
    } else if(promptTreeEdit.kind === 'category-rename'){
        data = await apiJson(`/api/prompt-libraries/categories/${encodeURIComponent(activePromptCategory)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
        promptLibrary = data.library || promptLibrary;
        promptTreeFocus = 'category';
    }
    promptTreeEdit = null;
    pendingTreeDelete = '';
    render();
    setStatus('已保存');
}
async function deletePromptCategory(){
    if(activePromptCategory === 'all' || PROMPT_BUILTIN_CATEGORY_IDS.has(activePromptCategory)){
        setStatus('内置分组不能删除');
        return;
    }
    const key = `prompt-cat:${activePromptCategory}`;
    if(pendingTreeDelete !== key){
        pendingTreeDelete = key;
        promptTreeEdit = null;
        render();
        setStatus('再次点击确认删除分组');
        return;
    }
    const data = await apiJson(`/api/prompt-libraries/categories/${encodeURIComponent(activePromptCategory)}`, {method:'DELETE'});
    promptLibrary = data.library || promptLibrary;
    activePromptCategory = 'all';
    pendingTreeDelete = '';
    render();
    setStatus('分组已删除');
}
async function renamePromptLibrary(){
    const lib = activePromptLibrary();
    const name = window.prompt('提示词库名称', lib?.name || '');
    if(!lib || !String(name || '').trim()) return;
    const data = await apiJson(`/api/prompt-libraries/${encodeURIComponent(lib.id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})});
    promptLibrary = data.library || promptLibrary;
    render();
}
async function deletePromptLibrary(){
    const lib = activePromptLibrary();
    if(!lib) return;
    if(isSystemPromptLibrary(lib)){ setStatus('系统提示词库不能删除'); return; }
    const key = `prompt-lib:${lib.id}`;
    if(pendingTreeDelete !== key){
        pendingTreeDelete = key;
        promptTreeEdit = null;
        render();
        setStatus('再次点击确认删除提示词库');
        return;
    }
    const data = await apiJson(`/api/prompt-libraries/${encodeURIComponent(lib.id)}`, {method:'DELETE'});
    promptLibrary = data.library || promptLibrary;
    activePromptLibraryId = promptLibrary.active_library_id || promptLibraries()[0]?.id || 'system';
    activePromptCategory = 'all';
    selectedPromptId = '';
    selectedPromptIds.clear();
    pendingTreeDelete = '';
    render();
    setStatus('提示词库已删除');
}
async function createPromptItem(){
    const lib = activePromptLibrary();
    if(!lib) return;
    const name = window.prompt('提示词名称', '新提示词');
    if(!String(name || '').trim()) return;
    const scene = window.prompt('用途说明', '') || '';
    const positive = window.prompt('正向提示词内容', '');
    if(!String(positive || '').trim()) return;
    const negative = window.prompt('负向提示词内容', '') || '';
    const category = activePromptCategory === 'all' ? 'custom' : activePromptCategory;
    const data = await apiJson('/api/prompt-libraries/items', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib.id, name, positive, negative, category, scene})});
    promptLibrary = data.library || promptLibrary;
    selectedPromptId = data.item?.id || selectedPromptId;
    render();
}
async function savePromptCreate(){
    const lib = activePromptLibrary();
    const name = document.getElementById('promptEditName')?.value || '';
    const scene = document.getElementById('promptEditScene')?.value || '';
    const positive = document.getElementById('promptEditPositive')?.value || '';
    const negative = document.getElementById('promptEditNegative')?.value || '';
    if(!lib) return;
    if(!String(name || '').trim() || !String(positive || '').trim()){
        setStatus('名称和正向提示词不能为空');
        return;
    }
    const category = activePromptCategory === 'all' ? 'custom' : activePromptCategory;
    const data = await apiJson('/api/prompt-libraries/items', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib.id, name, positive, negative, category, scene})});
    promptLibrary = data.library || promptLibrary;
    selectedPromptId = data.item?.id || selectedPromptId;
    promptCreateMode = false;
    render();
    setStatus('提示词已新增');
}
async function editPromptItem(id){
    const item = findPromptItem(id);
    const lib = activePromptLibrary();
    if(!item || !lib) return;
    const name = window.prompt('提示词名称', item.name || '');
    if(!String(name || '').trim()) return;
    const scene = window.prompt('用途说明', item.scene || '') || '';
    const positive = window.prompt('正向提示词内容', item.positive || '');
    if(!String(positive || '').trim()) return;
    const negative = window.prompt('负向提示词内容', item.negative || '') || '';
    const data = await apiJson(`/api/prompt-libraries/items/${encodeURIComponent(id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib.id, name, positive, negative, category:item.category || 'custom', scene})});
    promptLibrary = data.library || promptLibrary;
    selectedPromptId = id;
    render();
}
async function savePromptEdit(id){
    const item = findPromptItem(id);
    const lib = activePromptLibrary();
    const name = document.getElementById('promptEditName')?.value || '';
    const scene = document.getElementById('promptEditScene')?.value || '';
    const positive = document.getElementById('promptEditPositive')?.value || '';
    const negative = document.getElementById('promptEditNegative')?.value || '';
    if(!item || !lib) return;
    if(!String(name || '').trim() || !String(positive || '').trim()){
        setStatus('名称和正向提示词不能为空');
        return;
    }
    const data = await apiJson(`/api/prompt-libraries/items/${encodeURIComponent(id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib.id, name, positive, negative, category:item.category || 'custom', scene})});
    promptLibrary = data.library || promptLibrary;
    selectedPromptId = id;
    promptEditMode = false;
    render();
    setStatus('提示词已保存');
}
async function deletePromptItem(id){
    const item = findPromptItem(id);
    if(!item) return;
    const data = await apiJson(`/api/prompt-libraries/items/${encodeURIComponent(id)}`, {method:'DELETE'});
    promptLibrary = data.library || promptLibrary;
    selectedPromptIds.delete(id);
    if(selectedPromptId === id) selectedPromptId = '';
    pendingDeletePromptId = '';
    render();
    setStatus('提示词已删除');
}
async function deleteSelectedPrompts(){
    if(!selectedPromptIds.size) return;
    if(pendingBatchDelete !== 'prompt'){
        pendingBatchDelete = 'prompt';
        render();
        setStatus('再次点击确认删除所选提示词');
        return;
    }
    const ids = [...selectedPromptIds];
    const data = await apiJson('/api/prompt-libraries/items/delete', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids})});
    promptLibrary = data.library || promptLibrary;
    if(ids.includes(selectedPromptId)) selectedPromptId = '';
    selectedPromptIds.clear();
    pendingBatchDelete = '';
    render();
}
