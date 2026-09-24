try {
    const theme = localStorage.getItem('studio_theme') || localStorage.getItem('canvas_theme') || 'dark';
    if (theme === 'dark') document.documentElement.classList.add('studio-theme-dark', 'theme-dark');
} catch {}
