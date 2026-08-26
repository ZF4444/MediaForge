(function(){
  const state = window.CanvasAgentState;
  const active = status => ['running','planning','applying','awaiting_confirmation'].includes(status);
  function saveRun() {
    const canvasId = window.CanvasAgentBridge.canvasId();
    localStorage.setItem(`canvas-agent-run:${canvasId}`, state.runId);
    if (!state.runId) return;
    try {
      const key = `canvas-agent-runs:${canvasId}`;
      const history = JSON.parse(localStorage.getItem(key) || '[]').filter(Boolean).filter(id => id !== state.runId);
      history.unshift(state.runId);
      localStorage.setItem(key, JSON.stringify(history.slice(0, 100)));
    } catch (_) {}
  }
  function applyEvent(event) {
    if (!event || Number(event.sequence) <= state.sequence) return;
    state.sequence = Number(event.sequence); const type = String(event.type || '').replace(/^agent\./, ''); const data = event.payload || event.payload_json || event.data || {};
    state.lastEvent = event;
    if (window.CanvasAgentPanel.isConversationEvent?.(type)) window.CanvasAgentPanel.liveEvent?.({sequence:event.sequence,type,data});
    if (['operation.succeeded','operation.failed','operation.cancelled'].includes(type)) state.operationId = '';
    if (type.startsWith('progress')) window.CanvasAgentPanel.status(data.message || '处理中…');
    else if (type.startsWith('operation.') && data.message) window.CanvasAgentPanel.status(data.message);
    else window.CanvasAgentPanel.status(type);
    if (type === 'task.queued') window.CanvasAgentBridge.startNodeTask?.(data);
    if (['task.succeeded','task.failed','task.cancelled','task.timed_out'].includes(type)) window.CanvasAgentBridge.finishNodeTask?.(data);
    if (type === 'message.replied' && data.reply) {
      window.CanvasAgentPanel.message(data.reply, 'agent');
    }
    if (type === 'plan.created' && data.plan) window.CanvasAgentPlan.render({version:data.plan_version, content_json:data.plan});
    if (type === 'skill.loaded' && data.skill?.name) {
      const key = `${data.skill.name}:${data.skill.version || ''}`;
      if (!state.skills.some(skill => `${skill.name}:${skill.version || ''}` === key)) state.skills.push({name:data.skill.name,version:data.skill.version || ''});
      window.CanvasAgentPanel.renderSkills();
    }
    if ((type.startsWith('task.') && !['task.succeeded','task.failed','task.cancelled','task.timed_out'].includes(type)) || type === 'patch.applied') window.CanvasAgentBridge.refreshCanvas();
    if (['run.failed','run.blocked','run.cancelled'].includes(type)) window.CanvasAgentPanel.system(data.error || data.reason || type);
  }
  async function catchUp() {
    if (!state.runId) return;
    const data = await window.CanvasAgentClient.events(state.sequence);
    (data.events || []).forEach(applyEvent);
  }
  async function recover() {
    const saved = state.runId || localStorage.getItem(`canvas-agent-run:${window.CanvasAgentBridge.canvasId()}`);
    if (!saved) { window.CanvasAgentPanel.status('就绪 · 新对话'); return; }
    state.runId = saved;
    window.CanvasAgentPanel.status('正在恢复会话');
    try { const data = await window.CanvasAgentClient.getRun(); window.CanvasAgentPanel.renderRun(data); saveRun(); await window.CanvasAgentPanel.refreshRuns(); await catchUp(); if (active(data.run?.status)) start(); else stop(); }
    catch (error) {
      if (error.status === 404) {
        localStorage.removeItem(`canvas-agent-run:${window.CanvasAgentBridge.canvasId()}`);
        state.runId = '';
        state.sequence = 0;
        window.CanvasAgentPanel.status('就绪 · 新对话');
      } else {
        window.CanvasAgentPanel.status('连接中断，等待重连');
      }
    }
  }
  async function tick() { try { await catchUp(); const data=await window.CanvasAgentClient.getRun(); window.CanvasAgentPanel.renderRun(data); if (!active(data.run?.status) && !state.operationId) stop(); } catch (_) { window.CanvasAgentPanel.status('连接中断，等待重连'); } }
  function start() { const interval=state.operationId ? 1000 : 10000; if (state.pollTimer && state.pollInterval !== interval) { clearInterval(state.pollTimer); state.pollTimer=null; } if (!state.pollTimer) { state.pollTimer=setInterval(tick, interval); state.pollInterval=interval; } tick(); }
  function stop() { if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer=null; } state.pollInterval=0; }
  async function switchRun(runId) {
    if (!runId || runId === state.runId) return;
    stop(); state.runId = runId; state.sequence = 0; state.skills = []; saveRun();
    window.CanvasAgentPanel.clearRun();
    await recover();
  }
  window.canvasAgentHandleEvent = message => {
    const event = message?.type === 'agent.event' ? message.data : {sequence:message?.sequence,type:message?.type,data:message?.data,run_id:message?.run_id};
    if (event?.run_id === state.runId) applyEvent(event);
  };
  window.addEventListener('online', recover); document.addEventListener('visibilitychange', () => { if (!document.hidden) recover(); });
  window.CanvasAgentEvents = { applyEvent, catchUp, recover, start, stop, saveRun, switchRun };
})();
