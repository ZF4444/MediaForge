// index.html（应用外壳/app shell）—— 帮助面板 + 反馈组件 + 系统公告子系统
// （拆分自 static/index.html 内联 <script>）。
//
// 范围三块，物理上相邻、逻辑各自独立：
// 1. 反馈组件（initFeedbackWidget IIFE）：用户提交反馈的弹层——打开/
//    关闭（openFeedback/closeFeedback）、提交（submitFeedback）。
// 2. 帮助面板（initHelpDrawer IIFE）：每个功能页面的帮助文档——按
//    当前激活的 iframe 读取对应帮助内容（getHelpPage）、极简 Markdown
//    渲染（renderMarkdown，手写的行内/列表/代码块解析，不依赖第三方库）、
//    预览/编辑模式切换（setMode）、加载/保存帮助内容
//    （loadHelp/saveHelp）、面板宽度可拖拽调整并记忆
//    （initHelpResize/setHelpWidth/getHelpWidth）。
// 3. 系统公告（announcementSeenKey/showAnnouncementModal + 页面加载时
//    的公告检查 IIFE）：管理员可以推送全局公告，用户看过一次后不再
//    弹出（用 localStorage 记录已读状态）。
//
// 三块都是经典 <script>（非 ES module，原因见 frontend/README.md），
// 且前两块本身已经用 IIFE 包裹形成私有作用域（这是原作者就采用的写法，
// 不是本次迁移引入的）——这意味着 initFeedbackWidget/initHelpDrawer
// 内部的函数（openFeedback/closeHelp 等）不会污染全局作用域，物理搬移
// 这两个 IIFE 到独立文件是本次会话里风险最低的一类拆分：整个 IIFE
// 作为一个不可分割的单元搬移，内部实现完全不变。
//
// 跨模块桥接：initHelpDrawer 内部有一行 `window.closeHelpDrawer =
// closeHelp;`（显式挂到 window），这是因为 main.js 保留的 switchUI
// 函数需要在切换页面时调用 window.closeHelpDrawer()
// 收起帮助面板——由于 closeHelp 本身是 IIFE 私有作用域里的函数，只能
// 通过显式挂到 window 才能被外部访问，这行代码原样保留，未做任何改动。
//
// 依赖 main.js 保留的函数：无实质依赖（三块内部只用到 DOM/localStorage/
// fetch/window.StudioI18n/window.StudioTheme 等浏览器和全局对象）。
// main.js 里的 WebSocket 消息处理器（ws.onmessage）会调用本模块的
// showAnnouncementModal（收到 `announcement` 类型消息时），是本模块被
// main.js 反向调用的唯一入口。

        (function initFeedbackWidget(){
            function activePageId() {
                const frame = document.querySelector('.stage iframe.active');
                return frame ? frame.id.replace('frame-', '') : '';
            }
            function setFeedbackStatus(msg, kind) {
                const el = document.getElementById('feedbackStatus');
                if (!el) return;
                el.textContent = msg || '';
                el.className = 'feedback-status' + (kind ? ' ' + kind : '');
            }
            function openFeedback() {
                const overlay = document.getElementById('feedbackOverlay');
                const input = document.getElementById('feedbackContent');
                if (!overlay) return;
                overlay.classList.add('open');
                overlay.setAttribute('aria-hidden', 'false');
                setFeedbackStatus('');
                window.setTimeout(() => input && input.focus(), 0);
            }
            function closeFeedback() {
                const overlay = document.getElementById('feedbackOverlay');
                if (!overlay) return;
                overlay.classList.remove('open');
                overlay.setAttribute('aria-hidden', 'true');
            }
            async function submitFeedback() {
                const type = document.getElementById('feedbackType');
                const content = document.getElementById('feedbackContent');
                const btn = document.getElementById('feedbackSubmitBtn');
                const text = (content && content.value || '').trim();
                if (!text) {
                    setFeedbackStatus('请输入反馈内容。', 'err');
                    return;
                }
                btn.disabled = true;
                setFeedbackStatus('发送中...');
                try {
                    const res = await fetch('/api/feedback', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            type: type ? type.value : 'issue',
                            content: text,
                            page: activePageId(),
                            user_agent: navigator.userAgent || ''
                        })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.detail || ('HTTP ' + res.status));
                    if (content) content.value = '';
                    setFeedbackStatus('已提交。', 'ok');
                    window.setTimeout(closeFeedback, 700);
                } catch(e) {
                    setFeedbackStatus('提交失败：' + e.message, 'err');
                } finally {
                    btn.disabled = false;
                }
            }
            document.addEventListener('DOMContentLoaded', function(){
                const openBtn = document.getElementById('feedbackOpenBtn');
                const closeBtn = document.getElementById('feedbackCloseBtn');
                const submitBtn = document.getElementById('feedbackSubmitBtn');
                const overlay = document.getElementById('feedbackOverlay');
                if (openBtn) openBtn.addEventListener('click', openFeedback);
                if (closeBtn) closeBtn.addEventListener('click', closeFeedback);
                if (submitBtn) submitBtn.addEventListener('click', submitFeedback);
                if (overlay) {
                    overlay.addEventListener('click', function(e){
                        if (e.target === overlay) closeFeedback();
                    });
                }
                window.addEventListener('keydown', function(e){
                    if (e.key === 'Escape') closeFeedback();
                });
            }, { once:true });
        })();
        (function initHelpDrawer(){
            // 帮助内容按「当前激活的功能页面」独立存储：index.html 是外壳，
            // 各功能模块（画布、视角粗调、视角微调等）以 iframe 形式加载，
            // 因此页面标识需要动态读取当前激活的 iframe（#frame-xxx），而非外壳自身的 URL。
            function getHelpPage() {
                const frame = document.querySelector('.stage iframe.active');
                const id = frame ? frame.id.replace(/^frame-/, '') : '';
                return id || 'canvas';
            }
            function getHelpPageLabel(pageId) {
                const expected = `switchUI(this, '${pageId}')`;
                const trigger = Array.from(document.querySelectorAll('[onclick]')).find(el =>
                    (el.getAttribute('onclick') || '').includes(expected)
                );
                const nav = trigger?.querySelector('.nav-text, .side-pill-text');
                return nav ? nav.textContent.trim() : pageId;
            }
            const state = { loaded:false, canEdit:false, mode:'preview', content:'', page:'' };
            function escapeHtml(raw) {
                return String(raw == null ? '' : raw)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }
            function renderInline(text) {
                let html = escapeHtml(text);
                html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
                html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
                html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
                return html;
            }
            function renderMarkdown(markdown) {
                const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
                const out = [];
                let inCode = false;
                let code = [];
                const listStack = [];
                function closeListItem(list) {
                    if (list && list.itemOpen) {
                        out.push('</li>');
                        list.itemOpen = false;
                    }
                }
                function closeLists(targetIndent) {
                    while (listStack.length && listStack[listStack.length - 1].indent > targetIndent) {
                        closeListItem(listStack[listStack.length - 1]);
                        out.push('</' + listStack.pop().type + '>');
                    }
                }
                function closeAllLists() {
                    closeLists(-1);
                }
                function ensureList(type, indent) {
                    closeLists(indent);
                    let top = listStack[listStack.length - 1];
                    if (top && top.indent === indent && top.type !== type) {
                        closeListItem(top);
                        out.push('</' + listStack.pop().type + '>');
                        top = listStack[listStack.length - 1];
                    }
                    if (!top || top.indent < indent) {
                        out.push('<' + type + '>');
                        listStack.push({ type, indent, itemOpen:false });
                    }
                }
                function addListItem(type, indent, text) {
                    ensureList(type, indent);
                    const current = listStack[listStack.length - 1];
                    closeListItem(current);
                    out.push('<li>' + renderInline(text));
                    current.itemOpen = true;
                }
                function closeCode() {
                    if (inCode) {
                        out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
                        code = [];
                        inCode = false;
                    }
                }
                lines.forEach(line => {
                    if (/^```/.test(line)) {
                        if (inCode) closeCode();
                        else {
                            closeAllLists();
                            inCode = true;
                            code = [];
                        }
                        return;
                    }
                    if (inCode) {
                        code.push(line);
                        return;
                    }
                    if (!line.trim()) {
                        closeAllLists();
                        return;
                    }
                    let m = line.match(/^(#{1,3})\s+(.+)$/);
                    if (m) {
                        closeAllLists();
                        out.push('<h' + m[1].length + '>' + renderInline(m[2]) + '</h' + m[1].length + '>');
                        return;
                    }
                    m = line.match(/^>\s?(.*)$/);
                    if (m) {
                        closeAllLists();
                        out.push('<blockquote>' + renderInline(m[1]) + '</blockquote>');
                        return;
                    }
                    m = line.match(/^(\s*)[-*]\s+(.+)$/);
                    if (m) {
                        addListItem('ul', m[1].replace(/\t/g, '    ').length, m[2]);
                        return;
                    }
                    m = line.match(/^(\s*)\d+\.\s+(.+)$/);
                    if (m) {
                        addListItem('ol', m[1].replace(/\t/g, '    ').length, m[2]);
                        return;
                    }
                    closeAllLists();
                    out.push('<p>' + renderInline(line) + '</p>');
                });
                closeCode();
                closeAllLists();
                return out.join('\n') || '<p>暂无帮助内容。</p>';
            }
            function setHelpStatus(msg, kind) {
                const el = document.getElementById('helpStatus');
                if (!el) return;
                el.textContent = msg || '';
                el.className = 'help-status' + (kind ? ' ' + kind : '');
            }
            const HELP_WIDTH_KEY = 'mediaforge_help_drawer_width';
            const HELP_DEFAULT_WIDTH = 480;
            const HELP_MIN_WIDTH = 360;
            function getHelpMaxWidth() {
                return Math.max(HELP_MIN_WIDTH, window.innerWidth - 24);
            }
            function clampHelpWidth(width) {
                return Math.min(getHelpMaxWidth(), Math.max(HELP_MIN_WIDTH, Math.round(width)));
            }
            function setHelpWidth(width, persist) {
                const drawer = document.getElementById('helpDrawer');
                if (!drawer) return;
                const next = clampHelpWidth(width);
                drawer.style.setProperty('--help-drawer-width', next + 'px');
                if (persist) {
                    try { localStorage.setItem(HELP_WIDTH_KEY, String(next)); } catch(e) {}
                }
            }
            function getHelpWidth() {
                const drawer = document.getElementById('helpDrawer');
                if (!drawer) return HELP_DEFAULT_WIDTH;
                return drawer.getBoundingClientRect().width || HELP_DEFAULT_WIDTH;
            }
            function resetHelpWidth() {
                try { localStorage.removeItem(HELP_WIDTH_KEY); } catch(e) {}
                setHelpWidth(HELP_DEFAULT_WIDTH, false);
            }
            function initHelpResize() {
                const drawer = document.getElementById('helpDrawer');
                const handle = document.getElementById('helpResizeHandle');
                if (!drawer || !handle) return;
                try {
                    const saved = Number(localStorage.getItem(HELP_WIDTH_KEY));
                    setHelpWidth(Number.isFinite(saved) && saved > 0 ? saved : HELP_DEFAULT_WIDTH, false);
                } catch(e) {
                    setHelpWidth(HELP_DEFAULT_WIDTH, false);
                }
                let resizing = false;
                function stopResize() {
                    if (!resizing) return;
                    resizing = false;
                    drawer.classList.remove('resizing');
                    document.body.classList.remove('help-resizing');
                    setHelpWidth(getHelpWidth(), true);
                }
                handle.addEventListener('pointerdown', function(e){
                    if (window.matchMedia('(max-width: 760px)').matches) return;
                    resizing = true;
                    drawer.classList.add('resizing');
                    document.body.classList.add('help-resizing');
                    handle.setPointerCapture(e.pointerId);
                    e.preventDefault();
                });
                handle.addEventListener('pointermove', function(e){
                    if (!resizing) return;
                    setHelpWidth(window.innerWidth - e.clientX, false);
                });
                handle.addEventListener('pointerup', stopResize);
                handle.addEventListener('pointercancel', stopResize);
                handle.addEventListener('dblclick', resetHelpWidth);
                handle.addEventListener('keydown', function(e){
                    const current = getHelpWidth();
                    if (e.key === 'ArrowLeft') {
                        setHelpWidth(current + 24, true);
                        e.preventDefault();
                    } else if (e.key === 'ArrowRight') {
                        setHelpWidth(current - 24, true);
                        e.preventDefault();
                    } else if (e.key === 'Home') {
                        setHelpWidth(HELP_MIN_WIDTH, true);
                        e.preventDefault();
                    } else if (e.key === 'End') {
                        setHelpWidth(getHelpMaxWidth(), true);
                        e.preventDefault();
                    }
                });
                window.addEventListener('resize', function(){
                    setHelpWidth(getHelpWidth(), false);
                });
            }
            function setMode(mode) {
                if (mode === 'edit' && !state.canEdit) mode = 'preview';
                state.mode = mode;
                const preview = document.getElementById('helpPreview');
                const editor = document.getElementById('helpEditor');
                const previewBtn = document.getElementById('helpPreviewBtn');
                const editBtn = document.getElementById('helpEditBtn');
                const saveBtn = document.getElementById('helpSaveBtn');
                // 仅管理员可编辑：只有在管理员从编辑模式切回预览模式时，
                // 才需要把 textarea 里未保存的修改同步回 state.content。
                // 普通用户没有编辑器交互，editor.value 始终是初始空值，不能用它覆盖已加载的内容。
                if (editor && mode === 'preview' && state.canEdit) state.content = editor.value;
                if (preview) {
                    preview.innerHTML = renderMarkdown(state.content);
                    preview.style.display = mode === 'preview' ? '' : 'none';
                }
                if (editor) {
                    editor.value = state.content;
                    editor.style.display = mode === 'edit' ? '' : 'none';
                }
                if (previewBtn) previewBtn.classList.toggle('active', mode === 'preview');
                if (editBtn) editBtn.classList.toggle('active', mode === 'edit');
                if (saveBtn) saveBtn.style.display = state.canEdit ? '' : 'none';
            }
            async function loadHelp() {
                state.page = getHelpPage();
                const titleEl = document.getElementById('helpTitlePage');
                if (titleEl) titleEl.textContent = '· ' + getHelpPageLabel(state.page);
                setHelpStatus('加载中...');
                try {
                    const res = await fetch('/api/help?page=' + encodeURIComponent(state.page), { credentials:'same-origin' });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.detail || ('HTTP ' + res.status));
                    state.loaded = true;
                    const meRes = await fetch('/api/access-control/me', { credentials:'same-origin' });
                    const me = meRes.ok ? await meRes.json().catch(() => ({})) : {};
                    state.canEdit = Array.isArray(me.pages) && me.pages.includes('user-management');
                    state.content = data.content || '';
                    const previewBtn = document.getElementById('helpPreviewBtn');
                    const editBtn = document.getElementById('helpEditBtn');
                    if (previewBtn) previewBtn.style.display = state.canEdit ? '' : 'none';
                    if (editBtn) editBtn.style.display = state.canEdit ? '' : 'none';
                    setMode(state.canEdit ? 'edit' : 'preview');
                    setHelpStatus(state.canEdit ? '当前用户类型可编辑帮助内容。' : '');
                } catch(e) {
                    setHelpStatus('加载失败：' + e.message, 'err');
                }
            }
            function openHelp() {
                const drawer = document.getElementById('helpDrawer');
                if (!drawer) return;
                drawer.classList.add('open');
                drawer.setAttribute('aria-hidden', 'false');
                // 每次打开都重新拉取最新内容，避免复用旧会话中缓存的过期/空内容
                // （例如管理员在其他会话更新了帮助文档后，普通用户无需刷新整页即可看到）。
                loadHelp();
            }
            function closeHelp() {
                const drawer = document.getElementById('helpDrawer');
                if (!drawer) return;
                drawer.classList.remove('open');
                drawer.setAttribute('aria-hidden', 'true');
            }
            // 暴露给外部（如 switchUI 切换功能页时）调用，以便切换 tab 时自动收起帮助面板。
            window.closeHelpDrawer = closeHelp;
            async function saveHelp() {
                if (!state.canEdit) return;
                const editor = document.getElementById('helpEditor');
                const btn = document.getElementById('helpSaveBtn');
                state.content = editor ? editor.value : state.content;
                btn.disabled = true;
                setHelpStatus('保存中...');
                try {
                    const res = await fetch('/api/help', {
                        method:'PUT',
                        credentials:'same-origin',
                        headers:{ 'Content-Type':'application/json' },
                        body: JSON.stringify({ content: state.content, page: state.page || getHelpPage() })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.detail || ('HTTP ' + res.status));
                    state.content = data.content || '';
                    setMode(state.mode);
                    setHelpStatus('已保存。', 'ok');
                } catch(e) {
                    setHelpStatus('保存失败：' + e.message, 'err');
                } finally {
                    btn.disabled = false;
                }
            }
            document.addEventListener('DOMContentLoaded', function(){
                const openBtn = document.getElementById('helpOpenBtn');
                const closeBtn = document.getElementById('helpCloseBtn');
                const previewBtn = document.getElementById('helpPreviewBtn');
                const editBtn = document.getElementById('helpEditBtn');
                const saveBtn = document.getElementById('helpSaveBtn');
                const editor = document.getElementById('helpEditor');
                initHelpResize();
                if (openBtn) openBtn.addEventListener('click', openHelp);
                if (closeBtn) closeBtn.addEventListener('click', closeHelp);
                if (previewBtn) previewBtn.addEventListener('click', () => setMode('preview'));
                if (editBtn) editBtn.addEventListener('click', () => setMode('edit'));
                if (saveBtn) saveBtn.addEventListener('click', saveHelp);
                if (editor) editor.addEventListener('input', () => { state.content = editor.value; });
            }, { once:true });
        })();
        // --- 全局广播弹窗 ---
        function announcementSeenKey(id) { return 'studio_announcement_seen_' + id; }

        function showAnnouncementModal(announcement) {
            if (!announcement || !announcement.id || !announcement.content) return;
            try {
                if (localStorage.getItem(announcementSeenKey(announcement.id))) return;
            } catch (e) {}
            if (document.getElementById('announcementOverlay')) return; // 避免重复弹出

            var overlay = document.createElement('div');
            overlay.id = 'announcementOverlay';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;';

            var box = document.createElement('div');
            box.style.cssText = 'background:var(--sidebar-bg,var(--bg,#fff));color:var(--text,#1a1f29);border-radius:12px;max-width:680px;width:100%;max-height:min(82vh,760px);padding:22px 22px 18px;box-shadow:0 20px 60px rgba(0,0,0,.25);border:1px solid var(--border,#e5e7eb);display:flex;flex-direction:column;';

            var head = document.createElement('div');
            head.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;margin-bottom:12px;';
            head.innerHTML = '<span>📣</span><span>系统公告</span>';

            var body = document.createElement('div');
            body.className = 'markdown-content';
            body.style.cssText = 'min-height:0;max-height:60vh;overflow:auto;margin-bottom:18px;padding-right:4px;';
            body.innerHTML = window.MediaForgeMarkdown.render(announcement.content, { emptyText: '暂无公告内容' });

            var footer = document.createElement('div');
            footer.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;';
            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.textContent = '我知道了';
            closeBtn.style.cssText = 'height:36px;padding:0 18px;border-radius:9px;border:1px solid var(--text,#1a1f29);background:var(--text,#1a1f29);color:var(--bg,#fff);font-size:13px;font-weight:700;cursor:pointer;';

            function dismiss() {
                try { localStorage.setItem(announcementSeenKey(announcement.id), '1'); } catch (e) {}
                overlay.remove();
                document.removeEventListener('keydown', onKeydown);
            }
            function onKeydown(e) { if (e.key === 'Escape') dismiss(); }

            closeBtn.addEventListener('click', dismiss);
            overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(); });
            document.addEventListener('keydown', onKeydown);

            footer.appendChild(closeBtn);
            box.appendChild(head);
            box.appendChild(body);
            box.appendChild(footer);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
        }

        // 页面加载/刷新时补显示尚未手动关闭的最新公告
        (async function checkLatestAnnouncementOnLoad() {
            try {
                const res = await fetch('/api/announcement/latest', { credentials: 'same-origin' });
                if (!res.ok) return;
                const data = await res.json();
                if (data && data.announcement) {
                    showAnnouncementModal(data.announcement);
                }
            } catch (e) {}
        })();
