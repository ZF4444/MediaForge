// API 设置页 —— ComfyUI 服务地址管理。
// 地址属于连接配置，工作流设置页只保留工作流字段与 AI 应用配置。
let comfyInstances = [];

async function loadComfyInstances(){
    try {
        const data = await fetch('/api/comfyui/instances').then(r => r.json());
        comfyInstances = Array.isArray(data.instances) ? data.instances : [];
        renderComfyInstances();
    } catch(error){ console.error(error); }
}

function renderComfyInstances(){
    const el = document.getElementById('comfyInstancesList');
    if(!el) return;
    el.innerHTML = comfyInstances.map((address, index) => `
        <div class="comfy-instance-row">
            <span class="comfy-instance-number">${index + 1}</span>
            <input class="comfy-instance-input" type="text" value="${escapeAttr(address)}" placeholder="host:port 或 https://host" oninput="updateComfyInstance(${index}, this.value)">
            <button class="icon-btn" type="button" onclick="removeComfyInstance(${index})" title="删除"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
        </div>
    `).join('');
    refreshIcons();
}

function addComfyInstance(){ comfyInstances = [...comfyInstances, '']; renderComfyInstances(); }
function updateComfyInstance(index, value){ comfyInstances[index] = value; }
function removeComfyInstance(index){ comfyInstances = comfyInstances.filter((_, i) => i !== index); renderComfyInstances(); }

async function saveComfyInstances(){
    const cleaned = comfyInstances.map(value => String(value || '').trim()).filter(Boolean);
    if(!cleaned.length){ alert('请至少填一个 ComfyUI 后端地址'); return; }
    setStatus('保存中...');
    try {
        const response = await fetch('/api/comfyui/instances', {
            method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({instances:cleaned})
        });
        if(!response.ok) throw new Error((await response.json()).detail || '保存失败');
        const data = await response.json();
        comfyInstances = data.instances || cleaned;
        renderComfyInstances();
        try { new BroadcastChannel('studio-api').postMessage({type:'comfy-instances-changed'}); } catch(error) {}
        setStatus('ComfyUI 后端地址已保存');
    } catch(error){ setStatus(error.message || '保存失败'); }
}

window.addEventListener('studio-lang-change', renderComfyInstances);
window.addEventListener('load', loadComfyInstances);
