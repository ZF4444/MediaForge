// api-settings 页面 —— "推荐 API"弹层子系统（拆分自 static/js/api-settings.js）。
//
// 范围：推荐 API 面板的打开/关闭（openRecommendApi/closeRecommendApi）、
// 面板与常规设置面板之间的切换视图同步（syncRecommendView）、面板内容
// 渲染（renderRecommendApi，遍历 RECOMMENDED_APIS 常量渲染每个推荐平台的
// 卡片）、"一键保存"逻辑（saveRecommendedApi，找到或创建对应供应商并
// 填入 Key）、根据推荐平台信息查找/创建供应商条目
// （recommendedProviderForApi）。
//
// 经典 <script>，非 ES module，原因同 rh-workflow-editor.js。
//
// 依赖 main.js 保留的核心状态和函数：providers/selectedId（核心供应商
// 状态）、RECOMMENDED_APIS（推荐平台配置常量）、renderProviderList/
// renderEditor/syncEditor/saveProviders（供应商编辑器核心）、
// normalizeId/unique（通用工具）、renderProviderOnboarding（拆分到
// provider-onboarding.js 的函数，跨模块调用）。recommendInlineOpen
// （是否处于推荐面板模式）留在 main.js，因为它同时被 provider-onboarding.js
// 使用（引导卡片在推荐面板打开时要隐藏）。

function openRecommendApi(){
    recommendInlineOpen = true;
    syncRecommendView();
    renderRecommendApi();
    renderProviderOnboarding(provider());
}
function closeRecommendApi(){
    if(recommendApiOverlay) recommendApiOverlay.style.display = 'none';
    recommendInlineOpen = false;
    syncRecommendView();
    renderRecommendApi();
    renderEditor();
}
function syncRecommendView(){
    if(settingsContent) settingsContent.hidden = recommendInlineOpen;
    if(recommendContent) recommendContent.hidden = !recommendInlineOpen;
    const recommendTitle = recommendContent?.querySelector('.editor-title');
    const recommendSub = recommendContent?.querySelector('.editor-sub');
    if(recommendTitle) recommendTitle.textContent = tr('api.recommendPanelTitle');
    if(recommendSub) recommendSub.textContent = tr('api.recommendPanelSub');
    document.body.classList.toggle('show-recommend-mode', recommendInlineOpen);
}
function renderRecommendApi(){
    if(!recommendPanel) return;
    if(!recommendInlineOpen){
        recommendPanel.innerHTML = '';
        return;
    }
    const html = RECOMMENDED_APIS.map((api, index) => `
        <section class="recommend-card recommend-platform-card" style="--recommend-index:${index}">
            <div class="recommend-platform-info">
                <div class="recommend-platform-head">
                    <div>
                        <div class="recommend-name"><span>${escapeHtml(api.name)}</span></div>
                    </div>
                    <span class="recommend-badge">${escapeHtml(api.protocol === 'apimart' ? 'APIMart' : 'OpenAI')}</span>
                </div>
                <p class="recommend-platform-summary">${escapeHtml(tr(api.summaryKey))}</p>
                <div class="recommend-tags">
                    ${api.perkKey ? `<span class="recommend-tag recommend-perk-tag"><i data-lucide="gift" class="w-3 h-3"></i><span>${escapeHtml(tr(api.perkKey))}</span></span>` : ''}
                    ${(api.tagKeys || []).map(tag => `<span class="recommend-tag">${escapeHtml(tag.startsWith('api.') ? tr(tag) : tag)}</span>`).join('')}
                </div>
            </div>
            <div class="recommend-platform-setup">
                <div class="recommend-setup-title">${escapeHtml(tr('api.recommendQuickSetup'))}</div>
                <div class="recommend-quick-stack recommend-setup-flow">
                    <div class="recommend-guide-source onboarding-rh-source-group">
                        <div class="onboarding-rh-source-label">${escapeHtml(tr('api.getKey'))}</div>
                        <div class="onboarding-key-actions onboarding-rh-key-actions recommend-single-action">
                            <a class="onboarding-key-btn recommend-guide-key-btn" href="${escapeAttr(api.register_url)}" target="_blank" rel="noopener noreferrer"><i data-lucide="key-round" class="w-3.5 h-3.5"></i><span>${escapeHtml(tr('api.getKey'))}</span></a>
                        </div>
                    </div>
                    <div class="recommend-flow-arrow onboarding-flow-arrow recommend-guide-arrow" aria-hidden="true"><span></span><b></b></div>
                    <div class="recommend-guide-save">
                        <label class="onboarding-key-field onboarding-rh-row-field">
                            <span>API Key</span>
                            <input type="password" data-recommend-key="${index}" placeholder="${escapeAttr(trf('api.recommendKeyPlaceholder', {name:api.name}))}">
                        </label>
                        <button class="onboarding-save-btn recommend-guide-save-btn" type="button" onclick="saveRecommendedApi(${index})"><span>${escapeHtml(tr('api.save'))}</span></button>
                    </div>
                </div>
            </div>
        </section>
    `).join('');
    recommendPanel.innerHTML = `
        <div class="onboarding-head">
            <div>
                <div class="onboarding-title">${escapeHtml(tr('api.recommendPanelTitle'))}</div>
                <div class="onboarding-desc">${escapeHtml(tr('api.recommendPanelDesc'))}</div>
            </div>
        </div>
        <div class="recommend-api-body recommend-inline-body">${html}</div>
        <div class="recommend-note">${escapeHtml(tr('api.recommendApiNote'))}</div>
        <div class="recommend-account-invite">
            <div>
                <div class="recommend-account-title">${escapeHtml(tr('api.recommendAccountTitle'))}</div>
                <div class="recommend-account-desc">${escapeHtml(tr('api.recommendAccountDesc'))}</div>
            </div>
            <a class="onboarding-key-btn recommend-account-link" href="https://bewild.ai?code=WULIDX" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link" class="w-3.5 h-3.5"></i><span>${escapeHtml(tr('api.viewPlans'))}</span></a>
        </div>
    `;
    refreshIcons();
}
function recommendedProviderForApi(api){
    let item = providers.find(provider => String(provider.name || '').toLowerCase() === api.name.toLowerCase());
    if(item) return item;
    const baseId = normalizeId(api.name) || 'custom-api';
    let id = baseId;
    let suffix = 2;
    while(providers.some(provider => provider.id === id)) id = `${baseId}-${suffix++}`;
    item = {
        id,
        name:api.name,
        base_url:api.base_url,
        protocol:api.protocol,
        image_generation_endpoint:'',
        image_edit_endpoint:'',
        enabled:true,
        primary:false,
        image_models:Array.isArray(api.image_models) ? [...api.image_models] : [],
        chat_models:Array.isArray(api.chat_models) ? [...api.chat_models] : [],
        video_models:Array.isArray(api.video_models) ? [...api.video_models] : [],
        model_protocols:(api.model_protocols && typeof api.model_protocols === 'object') ? {...api.model_protocols} : {},
        has_key:false,
        key_preview:''
    };
    providers.push(item);
    return item;
}
async function saveRecommendedApi(index){
    const api = RECOMMENDED_APIS[index];
    if(!api) return;
    const input = recommendPanel?.querySelector(`[data-recommend-key="${index}"]`);
    const key = input?.value.trim() || '';
    if(!key){ alert(tr('api.enterApiKey')); return; }
    const item = recommendedProviderForApi(api);
    selectedId = item.id;
    recommendInlineOpen = false;
    syncRecommendView();
    renderProviderList();
    renderEditor();
    keyInput.value = key;
    if(protocolInput){
        protocolInput.value = api.protocol;
        protocolInput.dispatchEvent(new Event('change'));
    }
    syncEditor();
    const ok = await saveProviders();
    if(ok) setStatus(trf('api.recommendSaved', {name:api.name}));
}
