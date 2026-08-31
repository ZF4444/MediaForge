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
        const comfyItems = (comfy.workflows || []).map(item => ({source:'comfyui', id:item.name, title:item.title || item.name, description:'本地 ComfyUI 工作流', media:mediaFor('comfyui', item.name, item.media), enabled:item.enabled !== false}));
        const rhItems = (configuration.resources || []).filter(item => item.kind === 'runninghub_app').map(item => ({source:'runninghub', id:item.settings?.id || item.settings?.appId || item.settings?.webappId || item.id, title:item.settings?.title || item.name || `RH 应用 ${String(item.id || '').slice(-6)}`, description:item.settings?.note || 'RunningHub AI 应用', media:mediaFor('runninghub', item.settings?.id || item.id, item.settings?.media), enabled:item.enabled !== false}));
        workflowItems = [...comfyItems, ...rhItems].filter(item => item.id);
        workflowCount.textContent = `${workflowItems.length} 个`;
        workflowList.innerHTML = workflowItems.map(item => `<article class="workflow-row ${item.enabled ? '' : 'is-disabled'}" data-source="${esc(item.source)}" data-id="${esc(item.id)}"><button class="workflow-row-main" type="button"><span class="workflow-row-icon ${item.source}">${item.source === 'comfyui' ? 'C' : 'RH'}</span><span class="workflow-row-copy"><strong>${esc(item.title)}</strong><small>${esc(item.description)}</small></span><span class="workflow-row-tags"><em>${item.source === 'comfyui' ? 'ComfyUI' : 'RH 应用'}</em><em>${item.media === 'video' ? '视频' : '图片'}</em></span><span class="row-arrow">›</span></button><div class="workflow-row-control"><span class="workflow-status">${item.enabled ? '已启用' : '已停用'}</span><button class="workflow-switch" type="button" role="switch" aria-checked="${item.enabled ? 'true' : 'false'}" aria-label="${esc(item.enabled ? '停用' : '启用')} ${esc(item.title)}"><span></span></button></div></article>`).join('');
        workflowList.querySelectorAll('.workflow-row-main').forEach(row => row.addEventListener('click', () => { const item=row.closest('.workflow-row'); openConfig(item.dataset.source, item.dataset.id); }));
        workflowList.querySelectorAll('.workflow-switch').forEach(toggle => toggle.addEventListener('click', async event => { event.stopPropagation(); const row=toggle.closest('.workflow-row'); const item=workflowItems.find(value => value.source===row.dataset.source && value.id===row.dataset.id); if(item) await toggleWorkflow(item, toggle); }));
        window.lucide?.createIcons();
    } catch { workflowList.innerHTML = '<div class="error-state">工作流读取失败，请稍后重试。</div>'; }
}
async function toggleWorkflow(item, toggle){
    const next = !item.enabled;
    toggle.disabled = true;
    try {
        if(item.source === 'comfyui'){
            const current = await fetch(`/api/workflows/${encodeURIComponent(item.id)}`).then(r => r.ok ? r.json() : Promise.reject(new Error('读取工作流失败')));
            const response = await fetch(`/api/workflows/${encodeURIComponent(item.id)}/config`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...current.config, enabled:next})});
            if(!response.ok) throw new Error('保存启用状态失败');
        } else {
            const response = await fetch('/api/ai/configuration');
            const config = await response.json();
            if(!response.ok) throw new Error(config.detail || '读取资源失败');
            const resources = (config.resources || []).map(resource => {
                const id=resource.settings?.id || resource.settings?.appId || resource.settings?.webappId || resource.id;
                return resource.kind==='runninghub_app' && String(id)===String(item.id) ? {...resource, enabled:next} : resource;
            });
            const saved = await fetch('/api/ai/configuration',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...config,resources})});
            if(!saved.ok) throw new Error('保存启用状态失败');
        }
        item.enabled=next;
        await loadWorkflows();
    } catch(error) {
        toggle.disabled=false;
        alert(error.message || '保存启用状态失败');
    }
}
document.getElementById('newWorkflowBtn').addEventListener('click', () => openConfig());
document.getElementById('refreshWorkflowsBtn').addEventListener('click', loadWorkflows);
if(window.StudioTheme) window.StudioTheme.apply();
loadWorkflows();
