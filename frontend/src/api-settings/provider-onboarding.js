// api-settings 页面 —— 供应商引导卡片子系统（拆分自 static/js/api-settings.js）。
//
// 范围：新用户首次接触 RunningHub 供应商时展示的引导卡片
// （renderProviderOnboarding，指引填 Key、给出获取 Key 的链接）、引导卡片
// 里的输入同步（syncOnboardingKeyInput）、RunningHub 引导卡的一键保存
// （saveOnboardingRunningHubKey）、"应用默认配置"按钮的逻辑
// （applyProviderOnboardingDefaults，给供应商填入默认 base_url/协议/模型
// 列表）。
//
// 经典 <script>，非 ES module，原因同 rh-workflow-editor.js（api-settings.html
// 的内联 onclick 依赖 window 全局函数，见 frontend/README.md）。
//
// 依赖 main.js 保留的核心状态和函数：providers/selectedId（核心供应商
// 状态）、provider()/renderEditor()/syncEditor()/saveProviders()（供应商
// CRUD 编辑器核心）、setStatus/refreshIcons（通用工具）、
// ensureRunningHubLists（拆分到 rh-workflow-editor.js 的函数，跨模块调用）。

function isNewUserProvider(item){
    if(!item) return false;
    if(item.id === 'runninghub') return !item.has_key;
    return false;
}
function renderProviderOnboarding(item){
    if(!providerOnboardingCard) return;
    const guide = ONBOARDING_GUIDES[item?.id];
    // 独立的 RH 应用管理页必须直接展示应用列表和创建入口，不能被 Key 引导卡遮挡。
    const visible = !isRunningHubAppsPage && Boolean(guide && isNewUserProvider(item));
    providerOnboardingCard.hidden = !visible;
    document.body.classList.toggle('show-provider-onboarding', visible);
    if(!visible){
        providerOnboardingCard.innerHTML = '';
        return;
    }
    if(item.id === 'runninghub'){
        providerOnboardingCard.innerHTML = `
            <div class="onboarding-head">
                <div>
                    <div class="onboarding-title">${escapeHtml(tr(guide.titleKey))}</div>
                    <div class="onboarding-desc">${escapeHtml(tr(guide.descKey))}</div>
                </div>
                <span class="onboarding-badge">${escapeHtml(tr('api.onboardingNew'))}</span>
            </div>
            <div class="onboarding-step-panel onboarding-rh-linear-panel">
                <div class="onboarding-rh-panel-head">
                    <div>
                        <div class="onboarding-step-title">${escapeHtml(tr('api.rhOnboardingStep'))}</div>
                    </div>
                    <i data-lucide="key-round" class="onboarding-rh-icon w-4 h-4"></i>
                </div>
                <div class="onboarding-rh-linear-rows">
                    <div class="onboarding-rh-linear-row">
                        <div class="onboarding-rh-source-group">
                            <div class="onboarding-rh-source-label">API Key</div>
                            <div class="onboarding-key-actions onboarding-rh-key-actions">
                                <a class="onboarding-key-btn" href="${escapeAttr(guide.primaryUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="coins" class="w-3.5 h-3.5"></i><span>${escapeHtml(tr(guide.primaryLabelKey))}</span></a>
                                <a class="onboarding-key-btn" href="${escapeAttr(guide.secondaryUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="globe-2" class="w-3.5 h-3.5"></i><span>${escapeHtml(tr(guide.secondaryLabelKey))}</span></a>
                            </div>
                        </div>
                        <div class="onboarding-flow-arrow onboarding-rh-row-arrow" aria-hidden="true"><span></span><b></b></div>
                        <label class="onboarding-key-field onboarding-rh-row-field">
                            <span>API Key</span>
                            <input type="password" value="${escapeAttr(rhFreeKeyInput?.value || '')}" placeholder="${escapeAttr(tr('api.rhPlaceholder'))}" oninput="syncOnboardingKeyInput('runninghub', this.value)">
                        </label>
                    </div>
                </div>
                <div class="onboarding-rh-save-line">
                    <button class="onboarding-save-btn onboarding-rh-save-all" type="button" onclick="saveOnboardingRunningHubKey()"><i data-lucide="check" class="w-3.5 h-3.5"></i><span>${escapeHtml(tr('api.save'))}</span></button>
                </div>
            </div>
        `;
        refreshIcons();
    }
}
function syncOnboardingKeyInput(kind, value){
    if(kind === 'runninghub' && rhFreeKeyInput) rhFreeKeyInput.value = value || '';
    else if(keyInput) keyInput.value = value || '';
}
async function saveOnboardingRunningHubKey(){
    const freeKey = rhFreeKeyInput?.value.trim() || '';
    if(!freeKey){ alert(tr('api.rhEnterAlert')); return; }
    const item = provider();
    if(!item || item.id !== 'runninghub') return;
    syncEditor();
    const ok = await saveProviders();
    if(ok && rhFreeKeyInput) rhFreeKeyInput.value = '';
}
function applyProviderOnboardingDefaults(id){
    const item = providers.find(provider => provider.id === id);
    if(!item) return;
    if(id === 'runninghub'){
        item.base_url = RH_DEFAULT_BASE_URL;
        item.protocol = 'runninghub';
        item.image_models = unique([...(item.image_models || []), ...RH_DEFAULT_IMAGE_MODELS]);
        ensureRunningHubLists(item);
    } else if(id === 'volcengine'){
        item.base_url = VOLCENGINE_DEFAULT_BASE_URL;
        item.protocol = 'volcengine';
        item.video_models = unique([...(item.video_models || []), ...VOLCENGINE_DEFAULT_VIDEO_MODELS]);
        item.volcengine_project_name = item.volcengine_project_name || VOLCENGINE_DEFAULT_PROJECT_NAME;
        item.volcengine_region = item.volcengine_region || VOLCENGINE_DEFAULT_REGION;
    }
    selectedId = item.id;
    renderEditor();
    setStatus('已显示默认配置，填写 Key 后点击保存生效');
}
function refreshProviderOnboarding(){
    renderProviderOnboarding(provider());
    refreshIcons();
}
