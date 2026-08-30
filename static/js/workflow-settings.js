const workflowList = document.getElementById('workflowList');
const workflowCount = document.getElementById('workflowCount');
let workflowItems = [];
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const savedMeta = () => { try { return JSON.parse(localStorage.getItem('workflow_settings_meta') || '{}'); } catch { return {}; } };
const mediaFor = (source, id, persisted) => persisted === 'video' || persisted === 'image'
    ? persisted : (savedMeta()[`${source}:${id}`]?.media || 'image');

function openConfig(source='comfyui', id=''){
    const query = new URLSearchParams({source});
    if(id) query.set('id', id);
    window.location.href = `/static/workflow-config.html?${query}`;
}
async function loadWorkflows(){
    workflowList.innerHTML = '<div class="loading-state">正在读取工作流…</div>';
    try {
        const [comfyRes, configurationRes] = await Promise.all([fetch('/api/workflows'), fetch('/api/ai/configuration')]);
        const comfy = comfyRes.ok ? await comfyRes.json() : {workflows:[]};
        const configuration = configurationRes.ok ? await configurationRes.json() : {resources:[]};
        const comfyItems = (comfy.workflows || []).map(item => ({source:'comfyui', id:item.name, title:item.title || item.name, description:'本地 ComfyUI 工作流', media:mediaFor('comfyui', item.name, item.media)}));
        const rhItems = (configuration.resources || []).filter(item => item.kind === 'runninghub_app' && item.enabled !== false).map(item => ({source:'runninghub', id:item.settings?.id || item.settings?.appId || item.settings?.webappId || item.id, title:item.settings?.title || item.name || `RH 应用 ${String(item.id || '').slice(-6)}`, description:item.settings?.note || 'RunningHub AI 应用', media:mediaFor('runninghub', item.settings?.id || item.id, item.settings?.media)}));
        workflowItems = [...comfyItems, ...rhItems].filter(item => item.id);
        workflowCount.textContent = `${workflowItems.length} 个`;
        workflowList.innerHTML = workflowItems.map(item => `<button class="workflow-row" type="button" data-source="${esc(item.source)}" data-id="${esc(item.id)}"><span class="workflow-row-icon ${item.source}">${item.source === 'comfyui' ? 'C' : 'RH'}</span><span class="workflow-row-main"><strong>${esc(item.title)}</strong><small>${esc(item.description)}</small></span><span class="workflow-row-tags"><em>${item.source === 'comfyui' ? 'ComfyUI' : 'RH 应用'}</em><em>${item.media === 'video' ? '视频' : '图片'}</em></span><span class="row-arrow">›</span></button>`).join('');
        workflowList.querySelectorAll('.workflow-row').forEach(row => row.addEventListener('click', () => openConfig(row.dataset.source, row.dataset.id)));
    } catch { workflowList.innerHTML = '<div class="error-state">工作流读取失败，请稍后重试。</div>'; }
}
document.getElementById('newWorkflowBtn').addEventListener('click', () => openConfig());
document.getElementById('refreshWorkflowsBtn').addEventListener('click', loadWorkflows);
if(window.StudioTheme) window.StudioTheme.apply();
loadWorkflows();
