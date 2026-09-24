import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyStoredTheme } from '../src/shared/theme-bootstrap.js';

describe('stored theme bootstrap', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('applies the stored legacy-compatible theme to the document root', () => {
    const toggle = vi.fn();
    vi.stubGlobal('document', { documentElement: { classList: { toggle } } });
    vi.stubGlobal('localStorage', { getItem: key => key === 'studio_theme' ? 'light' : null });

    applyStoredTheme();

    expect(toggle).toHaveBeenCalledWith('studio-theme-dark', false);
    expect(toggle).toHaveBeenCalledWith('theme-dark', false);
  });

  it('defaults to dark mode when storage is unavailable', () => {
    const toggle = vi.fn();
    vi.stubGlobal('document', { documentElement: { classList: { toggle } } });
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('storage unavailable'); } });

    applyStoredTheme();

    expect(toggle).toHaveBeenCalledWith('studio-theme-dark', true);
    expect(toggle).toHaveBeenCalledWith('theme-dark', true);
  });
});
