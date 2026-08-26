// M21 拆分：@mention 提及系统 + 提示词节点 composer（promptComposer）+
// 生成请求引用图片收集系统。从 static/js/canvas.js 原样剪切，
// 未改动任何函数内部逻辑，只做了纯粹的位置搬移，物理上分两段不连续
// 区间（原文件 2192-2598 行 + 2780-3461 行，中间 2609-2779 行是 M6
// 阶段确认的通用配额/尺寸计算基础设施，物理上夹在中间但完全不相关，
// 排除在外，详见下方"刻意排除"）。
//
// 为什么这里不用 ES module 的 export/import（跟 M1-M20 同一个原因）：
// canvas.html 依赖经典 <script> 的全局作用域语义，57 处内联
// onclick="xxx()" 都依赖这一点。所以这里同样只做"物理文件拆分"：
// mention-composer.js 保持经典脚本语法，通过
// <script src="mention-composer.js"> 排在 prompt-templates.js 之后、
// canvas-render.js 之前加载。
//
// 背景（M8 阶段搁置，M17/M20 完成前置步骤，本次 M21 完成拆分）：
// M8 拆 image-editor.js 时评估过整个"提示词模板/预设/composer/@mention
// 大系统"，发现深度耦合着约1400行顶层匿名脚本（画布事件绑定/app 启动
// 序列等），判断风险太高，整体搁置。M17 先拆出了"预设/模板库管理"这块
// 干净的子系统（prompt-templates.js）。M20 把剩余全部顶层匿名脚本转成
// 具名函数声明，消除了 AST 扫描盲区。M21 在此基础上，用标准 AST 工具
// 精确梳理出"@mention 提及 + 提示词节点 composer + 生成请求引用图片
// 收集"这块本身不含任何顶层匿名脚本语句的子系统，完成拆分。
//
// 本文件包含（共79个函数，物理上两段区间）：
//   【第一段】提示词节点 composer（promptComposer 面板，注意跟 M7/main.js
//   里 updateComposer/positionComposerForNode 操作的 composer——图片
//   生成节点的参数面板——是两个不同的 DOM 元素，不要混淆）：
//     positionPromptComposerForNode / promptComposerParamsHtml /
//     renderPromptComposer / bindPromptComposerControls /
//     updatePromptComposer / renderInputPromptPreview / rhInputKindLabel /
//     rhInputKindIcon / renderRhInputThumb / inputVideoHoverPreviewHtml /
//     inputThumbType / inputThumbLabel / renderRunningHubInputThumbsRow /
//     inputThumbItemHtml / renderInputThumbsRow / renderPromptComposerThumbs /
//     renderPromptComposerInputPreview —— 渲染 composer 面板本体、
//     RunningHub 专属参数展示、输入引用缩略图行。
//     bindInputThumbsDrag / inputThumbDropPlacement / clearInputThumbDropMarkers /
//     movedBeforeAfterIds / sameOrderedIds / reorderInputSourceNodes /
//     reorderInputThumb —— 输入引用缩略图的拖拽排序交互。
//   【第二段】@mention 提及系统 + 生成请求引用图片收集：
//     mentionTokenHtml / promptHtmlWithMentionTokens —— 把提示词文本里的
//     @提及 token 渲染成带缩略图的 HTML。
//     snapshotRunMeta / attachRunMeta / stripRunInputMeta /
//     stripImageGenerationMeta —— 生成结果的运行元信息快照/清理。
//     upstreamNodesForKinds / inputNodesFor / workflowInputNodesFor /
//     imagesForNode / nodeHasReferenceContent / isSelfReferenceForNode /
//     candidateInputImagesFor / defaultInputImagesFor /
//     generatedUpstreamImagesFor / splitSmartPromptItems /
//     outputImagesForNode / selfReferenceImagesForNode / textForNode /
//     promptInputNodesFor / inputPromptTextFor / inputImagesFor /
//     workflowInputImagesFor / isGeneratedResultNode / runInputRefsForNode /
//     inputRefKey / blockedInputRefKeys / isInputRefBlocked /
//     activeInputImagesFor / toggleInputRefBlocked / defaultReferenceImagesFor /
//     lineConnectionsFor / connectedLineNodeIds / upstreamLineNodeIds /
//     lineImagesFor / collectMentionedImagesFromPrompt / uniqueReferenceImages /
//     visibleReferenceImagesFor —— 根据画布连线关系、@提及内容、候选池等
//     多种来源，计算一个节点在生成时实际会用到哪些"输入引用图片"，是
//     整个画布最复杂的一套推导逻辑。
//     inputMentionCandidateImages / mentionCandidateThumbnailUrl /
//     assetRegisteredUris / assetMentionCandidateImages / mentionCandidateImages /
//     referenceImagesFor —— @提及选择器候选图片来源（资产库/画布节点/
//     输入引用）汇总。
//     closeMentionPicker / saveMentionRange / textBeforeCaret /
//     renderMentionPicker / showMentionPicker / positionMentionPickerAtCaret /
//     maybeOpenMentionPicker / insertMentionToken —— @提及选择器弹出面板
//     的定位、渲染、光标位置追踪、插入 token 交互。
//     collectPromptParts / originalPromptTextFromParts / buildPromptRequest ——
//     最终把提示词文本 + 引用图片组装成发给后端的生成请求体，是本系统的
//     出口函数。
//
// 依赖的外部全局（刻意留在 static/js/canvas.js / main.js 里，
// 通过共享脚本作用域访问，未随本文件迁移）：
//   状态变量：nodes, viewport, settings（只读，可能被 renderPromptComposer
//     等函数修改属性但不整体重新赋值）, mentionPickerState 及其它 mention
//     相关的少量顶层 let 状态（如果存在，均留在 main.js，被本文件读写，
//     被顶层事件处理器——M20 已具名化的 promptInputInputHandler/
//     promptInputKeydownHandler 等——也读写，跨函数可变状态耦合，原因
//     同 M16/M17/M19）
//   DOM 元素常量：promptComposer, promptInput, mentionPicker,
//     mentionPreview 等一系列 #id 元素（文件顶部 const，只读访问）
//   通用工具：tr/escapeHtml/escapeAttr/refreshIcons（utils.js，M1）
//   已拆分模块函数：nodeRect（node-layout.js，M3）、render（canvas-render.js，
//     M7）、disconnectConnection（connections.js，M4）、renderAssetLibrary/
//     assetCategories/assetLibraries/assetCategoryForMention/assetMediaKind
//     （asset-library.js，M9）、smartLoopInputImages/smartLoopPrompt
//     （loop-node.js，M2）、resolveChatModel/resolveChatProviderId/rhActiveFields/
//     rhDefaultPromptSuggestion/rhFieldIndexes/rhFieldKind/rhParamKey/
//     rhRequiresPrompt/smartPromptInputEnabledForSettings/
//     syncRhConfigForRefs（generation-settings.js，M10）、
//     isAudioMediaItem/isVideoMediaItem/mediaKindForItem/imageForDisplay/
//     imageRefsOnly/audioRefsOnly/videoRefsOnly/videoPosterHtml/
//     fileIdFromUrl/filePreviewUrl/renderedThumbSrcForRef/thumbMediaUrl
//     （media-display.js，M11）
//   main.js 里仍保留的函数：selectedNode, promptPlainText, scheduleSave,
//     pushUndo, isSmartImageNode, isSmartGroupCompactMember, smartGroupMembers,
//     smartGroupImageRefs, smartImageMode, smartImageUsesWorkflowInput,
//     smartRuleTemplateOptions, runPromptLLMNode
//
// 反过来，main.js 里仍保留的以下部分会调用本文件里的函数（通过共享
// 脚本作用域，未做任何改动）：
//   canvas-render.js（M7）的 render() 调用 updatePromptComposer()
//   顶层事件处理器（M20 已具名化）：promptInputInputHandler 调用
//     maybeOpenMentionPicker；promptInputKeydownHandler 也可能涉及
//     mention picker 导航；nodeAssetSaveXxx 系列不涉及本文件。
//   bindPromptNodeControls/promptNodeBodyHtml（smart-prompt 节点自身
//     渲染逻辑，留在 main.js）可能调用 renderInputPromptPreview 等
//     展示函数。
//   runGeneration 一类的生成触发函数（留在 main.js）调用 buildPromptRequest
//     构建最终生成请求。
//
// 刻意排除（留在 main.js，物理上夹在两段区间中间，但完全是不同的
// 子系统，命名容易引起误判）：
//   StorageQuotaSignal / quotaDataFromPayload / checkQuotaWarningFromResult /
//   smartResponseError / smartResponseErrorMessage —— M6 阶段确认的通用
//   配额/错误处理基础设施，被 cascade-run.js（M5）大量调用，跟本文件
//   毫无关系，只是物理上恰好写在两段之间。
//   sizeForRun / expectedOutputSize / explicitRequestOutputSizeForPending /
//   pendingSizeFromImageRef / pendingSourceBoxSize / displayBoxFromNaturalSize /
//   pendingBaseBoxSize / pendingBoxSize —— 生成任务的"预期输出尺寸"计算，
//   是渲染占位框大小用的，跟本文件的"引用图片收集"是完全不同的关注点，
//   命名有点像（都跟"图片尺寸"相关）但不要混淆。
//   updateComposer / positionComposerForNode —— 操作的是另一个 DOM 元素
//   `composer`（图片生成节点的参数面板），不是本文件的 `promptComposer`
//   （提示词节点的 composer 面板），两者是完全独立的 UI，名字相似但是
//   不同的两个面板，M21 评估时特别确认过这一点，避免混淆导致误拆。
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
    const entries = chatApiProviders().flatMap(provider => (provider.chat_models || []).map(model => ({
        providerId: provider.id,
        model,
        label: modelDisplayName(model, provider.id),
        locked: !smartModelAllowed(provider.id, model)
    })));
    const current = entries.find(entry => entry.providerId === node.llmProvider && entry.model === node.llmModel);
    const modelControl = `<div class="smart-control model-control prompt-composer-model-control">
        <button class="smart-pill" type="button"><i data-lucide="message-square"></i><span class="sub">${escapeHtml(current?.label || node.llmModel || tr('smart.model'))}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.model'))}</div>
            <div class="model-list">
                ${entries.map(entry => {
                    const locked = entry.locked;
                    const active = entry.providerId === node.llmProvider && entry.model === node.llmModel;
                    return `<button type="button" class="direct-option prompt-composer-model-option ${active ? 'active' : ''} ${locked ? 'is-locked' : ''}" data-prompt-model="${escapeAttr(entry.model)}" data-prompt-provider-id="${escapeAttr(entry.providerId)}" ${locked ? `title="${escapeAttr(tr('smart.modelLocked'))}"` : ''}><span>${escapeHtml(entry.label)}</span>${locked ? '<i data-lucide="lock" class="lock-icon"></i>' : ''}</button>`;
                }).join('') || `<div class="muted-note">${escapeHtml(tr('smart.noChatModel') || tr('smart.model'))}</div>`}
            </div>
        </div>
    </div>`;
    return `${modelControl}
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
    const modelPill = promptComposerParams?.querySelector('.prompt-composer-model-control > .smart-pill');
    if(modelPill) modelPill.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        const control = modelPill.parentElement;
        const wasPinned = control.classList.contains('pinned');
        document.querySelectorAll('.smart-control.pinned').forEach(item => item.classList.remove('pinned'));
        if(!wasPinned) control.classList.add('pinned');
    };
    promptComposerParams?.querySelectorAll('.prompt-composer-model-option').forEach(modelEl => {
        modelEl.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            if(modelEl.classList.contains('is-locked')){
                toast(tr('smart.modelLocked'));
                return;
            }
            node.llmProvider = resolveChatProviderId(modelEl.dataset.promptProviderId || '');
            node.llmModel = modelEl.dataset.promptModel || '';
            renderPromptComposer(node);
            scheduleSave();
        };
    });
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

function promptNodeInputMediaForLLM(node){
    const refs = smartImageUsesWorkflowInput(node) ? workflowInputImagesFor(node) : inputImagesFor(node);
    return (refs || []).filter(ref => ref?.url);
}

function promptNodeInputImages(node){
    if(!node) return [];
    return promptNodeInputMediaForLLM(node);
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
// frontend/src/canvas/connections.js（经典 <script>，同上）。
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
// frontend/src/canvas/loop-node.js（经典 <script>，同上）。
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
// M2 拆分：upstreamLoopPromptNodesFor 已迁移到 frontend/src/canvas/loop-node.js。
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
    // A generation node can be created directly by the Agent and carry its
    // prompt in `text`, without an upstream smart-prompt connection. Include
    // that text in the same request path used by manually created nodes.
    const ownPrompt = promptEnabled && node?.type === 'smart-image'
        ? String(node.text || '').trim()
        : '';
    // node.text is loaded into the editor as the initial draft for Agent-created
    // nodes. Only use it here when there is still no editor or upstream prompt,
    // otherwise the same prompt would be sent twice.
    if(inputPrompt) body = [inputPrompt, body].filter(Boolean).join('\n\n');
    if(!body && ownPrompt) body = ownPrompt;
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
