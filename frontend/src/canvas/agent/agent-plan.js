(function(){
  const state = window.CanvasAgentState;
  const text = step => step.description || step.node?.title || step.action || '执行画布操作';
  function render(row) {
    const box = document.getElementById('canvasAgentPlan'); box.innerHTML = ''; state.plan = row || null;
    const plan = row?.content_json || {}; const steps = Array.isArray(plan.steps) ? plan.steps : [];
    if (!row) { box.hidden = true; return; }
    const title = document.createElement('h4'); title.textContent = plan.goal || 'Agent 计划'; box.appendChild(title);
    const capabilities = plan.execution?.capabilities || [...new Set(steps.map(s => s.node?.capability).filter(Boolean))];
    const meta = document.createElement('div'); meta.className='canvas-agent-plan-meta'; meta.textContent = `能力：${capabilities.join('、') || '画布编辑'} · 预估任务：${steps.filter(s => s.action === 'canvas.run_node').length} · 预估成本：${Number(plan.execution?.estimated_cost || 0).toFixed(2)}`; box.appendChild(meta);
    const diff = document.createElement('ul'); diff.className='canvas-agent-plan-diff'; steps.forEach(step => { const li=document.createElement('li'); li.textContent=`+ ${text(step)}`; diff.appendChild(li); }); box.appendChild(diff);
    if (Array.isArray(plan.questions) && plan.questions.length) plan.questions.forEach(question => { const form=document.createElement('div'); form.className='canvas-agent-question'; const input=document.createElement('input'); input.placeholder=question; const button=document.createElement('button'); button.className='canvas-agent-action primary'; button.type='button'; button.textContent='回答'; button.addEventListener('click',()=>window.CanvasAgentPanel.answer(input.value)); form.append(input,button); box.appendChild(form); });
    const authorization = document.createElement('label'); authorization.className='canvas-agent-plan-meta'; authorization.innerHTML='<input type="checkbox" id="canvasAgentAuthorizeNodes"> 允许本轮修改引用的用户节点'; box.appendChild(authorization);
    const actions = document.createElement('div'); actions.className='canvas-agent-plan-actions';
    [['拒绝', false, 'secondary'], ['确认执行', true, 'primary']].forEach(([label, approved, klass]) => { const b=document.createElement('button'); b.type='button'; b.className=`canvas-agent-action ${klass}`; b.textContent=label; b.addEventListener('click',()=>window.CanvasAgentPanel.confirm(approved)); actions.appendChild(b); }); box.appendChild(actions); box.hidden=false;
  }
  window.CanvasAgentPlan = { render };
})();
