// 图片反推与提示词扩写任务的规则查询。
//
// 规则仍来自后端的专用提示词库（caption / expand），这是 2026-07-15
// 最终确定的数据模型。该文件保持 classic script，以便与其它智能画布
// 模块共享 promptLibraries 和 promptTemplateOverrides。

function smartRuleTemplateItems(libraryId){
    const hidden = new Set(promptTemplateOverrides.hiddenBuiltinIds || []);
    return promptLibraries.filter(library => library.id === libraryId).flatMap(library => (library.items || [])
        .filter(template => template?.id && template?.positive && !(library.id === 'system' && hidden.has(template.id)))
        .map(template => ({
            ...template,
            ...(library.id === 'system' ? (promptTemplateOverrides.editedBuiltins?.[template.id] || {}) : {}),
            key:`${library.id}:${template.id}`,
            libraryName:library.name || tr('smart.promptTemplateLibrary')
        })));
}

function smartRuleTemplateOptions(libraryId, selectedKey){
    const templates = smartRuleTemplateItems(libraryId);
    if(!templates.length) return `<option value="">${escapeHtml(tr('smart.promptTemplateEmpty'))}</option>`;
    return templates.map(template => `<option value="${escapeAttr(template.key)}" ${template.key === selectedKey ? 'selected' : ''}>${escapeHtml(`${template.libraryName} · ${promptTemplateName(template)}`)}</option>`).join('');
}

function smartRuleTemplateContent(libraryId, selectedKey, fallback){
    const templates = smartRuleTemplateItems(libraryId);
    return (templates.find(template => template.key === selectedKey) || templates[0])?.positive || fallback;
}
