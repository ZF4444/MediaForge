const params = new URLSearchParams(location.search);
const canvasId = params.get('id') || '';
const shell = document.getElementById('shell');
const bootLoadingOverlay = document.getElementById('bootLoadingOverlay');
const world = document.getElementById('world');
const composer = document.getElementById('composer');
const nodeShortcutOverlay = document.getElementById('nodeShortcutOverlay');
const nodeContextMenu = document.getElementById('nodeContextMenu');
const createMenu = document.getElementById('createMenu');
const portDropMenu = document.getElementById('portDropMenu');
const promptInput = document.getElementById('promptInput');
const mentionPicker = document.getElementById('mentionPicker');
const mentionPreview = document.getElementById('mentionPreview');
const engineSelect = document.getElementById('engineSelect');
const composerHeadParams = document.getElementById('composerHeadParams');
const dynamicParams = document.getElementById('dynamicParams');
const runBtn = document.getElementById('runBtn');
const cascadeRunBtn = document.getElementById('cascadeRunBtn');
const promptComposer = document.getElementById('promptComposer');
const promptTaskSelect = document.getElementById('promptTaskSelect');
const promptComposerParams = document.getElementById('promptComposerParams');
const promptComposerThumbs = document.getElementById('promptComposerThumbs');
const promptComposerInputPreview = document.getElementById('promptComposerInputPreview');
const promptComposerInstructionRow = document.getElementById('promptComposerInstructionRow');
const promptComposerInstruction = document.getElementById('promptComposerInstruction');
const promptComposerRunBtn = document.getElementById('promptComposerRunBtn');
const fileInput = document.getElementById('fileInput');
const apiKindToggle = document.getElementById('apiKindToggle');
const inputThumbsRow = document.getElementById('inputThumbsRow');
const inputPromptPreview = document.getElementById('inputPromptPreview');
const minimap = document.getElementById('minimap');
const minimapContent = document.getElementById('minimapContent');
const imageEditModal = document.getElementById('imageEditModal');
const smartLogModal = document.getElementById('smartLogModal');
const smartLogList = document.getElementById('smartLogList');
const smartShortcutModal = document.getElementById('smartShortcutModal');
const smartWorkflowToggle = document.getElementById('smartWorkflowToggle');
const smartWorkflowTransferModal = document.getElementById('smartWorkflowTransferModal');
const smartWorkflowTransferSub = document.getElementById('smartWorkflowTransferSub');
const smartWorkflowExportMeta = document.getElementById('smartWorkflowExportMeta');
const smartWorkflowImportInput = document.getElementById('smartWorkflowImportInput');
const smartWorkflowImportDropZone = document.getElementById('smartWorkflowImportDropZone');
const selectionBox = document.getElementById('selectionBox');
const selectionActions = document.getElementById('selectionActions');
const assetToggle = document.getElementById('assetToggle');
const assetPanel = document.getElementById('assetPanel');
const assetCloseBtn = document.getElementById('assetCloseBtn');
const assetLibrarySelect = document.getElementById('assetLibrarySelect');
const assetCategorySelect = document.getElementById('assetCategorySelect');
const assetGrid = document.getElementById('assetGrid');
const assetDropZone = document.getElementById('assetDropZone');
const workflowEmpty = document.getElementById('workflowEmpty');
const assetImageControls = document.getElementById('assetImageControls');
const assetDialogBackdrop = document.getElementById('assetDialogBackdrop');
const assetDialogTitle = document.getElementById('assetDialogTitle');
const assetDialogInput = document.getElementById('assetDialogInput');
const assetDialogCancel = document.getElementById('assetDialogCancel');
const assetDialogOk = document.getElementById('assetDialogOk');
const nodeAssetSaveModal = document.getElementById('nodeAssetSaveModal');
const nodeAssetSaveClose = document.getElementById('nodeAssetSaveClose');
const nodeAssetSaveLibraries = document.getElementById('nodeAssetSaveLibraries');
const nodeAssetSaveNewFolder = document.getElementById('nodeAssetSaveNewFolder');
const nodeAssetSaveFolders = document.getElementById('nodeAssetSaveFolders');
const nodeAssetSaveName = document.getElementById('nodeAssetSaveName');
const nodeAssetSaveCancel = document.getElementById('nodeAssetSaveCancel');
const nodeAssetSaveConfirm = document.getElementById('nodeAssetSaveConfirm');
const assetHoverPreview = document.getElementById('assetHoverPreview');
const promptPresetPanel = document.getElementById('promptPresetPanel');
const promptPresetClose = document.getElementById('promptPresetClose');
const promptPresetStatus = document.getElementById('promptPresetStatus');
const promptPresetSelect = document.getElementById('promptPresetSelect');
const promptPresetName = document.getElementById('promptPresetName');
const promptPresetText = document.getElementById('promptPresetText');
const promptPresetApply = document.getElementById('promptPresetApply');
const promptPresetDelete = document.getElementById('promptPresetDelete');
const promptPresetNew = document.getElementById('promptPresetNew');
const promptPresetSave = document.getElementById('promptPresetSave');
const promptTemplatePanel = document.getElementById('promptTemplatePanel');
const promptTemplateClose = document.getElementById('promptTemplateClose');
const promptTemplateSearch = document.getElementById('promptTemplateSearch');
const promptTemplateLibrarySelect = document.getElementById('promptTemplateLibrarySelect');
const promptTemplateCats = document.getElementById('promptTemplateCats');
const promptTemplateBody = document.getElementById('promptTemplateBody');
const composerTemplateBtn = document.getElementById('composerTemplateBtn');
function showBootLoadingOverlay(){
    if(shell) shell.classList.add('boot-loading');
    if(!bootLoadingOverlay) return;
    bootLoadingOverlay.classList.remove('is-hidden', 'is-fading');
    bootLoadingOverlay.setAttribute('aria-busy', 'true');
}
function hideBootLoadingOverlay(onHidden){
    if(!bootLoadingOverlay){
        if(typeof onHidden === 'function') onHidden();
        return;
    }
    bootLoadingOverlay.classList.add('is-fading');
    bootLoadingOverlay.setAttribute('aria-busy', 'false');
    const finalize = () => {
        bootLoadingOverlay.removeEventListener('transitionend', finalize);
        bootLoadingOverlay.classList.add('is-hidden');
        bootLoadingOverlay.classList.remove('is-fading');
        if(shell) shell.classList.remove('boot-loading');
        if(typeof onHidden === 'function') onHidden();
    };
    bootLoadingOverlay.addEventListener('transitionend', finalize, {once:true});
}
function isBootLoadingActive(){
    return Boolean(shell?.classList.contains('boot-loading') && bootLoadingOverlay && !bootLoadingOverlay.classList.contains('is-hidden'));
}
function nextFrame(){
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
}
function visibleWorldBounds(){
    return {
        left:(-viewport.x) / viewport.scale,
        top:(-viewport.y) / viewport.scale,
        right:(-viewport.x + shell.clientWidth) / viewport.scale,
        bottom:(-viewport.y + shell.clientHeight) / viewport.scale
    };
}
function rectIntersects(a, b){
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
function bootVisibleNodeIds(){
    if(!shell || !nodes.length) return [];
    const view = visibleWorldBounds();
    return nodes.filter(node => {
        const rect = nodeRect(node);
        return rectIntersects(
            {left:rect.x, top:rect.y, right:rect.x + rect.width, bottom:rect.y + rect.height},
            view
        );
    }).map(node => node.id);
}
function mediaReadyPromise(el){
    if(!el) return Promise.resolve();
    if(el.tagName?.toLowerCase() === 'img'){
        if(el.complete && (el.naturalWidth > 0 || !el.currentSrc)) return Promise.resolve();
        return new Promise(resolve => {
            const done = () => {
                el.removeEventListener('load', done);
                el.removeEventListener('error', done);
                resolve();
            };
            el.addEventListener('load', done, {once:true});
            el.addEventListener('error', done, {once:true});
        });
    }
    if(el.tagName?.toLowerCase() === 'video'){
        if((el.readyState || 0) >= 1) return Promise.resolve();
        return new Promise(resolve => {
            const done = () => {
                el.removeEventListener('loadedmetadata', done);
                el.removeEventListener('error', done);
                resolve();
            };
            el.addEventListener('loadedmetadata', done, {once:true});
            el.addEventListener('error', done, {once:true});
        });
    }
    return Promise.resolve();
}
async function waitForVisibleBootMedia(timeoutMs=2500){
    await nextFrame();
    const idSet = new Set(bootVisibleNodeIds());
    if(!idSet.size) return;
    const media = [...world.querySelectorAll('.image-node img, .image-node video')].filter(el => {
        const nodeEl = el.closest('.image-node');
        return nodeEl?.dataset?.id && idSet.has(nodeEl.dataset.id);
    });
    if(!media.length) return;
    await Promise.race([
        Promise.all(media.map(mediaReadyPromise)),
        new Promise(resolve => setTimeout(resolve, timeoutMs))
    ]);
}
let minimapViewport = document.getElementById('minimapViewport');
let canvas = null;
let nodes = [];
let selectedId = '';
let selectedIds = [];
let selectedImage = {nodeId:'', index:-1};
let dragState = null;
let loopInsertPreview = null;
let selectionState = null;
let selectionJustFinished = false;
let thumbDragState = null;
let uploadTargetId = '';
let pendingGroupUploadPoint = null;
let mentionRange = null;
let panState = null;
let spacePanActive = false;
let didPan = false;
let rightMouseDownPoint = null;
let rightMouseDownViewport = null;
let portDragState = null;
let saveTimer = null;
let suppressAutoSave = false;
let deferredAutoSaveNeeded = false;
let suppressAutoSaveReleaseTimer = null;
let viewportInteractionReleaseTimer = null;
let minimapRenderQueued = false;
let connectionLayerRefreshQueued = false;
let viewportInteractionActive = false;
let pendingMinimapRefreshAfterInteraction = false;
let lastConnectionLayerRefreshAt = 0;
let apiProviders = [];
let comfyWorkflows = [];
let comfyInstanceCount = 1;
let assetLibrary = {categories:[]};
let assetLibraryOpen = false;
let assetTab = 'image';
let activeAssetCategoryId = '';
let activeAssetLibraryId = '';
let mentionSource = 'input';
let mentionAssetCategoryId = '';
let assetLibraryUpdatedAt = 0;
let assetLibraryRefreshTimer = null;
let nodeAssetSaveState = {open:false, fileId:'', name:'', items:[], useOriginalNames:false, libraryId:'', categoryId:''};
const PROMPT_PRESETS_KEY = 'smart_canvas_prompt_presets_v1';
const PROMPT_TEMPLATE_GROUPS_KEY = 'smart_canvas_prompt_template_groups_v1';
const PROMPT_TEMPLATE_OVERRIDES_KEY = 'smart_canvas_prompt_template_overrides_v1';
let promptPresets = [];
let builtinPromptTemplates = [];
let promptLibraries = [];
let activePromptLibraryId = 'system';
let promptTemplateGroups = [];
let promptTemplateOverrides = {hiddenBuiltinIds:[], editedBuiltins:{}};
let promptTemplateCategory = 'all';
let promptTemplateSelectedId = '';
let promptTemplateEditing = false;
let promptTemplateGroupEditMode = false;
let promptPresetDeleteArmed = false;
let createMenuPoint = {x:0, y:0};
let nodeClipboard = null;
let imageClickTimer = null;
let suppressImageClickUntil = 0;
let candidatePanelNodeId = '';
let candidatePanelIndex = 0;
let candidatePanelAttentionNodeId = '';
let expandedCandidateNodeIds = new Set();
let suppressComposerForCandidateNodeId = '';
let lastMouseWorld = null;
let lastConfigRefreshAt = 0;
let smartMinimapState = null;
let smartMinimapDrag = false;
let zoomPreviewState = null;
let runTimerInterval = null;
let smartCascadeRunning = false;
let smartCascadeActiveLoopId = '';
let smartCascadeStopRequested = false;
let smartCascadeSilentSelection = false;
let smartCascadeRunPath = null;
const smartCascadeRuns = new Map();
let smartLoopContext = null;
let runBtnCooldownToken = 0;
let smartRunStateToken = 0;
let reopenVideoControlAfterRender = '';
const activeSmartTaskPolls = new Map();
const activeRunningHubTaskPolls = new Map();
const smartNodeRunTokens = new Map();
let smartRhRandomValues = {};
let lastImagePasteAt = 0;
let lastNodePasteAt = 0;
let lastNodeCopyAt = 0;
let lastClipImageSig = null;
let suppressNodeClickUntil = 0;
let textSelectionGuard = null;
const UNDO_LIMIT = 40;
const undoStack = [];
let undoSuppressed = false;
let pendingUndoSnapshot = null;
function activeSmartCascadeCount(){ return smartCascadeRuns.size; }
function smartCascadeRunForLoop(loopId){ return loopId ? smartCascadeRuns.get(loopId) || null : null; }
function smartCascadeIsLoopRunning(loopId){ return Boolean(smartCascadeRunForLoop(loopId)); }
function syncSmartCascadeLegacyState(preferredLoopId=''){
    const activeIds = [...smartCascadeRuns.keys()];
    smartCascadeRunning = activeIds.length > 0;
    smartCascadeActiveLoopId = preferredLoopId && smartCascadeRuns.has(preferredLoopId)
        ? preferredLoopId
        : (activeIds[0] || '');
    const activeRun = smartCascadeActiveLoopId ? smartCascadeRuns.get(smartCascadeActiveLoopId) : null;
    smartCascadeStopRequested = Boolean(activeRun?.stopRequested);
    smartCascadeRunPath = activeRun?.runPath || null;
}
function smartCascadeAnyRunning(){ return smartCascadeRunning || activeSmartCascadeCount() > 0; }
function smartCascadeEdgeState(edgeKey){
    for(const run of smartCascadeRuns.values()){
        const state = run?.runPath?.states?.[edgeKey];
        if(state) return state;
    }
    return smartCascadeRunPath?.states?.[edgeKey] || '';
}
function smartCascadePathForCtx(ctx=null){
    return ctx?.runState?.runPath || ctx?.runPath || smartCascadeRunPath;
}
function capturePendingUndo(){ pendingUndoSnapshot = snapshotForUndo(); }
function commitPendingUndo(){
    if(pendingUndoSnapshot){
        undoStack.push(pendingUndoSnapshot);
        if(undoStack.length > UNDO_LIMIT) undoStack.shift();
        pendingUndoSnapshot = null;
    }
}
function discardPendingUndo(){ pendingUndoSnapshot = null; }
function snapshotForUndo(){
    return {
        nodes: JSON.parse(JSON.stringify(nodes)),
        connections: JSON.parse(JSON.stringify(canvas?.connections || [])),
        selectedId,
        selectedIds: selectedIds.slice(),
        selectedImage: {...selectedImage}
    };
}
function pushUndo(){
    if(undoSuppressed) return;
    if(!canvas) return;
    undoStack.push(snapshotForUndo());
    if(undoStack.length > UNDO_LIMIT) undoStack.shift();
}
function performUndo(){
    if(!undoStack.length){ toast(tr('smart.toastNoUndo')); return; }
    const snap = undoStack.pop();
    undoSuppressed = true;
    nodes = snap.nodes;
    if(canvas) canvas.connections = snap.connections;
    selectedId = snap.selectedId;
    selectedIds = snap.selectedIds;
    selectedImage = snap.selectedImage;
    candidatePanelNodeId = '';
    candidatePanelIndex = 0;
    suppressComposerForCandidateNodeId = '';
    activeComposerSubject = null;
    lastComposerNodeId = '';
    render();
    scheduleSave();
    undoSuppressed = false;
    toast(tr('smart.toastUndone'));
}
let comfyWorkflowCache = {};
let cropState = null;
let cropDrag = null;
let imageEditMode = 'crop';
let imageEditModeTouched = false;
let editDrawState = null;
let editTextItems = [];
let editTextSelectedId = '';
let editTextDrag = null;
let editTextDirty = false;
let editTextInlineEditor = null;
let editDrawUndoStack = [];
let editDrawRedoStack = [];
const EDIT_DRAW_HISTORY_MAX = 40;
let brushTool = 'free';
let brushLabelCounter = 1;
let gridCustomMode = false;
let gridCustomLines = [];
let gridCustomOrientation = 'h';
let gridCustomHistory = [];
let gridCustomDrag = null;
let gridOperationMode = 'split';
let gridJoinLayout = null;
let gridJoinDrag = null;
let gridJoinImageCache = new Map();
let gridJoinOutputSize = 2048;
let imageEditZoom = 1.0;
let imageEditBaseW = 0;
let imageEditBaseH = 0;
let previewZoom = 1.0;
let previewPan = {x:0, y:0};
let gridJoinZoom = 1.0;
let gridJoinPan = {x:0, y:0};
let previewPanDrag = null;
let previewCompareDrag = false;
let previewComparePos = 50;
let imageEditPanDrag = null;
let previewNavState = {nodeId:'', index:0, count:0, source:'images'};
const PANORAMA_RATIO_PRESETS = {
    square:{w:1, h:1},
    portrait:{w:2, h:3},
    landscape:{w:3, h:2},
    portrait43:{w:3, h:4},
    landscape43:{w:4, h:3},
    story:{w:9, h:16},
    wide:{w:16, h:9},
    ultrawide:{w:21, h:9},
    ultratall:{w:9, h:21}
};
let panoramaState = {
    enabled:false,
    ratio:'wide',
    customW:16,
    customH:9,
    fov:75,
    yaw:0,
    pitch:0,
    drag:null,
    three:null,
    renderer:null,
    scene:null,
    camera:null,
    sphere:null,
    texture:null,
    threeLoadPromise:null,
    image:null,
    ctx:null,
    animationId:0,
    loadedSrc:'',
    loadToken:0
};
window.__smartCanvasPanoramaState = panoramaState;
let viewport = {x:0, y:0, scale:1};
let settings = {
    engine:'api',
    apiKind:'image',
    provider_id:'',
    model:'',
    ratio:'square',
    resolution:'1k',
    customRatio:'',
    customRatioWidth:'',
    customRatioHeight:'',
    customSize:'',
    customWidth:'',
    customHeight:'',
    quality:'auto',
    count:1,
    videoProvider:'',
    videoModel:'',
    videoDuration:5,
    videoAspect:'16:9',
    videoResolution:'',
    videoGenerateAudio:false,
    videoMultimodal:true,
    videoUseFrameRoles:false,
    msgenModel:'zimage',
    msCustomModel:'',
    msRatio:'square',
    msResolution:'1k',
    msCustomRatio:'',
    msCustomRatioWidth:'',
    msCustomRatioHeight:'',
    msCustomSize:'',
    msCustomWidth:'',
    msCustomHeight:'',
    comfyMode:'text',
    comfyWorkflow:'',
    comfyParams:{},
    rhConfigKey:'',
    rhInstanceType:'',
    rhParams:{},
    rhRandomActive:{},
    width:1024,
    height:1024,
    enhanceStrength:0.5,
    enhanceUpscale:false,
    enhanceUpscaleRes:2048,
    editUpscale:false,
    editUpscaleRes:2048,
    promptH:124
};
const MS_GEN_MODELS = {
    zimage: { label:'ZImage', modelId:'Tongyi-MAI/Z-Image-Turbo', supportsImage:false, endpoint:'/generate' },
    qwen_edit: { label:'Qwen Edit', modelId:'Qwen/Qwen-Image-Edit-2511', supportsImage:true, endpoint:'/api/angle/generate' },
    klein_edit: { label:'Klein', modelId:'black-forest-labs/FLUX.2-klein-9B', supportsImage:true, endpoint:'/api/ms/generate' },
    custom: { label:tr('smart.custom') || '自定义', modelId:'', acceptsImage:true, endpoint:'/api/ms/generate' }
};
const SIZE_MAP = {
    square: {'1k':'1024x1024','2k':'2048x2048','4k':'4096x4096'},
    landscape: {'1k':'1536x1024','2k':'2048x1360','4k':'3520x2336'},
    portrait: {'1k':'1024x1536','2k':'1360x2048','4k':'2336x3520'},
    landscape43: {'1k':'1024x768','2k':'2048x1536','4k':'3312x2480'},
    portrait43: {'1k':'768x1024','2k':'1536x2048','4k':'2480x3312'},
    wide: {'1k':'1536x864','2k':'2048x1152','4k':'3840x2160'},
    story: {'1k':'864x1536','2k':'1152x2048','4k':'2160x3840'},
    ultrawide: {'1k':'1536x656','2k':'2048x880','4k':'3840x1648'},
    ultratall: {'1k':'656x1536','2k':'880x2048','4k':'1648x3840'}
};
const RES_LONG_SIDE = { '1k':1024, '2k':2048, '4k':3840 };
const RES_PIXEL_LIMIT = { '1k':2359296, '2k':4194304, '4k':8294400 };
// M1 拆分：tr/trf/refreshIcons/uid/escapeHtml/escapeAttr 已迁移到
// frontend/src/smart-canvas/utils.js（经典 <script>，非 ES module，
// 顶层声明仍挂到 window，构建产物里通过 <script src> 排在本文件之前
// 加载，此处调用方式不变，无需 import）。
function cloneSmartSettings(source=settings){
    try {
        return JSON.parse(JSON.stringify(source || {}));
    } catch(e) {
        return {...(source || {})};
    }
}
function settingsForStorage(source=settings){
    return cloneSmartSettings(source);
}
function isApiLikeEngine(engine){
    return ['api', 'volcengine'].includes(String(engine || '').toLowerCase());
}
function mediaItemForStorage(item){
    if(!item || typeof item !== 'object') return item;
    const clean = {...item};
    delete clean.cloudUrl;
    delete clean.uploadedUrl;
    delete clean.originalRemoteUrl;
    delete clean.tempCloudUrl;
    delete clean.runInputRefs;
    if(clean.runSettings) clean.runSettings = settingsForStorage(clean.runSettings);
    return clean;
}
function stripNodeScaleFieldsForStorage(node){
    if(!isSmartImageNode(node)) return;
    delete node.scale;
    const keepPendingSize = Number(node.pending) > 0 || Boolean(node.queued || node.jimengPending || (Array.isArray(node.pendingTasks) && node.pendingTasks.length));
    if(!keepPendingSize){
        delete node.w;
        delete node.h;
    }
}
function canvasForStorage(){
    const clean = JSON.parse(JSON.stringify(canvas || {}));
    clean.settings = settingsForStorage(canvasDefaultSmartSettings || initialSmartSettings);
    (clean.nodes || []).forEach(node => {
        if(Array.isArray(node.images)) node.images = node.images.map(mediaItemForStorage);
        if(Array.isArray(node.candidateImages)) node.candidateImages = node.candidateImages.map(mediaItemForStorage);
        if(node.runSettings) node.runSettings = settingsForStorage(node.runSettings);
        stripNodeScaleFieldsForStorage(node);
        delete node.pendingCandidatePool;
        delete node._rerunPreviousImages;
    });
    return clean;
}
// M15 拆分：工作流导入导出全部逻辑（apiErrorMessage 到
// importSmartWorkflowFile，约200行）已迁移到
// frontend/src/smart-canvas/workflow-transfer.js（经典 <script>，非 ES
// module，原因同 M1-M14）。
const RECENT_SMART_SETTINGS_KEY = 'smart_canvas_recent_run_settings_v1';
const initialSmartSettings = cloneSmartSettings(settings);
let canvasDefaultSmartSettings = cloneSmartSettings(settings);
let recentSmartSettingsByMode = {};
function smartSettingsModeKey(source=settings){
    const engine = ['api','volcengine','modelscope','comfy','runninghub'].includes(source?.engine) ? source.engine : 'api';
    if(engine === 'api') return `api:${source?.apiKind === 'video' ? 'video' : 'image'}`;
    if(engine === 'volcengine') return `volcengine:${source?.apiKind === 'video' ? 'video' : 'image'}`;
    if(engine === 'comfy') return `comfy:${['text','enhance','edit','custom'].includes(source?.comfyMode) ? source.comfyMode : 'text'}`;
    if(engine === 'runninghub') return 'runninghub';
    return 'modelscope';
}
function loadRecentSmartSettings(){
    try {
        const data = JSON.parse(localStorage.getItem(RECENT_SMART_SETTINGS_KEY) || '{}');
        recentSmartSettingsByMode = data && typeof data === 'object' ? data : {};
    } catch(e) {
        recentSmartSettingsByMode = {};
    }
}
function saveRecentSmartSettings(){
    localStorage.setItem(RECENT_SMART_SETTINGS_KEY, JSON.stringify(recentSmartSettingsByMode));
}
function recentSmartSettingsForMode(modeKey=''){
    const key = modeKey || recentSmartSettingsByMode.__lastKey || smartSettingsModeKey(settings);
    const saved = recentSmartSettingsByMode[key];
    return saved && typeof saved === 'object' ? cloneSmartSettings(saved) : {};
}
function rememberRecentSmartSettings(source=settings, node=null){
    const clean = stripOutpaintDisplaySettings(settingsForStorage(source), node);
    sanitizeSmartApiSelection(clean);
    if(clean.outpaintResolutionLocked === true && clean.resolution === 'custom'){
        clean.resolution = '1k';
        clean.ratio = clean.ratio || 'square';
        clean.customWidth = '';
        clean.customHeight = '';
        clean.customSize = '';
    }
    delete clean.outpaintResolutionLocked;
    const key = smartSettingsModeKey(clean);
    recentSmartSettingsByMode[key] = settingsForStorage(clean);
    recentSmartSettingsByMode.__lastKey = key;
    saveRecentSmartSettings();
}
function applyRecentSmartSettingsForCurrentMode(){
    const requestedEngine = ['api','volcengine','modelscope','comfy','runninghub'].includes(settings.engine) ? settings.engine : 'api';
    const requestedApiKind = settings.apiKind === 'video' ? 'video' : 'image';
    const key = smartSettingsModeKey(settings);
    const saved = recentSmartSettingsForMode(key);
    if(!Object.keys(saved).length){
        settings.engine = requestedEngine;
        if(isApiLikeEngine(requestedEngine)) settings.apiKind = requestedApiKind;
        clearVolcengineSelectionOutsideVolcengine(settings);
        sanitizeSmartApiSelection(settings);
        return;
    }
    settings = {...settings, ...saved, engine:requestedEngine};
    if(isApiLikeEngine(requestedEngine)) settings.apiKind = requestedApiKind;
    clearVolcengineSelectionOutsideVolcengine(settings);
    sanitizeSmartApiSelection(settings);
}
function clearVolcengineSelectionOutsideVolcengine(target=settings){
    if(!target || typeof target !== 'object' || target.engine === 'volcengine') return target;
    if(target.provider_id === 'volcengine') target.provider_id = '';
    if(target.videoProvider === 'volcengine') target.videoProvider = '';
    return target;
}
function isSmartImageNode(node){
    return Boolean(node && (node.type === 'smart-image' || node.type === 'smart-asset-image' || !node.type));
}
function genKindLabel(node){
    if(node?.genKind === 'video') return '视频生成';
    if(node?.genKind === 'workflow') return '工作流生成';
    return '图片生成';
}
function genKindIcon(node){
    if(node?.genKind === 'video') return 'play-square';
    if(node?.genKind === 'workflow') return 'workflow';
    return 'image';
}
/* 各类生成节点允许的引擎：
   图片生成 / 视频生成 → AI生成(api) 与 工作流(runninghub)；工作流生成 → 工作流(runninghub)。
   已移除火山引擎(volcengine)、MS生成(modelscope)选项。
   返回 null 表示不限制（非定型节点，保留全部引擎）。 */
function allowedEnginesForNode(node){
    if(node?.genKind === 'image') return ['api','runninghub'];
    if(node?.genKind === 'video') return ['api','runninghub'];
    if(node?.genKind === 'workflow') return ['runninghub'];
    return null;
}
/* 根据生成节点类型返回默认引擎 */
function defaultEngineForGenKind(kind){
    if(kind === 'workflow') return 'runninghub';
    return 'api';
}
/* 统一创建"图片生成/视频生成/工作流生成"三类生成节点，供左键创建菜单与拉线菜单共用 */
function createGenerationNodeByKind(kind, point, options={}){
    const node = createImageNodeAt(point, [], options);
    if(kind === 'video'){
        node.genKind = 'video';
        // 视频生成节点创建后默认使用「AI生成」(api)，不继承最近使用的工作流等设置
        node.runSettings = {engine:'api', apiKind:'video'};
    } else if(kind === 'workflow'){
        node.genKind = 'workflow';
        node.runSettings = {engine:'runninghub'};
    } else {
        node.genKind = 'image';
        // 图片生成节点创建后默认使用「AI生成」(api)，不继承最近使用的工作流等设置
        node.runSettings = {engine:'api', apiKind:'image'};
    }
    // createImageNodeAt 内部会在 genKind/runSettings 赋值之前先渲染一次，
    // 此时节点卡片（图标/标题/hint）和 composer（toggle/engine下拉）都还读不到最新的 genKind，
    // 需要在赋值后强制刷新一次，保证创建瞬间显示的状态就是正确的。
    render();
    if(options.select !== false && selectedId === node.id){
        lastComposerNodeId = '';
        updateComposer();
    }
    return node;
}
function isSmartAssetImageNode(node){
    return Boolean(node && (node.type === 'smart-asset-image' || node.assetOnly === true));
}
function isUploadedImageOnlyNode(node){
    if(!isSmartImageNode(node) || isHistoryGroupNode(node)) return false;
    if(isSmartAssetImageNode(node)) return true;
    const images = (node.images || []).filter(img => img?.url);
    if(!images.length || node.pending || node.running || node.queued || node.jimengPending) return false;
    if(node.runPrompt || node.runModelPrompt || node.sourceNodeId || node.runAt || node.runFinishedAt || node.runElapsedMs) return false;
    if((node.inputNodeIds || []).length) return false;
    if((node.runPromptRefs || []).length || (node.runInputRefs || []).length) return false;
    if(images.some(img => img?.generatedResult || img?.runPrompt || img?.runModelPrompt || img?.runSettings || img?.sourceNodeId || img?.runAt)) return false;
    return !(canvas?.connections || []).some(conn => conn.to === node.id && ['input', 'flow'].includes(conn.kind || 'flow'));
}
// M12 拆分：候选图池全部逻辑（normalizeGeneratedCandidateImage 到
// expandedCandidateGridHtml，约260行）已迁移到
// frontend/src/smart-canvas/candidate-pool.js（经典 <script>，非 ES
// module，原因同 M1-M11）。
function isSmartGroupNode(node){
    return Boolean(node && node.type === 'smart-group');
}
function isHistoryGroupNode(node){
    return Boolean(isSmartImageNode(node) && (node.isHistoryGroup || node.historyFor));
}
function normalizeSmartImageMode(mode){
    return 'self';
}
function smartImageMode(node){
    return 'self';
}
function setSmartImageMode(node, mode){
    if(!isSmartImageNode(node)) return;
    delete node.imageMode;
}
function smartImageUsesWorkflowInput(node, ctx=smartLoopContext){
    return Boolean(isSmartImageNode(node) && ctx?.forceWorkflow);
}
// M3 拆分：normalizeLegacySmartNode 已迁移到
// frontend/src/smart-canvas/node-model.js（经典 <script>，同上）。
function validOutpaintSize(node){
    const w = Math.round(Number(node?.outpaintSize?.width || 0));
    const h = Math.round(Number(node?.outpaintSize?.height || 0));
    return w > 0 && h > 0 ? {width:w, height:h} : null;
}
function parseSizePair(value){
    const match = String(value || '').match(/(\d+)\s*x\s*(\d+)/i);
    return match ? {width:Number(match[1]), height:Number(match[2])} : null;
}
function nearestFourKSizeFor(width, height){
    const w = Math.max(1, Number(width) || 1);
    const h = Math.max(1, Number(height) || 1);
    const ratio = w / h;
    let best = null;
    Object.entries(SIZE_MAP).forEach(([key, values]) => {
        const size = parseSizePair(values?.['4k']);
        if(!size) return;
        const score = Math.abs(Math.log(ratio / (size.width / size.height)));
        if(!best || score < best.score) best = {...size, key, score};
    });
    return best;
}
function exceedsFourKStandard(width, height){
    const standard = nearestFourKSizeFor(width, height);
    if(!standard) return false;
    return Number(width) > standard.width || Number(height) > standard.height;
}
function withOutpaintDisplaySettings(node, baseSettings){
    const size = validOutpaintSize(node);
    if(!size) return baseSettings;
    const engine = ['api','volcengine','modelscope','comfy','runninghub'].includes(baseSettings?.engine) ? baseSettings.engine : 'api';
    const next = {
        ...baseSettings,
        resolution:'custom',
        ratio:'',
        customWidth:size.width,
        customHeight:size.height,
        customSize:`${size.width}x${size.height}`,
        outpaintResolutionLocked:true
    };
    if(isApiLikeEngine(engine)) next.apiKind = 'image';
    if(engine === 'modelscope'){
        next.msResolution = 'custom';
        next.msRatio = '';
        next.msCustomWidth = size.width;
        next.msCustomHeight = size.height;
        next.msCustomSize = `${size.width}x${size.height}`;
    }
    if(engine === 'comfy'){
        next.width = size.width;
        next.height = size.height;
    }
    return next;
}
function stripOutpaintDisplaySettings(settingsObj, node=null){
    const clean = cloneSmartSettings(settingsObj);
    const size = validOutpaintSize(node);
    const matchesOutpaintSize = size && clean.resolution === 'custom' && String(clean.customSize || '') === `${size.width}x${size.height}`;
    if(matchesOutpaintSize){
        clean.resolution = '1k';
        clean.ratio = clean.ratio || 'square';
        clean.customWidth = '';
        clean.customHeight = '';
        clean.customSize = '';
    }
    const matchesMsOutpaintSize = size && clean.msResolution === 'custom' && String(clean.msCustomSize || '') === `${size.width}x${size.height}`;
    if(matchesMsOutpaintSize){
        clean.msResolution = '1k';
        clean.msRatio = clean.msRatio || 'square';
        clean.msCustomWidth = '';
        clean.msCustomHeight = '';
        clean.msCustomSize = '';
    }
    if(size && Number(clean.width) === size.width && Number(clean.height) === size.height){
        clean.width = 1024;
        clean.height = 1024;
    }
    delete clean.outpaintResolutionLocked;
    return clean;
}
function smartSettingsForNode(node){
    const nodeSettings = stripOutpaintDisplaySettings(node?.runSettings || {}, node);
    const recentSettings = Object.keys(nodeSettings).length ? {} : recentSmartSettingsForMode();
    const base = {
        ...cloneSmartSettings(canvasDefaultSmartSettings || initialSmartSettings),
        ...recentSettings,
        ...nodeSettings
    };
    return withOutpaintDisplaySettings(node, base);
}
function activeSettingsSubject(){
    const active = activeComposerSubject?.id
        ? (nodes.find(n => n.id === activeComposerSubject.id) || activeComposerSubject)
        : selectedNode();
    return isSmartImageNode(active) ? active : null;
}
function activeComposerNode(){
    if(!lastComposerNodeId) return null;
    const id = String(lastComposerNodeId).split(':')[0] || '';
    const node = nodes.find(n => n.id === id);
    return isSmartImageNode(node) ? node : null;
}
function persistActiveSmartSettings(){
    if(!composer?.classList?.contains('open')) return;
    const subject = activeComposerNode();
    if(!subject) return;
    subject.runSettings = settingsForStorage(settings);
    rememberRecentSmartSettings(settings, subject);
}
function backToCanvasList(){ savePromptDraftForCurrent(); window.location.href = '/static/canvas.html?v=2026.05.22.1'; }
function promptPlainText(){
    return promptInput.innerText.replace(/\u00a0/g, ' ').trim();
}
function setPromptInputLocked(locked){
    promptInput.dataset.promptLocked = locked ? '1' : '0';
    promptInput.setAttribute('contenteditable', locked ? 'false' : 'true');
    promptInput.classList.toggle('prompt-input-locked', Boolean(locked));
    if(locked) closeMentionPicker();
}
function setPromptText(text){
    promptInput.textContent = text || '';
}
function clearPromptInput(options={}){
    if(options.preserveDraft){
        promptInput.dataset.preserveDraftOnce = '1';
        closeMentionPicker();
        return;
    }
    promptInput.textContent = '';
    closeMentionPicker();
    if(activeComposerSubject){
        activeComposerSubject.promptDraftHtml = '';
        activeComposerSubject.promptDraftText = '';
    }
}
function applyTheme(theme){
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('theme-dark', dark);
    document.documentElement.classList.toggle('studio-theme-dark', dark);
    document.body?.classList.toggle('theme-dark', dark);
    document.body?.classList.toggle('studio-theme-dark', dark);
}
const uploadProgressEl = document.getElementById('uploadProgress');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadProgressLabel = document.getElementById('uploadProgressLabel');
const uploadProgressPercent = document.getElementById('uploadProgressPercent');
let uploadProgressHideTimer = null;
let uploadProgressActiveCount = 0;
function showUploadProgress(fileCount=1){
    if(!uploadProgressEl) return;
    uploadProgressActiveCount += 1;
    clearTimeout(uploadProgressHideTimer);
    uploadProgressBar?.classList.remove('indeterminate');
    if(uploadProgressBar) uploadProgressBar.style.width = '0%';
    if(uploadProgressPercent) uploadProgressPercent.textContent = '0%';
    if(uploadProgressLabel) uploadProgressLabel.textContent = uploadProgressLabelText(fileCount);
    uploadProgressEl.classList.add('show');
}
function uploadProgressLabelText(fileCount){
    if(fileCount > 1){
        const template = tr('smart.uploadProgressMulti') || `正在上传 ${fileCount} 个素材…`;
        return template.replace('{total}', fileCount);
    }
    return tr('smart.uploadProgressSingle') || '正在上传素材…';
}
function updateUploadProgress(loaded, total, fileCount=1){
    if(!uploadProgressEl) return;
    if(!Number.isFinite(total) || total <= 0){
        uploadProgressBar?.classList.add('indeterminate');
        return;
    }
    uploadProgressBar?.classList.remove('indeterminate');
    const pct = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
    if(uploadProgressBar) uploadProgressBar.style.width = `${pct}%`;
    if(uploadProgressPercent) uploadProgressPercent.textContent = `${pct}%`;
}
function hideUploadProgress(){
    if(!uploadProgressEl) return;
    uploadProgressActiveCount = Math.max(0, uploadProgressActiveCount - 1);
    if(uploadProgressActiveCount > 0) return;
    if(uploadProgressBar) uploadProgressBar.style.width = '100%';
    if(uploadProgressPercent) uploadProgressPercent.textContent = '100%';
    clearTimeout(uploadProgressHideTimer);
    uploadProgressHideTimer = setTimeout(() => {
        uploadProgressEl.classList.remove('show');
        uploadProgressBar?.classList.remove('indeterminate');
    }, 260);
}
function toast(text, options={}){
    const el = document.getElementById('toast');
    const value = String(text || '');
    const type = typeof options === 'string' ? options : (options.type || '');
    const persistent = Boolean(options.persistent)
        || ['warning', 'warn', 'error'].includes(type)
        || /失败|错误|异常|缺少|请输入|请选择|请先|没有|无法|不能|不支持|超时|未|fail|failed|error|need|required|invalid/i.test(value);
    clearTimeout(toast._timer);
    el.innerHTML = `<span class="toast-text">${escapeHtml(text)}</span><button class="toast-close" onclick="this.parentElement.classList.remove('show')">&times;</button>`;
    el.classList.toggle('toast-persistent', persistent);
    el.classList.add('show');
    if(!persistent){
        toast._timer = setTimeout(() => {
            el.classList.remove('show');
        }, Number(options.duration || 4000));
    }
}
function selectedNode(){ return nodes.find(n => n.id === selectedId) || null; }
function clearSelection(){
    savePromptDraftForCurrent();
    selectedId = '';
    selectedIds = [];
    selectedImage = {nodeId:'', index:-1};
    candidatePanelNodeId = '';
    candidatePanelIndex = 0;
    suppressComposerForCandidateNodeId = '';
}
function clearImageClickTimer(){
    if(imageClickTimer){
        clearTimeout(imageClickTimer);
        imageClickTimer = null;
    }
}
function syncSelectionUi(){
    world.querySelectorAll('.image-node').forEach(el => {
        const id = el.dataset.id || '';
        el.classList.toggle('selected', isNodeSelected(id));
        el.querySelectorAll('.thumb-item,.image-wrap').forEach(item => {
            const index = Number(item.dataset.imageIndex || 0);
            item.classList.toggle('image-selected', selectedImage.nodeId === id && selectedImage.index === index);
        });
    });
}
function isNodeSelected(id){
    return selectedId === id || selectedIds.includes(id);
}
function selectedNodeIds(){
    return selectedIds.length ? selectedIds.slice() : (selectedId ? [selectedId] : []);
}
function isEditableTarget(target){
    const el = target || document.activeElement;
    return !!el?.closest?.('input, textarea, select, option, [contenteditable="true"], .prompt-node-control, .prompt-input');
}
// M3 拆分：safeScale / nodeScale / mediaNodeDefaultScale 已迁移到
// frontend/src/smart-canvas/node-layout.js（经典 <script>，同上）。
// M3 拆分：createImageNodeAt 已迁移到 frontend/src/smart-canvas/node-model.js；
// smartGroupLayoutSize 已迁移到 frontend/src/smart-canvas/node-layout.js
// （均为经典 <script>，非 ES module，原因同 M1/M2）。
const MEDIA_NODE_DEFAULT_SCALE = 2;
const MEDIA_GROUP_PREVIOUS_DEFAULT_SCALE = 1.6;
const MEDIA_GROUP_DEFAULT_SCALE = 0.8;
const MEDIA_GROUP_THUMB_BASE = 224;
const EMPTY_GENERATION_NODE_WIDTH = 316;
const EMPTY_GENERATION_NODE_HEIGHT = 194;
const SMART_GROUP_DEFAULT_WIDTH = 340;
const SMART_GROUP_DEFAULT_HEIGHT = 286;
const SMART_GROUP_LEGACY_HEIGHT = 220;
const SMART_GROUP_MIN_WIDTH = 150;
const SMART_GROUP_MIN_HEIGHT = 130;
function smartGroupMembers(node){
    if(!isSmartGroupNode(node)) return [];
    const ids = Array.isArray(node.items) ? node.items : [];
    const seen = new Set([node.id]);
    return ids.map(id => nodes.find(n => n.id === id)).filter(member => {
        if(!member || seen.has(member.id) || isSmartGroupNode(member)) return false;
        seen.add(member.id);
        return true;
    });
}
function smartGroupCompactMembers(node){
    return smartGroupMembers(node).filter(member => member?.type === 'smart-prompt' || member?.type === 'smart-loop');
}
function smartGroupContainingNode(nodeId){
    if(!nodeId) return null;
    return nodes.find(n => isSmartGroupNode(n) && Array.isArray(n.items) && n.items.includes(nodeId)) || null;
}
function isSmartGroupCompactMember(node){
    return Boolean(node && (node.type === 'smart-prompt' || node.type === 'smart-loop') && smartGroupContainingNode(node.id));
}
function rerouteSmartConnections(fromId, toId){
    if(canvas){
        canvas.connections = (canvas.connections || []).map(c => {
            let conn = c;
            if(c.from === fromId) conn = {...conn, from:toId};
            if(c.to === fromId) conn = {...conn, to:toId};
            return conn;
        }).filter((c, i, arr) => c.from !== c.to && arr.findIndex(x => x.from === c.from && x.to === c.to && (x.kind || 'flow') === (c.kind || 'flow')) === i);
    }
    nodes.forEach(n => {
        if(Array.isArray(n.inputNodeIds)) n.inputNodeIds = Array.from(new Set(n.inputNodeIds.map(id => id === fromId ? toId : id).filter(id => id !== n.id)));
    });
}
function absorbImageNodeIntoSmartGroup(group, child){
    const add = (child.images || []).map(img => stripImageGenerationMeta({...img}));
    if(!add.length) return false;
    group.images = [...(group.images || []), ...add];
    delete group.w;
    delete group.h;
    rerouteSmartConnections(child.id, group.id);
    nodes = nodes.filter(n => n.id !== child.id);
    nodes.forEach(g => { if(isSmartGroupNode(g) && Array.isArray(g.items)) g.items = g.items.filter(id => id !== child.id); });
    return true;
}
function addNodeToSmartGroup(group, child){
    if(!isSmartGroupNode(group) || !child || child.id === group.id) return false;
    const items = Array.isArray(group.items) ? group.items.slice() : [];
    if(isSmartGroupNode(child)){
        const mergedImages = (child.images || []).map(img => stripImageGenerationMeta({...img}));
        group.images = [...(group.images || []), ...mergedImages];
        if(mergedImages.length){ delete group.w; delete group.h; }
        const childMemberIds = smartGroupMembers(child).map(m => m.id).filter(id => id !== group.id && !items.includes(id));
        group.items = [...items, ...childMemberIds];
        rerouteSmartConnections(child.id, group.id);
        nodes = nodes.filter(n => n.id !== child.id);
        nodes.forEach(g => { if(isSmartGroupNode(g) && Array.isArray(g.items)) g.items = g.items.filter(id => id !== child.id); });
        return true;
    }
    if(isSmartImageNode(child)) return absorbImageNodeIntoSmartGroup(group, child);
    if(items.includes(child.id)) return false;
    group.items = [...items, child.id];
    return true;
}
function smartGroupImageRefs(group){
    if(!isSmartGroupNode(group)) return [];
    const refs = [];
    (group.images || []).forEach((img, index) => {
        const item = imageForDisplay(img);
        if(item?.url) refs.push({nodeId:group.id, index, source:img, item});
    });
    const members = smartGroupMembers(group)
        .filter(isSmartImageNode)
        .slice()
        .sort((a, b) => {
            const ra = nodeRect(a), rb = nodeRect(b);
            const dy = (Number(ra.y) || 0) - (Number(rb.y) || 0);
            if(Math.abs(dy) > 24) return dy;
            return (Number(ra.x) || 0) - (Number(rb.x) || 0);
        });
    members.forEach(node => {
        (node.images || []).forEach((img, index) => {
            const item = imageForDisplay(img);
            if(item?.url) refs.push({nodeId:node.id, index, source:img, item});
        });
    });
    return refs;
}
// M3 拆分：smartGroupThumbLayout 已迁移到
// frontend/src/smart-canvas/node-layout.js（经典 <script>，同上）。
const SMART_GROUP_ARRANGE_PADDING = 18;
const SMART_GROUP_ARRANGE_GAP = 16;
const SMART_GROUP_ARRANGE_HEADER = 44;
function arrangeSmartGroupMembers(group, options={}){
    if(!isSmartGroupNode(group)) return false;
    const hasThumbImages = smartGroupImageRefs(group).some(ref => ref.item?.url);
    if(hasThumbImages){
        const compactMembers = smartGroupCompactMembers(group);
        if(!options.skipUndo) pushUndo();
        const layout = smartGroupThumbLayout(group);
        if(!layout) return true;
        const refs = layout.refs || [];
        const thumb = Math.max(28, Math.round(Number(layout.thumb) || 96));
        const gap = 8;
        const cols = Math.max(1, Number(layout.cols) || 1);
        const gridW = cols * thumb + Math.max(0, cols - 1) * gap;
        const contentW = Math.max(0, Math.round(Number(layout.width) || SMART_GROUP_DEFAULT_WIDTH) - 32);
        const originX = (Number(group.x) || 0) + 16 + Math.max(0, Math.round((contentW - gridW) / 2));
        const originY = (Number(group.y) || 0) + 16 + 28;
        group.w = Math.max(SMART_GROUP_MIN_WIDTH, Math.round(Number(layout.width) || SMART_GROUP_DEFAULT_WIDTH));
        group.h = Math.max(SMART_GROUP_MIN_HEIGHT, Math.round(Number(layout.height) || SMART_GROUP_DEFAULT_HEIGHT));
        compactMembers.slice().sort((a, b) => {
            const ra = nodeRect(a), rb = nodeRect(b);
            const dy = (Number(ra.y) || 0) - (Number(rb.y) || 0);
            if(Math.abs(dy) > 24) return dy;
            return (Number(ra.x) || 0) - (Number(rb.x) || 0);
        }).forEach((member, memberIndex) => {
            const index = refs.length + memberIndex;
            const col = index % cols;
            const row = Math.floor(index / cols);
            member.x = Math.round(originX + col * (thumb + gap));
            member.y = Math.round(originY + row * (thumb + gap));
            member.w = thumb;
            member.h = thumb;
            member.scale = 1;
        });
        return true;
    }
    const members = smartGroupMembers(group);
    if(!members.length) return false;
    if(!options.skipUndo) pushUndo();
    const ordered = members.slice().sort((a, b) => {
        const ra = nodeRect(a), rb = nodeRect(b);
        const dy = (Number(ra.y) || 0) - (Number(rb.y) || 0);
        if(Math.abs(dy) > 24) return dy;
        return (Number(ra.x) || 0) - (Number(rb.x) || 0);
    });
    ordered.forEach(node => {
        if(isSmartImageNode(node)){
            delete node.w;
            delete node.h;
        }
    });
    const sizes = ordered.map(node => {
        const r = nodeRect(node);
        return {node, w:Math.max(40, Number(r.width) || 120), h:Math.max(40, Number(r.height) || 120)};
    });
    const count = sizes.length;
    const pad = SMART_GROUP_ARRANGE_PADDING;
    const gap = SMART_GROUP_ARRANGE_GAP;
    const headerH = SMART_GROUP_ARRANGE_HEADER;
    const cols = Math.max(1, Math.min(count, Math.round(Math.sqrt(count)) || 1));
    const rows = Math.ceil(count / cols);
    const colW = new Array(cols).fill(0);
    const rowH = new Array(rows).fill(0);
    sizes.forEach((s, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        colW[c] = Math.max(colW[c], s.w);
        rowH[r] = Math.max(rowH[r], s.h);
    });
    const colX = [];
    let accX = 0;
    for(let c = 0; c < cols; c++){ colX[c] = accX; accX += colW[c] + gap; }
    const rowY = [];
    let accY = 0;
    for(let r = 0; r < rows; r++){ rowY[r] = accY; accY += rowH[r] + gap; }
    const originX = (Number(group.x) || 0) + pad;
    const originY = (Number(group.y) || 0) + headerH + pad;
    sizes.forEach((s, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        s.node.x = Math.round(originX + colX[c] + (colW[c] - s.w) / 2);
        s.node.y = Math.round(originY + rowY[r] + (rowH[r] - s.h) / 2);
    });
    const totalW = colW.reduce((a, b) => a + b, 0) + gap * (cols - 1) + pad * 2;
    const totalH = rowH.reduce((a, b) => a + b, 0) + gap * (rows - 1) + pad * 2 + headerH;
    group.w = Math.max(SMART_GROUP_MIN_WIDTH, Math.round(totalW));
    group.h = Math.max(SMART_GROUP_MIN_HEIGHT, Math.round(totalH));
    return true;
}
// M3 拆分：singleImageLayout / groupImageGridLayout 已迁移到
// frontend/src/smart-canvas/node-layout.js（经典 <script>，同上）。
// M3 拆分：smartNodeInputThumbRows / smartNodeInputThumbsHeight /
// smartNodeInputThumbsHtml 已迁移到 frontend/src/smart-canvas/node-layout.js
// （经典 <script>，同上）。
// M3 拆分：promptNodeLayoutSize / imageLayout 已迁移到
// frontend/src/smart-canvas/node-layout.js（经典 <script>，同上）。
// M2 拆分：smartLoopCount / smartLoopWidth / smartLoopHeight / fitSmartLoopNode
// 已迁移到 frontend/src/smart-canvas/loop-node.js（经典 <script>，同上）。
// M3 拆分：nodeRect 已迁移到 frontend/src/smart-canvas/node-layout.js
// （经典 <script>，非 ES module，原因同 M1/M2）。
function applyViewport(){
    world.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    shell.style.backgroundSize = '24px 24px';
    shell.style.backgroundPosition = '0 0';
    const active = selectedNode();
    if(active && composer?.classList?.contains('open')) positionComposerForNode(active);
    if(active && promptComposer?.classList?.contains('open')) positionPromptComposerForNode(active);
    updateNodeShortcutBar();
    updateSelectionActions();
    requestRenderMinimap();
}
function screenToWorld(event){
    const rect = shell.getBoundingClientRect();
    return {
        x:(event.clientX - rect.left - viewport.x) / viewport.scale,
        y:(event.clientY - rect.top - viewport.y) / viewport.scale
    };
}
function viewportCenter(){
    return {
        x:(shell.clientWidth / 2 - viewport.x) / viewport.scale,
        y:(shell.clientHeight / 2 - viewport.y) / viewport.scale
    };
}
function renderMinimap(){
    if(!minimapContent || !minimapViewport) return;
    const width = minimapContent.clientWidth || 170;
    const height = minimapContent.clientHeight || 108;
    const viewW = shell.clientWidth / viewport.scale;
    const viewH = shell.clientHeight / viewport.scale;
    const viewX = -viewport.x / viewport.scale;
    const viewY = -viewport.y / viewport.scale;
    const rects = nodes.map(nodeRect);
    rects.push({x:viewX, y:viewY, width:viewW, height:viewH});
    const minX = Math.min(...rects.map(r => r.x), -200);
    const minY = Math.min(...rects.map(r => r.y), -200);
    const maxX = Math.max(...rects.map(r => r.x + r.width), viewX + viewW + 200);
    const maxY = Math.max(...rects.map(r => r.y + r.height), viewY + viewH + 200);
    const scale = Math.min(width / Math.max(1, maxX - minX), height / Math.max(1, maxY - minY));
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;
    smartMinimapState = {minX, minY, scale, offsetX, offsetY, width, height};
    const project = r => ({
        left:offsetX + (r.x - minX) * scale,
        top:offsetY + (r.y - minY) * scale,
        width:Math.max(4, r.width * scale),
        height:Math.max(4, r.height * scale)
    });
    const nodeHtml = rects.slice(0, -1).map(r => {
        const p = project(r);
        return `<div class="minimap-node" style="left:${p.left}px;top:${p.top}px;width:${p.width}px;height:${p.height}px"></div>`;
    }).join('');
    const view = project({x:viewX, y:viewY, width:viewW, height:viewH});
    minimapContent.innerHTML = `${nodeHtml}<div id="minimapViewport" class="smart-minimap-viewport" style="left:${view.left}px;top:${view.top}px;width:${view.width}px;height:${view.height}px"></div>`;
    minimapViewport = document.getElementById('minimapViewport');
}
function requestRenderMinimap(){
    if(viewportInteractionActive || dragState || panState || smartMinimapDrag){
        pendingMinimapRefreshAfterInteraction = true;
        return;
    }
    if(minimapRenderQueued) return;
    minimapRenderQueued = true;
    requestAnimationFrame(() => {
        minimapRenderQueued = false;
        renderMinimap();
    });
}
function minimapEventToWorld(event){
    if(!smartMinimapState) renderMinimap();
    const state = smartMinimapState;
    if(!state) return viewportCenter();
    const rect = minimapContent.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    return {
        x:state.minX + (mx - state.offsetX) / Math.max(0.0001, state.scale),
        y:state.minY + (my - state.offsetY) / Math.max(0.0001, state.scale)
    };
}
function centerViewportOnWorldPoint(point){
    viewport.x = shell.clientWidth / 2 - point.x * viewport.scale;
    viewport.y = shell.clientHeight / 2 - point.y * viewport.scale;
    applyViewport();
    scheduleSave();
}
function flushDeferredViewportRendering(){
    viewportInteractionActive = false;
    if(pendingMinimapRefreshAfterInteraction){
        pendingMinimapRefreshAfterInteraction = false;
        renderMinimap();
    }
}
function fitAllNodesViewport(){
    if(!nodes.length){
        viewport.scale = 0.45;
        viewport.x = shell.clientWidth / 2;
        viewport.y = shell.clientHeight / 2;
        applyViewport();
        scheduleSave();
        return;
    }
    const rects = nodes.map(nodeRect);
    const minX = Math.min(...rects.map(r => r.x));
    const minY = Math.min(...rects.map(r => r.y));
    const maxX = Math.max(...rects.map(r => r.x + r.width));
    const maxY = Math.max(...rects.map(r => r.y + r.height));
    const pad = 160;
    const width = Math.max(1, maxX - minX + pad * 2);
    const height = Math.max(1, maxY - minY + pad * 2);
    const nextScale = Math.max(0.06, Math.min(0.82, (shell.clientWidth - 80) / width, (shell.clientHeight - 80) / height));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    viewport.scale = nextScale;
    viewport.x = shell.clientWidth / 2 - cx * viewport.scale;
    viewport.y = shell.clientHeight / 2 - cy * viewport.scale;
    applyViewport();
    scheduleSave();
}
function enterZoomPreview(){
    if(zoomPreviewState) return;
    zoomPreviewState = {...viewport};
    shell.classList.add('zoom-preview');
    closeCreateMenu();
    fitAllNodesViewport();
}
function exitZoomPreview(point=null){
    if(!zoomPreviewState) return false;
    const prev = zoomPreviewState;
    zoomPreviewState = null;
    shell.classList.remove('zoom-preview');
    viewport.scale = prev.scale;
    if(point){
        viewport.x = shell.clientWidth / 2 - point.x * viewport.scale;
        viewport.y = shell.clientHeight / 2 - point.y * viewport.scale;
    } else {
        viewport.x = prev.x;
        viewport.y = prev.y;
    }
    applyViewport();
    scheduleSave();
    return true;
}
function exitZoomPreviewToNode(nodeId){
    if(!zoomPreviewState) return false;
    const node = nodes.find(n => n.id === nodeId);
    if(!node) return exitZoomPreview();
    const prev = zoomPreviewState;
    const rect = nodeRect(node);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const fitScale = Math.min(
        1.15,
        (shell.clientWidth - 160) / Math.max(1, rect.width),
        (shell.clientHeight - 160) / Math.max(1, rect.height)
    );
    const readableScale = Math.min(1.15, Math.max(0.72, fitScale));
    zoomPreviewState = null;
    shell.classList.remove('zoom-preview');
    viewport.scale = Math.max(safeScale(prev.scale), readableScale);
    viewport.x = shell.clientWidth / 2 - cx * viewport.scale;
    viewport.y = shell.clientHeight / 2 - cy * viewport.scale;
    applyViewport();
    scheduleSave();
    return true;
}
function toggleZoomPreview(){
    if(zoomPreviewState) exitZoomPreview();
    else enterZoomPreview();
}
// M10 拆分：生成参数设置面板全部逻辑（syncEngineOptionsVisibility 到
// refreshSmartConfigFromSettings，约1600行）已迁移到
// frontend/src/smart-canvas/generation-settings.js（经典 <script>，
// 非 ES module，原因同 M1-M9）。
// M17 拆分：loadPromptPresets / savePromptPresets / defaultPromptTemplateGroups /
// loadPromptTemplateGroups / savePromptTemplateGroups / loadPromptTemplateOverrides /
// savePromptTemplateOverrides / loadPromptTemplates / activePromptLibrary /
// renderPromptLibrarySelect / promptTemplateItems / promptTemplateText /
// promptTemplateName / promptTemplateScene / promptTemplateSearchText /
// activePromptTemplateGroups / promptTemplateCategoryLabel /
// promptTemplateSelectedItem / currentPromptPreset / defaultPromptPresetName /
// promptPresetPanelNode / setPromptPresetStatus / resetPromptPresetDeleteState /
// createPromptPresetFromNode / createPromptPresetFromComposer / savePromptNodeAsPreset /
// renderPromptPresetPanel / openPromptPresetPanel / closePromptPresetPanel /
// promptTemplateScrollSnapshot / restorePromptTemplateScroll / renderPromptTemplatePanel /
// activePromptTemplateNodeId / syncComposerTemplateButton / openPromptTemplatePanel /
// closePromptTemplatePanel / applyPromptTemplateToNode / saveCurrentPromptAsTemplate /
// createBlankPromptTemplate / savePromptTemplateEdit / deletePromptTemplate /
// createPromptTemplateGroup / renamePromptTemplateGroup / deletePromptTemplateGroup /
// editPromptPresetForNode 已迁移到
// frontend/src/smart-canvas/prompt-templates.js（经典 <script>，非 ES module，
// 原因同 M1-M16）。状态变量（promptPresets/promptLibraries/promptTemplateCategory
// 等）及 selectedId/selectedIds/selectedImage 刻意留在这里，原因同 M16。
// M9 拆分：assetCategories / assetLibraries / activeAssetLibrary / activeAssetCategory /
// assetCategoriesForLibrary 已迁移到
// frontend/src/smart-canvas/asset-library.js（经典 <script>，非 ES module，
// 原因同 M1-M8）。
// M14 拆分：节点悬浮快捷栏 + 右键菜单全部逻辑（nodeShortcutTargetFor
// 到 triggerNodeShortcutAction，约320行）已迁移到
// frontend/src/smart-canvas/node-context-ui.js（经典 <script>，非 ES
// module，原因同 M1-M13）。
// M9 拆分：loadAssetLibrary 已迁移到
// frontend/src/smart-canvas/asset-library.js（经典 <script>，非 ES module，
// 原因同 M1-M8）。
function refreshAssetLibrarySoon(delay=120){
    clearTimeout(assetLibraryRefreshTimer);
    assetLibraryRefreshTimer = setTimeout(async () => {
        await loadAssetLibrary();
        if(mentionPicker?.classList?.contains('open') && mentionSource === 'asset') renderMentionPicker('asset');
    }, delay);
}
function handleAssetLibraryUpdatedMessage(data={}){
    const remoteUpdatedAt = Number(data.updated_at || 0);
    if(remoteUpdatedAt && remoteUpdatedAt <= Number(assetLibraryUpdatedAt || 0)) return;
    refreshAssetLibrarySoon();
}
// 多人协作同步：一个稳定的客户端 id，既用于 WS 连接，也随 saveCanvas 上报，
// 服务器广播 canvas_updated 时带回 client_id，自己发的就忽略，避免自我刷新。
const smartClientId = `canvas_smart_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
let canvasSyncInFlight = false;
let canvasSaveDirty = false;
let canvasSaveAgain = false;
let canvasSyncTimer = null;
let canvasMetaPollTimer = null;
// M16 拆分：mergeSmartImageLists / smartNodeInFlight / mergeSmartNode /
// mergeSmartNodeLists / mergeSmartConnections / applyMergedServerCanvas /
// mergeReloadCanvasNow / scheduleCanvasMergeReload / handleCanvasUpdatedMessage /
// startCanvasMetaPoll 已迁移到 frontend/src/smart-canvas/canvas-sync.js
// （经典 <script>，非 ES module，原因同 M1-M15）。
// smartClientId 常量及 canvasSyncInFlight/canvasSaveDirty/canvasSaveAgain/
// canvasSyncTimer/canvasMetaPollTimer 这几个可变状态变量刻意留在这里
// （被 scheduleSave/saveCanvas 共享读写，原因同 state.js 的顾虑），
// canvas-sync.js 通过共享脚本作用域访问。
function connectAssetLibrarySyncSocket(){
    if(window.parent && window.parent !== window) return;
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
        socket.onmessage = event => {
            try {
                const data = JSON.parse(event.data);
                if(data?.type === 'asset_library_updated') handleAssetLibraryUpdatedMessage(data);
                if(data?.type === 'canvas_updated') handleCanvasUpdatedMessage(data);
            } catch(e) {}
        };
        socket.onclose = () => {
            retryTimer = setTimeout(connect, 3000);
        };
        socket.onerror = () => {
            try { socket.close(); } catch(e) {}
        };
    };
    window.addEventListener('beforeunload', () => {
        clearTimeout(retryTimer);
        try { socket?.close(); } catch(e) {}
    });
    connect();
}
// M9 拆分：setAssetLibraryFromResponse / toggleAssetLibrary / assetCategoryForMention /
// assetMediaKind / assetThumbHtml / renderAssetLibrary / openAssetNameDialog /
// positionAssetHoverPreview / showAssetHoverPreview / hideAssetHoverPreview /
// beginAssetInlineRename / bindAssetItemEvents / addFileToAssetLibrary /
// canvasImageDragPayload 已迁移到
// frontend/src/smart-canvas/asset-library.js（经典 <script>，非 ES module，
// 原因同 M1-M8）。
async function loadCanvas(){
    if(!canvasId) return;
    try {
        clearTimeout(suppressAutoSaveReleaseTimer);
        suppressAutoSave = true;
        deferredAutoSaveNeeded = false;
        const res = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}`);
        if(!res.ok) throw new Error(await smartResponseErrorMessage(res, tr('smart.toastCanvasFail')));
        const data = await res.json();
        canvas = data.canvas;
        document.title = canvas.title || tr('canvas.smartCanvas');
        document.getElementById('smartTitle').textContent = canvas.title || tr('canvas.smartCanvas');
        nodes = (Array.isArray(canvas.nodes) ? canvas.nodes : []).map(normalizeLegacySmartNode).filter(Boolean);
        nodes.forEach(n => {
            const pendingTasks = smartPendingTasks(n);
            if(pendingTasks.length){
                n.pending = Math.max(pendingTasks.length, Number(n.pending || 0) || pendingTasks.length);
                n.pendingCandidatePool = pendingTasks.some(task => (task.kind || 'image') === 'image');
                n.running = false;
            } else if(n.pending){
                n.pending = 0;
                delete n.pendingCandidatePool;
            }
        });
        canvas.connections = Array.isArray(canvas.connections) ? canvas.connections : [];
        viewport = {...viewport, ...(canvas.viewport || {})};
        viewport.scale = safeScale(viewport.scale);
        if(canvas.settings) settings = {...settings, ...canvas.settings};
        canvasDefaultSmartSettings = cloneSmartSettings(settings);
        loadRecentSmartSettings();
        if(settings.comfy_workflow && !settings.comfyWorkflow) settings.comfyWorkflow = settings.comfy_workflow;
        if(settings.comfy_params && !settings.comfyParams) settings.comfyParams = settings.comfy_params;
        updateProviderModels();
        applyViewport();
        render();
        resumeSmartPendingTasks();
        resumeJimengPendingNodes();
        startCanvasMetaPoll();
        suppressAutoSaveReleaseTimer = setTimeout(() => {
            suppressAutoSave = false;
            suppressAutoSaveReleaseTimer = null;
            if(deferredAutoSaveNeeded){
                deferredAutoSaveNeeded = false;
                scheduleSave();
            }
        }, 2000);
    } catch(e) {
        clearTimeout(suppressAutoSaveReleaseTimer);
        suppressAutoSaveReleaseTimer = null;
        suppressAutoSave = false;
        deferredAutoSaveNeeded = false;
        toast(e.message || tr('smart.toastCanvasFail'));
    }
}
function scheduleSave(delay=450){
    if(!canvasId || !canvas) return;
    if(suppressAutoSave){
        deferredAutoSaveNeeded = true;
        return;
    }
    canvasSaveDirty = true;
    clearTimeout(saveTimer);
    if(canvasSyncInFlight){
        canvasSaveAgain = true;
        return;
    }
    const waitMs = Math.max(0, Number(delay) || 0) || 450;
    saveTimer = setTimeout(saveCanvas, waitMs);
}
async function saveCanvas(){
    if(!canvasId || !canvas) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    if(canvasSyncInFlight){
        canvasSaveAgain = true;
        canvasSaveDirty = true;
        return;
    }
    savePromptDraftForCurrent();
    nodes.forEach(node => {
        node.images = (node.images || []).map(mediaItemForStorage);
        if(Array.isArray(node.candidateImages)) node.candidateImages = node.candidateImages.map(mediaItemForStorage);
        if(node.runSettings) node.runSettings = settingsForStorage(node.runSettings);
    });
    canvas.nodes = nodes;
    canvas.settings = settingsForStorage(canvasDefaultSmartSettings || initialSmartSettings);
    canvas.viewport = {...viewport};
    const storageCanvas = canvasForStorage();
    canvasSyncInFlight = true;
    canvasSaveAgain = false;
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                title:storageCanvas.title || tr('smart.title'),
                icon:storageCanvas.icon || 'sparkles',
                nodes:storageCanvas.nodes || [],
                connections:storageCanvas.connections || [],
                viewport:storageCanvas.viewport || {x:0,y:0,scale:1},
                logs:storageCanvas.logs || [],
                settings:storageCanvas.settings,
                base_updated_at:storageCanvas.updated_at || canvas.updated_at || 0,
                client_id:smartClientId
            })
        });
        if(res.ok){
            const data = await res.json();
            if(data.canvas && data.canvas.updated_at) canvas.updated_at = data.canvas.updated_at;
            canvasSaveDirty = Boolean(canvasSaveAgain);
        } else if(res.status === 409) {
            const data = await res.json().catch(() => ({}));
            const serverCanvas = data.detail?.canvas;
            const remoteUpdatedAt = Number(data.detail?.updated_at || serverCanvas?.updated_at || 0);
            if(canvasSaveDirty || canvasSaveAgain){
                if(remoteUpdatedAt) canvas.updated_at = remoteUpdatedAt;
                canvasSaveAgain = true;
                return;
            }
            if(serverCanvas){
                applyMergedServerCanvas(serverCanvas);
                nodes.forEach(node => {
                    node.images = (node.images || []).map(mediaItemForStorage);
                    if(Array.isArray(node.candidateImages)) node.candidateImages = node.candidateImages.map(mediaItemForStorage);
                    if(node.runSettings) node.runSettings = settingsForStorage(node.runSettings);
                });
                canvas.nodes = nodes;
            } else if(remoteUpdatedAt) {
                canvas.updated_at = remoteUpdatedAt;
            }
            canvasSaveDirty = false;
        }
    } catch(e) {} finally {
        canvasSyncInFlight = false;
        if(canvasSaveAgain){
            canvasSaveAgain = false;
            canvasSaveDirty = true;
            setTimeout(saveCanvas, 0);
        }
    }
}
function imageMetaFromNode(node){
    return {};
}
function applyNodeMetaToImage(image, node){
    return stripImageGenerationMeta(image);
}
// M3 拆分：inheritNodeMetaFromImage / createNode 已迁移到
// frontend/src/smart-canvas/node-model.js（经典 <script>，同上）。
// M3 拆分：createPromptNode 已迁移到 frontend/src/smart-canvas/node-model.js。
// M2 拆分：createLoopNode 已迁移到 frontend/src/smart-canvas/loop-node.js。
// M3 拆分：createSmartGroupNode 已迁移到 frontend/src/smart-canvas/node-model.js。
// M3 拆分：cloneSmartNode 已迁移到 frontend/src/smart-canvas/node-model.js
// （经典 <script>，非 ES module，原因同 M1/M2）。
// M13 拆分：节点复制/粘贴 + 系统剪贴板媒体粘贴全部逻辑
// （copySelectedNodes 到 pasteFromContextMenu，约160行）已迁移到
// frontend/src/smart-canvas/clipboard.js（经典 <script>，非 ES
// module，原因同 M1-M12）。
function duplicateForAltDrag(node){
    const ids = (isNodeSelected(node.id) ? selectedNodeIds() : [node.id]);
    const sourceNodes = ids.map(id => nodes.find(n => n.id === id)).filter(Boolean);
    if(!sourceNodes.length) return node;
    pushUndo();
    const idMap = new Map();
    const copies = sourceNodes.map(n => {
        const copy = cloneSmartNode(n, 0, 0);
        idMap.set(n.id, copy.id);
        return copy;
    });
    copies.forEach(copy => {
        if(Array.isArray(copy.inputNodeIds)) copy.inputNodeIds = copy.inputNodeIds.map(id => idMap.get(id) || id).filter(Boolean);
        if(copy.sourceNodeId) copy.sourceNodeId = idMap.get(copy.sourceNodeId) || copy.sourceNodeId;
    });
    const idSet = new Set(sourceNodes.map(n => n.id));
    // 连线保留策略：只保留「流入被复制节点」的连线（to 端在复制集内），
    // 即保留与上游的连线，不保留复制节点流向下游的连线。外部上游端点保持指向原节点。
    const copiedConnections = (canvas.connections || []).filter(c => idSet.has(c.to));
    const validIds = new Set([...nodes.map(n => n.id), ...copies.map(n => n.id)]);
    const newConnections = copiedConnections.map(conn => ({
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
    selectedId = '';
    selectedIds = [];
    selectedImage = {nodeId:'', index:-1};
    const dragCopy = copies.find(c => c.id === idMap.get(node.id)) || copies[0];
    render();
    scheduleSave();
    return dragCopy;
}
function shellPoint(event){
    const rect = shell.getBoundingClientRect();
    return {x:event.clientX - rect.left, y:event.clientY - rect.top};
}
// M4 拆分：connectionGeometry / renderConnections /
// updateConnectionGeometryInPlace / refreshConnectionLayer /
// requestRefreshConnectionLayer 已迁移到
// frontend/src/smart-canvas/connections.js（经典 <script>，同上）。
function moveNodeElementsDuringDrag(){
    if(!dragState) return;
    const groupItems = dragState.group || [{id:dragState.id}];
    groupItems.map(item => item.id).forEach(id => {
        const n = nodes.find(x => x.id === id);
        const el = world.querySelector(`.image-node[data-id="${CSS.escape(id)}"]`);
        if(n && el){
            el.style.left = `${n.x || 0}px`;
            el.style.top = `${n.y || 0}px`;
        }
    });
    const active = selectedNode();
    if(active && (dragState.group || [{id:dragState.id}]).some(item => item.id === active.id)){
        positionComposerForNode(active);
        if(promptComposer?.classList?.contains('open')) positionPromptComposerForNode(active);
        // 让节点顶部快捷栏跟随拖动。首次拖动若尚未渲染出快捷栏则补渲染，之后仅重定位。
        if(nodeShortcutOverlay?.querySelector('.node-shortcut-bar')) positionNodeShortcutForNode(active);
        else updateNodeShortcutBar();
    }
    requestRefreshConnectionLayer();
    requestRenderMinimap();
}
function updateNodeElementDuringResize(node){
    if(!node) return;
    const el = world.querySelector(`.image-node[data-id="${CSS.escape(node.id)}"]`);
    if(!el){
        render();
        return;
    }
    const imgs = node.images || [];
    const layout = imageLayout(imgs, nodeScale(node), node);
    el.style.width = `${layout.width}px`;
    el.style.height = `${layout.height}px`;
    const body = el.querySelector('.node-body');
    if(body){
        const loadingSingle = body.querySelector('.loading-cell.single');
        if(loadingSingle){
            loadingSingle.style.width = `${layout.width}px`;
            loadingSingle.style.height = `${layout.height}px`;
        }
        const loadingGrid = body.querySelector('.loading-skeleton');
        if(loadingGrid){
            const count = Math.max(1, Number(node.pending) || 1);
            const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
            const rows = Math.ceil(count / cols);
            loadingGrid.style.width = `${layout.width}px`;
            loadingGrid.style.height = `${layout.height}px`;
            loadingGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            loadingGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        }
        const grid = body.querySelector('.thumb-grid');
        if(grid){
            grid.style.setProperty('--thumb-cols', layout.cols);
            grid.style.setProperty('--thumb-size', `${layout.thumb}px`);
        }
        const wrap = body.querySelector('.image-wrap');
        if(wrap){
            wrap.style.setProperty('--node-img-w', `${layout.width}px`);
            wrap.style.setProperty('--node-img-h', `${layout.height}px`);
        }
        const media = body.querySelector('.node-img');
        if(media){
            media.style.width = `${layout.width}px`;
            media.style.height = `${layout.height}px`;
        }
    }
    const active = selectedNode();
    if(active?.id === node.id){
        positionComposerForNode(active);
        if(promptComposer?.classList?.contains('open')) positionPromptComposerForNode(active);
    }
    refreshConnectionLayer();
    renderMinimap();
}
// M11 拆分：媒体展示/下载全部逻辑（isVideoMediaItem 到
// downloadGroupNodeImages，约680行）已迁移到
// frontend/src/smart-canvas/media-display.js（经典 <script>，非 ES
// module，原因同 M1-M10）。
function smartRunPlatformLabel(run){
    const s = run?.settings || {};
    if(s.engine === 'comfy') return 'ComfyUI';
    if(s.engine === 'modelscope') return 'Modelscope';
    if(run?.kind === 'video') return videoProviderById(s.videoProvider || '')?.name || s.videoProvider || 'Video';
    return apiProviderById(s.provider_id || '')?.name || s.provider_id || 'API';
}
function smartRunRequestMeta(run){
    const s = run?.settings || {};
    if(s.engine === 'comfy') return {workflow_json:s.comfyWorkflow || '', mode:s.comfyMode || 'text'};
    if(s.engine === 'modelscope') return {backend:'Modelscope', model:s.msgenModel || '', custom_model:s.msCustomModel || ''};
    if(run?.kind === 'video') return {provider_id:s.videoProvider || '', model:s.videoModel || '', duration:s.videoDuration || '', aspect_ratio:s.videoAspect || '', resolution:s.videoResolution || ''};
    return {provider_id:s.provider_id || '', model:s.model || '', size:run?.size || '', quality:s.quality || '', n:s.count || 1};
}
function smartRunSnapshot(node, prompt, refs=[], kind='image'){
    const settingsSnapshot = cloneSmartSettings(settings);
    return {
        nodeId:node?.id || '',
        nodeType:node?.type || 'smart-image',
        kind,
        settings:settingsSnapshot,
        prompt:prompt || '',
        refs:(refs || []).map(ref => ({file_id:ref.file_id || '', url:ref.url || '', name:ref.name || 'image', kind:ref.kind || ''})).filter(ref => ref.url),
        size: kind === 'image' && isApiLikeEngine(settingsSnapshot.engine) ? sizeForRun(settingsSnapshot) : ''
    };
}
function addSmartGenerationLog({run, outputs=[], runMs=0, error=''}) {
    if(!canvas) return;
    canvas.logs = canvas.logs || [];
    const entry = {
        id:uid('log'),
        createdAt:Date.now(),
        status:error ? 'failed' : 'success',
        platform:smartRunPlatformLabel(run),
        nodeType:run?.nodeType || 'smart-image',
        model:smartRunTaskLabel(run),
        request:smartRunRequestMeta(run),
        prompt:run?.prompt || '',
        outputs:(outputs || []).filter(Boolean),
        refs:run?.refs || [],
        runMs:Number(runMs || 0),
        error:error ? String(error) : ''
    };
    canvas.logs = [entry, ...canvas.logs].slice(0, 500);
    scheduleSave();
}
function smartLogPreviewNode(url, kind='image'){
    if(kind === 'video' || outputUrlLooksVideo(url)){
        window.open(url, '_blank');
        return;
    }
    const node = {id:'__smart_log_preview__', type:'smart-image', images:[{url, name:'log-preview', kind}], title:kind === 'video' ? 'Video' : 'Image'};
    const prevSelectedId = selectedId;
    const prevSelectedImage = {...selectedImage};
    nodes.push(node);
    try { openImageEditor(node.id, 0); }
    finally {
        nodes = nodes.filter(n => n.id !== node.id);
        selectedId = prevSelectedId;
        selectedImage = prevSelectedImage;
    }
}
function renderSmartCanvasLog(){
    const logs = canvas?.logs || [];
    smartLogList.innerHTML = logs.length ? logs.map(log => {
        const thumbs = (log.outputs || []).slice(0, 8).map(url => {
            const safe = escapeAttr(url);
            const kind = outputUrlLooksVideo(url) ? 'video' : 'image';
            return kind === 'video' ? videoPosterHtml({url, kind}) : `<img src="${safe}" data-url="${safe}" data-kind="image" alt="output">`;
        }).join('');
        const date = new Date(log.createdAt || Date.now()).toLocaleString(window.StudioI18n?.lang() === 'en' ? 'en-US' : 'zh-CN');
        const req = log.request || {};
        const taskId = req.task_id || req.taskId || req.prompt_id || req.promptId || '';
        const backend = req.workflow_json || req.workflow || req.provider_id || req.providerId || req.backend || '';
        const subParts = [
            date,
            `${window.StudioI18n?.lang() === 'en' ? 'outputs' : '输出'} ${(log.outputs || []).length}`,
            taskId ? `ID ${taskId}` : '',
            backend
        ].filter(Boolean);
        return `<div class="log-item ${log.status === 'failed' ? 'failed' : ''}">
            <div class="log-main">
                <div class="log-meta">
                    <span class="log-chip ${log.status === 'failed' ? 'status-failed' : 'status-ok'}">${escapeHtml(log.status === 'failed' ? tr('canvas.failed') : tr('canvas.success'))}</span>
                    <span class="log-chip">${escapeHtml(log.platform || '-')}</span>
                    ${log.model ? `<span class="log-chip">${escapeHtml(log.model)}</span>` : ''}
                    <span class="log-chip">${escapeHtml(formatRunDuration(log.runMs || 0))}</span>
                </div>
                <div class="log-subline">${subParts.map(part => `<span title="${escapeAttr(part)}">${escapeHtml(part)}</span>`).join('')}</div>
                ${log.error ? `<div class="log-error" title="${escapeAttr(log.error)}">${escapeHtml(log.error)}</div>` : ''}
                <div class="log-prompt" title="${escapeAttr(log.prompt || tr('canvas.noPromptMeta'))}" data-prompt="${escapeAttr(log.prompt || '')}">${escapeHtml(log.prompt || tr('canvas.noPromptMeta'))}</div>
            </div>
            <div class="log-thumbs">${thumbs}</div>
        </div>`;
    }).join('') : `<div class="log-empty">${escapeHtml(tr('canvas.noLogs'))}</div>`;
    smartLogList.querySelectorAll('[data-url]').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            smartLogPreviewNode(el.dataset.url, el.dataset.kind || 'image');
        };
    });
    smartLogList.querySelectorAll('[data-prompt]').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            const text = el.dataset.prompt || '';
            if(text) navigator.clipboard?.writeText(text).catch(() => {});
            const oldText = el.textContent;
            el.textContent = tr('canvas.copied');
            el.classList.add('copied');
            setTimeout(() => {
                el.textContent = oldText;
                el.classList.remove('copied');
            }, 900);
        };
    });
    refreshIcons();
}
function openSmartCanvasLog(){
    if(!canvas) return;
    renderSmartCanvasLog();
    smartLogModal.classList.add('open');
}
function closeSmartCanvasLog(){
    smartLogModal.classList.remove('open');
}
function openSmartCanvasShortcuts(){
    smartShortcutModal?.classList.add('open');
    refreshIcons();
}
function closeSmartCanvasShortcuts(){
    smartShortcutModal?.classList.remove('open');
}
function smartRuleTemplateItems(libraryId){
    const hidden = new Set(promptTemplateOverrides.hiddenBuiltinIds || []);
    return promptLibraries.filter(library => library.id === libraryId).flatMap(library => (library.items || [])
        .filter(template => template?.id && template?.positive && !(library.id === 'system' && hidden.has(template.id)))
        .map(template => ({
            ...template,
            ...(library.id === 'system' ? (promptTemplateOverrides.editedBuiltins?.[template.id] || {}) : {}),
            key:`${library.id}:${template.id}`,
            libraryName:library.name || tr('smart.promptTemplateLibrary')
        })));
}
function smartRuleTemplateOptions(libraryId, selectedKey){
    const templates = smartRuleTemplateItems(libraryId);
    if(!templates.length) return `<option value="">${escapeHtml(tr('smart.promptTemplateEmpty'))}</option>`;
    return templates.map(template => `<option value="${escapeAttr(template.key)}" ${template.key === selectedKey ? 'selected' : ''}>${escapeHtml(`${template.libraryName} · ${promptTemplateName(template)}`)}</option>`).join('');
}
function smartRuleTemplateContent(libraryId, selectedKey, fallback){
    const templates = smartRuleTemplateItems(libraryId);
    return (templates.find(template => template.key === selectedKey) || templates[0])?.positive || fallback;
}
function promptNodeBodyHtml(node){
    node.llmProvider = resolveChatProviderId(node.llmProvider || '');
    node.llmModel = resolveChatModel(node.llmModel || '', node.llmProvider);
    node.llmTask = ['llm', 'caption', 'expand'].includes(node.llmTask) ? node.llmTask : 'llm';
    const templateActive = activePromptTemplateNodeId() === node.id;
    return `<div class="prompt-node-card">
        <textarea class="prompt-node-text prompt-node-control" readonly placeholder="${escapeHtml(tr('smart.promptPlaceholderNode'))}">${escapeHtml(node.text || '')}</textarea>
        <div class="prompt-node-tools">
            <button class="prompt-node-pill prompt-node-control prompt-preset-edit ${templateActive ? 'active' : ''}" type="button"><i data-lucide="library"></i><span>模板库</span></button>
        </div>
    </div>`;
}
// M2 拆分：loopNumberControlHtml / smartLoopTokenLabel / smartLoopTokenChipHtml /
// smartLoopVariableHtml / smartLoopEditorText / insertSmartLoopToken /
// smartLoopBodyHtml 已迁移到 frontend/src/smart-canvas/loop-node.js（经典 <script>，同上）。
// M7 拆分：smartGroupBodyHtml / jimengPendingBodyHtml / smartRecoverableImageTask /
// imageTaskRecoverBodyHtml / nodeBodyHtml / formatRunDuration / nodeRunElapsedMs /
// runTimePillHtml / hideRunTimerForNode / refreshRunTimerPills / render /
// measureSmartNodeImages 已迁移到 frontend/src/smart-canvas/canvas-render.js
// （经典 <script>，非 ES module，原因同 M1-M6）。
// M4 拆分：bindConnectionEvents / ensurePortDragPathElement /
// clearPortDragVisual 已迁移到
// frontend/src/smart-canvas/connections.js（经典 <script>，同上）。
function bindPromptNodeControls(el, node){
    el.querySelectorAll('.prompt-node-control, .prompt-node-pill').forEach(control => {
        control.addEventListener('mousedown', e => e.stopPropagation());
        control.addEventListener('click', e => e.stopPropagation());
        control.addEventListener('dblclick', e => e.stopPropagation());
    });
    const textEl = el.querySelector('.prompt-node-text');
    if(textEl) {
        bindScrollableText(textEl);
        textEl.oninput = e => { node.text = e.target.value; scheduleSave(); };
        // 单击只选中节点（打开配置框），双击才进入编辑态。
        textEl.addEventListener('click', e => {
            e.stopPropagation();
            if(!textEl.readOnly) return;
            if(selectedId !== node.id){
                selectedId = node.id;
                selectedIds = [];
                selectedImage = {nodeId:'', index:-1};
                suppressComposerForCandidateNodeId = '';
                render();
            }
        });
        textEl.addEventListener('dblclick', e => {
            e.stopPropagation();
            textEl.readOnly = false;
            textEl.focus();
            const len = textEl.value.length;
            try { textEl.setSelectionRange(len, len); } catch(_) {}
        });
        textEl.addEventListener('blur', () => { textEl.readOnly = true; });
    }
    const presetEdit = el.querySelector('.prompt-preset-edit');
    if(presetEdit) presetEdit.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        if(promptTemplatePanel?.classList.contains('open') && promptTemplatePanel.dataset.target === 'node' && promptTemplatePanel.dataset.nodeId === node.id){
            closePromptTemplatePanel();
            return;
        }
        editPromptPresetForNode(node);
    };
}
// M2 拆分：bindLoopNodeControls 已迁移到 frontend/src/smart-canvas/loop-node.js。
function bindScrollableText(el){
    if(!el || el.dataset.scrollBound === '1') return;
    el.dataset.scrollBound = '1';
    const stop = e => e.stopPropagation();
    const beginSelection = e => {
        e.stopPropagation();
        textSelectionGuard = {
            el,
            scrollTop:el.scrollTop || 0,
            scrollLeft:el.scrollLeft || 0,
            clientY:e.clientY,
            wheelUntil:0,
            active:true
        };
    };
    el.addEventListener('mousedown', beginSelection);
    el.addEventListener('mousemove', e => {
        e.stopPropagation();
        if(textSelectionGuard?.el === el) textSelectionGuard.clientY = e.clientY;
    });
    el.addEventListener('mouseup', e => {
        e.stopPropagation();
        if(textSelectionGuard?.el === el) textSelectionGuard.active = false;
    });
    el.addEventListener('mouseleave', e => {
        e.stopPropagation();
        if(textSelectionGuard?.el === el) {
            el.scrollTop = textSelectionGuard.scrollTop;
            el.scrollLeft = textSelectionGuard.scrollLeft;
        }
    });
    el.addEventListener('scroll', () => {
        const guard = textSelectionGuard;
        if(!guard || guard.el !== el || !guard.active || Date.now() < guard.wheelUntil) {
            if(guard?.el === el) {
                guard.scrollTop = el.scrollTop || 0;
                guard.scrollLeft = el.scrollLeft || 0;
            }
            return;
        }
        const nextTop = el.scrollTop || 0;
        const prevTop = guard.scrollTop || 0;
        const rect = el.getBoundingClientRect();
        const pointerBelow = Number.isFinite(guard.clientY) && guard.clientY > rect.bottom - 10;
        const pointerAbove = Number.isFinite(guard.clientY) && guard.clientY < rect.top + 10;
        const jumpedToTop = prevTop > Math.max(80, el.clientHeight * 0.45) && nextTop < 4 && !pointerAbove;
        const wrongDirectionJump = pointerBelow && nextTop < prevTop - Math.max(40, el.clientHeight * 0.25);
        if(jumpedToTop || wrongDirectionJump) {
            requestAnimationFrame(() => {
                if(textSelectionGuard?.el === el && textSelectionGuard.active) {
                    el.scrollTop = prevTop;
                    el.scrollLeft = guard.scrollLeft || 0;
                }
            });
            return;
        }
        guard.scrollTop = nextTop;
        guard.scrollLeft = el.scrollLeft || 0;
    }, {passive:true});
    el.addEventListener('click', stop);
    el.addEventListener('dblclick', stop);
    el.addEventListener('wheel', e => {
        e.stopPropagation();
        if(textSelectionGuard?.el === el) textSelectionGuard.wheelUntil = Date.now() + 180;
    }, {passive:true});
}
// M4 拆分：updatePortDragVisual / handlePortDrop 已迁移到
// frontend/src/smart-canvas/connections.js（经典 <script>，同上）。

/* ─── 拉线释放 → 节点类型选择菜单 ─── */
// M4 拆分：portDropMenuDrag / portDropMenuScreenPoint（原模块局部状态）/
// openPortDropMenu / closePortDropMenu / drawPortDropMenuLine /
// handlePortDropMenuSelect 已迁移到
// frontend/src/smart-canvas/connections.js（经典 <script>，同上）。

// M7 拆分：pickMediaForSmartNode / bindNodeEvents / rectOverlapNode /
// dragConnectTargetFor / canAutoConnectDraggedNode / restoreDraggedNodePosition
// 已迁移到 frontend/src/smart-canvas/canvas-render.js（经典 <script>，非 ES module，原因同 M1-M6）。
function clearDropHighlight(){
    world.querySelectorAll('.image-node.drop-target').forEach(el => el.classList.remove('drop-target'));
}
function setDropHighlight(targetId){
    clearDropHighlight();
    if(!targetId) return;
    const el = world.querySelector(`.image-node[data-id="${targetId}"]`);
    if(el) el.classList.add('drop-target');
}
function deleteNode(id){
    pushUndo();
    const deleteIds = new Set([id]);
    nodes.forEach(node => {
        if(isHistoryGroupNode(node) && node.historyFor === id) deleteIds.add(node.id);
    });
    nodes = nodes.filter(node => !deleteIds.has(node.id));
    if(canvas) canvas.connections = (canvas.connections || []).filter(c => !deleteIds.has(c.from) && !deleteIds.has(c.to));
    nodes.forEach(node => {
        if(Array.isArray(node.inputNodeIds)) node.inputNodeIds = node.inputNodeIds.filter(inputId => !deleteIds.has(inputId));
        if(isSmartGroupNode(node) && Array.isArray(node.items)) node.items = node.items.filter(itemId => !deleteIds.has(itemId));
    });
    if(selectedId === id) selectedId = '';
    selectedIds = selectedIds.filter(selected => !deleteIds.has(selected));
    if(deleteIds.has(selectedImage.nodeId)) selectedImage = {nodeId:'', index:-1};
    if(deleteIds.has(candidatePanelNodeId)){
        candidatePanelNodeId = '';
        candidatePanelIndex = 0;
    }
    render();
    scheduleSave();
}
function clearNodeMediaBeforeDelete(id){
    const node = nodes.find(n => n.id === id);
    if(!node || (node.type && node.type !== 'smart-image')) return false;
    const hadMedia = Boolean((node.images || []).length || (node.candidateImages || []).length || node.pending);
    if(!hadMedia) return false;
    pushUndo();
    node.images = [];
    node.candidateImages = [];
    node.candidateIndex = 0;
    node.pending = 0;
    node.running = false;
    node.title = genKindLabel(node);
    delete node.w;
    delete node.h;
    const history = historyGroupForNode(node);
    if(history){
        nodes = nodes.filter(n => n.id !== history.id);
        if(canvas) canvas.connections = (canvas.connections || []).filter(c => c.from !== history.id && c.to !== history.id);
    }
    if(candidatePanelNodeId === id){
        candidatePanelNodeId = '';
        candidatePanelIndex = 0;
    }
    if(selectedImage.nodeId === id) selectedImage = {nodeId:'', index:-1};
    selectedId = id;
    selectedIds = [];
    render();
    scheduleSave();
    return true;
}
function deleteNodeFromButton(id){
    if(clearNodeMediaBeforeDelete(id)) return;
    deleteNode(id);
}
// M4 拆分：disconnectConnection / connectionMidpoint /
// insertionConnectionForNode 已迁移到
// frontend/src/smart-canvas/connections.js（经典 <script>，同上）。
// M2 拆分：insertLoopNodeIntoConnection 已迁移到 frontend/src/smart-canvas/loop-node.js。
function updateLoopInsertPreview(){
    const node = dragState ? nodes.find(n => n.id === dragState.id) : null;
    const next = node?.type === 'smart-loop' && dragState.ctrlGroup && (dragState.group || []).length <= 1
        ? insertionConnectionForNode(node)
        : null;
    const nextPreview = next ? {index:next.index} : null;
    const changed = (loopInsertPreview?.index ?? -1) !== (nextPreview?.index ?? -1);
    loopInsertPreview = nextPreview;
    if(changed) refreshConnectionLayer();
    return next;
}
// M8 拆分：图片编辑器全部功能（currentEditImage 到 applyImageEdit，
// 共约90个函数：裁剪/智能扩图/蒙版画笔/网格拼接拆分/文字工具/全景图预览/
// 视频帧导出/预览对比面板/弹窗生命周期）已迁移到
// frontend/src/smart-canvas/image-editor.js（经典 <script>，非 ES module，
// 原因同 M1-M7）。
let lastComposerNodeId = '';
let activeComposerSubject = null;
function currentComposerSubject(){
    return selectedNode();
}
function savePromptDraftForCurrent(){
    if(promptInput?.dataset?.promptLocked === '1') return;
    const subject = activeComposerNode();
    if(!subject) return;
    if(promptInput?.dataset?.preserveDraftOnce === '1' && subject.promptDraftHtml){
        delete promptInput.dataset.preserveDraftOnce;
        return;
    }
    subject.promptDraftHtml = promptInput.innerHTML;
    subject.promptDraftText = promptPlainText();
    subject.runSettings = cloneSmartSettings(settings);
}
function setPromptDraftForNode(node, text){
    if(!isSmartImageNode(node)) return;
    const value = String(text || '');
    node.promptDraftHtml = escapeHtml(value);
    node.promptDraftText = value;
    node.promptDraftTouched = true;
    if(activeSettingsSubject()?.id === node.id && promptInput){
        promptInput.textContent = value;
        delete promptInput.dataset.preserveDraftOnce;
    }
}
function loadPromptDraft(subject){
    if(subject?.promptDraftHtml){
        const hasToken = String(subject.promptDraftHtml || '').includes('mention-image-token');
        promptInput.innerHTML = hasToken
            ? subject.promptDraftHtml
            : (promptHtmlWithMentionTokens(subject.runPrompt || subject.promptDraftText || '', subject.runPromptRefs || []) || subject.promptDraftHtml);
    } else if(typeof subject?.runPrompt === 'string'){
        const rebuilt = promptHtmlWithMentionTokens(subject.runPrompt, subject.runPromptRefs || []);
        if(rebuilt) promptInput.innerHTML = rebuilt;
        else setPromptText(subject.runPrompt);
    } else {
        setPromptText('');
    }
}
function positionComposerForNode(node){
    if(!node) return;
    const rect = nodeRect(node);
    const gap = 14;
    const cardW = 540;
    const screenLeft = viewport.x + (rect.x + rect.width / 2) * viewport.scale - cardW / 2;
    const screenTop = viewport.y + (rect.y + rect.height) * viewport.scale + gap;
    composer.style.width = `${cardW}px`;
    composer.style.left = `${Math.round(screenLeft)}px`;
    composer.style.top = `${Math.round(screenTop)}px`;
}
function updateComposer(){
    const node = selectedNode();
    if(node?.id && suppressComposerForCandidateNodeId === node.id){
        composer.classList.remove('open');
        updateNodeShortcutBar();
        if(cascadeRunBtn) cascadeRunBtn.style.display = 'none';
        activeComposerSubject = null;
        lastComposerNodeId = '';
        suppressComposerForCandidateNodeId = '';
        return;
    }
    if(smartCascadeSilentSelection && !activeComposerSubject){
        composer.classList.remove('open');
        updateNodeShortcutBar();
        if(cascadeRunBtn) cascadeRunBtn.style.display = 'none';
        activeComposerSubject = null;
        lastComposerNodeId = '';
        return;
    }
    composer.classList.toggle('open', !!node);
    updateNodeShortcutBar();
    if(!isSmartImageNode(node) || isUploadedImageOnlyNode(node)){
        if(cascadeRunBtn) cascadeRunBtn.style.display = 'none';
        savePromptDraftForCurrent();
        composer.classList.remove('open');
        activeComposerSubject = null;
        lastComposerNodeId = '';
        setPromptInputLocked(false);
        if(!node) setPromptText('');
        return;
    }
    // composer 只绑定节点本身：图片只是素材/结果，不携带提示词或参数状态。
    const subject = node;
    const composerKey = `${node.id}:node`;
    const switchedNode = lastComposerNodeId !== composerKey;
    if(switchedNode) savePromptDraftForCurrent();
    lastComposerNodeId = composerKey;
    activeComposerSubject = subject;
    const hasPromptInput = promptInputNodesFor(node).length > 0;
    if(switchedNode){
        settings = smartSettingsForNode(subject);
        loadPromptDraft(subject);
    }
    setPromptInputLocked(false);
    syncCascadeRunButton(node);
    positionComposerForNode(node);
    const ph = Math.max(60, Math.min(380, Number(settings.promptH) || 124));
    promptInput.style.setProperty('--prompt-h', `${ph}px`);
    syncComposerPromptVisibility();
    renderInputThumbsRow(node);
    renderInputPromptPreview(node);
    syncCascadeRunButton(node);
    updateProviderModels();
}
function positionPromptComposerForNode(node){
    if(!promptComposer || !node) return;
    const rect = nodeRect(node);
    const gap = 14;
    const cardW = 540;
    const screenLeft = viewport.x + (rect.x + rect.width / 2) * viewport.scale - cardW / 2;
    const screenTop = viewport.y + (rect.y + rect.height) * viewport.scale + gap;
    promptComposer.style.width = `${cardW}px`;
    promptComposer.style.left = `${Math.round(screenLeft)}px`;
    promptComposer.style.top = `${Math.round(screenTop)}px`;
}
function promptComposerParamsHtml(node){
    node.llmProvider = resolveChatProviderId(node.llmProvider || '');
    node.llmModel = resolveChatModel(node.llmModel || '', node.llmProvider);
    const task = node.llmTask;
    const ruleHtml = task === 'caption' || task === 'expand'
        ? `<select class="prompt-composer-control prompt-composer-rule">${smartRuleTemplateOptions(task, task === 'caption' ? node.captionTemplateId : node.expandTemplateId)}</select>`
        : '';
    return `<select class="prompt-composer-control prompt-composer-provider">${chatProviderOptions(node.llmProvider)}</select>
        <select class="prompt-composer-control prompt-composer-model">${chatModelOptions(node.llmModel, node.llmProvider)}</select>
        ${ruleHtml}`;
}
function renderPromptComposer(node){
    if(!promptComposer) return;
    node.llmTask = ['llm', 'caption', 'expand'].includes(node.llmTask) ? node.llmTask : 'llm';
    const task = node.llmTask;
    if(promptTaskSelect) promptTaskSelect.value = task;
    // 三种模式均展示指令输入框：对话/反推用作指令，扩写用作待扩写的内容。
    if(promptComposerInstructionRow) promptComposerInstructionRow.style.display = '';
    if(promptComposerInstruction){
        promptComposerInstruction.value = node.llmInstruction || '';
        promptComposerInstruction.placeholder = task === 'caption'
            ? tr('smart.promptCaptionInstruction')
            : task === 'expand'
            ? tr('smart.promptExpandInstruction')
            : tr('smart.promptLlmInstructionPlaceholder');
    }
    if(promptComposerParams) promptComposerParams.innerHTML = promptComposerParamsHtml(node);
    renderPromptComposerThumbs(node);
    renderPromptComposerInputPreview(node);
    if(promptComposerRunBtn){
        const runLabel = task === 'caption' ? tr('smart.promptCaptionRun') : task === 'expand' ? tr('smart.promptExpandRun') : tr('common.run');
        promptComposerRunBtn.disabled = Boolean(node.running);
        promptComposerRunBtn.innerHTML = `<i data-lucide="${node.running ? 'loader-2' : 'play'}"></i><span>${node.running ? escapeHtml(tr('common.running')) : escapeHtml(runLabel)}</span>`;
    }
    bindPromptComposerControls(node);
    positionPromptComposerForNode(node);
    if(window.lucide) lucide.createIcons();
}
function bindPromptComposerControls(node){
    if(promptTaskSelect) promptTaskSelect.onchange = e => {
        node.llmTask = e.target.value;
        renderPromptComposer(node);
        scheduleSave();
    };
    if(promptComposerInstruction){
        promptComposerInstruction.oninput = e => { node.llmInstruction = e.target.value; scheduleSave(); };
    }
    const providerEl = promptComposerParams?.querySelector('.prompt-composer-provider');
    if(providerEl) providerEl.onchange = e => {
        node.llmProvider = resolveChatProviderId(e.target.value);
        node.llmModel = resolveChatModel('', node.llmProvider);
        renderPromptComposer(node);
        scheduleSave();
    };
    const modelEl = promptComposerParams?.querySelector('.prompt-composer-model');
    if(modelEl) modelEl.onchange = e => { node.llmModel = e.target.value; scheduleSave(); };
    const ruleEl = promptComposerParams?.querySelector('.prompt-composer-rule');
    if(ruleEl) ruleEl.onchange = e => {
        if(node.llmTask === 'caption') node.captionTemplateId = e.target.value;
        else if(node.llmTask === 'expand') node.expandTemplateId = e.target.value;
        scheduleSave();
    };
    if(promptComposerRunBtn) promptComposerRunBtn.onclick = e => {
        e.preventDefault(); e.stopPropagation();
        runPromptLLMNode(node.id);
    };
}
function updatePromptComposer(){
    if(!promptComposer) return;
    const node = selectedNode();
    const show = node?.type === 'smart-prompt' && !isSmartGroupCompactMember(node);
    promptComposer.classList.toggle('open', Boolean(show));
    if(show) renderPromptComposer(node);
}
function renderInputPromptPreview(node){
    if(!inputPromptPreview) return;
    if(settings.engine === 'runninghub' && !rhRequiresPrompt(settings)){
        inputPromptPreview.classList.remove('has-text');
        inputPromptPreview.innerHTML = '';
        return;
    }
    const text = node ? inputPromptTextFor(node).trim() : '';
    inputPromptPreview.classList.toggle('has-text', Boolean(text));
    inputPromptPreview.innerHTML = text
        ? `<div class="input-prompt-preview-label">${escapeHtml(tr('smart.inputUpstream'))}</div><div class="input-prompt-preview-text">${escapeHtml(text)}</div>`
        : '';
}
function rhInputKindLabel(kind){
    if(kind === 'video') return 'VIDEO';
    if(kind === 'audio') return 'AUDIO';
    return 'IMAGE';
}
function rhInputKindIcon(kind){
    if(kind === 'video') return 'film';
    if(kind === 'audio') return 'file-audio';
    return 'image';
}
function renderRhInputThumb(ref, field, index, kind, node, sourceUrl){
    const isVid = kind === 'video' || isVideoMediaItem(ref);
    const title = `${field.label || field.fieldName || rhInputKindLabel(kind)} · ${ref?.name || tr('smart.inputNum').replace('{n}', String(index + 1))}`;
    const visibleUrl = renderedThumbSrcForRef(ref);
    const inner = isVid
        ? `<div class="input-thumb-video">${videoPosterHtml(ref)}<span class="smart-video-badge"><i data-lucide="play"></i></span></div>`
        : `<img src="${escapeAttr(visibleUrl)}" draggable="false" loading="eager" decoding="async">`;
    const label = rhInputKindLabel(kind).slice(0, 3);
    const isSelf = node ? isSelfReferenceForNode(node, ref) : false;
    return `<div class="input-thumb ${isVid ? 'has-video-preview' : ''} ${isSelf ? 'input-self' : ''}" draggable="false" data-thumb-index="${index}" data-file-id="${escapeAttr(ref.file_id || '')}" data-node-id="${escapeAttr(ref.nodeId || '')}" data-image-index="${ref.imageIndex ?? ''}" data-url="${escapeAttr(ref.url || '')}" data-source-url="${escapeAttr(sourceUrl || ref.originalLocalUrl || ref.url || '')}" title="${escapeAttr(title)}" style="--preview-url:url('${escapeAttr(thumbMediaUrl(ref) || '')}')">${inner}${isVid ? inputVideoHoverPreviewHtml(ref) : ''}<span class="input-thumb-label">${escapeHtml(label)}</span><button class="input-thumb-x" type="button" data-disconnect-from="${escapeAttr(ref.nodeId || '')}"><i data-lucide="x"></i></button></div>`;
}
function inputVideoHoverPreviewHtml(item){
    const src = filePreviewUrl(item) || item?.url || '';
    return src ? `<video class="input-thumb-video-preview" src="${escapeAttr(src)}" muted loop playsinline preload="metadata" disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>` : '';
}
function inputThumbType(item){
    if(isVideoMediaItem(item)) return 'video';
    if(isAudioMediaItem(item)) return 'audio';
    return 'image';
}
function inputThumbLabel(item, index){
    const n = index + 1;
    if(isVideoMediaItem(item)) return window.StudioI18n?.lang?.() === 'en' ? `Video ${n}` : `视频${n}`;
    if(isAudioMediaItem(item)) return window.StudioI18n?.lang?.() === 'en' ? `Audio ${n}` : `音频${n}`;
    return window.StudioI18n?.lang?.() === 'en' ? `Image ${n}` : `图${n}`;
}
function renderRunningHubInputThumbsRow(node){
    const fields = rhActiveFields().filter(field => ['image','video','audio'].includes(rhFieldKind(field)));
    const refs = node
        ? uniqueReferenceImages([
            ...defaultReferenceImagesFor(node),
            ...(smartPromptInputEnabledForSettings(settings) ? collectMentionedImagesFromPrompt() : [])
        ])
        : [];
    const media = {
        image:imageRefsOnly(refs),
        video:videoRefsOnly(refs),
        audio:audioRefsOnly(refs)
    };
    const indexes = rhFieldIndexes(rhActiveFields());
    inputThumbsRow.classList.add('runninghub-inputs');
    inputThumbsRow.classList.toggle('has-items', fields.length > 0);
    if(!fields.length){
        inputThumbsRow.innerHTML = '';
        return;
    }
    inputThumbsRow.innerHTML = `<div class="rh-input-field-list">${fields.map(field => {
        const kind = rhFieldKind(field);
        const key = rhParamKey(field.nodeId, field.fieldName);
        const index = indexes[key] || 0;
        const ref = (media[kind] || [])[index] || null;
        const label = field.label || field.fieldName || rhInputKindLabel(kind);
        const sourceUrl = ref?.originalLocalUrl || ref?.sourceUrl || ref?.url || '';
        const thumb = ref?.url
            ? renderRhInputThumb(ref, field, index, kind, node, sourceUrl)
            : `<div class="rh-input-empty-icon"><i data-lucide="${rhInputKindIcon(kind)}"></i></div>`;
        return `<div class="rh-input-field ${ref?.url ? '' : 'empty'}" title="${escapeAttr(label)}">
            ${thumb}
            <div class="rh-input-field-meta">
                <div class="rh-input-field-name">${escapeHtml(label)}</div>
                <div class="rh-input-field-kind">${escapeHtml(rhInputKindLabel(kind))}${field.required === true ? ' · REQUIRED' : ''}</div>
            </div>
        </div>`;
    }).join('')}</div>`;
    bindInputThumbsDrag(node, refs);
}
function inputThumbItemHtml(img, i, node, typeIndexes){
    const isVid = isVideoMediaItem(img);
    const isSelf = node ? isSelfReferenceForNode(node, img) : false;
    const title = isSelf
        ? tr('smart.inputSelf')
        : (smartImageMode(node) === 'workflow' ? tr('smart.inputUpstreamWorkflow') : tr('smart.inputUpstream'));
    const visibleUrl = renderedThumbSrcForRef(img);
    const inner = isVid
        ? `<div class="input-thumb-video">${videoPosterHtml(img)}<span class="smart-video-badge"><i data-lucide="play"></i></span></div>`
        : `<img src="${escapeHtml(visibleUrl)}" draggable="false" loading="eager" decoding="async">`;
    const label = inputThumbLabel(img, typeIndexes[inputThumbType(img)]++);
    const sourceUrl = img.originalLocalUrl || img.url || '';
    return `<div class="input-thumb ${isVid ? 'has-video-preview' : ''} ${isSelf ? 'input-self' : ''}" draggable="false" data-thumb-index="${i}" data-file-id="${escapeHtml(img.file_id || '')}" data-node-id="${escapeHtml(img.nodeId || '')}" data-image-index="${img.imageIndex ?? ''}" data-url="${escapeHtml(img.url || '')}" data-source-url="${escapeHtml(sourceUrl)}" title="${escapeHtml(`${img.name || label} · ${title}`)}" style="--preview-url:url('${escapeHtml(thumbMediaUrl(img) || '')}')">${inner}${isVid ? inputVideoHoverPreviewHtml(img) : ''}<span class="input-thumb-label">${escapeHtml(label)}</span><button class="input-thumb-x" type="button" data-disconnect-from="${escapeHtml(img.nodeId || '')}"><i data-lucide="x"></i></button></div>`;
}
function renderInputThumbsRow(node){
    if(!inputThumbsRow) return;
    syncJimengModelPillForRefs();
    syncJimengVideoModelPillForRefs();
    syncRhConfigForRefs();
    inputThumbsRow.classList.remove('runninghub-inputs');
    if(settings.engine === 'runninghub') return renderRunningHubInputThumbsRow(node);
    const dedup = node ? visibleReferenceImagesFor(node) : [];
    inputThumbsRow.classList.toggle('has-items', dedup.length > 0);
    if(!dedup.length){ inputThumbsRow.innerHTML = ''; return; }
    const typeIndexes = {image:0, video:0, audio:0};
    const thumbsHtml = dedup.map((img, i) => inputThumbItemHtml(img, i, node, typeIndexes)).join('');
    inputThumbsRow.innerHTML = `<div class="input-thumb-list">${thumbsHtml}</div>`;
    bindInputThumbsDrag(node, dedup);
}
// 提示词节点配置框的输入图：与图片生成节点使用相同的缩略图渲染与交互（含断开按钮、视频预览、拖拽排序）。
function renderPromptComposerThumbs(node){
    if(!promptComposerThumbs) return;
    const dedup = node ? promptNodeInputImages(node) : [];
    promptComposerThumbs.classList.toggle('has-items', dedup.length > 0);
    if(!dedup.length){ promptComposerThumbs.innerHTML = ''; return; }
    const typeIndexes = {image:0, video:0, audio:0};
    const thumbsHtml = dedup.map((img, i) => inputThumbItemHtml(img, i, node, typeIndexes)).join('');
    promptComposerThumbs.innerHTML = `<div class="input-thumb-list">${thumbsHtml}</div>`;
    bindInputThumbsDrag(node, dedup, promptComposerThumbs);
}
// 提示词节点配置框的「上游输入」预览：显示连入的上游提示词文本，与图片生成节点一致。
function renderPromptComposerInputPreview(node){
    if(!promptComposerInputPreview) return;
    const text = node ? inputPromptTextFor(node).trim() : '';
    promptComposerInputPreview.classList.toggle('has-text', Boolean(text));
    promptComposerInputPreview.innerHTML = text
        ? `<div class="input-prompt-preview-label">${escapeHtml(tr('smart.inputUpstream'))}</div><div class="input-prompt-preview-text">${escapeHtml(text)}</div>`
        : '';
}
function bindInputThumbsDrag(node, items, container=inputThumbsRow){
    if(!container) return;
    let thumbDragIndex = -1;
    container.querySelectorAll('.input-thumb').forEach(el => {
        const index = Number(el.dataset.thumbIndex || -1);
        const canReorder = items.length > 1 && Boolean(items[index]?.nodeId);
        el.draggable = canReorder;
        el.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
        });
        const videoPreview = el.querySelector('.input-thumb-video-preview');
        if(videoPreview){
            el.addEventListener('mouseenter', () => {
                const play = () => {
                    const promise = videoPreview.play?.();
                    if(promise?.catch) promise.catch(() => {});
                };
                if(videoPreview.readyState >= 1) play();
                else videoPreview.addEventListener('loadedmetadata', play, {once:true});
            });
            el.addEventListener('mouseleave', () => {
                videoPreview.pause();
                try { videoPreview.currentTime = 0; } catch(e) {}
            });
        }
        const disconnectBtn = el.querySelector('.input-thumb-x');
        if(disconnectBtn){
            disconnectBtn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); }, true);
            disconnectBtn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                const fromId = disconnectBtn.dataset.disconnectFrom;
                if(!fromId || !node || !canvas?.connections) return;
                const connIdx = canvas.connections.findIndex(c => c.from === fromId && c.to === node.id);
                if(connIdx >= 0) disconnectConnection(connIdx);
            });
        }
        if(!canReorder) return;
        el.addEventListener('dragstart', e => {
            e.stopPropagation();
            thumbDragIndex = index;
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-smart-input-thumb', String(index));
        });
        el.addEventListener('dragend', e => {
            e.stopPropagation();
            thumbDragIndex = -1;
            clearInputThumbDropMarkers();
            el.classList.remove('dragging');
        });
        el.addEventListener('dragover', e => {
            const rawFrom = e.dataTransfer.getData('application/x-smart-input-thumb');
            const from = rawFrom === '' ? thumbDragIndex : Number(rawFrom);
            if(!Number.isFinite(from) || from < 0 || from === index || !items[index]?.nodeId) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            clearInputThumbDropMarkers();
            const placement = inputThumbDropPlacement(el, e);
            el.dataset.dropPlacement = placement;
            el.classList.add(placement === 'before' ? 'drop-before' : 'drop-after');
        });
        el.addEventListener('dragleave', e => {
            if(el.contains(e.relatedTarget)) return;
            delete el.dataset.dropPlacement;
            el.classList.remove('drop-before', 'drop-after');
        });
        el.addEventListener('drop', e => {
            const rawFrom = e.dataTransfer.getData('application/x-smart-input-thumb');
            const from = rawFrom === '' ? thumbDragIndex : Number(rawFrom);
            if(!Number.isFinite(from) || from < 0 || from === index || !items[index]?.nodeId) return;
            e.preventDefault();
            e.stopPropagation();
            const placement = inputThumbDropPlacement(el, e);
            clearInputThumbDropMarkers();
            reorderInputThumb(node, items, from, index, placement);
        });
    });
}
function inputThumbDropPlacement(el, event){
    const rect = el.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}
function clearInputThumbDropMarkers(){
    [inputThumbsRow, promptComposerThumbs].filter(Boolean).forEach(container => {
        container.querySelectorAll('.input-thumb.drop-before,.input-thumb.drop-after,.input-thumb.dragging')
            .forEach(el => {
                delete el.dataset.dropPlacement;
                el.classList.remove('drop-before', 'drop-after', 'dragging');
            });
    });
}
function movedBeforeAfterIds(ids, movedId, targetId, placement='before'){
    const list = (ids || []).filter(Boolean);
    const from = list.indexOf(movedId);
    const target = list.indexOf(targetId);
    if(from < 0 || target < 0 || movedId === targetId) return list;
    const [moved] = list.splice(from, 1);
    let insertAt = list.indexOf(targetId);
    if(insertAt < 0) return ids || [];
    if(placement === 'after') insertAt += 1;
    list.splice(insertAt, 0, moved);
    return list;
}
function sameOrderedIds(a, b){
    if((a || []).length !== (b || []).length) return false;
    return (a || []).every((id, index) => id === b[index]);
}
function reorderInputSourceNodes(currentNode, movedId, targetId, placement='before'){
    if(!currentNode || !movedId || !targetId || movedId === targetId) return false;
    const sourceNodes = smartImageUsesWorkflowInput(currentNode, smartLoopContext)
        ? workflowInputNodesFor(currentNode)
        : inputNodesFor(currentNode);
    const sourceIds = sourceNodes.map(n => n.id).filter(Boolean);
    if(!sourceIds.includes(movedId) || !sourceIds.includes(targetId)) return false;
    const nextIds = movedBeforeAfterIds(sourceIds, movedId, targetId, placement);
    if(sameOrderedIds(sourceIds, nextIds)) return false;
    const oldExplicitIds = Array.isArray(currentNode.inputNodeIds) ? currentNode.inputNodeIds.filter(Boolean) : [];
    currentNode.inputNodeIds = [
        ...nextIds.filter(id => oldExplicitIds.includes(id)),
        ...oldExplicitIds.filter(id => !nextIds.includes(id))
    ];
    if(canvas && Array.isArray(canvas.connections)){
        const order = new Map(nextIds.map((id, index) => [id, index]));
        const relevantSlots = new Set();
        const relevant = [];
        canvas.connections.forEach((conn, index) => {
            const kind = conn?.kind || 'flow';
            if(conn?.to === currentNode.id && ['input', 'flow'].includes(kind) && order.has(conn.from)){
                relevantSlots.add(index);
                relevant.push({conn, index});
            }
        });
        if(relevant.length){
            relevant.sort((a, b) => (order.get(a.conn.from) - order.get(b.conn.from)) || (a.index - b.index));
            let cursor = 0;
            canvas.connections = canvas.connections.map((conn, index) => relevantSlots.has(index) ? relevant[cursor++].conn : conn);
        }
    }
    return true;
}
function reorderInputThumb(currentNode, items, from, to, placement='before'){
    // items are already sourced from inputImagesFor → multiple source nodes possible.
    // Reorder within a source group's images first; separate input nodes use the
    // current node's input order, with a visual-position swap as a final fallback.
    if(from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const fromImg = items[from];
    const toImg = items[to];
    if(!fromImg || !toImg) return;
    if(fromImg.nodeId === toImg.nodeId){
        const src = nodes.find(n => n.id === fromImg.nodeId);
        if(!src) return;
        pushUndo();
        const fi = Number(fromImg.imageIndex);
        const ti = Number(toImg.imageIndex);
        if(Number.isFinite(fi) && Number.isFinite(ti) && (src.images || [])[fi]){
            const arr = src.images;
            let insertAt = Math.max(0, Math.min(arr.length, ti + (placement === 'after' ? 1 : 0)));
            const item = arr.splice(fi, 1)[0];
            if(fi < insertAt) insertAt -= 1;
            arr.splice(Math.max(0, Math.min(arr.length, insertAt)), 0, item);
        }
        render();
        scheduleSave();
        return;
    }
    const canReorderSources = currentNode && fromImg.nodeId && toImg.nodeId;
    const a = nodes.find(n => n.id === fromImg.nodeId);
    const b = nodes.find(n => n.id === toImg.nodeId);
    if(!canReorderSources || !a || !b) return;
    pushUndo();
    if(reorderInputSourceNodes(currentNode, fromImg.nodeId, toImg.nodeId, placement)){
        render();
        scheduleSave();
        return;
    }
    // Cross-node fallback: swap X positions of source nodes
    const ax = a.x, ay = a.y;
    a.x = b.x; a.y = b.y;
    b.x = ax; b.y = ay;
    render();
    scheduleSave();
}
// M6 拆分：isSupportedUploadFile / dataTransferItemEntry / filesFromEntry /
// uploadFilesFromDataTransfer / uploadTitleForItems /
// SMART_IMAGE_DROP_EXT_RE / SMART_IMAGE_DROP_TEXT_TYPES /
// SMART_IMAGE_DROP_TYPE_HINT_RE / smartImageFilesFromDataTransfer
// 已迁移到 frontend/src/smart-canvas/upload.js（经典 <script>，同上）。
// 注意：StorageQuotaSignal / quotaDataFromPayload /
// checkQuotaWarningFromResult / smartResponseError /
// smartResponseErrorMessage（紧接在下面）没有跟着搬走，它们是被
// cascade-run.js（M5）大量调用的通用错误处理/配额检查基础设施，
// 留在这里。
class StorageQuotaSignal extends Error {
    constructor(info){
        const data = info || {};
        super(data.detail || data.message || data.error || '存储空间不足');
        this.storageQuotaExceeded = true;
        this.quota_bytes = data.quota_bytes;
        this.used_bytes = data.used_bytes;
        this.incoming_bytes = data.incoming_bytes;
    }
}
function quotaDataFromPayload(payload){
    if(!payload || typeof payload !== 'object') return null;
    if(payload.error === 'storage_quota_exceeded') return payload;
    return null;
}
function checkQuotaWarningFromResult(data){
    if(!data || typeof data !== 'object') return;
    const warning = data.quota_warning;
    if(warning && warning.quota_exceeded){
        try {
            window.MediaForgeUpload?.showQuotaDialog?.({
                quota_bytes: warning.quota_bytes,
                used_bytes: warning.used_bytes,
                incoming_bytes: warning.incoming_bytes,
            });
        } catch(_) {}
        return;
    }
    // No inline warning — check server quota asynchronously.
    fetch('/api/storage/usage').then(r => r.ok ? r.json() : null).then(usage => {
        if(!usage) return;
        const quota = Number(usage.quota_bytes || 0);
        const used = Number(usage.used_bytes || 0);
        if(quota > 0 && used >= quota){
            try {
                window.MediaForgeUpload?.showQuotaDialog?.({quota_bytes:quota, used_bytes:used});
            } catch(_) {}
        }
    }).catch(() => {});
}
async function smartResponseError(response, fallback='请求失败'){
    let payload = null;
    try { payload = await response.clone().json(); } catch(_) {}
    if(response.status === 413 && quotaDataFromPayload(payload)) return new StorageQuotaSignal(payload);
    return new Error(await smartResponseErrorMessage(response, fallback, payload));
}
async function smartResponseErrorMessage(response, fallback='请求失败', prefetched){
    let data = prefetched;
    if(data === undefined){
        try { data = await response.clone().json(); } catch(_) { data = null; }
    }
    if(data && typeof data === 'object'){
        const detail = data.detail ?? data.error ?? data.message;
        if(typeof detail === 'string') return detail || fallback;
        if(Array.isArray(detail)) return detail.map(item => item?.msg || item?.message || String(item)).join('\n') || fallback;
    }
    try {
        const text = await response.text();
        if(text) return text;
    } catch(_) {}
    return fallback;
}
// M6 拆分：smartDropDataTypes / readSmartDropData / decodeSmartDropText /
// smartDropTextFragments / uniqueSmartDropValues / smartDropTextCandidates /
// isRemoteSmartImageDropValue / isLocalSmartImageDropValue /
// smartLocalImagePathsFromDataTransfer / smartImageNameFromUrl /
// smartImageDropPayload / resolveSmartImageDropPayload /
// hasSmartImageDropData / hasSmartAssetDrag / hasMediaDrawerDrag /
// hasSmartInputThumbDrag / setSmartDropCopyEffect / uploadFiles /
// appendImagesToSmartNode / handleFiles / importSmartLocalImages /
// handleSmartImageDropPayload 已迁移到 frontend/src/smart-canvas/upload.js
// （经典 <script>，非 ES module，原因同 M1-M5）。
function sizeForRun(sourceSettings=settings){
    return apiImageSize(sourceSettings.ratio || 'square', sourceSettings.resolution || '1k', sourceSettings.customRatio || '', sourceSettings.customSize || '', sourceSettings.ratioMatched || '') || '1024x1024';
}
function expectedOutputSize(){
    if(settings.engine === 'comfy'){
        if(settings.comfyMode === 'text'){
            const w = Number(settings.width) || 1024;
            const h = Number(settings.height) || 1024;
            return {w, h};
        }
        return {w:1024, h:1024};
    }
    if(settings.engine === 'runninghub') return {w:1024, h:1024};
    const sizeStr = settings.engine === 'modelscope'
        ? apiImageSize(settings.msRatio || 'square', settings.msResolution || '1k', settings.msCustomRatio || '', settings.msCustomSize || '', settings.msRatioMatched || '')
        : sizeForRun();
    const parsed = parseSizeValue(sizeStr);
    if(parsed){
        return {w: Number(parsed.width) || 1024, h: Number(parsed.height) || 1024};
    }
    return {w:1024, h:1024};
}
function explicitRequestOutputSizeForPending(){
    if(isApiLikeEngine(settings.engine) && settings.apiKind !== 'video'){
        const parsed = parseSizeValue(sizeForRun());
        if(parsed) return {w:Number(parsed.width) || 1024, h:Number(parsed.height) || 1024};
    }
    if(settings.engine === 'modelscope'){
        const sizeStr = apiImageSize(settings.msRatio || 'square', settings.msResolution || '1k', settings.msCustomRatio || '', settings.msCustomSize || '', settings.msRatioMatched || '');
        const parsed = parseSizeValue(sizeStr);
        if(parsed) return {w:Number(parsed.width) || 1024, h:Number(parsed.height) || 1024};
    }
    if(settings.engine === 'comfy' && settings.comfyMode === 'text'){
        const w = Number(settings.width) || 1024;
        const h = Number(settings.height) || 1024;
        return {w, h};
    }
    return null;
}
function pendingSizeFromImageRef(img){
    const w = Number(img?.natural_w || img?.width || 0);
    const h = Number(img?.natural_h || img?.height || 0);
    return w > 0 && h > 0 ? {w, h} : null;
}
function pendingSourceBoxSize(options={}){
    const sourceNode = options.sourceNode || null;
    if(sourceNode && (sourceNode.images || []).length){
        const rect = nodeRect(sourceNode);
        if(rect.width > 24 && rect.height > 24) return {w:Math.round(rect.width), h:Math.round(rect.height), display:true};
    }
    const ref = (options.refs || []).find(img => img?.url);
    const refSize = pendingSizeFromImageRef(ref);
    if(refSize) return refSize;
    const refNode = ref?.nodeId ? nodes.find(n => n.id === ref.nodeId) : null;
    if(refNode){
        const rect = nodeRect(refNode);
        if(rect.width > 24 && rect.height > 24) return {w:Math.round(rect.width), h:Math.round(rect.height), display:true};
    }
    return null;
}
function displayBoxFromNaturalSize(size){
    const layout = singleImageLayout(
        {natural_w:size?.w || size?.width || 1024, natural_h:size?.h || size?.height || 1024},
        {type:'smart-image', images:[{}]},
        MEDIA_NODE_DEFAULT_SCALE
    );
    return {w:layout.width, h:layout.height};
}
function pendingBaseBoxSize(options={}){
    const requestSize = explicitRequestOutputSizeForPending();
    if(requestSize) return displayBoxFromNaturalSize(requestSize);
    const sourceSize = pendingSourceBoxSize(options);
    if(sourceSize?.display) return {w:sourceSize.w, h:sourceSize.h};
    if(sourceSize) return displayBoxFromNaturalSize(sourceSize);
    return displayBoxFromNaturalSize(expectedOutputSize());
}
function pendingBoxSize(count, options={}){
    const base = pendingBaseBoxSize(options);
    if(options.candidatePool) return {w:Math.round(base.w), h:Math.round(base.h)};
    const aspect = base.w / Math.max(1, base.h);
    const c = Math.max(1, Number(count) || 1);
    if(c <= 1){
        return {w:Math.round(base.w), h:Math.round(base.h)};
    }
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(c))));
    const rows = Math.ceil(c / cols);
    const cellMax = Math.max(96, Math.min(220, Math.max(base.w, base.h) * 0.42));
    let cellW, cellH;
    if(base.w >= base.h){
        cellW = cellMax;
        cellH = Math.max(40 * MEDIA_NODE_DEFAULT_SCALE, Math.round(cellMax / aspect));
    } else {
        cellH = cellMax;
        cellW = Math.max(40 * MEDIA_NODE_DEFAULT_SCALE, Math.round(cellMax * aspect));
    }
    const w = cols * (cellW + 8) + 16;
    const h = rows * (cellH + 8) + 16;
    return {w, h};
}
function mentionTokenHtml(img){
    if(!img?.url) return '';
    const name = img.alias || img.name || '图片';
    const kind = mediaKindForItem(img);
    const media = kind === 'video'
        ? videoPosterHtml(img)
        : `<img src="${escapeHtml(img.url)}" alt="">`;
    return `<span class="mention-image-token" contenteditable="false" data-url="${escapeHtml(img.url)}" data-kind="${escapeHtml(kind)}" data-name="${escapeHtml(name)}" data-node-id="${escapeHtml(img.nodeId || '')}" data-image-index="${escapeHtml(img.imageIndex ?? '')}">${media}<span>${escapeHtml(name)}</span></span>`;
}
function promptHtmlWithMentionTokens(text, refs=[]){
    const value = String(text || '');
    const items = (refs || []).filter(ref => ref?.url && ref?.name).sort((a, b) => String(b.name || '').length - String(a.name || '').length);
    if(!value || !items.length || !value.includes('@')) return '';
    let html = '';
    let index = 0;
    while(index < value.length){
        if(value[index] === '@'){
            const hit = items.find(ref => value.slice(index + 1, index + 1 + String(ref.name || '').length) === String(ref.name || ''));
            if(hit){
                html += mentionTokenHtml(hit);
                index += 1 + String(hit.name || '').length;
                continue;
            }
        }
        html += escapeHtml(value[index]);
        index += 1;
    }
    return html;
}
function snapshotRunMeta(prompt, sourceId, displayPrompt='', refs=[]){
    return {
        prompt,
        displayPrompt:displayPrompt || promptPlainText() || prompt,
        promptHtml: promptInput ? promptInput.innerHTML : '',
        promptText: promptPlainText(),
        promptRefs:(refs || []).map(ref => ({file_id:ref.file_id || '', url:ref.url || '', name:ref.name || '', nodeId:ref.nodeId || '', imageIndex:ref.imageIndex ?? ''})).filter(ref => ref.url),
        inputRefs:(refs || []).map(ref => ({file_id:ref.file_id || '', url:ref.url || '', name:ref.name || '', nodeId:ref.nodeId || '', imageIndex:ref.imageIndex ?? '', kind:ref.kind || ''})).filter(ref => ref.url),
        sourceNodeId:sourceId,
        settings:JSON.parse(JSON.stringify(settings)),
        createdAt:Date.now()
    };
}
function attachRunMeta(targetNode, meta){
    if(!targetNode || !meta) return;
    targetNode.runPrompt = meta.promptText || meta.displayPrompt || meta.prompt;
    targetNode.runModelPrompt = meta.prompt;
    targetNode.runPromptRefs = meta.promptRefs || [];
    delete targetNode.runInputRefs;
    targetNode.runSettings = meta.settings;
    if(meta.sourceNodeId) targetNode.sourceNodeId = meta.sourceNodeId;
    else delete targetNode.sourceNodeId;
    targetNode.runAt = meta.createdAt;
    // 保存可编辑的 @-提及表单到草稿字段，方便点输出节点时还原原始可编辑形式
    if(meta.promptHtml != null){
        const htmlHasToken = String(meta.promptHtml || '').includes('mention-image-token');
        const rebuiltHtml = htmlHasToken ? '' : promptHtmlWithMentionTokens(meta.displayPrompt || meta.promptText || '', meta.promptRefs || []);
        targetNode.promptDraftHtml = htmlHasToken ? meta.promptHtml : (rebuiltHtml || meta.promptHtml);
        targetNode.promptDraftText = meta.promptText || '';
    }
    targetNode.images = (targetNode.images || []).map(img => stripImageGenerationMeta(img));
}
function stripRunInputMeta(meta){
    if(!meta) return meta;
    const cleanPrompt = meta.promptText || meta.displayPrompt || meta.prompt || '';
    return {
        ...meta,
        promptHtml:escapeHtml(cleanPrompt),
        promptText:cleanPrompt,
        promptRefs:[],
        inputRefs:meta.inputRefs || meta.promptRefs || [],
        sourceNodeId:''
    };
}
function stripImageGenerationMeta(img){
    if(!img) return img;
    delete img.runPrompt;
    delete img.runModelPrompt;
    delete img.runSettings;
    delete img.sourceNodeId;
    delete img.runAt;
    delete img.promptDraftHtml;
    delete img.promptDraftText;
    return img;
}
// M4 拆分：addConnection / connectInputNode 已迁移到
// frontend/src/smart-canvas/connections.js（经典 <script>，同上）。
function upstreamNodesForKinds(node, kinds=['input']){
    if(!node) return [];
    const allowed = new Set(kinds);
    const ids = new Set(allowed.has('input') ? (node.inputNodeIds || []) : []);
    (canvas?.connections || []).forEach(conn => {
        if(conn.to === node.id && allowed.has(conn.kind || 'flow')) ids.add(conn.from);
    });
    return [...ids].map(id => nodes.find(n => n.id === id)).filter(Boolean);
}
function inputNodesFor(node){
    return upstreamNodesForKinds(node, ['input']);
}
function workflowInputNodesFor(node){
    return upstreamNodesForKinds(node, ['input', 'flow']);
}
function imagesForNode(node){
    if(node?.type === 'smart-group') return smartGroupImageRefs(node).map(ref => ({
        ...ref.item,
        nodeId:ref.nodeId,
        imageIndex:ref.index
    }));
    return (node?.images || []).map((img, index) => ({...imageForDisplay(img), nodeId:node.id, imageIndex:index}));
}
function nodeHasReferenceContent(node){
    return imagesForNode(node).some(img => img?.url);
}
function isSelfReferenceForNode(node, img){
    return Boolean(node?.id && img?.nodeId === node.id);
}
function candidateInputImagesFor(node, consume=false, ctx=smartLoopContext){
    const inputs = (smartImageUsesWorkflowInput(node, ctx) ? workflowInputImagesFor(node, consume, ctx) : inputImagesFor(node, consume, ctx))
        .filter(img => img?.url);
    if(!inputs.length) return [];
    if(smartImageUsesWorkflowInput(node, ctx)) return inputs;
    if(nodeHasReferenceContent(node)) return [];
    return inputs;
}
function defaultInputImagesFor(node, consume=false, ctx=smartLoopContext){
    return candidateInputImagesFor(node, consume, ctx);
}
function generatedUpstreamImagesFor(node, consume=false, ctx=smartLoopContext){
    if(!node) return [];
    const workflowRefs = workflowInputImagesFor(node, consume, ctx)
        .filter(img => img?.url && !isSelfReferenceForNode(node, img));
    if(workflowRefs.length) return workflowRefs;
    const source = node.sourceNodeId ? nodes.find(n => n.id === node.sourceNodeId && n.id !== node.id) : null;
    return source ? outputImagesForNode(source, consume, ctx).filter(img => img?.url) : [];
}
function splitSmartPromptItems(text){
    const trimmed = String(text || '').trim();
    if(!trimmed) return [];
    const numbered = trimmed.split(/\s*(?:^|\s)\d+\s*[.、)）．]\s+/).map(s => s.trim()).filter(Boolean);
    if(numbered.length >= 2) return numbered;
    const lines = trimmed.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
    return lines.length >= 2 ? lines : [trimmed];
}
// M2 拆分：smartLoopPromptFieldValues / smartLoopActivePromptFieldValues /
// setSmartLoopPromptFieldValues / smartLoopPromptFieldText /
// smartLoopSelectedLocalPrompt / smartLoopUpstreamPromptPreviewHeight /
// smartLoopPromptVisiting / smartLoopInputPromptItems /
// smartLoopSelectedInputPrompt / smartLoopPrompt / smartLoopTotalInputImages /
// smartLoopInputImages / smartLoopPreviewImages 已迁移到
// frontend/src/smart-canvas/loop-node.js（经典 <script>，同上）。
function outputImagesForNode(node, consume=false, ctx=smartLoopContext){
    if(node?.type === 'smart-group') return imagesForNode(node).filter(img => img?.url);
    if(node?.type === 'smart-loop') return smartLoopInputImages(node, ctx);
    return imagesForNode(node).filter(img => img?.url);
}
function selfReferenceImagesForNode(node, consume=false, ctx=smartLoopContext){
    return outputImagesForNode(node, consume, ctx).filter(img => img?.url);
}
function textForNode(node, ctx=smartLoopContext){
    if(!node) return '';
    if(node.type === 'smart-prompt') return node.text || '';
    if(node.type === 'smart-loop') return smartLoopPrompt(node, ctx);
    if(node.type === 'smart-group') return smartGroupMembers(node).map(member => textForNode(member, ctx)).filter(Boolean).join('\n\n');
    return '';
}
function promptInputNodesFor(node){
    return inputNodesFor(node).filter(input => input?.type === 'smart-prompt' || input?.type === 'smart-loop' || input?.type === 'smart-group');
}
function inputPromptTextFor(node, ctx=smartLoopContext){
    const directText = promptInputNodesFor(node).map(input => textForNode(input, ctx)).filter(Boolean);
    const relayText = Array.isArray(ctx?.relayPromptNodeIds)
        ? ctx.relayPromptNodeIds.map(id => nodes.find(n => n.id === id)).map(input => textForNode(input, ctx)).filter(Boolean)
        : [];
    // 不去重：两个内容相同的提示词节点都应各自贡献一份文本（仅过滤空文本）。
    return [...directText, ...relayText]
        .map(text => String(text || '').trim())
        .filter(Boolean)
        .join('\n\n');
}
// M2 拆分：upstreamLoopPromptNodesFor 已迁移到 frontend/src/smart-canvas/loop-node.js。
function inputImagesFor(node, consume=false, ctx=smartLoopContext){
    return inputNodesFor(node).flatMap(input => outputImagesForNode(input, consume, ctx));
}
function workflowInputImagesFor(node, consume=false, ctx=smartLoopContext){
    return workflowInputNodesFor(node).flatMap(input => outputImagesForNode(input, consume, ctx));
}
function isGeneratedResultNode(node){
    if(!isSmartImageNode(node)) return false;
    if(node.runPrompt || node.runModelPrompt || node.sourceNodeId || node.runAt || node.runFinishedAt || node.runElapsedMs) return true;
    if((node.runPromptRefs || []).length || (node.runInputRefs || []).length) return true;
    return (node.images || []).some(img => img?.generatedResult || img?.runPrompt || img?.runModelPrompt || img?.runAt);
}
function runInputRefsForNode(node){
    const refs = Array.isArray(node?.runInputRefs) ? node.runInputRefs.filter(ref => ref?.url) : [];
    if(!refs.length) return [];
    return refs.map((ref, index) => {
        const source = ref.nodeId ? nodes.find(n => n.id === ref.nodeId) : null;
        const sourceImage = source && Number.isFinite(Number(ref.imageIndex))
            ? imagesForNode(source)[Number(ref.imageIndex)]
            : null;
        const resolved = sourceImage?.url === ref.url ? sourceImage : null;
        return {
            ...(resolved || {}),
            ...ref,
            name:ref.name || resolved?.name || `图${index + 1}`,
            kind:ref.kind || resolved?.kind || mediaKindForItem(resolved || ref),
            nodeId:ref.nodeId || resolved?.nodeId || '',
            imageIndex:Number.isFinite(Number(ref.imageIndex)) ? Number(ref.imageIndex) : (Number.isFinite(Number(resolved?.imageIndex)) ? Number(resolved.imageIndex) : index)
        };
    }).filter(ref => ref.url);
}
function inputRefKey(img){
    if(!img?.url) return '';
    const nodeId = img.nodeId || '';
    const imageIndex = Number.isFinite(Number(img.imageIndex)) ? String(Number(img.imageIndex)) : '';
    if(nodeId && imageIndex !== '') return `${nodeId}|${imageIndex}`;
    return `url|${img.url}`;
}
function blockedInputRefKeys(node){
    return new Set(Array.isArray(node?.blockedInputRefs) ? node.blockedInputRefs.filter(Boolean) : []);
}
function isInputRefBlocked(node, img){
    if(!node || !img?.url) return false;
    return blockedInputRefKeys(node).has(inputRefKey(img));
}
function activeInputImagesFor(node, consume=false, ctx=smartLoopContext){
    return inputImagesFor(node, consume, ctx).filter(img => img?.url && !isInputRefBlocked(node, img));
}
function toggleInputRefBlocked(node, img){
    if(!node || !img?.url) return;
    const key = inputRefKey(img);
    if(!key) return;
    pushUndo();
    const blocked = blockedInputRefKeys(node);
    if(blocked.has(key)) blocked.delete(key);
    else blocked.add(key);
    node.blockedInputRefs = [...blocked];
    if(!node.blockedInputRefs.length) delete node.blockedInputRefs;
    renderInputThumbsRow(node);
    scheduleSave();
}
function defaultReferenceImagesFor(node, consume=false, ctx=smartLoopContext){
    if(!node) return [];
    if(isGeneratedResultNode(node)){
        const upstream = generatedUpstreamImagesFor(node, consume, ctx);
        if(upstream.length) return uniqueReferenceImages(upstream);
        const ownUrls = new Set((node.images || []).map(img => img?.url).filter(Boolean));
        const savedRunInputs = runInputRefsForNode(node)
            .filter(ref => ref?.url && ref.nodeId !== node.id && !ownUrls.has(ref.url));
        return savedRunInputs.length ? uniqueReferenceImages(savedRunInputs) : [];
    }
    const savedRunInputs = runInputRefsForNode(node);
    if(savedRunInputs.length) return uniqueReferenceImages(savedRunInputs);
    const upstream = defaultInputImagesFor(node, consume, ctx);
    const self = selfReferenceImagesForNode(node, consume, ctx).filter(img => img?.url);
    if(smartImageUsesWorkflowInput(node, ctx)) return uniqueReferenceImages(upstream);
    if(self.length) return uniqueReferenceImages(self);
    return uniqueReferenceImages(upstream);
}
function lineConnectionsFor(node){
    if(!node) return [];
    return (canvas?.connections || []).filter(conn => {
        if(!conn?.from || !conn?.to || conn.from === conn.to) return false;
        return ['input', 'flow'].includes(conn.kind || 'flow');
    });
}
function connectedLineNodeIds(node){
    if(!node) return [];
    const conns = lineConnectionsFor(node);
    const upstream = [];
    const downstream = [];
    const seenUp = new Set([node.id]);
    const seenDown = new Set([node.id]);
    const walkUp = id => {
        conns.filter(conn => conn.to === id).forEach(conn => {
            if(seenUp.has(conn.from)) return;
            seenUp.add(conn.from);
            walkUp(conn.from);
            upstream.push(conn.from);
        });
    };
    const walkDown = id => {
        conns.filter(conn => conn.from === id).forEach(conn => {
            if(seenDown.has(conn.to)) return;
            seenDown.add(conn.to);
            downstream.push(conn.to);
            walkDown(conn.to);
        });
    };
    walkUp(node.id);
    walkDown(node.id);
    return [...upstream, node.id, ...downstream];
}
function upstreamLineNodeIds(node){
    if(!node) return [];
    const conns = lineConnectionsFor(node);
    const upstream = [];
    const seen = new Set([node.id]);
    const walk = id => {
        conns.filter(conn => conn.to === id).forEach(conn => {
            if(seen.has(conn.from)) return;
            seen.add(conn.from);
            walk(conn.from);
            upstream.push(conn.from);
        });
    };
    walk(node.id);
    return [...upstream, node.id];
}
function lineImagesFor(node){
    const ids = upstreamLineNodeIds(node);
    return ids.flatMap(id => {
        const source = nodes.find(n => n.id === id);
        return imagesForNode(source);
    }).filter(img => img?.url);
}
function collectMentionedImagesFromPrompt(){
    const images = [];
    collectPromptParts().forEach(part => {
        if(part.type === 'image' && part.url) images.push(part);
    });
    return images;
}
function uniqueReferenceImages(images){
    const refs = [];
    const seen = new Set();
    (images || []).forEach((img, index) => {
        if(!img?.url || seen.has(img.url)) return;
        seen.add(img.url);
        refs.push({
            ...img,
            name:img.name || `图${refs.length + 1}`,
            role:img.role || `image_${refs.length + 1}`,
            imageIndex:Number.isFinite(Number(img.imageIndex)) ? Number(img.imageIndex) : index
        });
    });
    return refs;
}
function visibleReferenceImagesFor(node){
    const base = defaultReferenceImagesFor(node);
    return uniqueReferenceImages([...base, ...collectMentionedImagesFromPrompt()]);
}
function inputMentionCandidateImages(node){
    // @ 提及仅列出当前生成节点的直接输入，不能把整条上游链路的素材混入候选。
    const current = node ? inputImagesFor(node) : [];
    const seen = new Set();
    return current.filter(img => {
        if(!img?.url || seen.has(img.url)) return false;
        seen.add(img.url);
        return true;
    }).map((img, index) => ({
        ...img,
        thumbnail:mentionCandidateThumbnailUrl(img),
        mentionId:`mention_${index}_${Math.random().toString(36).slice(2, 7)}`,
        alias:img.name || `图片${index + 1}`
    }));
}
function mentionCandidateThumbnailUrl(item){
    const fileId = String(item?.file_id || fileIdFromUrl(item?.url || '') || '').trim();
    return fileId ? `/api/files/${encodeURIComponent(fileId)}/thumb` : thumbMediaUrl(item);
}
// 一个素材可注册到多个平台：收集所有「已通过」的 asset:// 地址，按平台映射。
function assetRegisteredUris(item){
    const regs = (item && item.registrations && typeof item.registrations === 'object') ? item.registrations : {};
    const out = {};
    Object.keys(regs).forEach(platform => {
        const reg = regs[platform];
        if(reg && reg.status === 'Active' && reg.asset_uri) out[platform] = reg.asset_uri;
    });
    return out;
}
function assetMentionCandidateImages(categoryId=''){
    const cats = assetCategories('image');
    const cat = cats.find(c => c.id === categoryId) || assetCategoryForMention();
    if(!cat) return [];
    mentionAssetCategoryId = cat.id;
    const items = (cat.items || []).map(item => ({...item, categoryName:cat.name || '', categoryId:cat.id}));
    const seen = new Set();
    return items.filter(item => {
        if(!item?.url || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    }).map((item, index) => ({
        url:item.url,
        file_id:item.file_id || fileIdFromUrl(item.url || ''),
        thumbnail:mentionCandidateThumbnailUrl(item),
        kind:assetMediaKind(item),
        name:item.name || `资产${index + 1}`,
        alias:item.name || `资产${index + 1}`,
        role:'asset',
        categoryName:item.categoryName || '',
        asset_uris:assetRegisteredUris(item),
        mentionId:`asset_${index}_${Math.random().toString(36).slice(2, 7)}`
    }));
}
function mentionCandidateImages(node, source=mentionSource){
    return source === 'asset' ? assetMentionCandidateImages(mentionAssetCategoryId) : inputMentionCandidateImages(node);
}
function referenceImagesFor(node){
    return defaultReferenceImagesFor(node);
}
function closeMentionPicker(){
    mentionPicker.classList.remove('open');
    mentionPicker.innerHTML = '';
}
function saveMentionRange(){
    const sel = window.getSelection();
    if(sel && sel.rangeCount && promptInput.contains(sel.anchorNode)){
        mentionRange = sel.getRangeAt(0).cloneRange();
    }
}
function textBeforeCaret(){
    const sel = window.getSelection();
    if(!sel || !sel.rangeCount || !promptInput.contains(sel.anchorNode)) return '';
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(promptInput);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return range.toString();
}
function renderMentionPicker(source){
    const node = selectedNode();
    const inputItems = inputMentionCandidateImages(node);
    const assetLibs = assetLibraries();
    if(!activeAssetLibraryId || !assetLibs.some(lib => lib.id === activeAssetLibraryId)) activeAssetLibraryId = assetLibrary.active_library_id || assetLibs[0]?.id || '';
    const libraryWithMentionAssets = assetLibs.find(lib => (lib.categories || []).some(cat => (cat.type || 'image') === 'image' && (cat.items || []).some(item => item?.url)));
    const assetCats = assetCategories('image');
    const hasInput = inputItems.length > 0;
    const hasAssets = Boolean(libraryWithMentionAssets);
    mentionSource = source || (hasInput ? 'input' : 'asset');
    if(mentionSource === 'asset' && hasAssets && !assetCats.some(cat => (cat.items || []).some(item => item?.url)) && libraryWithMentionAssets){
        activeAssetLibraryId = libraryWithMentionAssets.id;
        activeAssetCategoryId = '';
        mentionAssetCategoryId = '';
    }
    if(mentionSource === 'input' && !hasInput && hasAssets) mentionSource = 'asset';
    if(mentionSource === 'asset' && !hasAssets && hasInput) mentionSource = 'input';
    if(!hasInput && !hasAssets){ closeMentionPicker(); return; }
    const nextAssetCats = assetCategories('image');
    const currentAssetCat = assetCategoryForMention();
    const assetItems = assetMentionCandidateImages(currentAssetCat?.id || '');
    const candidates = (mentionSource === 'asset' ? assetItems : inputItems).slice(0, 36);
    const body = candidates.length ? `<div class="mention-option-grid">${candidates.map((img, i) => `
            <button class="mention-option" type="button" data-mention-index="${i}">
                ${mediaKindForItem(img) === 'video' ? videoPosterHtml(img) : `<img src="${escapeHtml(img.thumbnail || img.url)}" alt="">`}
                <span>${escapeHtml(img.alias)}</span>
            </button>
        `).join('')}</div>` : `<div class="mention-empty">${escapeHtml(tr('smart.mentionEmpty'))}</div>`;
    const librarySelect = (mentionSource === 'asset' && assetLibs.length)
        ? `<label class="mention-library-row"><span>${escapeHtml(tr('smart.assetLibrary'))}</span><select class="mention-library-select" data-mention-library>${assetLibs.map(lib => `<option value="${escapeHtml(lib.id)}" ${lib.id === activeAssetLibraryId ? 'selected' : ''}>${escapeHtml(lib.name || '资产库')}</option>`).join('')}</select></label>`
        : '';
    const folderChips = (mentionSource === 'asset' && nextAssetCats.length)
        ? nextAssetCats.map(cat => {
            const label = cat.name || tr('smart.assetFolder');
            return `<button class="mention-folder-chip ${cat.id === mentionAssetCategoryId ? 'active' : ''}" type="button" data-mention-folder="${escapeHtml(cat.id)}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
          }).join('')
        : '';
    mentionPicker.innerHTML = `
        <div class="mention-picker-shell">
            <div class="mention-source-tabs">
                <button class="mention-source-tab ${mentionSource === 'input' ? 'active' : ''}" type="button" data-mention-source="input" title="${escapeHtml(tr('smart.mentionInput'))}" ${hasInput ? '' : 'disabled'}>
                    <i data-lucide="image"></i><span>${escapeHtml(tr('smart.mentionInput'))}</span>
                </button>
                <button class="mention-source-tab ${mentionSource === 'asset' ? 'active' : ''}" type="button" data-mention-source="asset" title="${escapeHtml(tr('smart.mentionAssets'))}" ${hasAssets ? '' : 'disabled'}>
                    <i data-lucide="library"></i><span>${escapeHtml(tr('smart.mentionAssets'))}</span>
                </button>
            </div>
            ${librarySelect}
            <div class="mention-folder-chips ${folderChips ? '' : 'hidden'}">
                ${folderChips}
            </div>
            <div class="mention-content">
                ${body}
            </div>
        </div>
    `;
    mentionPicker._items = candidates;
    positionMentionPickerAtCaret();
    mentionPicker.classList.add('open');
    mentionPicker.querySelectorAll('[data-mention-source]').forEach(btn => {
        btn.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            if(btn.disabled) return;
            renderMentionPicker(btn.dataset.mentionSource);
        });
    });
    mentionPicker.querySelectorAll('[data-mention-library]').forEach(select => {
        select.addEventListener('mousedown', e => e.stopPropagation());
        select.addEventListener('change', e => {
            activeAssetLibraryId = e.target.value || '';
            activeAssetCategoryId = '';
            mentionAssetCategoryId = '';
            renderAssetLibrary();
            renderMentionPicker('asset');
        });
    });
    mentionPicker.querySelectorAll('[data-mention-folder]').forEach(btn => {
        btn.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            mentionAssetCategoryId = btn.dataset.mentionFolder || '';
            renderMentionPicker('asset');
        });
    });
    mentionPicker.querySelectorAll('[data-mention-index]').forEach(btn => {
        btn.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            insertMentionToken(mentionPicker._items[Number(btn.dataset.mentionIndex)]);
        });
    });
    refreshIcons();
}
function showMentionPicker(){
    const node = selectedNode();
    const hasInput = inputMentionCandidateImages(node).length > 0;
    mentionSource = hasInput ? 'input' : 'asset';
    renderMentionPicker(mentionSource);
}
function positionMentionPickerAtCaret(){
    const row = promptInput.closest('.prompt-row');
    const rowRect = row.getBoundingClientRect();
    let caretRect = null;
    const sel = window.getSelection();
    if(sel && sel.rangeCount){
        const range = sel.getRangeAt(0).cloneRange();
        caretRect = range.getClientRects()[0] || range.getBoundingClientRect();
    }
    const inputRect = promptInput.getBoundingClientRect();
    const pickerWidth = mentionPicker.offsetWidth || 340;
    const maxLeft = Math.max(4, rowRect.width - pickerWidth - 4);
    const rawLeft = (caretRect?.left || inputRect.left) - rowRect.left - 6;
    const rawTop = (caretRect?.bottom || inputRect.top + 24) - rowRect.top + 2;
    const left = Math.max(4, Math.min(rawLeft, maxLeft));
    const top = Math.max(2, rawTop);
    mentionPicker.style.left = `${left}px`;
    mentionPicker.style.top = `${top}px`;
}
function maybeOpenMentionPicker(){
    saveMentionRange();
    const before = textBeforeCaret();
    if(/@$/.test(before)) showMentionPicker();
    else closeMentionPicker();
}
function insertMentionToken(img){
    if(!img?.url) return;
    promptInput.focus();
    const sel = window.getSelection();
    if(mentionRange){
        sel.removeAllRanges();
        sel.addRange(mentionRange);
    }
    const range = sel.rangeCount ? sel.getRangeAt(0) : document.createRange();
    let removedAt = false;
    if(range.startContainer?.nodeType === Node.TEXT_NODE && range.startOffset > 0){
        const text = range.startContainer.textContent || '';
        if(text[range.startOffset - 1] === '@'){
            range.setStart(range.startContainer, range.startOffset - 1);
            range.deleteContents();
            removedAt = true;
        }
    }
    if(!removedAt) {
        const walker = document.createTreeWalker(promptInput, NodeFilter.SHOW_TEXT);
        let lastText = null;
        while(walker.nextNode()) lastText = walker.currentNode;
        if(lastText && /@$/.test(lastText.textContent || '')) {
            lastText.textContent = lastText.textContent.slice(0, -1);
            range.selectNodeContents(promptInput);
            range.collapse(false);
        }
    }
    const token = document.createElement('span');
    token.className = 'mention-image-token';
    token.contentEditable = 'false';
    token.dataset.url = img.url;
    token.dataset.name = img.alias || img.name || '图片';
    token.dataset.kind = mediaKindForItem(img);
    token.dataset.nodeId = img.nodeId || '';
    token.dataset.imageIndex = String(img.imageIndex ?? '');
    token.dataset.assetUris = JSON.stringify(img.asset_uris || {});
    token.innerHTML = token.dataset.kind === 'video'
        ? `${videoPosterHtml(img)}<span>${escapeHtml(token.dataset.name)}</span>`
        : `<img src="${escapeHtml(img.url)}" alt=""><span>${escapeHtml(token.dataset.name)}</span>`;
    range.insertNode(token);
    const spacer = document.createTextNode(' ');
    token.after(spacer);
    range.setStartAfter(spacer);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    closeMentionPicker();
    promptInput.focus();
    renderInputThumbsRow(selectedNode());
}
function collectPromptParts(){
    const parts = [];
    const walk = node => {
        if(node.nodeType === Node.TEXT_NODE){
            if(node.textContent) parts.push({type:'text', text:node.textContent});
            return;
        }
        if(node.nodeType !== Node.ELEMENT_NODE) return;
        if(node.classList?.contains('mention-image-token')){
            let assetUris = {};
            try { assetUris = JSON.parse(node.dataset.assetUris || '{}') || {}; } catch(e) { assetUris = {}; }
            parts.push({type:'image', url:node.dataset.url || '', name:node.dataset.name || '图片', kind:node.dataset.kind || '', nodeId:node.dataset.nodeId || '', imageIndex:Number(node.dataset.imageIndex || 0), asset_uris:assetUris});
            return;
        }
        if(node.tagName === 'BR') parts.push({type:'text', text:'\n'});
        node.childNodes.forEach(walk);
        if(node !== promptInput && ['DIV','P'].includes(node.tagName)) parts.push({type:'text', text:'\n'});
    };
    promptInput.childNodes.forEach(walk);
    return parts;
}
function originalPromptTextFromParts(parts){
    let text = '';
    (parts || []).forEach(part => {
        if(part.type === 'text'){
            text += part.text || '';
            return;
        }
        if(part.type === 'image') text += `@${part.name || '图片'}`;
    });
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function buildPromptRequest(node, overrideDefaultImages=null, consumeDefault=false, ctx=smartLoopContext){
    const promptEnabled = smartPromptInputEnabledForSettings(settings);
    const parts = promptEnabled ? collectPromptParts() : [];
    const originalPrompt = originalPromptTextFromParts(parts);
    const blockedRefs = blockedInputRefKeys(node);
    const hasOverrideImages = Array.isArray(overrideDefaultImages);
    const filteredDefaultImages = (hasOverrideImages ? overrideDefaultImages : defaultReferenceImagesFor(node, consumeDefault, ctx))
        .filter(img => !blockedRefs.has(inputRefKey(img)));
    const defaultRefs = uniqueReferenceImages(filteredDefaultImages);
    const refs = defaultRefs.map((img, index) => ({...img, role:`image_${index + 1}`}));
    let hasMentionToken = false;
    const refMap = new Map();
    refs.forEach((img, index) => refMap.set(img.url, index));
    // 先按 text / ref 分段收集正文，待 refs 全部确定后再按类型生成「图N / 视频N / 音频N」标签。
    const segments = [];
    parts.forEach(part => {
        if(part.type === 'text'){
            segments.push({type:'text', text:part.text});
            return;
        }
        if(!part.url) return;
        hasMentionToken = true;
        const mentionedKey = inputRefKey(part);
        if(blockedRefs.has(mentionedKey)){
            segments.push({type:'text', text:`@${part.name || '图片'}`});
            return;
        }
        if(!refMap.has(part.url)){
            refMap.set(part.url, refs.length);
            refs.push({file_id:part.file_id || '', url:part.url, name:part.name || `图${refs.length + 1}`, nodeId:part.nodeId, imageIndex:part.imageIndex, role:`image_${refs.length + 1}`, kind:part.kind || ''});
        }
        segments.push({type:'ref', url:part.url, name:part.name || ''});
    });
    // 编号必须与下游实际传给模型的顺序一致：图片走 imageRefsOnly、视频走 videoRefsOnly、音频走 audioRefsOnly，
    // 这里用相同的过滤函数按同样的顺序生成「图N / 视频N / 音频N」标签，保证正文里的编号与模型收到的第 N 个素材对应。
    const refLabels = new Map();
    imageRefsOnly(refs).forEach((ref, i) => refLabels.set(ref.url, `图${i + 1}`));
    videoRefsOnly(refs).forEach((ref, i) => refLabels.set(ref.url, `视频${i + 1}`));
    audioRefsOnly(refs).forEach((ref, i) => refLabels.set(ref.url, `音频${i + 1}`));
    let body = segments.map(seg => {
        if(seg.type === 'text') return seg.text;
        // 未被任何类型过滤命中的引用（不会真正传给模型），退化为其名称，避免用错误的编号误导模型。
        return refLabels.get(seg.url) || (seg.name ? `@${seg.name}` : '');
    }).join('');
    body = body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const inputPrompt = promptEnabled ? inputPromptTextFor(node, ctx).trim() : '';
    if(inputPrompt) body = [inputPrompt, body].filter(Boolean).join('\n\n');
    if(!body && settings.engine === 'runninghub' && promptEnabled){
        body = rhDefaultPromptSuggestion();
    }
    const displayPrompt = originalPrompt || body;
    // 提示词正文里已用「图N」指代参考图，参考图按顺序传给模型，无需再额外注入编号对照表与「用户需求：」前缀。
    return {
        prompt:body,
        displayPrompt,
        refs:refs.map((img, index) => ({file_id:img.file_id || '', url:img.url, name:img.name || `图${index + 1}`, role:`image_${index + 1}`, kind:img.kind || ''})),
        mentioned:hasMentionToken && refs.length > 0
    };
}
// M4 拆分：outgoingConnectionsFor / outgoingInputConnectionsFor 已迁移到
// frontend/src/smart-canvas/connections.js（经典 <script>，非 ES module，
// 原因同 M1/M2/M3）。
function nextOutputPositionForSource(sourceNode, pendingBox, options={}){
    const sourceRect = nodeRect(sourceNode);
    const x = (sourceRect.x || 0) + sourceRect.width + 80;
    const gap = 28;
    const outputs = outgoingConnectionsFor(sourceNode, ['input','flow'])
        .map(conn => nodes.find(n => n.id === conn.to))
        .filter(n => isSmartImageNode(n))
        .map(n => nodeRect(n))
        .filter(rect => Math.abs((rect.x || 0) - x) < Math.max(320, (pendingBox?.w || 260) + 120))
        .sort((a, b) => (a.y || 0) - (b.y || 0));
    if(!outputs.length) return {x, y:sourceRect.y || 0};
    let y = sourceRect.y || 0;
    for(const rect of outputs){
        const bottom = (rect.y || 0) + (rect.height || 0) + gap;
        if(y < bottom) y = bottom;
    }
    return {x, y};
}
function createPendingOutputFromSource(sourceNode, expectedCount, meta, options={}){
    const pendingBox = pendingBoxSize(expectedCount, {sourceNode, refs:options.refs || meta?.promptRefs || [], candidatePool:options.candidatePool});
    const pos = nextOutputPositionForSource(sourceNode, pendingBox);
    const output = {
        id:uid('smart'),
        type:'smart-image',
        x:pos.x,
        y:pos.y,
        title:'Image',
        images:[],
        pending:Math.max(1, Number(expectedCount) || 1),
        runStartedAt:nowMs(),
        runTimerHidden:false,
        w:pendingBox.w,
        h:pendingBox.h,
        scale:MEDIA_NODE_DEFAULT_SCALE,
        created_at:Date.now()
    };
    if(options.candidatePool) output.pendingCandidatePool = true;
    output._selectAfterRunId = options.selectOutput ? output.id : sourceNode.id;
    nodes.push(output);
    if(options.connectSource === false) addConnection(sourceNode.id, output.id, 'flow');
    else connectInputNode(sourceNode.id, output.id);
    attachRunMeta(output, options.stripInputMeta ? stripRunInputMeta(meta) : meta);
    selectedId = sourceNode.id;
    selectedImage = {nodeId:'', index:-1};
    return output;
}
function createParallelLoopOutputNode(templateNode, sourceNode, roundIndex, roundOffset=0){
    const rect = nodeRect(templateNode);
    const output = cloneSmartNode(templateNode, 0, 0);
    output.id = uid('smart');
    output.type = 'smart-image';
    output.x = (Number(templateNode.x) || 0) + (Number(rect.width) || 260) + 80;
    output.y = (Number(templateNode.y) || 0) + roundOffset * ((Number(rect.height) || 180) + 28);
    output.title = `Image ${roundIndex}`;
    output.images = [];
    output.pending = 0;
    output.running = false;
    output.created_at = Date.now();
    delete output.w;
    delete output.h;
    delete output.historyFor;
    delete output.isHistoryGroup;
    delete output.sourceNodeId;
    delete output.runAt;
    delete output.runPrompt;
    delete output.runModelPrompt;
    delete output.runPromptRefs;
    delete output.runInputRefs;
    nodes.push(output);
    connectInputNode(sourceNode.id, output.id);
    return output;
}
function loopOutputSlotsForRoot(rootNode){
    if(!rootNode?.id) return [];
    return downstreamNodesForId(rootNode.id)
        .filter(n => isSmartImageNode(n) && !isHistoryGroupNode(n))
        .sort((a, b) => {
            const ax = Number(a.x) || 0, bx = Number(b.x) || 0;
            if(ax !== bx) return ax - bx;
            return (Number(a.y) || 0) - (Number(b.y) || 0);
        });
}
function loopOutputSlotForRound(rootNode, loopNode, roundIndex, slotIndex){
    if(!rootNode?.id) return null;
    const candidates = loopOutputSlotsForRoot(rootNode)
        .filter(node => node.sourceNodeId === rootNode.id)
        .filter(node => !loopNode?.id || !node.loopSourceId || node.loopSourceId === loopNode.id);
    const untagged = candidates.filter(node => !Number.isFinite(Number(node.loopRoundIndex)) && !Number.isFinite(Number(node.loopSlotIndex)));
    return candidates.find(node => Number(node.loopRoundIndex) === Number(roundIndex))
        || candidates.find(node => Number(node.loopSlotIndex) === Number(slotIndex))
        || untagged[Math.max(0, Number(slotIndex) || 0)]
        || null;
}
function tagLoopOutputSlot(output, rootNode, loopNode, roundIndex, slotIndex){
    if(!output) return output;
    output.sourceNodeId = rootNode?.id || output.sourceNodeId || '';
    output.loopSourceId = loopNode?.id || output.loopSourceId || '';
    output.loopRootId = rootNode?.id || output.loopRootId || '';
    output.loopRoundIndex = Number(roundIndex) || 0;
    output.loopSlotIndex = Math.max(0, Number(slotIndex) || 0);
    return output;
}
function createLoopOutputSlot(rootNode, roundIndex, roundOffset=0, options={}){
    const rootRect = nodeRect(rootNode);
    const output = cloneSmartNode(rootNode, 0, 0);
    output.id = uid('smart');
    output.type = 'smart-image';
    output.x = (Number(rootNode.x) || 0) + (Number(rootRect.width) || 260) + 80;
    output.title = `Image ${roundIndex}`;
    output.images = [];
    output.pending = options.pending ? Math.max(1, Number(options.pending) || 1) : 0;
    output.running = Boolean(options.pending);
    output.queued = Boolean(options.queued);
    if(options.pending){
        output.runStartedAt = nowMs();
        output.runTimerHidden = false;
    }
    output.created_at = Date.now();
    delete output.w;
    delete output.h;
    delete output.historyFor;
    delete output.isHistoryGroup;
    delete output.sourceNodeId;
    delete output.runAt;
    delete output.runPrompt;
    delete output.runModelPrompt;
    delete output.runPromptRefs;
    delete output.runInputRefs;
    delete output.runFinishedAt;
    delete output.runElapsedMs;
    tagLoopOutputSlot(output, rootNode, options.loopNode || null, roundIndex, options.slotIndex ?? roundOffset);
    const slots = loopOutputSlotsForRoot(rootNode).map(nodeRect);
    let y = (Number(rootNode.y) || 0) + roundOffset * ((Number(rootRect.height) || 180) + 28);
    slots.forEach(rect => {
        if((Number(rect.x) || 0) >= (Number(output.x) || 0) - 24){
            y = Math.max(y, (Number(rect.y) || 0) + (Number(rect.height) || 0) + 28);
        }
    });
    output.y = y;
    nodes.push(output);
    addConnection(rootNode.id, output.id, 'flow');
        const runPath = smartCascadePathForCtx(options.ctx || options.runState);
        if(runPath?.states) runPath.states[`${rootNode.id}->${output.id}`] = 'wait';
    return output;
}
function extractCurrentImagesToSource(node, meta=null){
    const imgs = (node.images || []).slice();
    if(!imgs.length) return null;
    const r = nodeRect(node);
    const newX = (node.x || 0) - Math.max(280, r.width + 60);
    const source = {
        id: uid('smart'),
        type: 'smart-image',
        x: newX,
        y: node.y || 0,
        title: imgs.length > 1 ? 'Group' : 'Image',
        // 抽出到上游源节点的图片只保留"原始素材"语义：清空 runPrompt / runSettings /
        // sourceNodeId / runAt / promptDraftHtml / promptDraftText 等"生成"相关字段，
        // 避免上游图片继承下游输出的提示词信息
        images: imgs.map(img => stripImageGenerationMeta({...img})),
        created_at: Date.now()
    };
    if(Number.isFinite(Number(node.w))) source.w = node.w;
    if(Number.isFinite(Number(node.h))) source.h = node.h;
    if(Number.isFinite(Number(node.scale))) source.scale = node.scale;
    nodes.push(source);
    connectInputNode(source.id, node.id);
    node.images = [];
    delete node.w;
    delete node.h;
    return source;
}
function finalizePendingNode(pendingNode, urls, meta, kind='image'){
    if(!pendingNode) return;
    const imgs = normalizeOutputMediaItems(urls, kind, meta);
    const actualKind = mediaKindForUrls(imgs, kind);
    if(actualKind === 'image') addGeneratedCandidatesToNode(pendingNode, imgs, {main:'firstNew'});
    else {
        pendingNode.images = imgs;
        delete pendingNode.candidateImages;
        delete pendingNode.candidateIndex;
    }
    pendingNode.pending = 0;
    delete pendingNode.pendingCandidatePool;
    pendingNode.runFinishedAt = nowMs();
    if(!pendingNode.runStartedAt) pendingNode.runStartedAt = meta?.createdAt || pendingNode.runFinishedAt;
    pendingNode.runElapsedMs = Math.max(0, pendingNode.runFinishedAt - Number(pendingNode.runStartedAt || pendingNode.runFinishedAt));
    pendingNode.runTimerHidden = false;
    pendingNode.outputKind = actualKind;
    pendingNode.title = cascadeOutputTitle(actualKind, pendingNode.images.length);
    pendingNode.scale = mediaNodeDefaultScale(pendingNode);
    delete pendingNode.w;
    delete pendingNode.h;
    const metaTarget = pendingNode._runMetaTargetId ? nodes.find(n => n.id === pendingNode._runMetaTargetId) : pendingNode;
    if(metaTarget) attachRunMeta(metaTarget, meta);
    if(actualKind !== 'image') pendingNode.images = (pendingNode.images || []).map(img => stripImageGenerationMeta(img));
    selectedId = pendingNode._selectAfterRunId || pendingNode.id;
    delete pendingNode._runMetaTargetId;
    delete pendingNode._selectAfterRunId;
    delete pendingNode._rerunPreviousImages;
    if(activeComposerSubject?.id && selectedId === activeComposerSubject.id) lastComposerNodeId = `${selectedId}:node`;
    selectedImage = {nodeId:'', index:-1};
}
function restoreFromExtraction(node, extracted){
    if(!node || !extracted) return;
    node.images = extracted.images.slice();
    if(Number.isFinite(Number(extracted.w))) node.w = extracted.w;
    if(Number.isFinite(Number(extracted.h))) node.h = extracted.h;
    nodes = nodes.filter(n => n.id !== extracted.id);
    canvas.connections = (canvas.connections || []).filter(c => !(c.from === extracted.id && c.to === node.id));
    if(Array.isArray(node.inputNodeIds)){
        node.inputNodeIds = node.inputNodeIds.filter(id => id !== extracted.id);
    }
}
function restoreSourceVisualState(node, state){
    if(!node || !state) return;
    node.images = (state.images || []).map(img => ({...img}));
    node.title = state.title || (node.images.length > 1 ? 'Group' : 'Image');
    ['w','h','scale','outputKind'].forEach(key => {
        if(state[key] === undefined) delete node[key];
        else node[key] = state[key];
    });
}
function finishLoopTargetPreviewState(node){
    if(!node) return;
    node.pending = 0;
    node.running = false;
    node.queued = false;
    delete node.pendingTasks;
    delete node.pendingCandidatePool;
    node.runFinishedAt = nowMs();
    if(!node.runStartedAt) node.runStartedAt = node.runFinishedAt;
    node.runElapsedMs = Math.max(0, node.runFinishedAt - Number(node.runStartedAt || node.runFinishedAt));
    node.runTimerHidden = false;
    if((node.images || []).some(img => img?.url)){
        node.title = node.images.length > 1 ? 'Group' : 'Image';
        node.scale = node.images.length > 1 ? MEDIA_GROUP_DEFAULT_SCALE : MEDIA_NODE_DEFAULT_SCALE;
        node.outputKind = mediaKindForUrls(node.images || [], (node.images || []).some(isVideoMediaItem) ? 'video' : 'image');
        delete node.w;
        delete node.h;
    }
}
function refsForDirectLoopRound(loopNode, loopIndex, total){
    if(!loopNode?.imageInput) return [];
    return outputImagesForNode(loopNode, true, {index:loopIndex, total, nodeId:loopNode.id})
        .filter(ref => ref?.url)
        .map((ref, index) => ({
            ...ref,
            role:ref.role || `image_${index + 1}`,
            name:ref.name || trf('canvas.loopImageLabel', {n:loopIndex + index})
        }));
}
function showDirectLoopRoundPreview(loopNode, target, refs, loopIndex, total){
    if(!loopNode?.imageInput || !isSmartImageNode(target)) return false;
    const cleanRefs = (refs || []).filter(ref => ref?.url);
    if(!cleanRefs.length) return false;
    const preview = cleanRefs.map((ref, index) => stripImageGenerationMeta({
        url:ref.url || '',
        name:ref.name || trf('canvas.loopImageLabel', {n:loopIndex + index}),
        kind:ref.kind || (isVideoMediaItem(ref) ? 'video' : 'image'),
        nodeId:ref.nodeId || '',
        imageIndex:ref.imageIndex ?? '',
        loopInputPreview:true
    })).filter(ref => ref.url);
    if(!preview.length) return false;
    target.images = preview;
    target.pending = 0;
    target.running = true;
    delete target.pendingCandidatePool;
    target.runStartedAt = nowMs();
    delete target.runFinishedAt;
    delete target.runElapsedMs;
    target.runTimerHidden = false;
    target.runInputRefs = cleanRefs.map(ref => ({
        url:ref.url || '',
        name:ref.name || '',
        nodeId:ref.nodeId || '',
        imageIndex:ref.imageIndex ?? '',
        kind:ref.kind || ''
    })).filter(ref => ref.url);
    target.outputKind = mediaKindForUrls(preview, preview.some(isVideoMediaItem) ? 'video' : 'image');
    target.scale = preview.length > 1 ? MEDIA_GROUP_DEFAULT_SCALE : MEDIA_NODE_DEFAULT_SCALE;
    target.title = total > 1 ? `Image ${loopIndex}/${total}` : (target.title || 'Image');
    delete target.w;
    delete target.h;
    render();
    return true;
}
function directImageInputsFor(node){
    const upstream = smartImageUsesWorkflowInput(node) ? workflowInputNodesFor(node) : inputNodesFor(node);
    return upstream
        .filter(n => isSmartImageNode(n) && !isHistoryGroupNode(n) && (n.images || []).some(img => img?.url))
        .sort((a, b) => {
            const ax = Number(a.x) || 0, bx = Number(b.x) || 0;
            if(ax !== bx) return ax - bx;
            return (Number(a.y) || 0) - (Number(b.y) || 0);
        });
}
function directImageInputsForKinds(node, kinds=['input']){
    const upstream = upstreamNodesForKinds(node, kinds);
    return upstream
        .filter(n => isSmartImageNode(n) && !isHistoryGroupNode(n) && (n.images || []).some(img => img?.url))
        .sort((a, b) => {
            const ax = Number(a.x) || 0, bx = Number(b.x) || 0;
            if(ax !== bx) return ax - bx;
            return (Number(a.y) || 0) - (Number(b.y) || 0);
        });
}
function primaryImageInputFor(node, options={}){
    const direct = options.includeFlow
        ? directImageInputsForKinds(node, ['input', 'flow'])[0]
        : directImageInputsFor(node)[0];
    if(direct) return direct;
    const inputs = options.includeFlow ? upstreamNodesForKinds(node, ['input', 'flow']) : (smartImageUsesWorkflowInput(node) ? workflowInputNodesFor(node) : inputNodesFor(node));
    const loop = inputs.find(n => n?.type === 'smart-loop');
    if(loop?.imageInput){
        const upstream = upstreamNodesForKinds(loop, options.includeFlow ? ['input', 'flow'] : ['input']).find(n => isSmartImageNode(n) && (n.images || []).some(img => img?.url));
        if(upstream) return upstream;
    }
    return null;
}
function hasDownstreamImageNode(node){
    return downstreamNodesForId(node?.id).some(n => isSmartImageNode(n) && !isHistoryGroupNode(n));
}
function isGeneratedOutputForNode(sourceNode, targetNode){
    return Boolean(sourceNode?.id && targetNode?.sourceNodeId === sourceNode.id);
}
function downstreamWorkflowImageTargetsFor(node){
    return downstreamImageTargetsFor(node).filter(target => !isGeneratedOutputForNode(node, target));
}
function hasDownstreamWorkflowImageNode(node){
    return downstreamWorkflowImageTargetsFor(node).length > 0;
}
function smartImageChainTo(nodeId, options={}){
    const tail = nodes.find(n => n.id === nodeId);
    if(!isSmartImageNode(tail) || isHistoryGroupNode(tail)) return [];
    const chain = [];
    const seen = new Set();
    let cur = tail;
    while(cur && !seen.has(cur.id)){
        seen.add(cur.id);
        chain.unshift(cur);
        cur = primaryImageInputFor(cur, options);
    }
    return chain;
}
function upstreamNodesForId(nodeId, kinds=['input']){
    const result = [];
    const seen = new Set([nodeId]);
    const walk = id => {
        upstreamNodesForKinds(nodes.find(n => n.id === id), kinds).forEach(input => {
            if(seen.has(input.id)) return;
            seen.add(input.id);
            walk(input.id);
            result.push(input);
        });
    };
    walk(nodeId);
    return result;
}
function resolveSmartCascadeLoop(nodeId){
    const loops = upstreamNodesForId(nodeId, ['input', 'flow']).filter(n => n.type === 'smart-loop');
    if(!loops.length) return null;
    const loop = loops[loops.length - 1];
    return {node:loop, count:smartLoopCount(loop), mode:loop.mode === 'parallel' ? 'parallel' : 'serial'};
}
function relayLoopPromptNodesForEdge(sourceNode, targetNode){
    if(!sourceNode?.id || !targetNode?.id) return [];
    const directLoopIds = new Set(promptInputNodesFor(targetNode).filter(n => n?.type === 'smart-loop' && n.showPrompt).map(n => n.id));
    return inputNodesFor(sourceNode)
        .filter(n => n?.type === 'smart-loop' && n.showPrompt && !directLoopIds.has(n.id));
}
function relayLoopPromptNodesForTarget(node){
    if(!node?.id) return [];
    return inputNodesFor(node).filter(n => n?.type === 'smart-loop' && n.showPrompt);
}
function downstreamNodesForId(nodeId){
    const result = [];
    const seen = new Set([nodeId]);
    const walk = id => {
        (canvas?.connections || [])
            .filter(conn => conn.from === id && ['input','flow'].includes(conn.kind || 'flow'))
            .map(conn => nodes.find(n => n.id === conn.to))
            .filter(Boolean)
            .forEach(next => {
                if(seen.has(next.id)) return;
                seen.add(next.id);
                result.push(next);
                walk(next.id);
            });
    };
    walk(nodeId);
    return result;
}
function downstreamImageTargetsFor(node){
    if(!node?.id) return [];
    return (canvas?.connections || [])
        .filter(conn => conn.from === node.id && ['input','flow'].includes(conn.kind || 'flow'))
        .map(conn => nodes.find(n => n.id === conn.to))
        .filter(n => isSmartImageNode(n) && !isHistoryGroupNode(n))
        .sort((a, b) => {
            const ax = Number(a.x) || 0, bx = Number(b.x) || 0;
            if(ax !== bx) return ax - bx;
            return (Number(a.y) || 0) - (Number(b.y) || 0);
        });
}
function downstreamCascadeTargetsFor(node){
    if(!node?.id) return [];
    return (canvas?.connections || [])
        .filter(conn => conn.from === node.id && ['input','flow'].includes(conn.kind || 'flow'))
        .map(conn => nodes.find(n => n.id === conn.to))
        .filter(n => n && !isHistoryGroupNode(n) && (isSmartImageNode(n) || n.type === 'smart-loop'))
        .sort((a, b) => {
            const ax = Number(a.x) || 0, bx = Number(b.x) || 0;
            if(ax !== bx) return ax - bx;
            return (Number(a.y) || 0) - (Number(b.y) || 0);
        });
}
function directLoopRunTargets(loop){
    if(!loop?.id) return [];
    return downstreamImageTargetsFor(loop)
        .filter(node => !hasDownstreamWorkflowImageNode(node));
}
function smartCascadeGraphForTail(tail){
    const path = smartImageChainTo(tail?.id, {includeFlow:true}).filter(n => isSmartImageNode(n) && !isHistoryGroupNode(n));
    if(!path.length) return {root:null, path:[], edges:[], children:new Map()};
    const loop = resolveSmartCascadeLoop(tail?.id);
    const loopRoots = loop?.node?.id ? downstreamImageTargetsFor(loop.node) : [];
    const loopRoot = loopRoots.find(n => path.some(p => p.id === n.id));
    const lastAssetBeforeTail = path.slice(0, -1).findLastIndex(node => isSmartAssetImageNode(node));
    const pathRootIndex = lastAssetBeforeTail >= 0 ? lastAssetBeforeTail : 0;
    const pathRoot = path[pathRootIndex];
    const root = loopRoot || pathRoot;
    const tailId = tail?.id || '';
    const pathIds = new Set(path.slice(pathRootIndex).map(n => n.id));
    const edges = [];
    const children = new Map();
    const seenEdges = new Set();
    const visiting = new Set();
    const targetCanReachTail = target => {
        if(!target?.id) return false;
        if(target.id === tailId) return true;
        if(pathIds.has(target.id)) return true;
        return downstreamNodesForId(target.id).some(n => n.id === tailId || pathIds.has(n.id));
    };
    const walk = node => {
        if(!node?.id || visiting.has(node.id)) return;
        visiting.add(node.id);
        const targets = downstreamCascadeTargetsFor(node).filter(targetCanReachTail);
        children.set(node.id, targets);
        targets.forEach(target => {
            const key = `${node.id}->${target.id}`;
            if(!seenEdges.has(key)){
                seenEdges.add(key);
                edges.push({source:node, target, key});
            }
            walk(target);
        });
        visiting.delete(node.id);
    };
    walk(root);
    return {root, path, edges, children};
}
function cascadeTailForLoop(loopId){
    const loop = nodes.find(n => n.id === loopId && n.type === 'smart-loop');
    const directTargets = directLoopRunTargets(loop);
    if(directTargets.length) return directTargets[directTargets.length - 1];
    const directImages = downstreamImageTargetsFor({id:loopId});
    const directIds = new Set(directImages.map(n => n.id));
    const candidates = downstreamNodesForId(loopId)
        .filter(n => isSmartImageNode(n))
        .filter(n => !isHistoryGroupNode(n))
        .filter(n => canRunSmartCascade(n));
    if(!candidates.length) return null;
    return candidates.sort((a, b) => {
        const ad = directIds.has(a.id) ? 1 : 0;
        const bd = directIds.has(b.id) ? 1 : 0;
        if(ad !== bd) return ad - bd;
        const ax = Number(a.x) || 0, bx = Number(b.x) || 0;
        if(ax !== bx) return bx - ax;
        return (Number(b.y) || 0) - (Number(a.y) || 0);
    })[0];
}
function canRunSmartCascade(node){
    if(!isSmartImageNode(node) || isHistoryGroupNode(node)) return false;
    const graph = smartCascadeGraphForTail(node);
    const loop = resolveSmartCascadeLoop(node.id);
    if(loop && isDirectLoopTargetRun(loop, node, graph)) return true;
    if(hasDownstreamImageNode(node)) return false;
    if(graph.edges.length) return true;
    return Boolean(loop);
}
function isDirectLoopTargetRun(loop, tail, graph){
    if(!loop?.node?.id || !tail?.id) return false;
    if(graph?.root?.id !== tail.id) return false;
    if(hasDownstreamWorkflowImageNode(tail)) return false;
    return downstreamImageTargetsFor(loop.node).some(node => node.id === tail.id);
}
function cascadeConnectionKeys(){
    const keys = new Set();
    const addKey = (from, to) => {
        if(from && to) keys.add(`${from}->${to}`);
    };
    const activeLoopIds = new Set(smartCascadeRuns.keys());
    const loops = activeLoopIds.size
        ? nodes.filter(n => n?.type === 'smart-loop' && activeLoopIds.has(n.id))
        : nodes.filter(n => n?.type === 'smart-loop');
    loops.forEach(loop => {
        const tail = cascadeTailForLoop(loop.id);
        if(!tail) return;
        const graph = smartCascadeGraphForTail(tail);
        if(!graph.root) return;
        const chainIds = new Set(graph.path.map(n => n.id));
        graph.edges.forEach(edge => addKey(edge.source.id, edge.target.id));
        (canvas?.connections || []).forEach(conn => {
            if((conn.kind || 'flow') === 'history') return;
            const toNode = nodes.find(n => n.id === conn.to);
            if(conn.from === loop.id && (chainIds.has(conn.to) || downstreamNodesForId(conn.to).some(n => chainIds.has(n.id)))) addKey(conn.from, conn.to);
            if(toNode && chainIds.has(toNode.id)){
                inputNodesFor(toNode).filter(n => n?.type === 'smart-loop' && n.showPrompt).forEach(inputLoop => addKey(inputLoop.id, toNode.id));
            }
        });
    });
    return keys;
}
function coolRunButton(ms=2000){
    if(!runBtn) return 0;
    const token = ++runBtnCooldownToken;
    runBtn.disabled = true;
    setTimeout(() => {
        if(token === runBtnCooldownToken && !smartCascadeAnyRunning()) runBtn.disabled = false;
    }, ms);
    return token;
}
function coolNodeRunningState(node, ms=2000){
    if(!node) return 0;
    const token = ++smartRunStateToken;
    smartNodeRunTokens.set(node.id, token);
    node.running = true;
    setTimeout(() => {
        if(smartNodeRunTokens.get(node.id) !== token) return;
        smartNodeRunTokens.delete(node.id);
        const current = nodes.find(n => n.id === node.id);
        if(current){
            current.running = false;
            render();
        }
    }, ms);
    return token;
}
function clearNodeRunningState(node){
    if(!node) return;
    smartNodeRunTokens.delete(node.id);
    node.running = false;
}
function pushRightSideNodes(sourceNode, delta){
    const shift = Math.ceil(Number(delta) || 0);
    if(!sourceNode || shift <= 0) return;
    const sourceRight = (Number(sourceNode.x) || 0) + nodeRect(sourceNode).width - shift;
    const downstreamIds = new Set(downstreamNodesForId(sourceNode.id).map(n => n.id));
    nodes.forEach(n => {
        if(!n || n.id === sourceNode.id) return;
        const r = nodeRect(n);
        const shouldShift = downstreamIds.has(n.id) || (Number(r.x) > sourceRight && Math.abs((Number(r.y) || 0) - (Number(sourceNode.y) || 0)) < 520);
        if(shouldShift) n.x = (Number(n.x) || 0) + shift;
    });
}
function cascadeOutputTitle(kind='image', count=1){
    if(Number(count) > 1) return kind === 'video' ? 'Videos' : kind === 'audio' ? 'Audios' : kind === 'text' ? 'Texts' : 'Group';
    return kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : kind === 'text' ? 'Text' : kind === 'file' ? 'File' : 'Image';
}
function cleanHistoryImages(images=[]){
    const seen = new Set();
    return (images || [])
        .filter(img => img?.url)
        .map(img => stripImageGenerationMeta({...img}))
        .filter(img => {
            const key = `${img.kind || ''}|${img.url || ''}`;
            if(seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}
function uniqueGeneratedImages(images=[]){
    const seen = new Set();
    return (images || [])
        .filter(img => img?.url)
        .map(img => ({...img}))
        .filter(img => {
            const key = `${img.kind || ''}|${img.url || ''}`;
            if(seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}
function hasHistoryConnection(nodeId, groupId){
    return Boolean(nodeId && groupId && (canvas?.connections || []).some(conn => conn.from === nodeId && conn.to === groupId && (conn.kind || 'flow') === 'history'));
}
function demoteHistoryGroupNode(group){
    if(!group) return;
    delete group.historyFor;
    delete group.isHistoryGroup;
    if(group.title === '历史分组'){
        const count = (group.images || []).length;
        group.title = count > 1 ? 'Group' : (count ? 'Image' : tr('smart.createGenerationNode'));
    }
}
function historyGroupForNode(node){
    if(!node?.id) return null;
    let matched = null;
    nodes.forEach(n => {
        if(!isHistoryGroupNode(n) || n.historyFor !== node.id) return;
        if(hasHistoryConnection(node.id, n.id)){
            if(!matched) matched = n;
        } else {
            demoteHistoryGroupNode(n);
        }
    });
    return matched;
}
function positionHistoryGroupForNode(node, group){
    if(!node || !group) return;
    const r = nodeRect(node);
    const gr = nodeRect(group);
    if(!Number.isFinite(Number(group.x))) group.x = Math.round((Number(node.x) || 0) + Math.max(0, (r.width - gr.width) / 2));
    if(!Number.isFinite(Number(group.y))) group.y = Math.round((Number(node.y) || 0) + r.height + 56);
}
function ensureHistoryGroupForNode(node){
    if(!node?.id) return null;
    let group = historyGroupForNode(node);
    if(!group){
        const r = nodeRect(node);
        group = {
            id:uid('smart'),
            type:'smart-image',
            x:Math.round(Number(node.x || 0)),
            y:Math.round(Number(node.y || 0) + r.height + 56),
            title:'历史分组',
            images:[],
            historyFor:node.id,
            isHistoryGroup:true,
            scale:MEDIA_GROUP_DEFAULT_SCALE,
            created_at:Date.now()
        };
        nodes.push(group);
    }
    group.type = 'smart-image';
    group.title = '历史分组';
    group.isHistoryGroup = true;
    group.historyFor = node.id;
    if(!Number.isFinite(Number(group.scale))) group.scale = MEDIA_GROUP_DEFAULT_SCALE;
    addConnection(node.id, group.id, 'history');
    positionHistoryGroupForNode(node, group);
    return group;
}
function replaceOutputsToNodeWithHistory(node, additions, kind='image', meta=null, options={}){
    if(!node || !additions?.length) return [];
    const beforeRight = (Number(node.x) || 0) + nodeRect(node).width;
    const existing = kind === 'image' ? uniqueGeneratedImages(node.images || []) : cleanHistoryImages(node.images || []);
    const next = (kind === 'image' ? uniqueGeneratedImages(additions) : cleanHistoryImages(additions))
        .map(img => kind === 'image' && meta ? generatedImageWithRunMeta(img, meta) : img);
    if(!next.length) return [];
    if(kind === 'image'){
        if(existing.length) addGeneratedCandidatesToNode(node, existing, {main:'preserve'});
        addGeneratedCandidatesToNode(node, next, {main:'firstNew'});
    } else {
        const history = existing.length ? ensureHistoryGroupForNode(node) : historyGroupForNode(node);
        if(history){
            const archived = cleanHistoryImages([...existing, ...(history.images || [])]);
            history.images = archived;
            history.title = '历史分组';
            history.outputKind = kind;
            history.scale = MEDIA_GROUP_DEFAULT_SCALE;
            delete history.w;
            delete history.h;
        }
        node.images = next;
        delete node.candidateImages;
        delete node.candidateIndex;
    }
    node.pending = 0;
    node.running = false;
    delete node.pendingCandidatePool;
    delete node.pendingTasks;
    node.runFinishedAt = nowMs();
    if(!node.runStartedAt) node.runStartedAt = meta?.createdAt || node.runFinishedAt;
    node.runElapsedMs = Math.max(0, node.runFinishedAt - Number(node.runStartedAt || node.runFinishedAt));
    node.runTimerHidden = false;
    node.outputKind = kind;
    node.title = cascadeOutputTitle(kind, node.images.length);
    node.scale = kind === 'image' ? mediaNodeDefaultScale(node) : (node.images.length > 1 ? MEDIA_GROUP_DEFAULT_SCALE : MEDIA_NODE_DEFAULT_SCALE);
    delete node.w;
    delete node.h;
    if(meta) attachRunMeta(node, meta);
    const afterRight = (Number(node.x) || 0) + nodeRect(node).width;
    const skipShift = options.skipShift || Boolean(smartLoopContext?.nodeId);
    if(!skipShift) pushRightSideNodes(node, afterRight - beforeRight + 36);
    selectedImage = {nodeId:'', index:-1};
    return next;
}
function appendOutputsToNode(node, additions, kind='image', options={}){
    if(!node || !additions?.length) return [];
    const beforeRight = (Number(node.x) || 0) + nodeRect(node).width;
    const existing = (node.images || []).filter(img => img?.url).map(img => stripImageGenerationMeta(img));
    const next = additions.map(img => stripImageGenerationMeta({...img}));
    node.images = [...existing, ...next];
    node.pending = 0;
    node.running = false;
    delete node.pendingCandidatePool;
    node.runFinishedAt = nowMs();
    if(!node.runStartedAt) node.runStartedAt = node.runFinishedAt;
    node.runElapsedMs = Math.max(0, node.runFinishedAt - Number(node.runStartedAt || node.runFinishedAt));
    node.runTimerHidden = false;
    node.outputKind = kind;
    node.title = node.images.length > 1 ? (kind === 'video' ? 'Videos' : kind === 'audio' ? 'Audios' : kind === 'text' ? 'Texts' : 'Group') : (kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : kind === 'text' ? 'Text' : kind === 'file' ? 'File' : 'Image');
    delete node.w;
    delete node.h;
    const afterRight = (Number(node.x) || 0) + nodeRect(node).width;
    const skipShift = options.skipShift || Boolean(smartLoopContext?.nodeId);
    if(!skipShift) pushRightSideNodes(node, afterRight - beforeRight + 36);
    return next;
}
function syncCascadeRunButton(node=selectedNode()){
    if(!cascadeRunBtn) return;
    const visible = canRunSmartCascade(node);
    cascadeRunBtn.style.display = visible ? 'inline-flex' : 'none';
    const nodeLoopId = resolveSmartCascadeLoop(node?.id)?.node?.id || '';
    const loopRunState = smartCascadeRunForLoop(nodeLoopId);
    const runningForNode = Boolean(loopRunState);
    cascadeRunBtn.disabled = !visible || (!runningForNode && Boolean(node?.running)) || Boolean(loopRunState?.stopRequested);
    cascadeRunBtn.classList.toggle('is-stop', runningForNode);
    cascadeRunBtn.innerHTML = runningForNode
        ? `<i data-lucide="square"></i><span>${escapeHtml(smartCascadeStopText(Boolean(loopRunState?.stopRequested)))}</span>`
        : `<i data-lucide="workflow"></i><span>${escapeHtml(tr('smart.loopRunAll'))}</span>`;
    refreshIcons();
}
function loadNodePromptDraftToInput(node){
    if(node?.promptDraftHtml) {
        const hasToken = String(node.promptDraftHtml || '').includes('mention-image-token');
        promptInput.innerHTML = hasToken
            ? node.promptDraftHtml
            : (promptHtmlWithMentionTokens(node.runPrompt || node.promptDraftText || '', node.runPromptRefs || []) || node.promptDraftHtml);
    } else {
        const rebuilt = promptHtmlWithMentionTokens(node?.runPrompt || '', node?.runPromptRefs || []);
        if(rebuilt) promptInput.innerHTML = rebuilt;
        else setPromptText(node?.runPrompt || '');
    }
}
// M5 拆分（第2批）：createSmartComfyTask / waitSmartComfyTaskResult /
// runQueuedSmartComfyGenerate / comfyParamsFromWorkflowValues
// 已迁移到 frontend/src/smart-canvas/cascade-run.js（经典 <script>，同上）。
function buildPromptRequestForNode(node, defaultImages, ctx=smartLoopContext){
    const oldHtml = promptInput.innerHTML;
    loadNodePromptDraftToInput(node);
    try {
        return buildPromptRequest(node, defaultImages, false, ctx);
    } finally {
        promptInput.innerHTML = oldHtml;
    }
}
async function generateUrlsForCurrentSettings(node, prompt, refs, runSettings=settings){
    const activeSettings = runSettings || settings;
    if(activeSettings.engine === 'comfy') return generateComfyUrlsWithSettings(activeSettings, prompt, refs);
    if(isApiLikeEngine(activeSettings.engine) && activeSettings.apiKind === 'video'){
        return {urls:await runApiVideoGeneration(prompt, refs, activeSettings), kind:'video'};
    }
    if(isApiLikeEngine(activeSettings.engine)){
        const taskResult = await runApiGeneration(prompt, refs, activeSettings);
        const taskIds = Array.isArray(taskResult?.taskIds) ? taskResult.taskIds : [];
        if(taskIds.length){
            const settled = await Promise.all(taskIds.map(taskId => pollSmartCanvasTask(taskId)));
            const urls = settled.flatMap(result => resultMediaUrls(result?.images || result)).filter(Boolean);
            return {urls, kind:mediaKindForUrls(urls, 'image')};
        }
        const urls = resultMediaUrls(taskResult);
        return {urls, kind:mediaKindForUrls(urls, 'image')};
    }
    const urls = activeSettings.engine === 'runninghub'
        ? await runRunningHubGeneration(prompt, refs, activeSettings)
        : activeSettings.engine === 'modelscope'
            ? await runModelscopeGeneration(prompt, refs, activeSettings)
            : [];
    return {urls, kind:mediaKindForUrls(urls, 'image')};
}
async function generateComfyUrlsWithSettings(runSettings, prompt, refs){
    const allRefs = refs || [];
    const imageRefs = imageRefsOnly(allRefs);
    const mode = runSettings.comfyMode || 'text';
    if(mode === 'text'){
        const data = await runQueuedSmartComfyGenerate({prompt, width:Number(runSettings.width || 1024), height:Number(runSettings.height || 1024), workflow_json:'Z-Image.json', type:'zimage', client_id:smartClientId});
        const urls = resultMediaUrls(data);
        return {urls, kind:mediaKindForUrls(urls, 'image')};
    }
    if(mode === 'enhance'){
        if(!imageRefs.length) throw new Error(tr('smart.errEnhanceNeedRefs'));
        const inputName = await comfyNameForRef(imageRefs[0]);
        const data = await runQueuedSmartComfyGenerate({workflow_json:'Z-Image-Enhance.json', type:'enhance', params:{"15":{image:inputName},"204":{value:Number(runSettings.enhanceStrength ?? 0.5)}}, client_id:smartClientId});
        const urls = resultMediaUrls(data);
        return {urls, kind:mediaKindForUrls(urls, 'image')};
    }
    if(mode === 'edit'){
        if(!imageRefs.length) throw new Error(tr('smart.errEditNeedRefs'));
        const names = [];
        for(const ref of imageRefs.slice(0, 3)) names.push(await comfyNameForRef(ref));
        const data = await runQueuedSmartComfyGenerate({prompt, workflow_json:'Flux2-Klein.json', type:'klein', params:{"168":{text:prompt},"158":{noise_seed:Math.floor(Math.random()*1000000)},"278":{image:names[0] || ""},"270":{image:names[1] || ""},"292":{image:names[2] || ""},"313":{value:Boolean(names[1])},"314":{value:Boolean(names[2])}}, client_id:smartClientId});
        const urls = resultMediaUrls(data);
        return {urls, kind:mediaKindForUrls(urls, 'image')};
    }
    const workflowName = runSettings.comfyWorkflow || comfyWorkflows[0]?.name || '';
    if(!workflowName) throw new Error(tr('smart.errNeedWorkflow'));
    const wf = await fetch(`/api/workflows/${encodeURIComponent(workflowName)}`).then(async r => {
        if(!r.ok) throw await smartResponseError(r);
        return r.json();
    });
    const fields = wf.config?.fields || [];
    const values = {};
    fields.filter(f => comfyFieldKind(f) === 'prompt').forEach((field, index) => {
        values[field.id] = index === 0 ? prompt : (field.default ?? '');
    });
    const assignMediaFields = async (mediaFields, mediaRefs) => {
        for(let i = 0; i < mediaFields.length && i < mediaRefs.length; i++){
            values[mediaFields[i].id] = await comfyNameForRef(mediaRefs[i]);
        }
    };
    await assignMediaFields(fields.filter(f => comfyFieldKind(f) === 'image'), imageRefs);
    await assignMediaFields(fields.filter(f => comfyFieldKind(f) === 'video'), videoRefsOnly(allRefs));
    await assignMediaFields(fields.filter(f => comfyFieldKind(f) === 'audio'), audioRefsOnly(allRefs));
    fields.filter(f => comfyFieldKind(f) === 'setting').forEach(field => {
        if(comfyRandomEnabledField(field) && smartComfyRandomActiveFor(runSettings, field.id)){
            values[field.id] = smartComfyRandomValue(field);
        } else {
            values[field.id] = runSettings.comfyParams?.[field.id] ?? field.default;
        }
    });
    const result = await runQueuedSmartComfyGenerate({prompt, workflow_json:workflowName, params:comfyParamsFromWorkflowValues(wf.config || {fields:[]}, values), type:'workflow-custom', client_id:smartClientId});
    const urls = resultMediaUrls(result);
    const fallbackKind = result.videos?.length ? 'video' : result.audios?.length ? 'audio' : result.texts?.length ? 'text' : 'image';
    return {urls, kind:mediaKindForUrls(urls, fallbackKind)};
}
// M5 拆分（第3批）：runCascadeStepIntoNode / runLoopRoundIntoSlot /
// runClonedLoopChain / appendCascadeRefsToReceiver / cascadeRefsFromOutputs /
// smartCascadeStopText / runSmartCascade / runSmartCascadeFromLoop /
// runGeneration 已迁移到 frontend/src/smart-canvas/cascade-run.js
// （经典 <script>，非 ES module，原因同 M1-M4）。这是 M5 里体量最大、
// 嵌套最深的一批，单独逐行核对过字节级一致性。
async function runPromptLLMNode(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'smart-prompt') return;
    const task = ['llm', 'caption', 'expand'].includes(node.llmTask) ? node.llmTask : 'llm';
    const mediaRefs = promptNodeInputMediaForLLM(node);
    const images = imageRefsOnly(mediaRefs).map(img => img.url).filter(Boolean);
    const videos = videoRefsOnly(mediaRefs).map(video => video.url).filter(Boolean);
    if(task === 'caption' && !images.length){ toast(tr('smart.promptCaptionNeedImage')); return; }
    // 上游提示词节点的文本（支持提示词节点输入提示词节点，逻辑与生成节点一致）。
    const upstreamPrompt = inputPromptTextFor(node).trim();
    const ownText = (node.llmInstruction || node.text || '').trim();
    const captionInstruction = [upstreamPrompt, (node.llmInstruction || '').trim()].filter(Boolean).join('\n\n').trim();
    const message = task === 'caption'
        ? (captionInstruction || '请描述这张图片')
        : [upstreamPrompt, ownText].filter(Boolean).join('\n\n').trim();
    if(!message){ toast(tr('smart.promptLlmNeedText')); return; }
    node.running = true;
    render();
    try {
        const provider = resolveChatProviderId(node.llmProvider || '');
        const model = resolveChatModel(node.llmModel || '', provider);
        const systemPrompt = task === 'caption'
            ? smartRuleTemplateContent('caption', node.captionTemplateId, '请详细描述这张图片的内容。')
            : task === 'expand'
            ? smartRuleTemplateContent('expand', node.expandTemplateId, '')
            : '';
        const requestImages = task === 'expand' ? [] : images;
        const requestVideos = task === 'llm' ? videos : [];
        const result = await fetch('/api/canvas-llm', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                message,
                messages:[],
                images:requestImages,
                videos:requestVideos,
                model,
                provider,
                ms_model: provider === 'modelscope' ? model : '',
                system_prompt:systemPrompt
            })
        }).then(async r => {
            if(!r.ok) throw await smartResponseError(r);
            return r.json();
        });
        node.text = (result.text || '').trim();
        node.llmProvider = provider;
        node.llmModel = model;
        scheduleSave();
    } catch(e) {
        toast((e.message || tr('smart.promptLlmFailed')).slice(0, 160));
    } finally {
        node.running = false;
        render();
    }
}
// M5 拆分（第2批）：comfyFieldKind / runApiGeneration /
// submitRunningHubGeneration / pollRunningHubTask /
// runRunningHubGeneration / runApiVideoGeneration /
// runModelscopeGeneration / urlToBase64 / sleep / runComfyGeneration /
// runComfyText / runComfyEnhance / runComfyEdit / comfyNameForRef
// 已迁移到 frontend/src/smart-canvas/cascade-run.js（经典 <script>，
// 非 ES module，原因同 M1-M4）。
function smartPendingTasks(node){
    if(!node || !Array.isArray(node.pendingTasks)) return [];
    return node.pendingTasks.filter(task => task && task.taskId);
}
function isRunningHubPendingTask(task){
    const provider = String(task?.providerId || task?.provider || task?.engine || '').toLowerCase();
    if(provider !== 'runninghub') return false;
    // RunningHub 标准模型 API（如 GPT-Image2）走通用 /api/canvas-image-tasks 流程，
    // 只有 AI 应用引擎提交的任务才带 mode 标记，需要走 /api/runninghub/query 轮询。
    return task?.mode === 'app';
}
class JimengPendingSignal extends Error {
    constructor(info){
        const data = info || {};
        super(data.message || '即梦任务排队中，可继续等待或手动查询');
        this.jimengPending = true;
        this.submitId = data.submitId || data.submit_id || '';
        this.kind = data.kind || 'image';
        this.queueInfo = data.queueInfo || data.queue_info || {};
    }
}
class ImageTaskRecoverSignal extends Error {
    constructor(info){
        const data = info || {};
        super(data.message || '任务未丢失，可稍后手动查询结果');
        this.imageTaskRecover = true;
        this.taskId = data.taskId || data.task_id || '';
        this.recoverTaskId = data.recoverTaskId || data.upstream_task_id || data.task_id || '';
        this.providerId = data.providerId || data.provider_id || '';
        this.kind = data.kind || 'image';
    }
}
function extractUpstreamTaskId(text){
    const match = String(text || '').match(/(?:task_id|taskId|task id)\s*[=:：]\s*([A-Za-z0-9_.:-]+)/i);
    return match ? match[1] : '';
}
const activeJimengPolls = new Set();
const JIMENG_POLL_INTERVAL = 60000;
const JIMENG_POLL_MAX = 1440;
function jimengQueueText(queueInfo){
    const qi = queueInfo || {};
    const idx = qi.queue_idx;
    const len = qi.queue_length;
    if(idx != null && len != null) return `即梦云端排队中（第 ${idx}/${len} 位）`;
    return '即梦云端生成中';
}
function setNodeJimengPending(node, signal){
    if(!node || !signal || !signal.submitId) return;
    const prev = node.jimengPending && node.jimengPending.submitId === signal.submitId ? node.jimengPending : null;
    node.jimengPending = {
        submitId:signal.submitId,
        kind:signal.kind || (prev && prev.kind) || 'image',
        queueInfo:signal.queueInfo || (prev && prev.queueInfo) || {},
        message:signal.message || (prev && prev.message) || '',
        startedAt:(prev && prev.startedAt) || nowMs(),
        updatedAt:nowMs(),
        querying:prev ? prev.querying : false
    };
    node.running = false;
    node.pending = 0;
    delete node.pendingCandidatePool;
    delete node.pendingTasks;
    if(!node.runStartedAt) node.runStartedAt = node.jimengPending.startedAt;
    delete node.runFinishedAt;
    delete node.runElapsedMs;
    node.runTimerHidden = false;
    render();
    scheduleSave();
    startJimengPoll(node);
}
function handleJimengPendingSignal(node, e){
    if(!(e && e.jimengPending && e.submitId)) return false;
    setNodeJimengPending(node, e);
    toast((e.message || jimengQueueText(e.queueInfo)).slice(0, 160));
    return true;
}
function handleStorageQuotaSignal(e){
    if(!(e && e.storageQuotaExceeded)) return false;
    try {
        window.MediaForgeUpload?.showQuotaDialog?.({
            quota_bytes:e.quota_bytes,
            used_bytes:e.used_bytes,
            incoming_bytes:e.incoming_bytes,
            detail:e.message
        });
    } catch(_) {
        toast((e.message || '存储空间不足').slice(0, 160));
    }
    return true;
}
function finalizeJimengPending(node, urls, kind='image'){
    if(!node) return false;
    const ext = kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : kind === 'text' ? 'txt' : 'png';
    const additions = (urls || []).map((item, i) => {
        const url = typeof item === 'string' ? item : item?.url || '';
        const itemKind = (typeof item === 'object' && item.kind) || kind;
        return kind === 'image'
            ? generatedImageWithRunMeta({url, file_id:(typeof item === 'object' && item.file_id) || '', name:(typeof item === 'object' && item.name) || `output-${i + 1}.${ext}`, kind:itemKind, generatedResult:true}, imageRunMetaForNodeFallback(node))
            : stripImageGenerationMeta({url, file_id:(typeof item === 'object' && item.file_id) || '', name:(typeof item === 'object' && item.name) || `output-${i + 1}.${ext}`, kind:itemKind, generatedResult:true});
    }).filter(item => item.url);
    if(!additions.length) return false;
    delete node.jimengPending;
    replaceOutputsToNodeWithHistory(node, additions, kind, null, {skipShift:true});
    node.running = false;
    node.pending = 0;
    node.runFinishedAt = nowMs();
    if(!node.runStartedAt) node.runStartedAt = node.runFinishedAt;
    node.runElapsedMs = Math.max(0, node.runFinishedAt - Number(node.runStartedAt || node.runFinishedAt));
    node.runTimerHidden = false;
    render();
    scheduleSave();
    return true;
}
function applyJimengQueryResult(node, data){
    if(!node || !data) return false;
    if(data.status === 'succeeded'){
        const kind = data.kind || node.jimengPending?.kind || 'image';
        return finalizeJimengPending(node, data.urls || [], kind);
    }
    if(data.status === 'failed'){
        delete node.jimengPending;
        node.running = false;
        node.pending = 0;
        toast((data.error || '即梦任务失败').slice(0, 160));
        render();
        scheduleSave();
        return true;
    }
    if(node.jimengPending){
        node.jimengPending.queueInfo = data.queue_info || node.jimengPending.queueInfo || {};
        node.jimengPending.message = data.message || node.jimengPending.message || '';
        node.jimengPending.updatedAt = nowMs();
    }
    render();
    scheduleSave();
    return false;
}
async function fetchJimengQuery(submitId, kind){
    return fetch('/api/jimeng/query-media', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({submit_id:submitId, kind:kind || 'image'})
    }).then(async r => { if(!r.ok) throw await smartResponseError(r); return r.json(); });
}
async function queryJimengNow(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || !node.jimengPending || !node.jimengPending.submitId) return;
    if(node.jimengPending.querying) return;
    const submitId = node.jimengPending.submitId;
    const kind = node.jimengPending.kind || 'image';
    node.jimengPending.querying = true;
    render();
    try {
        const data = await fetchJimengQuery(submitId, kind);
        applyJimengQueryResult(node, data);
    } catch(e){
        toast((e.message || '查询失败').slice(0, 160));
    } finally {
        if(node.jimengPending) node.jimengPending.querying = false;
        render();
    }
}
function providerIdForSmartTask(node, task){
    return task?.providerId || node?.runSettings?.provider_id || settings.provider_id || 'comfly';
}
async function fetchImageTaskQuery(providerId, taskId){
    return fetch('/api/image-task-query', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({provider_id:providerId || 'comfly', task_id:taskId})
    }).then(async r => {
        if(!r.ok) throw new Error(await smartResponseErrorMessage(r, '查询失败'));
        return r.json();
    });
}
async function querySmartImageTaskNow(nodeId, localTaskId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node) return;
    const task = smartPendingTasks(node).find(item => item.taskId === localTaskId) || smartRecoverableImageTask(node);
    if(!task || task.querying) return;
    const recoverTaskId = task.recoverTaskId || extractUpstreamTaskId(task.error || '');
    if(!recoverTaskId){
        toast('没有任务 ID，无法查询');
        return;
    }
    task.querying = true;
    task.recoverTaskId = recoverTaskId;
    render();
    try {
        const data = await fetchImageTaskQuery(providerIdForSmartTask(node, task), recoverTaskId);
        if(data.status === 'succeeded'){
            task.failed = false;
            task.querying = false;
            finalizeSmartPendingTask(node, task.taskId, resultMediaUrls(data.images?.length ? data.images : data), task.kind || 'image');
            render();
            scheduleSave();
            return;
        }
        if(data.status === 'failed'){
            task.error = data.error || tr('smart.errRunFailed');
            toast(task.error.slice(0, 160));
        } else {
            task.error = data.message || '任务仍在生成中，请稍后再查询';
            toast(task.error);
        }
    } catch(e){
        task.error = e.message || '查询失败';
        toast(task.error.slice(0, 160));
    } finally {
        const latest = smartPendingTasks(node).find(item => item.taskId === localTaskId);
        if(latest) latest.querying = false;
        render();
        scheduleSave();
    }
}
function startJimengPoll(node){
    if(!node || !node.jimengPending || !node.jimengPending.submitId) return;
    const submitId = node.jimengPending.submitId;
    if(activeJimengPolls.has(submitId)) return;
    activeJimengPolls.add(submitId);
    const nodeId = node.id;
    (async () => {
        try {
            for(let i = 0; i < JIMENG_POLL_MAX; i++){
                await new Promise(resolve => setTimeout(resolve, JIMENG_POLL_INTERVAL));
                const cur = nodes.find(n => n.id === nodeId);
                if(!cur || !cur.jimengPending || cur.jimengPending.submitId !== submitId) return;
                if(cur.jimengPending.querying) continue;
                let data;
                try {
                    data = await fetchJimengQuery(submitId, cur.jimengPending.kind || 'image');
                } catch(err){ continue; }
                const done = applyJimengQueryResult(cur, data);
                if(done) return;
                const after = nodes.find(n => n.id === nodeId);
                if(!after || !after.jimengPending || after.jimengPending.submitId !== submitId) return;
            }
        } finally {
            activeJimengPolls.delete(submitId);
        }
    })();
}
function resumeJimengPendingNodes(){
    nodes.filter(n => n && n.jimengPending && n.jimengPending.submitId).forEach(n => {
        n.jimengPending.querying = false;
        startJimengPoll(n);
    });
}
async function pollSmartCanvasTask(taskId){
    if(!taskId) throw new Error(tr('smart.errRunFailed'));
    if(activeSmartTaskPolls.has(taskId)) return activeSmartTaskPolls.get(taskId);
    const promise = (async () => {
        for(let i = 0; i < 900; i++){
            await new Promise(resolve => setTimeout(resolve, 2000));
            const task = await fetch(`/api/canvas-image-tasks/${encodeURIComponent(taskId)}`).then(async r => {
                if(!r.ok) throw await smartResponseError(r);
                return r.json();
            });
            if(task.status === 'succeeded'){
                checkQuotaWarningFromResult(task);
                return task.result || {};
            }
            if(task.status === 'jimeng_pending') throw new JimengPendingSignal({submitId:task.submit_id, kind:task.kind, queueInfo:task.queue_info, message:task.message});
            if(task.status === 'failed'){
                if(task.error_code === 'storage_quota_exceeded' || task.status_code === 413) throw new StorageQuotaSignal(task);
                const recoverTaskId = task.upstream_task_id || extractUpstreamTaskId(task.error || '');
                if(recoverTaskId) throw new ImageTaskRecoverSignal({taskId, recoverTaskId, providerId:task.provider_id, kind:'image', message:task.error || tr('smart.errRunFailed')});
                throw new Error(task.error || tr('smart.errRunFailed'));
            }
        }
        throw new Error(tr('smart.errRunTimeout'));
    })();
    activeSmartTaskPolls.set(taskId, promise);
    try {
        return await promise;
    } finally {
        activeSmartTaskPolls.delete(taskId);
    }
}
async function pollSmartPendingTask(task){
    if(isRunningHubPendingTask(task)) return pollRunningHubTask(task.taskId);
    return pollSmartCanvasTask(task.taskId);
}
function finalizeSmartPendingTask(node, taskId, images, kind='image'){
    if(!node || !taskId) return;
    node.pendingTasks = smartPendingTasks(node).filter(task => task.taskId !== taskId);
    node.pending = Math.max(0, Number(node.pending || 0) - 1);
    const additions = normalizeOutputMediaItems(images, kind, imageRunMetaForNodeFallback(node));
    const actualKind = mediaKindForUrls(additions, kind);
    if(actualKind === 'image') {
        if(additions.length) addGeneratedCandidatesToNode(node, additions, {main:'firstNew'});
    }
    else {
        node.images = [...(node.images || []).map(img => stripImageGenerationMeta(img)), ...additions];
        delete node.candidateImages;
        delete node.candidateIndex;
    }
    if(additions.length) node.outputKind = kind;
    if(!node.pending && smartPendingTasks(node).length === 0){
        delete node.pendingTasks;
        delete node.pendingCandidatePool;
        node.runFinishedAt = nowMs();
        if(!node.runStartedAt) node.runStartedAt = node.runFinishedAt;
        node.runElapsedMs = Math.max(0, node.runFinishedAt - Number(node.runStartedAt || node.runFinishedAt));
        node.runTimerHidden = false;
        node.running = false;
        node.title = cascadeOutputTitle(actualKind, node.images.length);
        node.scale = mediaNodeDefaultScale(node);
        delete node.w;
        delete node.h;
        delete node._rerunPreviousImages;
    }
}
async function resumeSmartPendingNode(node){
    const tasks = smartPendingTasks(node);
    if(!node || !tasks.length) return;
    node.pending = Math.max(tasks.length, Number(node.pending || 0) || tasks.length);
    node.pendingCandidatePool = tasks.some(task => (task.kind || 'image') === 'image');
    node.running = false;
    render();
    const failures = [];
    await Promise.all(tasks.map(async task => {
        if(task.failed && task.recoverTaskId) return;
        try {
            const result = await pollSmartPendingTask(task);
            finalizeSmartPendingTask(node, task.taskId, resultMediaUrls(result?.images?.length ? result.images : result), task.kind || 'image');
            render();
            scheduleSave();
        } catch(e) {
            if(e && e.jimengPending && e.submitId){
                node.pendingTasks = smartPendingTasks(node).filter(item => item.taskId !== task.taskId);
                setNodeJimengPending(node, e);
                render();
                scheduleSave();
                return;
            }
            if(e && e.imageTaskRecover && e.recoverTaskId){
                task.failed = true;
                task.querying = false;
                task.recoverTaskId = e.recoverTaskId;
                task.providerId = e.providerId || task.providerId || providerIdForSmartTask(node, task);
                task.error = e.message || tr('smart.errRunFailed');
                node.running = false;
                node.pending = Math.max(1, smartPendingTasks(node).length);
                node.pendingCandidatePool = smartPendingTasks(node).some(item => (item.kind || 'image') === 'image');
                toast('任务未丢失，可稍后手动查询结果');
                render();
                scheduleSave();
                return;
            }
            node.pendingTasks = smartPendingTasks(node).filter(item => item.taskId !== task.taskId);
            node.pending = Math.max(0, Number(node.pending || 0) - 1);
            if(!node.pending && smartPendingTasks(node).length === 0){
                delete node.pendingTasks;
                delete node.pendingCandidatePool;
                node.running = false;
                if(!(node.images || []).length){
                    if(candidateCountForNode(node)) setNodeMainCandidate(node, Number(node.candidateIndex) || 0);
                    else {
                        delete node.w;
                        delete node.h;
                    }
                }
            }
            failures.push(e);
            if(!handleStorageQuotaSignal(e)) toast((e.message || tr('smart.errRunFailed')).slice(0, 160));
            render();
            scheduleSave();
        }
    }));
    if(failures.length && !(node.images || []).length && candidateCountForNode(node)) setNodeMainCandidate(node, Number(node.candidateIndex) || 0);
    if(failures.length && !(node.images || []).length){
        const quotaFailure = failures.find(e => e && e.storageQuotaExceeded);
        if(quotaFailure) throw quotaFailure;
        const messages = [...new Set(failures.map(e => (e?.message || String(e || '')).trim()).filter(Boolean))];
        throw new Error(messages.join('；') || tr('smart.errRunFailed'));
    }
}
function resumeSmartPendingTasks(){
    nodes.filter(node => smartPendingTasks(node).length).forEach(node => {
        resumeSmartPendingNode(node);
    });
}
function updateSelectionBox(event){
    if(!selectionState) return;
    const shellRect = shell.getBoundingClientRect();
    const sx = selectionState.startScreen.x, sy = selectionState.startScreen.y;
    const x = Math.min(sx, event.clientX), y = Math.min(sy, event.clientY);
    const currentWorld = screenToWorld(event);
    selectionState.currentWorld = currentWorld;
    selectionBox.style.display = 'block';
    selectionBox.style.left = `${x - shellRect.left}px`;
    selectionBox.style.top = `${y - shellRect.top}px`;
    selectionBox.style.width = `${Math.abs(event.clientX - sx)}px`;
    selectionBox.style.height = `${Math.abs(event.clientY - sy)}px`;
    selectedIds = nodesInSelectionBounds(selectionState.startWorld, currentWorld);
    selectedId = '';
    selectedImage = {nodeId:'', index:-1};
    syncSelectionUi();
    const boxLeft = x - shellRect.left;
    const boxRight = Math.max(sx, event.clientX) - shellRect.left;
    const boxTop = y - shellRect.top;
    positionSelectionActions(boxLeft, boxTop, boxRight, selectedIds.length);
}
function nodesInSelectionBounds(a, b){
    const minX = Math.min(a.x, b.x), minY = Math.min(a.y, b.y);
    const maxX = Math.max(a.x, b.x), maxY = Math.max(a.y, b.y);
    return nodes.filter(node => {
        const rect = nodeRect(node);
        return rect.x < maxX && rect.x + rect.width > minX && rect.y < maxY && rect.y + rect.height > minY;
    }).map(node => node.id);
}
function positionSelectionActions(left, top, right, selectedCount){
    if(!selectionActions) return;
    selectionActions.hidden = selectedCount < 2;
    if(selectionActions.hidden) return;
    const selectionCenter = (left + right) / 2;
    const actionLeft = Math.max(8, Math.min(shell.clientWidth - selectionActions.offsetWidth - 8, selectionCenter - selectionActions.offsetWidth / 2));
    const actionTop = Math.max(selectionActions.offsetHeight + 8, top - 8);
    selectionActions.style.left = `${Math.round(actionLeft)}px`;
    selectionActions.style.top = `${Math.round(actionTop)}px`;
    const saveButton = selectionActions.querySelector('[data-selection-action="save"]');
    if(saveButton) saveButton.disabled = !selectedAssetSaveItems().length;
    const groupButton = selectionActions.querySelector('[data-selection-action="group"]');
    if(groupButton) groupButton.disabled = !selectedIds.some(id => !isSmartGroupNode(nodes.find(node => node.id === id)));
    const downloadAllButton = selectionActions.querySelector('[data-selection-action="download-all"]');
    if(downloadAllButton){
        const hasDownloadable = selectedIds.some(id => {
            const node = nodes.find(n => n.id === id);
            if(!node) return false;
            const imgs = node.type === 'smart-group' ? imagesForNode(node) : (node.images || []);
            return imgs.some(img => img?.url && !isMaskImageItem(img));
        });
        downloadAllButton.disabled = !hasDownloadable;
    }
}
function updateSelectionActions(){
    if(!selectionBox || !selectionActions || selectionState) return;
    const selectedEls = selectedIds.map(id => world.querySelector(`.image-node[data-id="${CSS.escape(id)}"]`)).filter(Boolean);
    if(!selectedEls.length){
        selectionBox.style.display = 'none';
        selectionActions.hidden = true;
        return;
    }
    const shellRect = shell.getBoundingClientRect();
    const rects = selectedEls.map(el => el.getBoundingClientRect());
    const left = Math.min(...rects.map(rect => rect.left)) - shellRect.left;
    const top = Math.min(...rects.map(rect => rect.top)) - shellRect.top;
    const right = Math.max(...rects.map(rect => rect.right)) - shellRect.left;
    const bottom = Math.max(...rects.map(rect => rect.bottom)) - shellRect.top;
    selectionBox.style.display = 'block';
    selectionBox.style.left = `${Math.round(left)}px`;
    selectionBox.style.top = `${Math.round(top)}px`;
    selectionBox.style.width = `${Math.round(right - left)}px`;
    selectionBox.style.height = `${Math.round(bottom - top)}px`;
    positionSelectionActions(left, top, right, selectedEls.length);
    refreshIcons();
}
function finishSelection(event){
    if(!selectionState) return;
    selectedIds = nodesInSelectionBounds(selectionState.startWorld, selectionState.currentWorld || screenToWorld(event));
    selectedId = '';
    selectedImage = {nodeId:'', index:-1};
    selectionState = null;
    selectionJustFinished = true;
    render();
    updateSelectionActions();
    setTimeout(() => { selectionJustFinished = false; }, 0);
}
selectionActions?.addEventListener('mousedown', event => {
    event.preventDefault();
    event.stopPropagation();
});
selectionActions?.addEventListener('click', event => {
    const button = event.target.closest('[data-selection-action]');
    if(!button || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if(button.dataset.selectionAction === 'group') groupSelectedNodes();
    if(button.dataset.selectionAction === 'export') openSmartWorkflowTransferModal();
    if(button.dataset.selectionAction === 'download-all') void downloadSelectedNodesImages();
    if(button.dataset.selectionAction === 'save'){
        openSelectionAssetSaveModal().catch(err => showErrorModal(err.message || '保存到资产库失败', '保存到资产库失败'));
    }
});
// 框选状态下下载全部选中节点里的图片（打包 zip）。
async function downloadSelectedNodesImages(){
    const ids = selectedIds.length ? selectedIds.slice() : (selectedId ? [selectedId] : []);
    const items = [];
    const seen = new Set();
    ids.map(id => nodes.find(n => n.id === id)).filter(Boolean).forEach(node => {
        const imgs = (node.type === 'smart-group' ? imagesForNode(node) : (node.images || []));
        imgs.filter(img => img?.url && !isMaskImageItem(img)).forEach(img => {
            const key = img.file_id || img.url;
            if(seen.has(key)) return;
            seen.add(key);
            items.push(img);
        });
    });
    if(!items.length){ toast('选中的节点里没有可下载的图片'); return; }
    if(items.length === 1){ downloadPreviewFile(items[0]); return; }
    try {
        const filename = safeExportFileName('canvas-selection.zip', 'canvas-selection.zip');
        const response = await fetch('/api/canvas-assets/download', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                filename,
                urls:items.map(item => fileDownloadUrl(item) || item.url).filter(Boolean),
                items:items.map((item, index) => ({url:fileDownloadUrl(item) || item.url, name:downloadNameForMediaItem(item, `image-${String(index + 1).padStart(2, '0')}`)}))
            })
        });
        if(!response.ok) throw new Error((await response.text()) || '批量下载失败');
        const blob = await response.blob();
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1200);
    } catch(e) {
        toast((e.message || '批量下载失败').slice(0, 160));
    }
}
function groupSelectedNodes(){
    const ids = selectedIds.length ? selectedIds.slice() : (selectedId ? [selectedId] : []);
    const selected = ids.map(id => nodes.find(n => n.id === id)).filter(n => n && !isSmartGroupNode(n));
    if(selected.length < 1){ toast('请选择要放入分组的节点'); return; }
    pushUndo();
    const rects = selected.map(nodeRect);
    const minX = Math.min(...rects.map(r => r.x));
    const minY = Math.min(...rects.map(r => r.y));
    const maxX = Math.max(...rects.map(r => r.x + r.width));
    const maxY = Math.max(...rects.map(r => r.y + r.height));
    const group = {
        id:uid('group'),
        type:'smart-group',
        x:Math.round(minX - 18),
        y:Math.round(minY - 44),
        w:Math.max(340, Math.round(maxX - minX + 36)),
        h:Math.max(220, Math.round(maxY - minY + 72)),
        title:'智能分组',
        items:[],
        images:[],
        created_at:Date.now()
    };
    nodes.push(group);
    selected.forEach(node => addNodeToSmartGroup(group, node));
    arrangeSmartGroupMembers(group, {skipUndo:true});
    selectedIds = [];
    selectedId = group.id;
    selectedImage = {nodeId:'', index:-1};
    render();
    scheduleSave();
}
function ungroupNode(groupId){
    const group = nodes.find(n => n.id === groupId);
    if(isSmartGroupNode(group)){
        pushUndo();
        const memberIds = smartGroupMembers(group).map(m => m.id);
        const groupImages = (group.images || []).filter(img => img?.url);
        let created = [];
        if(groupImages.length){
            const layout = imageLayout(group.images || [], nodeScale(group), group);
            const pad = 16;
            const gap = 8;
            const cell = Math.max(28, Math.round(layout.thumb || 96));
            const cols = Math.max(1, layout.cols || 1);
            created = groupImages.map((img, index) => {
                const col = index % cols;
                const row = Math.floor(index / cols);
                const size = thumbDisplaySize(img, cell);
                const x = Math.round(Number(group.x || 0) + pad + col * (cell + gap) + Math.max(0, (cell - size.width) / 2));
                const y = Math.round(Number(group.y || 0) + pad + row * (cell + gap) + Math.max(0, (cell - size.height) / 2));
                const node = {id:uid('smart'), type:'smart-image', x, y, w:size.width, h:size.height, title:'Image', images:[stripImageGenerationMeta({...img})], scale:MEDIA_NODE_DEFAULT_SCALE, created_at:Date.now()};
                inheritNodeMetaFromImage(node);
                return node;
            });
        }
        nodes = nodes.filter(n => n.id !== groupId);
        nodes.push(...created);
        if(canvas) canvas.connections = (canvas.connections || []).filter(c => c.from !== groupId && c.to !== groupId);
        nodes.forEach(node => {
            if(Array.isArray(node.inputNodeIds)) node.inputNodeIds = node.inputNodeIds.filter(id => id !== groupId);
            if(isSmartGroupNode(node) && Array.isArray(node.items)) node.items = node.items.filter(id => id !== groupId);
        });
        selectedIds = [...created.map(n => n.id), ...memberIds].filter(id => nodes.some(n => n.id === id));
        selectedId = selectedIds.length === 1 ? selectedIds[0] : '';
        selectedImage = {nodeId:'', index:-1};
        render();
        scheduleSave();
        return true;
    }
    if(!group || !Array.isArray(group.images) || group.images.length < 2) return false;
    pushUndo();
    const layout = imageLayout(group.images || [], nodeScale(group), group);
    const pad = 16;
    const gap = 8;
    const cell = Math.max(28, Math.round(layout.thumb || 96));
    const created = (group.images || []).map((img, index) => {
        const col = index % Math.max(1, layout.cols || 1);
        const row = Math.floor(index / Math.max(1, layout.cols || 1));
        const size = thumbDisplaySize(img, cell);
        const x = Math.round(Number(group.x || 0) + pad + col * (cell + gap) + Math.max(0, (cell - size.width) / 2));
        const y = Math.round(Number(group.y || 0) + pad + row * (cell + gap) + Math.max(0, (cell - size.height) / 2));
        const node = {
            id:uid('smart'),
            type:'smart-image',
            x,
            y,
            w:size.width,
            h:size.height,
            title:'Image',
            images:[stripImageGenerationMeta({...img})],
            scale:MEDIA_NODE_DEFAULT_SCALE,
            created_at:Date.now()
        };
        inheritNodeMetaFromImage(node);
        return node;
    });
    nodes = nodes.filter(n => n.id !== groupId);
    nodes.push(...created);
    if(canvas) canvas.connections = (canvas.connections || []).filter(c => c.from !== groupId && c.to !== groupId);
    nodes.forEach(node => {
        if(Array.isArray(node.inputNodeIds)){
            node.inputNodeIds = node.inputNodeIds.filter(inputId => inputId !== groupId);
        }
    });
    selectedIds = created.map(node => node.id);
    selectedId = selectedIds.length === 1 ? selectedIds[0] : '';
    selectedImage = {nodeId:'', index:-1};
    render();
    scheduleSave();
    return true;
}
function mergeImageNodesIntoGroup(sourceId, targetId){
    const source = nodes.find(n => n.id === sourceId);
    const target = nodes.find(n => n.id === targetId);
    if(!source || !target || source.id === target.id) return false;
    if(!(source.images || []).length || !(target.images || []).length) return false;
    const sourceImages = (source.images || []).map(img => stripImageGenerationMeta({...img}));
    target.images = [...(target.images || []).map(img => stripImageGenerationMeta(img)), ...sourceImages];
    target.title = 'Group';
    if(!Number.isFinite(Number(target.scale)) || Number(target.scale) === MEDIA_NODE_DEFAULT_SCALE) target.scale = MEDIA_GROUP_DEFAULT_SCALE;
    delete target.w;
    delete target.h;
    canvas.connections = (canvas.connections || []).map(c => {
        if(c.from === source.id) return {...c, from:target.id};
        if(c.to === source.id) return {...c, to:target.id};
        return c;
    }).filter((c, index, arr) => c.from !== c.to && arr.findIndex(x => x.from === c.from && x.to === c.to && (x.kind || 'flow') === (c.kind || 'flow')) === index);
    nodes.forEach(node => {
        if(Array.isArray(node.inputNodeIds)){
            node.inputNodeIds = Array.from(new Set(node.inputNodeIds.map(id => id === source.id ? target.id : id).filter(id => id !== node.id)));
        }
    });
    nodes = nodes.filter(n => n.id !== source.id);
    selectedIds = [];
    selectedId = target.id;
    selectedImage = {nodeId:'', index:-1};
    return true;
}
function smartGroupTargetForDraggedNode(draggedNode){
    if(!draggedNode) return null;
    const r = nodeRect(draggedNode);
    const excluded = new Set([draggedNode.id, ...(dragState?.groupIds || [])]);
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const groups = nodes
        .filter(node => isSmartGroupNode(node) && !excluded.has(node.id))
        .map(group => ({group, rect:nodeRect(group)}))
        .filter(item => cx >= item.rect.x && cx <= item.rect.x + item.rect.width && cy >= item.rect.y && cy <= item.rect.y + item.rect.height);
    if(!groups.length) return null;
    groups.sort((a, b) => (nodes.indexOf(b.group) - nodes.indexOf(a.group)));
    return groups[0].group;
}
function addDraggedNodesToSmartGroup(draggedNodes, group){
    if(!isSmartGroupNode(group)) return false;
    const list = (draggedNodes || []).filter(n => n && n.id !== group.id);
    if(!list.length) return false;
    let added = false;
    list.forEach(n => {
        if(addNodeToSmartGroup(group, n)) added = true;
    });
    if(!added) return false;
    arrangeSmartGroupMembers(group, {skipUndo:true});
    selectedIds = [];
    const survivingSingle = list.length === 1 && nodes.some(n => n.id === list[0].id) ? list[0].id : '';
    selectedId = survivingSingle || group.id;
    selectedImage = {nodeId:'', index:-1};
    return true;
}
function closeCreateMenu(){
    createMenu?.classList.remove('open');
}
function openCreateMenu(event){
    if(!createMenu) return;
    createMenuPoint = screenToWorld(event);
    const w = 800;
    const h = 286;
    const left = Math.max(14, Math.min(window.innerWidth - w - 14, event.clientX + 8));
    const top = Math.max(14, Math.min(window.innerHeight - h - 14, event.clientY + 8));
    createMenu.style.left = `${left}px`;
    createMenu.style.top = `${top}px`;
    createMenu.classList.add('open');
    refreshIcons();
}
function createNodeFromMenu(type){
    const p = createMenuPoint || viewportCenter();
    closeCreateMenu();
    if(type === 'group') return createSmartGroupNode(p.x - 170, p.y - 110);
    if(type === 'prompt') return createPromptNode(p.x - 158, p.y - 97);
    if(type === 'loop') return createLoopNode(p.x - 135, p.y - 95);
    const node = createGenerationNodeByKind(type, p);
    scheduleSave();
    return node;
}
document.addEventListener('mousedown', event => {
    if(event.button !== 0 || !candidatePanelNodeId) return;
    if(isCandidatePanelInteractionTarget(event.target)) return;
    if(closeCandidatePanel()){
        setTimeout(() => {
            updateComposer();
            render();
        }, 0);
    }
}, true);
document.addEventListener('click', event => {
    if(event.button !== 0 || !expandedCandidateNodeIds.size || didPan) return;
    if(isExpandedCandidateGridInteractionTarget(event.target)) return;
    if(closeExpandedCandidateGrids()) setTimeout(() => render(), 0);
}, true);
function spacePanBlockedTarget(target){
    return Boolean(target?.closest?.('button,input,textarea,select,[contenteditable="true"],.composer,.smart-back,.asset-panel,.asset-toggle,.smart-log-toggle,.smart-shortcut-toggle,.smart-workflow-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.create-menu,.port-drop-menu,.smart-minimap,.selection-actions,.node-context-menu'));
}
shell.addEventListener('mousedown', e => {
    if(e.button !== 0 || !spacePanActive || spacePanBlockedTarget(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closeCreateMenu();
    closePortDropMenu();
    closeNodeContextMenu();
    selectionState = null;
    didPan = true;
    viewportInteractionActive = true;
    panState = {button:0, space:true, startX:e.clientX, startY:e.clientY, ox:viewport.x, oy:viewport.y};
    shell.classList.add('panning');
}, true);
shell.addEventListener('mousedown', e => {
    if(!zoomPreviewState) return;
    if(e.button !== 0) return;
    if(e.target.closest('.composer,.smart-back,.asset-panel,.asset-toggle,.smart-log-toggle,.smart-shortcut-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.create-menu,.smart-minimap')) return;
    e.preventDefault();
    e.stopPropagation();
}, true);
shell.addEventListener('click', e => {
    if(!zoomPreviewState) return;
    if(e.button !== 0) return;
    if(didPan){ e.preventDefault(); e.stopPropagation(); return; }
    if(e.target.closest('.composer,.smart-back,.asset-panel,.asset-toggle,.smart-log-toggle,.smart-shortcut-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.create-menu,.smart-minimap')) return;
    e.preventDefault();
    e.stopPropagation();
    const nodeEl = e.target.closest('.image-node');
    if(nodeEl?.dataset?.id) exitZoomPreviewToNode(nodeEl.dataset.id);
    else exitZoomPreview(screenToWorld(e));
}, true);
shell.addEventListener('pointerdown', e => {
    if(e.button !== 2) return;
    if(e.target.closest('.image-node,.composer,.smart-back,.asset-panel,.asset-toggle,.smart-log-toggle,.smart-shortcut-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.create-menu,.smart-minimap,.selection-actions')) return;
    closeCreateMenu();
    didPan = false;
    rightMouseDownPoint = {x:e.clientX, y:e.clientY};
    rightMouseDownViewport = {x:viewport.x, y:viewport.y};
    shell.setPointerCapture?.(e.pointerId);
});
shell.onmousedown = e => {
    if(zoomPreviewState && e.button === 0 && !e.target.closest('.composer,.smart-back,.asset-panel,.asset-toggle,.smart-log-toggle,.smart-shortcut-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.create-menu,.smart-minimap')) return;
    if(e.button === 2){
        if(e.target.closest('.image-node,.composer,.smart-back,.asset-panel,.asset-toggle,.smart-log-toggle,.smart-shortcut-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.create-menu,.smart-minimap,.selection-actions')) return;
        e.preventDefault();
        if(!rightMouseDownPoint){
            closeCreateMenu();
            didPan = false;
            rightMouseDownPoint = {x:e.clientX, y:e.clientY};
            rightMouseDownViewport = {x:viewport.x, y:viewport.y};
        }
        return;
    }
    // 中键按下时，即使指针落在图片节点上也允许拖拽画布；
    // 但落在底部输入栏/小地图/弹层等真正的交互 UI 上时不平移。
    if(e.button === 1 && !e.target.closest('.composer,.smart-back,.asset-panel,.asset-toggle,.smart-log-toggle,.smart-shortcut-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.create-menu,.smart-minimap,.selection-actions')){
        e.preventDefault();
        closeCreateMenu();
        didPan = false;
        panState = {button:e.button, startX:e.clientX, startY:e.clientY, ox:viewport.x, oy:viewport.y};
        shell.classList.add('panning');
        return;
    }
    if(e.target.closest('.image-node,.composer,.smart-back,.smart-log-toggle,.smart-shortcut-toggle,.log-modal,.shortcut-modal,.create-menu,.smart-minimap,.selection-actions')) return;
    closeCreateMenu();
    if(e.button === 0){
        e.preventDefault();
        didPan = false;
        selectionState = {startScreen:{x:e.clientX, y:e.clientY}, startWorld:screenToWorld(e)};
        updateSelectionBox(e);
        return;
    }
};
shell.oncontextmenu = e => {
    if(e.target.closest('.image-node,.composer,.smart-back,.asset-panel,.asset-toggle,.smart-log-toggle,.smart-shortcut-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.create-menu,.smart-minimap,.selection-actions')) return;
    if(document.getElementById('imageEditModal')?.classList.contains('open')) return;
    e.preventDefault();
    e.stopPropagation();
};
shell.ondblclick = e => {
    if(didPan || e.target.closest('.image-node,.composer,.smart-back,.smart-log-toggle,.smart-shortcut-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.create-menu')) return;
    if(document.getElementById('imageEditModal')?.classList.contains('open')) return;
    e.preventDefault();
    openCreateMenu(e);
};
shell.onclick = e => {
    if(selectionJustFinished) return;
    if(didPan || e.target.closest('.image-node,.composer,.smart-back,.smart-log-toggle,.smart-shortcut-toggle,.log-modal,.shortcut-modal,.image-edit-modal,.create-menu')) return;
    if(document.getElementById('imageEditModal')?.classList.contains('open')) return;
    closeCreateMenu();
    clearSelection();
    render();
};
minimap?.addEventListener('mousedown', e => {
    if(e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    viewportInteractionActive = true;
    smartMinimapDrag = true;
    centerViewportOnWorldPoint(minimapEventToWorld(e));
});
function updateCanvasRightPan(e){
    if(!rightMouseDownPoint || !rightMouseDownViewport || !(e.buttons & 2)) return false;
    const distance = Math.abs(e.clientX - rightMouseDownPoint.x) + Math.abs(e.clientY - rightMouseDownPoint.y);
    if(!panState && distance > 3){
        viewportInteractionActive = true;
        didPan = true;
        panState = {
            button:2,
            startX:rightMouseDownPoint.x,
            startY:rightMouseDownPoint.y,
            ox:rightMouseDownViewport.x,
            oy:rightMouseDownViewport.y
        };
        shell.classList.add('panning');
    }
    if(panState?.button !== 2) return false;
    viewport.x = panState.ox + e.clientX - panState.startX;
    viewport.y = panState.oy + e.clientY - panState.startY;
    applyViewport();
    return true;
}
shell.addEventListener('pointermove', e => {
    if(updateCanvasRightPan(e)) e.preventDefault();
});
// 说明：onmousemove/onmouseup 原本是 window.onxxx = e => {...} 形式的
// 匿名函数表达式赋值，不是命名函数声明——这导致 AST 符号扫描（比如
// get_document_symbols）完全看不到这两个函数，M7 阶段就发现了这个问题
// 但当时决定"物理搬移函数体"风险太高（涉及10+种互斥交互状态耦合，
// 调用了几乎每个已拆分模块的函数），先搁置。
// 现在只做最小的、行为不变的语法转换：把匿名箭头函数改成命名函数
// 声明 + 单独一行赋值，纯粹是为了让这两个函数对 AST 工具可见（比如
// 之后想找它们调用了哪些函数、被哪些变量捕获），不涉及任何逻辑改动、
// 不做物理文件搬移、不改变作用域规则（两个函数用到的所有变量还是
// 通过共享脚本作用域访问，跟改造前完全一样）。
function handleWindowMouseMove(e){
    lastMouseWorld = screenToWorld(e);
    if(updateCanvasRightPan(e)) return;
    if(smartMinimapDrag){
        e.preventDefault();
        centerViewportOnWorldPoint(minimapEventToWorld(e));
        return;
    }
    if(portDragState){
        e.preventDefault();
        const p = screenToWorld(e);
        portDragState.currentWorld = p;
        portDragState.moved = true;
        const hitEl = document.elementFromPoint(e.clientX, e.clientY);
        const portEl = hitEl?.closest?.('.node-port');
        const nodeEl = portEl?.closest?.('.image-node') || hitEl?.closest?.('.image-node');
        let targetId = '', targetPort = '';
        if(nodeEl && nodeEl.dataset.id && nodeEl.dataset.id !== portDragState.fromId){
            targetId = nodeEl.dataset.id;
            if(portEl){
                targetPort = portEl.dataset.port;
            } else {
                const rect = nodeEl.getBoundingClientRect();
                targetPort = (e.clientX - rect.left) < rect.width / 2 ? 'in' : 'out';
            }
            const compatible = (portDragState.fromPort === 'out' && targetPort === 'in') || (portDragState.fromPort === 'in' && targetPort === 'out');
            if(!compatible){ targetId = ''; targetPort = ''; }
        }
        portDragState.hoverTargetId = targetId;
        portDragState.hoverPort = targetPort;
        updatePortDragVisual();
        return;
    }
    if(promptResizeState){
        e.preventDefault();
        const dy = e.clientY - promptResizeState.startY;
        settings.promptH = Math.max(60, Math.min(380, promptResizeState.startH + dy));
        promptInput.style.setProperty('--prompt-h', `${settings.promptH}px`);
        persistActiveSmartSettings();
        return;
    }
    if(selectionState){
        e.preventDefault();
        updateSelectionBox(e);
        return;
    }
    if(previewCompareDrag){
        e.preventDefault();
        setPreviewComparePos(e.clientX);
        return;
    }
    if(panoramaState.drag){
        e.preventDefault();
        const dx = e.clientX - panoramaState.drag.clientX;
        const dy = e.clientY - panoramaState.drag.clientY;
        panoramaState.yaw = panoramaState.drag.yaw - dx * 0.18;
        panoramaState.pitch = Math.max(-85, Math.min(85, panoramaState.drag.pitch + dy * 0.18));
        document.getElementById('previewStage')?.classList.add('panning');
        return;
    }
    if(previewPanDrag){
        const stage = document.getElementById('previewStage');
        previewPan = {
            x:previewPanDrag.startX + (e.clientX - previewPanDrag.clientX),
            y:previewPanDrag.startY + (e.clientY - previewPanDrag.clientY)
        };
        stage?.classList.add('panning');
        applyPreviewTransform();
        return;
    }
    if(imageEditPanDrag){
        const stage = document.getElementById('imageEditStage');
        if(stage){
            stage.scrollLeft = imageEditPanDrag.scrollLeft - (e.clientX - imageEditPanDrag.clientX);
            stage.scrollTop = imageEditPanDrag.scrollTop - (e.clientY - imageEditPanDrag.clientY);
        }
        return;
    }
    if(cropDrag && cropState){
        const dx = e.clientX - cropDrag.sx;
        const dy = e.clientY - cropDrag.sy;
        if(cropDrag.mode === 'move'){
            cropState.x = cropDrag.start.x + dx;
            cropState.y = cropDrag.start.y + dy;
        } else if(cropDrag.mode === 'image'){
            cropState.x = cropDrag.start.x + dx;
            cropState.y = cropDrag.start.y + dy;
        } else if(String(cropDrag.mode || '').startsWith('outpaint-')){
            resizeOutpaintFromDrag(dx, dy);
        } else {
            cropState.w = cropDrag.start.w + dx;
            cropState.h = cropDrag.start.h + dy;
        }
        clampCrop();
        renderCropBox();
        return;
    }
    if(thumbDragState){
        const dx = e.clientX - thumbDragState.startX;
        const dy = e.clientY - thumbDragState.startY;
        const source = nodes.find(n => n.id === thumbDragState.nodeId);
        if(!thumbDragState.detached && Math.abs(dx) + Math.abs(dy) > 6){
            if(source && (source.images || []).length > 1){
                const img = source.images[thumbDragState.imgIndex];
                if(img){
                    commitPendingUndo();
                    undoSuppressed = true;
                    applyNodeMetaToImage(img, source);
                    source.images.splice(thumbDragState.imgIndex, 1);
                    if(source.images.length <= 1){
                        source.title = 'Image';
                        delete source.w; delete source.h;
                        inheritNodeMetaFromImage(source);
                    }
                    const point = screenToWorld(e);
                    selectedId = '';
                    selectedImage = {nodeId:'', index:-1};
                    const newNode = createImageNodeAt(point, [img], {type:'smart-asset-image', select:false, skipUndo:true});
                    undoSuppressed = false;
                    dragState = {id:newNode.id, startX:e.clientX, startY:e.clientY, ox:newNode.x, oy:newNode.y, thumbDetached:true};
                    thumbDragState.detached = true;
                    render();
                }
            }
        }
        if(thumbDragState.detached) thumbDragState = null;
        else return;
    }
    if(panState){
        const dx = e.clientX - panState.startX;
        const dy = e.clientY - panState.startY;
        if(Math.abs(dx) + Math.abs(dy) > 3) didPan = true;
        viewport.x = panState.ox + dx;
        viewport.y = panState.oy + dy;
        applyViewport();
        return;
    }
    if(!dragState) return;
    const node = nodes.find(n => n.id === dragState.id);
    if(!node) return;
    const moveDx = (e.clientX - dragState.startX) / viewport.scale;
    const moveDy = (e.clientY - dragState.startY) / viewport.scale;
    (dragState.group || [{id:dragState.id, ox:dragState.ox, oy:dragState.oy}]).forEach(item => {
        const n = nodes.find(x => x.id === item.id);
        if(!n) return;
        n.x = item.ox + moveDx;
        n.y = item.oy + moveDy;
    });
    if(assetLibraryOpen){
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        if(hit && assetPanel?.contains(hit)){
            setAssetDragOver(true);
            clearDropHighlight();
            setAssetDragOver(true);
            return;
        }
        setAssetDragOver(false);
    }
    const draggedRect = nodeRect(node);
    const rawTarget = (dragState.ctrlGroup || ['smart-image','smart-prompt','smart-loop','smart-group'].includes(node.type))
        ? (['smart-prompt','smart-loop'].includes(node.type)
            ? dragConnectTargetFor(node, screenToWorld(e))
            : rectOverlapNode(node.id, draggedRect.x, draggedRect.y, draggedRect.width, draggedRect.height, dragState.groupIds))
        : null;
    const target = rawTarget;
    setDropHighlight(target?.id || '');
    moveNodeElementsDuringDrag();
    updateLoopInsertPreview();
    if(target) setDropHighlight(target.id);
}
window.onmousemove = handleWindowMouseMove;
function finishCanvasRightClick(e){
    if(e.button !== 2 || !rightMouseDownPoint) return;
    const moved = panState?.button === 2;
    const contextEvent = {clientX:e.clientX, clientY:e.clientY, target:e.target};
    rightMouseDownPoint = null;
    rightMouseDownViewport = null;
    if(!moved && !e.ctrlKey && !e.metaKey){
        setTimeout(() => openCanvasContextMenu(contextEvent), 0);
    }
}
function cancelCanvasRightClick(){
    rightMouseDownPoint = null;
    rightMouseDownViewport = null;
    if(panState?.button === 2){
        panState = null;
        shell.classList.remove('panning');
        flushDeferredViewportRendering();
        setTimeout(() => { didPan = false; }, 0);
    }
}
window.addEventListener('pointerup', finishCanvasRightClick, true);
window.addEventListener('pointercancel', cancelCanvasRightClick, true);
function handleWindowMouseUp(e){
    finishCanvasRightClick(e);
    document.body.classList.remove('smart-node-drag');
    if(portDragState){
        const drag = portDragState;
        portDragState = null;
        shell.classList.remove('port-dragging');
        handlePortDrop(drag, e);
        return;
    }
    if(promptResizeState){ promptResizeState = null; scheduleSave(); }
    if(selectionState) finishSelection(e);
    if(previewCompareDrag) previewCompareDrag = false;
    if(panoramaState.drag){
        panoramaState.drag = null;
        document.getElementById('previewStage')?.classList.remove('panning');
    }
    if(previewPanDrag){
        previewPanDrag = null;
        document.getElementById('previewStage')?.classList.remove('panning');
    }
    if(imageEditPanDrag) imageEditPanDrag = null;
    if(cropDrag){
        document.getElementById('cropCanvas')?.classList.remove('dragging-image');
        cropDrag = null;
    }
    if(thumbDragState){
        if(!thumbDragState.detached) discardPendingUndo();
        thumbDragState = null;
    }
    if(panState) {
        panState = null;
        shell.classList.remove('panning');
        flushDeferredViewportRendering();
        scheduleSave(900);
        setTimeout(() => { didPan = false; }, 0);
    }
    if(smartMinimapDrag){
        smartMinimapDrag = false;
        flushDeferredViewportRendering();
    }
    if(dragState){
        const draggedNode = nodes.find(n => n.id === dragState.id);
        let stateChanged = false;
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        const droppedOnAssetPanel = assetLibraryOpen && hit && assetPanel?.contains(hit);
        if(droppedOnAssetPanel && draggedNode && (draggedNode.images || []).length){
            const imagesToSave = (draggedNode.images || []).filter(img => img?.file_id);
            imagesToSave.forEach(img => { void addFileToAssetLibrary(img.file_id, img.name || draggedNode.title || 'image'); });
            (dragState.group || [{id:dragState.id, ox:dragState.ox, oy:dragState.oy}]).forEach(item => {
                const n = nodes.find(x => x.id === item.id);
                if(n){ n.x = item.ox; n.y = item.oy; }
            });
            setAssetDragOver(false);
            discardPendingUndo();
            clearDropHighlight();
            dragState = null;
            document.body.classList.remove('smart-node-drag');
            render();
            scheduleSave();
            return;
        }
        const autoTarget = draggedNode ? dragConnectTargetFor(draggedNode, screenToWorld(e)) : null;
        const insertHit = draggedNode?.type === 'smart-loop' && dragState.ctrlGroup && (dragState.group || []).length <= 1
            ? insertionConnectionForNode(draggedNode)
            : null;
        const draggedNodes = (dragState.group || []).map(item => nodes.find(n => n.id === item.id)).filter(Boolean);
        const smartGroupTarget = draggedNode ? smartGroupTargetForDraggedNode(draggedNode) : null;
        if(
            insertHit &&
            insertLoopNodeIntoConnection(draggedNode, insertHit)
        ){
            stateChanged = true;
            render();
        } else if(
            smartGroupTarget &&
            addDraggedNodesToSmartGroup(draggedNodes.length ? draggedNodes : [draggedNode], smartGroupTarget)
        ){
            stateChanged = true;
            render();
        } else if(
            draggedNode &&
            autoTarget &&
            !dragState.ctrlGroup &&
            (dragState.group || []).length <= 1 &&
            canAutoConnectDraggedNode(draggedNode, autoTarget) &&
            connectInputNode(draggedNode.id, autoTarget.id)
        ){
            stateChanged = true;
            restoreDraggedNodePosition();
            if(selectedId === draggedNode.id) selectedId = '';
            render();
        } else if(draggedNode && (draggedNode.images || []).length && (dragState.ctrlGroup || (dragState.group || []).length <= 1)){
            const r = nodeRect(draggedNode);
            const target = rectOverlapNode(draggedNode.id, r.x, r.y, r.width, r.height, dragState.groupIds);
            if(target && (target.images || []).length && (dragState.ctrlGroup || (target.images || []).length > 1)){
                stateChanged = true;
                mergeImageNodesIntoGroup(draggedNode.id, target.id);
                render();
            } else if(target && !dragState.ctrlGroup && (dragState.group || []).length <= 1){
                stateChanged = true;
                connectInputNode(draggedNode.id, target.id);
                if(!dragState.thumbDetached) restoreDraggedNodePosition();
                if(selectedId === draggedNode.id) selectedId = '';
                render();
            } else if((dragState.group || []).some(item => {
                const n = nodes.find(x => x.id === item.id);
                return n && (Math.abs((Number(n.x) || 0) - item.ox) > 1 || Math.abs((Number(n.y) || 0) - item.oy) > 1);
            })){
                stateChanged = true;
            }
        } else if((dragState.group || []).some(item => {
            const n = nodes.find(x => x.id === item.id);
            return n && (Math.abs((Number(n.x) || 0) - item.ox) > 1 || Math.abs((Number(n.y) || 0) - item.oy) > 1);
        }) || (draggedNode && (Math.abs((draggedNode.x || 0) - dragState.ox) > 1 || Math.abs((draggedNode.y || 0) - dragState.oy) > 1))){
            stateChanged = true;
        }
        if(dragState.thumbDetached) stateChanged = true;
        const thumbDetached = Boolean(dragState.thumbDetached);
        if(stateChanged) commitPendingUndo();
        else discardPendingUndo();
        if(stateChanged || thumbDetached) suppressNodeClickUntil = Date.now() + 180;
        clearDropHighlight();
        loopInsertPreview = null;
        dragState = null;
        if(stateChanged || thumbDetached) scheduleSave();
        refreshConnectionLayer();
    }
}
window.onmouseup = handleWindowMouseUp;
shell.addEventListener('wheel', e => {
    if(isBootLoadingActive()){
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    if(e.target.closest('.composer,.smart-back,.image-edit-modal,.asset-panel,.asset-toggle,.smart-log-toggle,.smart-shortcut-toggle,.log-modal,.shortcut-modal')) return;
    e.preventDefault();
    viewportInteractionActive = true;
    const rect = shell.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = {x:(sx - viewport.x) / viewport.scale, y:(sy - viewport.y) / viewport.scale};
    const factor = Math.exp(-e.deltaY * 0.001);
    viewport.scale = safeScale(viewport.scale * factor);
    viewport.x = sx - before.x * viewport.scale;
    viewport.y = sy - before.y * viewport.scale;
    applyViewport();
    clearTimeout(viewportInteractionReleaseTimer);
    viewportInteractionReleaseTimer = setTimeout(() => {
        viewportInteractionReleaseTimer = null;
        flushDeferredViewportRendering();
    }, 140);
    scheduleSave(1200);
}, {passive:false});
shell.ondragover = e => setSmartDropCopyEffect(e, true);
shell.ondrop = async e => {
    e.preventDefault();
    if(e.target.closest('.image-node')) return;
    const p = screenToWorld(e);
    const assetRaw = e.dataTransfer.getData('application/x-smart-asset');
    if(assetRaw){
        try {
            const asset = JSON.parse(assetRaw);
            if(asset?.url) {
                pushUndo();
                createImageNodeAt(p, [{file_id:asset.file_id || '', url:asset.url, name:asset.name || 'asset', kind:asset.kind || assetMediaKind(asset)}], {type:'smart-asset-image', skipUndo:true});
            }
            return;
        } catch {}
    }
    const payload = await resolveSmartImageDropPayload(e.dataTransfer);
    if(payload.type === 'none') return;
    await handleSmartImageDropPayload(payload, '', {point:p, forceNew:true});
};
window.addEventListener('paste', e => {
    if(isBootLoadingActive()){
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    const editable = isEditableTarget(e.target) || isEditableTarget(document.activeElement);
    const files = clipboardEventMediaFiles(e.clipboardData);
    pasteClipboardContent(files, {editable, preventDefault:() => e.preventDefault()});
});
window.addEventListener('keydown', e => {
    if(isBootLoadingActive()){
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    const key = String(e.key || '').toLowerCase();
    if(e.code === 'Space' && !isEditableTarget(e.target) && !imageEditModal.classList.contains('open')){
        e.preventDefault();
        if(!e.repeat){
            spacePanActive = true;
            shell.classList.add('space-pan-ready');
        }
        return;
    }
    if(e.key === 'Escape' && nodeContextMenu && !nodeContextMenu.hidden){
        e.preventDefault();
        closeNodeContextMenu();
        return;
    }
    if(imageEditModal.classList.contains('open') && !isEditableTarget(e.target)){
        if(e.key === 'ArrowLeft' || e.key === 'ArrowRight'){
            e.preventDefault();
            if(!seekPreviewVideoFrames(e.key === 'ArrowLeft' ? -1 : 1)){
                navigatePreviewImage(e.key === 'ArrowLeft' ? -1 : 1);
            }
            return;
        }
    }
    if(!e.ctrlKey && !e.metaKey && !e.altKey && !isEditableTarget(e.target)){
        if(key === 'z'){
            if(e.repeat) return;
            e.preventDefault();
            toggleZoomPreview();
            return;
        }
        if(key === 'a'){
            if(e.repeat) return;
            e.preventDefault();
            toggleAssetLibrary();
            return;
        }
    }
    if((e.ctrlKey || e.metaKey) && key === 'c' && !isEditableTarget(e.target)){
        const selectionText = window.getSelection?.().toString() || '';
        if(selectionText) return;
        e.preventDefault();
        copySelectedNodes();
        return;
    }
    // 不在此处拦截 Ctrl+V：交给原生 'paste' 事件统一处理，
    // 这样才能读取系统剪贴板里的图片文件并决定粘贴图片还是内部节点。
    if(e.key === 'Escape' && imageEditModal.classList.contains('open')){
        closeImageEditor();
        return;
    }
    if((e.ctrlKey || e.metaKey) && key === 'z' && !isEditableTarget(e.target)){
        e.preventDefault();
        performUndo();
        return;
    }
    if((e.key === 'Delete' || e.key === 'Backspace') && (selectedId || selectedIds.length) && !isEditableTarget(e.target)){
        e.preventDefault();
        const ids = selectedIds.length ? selectedIds.slice() : [selectedId];
        pushUndo();
        ids.forEach(id => { undoSuppressed = true; deleteNode(id); undoSuppressed = false; });
        render();
        scheduleSave();
    }
    if((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'g' && !isEditableTarget(e.target)){
        e.preventDefault();
        const ids = selectedIds.length ? selectedIds.slice() : (selectedId ? [selectedId] : []);
        const ok = ids.map(id => ungroupNode(id)).some(Boolean);
        if(ok) return;
    }
    if((e.ctrlKey || e.metaKey) && key === 'g' && !e.shiftKey && !isEditableTarget(e.target)){
        e.preventDefault();
        groupSelectedNodes();
    }
    if((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditableTarget(e.target) && !imageEditModal.classList.contains('open')){
        e.preventDefault();
        const step = (e.shiftKey ? 240 : 80) * viewport.scale;
        if(e.key === 'ArrowUp') viewport.y += step;
        else if(e.key === 'ArrowDown') viewport.y -= step;
        else if(e.key === 'ArrowLeft') viewport.x += step;
        else viewport.x -= step;
        applyViewport();
        scheduleSave(1200);
    }
});
window.addEventListener('keyup', e => {
    if(e.code !== 'Space') return;
    spacePanActive = false;
    shell.classList.remove('space-pan-ready');
});
window.addEventListener('blur', () => {
    spacePanActive = false;
    shell.classList.remove('space-pan-ready');
    if(panState?.space){
        panState = null;
        shell.classList.remove('panning');
        flushDeferredViewportRendering();
        setTimeout(() => { didPan = false; }, 0);
    }
});
engineSelect.onchange = () => {
    settings.engine = engineSelect.value;
    applyRecentSmartSettingsForCurrentMode();
    syncApiKindToggleVisibility();
    renderDynamicParams();
    persistActiveSmartSettings();
    scheduleSave();
};
function syncApiKindToggleVisibility(){
    if(!apiKindToggle) return;
    // 图片/视频/工作流生成节点类型固定，均隐藏图片/视频切换；仅非定型旧节点在 api 类引擎下保留切换
    const node = activeSettingsSubject();
    const isTypedGenNode = node?.genKind === 'image' || node?.genKind === 'video' || node?.genKind === 'workflow';
    apiKindToggle.style.display = (!isTypedGenNode && isApiLikeEngine(settings.engine)) ? 'inline-flex' : 'none';
    apiKindToggle.querySelectorAll('[data-kind]').forEach(btn => btn.classList.toggle('active', btn.dataset.kind === (settings.apiKind || 'image')));
}
if(apiKindToggle){
    apiKindToggle.querySelectorAll('[data-kind]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const kind = btn.dataset.kind;
            if(kind === settings.apiKind) return;
            settings.apiKind = kind;
            applyRecentSmartSettingsForCurrentMode();
            syncApiKindToggleVisibility();
            renderDynamicParams();
            persistActiveSmartSettings();
            scheduleSave();
        };
    });
}
let promptResizeState = null;
const promptResize = document.getElementById('promptResize');
if(promptResize){
    promptResize.addEventListener('mousedown', e => {
        if(e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        promptResizeState = {
            startY: e.clientY,
            startH: Number(settings.promptH) || promptInput.offsetHeight || 124
        };
    });
}
runBtn.onclick = runGeneration;
cascadeRunBtn.onclick = () => {
    const node = selectedNode();
    const loopId = resolveSmartCascadeLoop(node?.id)?.node?.id || '';
    if(loopId && smartCascadeIsLoopRunning(loopId)) {
        requestSmartCascadeStop(loopId);
        return;
    }
    runSmartCascade();
};
fileInput.onchange = () => {
    const groupPoint = pendingGroupUploadPoint;
    if(!fileInput.files?.length){
        pendingGroupUploadPoint = null;
        uploadTargetId = '';
        return;
    }
    const targetId = groupPoint ? '' : (uploadTargetId || selectedId);
    handleFiles(fileInput.files, targetId, groupPoint ? {point:groupPoint} : {});
    pendingGroupUploadPoint = null;
    uploadTargetId = '';
    fileInput.value = '';
};
if(assetToggle) assetToggle.onclick = () => toggleAssetLibrary();
if(assetCloseBtn) assetCloseBtn.onclick = () => toggleAssetLibrary(false);
if(smartWorkflowToggle) smartWorkflowToggle.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    if(smartWorkflowTransferModal?.classList.contains('open')) closeSmartWorkflowTransferModal();
    else openSmartWorkflowTransferModal();
};
smartWorkflowImportInput?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if(file) importSmartWorkflowFile(file);
    event.target.value = '';
});
smartWorkflowImportDropZone?.addEventListener('click', () => smartWorkflowImportInput?.click());
smartWorkflowImportDropZone?.addEventListener('dragenter', event => {
    event.preventDefault();
    event.stopPropagation();
    smartWorkflowImportDropZone.classList.add('drag-over');
});
smartWorkflowImportDropZone?.addEventListener('dragover', event => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    smartWorkflowImportDropZone.classList.add('drag-over');
});
smartWorkflowImportDropZone?.addEventListener('dragleave', event => {
    event.preventDefault();
    event.stopPropagation();
    if(!smartWorkflowImportDropZone.contains(event.relatedTarget)) smartWorkflowImportDropZone.classList.remove('drag-over');
});
smartWorkflowImportDropZone?.addEventListener('drop', event => {
    event.preventDefault();
    event.stopPropagation();
    smartWorkflowImportDropZone.classList.remove('drag-over');
    const file = [...(event.dataTransfer?.files || [])].find(item => /\.(json|zip)$/i.test(item.name || ''));
    if(file) importSmartWorkflowFile(file);
    else toast('请拖入 JSON 或 ZIP 模板文件');
});
smartWorkflowTransferModal?.addEventListener('pointerdown', e => e.stopPropagation());
smartWorkflowTransferModal?.addEventListener('mousedown', e => e.stopPropagation());
smartWorkflowTransferModal?.addEventListener('click', e => e.stopPropagation());
smartWorkflowTransferModal?.addEventListener('wheel', event => {
    event.stopPropagation();
}, {passive:true, capture:true});
smartWorkflowTransferModal?.addEventListener('dragover', event => {
    event.preventDefault();
    event.stopPropagation();
    if(smartWorkflowImportDropZone){
        event.dataTransfer.dropEffect = 'copy';
        smartWorkflowImportDropZone.classList.add('drag-over');
    }
});
smartWorkflowTransferModal?.addEventListener('dragleave', event => {
    event.preventDefault();
    event.stopPropagation();
    if(!smartWorkflowTransferModal.contains(event.relatedTarget)) smartWorkflowImportDropZone?.classList.remove('drag-over');
});
smartWorkflowTransferModal?.addEventListener('drop', event => {
    event.preventDefault();
    event.stopPropagation();
    smartWorkflowImportDropZone?.classList.remove('drag-over');
    const file = [...(event.dataTransfer?.files || [])].find(item => /\.(json|zip)$/i.test(item.name || ''));
    if(file) importSmartWorkflowFile(file);
    else toast('请拖入 JSON 或 ZIP 模板文件');
});
assetPanel?.addEventListener('pointerdown', e => e.stopPropagation());
assetPanel?.addEventListener('mousedown', e => e.stopPropagation());
assetPanel?.addEventListener('click', e => e.stopPropagation());
assetPanel?.addEventListener('wheel', e => {
    e.stopPropagation();
    const scroller = e.target.closest?.('.asset-grid') || assetGrid;
    if(!scroller || getComputedStyle(scroller).display === 'none') return;
    const canScroll = scroller.scrollHeight > scroller.clientHeight || scroller.scrollWidth > scroller.clientWidth;
    if(!canScroll) return;
    e.preventDefault();
    scroller.scrollTop += e.deltaY;
    scroller.scrollLeft += e.deltaX;
}, {passive:false, capture:true});
assetDialogBackdrop?.addEventListener('pointerdown', e => e.stopPropagation());
assetDialogBackdrop?.addEventListener('mousedown', e => e.stopPropagation());
assetDialogBackdrop?.addEventListener('click', e => e.stopPropagation());
promptPresetPanel?.addEventListener('pointerdown', e => e.stopPropagation());
promptPresetPanel?.addEventListener('mousedown', e => e.stopPropagation());
promptPresetPanel?.addEventListener('click', e => e.stopPropagation());
promptTemplatePanel?.addEventListener('pointerdown', e => e.stopPropagation());
promptTemplatePanel?.addEventListener('mousedown', e => e.stopPropagation());
promptTemplatePanel?.addEventListener('wheel', e => e.stopPropagation(), {passive:false});
promptTemplatePanel?.addEventListener('click', e => {
    e.stopPropagation();
    const apply = e.target.closest('[data-template-apply]');
    if(apply){ applyPromptTemplateToNode(apply.dataset.templateApply || 'positive'); return; }
    if(e.target.closest('[data-template-save-current]')){ saveCurrentPromptAsTemplate(); return; }
    if(e.target.closest('[data-template-new]')){ createBlankPromptTemplate(); return; }
    if(e.target.closest('[data-template-edit]')) { promptTemplateEditing = true; renderPromptTemplatePanel(); return; }
    if(e.target.closest('[data-template-edit-cancel]')) { promptTemplateEditing = false; renderPromptTemplatePanel(); return; }
    if(e.target.closest('[data-template-edit-save]')){ savePromptTemplateEdit(); return; }
    if(e.target.closest('[data-template-delete]')){ deletePromptTemplate(); return; }
    const cat = e.target.closest('[data-template-cat]');
    if(cat){
        promptTemplateCategory = cat.dataset.templateCat || 'all';
        promptTemplateSelectedId = '';
        promptTemplateEditing = false;
        renderPromptTemplatePanel({preserveScroll:false});
        return;
    }
    const catEdit = e.target.closest('[data-template-cat-edit]');
    if(catEdit){
        const id = catEdit.dataset.templateCatEdit || '';
        renamePromptTemplateGroup(id);
        return;
    }
    const catDelete = e.target.closest('[data-template-cat-delete]');
    if(catDelete){
        deletePromptTemplateGroup(catDelete.dataset.templateCatDelete || '');
        return;
    }
    if(e.target.closest('[data-template-group-edit]')){
        promptTemplateGroupEditMode = !promptTemplateGroupEditMode;
        renderPromptTemplatePanel({preserveScroll:false});
        return;
    }
    if(e.target.closest('[data-template-cat-new]')) { createPromptTemplateGroup(); return; }
    const card = e.target.closest('[data-template-id]');
    if(card){
        promptTemplateSelectedId = card.dataset.templateId || '';
        promptTemplateEditing = false;
        renderPromptTemplatePanel();
        return;
    }
});
if(promptPresetClose) promptPresetClose.onclick = closePromptPresetPanel;
if(promptTemplateClose) promptTemplateClose.onclick = closePromptTemplatePanel;
if(promptTemplateSearch) promptTemplateSearch.oninput = () => renderPromptTemplatePanel({preserveScroll:false});
if(promptTemplateLibrarySelect) promptTemplateLibrarySelect.onchange = () => {
    activePromptLibraryId = promptTemplateLibrarySelect.value || 'system';
    promptTemplateSelectedId = '';
    promptTemplateEditing = false;
    renderPromptTemplatePanel({preserveScroll:false});
};
if(composerTemplateBtn) composerTemplateBtn.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    if(promptTemplatePanel?.classList?.contains('open') && promptTemplatePanel.dataset.target === 'composer'){
        closePromptTemplatePanel();
        return;
    }
    openPromptTemplatePanel(activeComposerNode()?.id || selectedNode()?.id || '', promptTemplateSelectedId, {target:'composer'});
};
if(promptPresetSelect) promptPresetSelect.onchange = () => renderPromptPresetPanel(promptPresetSelect.value);
[promptPresetName, promptPresetText].forEach(input => {
    input?.addEventListener('input', () => {
        resetPromptPresetDeleteState();
        setPromptPresetStatus(tr('smart.promptPresetEditing'));
    });
});
if(promptPresetApply) promptPresetApply.onclick = () => {
    const preset = currentPromptPreset(promptPresetSelect.value);
    const node = promptPresetPanelNode();
    if(!preset || !node) return;
    node.promptPresetId = preset.id;
    node.text = preset.text || '';
    closePromptPresetPanel();
    render();
    scheduleSave();
};
if(promptPresetSave) promptPresetSave.onclick = () => {
    const preset = currentPromptPreset(promptPresetSelect.value);
    if(!preset) return;
    const name = promptPresetName.value.trim();
    const text = promptPresetText.value.trim();
    if(!name || !text){ setPromptPresetStatus(tr('smart.promptPresetRequired'), 'warn'); return; }
    const idx = promptPresets.findIndex(p => p.id === preset.id);
    if(idx >= 0) promptPresets[idx] = {...promptPresets[idx], name, text, updatedAt:Date.now()};
    savePromptPresets();
    const node = promptPresetPanelNode();
    if(node?.promptPresetId === preset.id) node.text = text;
    renderPromptPresetPanel(preset.id, tr('smart.promptPresetSaved'));
    setPromptPresetStatus(tr('smart.promptPresetSaved'), 'ok');
    render();
    scheduleSave();
};
if(promptPresetNew) promptPresetNew.onclick = () => {
    const node = promptPresetPanelNode();
    const preset = createPromptPresetFromNode(node, {openPanel:false});
    if(!preset) return;
    renderPromptPresetPanel(preset.id, tr('smart.promptPresetSavedNew'));
    setPromptPresetStatus(tr('smart.promptPresetSavedNew'), 'ok');
    promptPresetName?.focus();
    promptPresetName?.select();
};
if(promptPresetDelete) promptPresetDelete.onclick = () => {
    const preset = currentPromptPreset(promptPresetSelect.value);
    if(!preset) return;
    if(!promptPresetDeleteArmed){
        promptPresetDeleteArmed = true;
        promptPresetDelete.textContent = tr('smart.promptPresetDeleteAgain');
        promptPresetDelete.classList.add('confirm-danger');
        setPromptPresetStatus(tr('smart.promptPresetDeleteConfirm').replace('{name}', preset.name || tr('smart.promptPresetUnnamed')), 'warn');
        return;
    }
    promptPresets = promptPresets.filter(p => p.id !== preset.id);
    nodes.forEach(node => { if(node.promptPresetId === preset.id) node.promptPresetId = ''; });
    savePromptPresets();
    renderPromptPresetPanel(promptPresets[0]?.id || '', tr('smart.promptPresetDeleted'));
    setPromptPresetStatus(tr('smart.promptPresetDeleted'), 'ok');
    render();
    scheduleSave();
};
document.querySelectorAll('[data-asset-tab]').forEach(btn => {
    btn.onclick = () => { assetTab = btn.dataset.assetTab; renderAssetLibrary(); };
});
if(assetLibrarySelect) assetLibrarySelect.onchange = () => {
    activeAssetLibraryId = assetLibrarySelect.value || '';
    activeAssetCategoryId = '';
    mentionAssetCategoryId = '';
    renderAssetLibrary();
};
if(assetCategorySelect) assetCategorySelect.onchange = () => { activeAssetCategoryId = assetCategorySelect.value; renderAssetLibrary(); };
const assetAddCategoryBtn = document.getElementById('assetAddCategoryBtn');
if(assetAddCategoryBtn) assetAddCategoryBtn.onclick = async () => {
    const name = await openAssetNameDialog({title:tr('smart.assetNewFolder'), value:tr('smart.assetFolder'), placeholder:tr('smart.assetFolder')});
    if(!name) return;
    const data = await fetch('/api/asset-library/categories', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({library_id:activeAssetLibraryId, name, type:'image'})}).then(r => r.json());
    activeAssetCategoryId = data.category?.id || activeAssetCategoryId;
    setAssetLibraryFromResponse(data);
};
const assetRenameCategoryBtn = document.getElementById('assetRenameCategoryBtn');
if(assetRenameCategoryBtn) assetRenameCategoryBtn.onclick = async () => {
    const cat = activeAssetCategory();
    if(!cat) return;
    const name = await openAssetNameDialog({title:tr('smart.assetRenameFolder'), value:cat.name || '', placeholder:tr('smart.assetFolder')});
    if(!name) return;
    const data = await fetch(`/api/asset-library/categories/${encodeURIComponent(cat.id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})}).then(r => r.json());
    setAssetLibraryFromResponse(data);
};
function hasCanvasImageDrag(event){
    return Array.from(event.dataTransfer?.types || []).includes('application/x-smart-canvas-image');
}
function setAssetDragOver(active){
    if(!assetDropZone || !assetPanel) return;
    assetDropZone.classList.toggle('drag-over', !!active);
    assetPanel.classList.toggle('drag-over', !!active);
}
function handleAssetPanelDragOver(e){
    if(hasCanvasImageDrag(e) || hasSmartImageDropData(e.dataTransfer)){
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setAssetDragOver(true);
    }
}
async function handleAssetPanelDrop(e){
    if(!hasCanvasImageDrag(e) && !hasSmartImageDropData(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    setAssetDragOver(false);
    const raw = e.dataTransfer.getData('application/x-smart-canvas-image');
    if(raw){
        try {
            const payload = JSON.parse(raw);
            if(payload?.file_id) await addFileToAssetLibrary(payload.file_id, payload.name || '');
            return;
        } catch(e) {
            toast(tr('smart.assetAddFail'));
            return;
        }
    }
    try {
        const payload = await resolveSmartImageDropPayload(e.dataTransfer);
        if(payload.type === 'files') {
            const uploaded = await uploadFiles(payload.files);
            for(const file of uploaded) if(file?.file_id) await addFileToAssetLibrary(file.file_id, file.name || '');
        } else if(payload.type === 'localPaths') {
            const imported = await importSmartLocalImages(payload.localPaths);
            for(const file of imported) if(file?.file_id) await addFileToAssetLibrary(file.file_id, file.name || '');
        } else if(payload.type === 'url') {
            throw new Error('外部 URL 不能直接保存到资产库，请先上传为文件');
        }
    } catch(err) {
        toast(err.message || tr('smart.assetAddFail'));
    }
}
assetDropZone?.addEventListener('dragover', e => {
    if(hasCanvasImageDrag(e) || hasSmartImageDropData(e.dataTransfer)){
        e.preventDefault();
        e.stopPropagation();
        assetDropZone?.classList.add('drag-over');
    }
});
assetDropZone?.addEventListener('dragleave', () => assetDropZone?.classList.remove('drag-over'));
assetDropZone?.addEventListener('drop', handleAssetPanelDrop);
assetPanel?.addEventListener('dragover', handleAssetPanelDragOver);
assetPanel?.addEventListener('dragleave', e => { if(!assetPanel?.contains(e.relatedTarget)) setAssetDragOver(false); });
assetPanel?.addEventListener('drop', handleAssetPanelDrop);
nodeAssetSaveModal?.addEventListener('pointerdown', event => event.stopPropagation());
nodeAssetSaveModal?.addEventListener('mousedown', event => event.stopPropagation());
nodeAssetSaveModal?.addEventListener('click', event => {
    event.stopPropagation();
    if(event.target === nodeAssetSaveModal) closeNodeAssetSaveModal();
});
nodeAssetSaveClose?.addEventListener('click', closeNodeAssetSaveModal);
nodeAssetSaveCancel?.addEventListener('click', closeNodeAssetSaveModal);
nodeAssetSaveLibraries?.addEventListener('click', event => {
    const btn = event.target.closest('[data-node-asset-library]');
    if(!btn) return;
    nodeAssetSaveState.libraryId = btn.dataset.nodeAssetLibrary || '';
    nodeAssetSaveState.categoryId = assetCategoriesForLibrary(nodeAssetSaveState.libraryId, 'image')[0]?.id || '';
    renderNodeAssetSaveModal();
});
nodeAssetSaveFolders?.addEventListener('click', event => {
    const btn = event.target.closest('[data-node-asset-folder]');
    if(!btn) return;
    nodeAssetSaveState.categoryId = btn.dataset.nodeAssetFolder || '';
    renderNodeAssetSaveModal();
});
nodeAssetSaveName?.addEventListener('input', () => {
    nodeAssetSaveState.name = nodeAssetSaveName.value;
});
nodeAssetSaveName?.addEventListener('keydown', event => {
    if(event.key === 'Escape'){
        event.preventDefault();
        closeNodeAssetSaveModal();
    }
    if(event.key === 'Enter'){
        event.preventDefault();
        nodeAssetSaveConfirm?.click();
    }
});
nodeAssetSaveNewFolder?.addEventListener('click', async () => {
    const libraryId = nodeAssetSaveState.libraryId || assetLibraries()[0]?.id || '';
    if(!libraryId) return;
    const name = await openAssetNameDialog({title:'新建文件夹', value:'', placeholder:'输入文件夹名称', cancelValue:''});
    if(!String(name || '').trim()) return;
    try {
        const data = await fetch('/api/asset-library/categories', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({library_id:libraryId, name:String(name).trim(), type:'image'})
        }).then(async r => {
            if(!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '新建文件夹失败');
            return r.json();
        });
        nodeAssetSaveState.libraryId = libraryId;
        nodeAssetSaveState.categoryId = data.category?.id || nodeAssetSaveState.categoryId;
        setAssetLibraryFromResponse(data);
    } catch(err) {
        showErrorModal(err.message || '新建文件夹失败', '新建文件夹失败');
    }
});
nodeAssetSaveConfirm?.addEventListener('click', async () => {
    try {
        nodeAssetSaveConfirm.disabled = true;
        const items = Array.isArray(nodeAssetSaveState.items) && nodeAssetSaveState.items.length
            ? nodeAssetSaveState.items
            : [{fileId:nodeAssetSaveState.fileId, name:String(nodeAssetSaveName?.value || nodeAssetSaveState.name || '').trim()}];
        for(const [index, item] of items.entries()){
            await saveFileToAssetLibrarySelection(
                item.fileId,
                nodeAssetSaveState.useOriginalNames ? item.name : (items.length === 1 ? String(nodeAssetSaveName?.value || item.name || '').trim() : item.name),
                nodeAssetSaveState.libraryId,
                nodeAssetSaveState.categoryId,
                {silent:items.length > 1 || index < items.length - 1}
            );
        }
        if(items.length > 1) toast(`已加入 ${items.length} 项资产`);
        closeNodeAssetSaveModal();
    } catch(err) {
        showErrorModal(err.message || '保存到资产库失败', '保存到资产库失败');
        renderNodeAssetSaveModal();
    }
});
createMenu?.addEventListener('mousedown', event => event.stopPropagation());
createMenu?.addEventListener('click', event => {
    event.stopPropagation();
    const card = event.target.closest('[data-create-type]');
    if(card) createNodeFromMenu(card.dataset.createType || 'image');
});
/* ─── 拉线菜单事件绑定 ─── */
portDropMenu?.addEventListener('mousedown', event => event.stopPropagation());
portDropMenu?.addEventListener('click', event => {
    event.stopPropagation();
    const item = event.target.closest('[data-node-type]');
    if(item) handlePortDropMenuSelect(item.dataset.nodeType);
});
document.addEventListener('mousedown', event => {
    if(!portDropMenu || portDropMenu.hidden) return;
    if(event.target.closest('.port-drop-menu')) return;
    closePortDropMenu();
}, true);
composer.addEventListener('pointerdown', event => event.stopPropagation());
composer.addEventListener('mousedown', event => event.stopPropagation());
composer.addEventListener('click', event => {
    if(!event.target.closest('.smart-control')) closeAllSmartPopovers();
    event.stopPropagation();
});
if(promptComposer){
    promptComposer.addEventListener('pointerdown', event => event.stopPropagation());
    promptComposer.addEventListener('mousedown', event => event.stopPropagation());
    promptComposer.addEventListener('click', event => event.stopPropagation());
    promptComposer.addEventListener('dblclick', event => event.stopPropagation());
}
promptInput.addEventListener('input', maybeOpenMentionPicker);
promptInput.addEventListener('input', () => {
    delete promptInput.dataset.preserveDraftOnce;
    savePromptDraftForCurrent();
    renderInputThumbsRow(selectedNode());
    scheduleSave();
});
promptInput.addEventListener('keyup', maybeOpenMentionPicker);
promptInput.addEventListener('mouseup', saveMentionRange);
promptInput.addEventListener('focus', saveMentionRange);
promptInput.addEventListener('keydown', event => {
    if(event.key === 'Escape') closeMentionPicker();
    if(event.key === 'Enter'){
        // Shift+Enter 换行（保留默认行为）；输入法组合中（如中文候选词确认）不拦截。
        if(event.shiftKey || event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        // @提及候选框打开时，回车用于关闭候选框继续输入，不触发生成。
        if(mentionPicker?.classList?.contains('open')){
            closeMentionPicker();
            return;
        }
        // 回车直接生成图片。
        runGeneration();
    }
});
promptInput.addEventListener('mouseover', event => {
    const token = event.target.closest?.('.mention-image-token');
    if(!token) return;
    let media = mentionPreview.querySelector('img,video');
    const isVideo = token.dataset.kind === 'video' || isVideoMediaItem({url:token.dataset.url, kind:token.dataset.kind});
    if(isVideo && media?.tagName?.toLowerCase() !== 'video'){
        media?.replaceWith(document.createElement('video'));
        media = mentionPreview.querySelector('video');
    } else if(!isVideo && media?.tagName?.toLowerCase() !== 'img'){
        media?.replaceWith(document.createElement('img'));
        media = mentionPreview.querySelector('img');
    }
    if(isVideo){
        media.muted = true;
        media.loop = true;
        media.playsInline = true;
        media.preload = 'metadata';
        media.disablePictureInPicture = true;
        media.setAttribute('disablepictureinpicture', '');
        media.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback');
        media.src = token.dataset.url || '';
        media.play?.().catch(() => {});
    } else {
        media.src = token.dataset.url || '';
        media.alt = 'preview';
    }
    const rect = token.getBoundingClientRect();
    mentionPreview.style.left = `${Math.min(window.innerWidth - 236, rect.left)}px`;
    mentionPreview.style.top = `${Math.min(window.innerHeight - 236, rect.bottom + 8)}px`;
    mentionPreview.style.display = 'block';
});
promptInput.addEventListener('mouseout', event => {
    if(event.target.closest?.('.mention-image-token')){
        mentionPreview.style.display = 'none';
        const media = mentionPreview.querySelector('img,video');
        media?.pause?.();
        media?.removeAttribute('src');
        media?.load?.();
    }
});
mentionPicker.addEventListener('mousedown', event => event.stopPropagation());
document.addEventListener('click', event => {
    if(!event.target.closest('.smart-control')) closeAllSmartPopovers();
    if(!event.target.closest('.mention-picker') && !event.target.closest('#promptInput')) closeMentionPicker();
    if(!event.target.closest('.prompt-preset-panel') && !event.target.closest('.prompt-preset-edit') && !event.target.closest('.prompt-preset-save')) closePromptPresetPanel();
    if(!event.target.closest('.prompt-template-panel') && !event.target.closest('.prompt-preset-edit') && !event.target.closest('#composerTemplateBtn')) closePromptTemplatePanel();
});
document.addEventListener('keydown', event => {
    if(event.key === 'Escape') { closeAllSmartPopovers(); closeCreateMenu(); closePortDropMenu(); closeSmartCanvasLog(); closeSmartCanvasShortcuts(); closePromptPresetPanel(); closePromptTemplatePanel(); closeNodeAssetSaveModal(); }
});
document.getElementById('cropBox').addEventListener('mousedown', event => beginCropDrag(event, 'move'));
document.getElementById('cropHandle').addEventListener('mousedown', event => beginCropDrag(event, 'resize'));
document.getElementById('outpaintFrame').addEventListener('mousedown', event => {
    if(event.target.closest('[data-outpaint-handle]')) return;
    beginCropDrag(event, 'image');
});
document.querySelectorAll('[data-outpaint-handle]').forEach(handle => {
    handle.addEventListener('mousedown', event => beginCropDrag(event, `outpaint-${handle.dataset.outpaintHandle || 'corner'}`));
});
document.getElementById('cropImage').addEventListener('mousedown', event => {
    if(imageEditMode !== 'outpaint' || !cropState) return;
    document.getElementById('cropCanvas')?.classList.add('dragging-image');
    beginCropDrag(event, 'image');
});
document.querySelectorAll('[data-image-edit-mode]').forEach(btn => {
    btn.addEventListener('click', event => {
        event.stopPropagation();
        if(btn.disabled) return;
        setImageEditMode(btn.dataset.imageEditMode || 'crop', true);
    });
});
imageEditModal.addEventListener('pointerdown', event => {
    event.stopPropagation();
});
imageEditModal.addEventListener('mousedown', event => {
    event.stopPropagation();
});
imageEditModal.addEventListener('mousemove', event => {
    if(previewPanDrag || previewCompareDrag || panoramaState.drag || imageEditPanDrag || cropDrag) return;
    event.stopPropagation();
});
imageEditModal.addEventListener('click', event => {
    event.stopPropagation();
    if(event.target === imageEditModal) closeImageEditor();
});
imageEditModal.addEventListener('wheel', event => {
    event.stopPropagation();
}, {passive:false});
document.getElementById('previewStage').addEventListener('mousedown', event => {
    if(imageEditMode !== 'preview' || event.button !== 0) return;
    if(event.target.closest('.preview-tools-overlay, .preview-download-overlay, .preview-nav-bar')) return;
    if(event.target.closest('.preview-compare-handle')) return;
    if(event.target.closest('video')) return;
    event.preventDefault();
    event.stopPropagation();
    if(panoramaState.enabled){
        panoramaState.drag = {
            clientX:event.clientX,
            clientY:event.clientY,
            yaw:panoramaState.yaw,
            pitch:panoramaState.pitch
        };
        document.getElementById('previewStage')?.classList.add('panning');
        return;
    }
    previewPanDrag = {clientX:event.clientX, clientY:event.clientY, startX:previewPan.x, startY:previewPan.y};
});
document.getElementById('imageEditStage').addEventListener('mousedown', event => {
    if(imageEditMode === 'preview' || event.button !== 0) return;
    if(event.target.closest('.image-edit-actions, .preview-tools-overlay, .preview-download-overlay, .crop-box, .crop-handle')) return;
    if(event.target.closest('#editDrawCanvas, #editTextCanvas, #gridJoinCanvas, .edit-text-inline') && imageEditMode !== 'crop') return;
    const stage = event.currentTarget;
    if(stage.scrollWidth <= stage.clientWidth && stage.scrollHeight <= stage.clientHeight) return;
    event.preventDefault();
    event.stopPropagation();
    imageEditPanDrag = {
        clientX:event.clientX,
        clientY:event.clientY,
        scrollLeft:stage.scrollLeft,
        scrollTop:stage.scrollTop
    };
});
document.getElementById('previewCompareHandle').addEventListener('mousedown', event => {
    if(imageEditMode !== 'preview' || !previewCompareOn || previewCompareIndex < 0) return;
    event.preventDefault();
    event.stopPropagation();
    previewPanDrag = null;
    previewCompareDrag = true;
    setPreviewComparePos(event.clientX);
});
document.getElementById('previewCompareHandle').addEventListener('pointerdown', event => {
    if(imageEditMode !== 'preview' || !previewCompareOn || previewCompareIndex < 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    previewPanDrag = null;
    previewCompareDrag = true;
    setPreviewComparePos(event.clientX);
});
document.getElementById('previewCompareHandle').addEventListener('pointermove', event => {
    if(!previewCompareDrag) return;
    event.preventDefault();
    event.stopPropagation();
    setPreviewComparePos(event.clientX);
});
document.getElementById('previewCompareHandle').addEventListener('pointerup', event => {
    if(previewCompareDrag){
        event.preventDefault();
        event.stopPropagation();
    }
    previewCompareDrag = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
});
document.getElementById('previewCompareHandle').addEventListener('pointercancel', event => {
    previewCompareDrag = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
});
document.getElementById('editDrawCanvas').addEventListener('pointerdown', beginEditDraw);
document.getElementById('editDrawCanvas').addEventListener('pointermove', moveEditDraw);
document.getElementById('editDrawCanvas').addEventListener('pointermove', updateBrushCursor);
document.getElementById('editDrawCanvas').addEventListener('pointerenter', updateBrushCursor);
document.getElementById('editDrawCanvas').addEventListener('pointerleave', hideBrushCursor);
document.getElementById('editDrawCanvas').addEventListener('pointerup', endEditDraw);
document.getElementById('editDrawCanvas').addEventListener('pointercancel', endEditDraw);
document.getElementById('editDrawCanvas').addEventListener('pointerleave', endEditDraw);
document.getElementById('gridJoinCanvas')?.addEventListener('pointerdown', beginGridJoinDrag);
document.getElementById('gridJoinCanvas')?.addEventListener('pointermove', moveGridJoinDrag);
document.getElementById('gridJoinCanvas')?.addEventListener('pointerup', endGridJoinDrag);
document.getElementById('gridJoinCanvas')?.addEventListener('pointercancel', endGridJoinDrag);
document.getElementById('gridJoinCanvas')?.addEventListener('pointerleave', endGridJoinDrag);
document.getElementById('editTextCanvas')?.addEventListener('pointerdown', beginEditText);
document.getElementById('editTextCanvas')?.addEventListener('pointermove', moveEditText);
document.getElementById('editTextCanvas')?.addEventListener('pointerup', endEditText);
document.getElementById('editTextCanvas')?.addEventListener('pointercancel', endEditText);
document.getElementById('editTextCanvas')?.addEventListener('pointerleave', endEditText);
document.getElementById('editTextCanvas')?.addEventListener('dblclick', event => {
    if(imageEditMode !== 'brush' || brushTool !== 'text') return;
    event.preventDefault(); event.stopPropagation();
    const hit = hitEditTextItem(editTextPoint(event));
    if(hit){
        setSelectedEditTextItem(hit.id);
        beginEditTextInline(hit);
    }
});
['paintBrushSize','paintBrushColor'].forEach(id => {
    const control = document.getElementById(id);
    if(!control) return;
    control.addEventListener('input', syncSelectedEditTextStyleFromBrush);
    control.addEventListener('change', () => { editTextDirty = false; });
});
['maskBrushSize','paintBrushSize','paintBrushColor'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', refreshBrushCursorSize);
});
['gridHorizontalLines','gridVerticalLines','gridGapSize','gridJoinGapSize'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        syncGridGapValue();
        refreshGridSplitPreview();
    });
});
document.querySelectorAll('[data-panorama-ratio]').forEach(btn => {
    btn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        applyPanoramaRatio(btn.dataset.panoramaRatio || 'wide');
    });
});
['panoramaRatioW','panoramaRatioH'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
        panoramaState.ratio = 'custom';
        panoramaState.customW = Math.max(1, Math.min(999, Number(document.getElementById('panoramaRatioW')?.value || 16)));
        panoramaState.customH = Math.max(1, Math.min(999, Number(document.getElementById('panoramaRatioH')?.value || 9)));
        refreshPanoramaControls();
        resizePanoramaViewer();
    });
});
document.getElementById('imageEditStage').addEventListener('wheel', event => {
    if(!cropState) return;
    event.preventDefault();
    event.stopPropagation();
    if(imageEditMode === 'preview'){
        if(seekPreviewVideoFrames(event.deltaY > 0 ? 1 : -1)) return;
        if(panoramaState.enabled){
            const factor = event.deltaY < 0 ? 0.92 : 1 / 0.92;
            panoramaState.fov = Math.max(35, Math.min(100, panoramaState.fov * factor));
            updateZoomLabel();
            return;
        }
        const oldZoom = previewZoom;
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        previewZoom = Math.max(0.05, previewZoom * factor);
        const frame = document.getElementById('previewFrame');
        const rect = frame?.getBoundingClientRect();
        if(rect){
            const originX = event.clientX - rect.left - rect.width / 2;
            const originY = event.clientY - rect.top - rect.height / 2;
            const ratio = previewZoom / oldZoom;
            previewPan.x -= originX * (ratio - 1);
            previewPan.y -= originY * (ratio - 1);
        }
        applyPreviewTransform();
        return;
    }
    if(imageEditMode === 'gridjoin'){
        const oldZoom = gridJoinZoom;
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        gridJoinZoom = Math.max(0.05, Math.min(6.0, gridJoinZoom * factor));
        const frame = document.getElementById('cropCanvas');
        const rect = frame?.getBoundingClientRect();
        if(rect){
            const originX = event.clientX - rect.left - rect.width / 2;
            const originY = event.clientY - rect.top - rect.height / 2;
            const ratio = gridJoinZoom / oldZoom;
            gridJoinPan.x -= originX * (ratio - 1);
            gridJoinPan.y -= originY * (ratio - 1);
        }
        applyGridJoinTransform();
        return;
    }
    const stage = event.currentTarget;
    const oldZoom = imageEditZoom;
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    imageEditZoom = Math.max(0.15, Math.min(6.0, imageEditZoom * factor));
    const stageRect = stage.getBoundingClientRect();
    const mx = event.clientX - stageRect.left;
    const my = event.clientY - stageRect.top;
    const contentX = stage.scrollLeft + mx;
    const scale = imageEditZoom / oldZoom;
    const contentY = stage.scrollTop + my;
    applyImageEditZoom(scale);
    stage.scrollLeft = contentX * scale - mx;
    stage.scrollTop = contentY * scale - my;
}, {passive:false});
window.addEventListener('resize', () => {
    if(cropState) syncImageEditOverflow();
    if(panoramaState.enabled) resizePanoramaViewer();
    updateNodeShortcutBar();
});
window.addEventListener('studio-theme-change', event => applyTheme(event.detail?.theme || 'light'));
try {
    const apiChannel = new BroadcastChannel('studio-api');
    apiChannel.onmessage = async event => {
        if(event.data?.type === 'providers-changed' || event.data?.type === 'workflows-changed' || event.data?.type === 'comfy-instances-changed'){
            await refreshSmartConfigFromSettings();
        }
        if(event.data?.type === 'asset_library_updated') handleAssetLibraryUpdatedMessage(event.data);
        if(event.data?.type === 'canvas_updated') handleCanvasUpdatedMessage(event.data);
    };
} catch(e) {}
window.addEventListener('focus', () => {
    if(Date.now() - lastConfigRefreshAt > 1200) refreshSmartConfigFromSettings();
});
window.addEventListener('message', event => {
    if(event.origin && event.origin !== location.origin) return;
    if(event.data?.type === 'studio-theme') applyTheme(event.data.theme || 'light');
    if(event.data?.type === 'providers-changed' || event.data?.type === 'workflows-changed' || event.data?.type === 'comfy-instances-changed') refreshSmartConfigFromSettings();
    if(event.data?.type === 'asset_library_updated') handleAssetLibraryUpdatedMessage(event.data);
    if(event.data?.type === 'canvas_updated') handleCanvasUpdatedMessage(event.data);
    if(event.data?.type === 'studio-lang' && window.StudioI18n) {
        window.StudioI18n.set(event.data.lang || 'zh');
    }
});
window.addEventListener('studio-lang-change', () => {
    renderDynamicParams();
    renderInputThumbsRow(selectedNode());
    renderAssetLibrary();
    if(document.getElementById('imageEditModal')?.classList.contains('open')){
        setImageEditMode(imageEditMode);
    }
    if(promptTemplatePanel?.classList?.contains('open')) renderPromptTemplatePanel();
    render();
});
window.onload = async () => {
    showBootLoadingOverlay();
    applyTheme(localStorage.getItem('studio_theme') || localStorage.getItem('canvas_theme') || 'light');
    bindNodeShortcutOverlayEvents();
    bindNodeContextMenuEvents();
    loadPromptPresets();
    loadPromptTemplateGroups();
    loadPromptTemplateOverrides();
    await loadPromptTemplates();
    if(window.StudioI18n) window.StudioI18n.apply();
    if(window.lucide) lucide.createIcons();
    connectAssetLibrarySyncSocket();
    await loadCanvas();
    const configPromise = loadConfig();
    const assetLibraryPromise = loadAssetLibrary();
    await Promise.allSettled([configPromise, assetLibraryPromise]);
    syncApiKindToggleVisibility();
    render();
    await waitForVisibleBootMedia();
    requestAnimationFrame(() => hideBootLoadingOverlay(() => {
        toast(tr('smart.thumbnailPreviewNotice'));
    }));
};
