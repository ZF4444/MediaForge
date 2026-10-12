(function(){
  async function request(path, options={}) {
    const apiJson = globalThis.__MediaForgeRuntimeServices?.apiJson;
    if(apiJson) return apiJson(path, {...options, credentials:'same-origin', headers:{'Content-Type':'application/json', ...(options.headers || {})}});
    const res = await fetch(path, {...options, credentials:'same-origin', headers:{'Content-Type':'application/json', ...(options.headers || {})}});
    let body = {}; try { body = await res.json(); } catch (_) {}
    if (!res.ok) {
      const detail = body.detail;
      const error = new Error(typeof detail === 'string' ? detail : (detail?.message || `请求失败 (${res.status})`));
      error.status = res.status;
      throw error;
    }
    return body;
  }
  const runPath = suffix => `/api/canvas-agent/runs/${encodeURIComponent(CanvasAgentState.runId)}${suffix}`;
  const requestId = () => globalThis.crypto?.randomUUID?.() || `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  CanvasAgentClient = {
    request, getRun: () => request(runPath('')), events: after => request(`${runPath('/events')}?after_sequence=${encodeURIComponent(after)}`),
    listRuns: (canvasId, limit=50) => request(`/api/canvas-agent/runs?canvas_id=${encodeURIComponent(canvasId)}&limit=${limit}`),
    renameRun: (id, title) => request(`/api/canvas-agent/runs/${encodeURIComponent(id)}`, {method:'PATCH', body:JSON.stringify({title})}),
    deleteRun: id => request(`/api/canvas-agent/runs/${encodeURIComponent(id)}`, {method:'DELETE'}),
    createRun: () => request('/api/canvas-agent/runs', {method:'POST', body:JSON.stringify({canvas_id:CanvasAgentBridge.canvasId(), mode:'fast_track'})}),
    send: body => request(runPath('/messages'), {method:'POST', body:JSON.stringify({...body, use_model:true, client_request_id:body.client_request_id || requestId()})}),
    answer: (answer, target={}, clientRequestId='') => request(runPath('/answers'), {method:'POST', body:JSON.stringify({answer, use_model:true, ...target, client_request_id:clientRequestId || requestId()})}),
    confirm: (planVersion, approved, clientRequestId='') => request(runPath('/confirm'), {method:'POST', body:JSON.stringify({plan_version:planVersion, approved, client_request_id:clientRequestId || requestId()})}),
    cancel: () => request(runPath('/cancel'), {method:'POST', body:'{}'}),
    retryTask: taskId => request(runPath(`/tasks/${encodeURIComponent(taskId)}/retry`), {method:'POST', body:'{}'}),
  };
})();
