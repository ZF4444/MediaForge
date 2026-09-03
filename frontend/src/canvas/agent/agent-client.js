(function(){
  async function request(path, options={}) {
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
  const runPath = suffix => `/api/canvas-agent/runs/${encodeURIComponent(window.CanvasAgentState.runId)}${suffix}`;
  const requestId = () => globalThis.crypto?.randomUUID?.() || `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  window.CanvasAgentClient = {
    request, getRun: () => request(runPath('')), events: after => request(`${runPath('/events')}?after_sequence=${encodeURIComponent(after)}`),
    listRuns: (canvasId, limit=50) => request(`/api/canvas-agent/runs?canvas_id=${encodeURIComponent(canvasId)}&limit=${limit}`),
    renameRun: (id, title) => request(`/api/canvas-agent/runs/${encodeURIComponent(id)}`, {method:'PATCH', body:JSON.stringify({title})}),
    deleteRun: id => request(`/api/canvas-agent/runs/${encodeURIComponent(id)}`, {method:'DELETE'}),
    createRun: () => request('/api/canvas-agent/runs', {method:'POST', body:JSON.stringify({canvas_id:window.CanvasAgentBridge.canvasId(), mode:'fast_track'})}),
    send: body => request(runPath('/messages'), {method:'POST', body:JSON.stringify({...body, use_model:true, client_request_id:body.client_request_id || requestId()})}),
    answer: (answer, target={}, clientRequestId='') => request(runPath('/answers'), {method:'POST', body:JSON.stringify({answer, use_model:true, ...target, client_request_id:clientRequestId || requestId()})}),
    confirm: (planVersion, approved, clientRequestId='') => request(runPath('/confirm'), {method:'POST', body:JSON.stringify({plan_version:planVersion, approved, client_request_id:clientRequestId || requestId()})}),
    cancel: () => request(runPath('/cancel'), {method:'POST', body:'{}'}),
    retryTask: taskId => request(runPath(`/tasks/${encodeURIComponent(taskId)}/retry`), {method:'POST', body:'{}'}),
    review: (status, note='') => request(runPath('/review'), {method:'POST', body:JSON.stringify({status, note})}),
    redo: (nodeId, prompt) => request(runPath('/redo'), {method:'POST', body:JSON.stringify({node_id:nodeId, prompt})}),
    artifacts: () => request(runPath('/artifacts')),
    setArtifactStatus: (id, status, note='') => request(runPath(`/artifacts/${encodeURIComponent(id)}/status`), {method:'POST', body:JSON.stringify({status, note})}),
    compilePack: (shotListId, anchorId) => request(runPath('/prompt-pack/compile'), {method:'POST', body:JSON.stringify({shot_list_artifact_id:shotListId, anchor_artifact_id:anchorId})}),
    generatePack: (artifactId, nodeIds) => request(runPath(`/prompt-pack/${encodeURIComponent(artifactId)}/generate`), {method:'POST', body:JSON.stringify({node_ids:nodeIds})}),
    estimateCost: budget => request(runPath('/cost-estimate'), {method:'POST', body:JSON.stringify({budget})}),
    orchestrate: (goal, roles=[]) => request(runPath('/orchestrate'), {method:'POST', body:JSON.stringify({goal, roles})}),
    evaluateArtifact: id => request(runPath(`/artifacts/${encodeURIComponent(id)}/quality`), {method:'POST', body:'{}'}),
    templates: () => request('/api/canvas-agent/templates'),
    createTemplate: body => request('/api/canvas-agent/templates', {method:'POST', body:JSON.stringify(body)}),
    instantiateTemplate: (id, runId) => request(`/api/canvas-agent/templates/${encodeURIComponent(id)}/instantiate`, {method:'POST', body:JSON.stringify({run_id:runId})}),
    projectAssets: projectId => request(`/api/canvas-agent/project-assets?project_id=${encodeURIComponent(projectId)}`),
    shareProjectAsset: body => request('/api/canvas-agent/project-assets', {method:'POST', body:JSON.stringify(body)}),
  };
})();
