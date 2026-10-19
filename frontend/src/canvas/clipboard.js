// 画布复制/粘贴（以系统剪贴板为唯一来源）。
//
// 设计：
//   - 复制节点时，系统剪贴板里只写入一段"标记文本"（mediaforge-canvas://<token>），
//     节点数据本身（节点 + 流入连线）存放在 localStorage，以 token 为键。
//   - 粘贴时只看系统剪贴板里"此刻"有什么，按固定优先级决定粘贴什么：
//       1. 含画布标记      → 粘贴节点（数据按 token 从 localStorage 取回）
//       2. 含图片/视频/音频/txt 文件 → 上传并生成媒体节点 / 提示词节点
//       3. 含纯文本        → 生成提示词节点
//       4. 其它            → 提示"剪贴板中没有可粘贴的内容"
//     因为复制任何新内容都会覆盖系统剪贴板，标记随之消失，所以不会再出现
//     "画布里复制了，粘贴出来的却是之前系统里复制的东西"（或反过来）。
//   - Ctrl+V 与右键菜单"粘贴"走同一个 pasteCanvasSnapshot()，区别只在于
//     取得剪贴板快照的方式：paste 事件的 clipboardData / navigator.clipboard.read()。
//   - 非安全上下文（http://局域网IP）里浏览器没有 navigator.clipboard，右键菜单读不到
//     系统剪贴板。此时：若本页面复制后既没有失焦也没有发生过其它复制，系统剪贴板必然
//     仍是我们写入的，直接粘贴节点；否则提示按 Ctrl+V，并记住右键位置供随后的 Ctrl+V 使用。
//
// 本文件是经典 <script>（非 ES module），与其它 canvas/*.js 共享顶层作用域，
// 依赖 main.js / upload.js / node-model.js 中的全局函数与状态，调用都发生在运行期。
// main.js 在启动时调用 bindCanvasClipboardEvents() 完成事件绑定。

const CANVAS_CLIPBOARD_KEY_PREFIX = 'mediaforge.canvasClipboard.';
const CANVAS_CLIPBOARD_MARKER_RE = /mediaforge-canvas:\/\/([a-z0-9]{6,40})/i;
const CANVAS_CLIPBOARD_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const CANVAS_PASTE_HINT_TTL_MS = 30000;

// token -> payload。localStorage 不可用（隐私模式/配额）时的同页兜底。
const canvasClipboardMemory = new Map();
// 本页最近一次写入系统剪贴板的 token；valid=false 表示之后可能被别处覆盖。
let canvasClipboardOwned = {token:'', valid:false};
let canvasClipboardWriting = false;
// 右键"粘贴"读不到剪贴板时，记住右键位置，供随后的 Ctrl+V 使用。
let canvasPasteHint = null;

// ───────────────────────── 标记 & 存储 ─────────────────────────

function newCanvasClipboardToken(){
    return `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
function canvasClipboardMarkerText(count, token){
    return `[MediaForge 画布节点 ×${count}] mediaforge-canvas://${token}`;
}
function parseCanvasClipboardToken(text){
    const value = String(text || '');
    if(value.length > 300) return '';
    const match = CANVAS_CLIPBOARD_MARKER_RE.exec(value);
    return match ? match[1].toLowerCase() : '';
}
function canvasClipboardStorage(){
    try { return localStorage || null; } catch(e) { return null; }
}
function saveCanvasClipboardPayload(token, payload){
    // 系统剪贴板里始终只有最新一次复制的标记，旧数据没有保留价值。
    canvasClipboardMemory.clear();
    canvasClipboardMemory.set(token, payload);
    const storage = canvasClipboardStorage();
    if(!storage) return;
    try {
        const stale = [];
        for(let i = 0; i < storage.length; i++){
            const key = storage.key(i);
            if(key && key.startsWith(CANVAS_CLIPBOARD_KEY_PREFIX)) stale.push(key);
        }
        stale.forEach(key => storage.removeItem(key));
        storage.setItem(CANVAS_CLIPBOARD_KEY_PREFIX + token, JSON.stringify({savedAt:Date.now(), payload}));
    } catch(e) { /* 配额不足：仅保留内存副本，同页粘贴仍可用 */ }
}
function removeCanvasClipboardPayload(token){
    canvasClipboardMemory.delete(token);
    try { canvasClipboardStorage()?.removeItem(CANVAS_CLIPBOARD_KEY_PREFIX + token); } catch(e) {}
}
function loadCanvasClipboardPayload(token){
    if(!token) return null;
    const valid = payload => payload && Array.isArray(payload.nodes) && payload.nodes.length ? payload : null;
    if(canvasClipboardMemory.has(token)) return valid(canvasClipboardMemory.get(token));
    try {
        const raw = canvasClipboardStorage()?.getItem(CANVAS_CLIPBOARD_KEY_PREFIX + token);
        if(!raw) return null;
        const record = JSON.parse(raw);
        if(!record || Date.now() - Number(record.savedAt || 0) > CANVAS_CLIPBOARD_MAX_AGE_MS) return null;
        return valid(record.payload);
    } catch(e) { return null; }
}
// 本页复制后、系统剪贴板必然仍是我们写入内容时返回 token，否则返回 ''。
function ownedCanvasClipboardToken(){
    return canvasClipboardOwned.valid ? canvasClipboardOwned.token : '';
}
function invalidateOwnedCanvasClipboard(){
    canvasClipboardOwned = {...canvasClipboardOwned, valid:false};
}

// ───────────────────────── 复制 ─────────────────────────

// 复制连线策略：只保留「流入被复制节点」的连线（上游 → 复制节点，即 to 端在复制集内）。
// 这样复制下游节点会保留与上游的连线；复制上游节点则不会保留其流向下游的连线。
function buildCanvasClipboardPayload(sourceNodes, connections){
    const idSet = new Set(sourceNodes.map(n => n.id));
    const copiedConnections = (connections || []).filter(c => idSet.has(c.to));
    return {
        v:1,
        nodes:JSON.parse(JSON.stringify(sourceNodes)),
        connections:JSON.parse(JSON.stringify(copiedConnections))
    };
}
function prepareCanvasCopy(){
    if(!canvas || isEditableTarget(document.activeElement)) return null;
    const sources = selectedNodeIds().map(id => nodes.find(n => n.id === id)).filter(Boolean);
    if(!sources.length) return null;
    const token = newCanvasClipboardToken();
    const payload = buildCanvasClipboardPayload(sources, canvas.connections);
    return {token, payload, marker:canvasClipboardMarkerText(sources.length, token)};
}
function legacyCopyText(text){
    const previous = document.activeElement;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(textarea);
    let ok = false;
    try {
        textarea.focus({preventScroll:true});
        textarea.select();
        ok = document.execCommand('copy');
    } catch(e) { ok = false; }
    document.body.removeChild(textarea);
    try { previous?.focus?.({preventScroll:true}); } catch(e) {}
    return ok;
}
async function writeSystemClipboardText(text){
    canvasClipboardWriting = true;
    try {
        if(navigator.clipboard && typeof navigator.clipboard.writeText === 'function'){
            try { await navigator.clipboard.writeText(text); return true; } catch(e) { /* 回退到 execCommand */ }
        }
        return legacyCopyText(text);
    } finally {
        canvasClipboardWriting = false;
    }
}
// Ctrl+C 与右键菜单"复制"共用入口。
async function copySelectedNodes(){
    const prepared = prepareCanvasCopy();
    if(!prepared) return false;
    const {token, payload, marker} = prepared;
    // 先落盘再写系统剪贴板：写入完成的瞬间用户就可能按下 Ctrl+V。
    saveCanvasClipboardPayload(token, payload);
    const ok = await writeSystemClipboardText(marker);
    if(!ok){
        removeCanvasClipboardPayload(token);
        invalidateOwnedCanvasClipboard();
        toast('复制失败：浏览器拒绝写入剪贴板');
        return false;
    }
    canvasClipboardOwned = {token, valid:true};
    toast(`已复制 ${payload.nodes.length} 个节点`);
    return true;
}
// 浏览器菜单（编辑 > 复制）等路径触发的原生 copy 事件：同样写入标记，保持行为一致。
// 页面里别的复制（输入框、选中文字）会覆盖系统剪贴板，使本页持有的标记失效。
function handleCanvasCopyEvent(e){
    if(canvasClipboardWriting) return;
    const selectionText = window.getSelection?.().toString() || '';
    if(!selectionText && !isEditableTarget(e.target) && e.clipboardData){
        const prepared = prepareCanvasCopy();
        if(prepared){
            saveCanvasClipboardPayload(prepared.token, prepared.payload);
            e.clipboardData.setData('text/plain', prepared.marker);
            e.preventDefault();
            canvasClipboardOwned = {token:prepared.token, valid:true};
            toast(`已复制 ${prepared.payload.nodes.length} 个节点`);
            return;
        }
    }
    invalidateOwnedCanvasClipboard();
}

// ───────────────────────── 读取剪贴板 ─────────────────────────

function canReadSystemClipboard(){
    return Boolean(navigator.clipboard && typeof navigator.clipboard.read === 'function');
}
function isPasteableClipboardFile(file){
    if(isSupportedUploadFile(file)) return true;
    return typeof isPromptTextFile === 'function' && isPromptTextFile(file);
}
function clipboardMediaExtension(type){
    const extensions = {
        'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/gif':'gif',
        'video/mp4':'mp4', 'video/webm':'webm', 'audio/mpeg':'mp3', 'audio/wav':'wav',
        'audio/x-wav':'wav', 'audio/mp4':'m4a', 'audio/aac':'aac', 'audio/ogg':'ogg', 'audio/flac':'flac'
    };
    return extensions[String(type || '').toLowerCase()] || 'bin';
}
// 主动读取系统剪贴板（右键菜单粘贴用），返回与 paste 事件相同形状的快照 {files, text}。
async function readSystemClipboardSnapshot(){
    if(!canReadSystemClipboard()) throw new Error('clipboard-read-unavailable');
    const items = await navigator.clipboard.read();
    const files = [];
    let text = '';
    for(const item of items){
        const types = item.types || [];
        const mediaType = types.find(value => /^(image|video|audio)\//i.test(value));
        if(mediaType){
            const blob = await item.getType(mediaType);
            const name = `clipboard-${files.length + 1}.${clipboardMediaExtension(mediaType)}`;
            files.push(new File([blob], name, {type:blob.type || mediaType, lastModified:Date.now()}));
        }
        if(!text && types.includes('text/plain')){
            text = await (await item.getType('text/plain')).text();
        }
    }
    return {files:files.filter(isPasteableClipboardFile), text};
}
function clipboardEventMediaFiles(clipboardData){
    // clipboardData.files 和 clipboardData.items 指向同一份剪贴板内容，二者是同一次
    // 粘贴的两种访问方式而非两份独立数据。部分浏览器/截图软件组合下，两者生成的 File
    // 对象在 name/lastModified 上会有细微差异，如果都取出来再靠这些字段去重，可能去重
    // 失败，导致一次粘贴生成两张重复图片。因此只选其中一路来源：优先 items（可精确按
    // MIME 类型过滤），为空时才回退到 files。
    const itemFiles = [...(clipboardData?.items || [])]
        .filter(item => item.kind === 'file' && /^(image|video|audio|text\/plain)/i.test(String(item.type || '')))
        .map(item => {
            try { return item.getAsFile?.() || null; } catch(e) { return null; }
        })
        .filter(isPasteableClipboardFile);
    if(itemFiles.length) return itemFiles;
    return [...(clipboardData?.files || [])].filter(isPasteableClipboardFile);
}

// ───────────────────────── 粘贴 ─────────────────────────

// 纯函数：根据剪贴板快照决定粘贴什么。优先级见文件头注释。
function resolveCanvasPaste(snapshot, lookup=loadCanvasClipboardPayload){
    const files = [...(snapshot?.files || [])].filter(isPasteableClipboardFile);
    const text = String(snapshot?.text || '');
    const token = parseCanvasClipboardToken(text);
    if(token){
        const payload = lookup(token);
        return payload ? {type:'nodes', payload} : {type:'stale'};
    }
    if(files.length) return {type:'media', files};
    if(text.trim()) return {type:'text', text};
    return {type:'empty'};
}
// 纯函数：把剪贴板里的节点放到 point 处，返回要加入画布的新节点与连线。
// 复制集内部的引用指向新副本；指向复制集之外的引用只在目标画布仍存在该节点时保留。
function planCanvasPaste(payload, point, existingIds){
    const sourceNodes = payload.nodes;
    const exist = existingIds instanceof Set ? existingIds : new Set(existingIds || []);
    const xs = sourceNodes.map(n => Number(n.x) || 0);
    const ys = sourceNodes.map(n => Number(n.y) || 0);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const dx = (Number(point?.x) || 0) - cx;
    const dy = (Number(point?.y) || 0) - cy;
    const idMap = new Map();
    const copies = sourceNodes.map(n => {
        const copy = cloneSmartNode(n, dx, dy);
        idMap.set(n.id, copy.id);
        return copy;
    });
    const resolveId = id => idMap.get(id) || (exist.has(id) ? id : '');
    copies.forEach(copy => {
        if(Array.isArray(copy.inputNodeIds)) copy.inputNodeIds = copy.inputNodeIds.map(resolveId).filter(Boolean);
        if(copy.sourceNodeId){
            const mapped = resolveId(copy.sourceNodeId);
            if(mapped) copy.sourceNodeId = mapped;
            else delete copy.sourceNodeId;
        }
    });
    const valid = new Set([...exist, ...copies.map(n => n.id)]);
    const connections = (payload.connections || []).map(conn => ({
        ...conn,
        from:idMap.get(conn.from) || conn.from,
        to:idMap.get(conn.to) || conn.to
    })).filter(conn => conn.from && conn.to && conn.from !== conn.to && valid.has(conn.from) && valid.has(conn.to));
    return {copies, connections};
}
function pasteNodesFromPayload(payload, point){
    if(!canvas || !payload?.nodes?.length) return false;
    pushUndo();
    const plan = planCanvasPaste(payload, point, new Set(nodes.map(n => n.id)));
    const merged = [...(canvas.connections || [])];
    plan.connections.forEach(conn => {
        const kind = conn.kind || 'flow';
        if(!merged.some(c => c.from === conn.from && c.to === conn.to && (c.kind || 'flow') === kind)) merged.push(conn);
    });
    canvas.connections = merged;
    nodes.push(...plan.copies);
    selectedId = plan.copies.length === 1 ? plan.copies[0].id : '';
    selectedIds = plan.copies.length > 1 ? plan.copies.map(n => n.id) : [];
    selectedImage = {nodeId:'', index:-1};
    render();
    scheduleSave();
    return true;
}
function takeCanvasPasteHint(){
    const hint = canvasPasteHint;
    canvasPasteHint = null;
    return hint && Date.now() - hint.at < CANVAS_PASTE_HINT_TTL_MS ? {...hint.point} : null;
}
function canvasPastePoint(){
    const hinted = takeCanvasPasteHint();
    if(hinted) return hinted;
    if(lastMouseWorld){
        // 鼠标已移出画布可视区（如停在侧边栏）时，上次的世界坐标可能在屏幕外，改用视口中心。
        const b = visibleWorldBounds();
        if(lastMouseWorld.x >= b.left && lastMouseWorld.x <= b.right && lastMouseWorld.y >= b.top && lastMouseWorld.y <= b.bottom){
            return {...lastMouseWorld};
        }
    }
    return viewportCenter();
}
// Ctrl+V 与右键菜单共用的粘贴入口。opts: {point, targetId, forceNew}
function pasteCanvasSnapshot(snapshot, opts={}){
    const action = resolveCanvasPaste(snapshot);
    const point = opts.point ? {...opts.point} : canvasPastePoint();
    canvasPasteHint = null;
    if(action.type === 'nodes') return pasteNodesFromPayload(action.payload, point);
    if(action.type === 'media'){
        handleFiles(action.files, opts.targetId || '', {point, forceNew:Boolean(opts.forceNew)});
        return true;
    }
    if(action.type === 'text'){
        createPromptNode((Number(point.x) || 0) - 158, (Number(point.y) || 0) - 97, {text:action.text});
        return true;
    }
    toast(action.type === 'stale' ? '复制的画布节点已失效，请重新复制' : '剪贴板中没有可粘贴的内容');
    return false;
}
// 右键菜单"粘贴"。point 是右键时记录的世界坐标。
async function pasteFromContextMenu(point, opts={}){
    const pasteOpts = {point, targetId:opts.targetId || '', forceNew:Boolean(opts.forceNew)};
    let blockedReason = '';
    if(canReadSystemClipboard()){
        try {
            return pasteCanvasSnapshot(await readSystemClipboardSnapshot(), pasteOpts);
        } catch(e) {
            blockedReason = 'denied';
        }
    } else {
        // 非安全上下文（http://IP）下浏览器根本不提供 navigator.clipboard，网页无法主动读取系统剪贴板。
        blockedReason = window.isSecureContext === false ? 'insecure' : 'unsupported';
    }
    // 读不到系统剪贴板：若本页复制后剪贴板未被覆盖，直接粘贴刚复制的节点。
    const ownedToken = ownedCanvasClipboardToken();
    const payload = ownedToken ? loadCanvasClipboardPayload(ownedToken) : null;
    if(payload) return pasteNodesFromPayload(payload, point || canvasPastePoint());
    // 否则记住右键位置，用户随后按 Ctrl+V（浏览器允许 paste 事件读取剪贴板）即粘贴到此处。
    if(point) canvasPasteHint = {point:{...point}, at:Date.now()};
    const reason = blockedReason === 'denied'
        ? '剪贴板读取权限被拒绝'
        : blockedReason === 'insecure'
            ? '当前是 HTTP 访问，浏览器禁止网页主动读取剪贴板'
            : '当前浏览器禁止网页主动读取剪贴板';
    toast(`${reason}。请按 Ctrl+V，内容会粘贴到此处`, {duration:6000});
    return false;
}
function handleCanvasPasteEvent(e){
    if(isBootLoadingActive()){
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    const editable = isEditableTarget(e.target) || isEditableTarget(document.activeElement);
    const files = clipboardEventMediaFiles(e.clipboardData);
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if(editable && !files.length){
        e.preventDefault();
        // 输入框里不接收画布标记，也不接收富文本，只插入纯文本。
        if(parseCanvasClipboardToken(text)) return;
        const target = e.target?.closest?.('input, textarea, [contenteditable="true"]') || document.activeElement;
        if(target?.matches?.('input, textarea') && typeof target.setRangeText === 'function'){
            const start = target.selectionStart ?? target.value.length, end = target.selectionEnd ?? start;
            target.setRangeText(text, start, end, 'end');
            target.dispatchEvent(new Event('input', {bubbles:true}));
        } else if(target?.isContentEditable){
            document.execCommand('insertText', false, text);
        }
        return;
    }
    // 图片编辑器等弹层打开时，不在背后的画布上生成节点。
    if(document.getElementById('imageEditModal')?.classList.contains('open')) return;
    e.preventDefault();
    pasteCanvasSnapshot({files, text}, {targetId:selectedId});
}
function bindCanvasClipboardEvents(){
    window.addEventListener('paste', handleCanvasPasteEvent);
    document.addEventListener('copy', handleCanvasCopyEvent);
    document.addEventListener('cut', () => { if(!canvasClipboardWriting) invalidateOwnedCanvasClipboard(); });
    // 离开本窗口后用户可能在别处复制了东西，此后不能再假定系统剪贴板仍是我们写入的。
    window.addEventListener('blur', invalidateOwnedCanvasClipboard);
}
