// index.html（应用外壳/app shell）—— 主题/语言跨 iframe 同步子系统
// （拆分自 static/index.html 内联 <script>）。
//
// 范围：外壳自身的主题切换按钮（toggleTheme）、语言切换按钮
// （toggleLanguage）、把主题/语言变化广播给全部子页面 iframe
// （broadcastTheme/broadcastLanguage，通过 postMessage 通知每个
// iframe）、单个 iframe 的主题/语言同步（syncThemeToFrame/
// syncLanguageToFrame，用于新加载的 iframe 或首次挂载）、主题图标
// 状态更新（updateThemeIcon，切换太阳/月亮图标）。这几个函数是外壳跟
// 全部子页面之间"全局设置"同步的唯一渠道——每个子页面自己不维护
// 主题/语言状态，都是被外壳通过 postMessage 告知。
//
// 经典 <script>，非 ES module，原因同 help-feedback.js。
// `static/index.html` 里 `toggleTheme()`/`toggleLanguage()` 被内联
// onclick 直接引用，经典脚本顶层函数声明自动挂到共享作用域，跨文件
// 依然可以被内联属性解析到。
//
// **本次迁移顺带修复的一个既存 bug**：`toggleLanguage()` 原来还调用了
// `updateProjectUpdateTitle()`/`refreshUpdateButtonText()`/
// `refreshProjectUpdateModalText()` 这三个全项目里都没有定义的函数——
// 每次点击语言切换按钮都会在 `syncLanguageToFrame` 执行完之后抛出
// `ReferenceError`（应该是某个"检测项目更新"相关功能被删除后遗留的
// 死代码引用）。语言本身确实会切换成功（崩溃前的代码已经执行完），
// 但控制台会有一个未捕获异常。这个 bug 跟本次模块拆分无关，是迁移
// 过程中读代码时顺带发现并清理的。
//
// 依赖 main.js 保留的全局对象：window.StudioTheme/window.StudioI18n
// （分别由 static/js/theme.js 和 static/js/i18n.js/i18n-core.js 提供，
// 这两个脚本在 <script> 加载顺序里排在 index.html 的内联脚本之前）。
// 没有跟 main.js 直接的函数级依赖。

        // --- 夜间模式 ---

        function syncThemeToFrame(iframe) {
            const theme = (window.StudioTheme || {get: () => 'dark'}).get();
            try {
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'studio-theme', theme }, '*');
                }
            } catch (e) {}
        }

        function broadcastTheme(theme) {
            if (window.StudioTheme) {
                window.StudioTheme.set(theme);
            }
            document.querySelectorAll('iframe').forEach(f => syncThemeToFrame(f));
            updateThemeIcon(theme);
        }

        function updateThemeIcon(theme) {
            const moon = document.getElementById('icon-moon');
            const sun = document.getElementById('icon-sun');
            if (theme === 'dark') {
                moon.style.display = 'none';
                sun.style.display = 'block';
            } else {
                moon.style.display = 'block';
                sun.style.display = 'none';
            }
        }

        function toggleTheme() {
            const current = window.StudioTheme ? window.StudioTheme.get() : 'dark';
            broadcastTheme(current === 'dark' ? 'light' : 'dark');
        }

        function toggleLanguage() {
            if(!window.StudioI18n) return;
            window.StudioI18n.toggle();
            document.querySelectorAll('iframe').forEach(frame => syncLanguageToFrame(frame));
        }

        function syncLanguageToFrame(frame) {
            if(!window.StudioI18n) return;
            try {
                frame.contentWindow?.postMessage({ type:'studio-lang', lang:window.StudioI18n.lang() }, '*');
            } catch(e) {}
        }

        function broadcastLanguage() {
            document.querySelectorAll('iframe').forEach(frame => {
                try {
                    frame.contentWindow?.postMessage({ type:'studio-lang', lang:window.StudioI18n.lang() }, '*');
                } catch(e) {}
            });
        }

        // listen for theme changes triggered by theme.js
        window.addEventListener('studio-theme-change', (e) => {
            updateThemeIcon(e.detail.theme);
        });

        // init icon state on load
        window.addEventListener('DOMContentLoaded', () => {
            const theme = window.StudioTheme ? window.StudioTheme.get() : 'dark';
            updateThemeIcon(theme);
            if(window.StudioI18n) window.StudioI18n.apply();
            broadcastLanguage();
        });

        // sync theme when iframe loads
        document.querySelectorAll('iframe').forEach(f => {
            f.addEventListener('load', () => {
                syncThemeToFrame(f);
                syncLanguageToFrame(f);
            });
        });
