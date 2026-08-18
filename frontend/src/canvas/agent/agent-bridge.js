(function(){
  const canvasId = () => new URLSearchParams(location.search).get('id') || '';
  const selectedNodeIds = () => Array.from(document.querySelectorAll('.image-node.selected[data-id]')).map(el => el.dataset.id).filter(Boolean);
  const nodeLabel = id => document.querySelector(`.image-node[data-id="${CSS.escape(id)}"]`)?.querySelector('.node-title,.smart-node-title')?.textContent?.trim() || id;
  window.CanvasAgentBridge = { canvasId, selectedNodeIds, nodeLabel, refreshCanvas: () => window.loadCanvas?.({renderCanvas:true}) };
})();
