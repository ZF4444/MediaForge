// 从 static/js/canvas.js 剪切出的节点数据模型逻辑（M3 拆分批次）。
// 剪切时未改动任何函数签名/内部逻辑，只做了纯粹的位置搬移。
//
// 为什么这里不用 ES module 的 export/import（跟 M1 utils.js / M2 loop-node.js /
// 本次的 node-layout.js 同一个原因）：canvas.js 依赖经典 <script>
// 的全局作用域语义，static/canvas.html 里 57 处内联 onclick="xxx()"
// 都依赖这一点。这里的函数里也有对 nodes/selectedId 等全局状态的直接
// 读取和重新赋值（例如 createNode 里的 `selectedId = node.id`），必须
// 靠经典脚本共享全局作用域才能工作。所以 node-model.js 同样是经典脚本，
// 通过 <script src="node-model.js"> 排在 node-layout.js 之后、main.js
// 之前加载（createImageNodeAt 依赖 node-layout.js 的 imageLayout）。
//
// 依赖的外部全局（都还留在 static/js/canvas.js / main.js 里，
// 通过共享全局作用域访问，未随本文件迁移）：
//   状态变量：nodes, selectedId
//   工具函数（M1 已拆到 utils.js）：uid, tr
//   布局计算（本次拆到 node-layout.js）：imageLayout, mediaNodeDefaultScale
//   节点操作：pushUndo, render, scheduleSave, stripImageGenerationMeta
//   候选池管理：shouldUseCandidatePoolForImages, migrateGeneratedImagesToCandidatePool,
//     mergeCandidateImages, setNodeMainCandidate（candidateImages 相关的
//     一整套逻辑，体量较大且相对独立，本次不动，留在 main.js）
//   其他节点元数据/媒体判断：stripImageGenerationMeta, mediaKindForItem,
//     isMaskImageItem, generatedImageWithNodeFallback
//   聊天模型解析（createPromptNode 用）：resolveChatProviderId, resolveChatModel
//   常量：MEDIA_GROUP_DEFAULT_SCALE, SMART_GROUP_DEFAULT_WIDTH,
//     SMART_GROUP_DEFAULT_HEIGHT
//
// 刻意排除（留在 main.js，属于其他模块的范畴）：
//   createGenerationNodeByKind —— 调用 updateComposer()/引用
//   lastComposerNodeId，是"创建生成节点 + 同步 composer UI 状态"的组合
//   操作，UI 状态同步部分超出了纯节点数据模型的范畴。
//   applyNodeMetaToImage —— 只是 stripImageGenerationMeta 的单行包装，
//   使用点单一，不属于节点创建/克隆/规范化的核心逻辑，留在原位置。

function normalizeLegacySmartNode(node){
    if(!node || typeof node !== 'object') return node;
    if(node.type === 'smart-container'){
        const fallbackImage = node.inputImage?.url ? stripImageGenerationMeta({
            url:node.inputImage.url,
            name:node.inputImage.name || 'image',
            kind:node.inputImage.kind || mediaKindForItem(node.inputImage),
            natural_w:Number(node.inputImage.natural_w || 0),
            natural_h:Number(node.inputImage.natural_h || 0)
        }) : null;
        const images = Array.isArray(node.images) && node.images.length
            ? node.images
            : (fallbackImage ? [fallbackImage] : []);
        const normalized = {
            ...node,
            type:'smart-image',
            title:images.length > 1 ? 'Group' : (images.length ? 'Image' : tr('smart.createGenerationNode')),
            images
        };
        delete normalized.imageMode;
        delete normalized.inputImage;
        delete normalized.steps;
        delete normalized.resultGrouping;
        return normalized;
    }
    if(node.assetOnly === true && !node.type) node.type = 'smart-asset-image';
    if(!node.type) node.type = 'smart-image';
    if(node.type === 'smart-image' || node.type === 'smart-asset-image') delete node.imageMode;
    if(node.type === 'smart-image' && node.historyFor) node.isHistoryGroup = true;
    if(node.type === 'smart-image' || node.type === 'smart-asset-image'){
        delete node.scale;
        const keepPendingSize = Number(node.pending) > 0 || Boolean(node.queued || (Array.isArray(node.pendingTasks) && node.pendingTasks.length));
        if(!keepPendingSize){
            delete node.w;
            delete node.h;
        }
    }
    if(node.type === 'smart-image' && !node.isHistoryGroup){
        if(!migrateGeneratedImagesToCandidatePool(node)){
            const generatedImages = (node.images || []).filter(img => img?.url && (img.generatedResult || node.runPrompt || node.runModelPrompt || node.sourceNodeId || node.runAt));
            if((node.candidateImages || []).length || generatedImages.length > 1){
                node.candidateImages = mergeCandidateImages(node.candidateImages || [], generatedImages);
                if(generatedImages.length && generatedImages.length === (node.images || []).filter(img => img?.url).length){
                    setNodeMainCandidate(node, Number(node.candidateIndex) || 0);
                }
            }
        }
    }
    return node;
}
function createImageNodeAt(point, images=[], options={}){
    const nodeType = options.type || 'smart-image';
    const layout = imageLayout(images || [], mediaNodeDefaultScale({type:nodeType, images:images || []}), {type:nodeType, images:images || []});
    return createNode((point?.x || 0) - Math.round(layout.width / 2), (point?.y || 0) - Math.round(layout.height / 2), images, options);
}
function inheritNodeMetaFromImage(node){
    if(!node) return;
    node.images = (node.images || []).map(img => stripImageGenerationMeta(img));
}
function createNode(x, y, images=[], options={}){
    if(!options.skipUndo) pushUndo();
    const nodeImages = (images || []).map(img => ({...img}));
    const node = {id:uid('smart'), type:options.type || 'smart-image', x, y, title:nodeImages.length > 1 ? 'Group' : nodeImages.length ? 'Image' : tr('smart.createGenerationNode'), images:nodeImages, created_at:Date.now()};
    node.scale = nodeImages.length > 1 ? MEDIA_GROUP_DEFAULT_SCALE : mediaNodeDefaultScale(node);
    inheritNodeMetaFromImage(node);
    nodes.push(node);
    if(options.select !== false) selectedId = node.id;
    render();
    scheduleSave();
    return node;
}
function createPromptNode(x, y, options={}){
    if(!options.skipUndo) pushUndo();
    const providerId = resolveChatProviderId();
    const node = {
        id:uid('prompt'),
        type:'smart-prompt',
        x,
        y,
        w:316,
        h:194,
        title:'Prompt',
        text:'',
        llmEnabled:false,
        llmProvider:providerId,
        llmModel:resolveChatModel('', providerId),
        llmTask:'llm',
        captionTemplateId:'',
        expandTemplateId:'',
        llmInstruction:'',
        created_at:Date.now()
    };
    nodes.push(node);
    if(options.select !== false) selectedId = node.id;
    if(!options.deferRender) render();
    if(!options.deferSave) scheduleSave();
    return node;
}
function createSmartGroupNode(x, y, options={}){
    if(!options.skipUndo) pushUndo();
    const node = {id:uid('group'), type:'smart-group', x, y, w:SMART_GROUP_DEFAULT_WIDTH, h:SMART_GROUP_DEFAULT_HEIGHT, title:'智能分组', items:[], images:[], created_at:Date.now()};
    nodes.push(node);
    if(options.select !== false) selectedId = node.id;
    render();
    scheduleSave();
    return node;
}
function cloneSmartNode(node, dx=0, dy=0){
    const copy = JSON.parse(JSON.stringify(node));
    copy.id = uid(
        node.type === 'smart-prompt'
            ? 'prompt'
            : node.type === 'smart-loop'
            ? 'loop'
            : node.type === 'smart-group'
            ? 'group'
            : 'smart'
    );
    copy.x = (Number(node.x) || 0) + dx;
    copy.y = (Number(node.y) || 0) + dy;
    copy.running = false;
    copy.pending = 0;
    delete copy.runStartedAt;
    delete copy.runFinishedAt;
    delete copy.runElapsedMs;
    delete copy.runTimerHidden;
    // 有多个候选资源的节点：复制后仅保留主资源（当前 candidateIndex 指向的那张），丢弃其余候选。
    if(Array.isArray(copy.candidateImages) && copy.candidateImages.length > 1){
        const pool = copy.candidateImages.filter(img => img?.url);
        const mainIndex = Math.max(0, Math.min(pool.length - 1, Number(copy.candidateIndex) || 0));
        const main = pool[mainIndex];
        if(main){
            copy.candidateImages = [main];
            copy.candidateIndex = 0;
            copy.images = [{...main, generatedResult:true}];
        }
    } else if(shouldUseCandidatePoolForImages(node) && Array.isArray(copy.images) && copy.images.length > 1){
        // 候选池尚未迁移、仅存在于 images 中的旧节点：同样只保留主资源。
        const pool = copy.images.filter(img => img?.url);
        const mainIndex = Math.max(0, Math.min(pool.length - 1, Number(copy.candidateIndex) || 0));
        const main = pool[mainIndex];
        if(main){
            copy.images = [{...main, generatedResult:true}];
            delete copy.candidateImages;
            copy.candidateIndex = 0;
        }
    }
    if(copy.type === 'smart-group') copy.title = copy.title || '智能分组';
    return copy;
}
