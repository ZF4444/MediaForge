// 从 static/js/canvas.js 剪切出的复制/粘贴逻辑（M13 拆分批次）。
// 剪切时未改动任何函数签名/内部逻辑，只做了纯粹的位置搬移。
//
// 为什么这里不用 ES module 的 export/import（跟 M1-M12 同一个原因）：
// canvas.js 依赖经典 <script> 的全局作用域语义，
// static/canvas.html 里 57 处内联 onclick="xxx()" 都依赖这一点。
// 所以这里同样只做"物理文件拆分"：clipboard.js 保持经典脚本语法，通过
// <script src="clipboard.js"> 排在 candidate-pool.js 之后、
// canvas-render.js 之前加载。
//
// 本文件覆盖节点复制/粘贴 + 系统剪贴板媒体粘贴的全部逻辑（原文件
// 2818-2977 行区间，约160行）：
//   1. 节点复制/粘贴：copySelectedNodes / pasteNodes（复制/粘贴选中的
//      节点及其内部连线，按"只保留流入被复制节点的连线"策略处理）
//   2. 系统剪贴板读取：canReadSystemClipboard / clipboardMediaExtension /
//      readSystemClipboardMediaFiles（通过 navigator.clipboard.read()
//      主动读取）/ clipboardEventMediaFiles（从 paste 事件的
//      clipboardData 里提取媒体文件，只取 items 或 files 其中一路
//      来源避免重复）
//   3. 粘贴内容路由：pasteClipboardContent（判断当前应该粘贴系统剪贴板
//      媒体文件还是内部节点剪贴板，按时间戳判断谁更"新"）/
//      pasteFromContextMenu（右键菜单粘贴，主动读取系统剪贴板）
//
// 明确排除、留在 main.js 的内容：
//   - imageMetaFromNode / applyNodeMetaToImage（物理上紧邻本文件开头）：
//     图片元数据处理的小工具函数，跟复制/粘贴无关，只是碰巧写在附近。
//   - duplicateForAltDrag（物理上紧邻本文件结尾）：Alt+拖拽复制节点的
//     逻辑跟 pasteNodes 内部实现相似（都调用 cloneSmartNode 复制节点+
//     连线），但触发方式是拖拽交互而不是剪贴板，且只被
//     canvas-render.js 的 bindNodeEvents 拖拽处理器调用，属于节点拖拽
//     交互的一部分，不是剪贴板功能，本次不动。

function copySelectedNodes(){
    if(!canvas || isEditableTarget(document.activeElement)) return;
    const ids = selectedNodeIds();
    const copiedNodes = ids.map(id => nodes.find(n => n.id === id)).filter(Boolean);
    if(!copiedNodes.length) return;
    const idSet = new Set(copiedNodes.map(n => n.id));
    // 连线保留策略：只保留「流入被复制节点」的连线（上游 → 复制节点，即 to 端在复制集内）。
    // 这样复制下游节点会保留与上游的连线；复制上游节点则不会保留其流向下游的连线。
    const copiedConnections = (canvas.connections || []).filter(c => idSet.has(c.to));
    nodeClipboard = {
        nodes:JSON.parse(JSON.stringify(copiedNodes)),
        connections:JSON.parse(JSON.stringify(copiedConnections))
    };
    // 记录复制节点的时间。粘贴时据此判断：若复制节点发生在上次“因图片而消费
    // 系统剪贴板”之后，则优先粘贴节点（即使系统剪贴板里还残留着外部复制的旧图片）。
    lastNodeCopyAt = Date.now();
    toast(`已复制 ${copiedNodes.length} 个节点`);
}
function pasteNodes(){
    if(!canvas || !nodeClipboard?.nodes?.length || isEditableTarget(document.activeElement)) return;
    lastNodePasteAt = Date.now();
    pushUndo();
    const sourceNodes = nodeClipboard.nodes;
    const xs = sourceNodes.map(n => Number(n.x) || 0);
    const ys = sourceNodes.map(n => Number(n.y) || 0);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const p = lastMouseWorld || viewportCenter();
    const dx = p.x - cx;
    const dy = p.y - cy;
    const idMap = new Map();
    const copies = sourceNodes.map(n => {
        const copy = cloneSmartNode(n, dx, dy);
        idMap.set(n.id, copy.id);
        return copy;
    });
    copies.forEach(copy => {
        if(Array.isArray(copy.inputNodeIds)){
            // 已复制的输入指向新副本；外部输入保持指向原节点（连线保留）。
            copy.inputNodeIds = copy.inputNodeIds.map(id => idMap.get(id) || id).filter(Boolean);
        }
        if(copy.sourceNodeId) copy.sourceNodeId = idMap.get(copy.sourceNodeId) || copy.sourceNodeId;
    });
    // 复制的端点重映射为新节点；未被复制的外部端点保持原样（连线依然连到原邻居）。
    const validIds = new Set([...nodes.map(n => n.id), ...copies.map(n => n.id)]);
    const newConnections = (nodeClipboard.connections || []).map(conn => ({
        ...conn,
        from:idMap.get(conn.from) || conn.from,
        to:idMap.get(conn.to) || conn.to
    })).filter(conn =>
        conn.from && conn.to && conn.from !== conn.to
        && validIds.has(conn.from) && validIds.has(conn.to)
    );
    const mergedConnections = [...(canvas.connections || [])];
    newConnections.forEach(conn => {
        const kind = conn.kind || 'flow';
        if(!mergedConnections.some(c => c.from === conn.from && c.to === conn.to && (c.kind || 'flow') === kind)){
            mergedConnections.push(conn);
        }
    });
    canvas.connections = mergedConnections;
    nodes.push(...copies);
    selectedId = copies.length === 1 ? copies[0].id : '';
    selectedIds = copies.length > 1 ? copies.map(n => n.id) : [];
    selectedImage = {nodeId:'', index:-1};
    render();
    scheduleSave();
}
function canReadSystemClipboard(){
    return Boolean(navigator.clipboard && typeof navigator.clipboard.read === 'function');
}
function clipboardMediaExtension(type){
    const extensions = {
        'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/gif':'gif',
        'video/mp4':'mp4', 'video/webm':'webm', 'audio/mpeg':'mp3', 'audio/wav':'wav',
        'audio/x-wav':'wav', 'audio/mp4':'m4a', 'audio/aac':'aac', 'audio/ogg':'ogg', 'audio/flac':'flac'
    };
    return extensions[String(type || '').toLowerCase()] || 'bin';
}
async function readSystemClipboardMediaFiles(){
    if(!canReadSystemClipboard()) return [];
    const items = await navigator.clipboard.read();
    const files = [];
    for(const item of items){
        const type = (item.types || []).find(value => /^(image|video|audio)\//i.test(value));
        if(!type) continue;
        const blob = await item.getType(type);
        const name = `clipboard-${files.length + 1}.${clipboardMediaExtension(type)}`;
        files.push(new File([blob], name, {type:blob.type || type, lastModified:Date.now()}));
    }
    return files.filter(isSupportedUploadFile);
}
function clipboardEventMediaFiles(clipboardData){
    // clipboardData.files 和 clipboardData.items 指向同一份剪贴板内容，二者是同一次
    // 粘贴的两种访问方式而非两份独立数据。部分浏览器/截图软件组合下，两者生成的 File
    // 对象在 name/lastModified 上会有细微差异，如果都取出来再靠这些字段去重，可能去重
    // 失败，导致一次粘贴生成两张重复图片。因此只选其中一路来源：优先 items（可精确按
    // MIME 类型过滤），为空时才回退到 files。
    const itemFiles = [...(clipboardData?.items || [])]
        .filter(item => item.kind === 'file' && /^(image|video|audio)\//i.test(String(item.type || '')))
        .map(item => {
            try { return item.getAsFile?.() || null; } catch(e) { return null; }
        })
        .filter(isSupportedUploadFile);
    if(itemFiles.length) return itemFiles;
    return [...(clipboardData?.files || [])].filter(isSupportedUploadFile);
}
function pasteClipboardContent(files, options={}){
    const supportedFiles = [...(files || [])].filter(isSupportedUploadFile);
    const hasNodeClip = Boolean(canvas && nodeClipboard?.nodes?.length);
    const editable = Boolean(options.editable);
    const preventDefault = typeof options.preventDefault === 'function' ? options.preventDefault : () => {};
    const signature = supportedFiles.length
        ? supportedFiles.map(file => `${file.name}|${file.size}|${file.lastModified}`).join('~')
        : null;
    const pasteMedia = () => {
        preventDefault();
        lastImagePasteAt = Date.now();
        lastClipImageSig = signature;
        const point = lastMouseWorld ? {...lastMouseWorld} : viewportCenter();
        handleFiles(supportedFiles, selectedId, {point});
    };
    const pasteInternalNodes = () => {
        preventDefault();
        if(Date.now() - lastNodePasteAt > 80) pasteNodes();
    };

    // Keep context-menu paste and native Ctrl+V on the same media-vs-node priority path.
    if(supportedFiles.length && signature !== lastClipImageSig){
        pasteMedia();
        return true;
    }
    if(hasNodeClip && !editable && lastNodeCopyAt > lastImagePasteAt){
        pasteInternalNodes();
        return true;
    }
    if(supportedFiles.length){
        pasteMedia();
        return true;
    }
    if(hasNodeClip && !editable){
        pasteInternalNodes();
        return true;
    }
    return false;
}
async function pasteFromContextMenu(){
    if(!canReadSystemClipboard()){
        toast('浏览器不允许右键读取系统剪贴板，请使用 Ctrl+V');
        return;
    }
    let files;
    try {
        files = await readSystemClipboardMediaFiles();
    } catch(e) {
        toast('浏览器不允许右键读取系统剪贴板，请使用 Ctrl+V');
        return;
    }
    if(!pasteClipboardContent(files, {editable:false})) toast('剪贴板中没有可粘贴的内容');
}
