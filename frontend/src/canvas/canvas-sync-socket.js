// Canvas collaboration WebSocket transport.
// Kept in the canvas feature bundle so it can share the existing canvas state
// while isolating connection lifecycle from page orchestration.
function connectAssetLibrarySyncSocket(){
    const host = window.location.host;
    if(!host) return;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const clientId = smartClientId;
    let socket;
    let retryTimer = null;
    const connect = () => {
        try {
            socket = new WebSocket(`${protocol}://${host}/ws/stats?client_id=${clientId}`);
        } catch(e) {
            retryTimer = setTimeout(connect, 3000);
            return;
        }
        socket.addEventListener('message', event => {
            try {
                const data = JSON.parse(event.data);
                if(data?.type === 'asset_library_updated') handleAssetLibraryUpdatedMessage(data);
                if(data?.type === 'canvas_updated') handleCanvasUpdatedMessage(data);
                if((data?.type === 'agent.event' || data?.type?.startsWith('agent.')) && canvasAgentHandleEvent) canvasAgentHandleEvent(data);
            } catch(e) {}
        });
        socket.addEventListener('close', () => {
            retryTimer = setTimeout(connect, 3000);
        });
        socket.addEventListener('error', () => {
            try { socket.close(); } catch(e) {}
        });
    };
    window.addEventListener('beforeunload', () => {
        clearTimeout(retryTimer);
        try { socket?.close(); } catch(e) {}
    }, { once: true });
    connect();
}
