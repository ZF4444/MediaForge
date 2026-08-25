(function(){
  const state=window.CanvasAgentState, $=id=>document.getElementById(id), panel=$('canvasAgentPanel');
  let lastLiveStatus = '';
  let liveEvents = [];
  const expandedEventGroups = new Set();
  let rebuildingMessages = false;
  let confirmationPending = false;
  let confirmationAccepted = false;
  const status = value => { $('canvasAgentStatus').textContent=value || ''; };
  const timeLabel = () => new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit'}).format(new Date());
  const isNearMessageBottom = box => (box.scrollHeight - box.scrollTop - box.clientHeight) < 48;
  const captureMessageScroll = box => ({top:box.scrollTop,follow:isNearMessageBottom(box)});
  const restoreMessageScroll = (box, snapshot) => { box.scrollTop=snapshot?.follow ? box.scrollHeight : Math.min(snapshot?.top || 0, Math.max(0,box.scrollHeight-box.clientHeight)); };
  const conversationEventTypes = new Set(['progress.context','progress.agent','progress.tool_started','progress.tool_failed','skill.loaded','skill.resource_loaded']);
  const isConversationEvent = type => conversationEventTypes.has(String(type || '').replace(/^agent\./,''));
  const escapeRegExp = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const renderMessageContent = (body, content) => {
    const candidates = (window.CanvasAgentBridge.nodeMentionCandidates?.() || []).sort((a,b)=>b.label.length-a.label.length || b.id.length-a.id.length);
    const usable = candidates.filter(item=>item.label.length >= 2 || item.id.length >= 8);
    if(!usable.length){ body.textContent=content; return; }
    const pattern = new RegExp(usable.map(item=>escapeRegExp(item.label)).concat(usable.map(item=>escapeRegExp(item.id))).join('|'), 'g');
    let cursor=0; let match;
    while((match=pattern.exec(String(content)))!==null){
      if(match.index>cursor) body.appendChild(document.createTextNode(String(content).slice(cursor,match.index)));
      const value=match[0]; const target=usable.find(item=>item.label===value || item.id===value);
      if(!target){ body.appendChild(document.createTextNode(value)); cursor=pattern.lastIndex; continue; }
      const link=document.createElement('button'); link.type='button'; link.className='canvas-agent-node-link'; link.textContent=value; link.title=`定位节点：${target.label}`; link.dataset.nodeId=target.id; body.appendChild(link); cursor=pattern.lastIndex;
    }
    if(cursor<String(content).length) body.appendChild(document.createTextNode(String(content).slice(cursor)));
    if(!body.childNodes.length) body.textContent=content;
  };
  const message = (content, kind='agent') => {
    if (!content) return;
    if (kind === 'agent') sealLiveStatus();
    const el=document.createElement('div'); el.className=`canvas-agent-message ${kind}`;
    const body=document.createElement('div'); body.className='canvas-agent-message-body'; renderMessageContent(body, content); el.appendChild(body);
    if (kind === 'user') { const time=document.createElement('div'); time.className='canvas-agent-message-time'; time.textContent=timeLabel(); el.appendChild(time); }
    const box=$('canvasAgentMessages'); const follow=isNearMessageBottom(box); box.appendChild(el); if(!rebuildingMessages && follow) box.scrollTop=box.scrollHeight;
  };
  const liveEventText = (type, data, fallback='') => {
    const message = String(data?.message || fallback || '').trim();
    if (message) return message.replace(/…$/, '');
    if (type === 'skill.loaded') return `已读取 ${data?.skill?.name || 'Skill'} 技能`;
    if (type === 'skill.resource_loaded') return `已读取 ${data?.resource?.path || 'Skill 资源'}`;
    if (type === 'task.queued') return '生成任务已提交';
    if (type === 'task.succeeded') return '生成任务已完成';
    if (type === 'task.failed' || type === 'task.timed_out') return data?.error || '生成任务失败';
    return type || '处理中';
  };
  const liveEventIcon = type => {
    if (type.includes('tool') || type === 'task.succeeded' || type === 'task.failed') return 'terminal-square';
    if (type.includes('skill')) return 'box';
    if (type.includes('model') || type.includes('context')) return 'search';
    return 'box';
  };
  const liveEventDuration = data => {
    const ms = Number(data?.duration_ms || data?.durationMs || 0);
    if (!ms) return '';
    return `${Math.max(0, Math.round(ms / 1000))}s`;
  };
  const eventGroupKey = events => {
    const first = events[0] || {};
    return first.sequence ? `sequence:${first.sequence}` : `content:${first.type || 'status'}:${first.message || first.data?.message || ''}`;
  };
  const orderedEvents = events => [...events].sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
  const renderLiveIcons = root => { if(window.lucide) window.lucide.createIcons({root}); };
  const createLiveStatus = events => {
    const el=document.createElement('div'); el.className='canvas-agent-live-status';
    const groupKey=eventGroupKey(events);
    let expanded=expandedEventGroups.has(groupKey);
    const render = () => {
    el.innerHTML='';
    const ordered=orderedEvents(events);
    const first=ordered[0] || {type:'status',message:lastLiveStatus,data:{}};
    const toggle=document.createElement('button'); toggle.type='button'; toggle.className='canvas-agent-live-toggle'; toggle.setAttribute('aria-expanded', String(expanded));
    const icon=document.createElement('i'); icon.setAttribute('data-lucide', liveEventIcon(first.type));
    const text=document.createElement('span'); text.className='canvas-agent-live-text'; text.textContent=liveEventText(first.type, first.data, first.message);
    const duration=document.createElement('span'); duration.className='canvas-agent-live-duration'; duration.textContent=liveEventDuration(first.data);
    const chevron=document.createElement('i'); chevron.className='canvas-agent-live-chevron'; chevron.setAttribute('data-lucide', expanded ? 'chevron-up' : 'chevron-down');
    toggle.append(icon, text, duration, chevron); toggle.addEventListener('click', () => { expanded=!expanded; if(expanded) expandedEventGroups.add(groupKey); else expandedEventGroups.delete(groupKey); render(); }); el.appendChild(toggle);
    const details=document.createElement('div'); details.className='canvas-agent-live-details'; details.hidden=!expanded; details.style.display=expanded ? '' : 'none';
    [...ordered].reverse().forEach(item => {
      const row=document.createElement('div'); row.className='canvas-agent-live-row';
      const rowIcon=document.createElement('i'); rowIcon.setAttribute('data-lucide', liveEventIcon(item.type));
      const rowText=document.createElement('span'); rowText.textContent=liveEventText(item.type, item.data, item.message);
      const rowDuration=document.createElement('span'); rowDuration.className='canvas-agent-live-duration'; rowDuration.textContent=liveEventDuration(item.data);
      row.append(rowIcon, rowText, rowDuration); details.appendChild(row);
    });
    el.appendChild(details);
    if(el.isConnected) renderLiveIcons(el);
    };
    render();
    return el;
  };
  const renderLiveStatus = () => {
    const box=$('canvasAgentMessages'); let el=box.querySelector('.canvas-agent-live-status.is-active');
    if (!liveEvents.length && !lastLiveStatus) { el?.remove(); return; }
    const next=createLiveStatus(liveEvents.length ? liveEvents : [{type:'status',message:lastLiveStatus,data:{}}]);
    next.classList.add('is-active');
    const follow=isNearMessageBottom(box);
    if(el) el.replaceWith(next); else box.appendChild(next);
    renderLiveIcons(next);
    if(!rebuildingMessages && follow) box.scrollTop=box.scrollHeight;
  };
  const liveEvent = event => {
    const item={sequence:Number(event?.sequence || 0),type:String(event?.type || 'status').replace(/^agent\./,''),data:event?.data || {},message:event?.message || ''};
    if(item.sequence && liveEvents.some(existing=>existing.sequence===item.sequence)) return;
    liveEvents.push(item); liveEvents=liveEvents.slice(-80);
    lastLiveStatus=liveEventText(item.type,item.data,item.message);
    renderLiveStatus();
  };
  const liveStatus = content => { if (!content) return; lastLiveStatus=content; renderLiveStatus(); };
  const sealLiveStatus = () => { $('canvasAgentMessages').querySelector('.canvas-agent-live-status.is-active')?.classList.remove('is-active'); liveEvents=[]; lastLiveStatus=''; };
  const clearLiveStatus = () => { lastLiveStatus=''; liveEvents=[]; $('canvasAgentMessages').querySelectorAll('.canvas-agent-live-status').forEach(el=>el.remove()); };
  const system = content => message(content, 'system');
  const modelStorageKey = () => `canvas-agent-model:${window.CanvasAgentBridge.canvasId()}`;
  function modelSelection() { return {provider:state.modelProvider || '', model:state.modelName || ''}; }
  function saveModelSelection() { localStorage.setItem(modelStorageKey(), JSON.stringify(modelSelection())); }
  function loadModelSelection() { try { const saved=JSON.parse(localStorage.getItem(modelStorageKey()) || '{}'); state.modelProvider=String(saved.provider || ''); state.modelName=String(saved.model || ''); } catch (_) {} }
  let modelLoadPromise=null;
  async function loadModels() { const select=$('canvasAgentModelSelect'); try { const response=await fetch('/api/providers',{credentials:'same-origin'}); if(!response.ok) throw new Error(`请求失败 (${response.status})`); const data=await response.json(); const previous=modelSelection(); select.innerHTML=''; const automatic=document.createElement('option'); automatic.value=''; automatic.textContent='自动选择'; automatic.dataset.provider=''; automatic.dataset.model=''; select.appendChild(automatic); (data.providers||[]).filter(provider=>provider.enabled!==false && provider.has_key!==false && !['comfyui','runninghub'].includes(String(provider.id || '').toLowerCase())).forEach(provider=>{ (provider.chat_models||[]).forEach(model=>{ const option=document.createElement('option'); option.value=`${provider.id}::${model}`; option.textContent=`${provider.name || provider.id} / ${model}`; option.dataset.provider=provider.id || ''; option.dataset.model=model; select.appendChild(option); }); }); const selected=[...select.options].find(option=>option.dataset.provider===previous.provider&&option.dataset.model===previous.model); select.value=selected ? selected.value : ''; if(!selected){state.modelProvider='';state.modelName='';saveModelSelection();} } catch (_) { select.innerHTML='<option value="">自动选择（模型列表加载失败）</option>'; } }
  function ensureModelsLoaded() { if (!modelLoadPromise) modelLoadPromise=loadModels().finally(()=>{ modelLoadPromise=null; }); return modelLoadPromise; }
  function onModelChange(event) { const option=event.target.selectedOptions[0]; state.modelProvider=option?.dataset.provider || ''; state.modelName=option?.dataset.model || ''; saveModelSelection(); }
  const runLabel = run => { const title=String(run.title || '').trim().replace(/\s+/g,' '); const short=title ? (title.length > 34 ? `${title.slice(0,34)}…` : title) : '新建对话'; return `${short} · ${run.status || 'created'}`; };
  async function refreshRuns() {
    const select=$('canvasAgentRunSelect');
    let runs=[];
    try {
      const data=await window.CanvasAgentClient.listRuns(window.CanvasAgentBridge.canvasId());
      runs=data.runs||[];
    } catch (_) {}
    const known=new Set(runs.map(run=>run.id));
    try {
      const history=JSON.parse(localStorage.getItem(`canvas-agent-runs:${window.CanvasAgentBridge.canvasId()}`) || '[]');
      history.filter(id=>id && !known.has(id)).forEach(id=>runs.push({id,status:id===state.runId?'created':'unknown',title:'历史 Run'}));
    } catch (_) {}
    if(state.runId && !known.has(state.runId)) runs.unshift({id:state.runId,status:'created',title:'当前 Run'});
    select.innerHTML='';
    if(!runs.length){ const empty=document.createElement('option'); empty.value=''; empty.textContent='暂无 Run，点击 + 新建'; select.appendChild(empty); return; }
    runs.forEach(run=>{ const option=document.createElement('option'); option.value=run.id; option.textContent=runLabel(run); option.title=run.title || run.id; option.selected=run.id===state.runId; select.appendChild(option); });
  }
  function clearRun() { lastLiveStatus=''; liveEvents=[]; expandedEventGroups.clear(); $('canvasAgentMessages').innerHTML=''; $('canvasAgentPlan').innerHTML=''; $('canvasAgentPlan').hidden=true; $('canvasAgentArtifacts').innerHTML=''; $('canvasAgentArtifacts').hidden=true; state.plan=null; state.tasks=[]; }
  function renderSkills() { const box=$('canvasAgentSkills'); box.innerHTML=''; state.skills.forEach(skill=>{const tag=document.createElement('span');tag.className='canvas-agent-skill';tag.textContent=`${skill.name}${skill.version ? ` v${skill.version}` : ''}`;box.appendChild(tag);});box.hidden=!state.skills.length; }
  function renderMentions() { const box=$('canvasAgentMentions'); box.innerHTML=''; state.mentions.forEach(id => { const chip=document.createElement('span'); chip.className='canvas-agent-mention'; chip.textContent=`@${window.CanvasAgentBridge.nodeLabel(id)}`; const remove=document.createElement('button'); remove.type='button'; remove.textContent='×'; remove.addEventListener('click',()=>{state.mentions=state.mentions.filter(item=>item!==id);renderMentions();}); chip.appendChild(remove); box.appendChild(chip); }); }
  function renderRun(data) {
    const run=data.run||{};
    if(run.id){ state.runId=run.id; window.CanvasAgentEvents.saveRun(); }
    if(data.plan?.version && data.plan.version !== state.plan?.version) confirmationAccepted=false;
    if(run.status !== 'awaiting_confirmation') confirmationAccepted=false;
    if(!state.operationId) status(`${run.status || 'unknown'} · ${run.phase || ''}`);
    const messages=$('canvasAgentMessages'); const scrollSnapshot=captureMessageScroll(messages); rebuildingMessages=true; messages.innerHTML=''; liveEvents=[]; lastLiveStatus='';
    const loaded=new Map(); let latestProgress=''; const timeline=[];
    (data.messages||[]).forEach(item=>timeline.push({kind:'message',at:Number(item.created_at)||0,item}));
    (data.events||[]).forEach(event=>{
      const type=String(event.type||'').replace(/^agent\./,''); const payload=event.payload||event.payload_json||{};
      const live={sequence:Number(event.sequence)||0,type,data:payload,message:payload.message||''};
      if(isConversationEvent(type)) timeline.push({kind:'event',at:Number(event.created_at)||0,item:live});
      if(type==='skill.loaded'){const skill=payload.skill||{};if(skill.name)loaded.set(`${skill.name}:${skill.version||''}`,{name:skill.name,version:skill.version||''});}
    });
    timeline.sort((a,b)=>a.at-b.at || (a.kind==='event' ? -1 : 1));
    let pending=[]; let turnOpen=false;
    timeline.forEach(entry=>{
      if(entry.kind==='event'){ if(turnOpen){ pending.push(entry.item); latestProgress=liveEventText(entry.item.type,entry.item.data,entry.item.message); } return; }
      const kind=entry.item.role==='user'?'user':entry.item.role==='system'?'system':'agent';
      if(kind==='user'){ pending=[]; turnOpen=true; }
      if(kind==='agent' && pending.length){ const liveStatus=createLiveStatus(pending); messages.appendChild(liveStatus); renderLiveIcons(liveStatus); pending=[]; }
      message(entry.item.content,kind);
      if(kind==='agent' || kind==='system') turnOpen=false;
    });
    liveEvents=turnOpen ? pending : [];
    if(liveEvents.length){ lastLiveStatus=latestProgress; renderLiveStatus(); }
    state.skills=[...loaded.values()]; renderSkills();
    const activeOperation=(data.operations||[]).find(item=>['accepted','queued','running'].includes(item.status));
    state.sequence=Math.max(state.sequence,...(data.events||[]).map(event=>Number(event.sequence)||0)); state.operationId=activeOperation?.id || '';
    window.CanvasAgentPlan.render(data.plan,{interactive:run.status==='awaiting_confirmation'&&!confirmationAccepted});
    window.CanvasAgentArtifacts.render(data.tasks||[],data.artifacts||[]); if((data.artifacts||[]).length)window.CanvasAgentArtifacts.renderDocChain(data.artifacts);
    rebuildingMessages=false; restoreMessageScroll(messages,scrollSnapshot);
  }
  async function ensureRun() { if (state.runId) return state.runId; status('正在创建会话'); const data=await window.CanvasAgentClient.createRun(); state.runId=data.run.id; window.CanvasAgentEvents.saveRun(); await refreshRuns(); return state.runId; }
  async function newRun() { if (state.busy) return; state.busy=true; window.CanvasAgentEvents.stop(); state.runId=''; state.sequence=0; state.skills=[]; clearRun(); renderSkills(); status('正在创建会话'); try { const data=await window.CanvasAgentClient.createRun(); state.runId=data.run.id; window.CanvasAgentEvents.saveRun(); renderRun({run:data.run,messages:[],events:[],tasks:[],artifacts:[]}); await refreshRuns(); } catch (e) { system(e.message); status('创建失败'); } finally { state.busy=false; } }
  async function send() { const input=$('canvasAgentInput'), content=input.value.trim(); if (!content || state.busy) return; state.busy=true; input.value=''; message(content,'user'); status('正在受理请求…'); try { await ensureModelsLoaded(); await ensureRun(); window.CanvasAgentEvents.start(); const selection=modelSelection(); const data=await window.CanvasAgentClient.send({content,provider:selection.provider,model:selection.model,selected_node_ids:window.CanvasAgentBridge.selectedNodeIds(),mention_node_ids:state.mentions}); state.operationId=data.operation_id || ''; status('请求已受理，正在准备 Agent…'); window.CanvasAgentEvents.start(); } catch(e) { system(e.message); status('error'); } finally { state.busy=false; } }
  async function answer(answer) { if (!answer?.trim() || !state.runId) return; try { window.CanvasAgentEvents.start(); const selection=modelSelection(); const data=await window.CanvasAgentClient.answer(answer.trim(),selection.provider,selection.model); state.operationId=data.operation_id || ''; status('回答已受理，正在继续规划…'); } catch(e) { system(e.message); } }
  async function confirm(approved) { if (!state.plan || !state.runId || confirmationPending) return; const authorize=$('canvasAgentAuthorizeNodes')?.checked; confirmationPending=true; confirmationAccepted=true; window.CanvasAgentPlan.render(state.plan, {interactive:false}); try { const steps=state.plan.content_json?.steps || []; const targetIds=steps.filter(step=>['canvas.update_node_params','canvas.replace_node_content','canvas.run_node','canvas.run_group'].includes(step.action)).map(step=>step.target_node_id).filter(Boolean); const authorizedNodeIds=authorize ? [...new Set([...state.mentions,...targetIds])] : []; window.CanvasAgentEvents.start(); const data=await window.CanvasAgentClient.request(`/api/canvas-agent/runs/${encodeURIComponent(state.runId)}/confirm`, {method:'POST', body:JSON.stringify({plan_version:state.plan.version,approved,authorized_node_ids:authorizedNodeIds,client_request_id:globalThis.crypto?.randomUUID?.() || `${Date.now()}`})}); if(data.operation_id){state.operationId=data.operation_id;status(approved ? '确认已受理，正在执行…' : '拒绝已受理，正在处理…');}else renderRun(data); } catch(e) { confirmationAccepted=false; window.CanvasAgentPlan.render(state.plan, {interactive:true}); system(e.message); } finally { confirmationPending=false; } }
  async function cancel() { if (!state.runId) return; try { renderRun(await window.CanvasAgentClient.cancel()); window.CanvasAgentEvents.stop(); } catch(e) { system(e.message); } }
  function addSelectedMentions() { const ids=window.CanvasAgentBridge.selectedNodeIds(); state.mentions=[...new Set([...state.mentions,...ids])]; renderMentions(); if (!ids.length) system('请先在画布上选中节点。'); }
  async function init() { try { const response=await fetch('/api/access-control/me',{credentials:'same-origin'}); const me=response.ok ? await response.json() : {}; if(!me.is_admin){ $('canvasAgentToggle')?.remove(); panel?.remove(); return; } $('canvasAgentToggle').hidden=false; } catch (_) { $('canvasAgentToggle')?.remove(); panel?.remove(); return; } loadModelSelection(); $('canvasAgentToggle').addEventListener('click',()=>{panel.hidden=!panel.hidden;if(!panel.hidden){ensureModelsLoaded();refreshRuns();window.CanvasAgentEvents.recover();}}); ['pointerdown','mousedown','dblclick'].forEach(type=>panel.addEventListener(type,event=>event.stopPropagation())); panel.addEventListener('click', event=>{ const link=event.target.closest('.canvas-agent-node-link'); if(link){ event.preventDefault(); event.stopPropagation(); window.CanvasAgentBridge.focusNode(link.dataset.nodeId); } else event.stopPropagation(); }); panel.addEventListener('wheel', event=>event.stopPropagation(), {capture:true,passive:true}); $('canvasAgentClose').addEventListener('click',()=>panel.hidden=true); $('canvasAgentRunSelect').addEventListener('change',event=>window.CanvasAgentEvents.switchRun(event.target.value)); $('canvasAgentNewRun').addEventListener('click',newRun); $('canvasAgentModelSelect').addEventListener('change',onModelChange); $('canvasAgentSend').addEventListener('click',send); $('canvasAgentCancel').addEventListener('click',cancel); $('canvasAgentMention').addEventListener('click',addSelectedMentions); $('canvasAgentInput').placeholder='和画布 Agent 聊聊，或描述要在画布上完成的操作'; $('canvasAgentInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send();}}); window.addEventListener('beforeunload',window.CanvasAgentEvents.stop); renderMentions(); ensureModelsLoaded(); refreshRuns(); window.CanvasAgentEvents.recover(); }
  window.CanvasAgentPanel={init,status,message,liveStatus,liveEvent,clearLiveStatus,isConversationEvent,system,renderRun,renderSkills,clearRun,refreshRuns,send,answer,confirm,cancel}; init();
})();
