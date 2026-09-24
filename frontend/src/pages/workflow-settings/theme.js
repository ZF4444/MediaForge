try {
  const theme = localStorage.getItem('studio_theme') || localStorage.getItem('canvas_theme') || 'dark';
  document.documentElement.classList.toggle('studio-theme-dark', theme === 'dark');
  document.documentElement.classList.toggle('theme-dark', theme === 'dark');
} catch {}
