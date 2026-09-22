// asset-manager 页面 —— 提示词库管理子系统（拆分自 static/js/asset-manager.js）。
//
// 范围：提示词库/分类的读取（promptLibraries/isSystemPromptLibrary/
// activePromptLibrary/activePromptCategories/currentPromptItems/
// findPromptItem/selectedPrompt）、提示词管理主面板渲染（renderPromptManager，
// 两栏布局：左侧树形结构直接展开到条目层级——库 > 分组 > 提示词叶子节点
// (renderPromptTreeBranch/renderPromptTreeCategoryBranch/renderPromptTreeItem)，
// 右侧详情/编辑/新增表单 renderPromptDetail）、提示词库/分类的创建/改名/
// 删除（createPromptLibrary/renamePromptLibrary/deletePromptLibrary/
// deletePromptCategory）、单条提示词的创建/编辑/删除
// （createPromptItem/savePromptCreate/editPromptItem/savePromptEdit/
// deletePromptItem/deleteSelectedPrompts）。
//
// 分组展开状态由 promptTreeExpandedCategories（main.js 声明的
// Set<`${libId}::${categoryId}`>）跟踪，默认只展开当前激活的库+分组，
// 有搜索词时自动展开所有含匹配条目的分组（见 normalizePromptState）。
//
// isSystemPromptLibrary 判断是否是内置的系统提示词库（不可删除/改名，
// 见 promptCategoryLabel 的分类标签映射）。
//
// 经典 <script>，非 ES module，原因同 storage-manager.js。
//
// 依赖 main.js 保留的核心状态和函数：promptLibrary/activePromptLibraryId/
// activePromptCategory/selectedPromptId/selectedPromptIds/promptQuery/
// promptManageMode/promptEditMode/promptCreateMode/
// pendingDeletePromptId/promptTreeEdit/promptTreeFocus/
// promptTreeExpandedCategories（提示词库子系统的全部可变状态）、
// escapeHtml/escapeAttr/apiJson/setStatus/refreshIcons（通用工具）、
// render（主渲染入口）。

function promptLibraries(){
    const libs = Array.isArray(promptLibrary.libraries) ? promptLibrary.libraries.filter(Boolean) : [];
    if(!libs.length) return [{id:'system', name:'系统提示词库', system:true, items:[], categories:[]}];
    const system = libs.filter(lib => ['system', 'caption', 'expand'].includes(String(lib.id || '')) || lib.system === true || lib.readonly === true);
    const others = libs.filter(lib => !system.includes(lib));
    return [...system, ...others];
}
function isSystemPromptLibrary(lib){
    return !lib || ['system', 'caption', 'expand'].includes(String(lib.id || '')) || lib.system === true || lib.readonly === true;
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
    // "我的"(custom) 不是恒定展示的默认分类，只有该分类下确实存在条目
    // 时后端才会把它附加进 lib.categories（见 normalize_prompt_template_categories）。
    return [
        {id:'builtin', name:'内置'}
    ];
}
const PROMPT_BUILTIN_CATEGORY_IDS = new Set(['builtin','custom']);
function promptCategoryLabel(category='custom'){
    const found = activePromptCategories().find(cat => cat.id === category);
    if(found?.name) return found.name;
    const map = {builtin:'内置', mine:'我的', custom:'我的'};
    return map[category] || category || '自定义';
}
function currentPromptItems(){
    // 树形结构下，用户可以同时展开多个分组、跨分组选中/操作条目，
    // 因此这里不再按 activePromptCategory 过滤，只应用搜索词；
    // 分类过滤的职责交给 promptItemsForCategory（用于树形节点内部渲染）。
    return promptItemsForCategory(activePromptLibrary(), 'all');
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
    // "全部提示词"伪分组已移除，activePromptCategory 必须指向一个真实
    // 存在的分类；找不到匹配项时（比如切库后分类集合变了）回退到该库
    // 第一个分类，没有任何分类时留空（新建的空库会是这种情况）。
    if(!cats.some(cat => cat.id === activePromptCategory)) activePromptCategory = cats[0]?.id || '';
    const items = currentPromptItems();
    if(selectedPromptId && !items.some(item => item.id === selectedPromptId)) selectedPromptId = '';
    if(!selectedPromptId && items.length) selectedPromptId = items[0].id;
    selectedPromptIds = new Set([...selectedPromptIds].filter(id => findPromptItem(id)));
    // 树形结构直接展开到条目层级：只在"激活库/分类确实发生了切换"时
    // 才自动展开对应节点（让新选中的内容可见），而不是每次 render() 都
    // 无条件展开——否则用户手动点击折叠箭头后，紧跟着的 render() 会
    // 立刻把这个节点重新展开，导致折叠操作看起来完全不生效。
    if(!promptTreeExpandedCategories) promptTreeExpandedCategories = new Set();
    const activeKey = promptTreeCategoryKey(activePromptLibraryId, activePromptCategory);
    if(activeKey !== promptTreeLastActiveKey){
        promptTreeExpandedCategories.add(activeKey);
        promptTreeLastActiveKey = activeKey;
    }
    if(promptQuery.trim()){
        for(const promptLib of libs){
            const libCats = Array.isArray(promptLib.categories) && promptLib.categories.length ? promptLib.categories : activePromptCategories();
            for(const cat of libCats){
                if(promptItemsForCategory(promptLib, cat.id).length){
                    promptTreeExpandedCategories.add(promptTreeCategoryKey(promptLib.id, cat.id));
                }
            }
        }
    }
}
function promptTreeCategoryKey(libId, categoryId){
    return `${libId}::${categoryId}`;
}
function promptItemsForCategory(lib, categoryId){
    const query = promptQuery.trim().toLowerCase();
    return (lib?.items || []).filter(item => {
        if(categoryId !== 'all' && (item.category || 'custom') !== categoryId) return false;
        if(!query) return true;
        return [item.name, item.scene, item.prompt, item.category].join(' ').toLowerCase().includes(query);
    });
}
function renderPromptManager(){
    normalizePromptState();
    const libs = promptLibraries();
    const lib = activePromptLibrary();
    // readonly 只控制"整个库/内置条目"级别的只读态（改名、删除库、
    // 编辑或删除内置条目）：普通用户在保留库（system/caption/expand）下
    // 仍然可以新增自己的提示词，新条目只挂在账户名下，不影响全局内置内容
    // （见 app/routers/prompts.py 的 add_prompt_library_item 与
    // _save_prompt_libraries_for 的注释）。
    const readonly = Boolean(lib?.readonly) && !meInfo?.is_admin;
    // "内置"分组本身代表全局共享内容，即使库级 readonly 被新增操作豁免，
    // 停留在"内置"分组下新增仍应该被禁止（新条目不该被误归入内置分类）；
    // 系统管理员可以在内置分组下直接新增内置条目。
    const creatingInBuiltinCategory = activePromptCategory === 'builtin' && !meInfo?.is_admin;
    const items = currentPromptItems();
    const selectableItems = items.filter(item => !item.builtin || meInfo?.is_admin);
    const detail = promptCreateMode ? null : selectedPrompt();
    root.innerHTML = `
        <aside class="asset-panel asset-nav prompt-tree-nav ${promptManageMode ? 'manage-on' : ''}">
            <div class="panel-head">
                <div class="panel-title"><strong>提示词库</strong><span>共 ${items.length} 条提示词</span></div>
                <div class="panel-actions compact-actions">
                    <button class="asset-icon-btn" type="button" data-prompt-lib-new title="新建提示词库"><i data-lucide="plus"></i></button>
                </div>
            </div>
            <div class="content-toolbar">
                <label class="asset-search-wrap"><i data-lucide="search"></i><input id="promptSearch" class="asset-search" type="search" value="${escapeAttr(promptQuery)}" placeholder="搜索名称、说明或正文"></label>
                <div class="asset-tools">
                    <button class="asset-btn primary" type="button" data-prompt-new ${creatingInBuiltinCategory ? 'disabled title="内置分组不支持新增，请切换到其它分组"' : ''}><i data-lucide="file-plus-2"></i><span>新增</span></button>
                    <button class="asset-btn ${promptManageMode ? 'primary' : ''}" type="button" data-prompt-manage><i data-lucide="list-checks"></i><span>${promptManageMode ? '完成管理' : '批量管理'}</span></button>
                </div>
            </div>
            <div class="manage-tools">
                <span>已选择 ${selectedPromptIds.size} 条提示词，支持拖拽框选或逐个勾选。</span>
                <div class="asset-tools">
                    <button class="asset-btn" type="button" data-prompt-select-all ${selectableItems.length ? '' : 'disabled'}><i data-lucide="check-square"></i><span>全选</span></button>
                    <button class="asset-btn" type="button" data-prompt-clear-selection ${selectedPromptIds.size ? '' : 'disabled'}><i data-lucide="square"></i><span>清空</span></button>
                    <button class="asset-btn danger ${pendingBatchDelete === 'prompt' ? 'detail-confirm' : ''}" type="button" data-prompt-delete-selected ${selectedPromptIds.size ? '' : 'disabled'}><i data-lucide="trash-2"></i><span>${pendingBatchDelete === 'prompt' ? '确认删除' : '删除所选'}</span></button>
                </div>
            </div>
            <div class="nav-scroll content-scroll">
                <div class="nav-tree">
                    ${promptTreeEdit?.kind === 'library-new' ? renderPromptTreeInlineRow('library-new') : ''}
                    ${libs.map(item => renderPromptTreeBranch(item)).join('')}
                </div>
            </div>
        </aside>
        <aside class="asset-panel asset-detail">
            <!-- 新增模式（promptCreateMode）不受当前库的 readonly 影响：
                 普通用户在保留库（system/caption/expand）下、或在自己创建
                 的分组里点击"新增"，都应该能新增自己的提示词（只挂账户
                 名下，不影响全局内置内容）。但"内置"分组本身代表全局共享
                 内容，停留在该分组下时仍不允许新增（creatingInBuiltinCategory），
                 需要切到其它分组才能新增；否则新条目会被误归入内置分类。 -->
            ${renderPromptDetail(detail, promptCreateMode ? creatingInBuiltinCategory : (detail ? isPromptItemReadonly(detail) : readonly))}
        </aside>
    `;
}
function isPromptItemReadonly(item){
    // 内置条目（builtin===true）代表全局共享内容，只有系统管理员能编辑/
    // 删除；账户自建条目（builtin===false）任何用户都能管理自己创建的。
    return Boolean(item?.builtin) && !meInfo?.is_admin;
}
function renderPromptTreeBranch(lib){
    const isActiveLib = lib.id === activePromptLibraryId;
    const cats = Array.isArray(lib.categories) && lib.categories.length ? lib.categories : activePromptCategories();
    const libId = escapeAttr(lib.id);
    const isSystem = isSystemPromptLibrary(lib);
    const isRenamingLib = promptTreeEdit?.kind === 'library-rename' && isActiveLib;
    if(isRenamingLib){
        return `<div class="tree-branch expanded">
            ${renderPromptTreeInlineRow('library-rename')}
            <div class="tree-children">
                ${cats.map(cat => renderPromptTreeCategoryBranch(lib, {...cat, icon:'tag'})).join('')}
            </div>
        </div>`;
    }
    const deleteKey = `prompt-lib:${lib?.id || ''}`;
    const confirmingDelete = pendingTreeDelete === deleteKey;
    return `<div class="tree-branch ${isActiveLib ? 'expanded' : ''}">
        <button class="tree-row tree-parent ${isActiveLib ? 'contains-active' : ''}" type="button" data-prompt-lib="${libId}">
            <span class="tree-row-icon"><i data-lucide="${isSystem ? 'sparkles' : 'book-open'}"></i></span>
            <span class="tree-row-name">${escapeHtml(lib.name || '提示词库')}</span>
            <span class="tree-row-count">${(lib.items || []).length}</span>
            <span class="tree-row-actions">
                <span class="tree-action-icon" role="button" tabindex="0" data-prompt-cat-new-for="${libId}" title="新分组"><i data-lucide="folder-plus"></i></span>
                <span class="tree-action-icon" role="button" tabindex="0" data-prompt-lib-rename-for="${libId}" title="重命名"><i data-lucide="pencil"></i></span>
                ${isSystem ? '' : `<span class="tree-action-icon danger ${confirmingDelete ? 'detail-confirm' : ''}" role="button" tabindex="0" data-prompt-lib-delete-for="${libId}" title="${confirmingDelete ? '再次点击确认删除' : '删除库'}"><i data-lucide="trash-2"></i></span>`}
            </span>
        </button>
        <div class="tree-children">
            ${(promptTreeEdit?.kind === 'category-new' && isActiveLib) ? renderPromptTreeInlineRow('category-new') : ''}
            ${cats.map(cat => renderPromptTreeCategoryBranch(lib, {...cat, icon:'tag'})).join('')}
        </div>
    </div>`;
}
function renderPromptTreeCategoryBranch(lib, cat){
    const isActiveLib = lib.id === activePromptLibraryId;
    const libId = escapeAttr(lib.id);
    const isCurrentCategory = isActiveLib && cat.id === activePromptCategory;
    const key = promptTreeCategoryKey(lib.id, cat.id);
    const expanded = promptTreeExpandedCategories.has(key);
    const categoryItems = promptItemsForCategory(lib, cat.id);
    const isRenamingCat = promptTreeEdit?.kind === 'category-rename' && isCurrentCategory;
    if(isRenamingCat){
        return `<div class="tree-branch tree-category-branch ${expanded ? 'expanded' : ''}">
            ${renderPromptTreeInlineRow('category-rename')}
            ${expanded ? `<div class="tree-children tree-items">
                ${categoryItems.length ? categoryItems.map(item => renderPromptTreeItem(lib, item)).join('') : '<div class="tree-empty">暂无提示词</div>'}
            </div>` : ''}
        </div>`;
    }
    // 分组操作按钮（重命名/删除）：
    // - 内置分组（builtin/custom）非管理员不可编辑；管理员可以重命名但
    //   始终不能删除（后端 delete_prompt_library_category 会拒绝）。
    // - 其余自建分组可以重命名和删除。
    let actionsHtml = '';
    if(PROMPT_BUILTIN_CATEGORY_IDS.has(cat.id)){
        actionsHtml = meInfo?.is_admin
            ? `<span class="tree-action-icon" role="button" tabindex="0" data-prompt-cat-rename-for="${escapeAttr(cat.id)}" data-prompt-cat-rename-lib="${libId}" title="重命名"><i data-lucide="pencil"></i></span>`
            : `<span class="tree-action-icon muted" title="内置分组不可编辑"><i data-lucide="lock"></i></span>`;
    } else {
        const deleteKey = `prompt-cat:${cat.id}`;
        const confirmingDelete = pendingTreeDelete === deleteKey;
        actionsHtml = `
            <span class="tree-action-icon" role="button" tabindex="0" data-prompt-cat-rename-for="${escapeAttr(cat.id)}" data-prompt-cat-rename-lib="${libId}" title="重命名"><i data-lucide="pencil"></i></span>
            <span class="tree-action-icon danger ${confirmingDelete ? 'detail-confirm' : ''}" role="button" tabindex="0" data-prompt-cat-delete-for="${escapeAttr(cat.id)}" title="${confirmingDelete ? '再次点击确认删除' : '删除分组'}"><i data-lucide="trash-2"></i></span>
        `;
    }
    return `<div class="tree-branch tree-category-branch ${expanded ? 'expanded' : ''}">
        <button class="tree-row tree-child ${isCurrentCategory ? 'active' : ''}" type="button" data-prompt-cat="${escapeAttr(cat.id)}" data-prompt-cat-lib="${libId}">
            <span class="tree-elbow"></span>
            <span class="tree-toggle" role="button" tabindex="0" data-prompt-cat-toggle="${escapeAttr(key)}" title="${expanded ? '折叠' : '展开'}" aria-disabled="${(categoryItems.length || expanded) ? 'false' : 'true'}">
                <i data-lucide="${expanded ? 'chevron-down' : 'chevron-right'}"></i>
            </span>
            <span class="tree-row-icon"><i data-lucide="${cat.icon || 'tag'}"></i></span>
            <span class="tree-row-name">${escapeHtml(cat.name || promptCategoryLabel(cat.id))}</span>
            <span class="tree-row-count">${categoryItems.length}</span>
            ${actionsHtml ? `<span class="tree-row-actions">${actionsHtml}</span>` : ''}
        </button>
        ${expanded ? `<div class="tree-children tree-items">
            ${categoryItems.length ? categoryItems.map(item => renderPromptTreeItem(lib, item)).join('') : '<div class="tree-empty">暂无提示词</div>'}
        </div>` : ''}
    </div>`;
}
function renderPromptTreeItem(lib, item){
    const readonly = isPromptItemReadonly(item);
    const active = item.id === selectedPromptId && !promptCreateMode;
    return `<button class="tree-row tree-item ${active ? 'active' : ''}" type="button" data-prompt-row="${escapeAttr(item.id)}" data-prompt-row-lib="${escapeAttr(lib.id)}" data-prompt-row-cat="${escapeAttr(item.category || 'custom')}">
        <span class="tree-elbow"></span>
        <input class="tree-item-check" type="checkbox" data-prompt-check="${escapeAttr(item.id)}" ${selectedPromptIds.has(item.id) ? 'checked' : ''} ${readonly ? 'disabled' : ''} onclick="event.stopPropagation()">
        <span class="tree-row-icon"><i data-lucide="text-cursor-input"></i></span>
        <span class="tree-row-name">${escapeHtml(item.name || '提示词')}</span>
    </button>`;
}
function renderPromptTreeInlineRow(kind){
    if(!promptTreeEdit) return '';
    const label = promptTreeEdit.label || '名称';
    // 行内编辑行：整行替换成一个输入框 + 保存/取消图标，跟正常树行保持
    // 一致的缩进和高度，不再单独插入一条撑开树高度的操作条。
    const isLibraryLevel = kind === 'library-new' || kind === 'library-rename';
    return `<div class="tree-row tree-inline-row ${isLibraryLevel ? 'tree-parent' : 'tree-child'}">
        ${isLibraryLevel ? '' : '<span class="tree-elbow"></span>'}
        <input id="promptTreeEditInput" type="text" value="${escapeAttr(promptTreeEdit.value || '')}" placeholder="${escapeAttr(label)}">
        <span class="tree-row-actions">
            <span class="tree-action-icon" role="button" tabindex="0" data-prompt-tree-edit-save title="保存"><i data-lucide="check"></i></span>
            <span class="tree-action-icon" role="button" tabindex="0" data-prompt-tree-edit-cancel title="取消"><i data-lucide="x"></i></span>
        </span>
    </div>`;
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
                    <label class="inline-edit-field"><span>提示词</span><textarea id="promptEditPrompt" placeholder="提示词内容"></textarea></label>
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
                    <label class="inline-edit-field"><span>提示词</span><textarea id="promptEditPrompt" placeholder="提示词内容">${escapeHtml(item.prompt || '')}</textarea></label>
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
                <div class="prompt-block-head"><span>提示词</span><span>${String(item.prompt || '').length} 字符</span></div>
                <div class="prompt-block-body">${escapeHtml(item.prompt || '未填写')}</div>
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
    // 新建库没有任何分组（连"内置"都没有，只有系统库才有），"全部提示词"
    // 伪分组已移除，这里没有可展开的默认分类，留空即可；用户需要先点
    // "新分组"才能开始添加提示词。
    activePromptCategory = '';
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
        // 新建库没有任何分组，"全部提示词"伪分组已移除，这里没有可展开
        // 的默认分类，留空即可（normalizePromptState 会兜底处理）。
        activePromptCategory = '';
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
    if(PROMPT_BUILTIN_CATEGORY_IDS.has(activePromptCategory)){
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
    // "全部提示词"伪分组已移除，删除后回退到该库第一个剩余分类
    // （normalizePromptState 会在渲染前再兜底一次），而不是不再存在的 'all'。
    activePromptCategory = activePromptCategories()[0]?.id || '';
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
    // "全部提示词"伪分组已移除，切换到剩余库后默认展开它的第一个真实
    // 分类（normalizePromptState 会再兜底一次，这里先给个合理初值）。
    activePromptCategory = activePromptCategories()[0]?.id || '';
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
    const prompt = window.prompt('提示词内容', '');
    if(!String(prompt || '').trim()) return;
    const category = activePromptCategory || 'custom';
    const data = await apiJson('/api/prompt-libraries/items', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib.id, name, prompt, category, scene})});
    promptLibrary = data.library || promptLibrary;
    selectedPromptId = data.item?.id || selectedPromptId;
    render();
}
async function savePromptCreate(){
    const lib = activePromptLibrary();
    const name = document.getElementById('promptEditName')?.value || '';
    const scene = document.getElementById('promptEditScene')?.value || '';
    const prompt = document.getElementById('promptEditPrompt')?.value || '';
    if(!lib) return;
    if(!String(name || '').trim() || !String(prompt || '').trim()){
        setStatus('名称和提示词内容不能为空');
        return;
    }
    const category = activePromptCategory || 'custom';
    const data = await apiJson('/api/prompt-libraries/items', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib.id, name, prompt, category, scene})});
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
    const prompt = window.prompt('提示词内容', item.prompt || '');
    if(!String(prompt || '').trim()) return;
    const data = await apiJson(`/api/prompt-libraries/items/${encodeURIComponent(id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib.id, name, prompt, category:item.category || 'custom', scene})});
    promptLibrary = data.library || promptLibrary;
    selectedPromptId = id;
    render();
}
async function savePromptEdit(id){
    const item = findPromptItem(id);
    const lib = activePromptLibrary();
    const name = document.getElementById('promptEditName')?.value || '';
    const scene = document.getElementById('promptEditScene')?.value || '';
    const prompt = document.getElementById('promptEditPrompt')?.value || '';
    if(!item || !lib) return;
    if(!String(name || '').trim() || !String(prompt || '').trim()){
        setStatus('名称和提示词内容不能为空');
        return;
    }
    const data = await apiJson(`/api/prompt-libraries/items/${encodeURIComponent(id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:lib.id, name, prompt, category:item.category || 'custom', scene})});
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
