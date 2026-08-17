(function(){
    const list=document.getElementById('canvasList'), count=document.getElementById('canvasCount'), form=document.getElementById('createForm'), titleInput=document.getElementById('canvasTitleInput'), refreshBtn=document.getElementById('refreshBtn');
    const escapeHtml=value=>{const node=document.createElement('span');node.textContent=String(value||'');return node.innerHTML;};
    const formatTime=value=>{const date=new Date(Number(value||0));return Number.isNaN(date.getTime())||!Number(value)?'未编辑':date.toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});};
    const openCanvas=id=>{location.href=`/static/canvas.html?id=${encodeURIComponent(id)}`;};
    function render(canvases){
        count.textContent=String(canvases.length);
        if(!canvases.length){list.innerHTML='<div class="empty-state"><div><i data-lucide="layout-grid"></i><p>还没有画布，创建第一张开始创作。</p></div></div>';window.lucide?.createIcons();return;}
        list.innerHTML=canvases.map(canvas=>`<article class="canvas-card"><button class="canvas-open" type="button" data-open-id="${escapeHtml(canvas.id)}" aria-label="打开 ${escapeHtml(canvas.title)}"><span class="canvas-icon"><i data-lucide="sparkles"></i></span><div class="canvas-title">${escapeHtml(canvas.title||'未命名画布')}</div><div class="canvas-meta">${Number(canvas.node_count||0)} 个节点 · ${formatTime(canvas.updated_at||canvas.created_at)}</div></button><div class="card-actions"><button class="card-action" type="button" data-rename-id="${escapeHtml(canvas.id)}" data-title="${escapeHtml(canvas.title||'')}" title="重命名" aria-label="重命名"><i data-lucide="pencil"></i></button><button class="card-action danger" type="button" data-delete-id="${escapeHtml(canvas.id)}" data-title="${escapeHtml(canvas.title||'')}" title="删除" aria-label="删除"><i data-lucide="trash-2"></i></button></div></article>`).join('');
        window.lucide?.createIcons();
    }
    async function loadCanvases(){
        list.innerHTML='<div class="loading">正在加载画布...</div>';
        try{const response=await fetch('/api/canvases');if(!response.ok)throw new Error('load failed');const data=await response.json();render(Array.isArray(data.canvases)?data.canvases:[]);}catch(error){count.textContent='0';list.innerHTML='<div class="empty-state"><div><i data-lucide="circle-alert"></i><p>画布列表加载失败，请刷新后重试。</p></div></div>';window.lucide?.createIcons();}
    }
    async function createCanvas(event){
        event.preventDefault();const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
        try{const response=await fetch('/api/canvases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:titleInput.value.trim()||'新建画布',icon:'sparkles'})});if(!response.ok)throw new Error('create failed');const data=await response.json();if(!data.canvas?.id)throw new Error('missing id');openCanvas(data.canvas.id);}catch(error){window.alert('创建画布失败，请稍后重试。');}finally{submit.disabled=false;}
    }
    async function renameCanvas(id,oldTitle){const title=window.prompt('画布名称',oldTitle);if(title===null||!title.trim())return;const response=await fetch(`/api/canvases/${encodeURIComponent(id)}/meta`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title.trim()})});if(!response.ok){window.alert('重命名失败，请稍后重试。');return;}loadCanvases();}
    async function deleteCanvas(id,title){if(!window.confirm(`确认永久删除“${title}”？此操作无法恢复。`))return;const response=await fetch(`/api/canvases/${encodeURIComponent(id)}`,{method:'DELETE'});if(!response.ok){window.alert('删除画布失败，请稍后重试。');return;}loadCanvases();}
    list.addEventListener('click',event=>{const open=event.target.closest('[data-open-id]');if(open){openCanvas(open.dataset.openId);return;}const rename=event.target.closest('[data-rename-id]');if(rename){renameCanvas(rename.dataset.renameId,rename.dataset.title||'');return;}const remove=event.target.closest('[data-delete-id]');if(remove)deleteCanvas(remove.dataset.deleteId,remove.dataset.title||'未命名画布');});
    form.addEventListener('submit',createCanvas);refreshBtn.addEventListener('click',loadCanvases);loadCanvases();
})();
