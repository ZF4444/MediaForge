export function applyStoredTheme() {
    let theme = 'dark';
    try {
        theme = localStorage.getItem('studio_theme') || localStorage.getItem('canvas_theme') || theme;
    } catch {}
    const dark = theme === 'dark';
    document.documentElement?.classList?.toggle('studio-theme-dark', dark);
    document.documentElement?.classList?.toggle('theme-dark', dark);
}
