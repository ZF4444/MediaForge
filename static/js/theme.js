(function(){
    const KEY = 'studio_theme';
    const LEGACY_KEY = 'canvas_theme';
    const SCALE_KEY = 'studio_ui_scale_mode';
    const SCALE_OPTIONS = ['auto', '100', '115', '125', '140'];

    function currentTheme(){
        return localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || 'dark';
    }

    function applyTheme(theme){
        const next = theme === 'dark' ? 'dark' : 'light';
        const dark = next === 'dark';
        document.documentElement.classList.toggle('studio-theme-dark', dark);
        document.documentElement.classList.toggle('theme-dark', dark);
        if(document.body){
            document.body.classList.toggle('studio-theme-dark', dark);
            document.body.classList.toggle('theme-dark', dark);
        }
        window.dispatchEvent(new CustomEvent('studio-theme-change', { detail: { theme: next } }));
    }

    function ensureScaleStyle(){
        if(document.getElementById('studio-scale-style')) return;
        const style = document.createElement('style');
        style.id = 'studio-scale-style';
        style.textContent = `
            html.studio-scale-managed {
                --studio-ui-scale: 1;
            }
            html.studio-ui-scaled body:not(.studio-scale-host) {
                width: calc(100% / var(--studio-ui-scale)) !important;
                min-height: calc(100vh / var(--studio-ui-scale)) !important;
                zoom: var(--studio-ui-scale);
            }
            html.studio-ui-scaled body.studio-scale-viewport:not(.studio-scale-host) {
                height: calc(100vh / var(--studio-ui-scale)) !important;
            }
            html.studio-ui-scaled body:not(.studio-scale-host) > .app-shell,
            html.studio-ui-scaled body:not(.studio-scale-host) > .shell,
            html.studio-ui-scaled body:not(.studio-scale-host) > .asset-page {
                width: calc(100% / var(--studio-ui-scale)) !important;
            }
            html.studio-ui-scaled body:not(.studio-scale-host) > .app-shell,
            html.studio-ui-scaled body:not(.studio-scale-host) > .shell {
                height: calc(100vh / var(--studio-ui-scale)) !important;
            }
            html.studio-ui-scaled body:not(.studio-scale-host) > .asset-page {
                min-height: calc(100vh / var(--studio-ui-scale)) !important;
            }
            @supports not (zoom: 1) {
                html.studio-ui-scaled body:not(.studio-scale-host) {
                    zoom: 1;
                    transform: scale(var(--studio-ui-scale));
                    transform-origin: 0 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function isFramed(){
        try {
            return window.self !== window.top;
        } catch(e) {
            return true;
        }
    }

    function normalizeScaleMode(mode){
        return SCALE_OPTIONS.includes(mode) ? mode : 'auto';
    }

    function currentScaleMode(){
        try {
            return normalizeScaleMode(localStorage.getItem(SCALE_KEY) || 'auto');
        } catch(e) {
            return 'auto';
        }
    }

    function autoScale(){
        const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
        const screenLong = Math.max(window.screen?.width || 0, window.screen?.height || 0);
        const viewportLong = Math.max(window.innerWidth || 0, window.innerHeight || 0);
        const longEdge = Math.max(screenLong, viewportLong);
        if(dpr >= 1.35) return 1;
        if(longEdge >= 3600) return 1.22;
        if(longEdge >= 3000) return 1.16;
        if(longEdge >= 2500 && dpr <= 1.15) return 1.1;
        return 1;
    }

    function scaleForMode(mode){
        const next = normalizeScaleMode(mode);
        if(next === 'auto') return autoScale();
        return Math.max(1, Math.min(1.4, Number(next) / 100));
    }

    function updateScaleBodyClasses(){
        if(!document.body) return;
        const hasFrameHost = !!document.querySelector('.app-shell iframe, iframe.active');
        document.body.classList.toggle('studio-scale-host', hasFrameHost && !isFramed());
        const computed = window.getComputedStyle(document.body);
        const viewportLocked = computed.overflow === 'hidden' || computed.overflowY === 'hidden' || !!document.querySelector('.app-shell, .shell');
        document.body.classList.toggle('studio-scale-viewport', viewportLocked);
    }

    function scaleOptedOut(){
        return document.documentElement.dataset.studioScale === 'off';
    }

    function applyScale(mode){
        ensureScaleStyle();
        const next = normalizeScaleMode(mode);
        const optedOut = scaleOptedOut();
        const value = optedOut ? 1 : scaleForMode(next);
        const scaled = !optedOut && Math.abs(value - 1) > 0.01;
        document.documentElement.classList.add('studio-scale-managed');
        document.documentElement.classList.toggle('studio-ui-scaled', scaled);
        document.documentElement.style.setProperty('--studio-ui-scale', value.toFixed(3));
        updateScaleBodyClasses();
        window.dispatchEvent(new CustomEvent('studio-ui-scale-change', { detail: { mode: next, scale: value } }));
    }

    function broadcastScale(mode){
        document.querySelectorAll('iframe').forEach(frame => {
            try {
                frame.contentWindow?.postMessage({ type: 'studio-ui-scale', mode }, '*');
            } catch(e) {}
        });
    }

    function setScaleMode(mode, shouldBroadcast = true){
        const next = normalizeScaleMode(mode);
        try {
            localStorage.setItem(SCALE_KEY, next);
        } catch(e) {}
        applyScale(next);
        if(shouldBroadcast) broadcastScale(next);
    }

    let resizeTimer = null;
    function scheduleAutoScaleRefresh(){
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if(currentScaleMode() === 'auto') {
                applyScale('auto');
                broadcastScale('auto');
            }
        }, 160);
    }

    window.StudioTheme = {
        key: KEY,
        get: currentTheme,
        apply: applyTheme,
        set(theme){
            const next = theme === 'dark' ? 'dark' : 'light';
            localStorage.setItem(KEY, next);
            localStorage.setItem(LEGACY_KEY, next);
            applyTheme(next);
        }
    };

    window.StudioScale = {
        key: SCALE_KEY,
        options: SCALE_OPTIONS.slice(),
        getMode: currentScaleMode,
        getScale: () => scaleForMode(currentScaleMode()),
        apply: applyScale,
        set: setScaleMode
    };

    applyTheme(currentTheme());
    applyScale(currentScaleMode());

    document.addEventListener('DOMContentLoaded', () => {
        applyTheme(currentTheme());
        applyScale(currentScaleMode());
    });
    window.addEventListener('message', event => {
        if(event.data?.type === 'studio-theme') applyTheme(event.data.theme);
        if(event.data?.type === 'studio-ui-scale') setScaleMode(event.data.mode, false);
    });
    window.addEventListener('storage', event => {
        if(event.key === KEY || event.key === LEGACY_KEY) applyTheme(currentTheme());
        if(event.key === SCALE_KEY) applyScale(currentScaleMode());
    });
    window.addEventListener('resize', scheduleAutoScaleRefresh);
})();

/* --- 当前用户 + 登出 小组件（随 theme.js 注入到所有页面）--- */
(function(){
    // 只在顶层窗口渲染，避免 iframe 子页面重复出现。
    try { if(window.self !== window.top) return; } catch(e) { return; }
    if(window.__studioUserWidgetLoaded) return;
    window.__studioUserWidgetLoaded = true;

    function injectStyle(){
        if(document.getElementById('studio-user-widget-style')) return;
        const style = document.createElement('style');
        style.id = 'studio-user-widget-style';
        style.textContent = `
            #studio-user-widget {
                position: fixed;
                left: 14px;
                bottom: 14px;
                z-index: 99999;
                display: none;
                align-items: center;
                gap: 8px;
                padding: 6px 8px 6px 12px;
                background: var(--monitor-bg, rgba(255,255,255,0.85));
                border: 1px solid var(--monitor-border, rgba(0,0,0,0.08));
                border-radius: 999px;
                box-shadow: 0 4px 14px var(--monitor-shadow, rgba(0,0,0,0.06));
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
                font-size: 12.5px;
                color: var(--text, #121212);
                backdrop-filter: blur(8px);
                user-select: none;
            }
            #studio-user-widget .suw-dot {
                width: 7px; height: 7px; border-radius: 50%;
                background: #30a46c; flex-shrink: 0;
            }
            #studio-user-widget .suw-name {
                font-weight: 600; max-width: 160px;
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            #studio-user-widget .suw-logout {
                cursor: pointer;
                border: none;
                background: transparent;
                color: var(--muted, #999);
                font-size: 12px;
                font-weight: 600;
                padding: 4px 8px;
                border-radius: 999px;
                transition: background 0.15s, color 0.15s;
                font-family: inherit;
            }
            #studio-user-widget .suw-logout:hover {
                background: var(--nav-hover-bg, #fafafa);
                color: var(--text, #121212);
            }
        `;
        document.head.appendChild(style);
    }

    async function logout(){
        try {
            await fetch('/auth/logout', { method: 'POST' });
        } catch(e) {}
        window.location.href = '/login';
    }

    function render(username){
        injectStyle();
        let el = document.getElementById('studio-user-widget');
        if(!el){
            el = document.createElement('div');
            el.id = 'studio-user-widget';
            el.innerHTML = `
                <span class="suw-dot"></span>
                <span class="suw-name" id="suw-name"></span>
                <button class="suw-logout" id="suw-logout" title="退出登录">登出</button>
            `;
            document.body.appendChild(el);
            el.querySelector('#suw-logout').addEventListener('click', logout);
        }
        const nameEl = el.querySelector('#suw-name');
        nameEl.textContent = username;
        nameEl.title = username;
        el.style.display = 'flex';
    }

    async function init(){
        try {
            const resp = await fetch('/auth/me', { headers: { 'Accept': 'application/json' } });
            if(!resp.ok) return;  // 未登录则不显示（页面本身会被后端重定向到登录页）
            const data = await resp.json();
            if(data && data.authenticated){
                render(data.username || data.user_id || '用户');
            }
        } catch(e) {}
    }

    if(document.body){
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
