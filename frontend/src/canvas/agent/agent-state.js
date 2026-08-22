// Agent state is deliberately limited to Run/UI data. It never mirrors canvas nodes.
window.CanvasAgentState = { runId: '', sequence: 0, plan: null, tasks: [], mentions: [], pollTimer: null, pollInterval: 0, reconnectTimer: null, busy: false, operationId: '', lastEvent: null, modelProvider: '', modelName: '' };
