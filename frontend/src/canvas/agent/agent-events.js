(function(){
  const state = window.CanvasAgentState;
  const active = status => ['running','planning','applying','awaiting_confirmation'].includes(status);
  function saveRun() { localStorage.setItem(`canvas-agent-run:${window.CanvasAgentBridge.canvasId()}`, state.runId); }
  function applyEvent(event) {
    if (!event || Number(event.sequence) <= state.sequence) return;
    state.sequence = Number(event.sequence); const type = String(event.type || '').replace(/^agent\./, ''); const data = event.payload_json || event.data || {};
    window.CanvasAgentPanel.status(type);
    if (type === 'plan.created' && data.plan) window.CanvasAgentPlan.render({version:data.plan_version, content_json:data.plan});
    if (type.startsWith('task.') || type === 'patch.applied') window.CanvasAgentBridge.refreshCanvas();
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
  async function tick() { try { await catchUp(); const data=await window.CanvasAgentClient.getRun(); window.CanvasAgentPanel.renderRun(data); if (!active(data.run?.status)) stop(); } catch (_) { window.CanvasAgentPanel.status('连接中断，等待重连'); } }
  function start() { if (!state.pollTimer) state.pollTimer=setInterval(tick, 2500); tick(); }
  function stop() { if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer=null; } }
  async function switchRun(runId) {
    if (!runId || runId === state.runId) return;
    stop(); state.runId = runId; state.sequence = 0; saveRun();
    window.CanvasAgentPanel.clearRun();
    await recover();
  }
  window.canvasAgentHandleEvent = message => { if (message?.run_id === state.runId) applyEvent({sequence:message.sequence,type:message.type,data:message.data}); };
  window.addEventListener('online', recover); document.addEventListener('visibilitychange', () => { if (!document.hidden) recover(); });
  window.CanvasAgentEvents = { applyEvent, catchUp, recover, start, stop, saveRun, switchRun };
})();
