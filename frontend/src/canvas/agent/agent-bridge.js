(function(){
  const canvasId = () => new URLSearchParams(location.search).get('id') || '';
  const selectedNodeIds = () => Array.from(document.querySelectorAll('.image-node.selected[data-id]')).map(el => el.dataset.id).filter(Boolean);
  const nodeLabel = id => document.querySelector(`.image-node[data-id="${CSS.escape(id)}"]`)?.querySelector('.node-title,.smart-node-title')?.textContent?.trim() || id;
  const nodeMentionCandidates = () => Array.from(document.querySelectorAll('.image-node[data-id]')).map(el => ({id:el.dataset.id || '', label:el.querySelector('.node-title,.smart-node-title')?.textContent?.trim() || el.dataset.id || ''})).filter(item => item.id && item.label);
  const focusNode = id => Boolean(window.focusCanvasNode?.(id));
  window.CanvasAgentBridge = { canvasId, selectedNodeIds, nodeLabel, nodeMentionCandidates, focusNode, refreshCanvas: () => window.loadCanvas?.({renderCanvas:true}) };
})();
