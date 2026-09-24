import { StudioTheme } from 'virtual:mediaforge-theme';

        // --- 夜间模式 ---

        export function syncThemeToFrame(iframe) {
            const theme = StudioTheme.get();
            try {
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'studio-theme', theme }, '*');
                }
            } catch (e) {}
        }

        function broadcastTheme(theme) {
            StudioTheme.set(theme);
            document.querySelectorAll('iframe').forEach(f => syncThemeToFrame(f));
            updateThemeIcon(theme);
        }

        function updateThemeIcon(theme) {
            const moon = document.getElementById('icon-moon');
            const sun = document.getElementById('icon-sun');
            if (theme === 'dark') {
                moon.classList.add('is-hidden');
                sun.classList.remove('is-hidden');
            } else {
                moon.classList.remove('is-hidden');
                sun.classList.add('is-hidden');
            }
        }

        export function toggleTheme() {
            const current = StudioTheme.get();
            broadcastTheme(current === 'dark' ? 'light' : 'dark');
        }

        // listen for theme changes triggered by theme.js
        window.addEventListener('studio-theme-change', (e) => {
            updateThemeIcon(e.detail.theme);
        });

        // init icon state on load
        const initializeThemeIcon = () => updateThemeIcon(StudioTheme.get());
        if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', initializeThemeIcon, { once: true });
        else initializeThemeIcon();

        // sync theme when iframe loads
        document.querySelectorAll('iframe').forEach(f => {
            f.addEventListener('load', () => {
                syncThemeToFrame(f);
            });
        });
