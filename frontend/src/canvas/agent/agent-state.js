// Agent state is deliberately limited to Run/UI data. It never mirrors canvas nodes.
window.CanvasAgentState = { runId: '', sequence: 0, plan: null, tasks: [], mentions: [], pollTimer: null, reconnectTimer: null, busy: false };
