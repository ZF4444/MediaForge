(function(){
  const activeTasks = new Map();
  let taskSync = Promise.resolve();
  const canvasId = () => new URLSearchParams(location.search).get('id') || '';
  const selectedNodeIds = () => Array.from(document.querySelectorAll('.image-node.selected[data-id]')).map(el => el.dataset.id).filter(Boolean);
  const nodeLabel = id => document.querySelector(`.image-node[data-id="${CSS.escape(id)}"]`)?.querySelector('.node-title,.smart-node-title')?.textContent?.trim() || id;
  const nodeMentionCandidates = () => Array.from(document.querySelectorAll('.image-node[data-id]')).map(el => ({id:el.dataset.id || '', label:el.querySelector('.node-title,.smart-node-title')?.textContent?.trim() || el.dataset.id || ''})).filter(item => item.id && item.label);
  const focusNode = id => Boolean(window.focusCanvasNode?.(id));
  function enqueue(work) {
    taskSync = taskSync.then(work, work);
    return taskSync;
  }
  function taskRecord(task) {
    const nodeId=String(task?.node_id || task?.nodeId || ''); const taskId=String(task?.task_id || task?.taskId || '');
    if(!nodeId || !taskId) return null;
    return {nodeId, taskId, kind:task.kind || 'image', providerId:task.provider_id || task.providerId || '', model:task.model || '', expectedCount:Math.max(1,Number(task.expected_count || task.expectedCount || 1) || 1)};
  }
  function attachTask(node, task) {
    if(!node) return false;
    const pending=Array.isArray(node.pendingTasks) ? node.pendingTasks : [];
    if(!pending.some(item=>item?.taskId===task.taskId)) pending.push({taskId:task.taskId,kind:task.kind,providerId:task.providerId,model:task.model});
    node.pendingTasks=pending;
    node.pending=Math.max(pending.length,Number(node.pending || 0) || task.expectedCount);
    node.pendingCandidatePool=pending.some(item=>(item.kind || 'image')==='image');
    node.runStartedAt=node.runStartedAt || nowMs(); node.runTimerHidden=false; node.running=false;
    delete node.runFinishedAt; delete node.runElapsedMs;
    const pendingBox=pendingBoxSize(task.expectedCount,{candidatePool:node.pendingCandidatePool});
    node.w=pendingBox.w; node.h=pendingBox.h;
    return true;
  }
  async function restoreActiveTasks() {
    let restored=false;
    activeTasks.forEach(task => {
      const node=nodes.find(item=>item?.id===task.nodeId);
      if(attachTask(node, task)) { resumeSmartPendingNode(node); restored=true; }
    });
    if(restored) render();
    return restored;
  }
  function startNodeTask(task) {
    const record=taskRecord(task);
    if(!record) return Promise.resolve(false);
    activeTasks.set(record.taskId, record);
    return enqueue(async () => {
      let node=nodes.find(item=>item?.id===record.nodeId);
      if(!node && window.loadCanvas){ await window.loadCanvas({renderCanvas:true}); node=nodes.find(item=>item?.id===record.nodeId); }
      if(!attachTask(node, record)) return false;
      render();
      // The server owns Agent task persistence. Saving here could overwrite its
      // result with the node's pre-generation empty image list.
      resumeSmartPendingNode(node);
      return true;
    });
  }
  function finishNodeTask(task) {
    const record=taskRecord(task);
    if(!record) return Promise.resolve(false);
    return enqueue(async () => {
      activeTasks.delete(record.taskId);
      let node=nodes.find(item=>item?.id===record.nodeId);
      if(!node && window.loadCanvas){ await window.loadCanvas({renderCanvas:true}); node=nodes.find(item=>item?.id===record.nodeId); }
      if(!node) return false;
      const result=task?.result && typeof task.result==='object' ? task.result : {};
      // The queued event can be persisted before this terminal event arrives.
      // Clear it locally as well, otherwise the subsequent save re-locks Run.
      delete node.queued;
      if(String(task?.status || '') === 'succeeded') {
        const media=result.image_items?.length ? result.image_items : (result.images?.length ? result.images : result);
        finalizeSmartPendingTask(node, record.taskId, resultMediaUrls(media), record.kind);
      } else {
        node.pendingTasks=smartPendingTasks(node).filter(item=>item.taskId!==record.taskId);
        node.pending=Math.max(0, Number(node.pending || 0)-1);
        if(!node.pending && !smartPendingTasks(node).length) { delete node.pendingTasks; delete node.pendingCandidatePool; node.running=false; }
      }
      render();
      // Persist only the completed output. Unlike queue registration, this
      // state contains the actual result and is safe to merge back to canvas.
      scheduleSave();
      return true;
    });
  }
  function refreshCanvas() {
    return enqueue(async () => {
      const loaded=await window.loadCanvas?.({renderCanvas:true});
      if(loaded) await restoreActiveTasks();
      return loaded;
    });
  }
  window.CanvasAgentBridge = { canvasId, selectedNodeIds, nodeLabel, nodeMentionCandidates, focusNode, startNodeTask, finishNodeTask, refreshCanvas };
})();
