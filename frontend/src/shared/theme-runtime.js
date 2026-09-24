const THEME_KEYS = ['studio_theme', 'canvas_theme'];
const SCALE_KEY = 'studio_ui_scale_mode';
const SCALE_OPTIONS = ['auto', '100', '115', '125', '140'];

function getTheme() {
  try {
    for (const key of THEME_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value === 'dark' ? 'dark' : 'light';
    }
  } catch {}
  return 'dark';
}

function normalizeScaleMode(mode) {
  return SCALE_OPTIONS.includes(mode) ? mode : 'auto';
}

function getScaleMode() {
  try {
    return normalizeScaleMode(localStorage.getItem(SCALE_KEY) || 'auto');
  } catch {
    return 'auto';
  }
}

function scaleForMode(mode) {
  const normalized = normalizeScaleMode(mode);
  if (normalized !== 'auto') return Math.max(1, Math.min(1.4, Number(normalized) / 100));
  const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
  const edge = Math.max(window.screen?.width || 0, window.screen?.height || 0, window.innerWidth || 0, window.innerHeight || 0);
  if (dpr >= 1.35) return 1;
  if (edge >= 3600) return 1.22;
  if (edge >= 3000) return 1.16;
  if (edge >= 2500 && dpr <= 1.15) return 1.1;
  return 1;
}

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.classList.toggle('studio-theme-dark', dark);
  document.documentElement.classList.toggle('theme-dark', dark);
  document.body?.classList.toggle('studio-theme-dark', dark);
  document.body?.classList.toggle('theme-dark', dark);
  window.dispatchEvent(new CustomEvent('studio-theme-change', { detail: { theme: dark ? 'dark' : 'light' } }));
}

function applyScale(mode) {
  const normalized = normalizeScaleMode(mode);
  const scale = document.documentElement.dataset.studioScale === 'off' ? 1 : scaleForMode(normalized);
  document.documentElement.style.setProperty('--studio-ui-scale', scale.toFixed(3));
  document.documentElement.classList.toggle('studio-ui-scaled', Math.abs(scale - 1) > 0.01);
  document.documentElement.classList.add('studio-scale-managed');
  if (document.body) {
    const framedHost = !!document.querySelector('.app-shell iframe, iframe.active') && window.self === window.top;
    const computed = window.getComputedStyle(document.body);
    const viewportLocked = computed.overflow === 'hidden' || computed.overflowY === 'hidden' || !!document.querySelector('.app-shell, .shell');
    document.body.classList.toggle('studio-scale-host', framedHost);
    document.body.classList.toggle('studio-scale-viewport', viewportLocked);
  }
  window.dispatchEvent(new CustomEvent('studio-ui-scale-change', { detail: { mode: normalized, scale } }));
}

export function initializePageTheme() {
  applyTheme(getTheme());
  applyScale(getScaleMode());
  window.addEventListener('storage', event => {
    if (THEME_KEYS.includes(event.key)) applyTheme(getTheme());
    if (event.key === SCALE_KEY) applyScale(getScaleMode());
  });
  window.addEventListener('message', event => {
    if (event.data?.type === 'studio-theme') applyTheme(event.data.theme);
    if (event.data?.type === 'studio-ui-scale') applyScale(event.data.mode);
  });
  window.addEventListener('resize', () => {
    if (getScaleMode() === 'auto') applyScale('auto');
  });
}
