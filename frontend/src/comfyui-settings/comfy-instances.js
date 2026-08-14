// comfyui-settings 页面 —— ComfyUI 实例管理子系统（拆分自 static/js/comfyui-settings.js）。
//
// 范围：用户可以配置多个 ComfyUI 服务实例（地址 + 备注），供工作流运行
// 时选择连接哪一个。加载/渲染实例列表（loadComfyInstances/
// renderComfyInstances）、新增/更新/删除一条实例配置（addComfyInstance/
// updateComfyInstance/removeComfyInstance）、保存整份实例列表到后端
// （saveComfyInstances）。这是页面里唯一跟"工作流编辑"完全解耦的独立
// 子系统，没有依赖 currentWorkflow/currentConfig 等工作流编辑状态。
//
// 经典 <script>，非 ES module：跟画布/api-settings/asset-manager
// 同样的方法论（见 frontend/README.md），comfyui-settings.html 里的
// 内联 onclick 依赖 window 全局函数自动挂载。
//
// 依赖 main.js 保留的核心状态和函数：comfyInstances（实例列表状态）、
// tr/tf（i18n 文本）、setStatus/escapeHtml/escapeAttr（通用工具）。

async function loadComfyInstances(){
    try {
        const data = await fetch('/api/comfyui/instances').then(r => r.json());
        comfyInstances = Array.isArray(data.instances) ? data.instances : [];
        renderComfyInstances();
    } catch(e){ console.error(e); }
}
function renderComfyInstances(){
    const el = document.getElementById('comfyInstancesList');
    if(!el) return;
    el.innerHTML = comfyInstances.map((addr, i) => `
        <div style="display:flex;align-items:center;gap:6px;padding:4px;border:1px solid var(--line);border-radius:9px;background:var(--soft)">
            <span style="width:18px;text-align:center;font-size:10.5px;color:var(--faint);font-weight:800">${i + 1}</span>
            <input class="small-input" type="text" value="${escapeAttr(addr)}" placeholder="host:port 或 https://host" oninput="updateComfyInstance(${i}, this.value)" style="flex:1;height:28px;padding:0 8px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--text);font-size:12px;font-family:ui-monospace,Menlo,monospace">
            <button class="opt-del" type="button" onclick="removeComfyInstance(${i})" title="删除"><i data-lucide="x" class="w-3 h-3"></i></button>
        </div>
    `).join('');
    refreshIcons();
}
function addComfyInstance(){
    comfyInstances = [...comfyInstances, ''];
    renderComfyInstances();
}
function updateComfyInstance(index, value){
    comfyInstances[index] = value;
}
function removeComfyInstance(index){
    comfyInstances = comfyInstances.filter((_, i) => i !== index);
    renderComfyInstances();
}
async function saveComfyInstances(){
    const cleaned = comfyInstances.map(s => String(s||'').trim()).filter(Boolean);
    if(!cleaned.length){ alert('请至少填一个 ComfyUI 后端地址'); return; }
    setStatus('保存中...');
    try {
        const res = await fetch('/api/comfyui/instances', {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ instances: cleaned })
        });
        if(!res.ok) throw new Error((await res.json()).detail || '保存失败');
        const data = await res.json();
        comfyInstances = data.instances || cleaned;
        renderComfyInstances();
        try { new BroadcastChannel('studio-api').postMessage({ type: 'comfy-instances-changed' }); } catch(e) {}
        try { window.parent?.postMessage({ type: 'comfy-instances-changed' }, '*'); } catch(e) {}
        setStatus('ComfyUI 后端地址已保存');
    } catch(e){
        alert(e.message || '保存失败');
        setStatus('保存失败');
    }
}
