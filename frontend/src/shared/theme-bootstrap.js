function readStoredTheme() {
    let theme = 'dark';
    try {
        theme = localStorage.getItem('studio_theme') || localStorage.getItem('canvas_theme') || theme;
    } catch {}
    return theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement?.classList?.toggle('studio-theme-dark', dark);
    document.documentElement?.classList?.toggle('theme-dark', dark);
    document.body?.classList?.toggle('studio-theme-dark', dark);
    document.body?.classList?.toggle('theme-dark', dark);
}

let listening = false;

// 页面加载时套用已保存的主题，并持续响应后续切换：
// - 首页（iframe 宿主）切换主题时 postMessage({ type: 'studio-theme', theme })
// - 其它标签页/窗口改动 localStorage 时触发 storage 事件
export function applyStoredTheme() {
    applyTheme(readStoredTheme());
    if (listening || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    listening = true;
    window.addEventListener('message', event => {
        if (event.data?.type === 'studio-theme') applyTheme(event.data.theme === 'dark' ? 'dark' : 'light');
    });
    window.addEventListener('storage', event => {
        if (event.key === 'studio_theme' || event.key === 'canvas_theme') applyTheme(readStoredTheme());
    });
}
