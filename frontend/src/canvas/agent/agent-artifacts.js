(function(){
  const state = window.CanvasAgentState;
  function render(tasks=[]) {
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
  CanvasAgentArtifacts = { render };
})();
