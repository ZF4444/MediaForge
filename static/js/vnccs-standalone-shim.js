(function(){
    const nativeFetch = window.fetch.bind(window);

    function proxyUrl(input){
        return input;
    }

    window.fetch = function(input, init){
        if(input instanceof Request) {
            const nextUrl = proxyUrl(input.url);
            if(nextUrl !== input.url) input = new Request(nextUrl, input);
        } else {
            input = proxyUrl(input);
        }
        return nativeFetch(input, init);
    };

    function createWidget(name, value = ''){
        return { name, value, type:'hidden', hidden:true, computeSize:() => [0, 0] };
    }

    const graphNodes = new Map();
    const app = {
        graph: {
            getNodeById(id){ return graphNodes.get(String(id)) || graphNodes.get(Number(id)) || null; }
        },
        registerExtension(extension){
            window.__VNCCS_STANDALONE_EXTENSION__ = extension;
            Promise.resolve(extension?.setup?.()).catch(err => console.error('[VNCCS standalone] setup failed', err));
            if(typeof extension?.beforeRegisterNodeDef === 'function') {
                const NodeType = function(){
                    this.id = 'standalone';
                    this.widgets = [createWidget('pose_data', '{}')];
                    this.size = [1200, 820];
                    this.comfyClass = 'VNCCS_PoseStudio';
                    graphNodes.set(this.id, this);
                };
                NodeType.prototype.setSize = function(size){ this.size = size; };
                NodeType.prototype.addDOMWidget = function(name, type, element, options){
                    this.widgets.push({ name, type, element, options });
                    return element;
                };
                Promise.resolve(extension.beforeRegisterNodeDef(NodeType, { name:'VNCCS_PoseStudio' }, app)).then(() => {
                    const node = new NodeType();
                    window.__VNCCS_STANDALONE_NODE__ = node;
                    node.onNodeCreated?.();
                    window.dispatchEvent(new CustomEvent('vnccs-standalone-ready', { detail:{ node } }));
                }).catch(err => {
                    console.error('[VNCCS standalone] registration failed', err);
                    window.dispatchEvent(new CustomEvent('vnccs-standalone-error', { detail:{ error:err } }));
                });
            }
        }
    };

    const api = {
        fetchApi(path, options){ return nativeFetch(proxyUrl(path), options); },
        addEventListener(type, handler){ window.addEventListener(type, handler); },
        dispatchEvent(event){ window.dispatchEvent(event); }
    };

    window.__VNCCS_STANDALONE__ = {
        app,
        api,
        getNode(){ return window.__VNCCS_STANDALONE_NODE__ || null; },
        getPoseData(){
            const node = window.__VNCCS_STANDALONE_NODE__;
            return node?.widgets?.find(w => w.name === 'pose_data')?.value || '{}';
        },
        sync(fullCapture = true){
            const widget = window.__VNCCS_STANDALONE_NODE__?.studioWidget;
            if(!widget) return '{}';
            widget.syncToNode(fullCapture);
            return this.getPoseData();
        },
        loadGeneratedModelData(modelData){
            const widget = window.__VNCCS_STANDALONE_NODE__?.studioWidget;
            if(!widget?.loadGeneratedModelData) return Promise.reject(new Error('姿势编辑器尚未加载完成'));
            return Promise.resolve(widget.loadGeneratedModelData(modelData));
        },
        capture(){
            const widget = window.__VNCCS_STANDALONE_NODE__?.studioWidget;
            if(!widget?.viewer?.initialized) return '';
            const p = widget.exportParams || {};
            return widget.viewer.capture(
                Number(p.view_width) || 1024,
                Number(p.view_height) || 1024,
                Number(p.cam_zoom) || 1,
                p.bg_color || [255, 255, 255],
                Number(p.cam_offset_x) || 0,
                Number(p.cam_offset_y) || 0
            );
        }
    };

})();
