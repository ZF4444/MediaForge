// index.html（应用外壳/app shell）—— 主题跨 iframe 同步子系统
// （拆分自 static/index.html 内联 <script>）。
//
// 范围：外壳自身的主题切换按钮（toggleTheme）、把主题变化广播给
// 全部子页面 iframe、主题图标
// 状态更新（updateThemeIcon，切换太阳/月亮图标）。这几个函数是外壳跟
// 全部子页面之间"全局设置"同步的唯一渠道。
//
// 经典 <script>，非 ES module，原因同 help-feedback.js。
// `static/index.html` 里 `toggleTheme()` 被内联
// onclick 直接引用，经典脚本顶层函数声明自动挂到共享作用域，跨文件
// 依然可以被内联属性解析到。
//
// 依赖 main.js 保留的全局对象：window.StudioTheme。
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

        // listen for theme changes triggered by theme.js
        window.addEventListener('studio-theme-change', (e) => {
            updateThemeIcon(e.detail.theme);
        });

        // init icon state on load
        window.addEventListener('DOMContentLoaded', () => {
            const theme = window.StudioTheme ? window.StudioTheme.get() : 'dark';
            updateThemeIcon(theme);
        });

        // sync theme when iframe loads
        document.querySelectorAll('iframe').forEach(f => {
            f.addEventListener('load', () => {
                syncThemeToFrame(f);
            });
        });
