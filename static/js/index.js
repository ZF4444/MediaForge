// index.html（应用外壳/app shell）主体逻辑。
//
// 这是本次会话第一次把"内联 <script>"变成独立外部文件（前四次迁移
// 的 static/js/<page>.js 本来就已经是外部文件），原内容原样从
// static/index.html 的内联 <script> 标签里搬出来，未做任何逻辑改动
// （唯一的例外是顺带修复了一个既存 bug，见
// frontend/src/index/theme-lang-sync.js 顶部注释）。
//
// 范围：唯一客户端 id 生成/持久化（generateUUID/CID）、侧边栏固定/
// 收起状态管理（setSidebarPinned/toggleSidebarPinned/
// restoreSidebarPinned）、本地功能分组折叠状态
// （setLocalNavCollapsed/toggleLocalNav/restoreLocalNav）、核心的
// iframe 页面切换调度（switchUI——处理"离开确认"页面守卫消息、通知
// 被切走的页面、切换 active 类名和加载 iframe src、恢复本地导航折叠
// 状态）、跨 iframe 广播供应商/工作流/ComfyUI 实例变更消息
// （forwardStudioApiChange）、页面刷新后恢复上次激活的页面
// （restoreActivePage）、按登录用户的权限裁剪侧边栏可见入口
// （applyAccessControl）、到 `/ws/stats` 的 WebSocket 连接（在线人数/
// 云端状态/画布更新/资产库更新等消息的接收和跨 iframe 转发）。
//
// 经典 <script>，非 ES module：跟其它四个页面同样的方法论（见
// frontend/README.md），本页面有内联 onclick 直接引用顶层函数
// （比如导航菜单项的 onclick="switchUI(this, 'canvas')"）。
//
// **`switchUI` 是整个应用最核心的调度函数，判断为不拆**：它是这个
// "应用外壳"页面唯一真正意义上的调度中枢——负责 iframe 切换的全部
// 副作用（激活态切换/离开确认/通知子页面/恢复导航折叠状态/画布刷新
// 通知），跟 asset-manager 的 handleClick、api-settings 的
// syncEditor/renderEditor 是完全相同的角色。
//
// window.__pageLeaveGuards（各子页面通过 postMessage 声明"离开前需要
// 确认"的守卫状态）和 WebSocket 连接（ws 变量）都是这个文件独有的
// 全局可变状态，没有被拆分到任何模块。
//
// 依赖 frontend/src/index/ 下几个模块提供的函数：window.closeHelpDrawer
// （由 help-feedback.js 的 initHelpDrawer IIFE 显式挂到 window，
// switchUI 切换页面时调用它收起帮助面板）、showAnnouncementModal
// （由 help-feedback.js 提供，WebSocket 收到 announcement 类型消息时
// 调用）。

        function generateUUID() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                try { return crypto.randomUUID(); } catch (e) { }
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        const CID = localStorage.getItem("client_id") || generateUUID();
        localStorage.setItem("client_id", CID);
        const ACTIVE_PAGE_KEY = 'studio_active_page';
        const LOCAL_NAV_COLLAPSED_KEY = 'studio_local_nav_collapsed';
        const SIDEBAR_PINNED_KEY = 'studio_sidebar_pinned';
        const DEFAULT_PAGE_ID = 'canvas';
        const PAGE_IDS = ['angle','gaussian','pose-studio','gpt-chat','canvas','asset-manager','my-account','api-settings','comfyui-settings','user-management','feedback-admin','broadcast-admin'];
        const LEGACY_USER_MANAGEMENT_TABS = {'access-control':'access','storage-quota':'quota'};
        const LOCAL_PAGE_IDS = ['angle','gaussian','pose-studio'];

        function setSidebarPinned(pinned, options = {}) {
            const sidebar = document.getElementById('studioSidebar');
            const logo = document.getElementById('sidebarLogoToggle');
            if(!sidebar) return;
            sidebar.classList.toggle('is-pinned', pinned);
            if(!pinned) {
                sidebar.classList.add('is-collapsing');
                window.setTimeout(() => sidebar.classList.remove('is-collapsing'), 360);
            } else {
                sidebar.classList.remove('is-collapsing');
            }
            if(logo) {
                logo.setAttribute('aria-pressed', pinned ? 'true' : 'false');
                logo.title = pinned ? '收起导航栏' : '固定导航栏';
            }
            if(!options.skipRemember) localStorage.setItem(SIDEBAR_PINNED_KEY, pinned ? '1' : '0');
        }

        function toggleSidebarPinned(event) {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            const sidebar = document.getElementById('studioSidebar');
            setSidebarPinned(!sidebar?.classList.contains('is-pinned'));
        }

        function restoreSidebarPinned() {
            setSidebarPinned(localStorage.getItem(SIDEBAR_PINNED_KEY) === '1', { skipRemember:true });
        }

        function setLocalNavCollapsed(collapsed, options = {}) {
            const group = document.getElementById('local-nav-group');
            const toggle = document.getElementById('local-nav-toggle');
            if(group) group.classList.toggle('is-collapsed', collapsed);
            if(toggle) {
                toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                toggle.title = collapsed ? '展开定制功能' : '折叠定制功能';
            }
            if(!options.skipRemember) localStorage.setItem(LOCAL_NAV_COLLAPSED_KEY, collapsed ? '1' : '0');
        }

        function toggleLocalNav() {
            const group = document.getElementById('local-nav-group');
            setLocalNavCollapsed(!group?.classList.contains('is-collapsed'));
        }

        function restoreLocalNav(id) {
            const savedCollapsed = localStorage.getItem(LOCAL_NAV_COLLAPSED_KEY) === '1';
            setLocalNavCollapsed(savedCollapsed && !LOCAL_PAGE_IDS.includes(id), { skipRemember:true });
        }

        function resetStudioRootScroll() {
            try {
                window.scrollTo(0, 0);
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
            } catch(e) {}
        }

        // 声明了"离开需确认"的页面集合（由子页面通过 page-guard 消息维护）
        window.__pageLeaveGuards = window.__pageLeaveGuards || {};

        function switchUI(el, id, options = {}) {
            resetStudioRootScroll();
            const legacyUserTab = LEGACY_USER_MANAGEMENT_TABS[id] || '';
            if(legacyUserTab) id = 'user-management';
            if(!PAGE_IDS.includes(id)) id = DEFAULT_PAGE_ID;

            // 离开前确认：若当前激活页声明了守卫且非强制切换，则先询问该页能否离开
            try {
                const prevFrame = document.querySelector('.stage iframe.active');
                if (!options.force && prevFrame && prevFrame.id !== ('frame-' + id) && prevFrame.contentWindow) {
                    const prevId = prevFrame.id.replace('frame-', '');
                    if (window.__pageLeaveGuards[prevId]) {
                        // 交给子页面弹确认框；用户确认后会回传 page-leave-allow，再由宿主 force 切换
                        prevFrame.contentWindow.postMessage({ type: 'page-leave-check', from: prevId, target: id }, '*');
                        return; // 暂不切换，等待子页面回复
                    }
                }
            } catch(e) {}

            // 通知被切走的当前激活页面（用于自重置等）
            try {
                const prevFrame = document.querySelector('.stage iframe.active');
                if (prevFrame && prevFrame.id !== ('frame-' + id) && prevFrame.contentWindow) {
                    const prevId = prevFrame.id.replace('frame-', '');
                    prevFrame.contentWindow.postMessage({ type: 'page-hidden', page: prevId }, '*');
                }
            } catch(e) {}
            document.querySelectorAll('.nav-item,.side-pill').forEach(n => n.classList.remove('active'));
            if(el) el.classList.add('active');
            document.querySelectorAll('iframe').forEach(f => f.classList.remove('active'));
            const target = document.getElementById('frame-' + id);
            if(id === 'user-management' && legacyUserTab && !target.src) target.dataset.src = `/static/user-management.html#${legacyUserTab}`;
            target.classList.add('active');
            // 切换功能页面时自动收起帮助面板：不同页面的帮助内容互相独立，
            // 避免面板停留在旧页面的内容上造成误解。
            if (typeof window.closeHelpDrawer === 'function') window.closeHelpDrawer();
            const notifyAccountFocus = () => {
                if (id !== 'my-account') return;
                try { target.contentWindow?.postMessage({ type: 'account-focus' }, '*'); } catch(e) {}
            };
            if (!target.src) {
                target.addEventListener('load', notifyAccountFocus, { once:true });
                target.src = target.dataset.src;
            } else {
                notifyAccountFocus();
            }
            if(!options.skipRemember) localStorage.setItem(ACTIVE_PAGE_KEY, id);
            // sync theme to newly activated iframe
            syncThemeToFrame(target);
            syncLanguageToFrame(target);
            if(LOCAL_PAGE_IDS.includes(id)) {
                setLocalNavCollapsed(false, { skipRemember:true });
            } else {
                setLocalNavCollapsed(localStorage.getItem(LOCAL_NAV_COLLAPSED_KEY) === '1', { skipRemember:true });
            }
            // 切换到画布时通知刷新工作流列表（防止在 comfyui-settings 修改后画布未及时更新）
            if (id === 'canvas' && target.src) {
                try { target.contentWindow?.postMessage({ type: 'canvas-focus' }, '*'); } catch(e) {}
            }
            resetStudioRootScroll();
        }

        function forwardStudioApiChange(data) {
            if(!data || !['providers-changed','workflows-changed','comfy-instances-changed'].includes(data.type)) return;
            document.querySelectorAll('iframe').forEach(iframe => {
                try {
                    if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(data, '*');
                } catch(e) {}
            });
        }

        window.addEventListener('message', event => {
            if (event.origin && event.origin !== location.origin) return;
            const d = event.data || {};
            if (d.type === 'studio-open-asset-storage') {
                try { localStorage.setItem('asset_manager_requested_tab', 'storage'); } catch(e) {}
                const trigger = document.querySelector(`[onclick*="'asset-manager'"],[onclick*='"asset-manager"']`);
                const frame = document.getElementById('frame-asset-manager');
                const notifyStorageTab = () => {
                    try { frame?.contentWindow?.postMessage({type:'asset-manager-open-tab', tab:'storage'}, location.origin); } catch(e) {}
                };
                if(frame && !frame.src) frame.addEventListener('load', notifyStorageTab, {once:true});
                switchUI(trigger, 'asset-manager');
                notifyStorageTab();
                return;
            }
            // 子页面声明/取消"离开需确认"守卫
            if (d.type === 'page-guard' && d.page) {
                window.__pageLeaveGuards[d.page] = !!d.active;
                return;
            }
            // 子页面确认离开后，宿主强制切换到目标页
            if (d.type === 'page-leave-allow' && d.target) {
                window.__pageLeaveGuards[d.from] = false; // 放行后解除守卫，避免再次拦截
                const trigger = document.querySelector(`[onclick*="'${d.target}'"],[onclick*='"${d.target}"']`);
                switchUI(trigger, d.target, { force: true });
                return;
            }
            forwardStudioApiChange(event.data);
        });

        try {
            const studioApiChannel = new BroadcastChannel('studio-api');
            studioApiChannel.onmessage = event => forwardStudioApiChange(event.data);
        } catch(e) {}

        function restoreActivePage() {
            restoreSidebarPinned();
            const savedId = localStorage.getItem(ACTIVE_PAGE_KEY);
            const id = PAGE_IDS.includes(savedId) || LEGACY_USER_MANAGEMENT_TABS[savedId] ? savedId : DEFAULT_PAGE_ID;
            if(LEGACY_USER_MANAGEMENT_TABS[id]) localStorage.setItem(ACTIVE_PAGE_KEY, 'user-management');
            restoreLocalNav(id);
            const trigger = LEGACY_USER_MANAGEMENT_TABS[id] ? document.getElementById('nav-user-management') : document.querySelector(`[onclick*="'${id}'"],[onclick*='"${id}"']`);
            switchUI(trigger, id, { skipRemember:true });
            document.documentElement.classList.remove('studio-route-booting');
        }
        document.addEventListener('DOMContentLoaded', restoreActivePage, { once:true });

        // --- 访问控制：按当前用户权限过滤侧边栏页面入口 ---
        async function applyAccessControl() {
            let me;
            try {
                const res = await fetch('/api/access-control/me', { credentials:'same-origin' });
                if (!res.ok) return;            // 未登录/异常时不做裁剪，保持默认全开
                me = await res.json();
            } catch(e) { return; }

            const isAdmin = !!(me && me.is_admin);
            // 仅 admin 显示用户管理入口
            const userManagementNav = document.getElementById('nav-user-management');
            if (userManagementNav) userManagementNav.style.display = isAdmin ? '' : 'none';
            const feedbackAdminNav = document.getElementById('nav-feedback-admin');
            if (feedbackAdminNav) feedbackAdminNav.style.display = isAdmin ? '' : 'none';
            const broadcastAdminNav = document.getElementById('nav-broadcast-admin');
            if (broadcastAdminNav) broadcastAdminNav.style.display = isAdmin ? '' : 'none';
            const apiSettingsNav = document.getElementById('nav-api-settings');
            if (apiSettingsNav) apiSettingsNav.style.display = isAdmin ? '' : 'none';
            // 仅 admin 显示 online/queue 监控
            const nanoMon = document.getElementById('nano-monitor');
            if (nanoMon) nanoMon.style.display = isAdmin ? '' : 'none';
            if (isAdmin) return;               // admin 拥有全部权限，无需裁剪

            const allowed = new Set(me && Array.isArray(me.pages) ? me.pages : PAGE_IDS);
            let hidActive = false;
            PAGE_IDS.forEach(pid => {
                if (pid === 'my-account' || pid === 'user-management' || pid === 'feedback-admin' || pid === 'broadcast-admin') return;   // 账户页始终开放；其余入口由管理员处理
                if (allowed.has(pid)) return;
                // 隐藏对应导航入口（nav-item 或 side-pill）
                document.querySelectorAll(`[onclick*="'${pid}'"],[onclick*='"${pid}"']`).forEach(el => {
                    el.style.display = 'none';
                    if (el.classList.contains('active')) hidActive = true;
                });
            });
            // 若当前激活页被裁剪，回退到第一个允许的页面
            if (hidActive) {
                const fallback = PAGE_IDS.find(p => p !== 'user-management' && p !== 'feedback-admin' && p !== 'broadcast-admin' && allowed.has(p)) || DEFAULT_PAGE_ID;
                const trigger = document.querySelector(`[onclick*="'${fallback}'"],[onclick*='"${fallback}"']`);
                switchUI(trigger, fallback);
            }
        }
        document.addEventListener('DOMContentLoaded', applyAccessControl, { once:true });


        const host = window.location.host;
        if (host) {
            const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
            const ws = new WebSocket(`${protocol}://${host}/ws/stats?client_id=${CID}`);
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'stats') {
                    document.getElementById('online-val').innerText = data.online_count;
                } else if (data.type === 'cloud_status') {
                    const iframe = document.querySelector('iframe.active');
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.postMessage(data, '*');
                    }
                } else if (data.type === 'canvas_updated') {
                    const iframe = document.querySelector('iframe.active');
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.postMessage(data, '*');
                    }
                } else if (data.type === 'asset_library_updated') {
                    document.querySelectorAll('iframe').forEach(iframe => {
                        if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(data, '*');
                    });
                } else if (data.type === 'announcement') {
                    showAnnouncementModal(data.data);
                }
            };
        }
