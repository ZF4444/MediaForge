(function(){
  const state = window.CanvasAgentState;
  let allArtifacts = [];
  const stages=['brief','creative_direction','script','asset_anchors','shot_list','prompt_pack'];
  function render(tasks=[], artifacts=[]) {
    const box = document.getElementById('canvasAgentArtifacts'); box.innerHTML = '';
    state.tasks = tasks;
    if (!tasks.length) { box.hidden = true; return; }
    tasks.forEach(task => {
      const row = document.createElement('div'); row.className = 'canvas-agent-task';
      const label = document.createElement('span'); label.textContent = `${task.status || 'queued'} · ${task.agent_node_id || task.task_id || task.id || ''}`; row.appendChild(label);
      if (['failed', 'interrupted'].includes(task.status)) { const retry = document.createElement('button'); retry.className='canvas-agent-action secondary'; retry.type='button'; retry.textContent='重试'; retry.addEventListener('click', async () => { try { await window.CanvasAgentClient.retryTask(task.id || task.task_id); await window.CanvasAgentEvents.recover(); } catch (e) { window.CanvasAgentPanel.system(e.message); } }); row.appendChild(retry); }
      box.appendChild(row);
    });
    box.hidden = false;
  }
  function renderDocChain(artifacts=[]) {
    allArtifacts = artifacts;
    const box = document.getElementById('canvasAgentArtifacts');
    const taskRows = Array.from(box.querySelectorAll('.canvas-agent-task')); box.innerHTML=''; taskRows.forEach(row=>box.appendChild(row));
    const nav=document.createElement('div'); nav.className='canvas-agent-stage-nav';
    stages.forEach(stage=>{const latest=artifacts.filter(a=>a.type===stage).at(-1);const button=document.createElement('button');button.type='button';button.className=`canvas-agent-stage${latest?.stale?' stale':''}`;button.textContent=`${stage}${latest?` v${latest.version}`:''}`;button.title=latest?.stale?'上游已变化，需要重新编译':stage;button.addEventListener('click',()=>{if(latest) showArtifact(latest);});nav.appendChild(button);});box.appendChild(nav);box.hidden=false;
  }
  function showArtifact(artifact) { const box=document.getElementById('canvasAgentArtifacts'); const detail=document.createElement('div');detail.className='canvas-agent-artifact-detail';detail.textContent=`${artifact.type} v${artifact.version} · ${artifact.stale?'stale':artifact.status}`;const compare=document.createElement('button');compare.className='canvas-agent-action secondary';compare.type='button';compare.textContent='查看版本内容';compare.addEventListener('click',()=>window.CanvasAgentPanel.system(JSON.stringify(artifact.content_json||{},null,2)));detail.appendChild(compare);const quality=document.createElement('button');quality.className='canvas-agent-action secondary';quality.type='button';quality.textContent='质量评估';quality.addEventListener('click',async()=>{try{const result=await window.CanvasAgentClient.evaluateArtifact(artifact.id);window.CanvasAgentPanel.system(`质量 ${result.metrics.score}/100${result.metrics.issues.length?`：${result.metrics.issues.join(', ')}`:'：可进入下一阶段'}`);}catch(e){window.CanvasAgentPanel.system(e.message);}});detail.appendChild(quality);const previous=allArtifacts.filter(item=>item.type===artifact.type&&item.version<artifact.version).at(-1);if(previous){const diff=document.createElement('button');diff.className='canvas-agent-action secondary';diff.type='button';diff.textContent='版本差异';diff.addEventListener('click',()=>window.CanvasAgentPanel.system(`上一版 v${previous.version}\n${JSON.stringify(previous.content_json||{},null,2)}\n\n当前版 v${artifact.version}\n${JSON.stringify(artifact.content_json||{},null,2)}`));detail.appendChild(diff);}if(!artifact.stale&&artifact.status!=='approved'){const approve=document.createElement('button');approve.className='canvas-agent-action primary';approve.type='button';approve.textContent='批准';approve.addEventListener('click',async()=>{await window.CanvasAgentClient.setArtifactStatus(artifact.id,'approved');await window.CanvasAgentEvents.recover();});detail.appendChild(approve);}if(artifact.type==='prompt_pack'&&artifact.stale){const compile=document.createElement('button');compile.className='canvas-agent-action primary';compile.type='button';compile.textContent='重新编译';compile.addEventListener('click',async()=>{const ids=artifact.source_artifact_ids||[];if(ids.length>=2){await window.CanvasAgentClient.compilePack(ids[0],ids[1]);await window.CanvasAgentEvents.recover();}});detail.appendChild(compile);}if(artifact.type==='prompt_pack'&&artifact.status==='approved'&&!artifact.stale){const generate=document.createElement('button');generate.className='canvas-agent-action primary';generate.type='button';generate.textContent='重新生成';generate.addEventListener('click',async()=>{const ids=prompt('输入目标画布节点 ID（逗号分隔）','');if(ids)await window.CanvasAgentClient.generatePack(artifact.id,ids.split(',').map(value=>value.trim()).filter(Boolean));});detail.appendChild(generate);}if(artifact.stale){const hint=document.createElement('span');hint.textContent='上游已变化，请重新编译';detail.appendChild(hint);}box.appendChild(detail); }
  window.CanvasAgentArtifacts = { render, renderDocChain };
})();
